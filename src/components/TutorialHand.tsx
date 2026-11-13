import { useEffect, useLayoutEffect, useRef } from 'react';
import { tileGroundPosition } from '../game/board';
import type { Side, TileIndex } from '../game/types';
import { TILES_PER_SIDE } from '../game/types';
import {
  tutorialStepIndex,
  TUTORIAL_FAB_ALVO_ID,
  TUTORIAL_SRC_TILE,
  TUTORIAL_STEPS,
  TUTORIAL_STEP_DEF,
  type TutorialStepId,
  type TutorialTarget,
} from '../game/tutorial';
import { worldToScreen } from '../scene/worldToScreen';
import { useGameStore } from '../store/gameStore';
import { GloveIcon, SellIcon } from './icons';

/**
 * 🎓 A LUVINHA DO TUTORIAL — a mão de luva que ensina os cinco primeiros gestos.
 *
 * Tudo aqui é DOM (nunca um objeto na cena 3D) e tudo aqui é MÍMICA: a luva
 * aponta, pulsa e percorre o trajeto do gesto, mas JAMAIS chama uma ação do
 * store. Em nenhum passo o tutorial joga pelo jogador — o gesto de verdade é
 * sempre de quem está com o dedo na tela, e é ele que fecha o passo.
 *
 *  • a FAIXA com a frase do passo, os 5 pontinhos e o botão de pular. Ela se
 *    reposiciona sozinha para NUNCA tapar um dos 24 buracos do tabuleiro (a
 *    mesma regra do enquadre: o chão projetado de cada buraco tem que seguir
 *    livre para o ponteiro);
 *  • a LUVA, que persegue o alvo do passo. Nos passos 1/2/3 ela aponta e pulsa;
 *    nos passos 4 e 5 ela percorre em loop o trajeto `de → até` da mímica;
 *  • as MARCAS do destino: o aro pontilhado sobre o buraco onde a criatura deve
 *    ser solta (passo 4) e o fantasma do botão dourado mostrando onde o FAB de
 *    venda vai aparecer (passo 5 — o botão real só existe durante o arraste).
 *
 * Nenhuma dessas peças recebe ponteiro (`pointer-events: none`), então nenhuma
 * delas engole o toque do tabuleiro — nem a `elementFromPoint` do arraste.
 */

const HAND_PX = 56;
/** ponta do indicador dentro do viewBox (52) do GloveIcon — é ela que encosta no alvo */
const TIP_U = 7 / 52;

/** a mímica do arraste: quanto tempo cada trecho do loop dura (ms) */
const MIME = {
  /** mão parada sobre a criatura que vai ser pega */
  pegar: 750,
  /** trajeto até o destino */
  carregar: 950,
  /** mão já em cima do destino ("solte aqui") */
  soltar: 850,
  /** mão volta (invisível) para a origem e recomeça */
  voltar: 750,
} as const;
const CICLO = MIME.pegar + MIME.carregar + MIME.soltar + MIME.voltar;

type Ponto = { x: number; y: number };

/** onde o alvo do passo está NA TELA agora (DOM ou buraco projetado) */
function resolvable(t: TutorialTarget): Ponto | null {
  if (t.kind === 'dom') {
    const el = document.querySelector(t.selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return worldToScreen(t.x, t.y, t.z);
}

/** os 24 buracos projetados — o que a faixa tem o dever de não cobrir */
function buracosNaTela(): Ponto[] {
  const out: Ponto[] = [];
  for (const side of ['player', 'ai'] as Side[]) {
    for (let tile = 0; tile < TILES_PER_SIDE; tile++) {
      const [x, y, z] = tileGroundPosition(side, tile);
      const p = worldToScreen(x, y, z);
      if (p) out.push(p);
    }
  }
  return out;
}

const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const misto = (a: Ponto, b: Ponto, e: number): Ponto => ({
  x: a.x + (b.x - a.x) * e,
  y: a.y + (b.y - a.y) * e,
});

// ────────────────────────────────────────────────────────────────────────────
// FAIXA DO PASSO
// ────────────────────────────────────────────────────────────────────────────

/**
 * Coloca a faixa no lugar da tela onde ela não tapa buraco nenhum: mede a
 * própria caixa, testa alguns apoios (abaixo do HUD, acima do dock, cantos) e
 * escolhe o que fica inteiro na janela e tapa menos chão de slot. O raio de
 * "não pode tapar" é derivado do espaçamento real dos buracos na tela, então a
 * regra vale em qualquer zoom/janela. O botão de venda (e o fantasma do passo 5)
 * entra como obstáculo sólido: a faixa também não cobre o alvo do passo.
 */
function posicionarFaixa(el: HTMLDivElement | null): void {
  if (!el) return;
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;
  if (!pw || !ph) return; // jsdom/testes: sem caixa medida, sem placement
  const W = window.innerWidth;
  const H = window.innerHeight;
  const EDGE = 10;
  const holes = buracosNaTela();
  // raio de exclusão: 42% da distância entre buracos vizinhos (chão do slot)
  let passo = 90;
  if (holes.length >= 2) {
    let menor = Infinity;
    for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        const d = Math.hypot(holes[i].x - holes[j].x, holes[i].y - holes[j].y);
        if (d < menor) menor = d;
      }
    }
    if (Number.isFinite(menor)) passo = menor;
  }
  const raio = Math.min(64, Math.max(26, passo * 0.42));

  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  const dock = document.querySelector('.dock')?.getBoundingClientRect();
  const topo = hud ? hud.bottom + 8 : EDGE;
  const acimaDock = (dock?.top ?? H) - ph - 10;
  const apoios: Ponto[] = [
    { x: (W - pw) / 2, y: acimaDock }, // 1) faixa logo acima da loja
    { x: (W - pw) / 2, y: topo }, // 2) logo abaixo do HUD
    { x: EDGE, y: acimaDock }, // 3) encostada à esquerda, em cima da loja
    { x: W - pw - EDGE, y: acimaDock }, // 4) encostada à direita
    { x: EDGE, y: topo }, // 5) topo-esquerda (deixa o canto direito livre)
    { x: W - pw - EDGE, y: topo }, // 6) topo-direita (deixa o canto esquerdo livre)
    { x: (W - pw) / 2, y: H - ph - EDGE }, // 7) por baixo de tudo (último recurso)
  ];
  // 🎓 o botão de venda (real ou o fantasma do passo 5) também é obstáculo: a
  // faixa não pode sentar em cima do alvo que o passo está ensinando a alcançar
  // — no celular apertado isso escondia o FAB dourado exatamente na hora da venda.
  const solidos = ['.sell-fab'].flatMap((sel) =>
    [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
  let melhor = 0;
  let pior = Infinity;
  apoios.forEach((a, i) => {
    const fora =
      Math.max(0, EDGE - a.x) +
      Math.max(0, a.x + pw - (W - EDGE)) +
      Math.max(0, EDGE - a.y) +
      Math.max(0, a.y + ph - (H - EDGE));
    let tapa = 0;
    for (const h of holes) {
      const ix = Math.max(0, Math.min(a.x + pw, h.x + raio) - Math.max(a.x, h.x - raio));
      const iy = Math.max(0, Math.min(a.y + ph, h.y + raio) - Math.max(a.y, h.y - raio));
      if (ix > 0 && iy > 0) tapa += Math.min(ix, iy);
    }
    let pisa = 0;
    for (const s of solidos) {
      const ix = Math.max(0, Math.min(a.x + pw, s.x + s.w) - Math.max(a.x, s.x));
      const iy = Math.max(0, Math.min(a.y + ph, s.y + s.h) - Math.max(a.y, s.y));
      if (ix > 0 && iy > 0) pisa += Math.min(ix, iy);
    }
    const custo = fora * 60 + tapa * 10 + pisa * 18 + i * 1.5;
    if (custo < pior) {
      pior = custo;
      melhor = i;
    }
  });
  const a = apoios[melhor];
  el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px)`;
}

function TutorialFaixa({ step }: { step: TutorialStepId }) {
  const ref = useRef<HTMLDivElement>(null);
  const skipTutorial = useGameStore((s) => s.skipTutorial);
  const def = TUTORIAL_STEP_DEF[step];
  const n = tutorialStepIndex(step) + 1;

  // layout effect: posiciona antes de pintar (sem tremida) e sempre que a
  // frase/passo muda — o tamanho da caixa muda com o texto
  useLayoutEffect(() => {
    posicionarFaixa(ref.current);
  });
  useEffect(() => {
    const on = () => posicionarFaixa(ref.current);
    window.addEventListener('resize', on);
    const t = window.setInterval(on, 700); // zoom de pinça, rotação, dock flexível
    return () => {
      window.removeEventListener('resize', on);
      window.clearInterval(t);
    };
  }, [step]);

  return (
    <div
      ref={ref}
      className="tutorial-faixa panel"
      data-testid="tutorial-faixa"
      data-step={step}
    >
      <div className="tutorial-linha">
        <span className="tutorial-luva" aria-hidden>
          <GloveIcon size={18} />
        </span>
        <b className="tutorial-frase" data-testid="tutorial-caption">
          {def.caption}
        </b>
      </div>
      <div className="tutorial-rodape">
        <span className="tutorial-passos" data-testid="tutorial-passos" aria-hidden>
          {TUTORIAL_STEPS.map((id, i) => (
            <i key={id} data-active={i < n ? 'true' : 'false'}>
              {i + 1}
            </i>
          ))}
        </span>
        <button className="btn ghost small" data-testid="tutorial-skip" onClick={skipTutorial}>
          Pular tutorial
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// QUEM É QUEM NO TABULEIRO (a mímica aponta para criaturas vivas)
// ────────────────────────────────────────────────────────────────────────────

function unidadesVivas() {
  return useGameStore.getState().units.filter((u) => u.side === 'player' && !u.dying);
}

function unidadeEmSlot(tile: TileIndex) {
  return unidadesVivas().find((u) => u.tile === tile);
}

/** a criatura mais forte viva (no passo 5 é ela que vai para a venda) */
function unidadeMaisForte() {
  let melhor = unidadesVivas()[0];
  for (const u of unidadesVivas()) if (!melhor || u.level > melhor.level) melhor = u;
  return melhor;
}

/** centro do corpo de uma unidade, em coordenadas de mundo */
function corpo(u: { tile: number } | undefined): TutorialTarget | null {
  if (!u) return null;
  const [x, y, z] = tileGroundPosition('player', u.tile);
  return { kind: 'mundo', x, y: y + 1.1, z };
}

/**
 * Onde a mão deve apontar/pegar AGORA. Os alvos do tabuleiro não vêm do
 * `TUTORIAL_STEP_DEF` crus: a luva segue a criatura de verdade, então se o
 * jogador rodou a câmera ou o buraco mudou, a mão continua em cima dela.
 */
function alvoAgora(step: TutorialStepId, papel: 'de' | 'ate'): TutorialTarget | null {
  const def = TUTORIAL_STEP_DEF[step];
  if (step === 'inpecionar') return corpo(unidadeEmSlot(0)) ?? corpo(unidadesVivas()[0]);
  if (!def.mime) return def.target;
  if (step === 'arrastar') {
    // pega a segunda criatura e mostra o destino em cima da primeira (se o
    // jogador já mexeu nelas, a mímica simplesmente não tem para onde ir)
    const pares = unidadesVivas();
    const de = papel === 'de' ? corpo(unidadeEmSlot(TUTORIAL_SRC_TILE)) ?? corpo(pares[1]) : null;
    const ate = papel === 'ate' ? corpo(unidadeEmSlot(0)) ?? corpo(pares[0]) : null;
    return de ?? ate;
  }
  if (step === 'vender') {
    return papel === 'de' ? corpo(unidadeMaisForte()) : def.mime.ate;
  }
  return def.target;
}

// ────────────────────────────────────────────────────────────────────────────
// A LUVA (e o aro do destino) — só transform, nunca store
// ────────────────────────────────────────────────────────────────────────────

function TutorialLuva({ step }: { step: TutorialStepId }) {
  const maoRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const def = TUTORIAL_STEP_DEF[step];
  // o aro pontilhado no buraco de destino só existe quando o destino É um
  // buraco (passo 4). No passo 5 o destino já é o fantasma do botão dourado.
  const temAro = def.mime !== undefined && def.mime.ate.kind === 'mundo';

  useEffect(() => {
    const mao = maoRef.current;
    if (!mao) return;
    const drop = dropRef.current;
    // "pouca movimentação" do sistema: sem loop — a mão fica parada em cima do
    // destino do gesto (o aro e o fantasma já ensinam o resto)
    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // ⏱ o relógio da animação é o TEMPO DA PRÓPRIA FRAM (o carimbo que o
    // rAF entrega), nunca `performance.now()`: são origens diferentes em alguns
    // ambientes (jsdom marca a frame a partir da navegação, Node a partir do
    // processo), e misturar os dois faria a mímica nunca começar
    let t0 = -1;
    let antes = -1;
    let segue: Ponto | null = null; // suaviza a mão nos passos que só apontam
    let raf = requestAnimationFrame(function loop(agora: number) {
      if (t0 < 0) t0 = agora;
      if (antes < 0) antes = agora;
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      const de = resolvable(alvoAgora(step, 'de') ?? def.target);
      const ate = resolvable(alvoAgora(step, 'ate') ?? def.target);

      let p: Ponto | null = null;
      let fase = 'apontar';
      let alpha = 1;
      if (def.mime) {
        const tRel = agora - t0 - def.delayMs;
        if (de && ate && semMovimento) {
          p = ate;
          fase = 'soltar';
        } else if (de && ate && tRel >= 0) {
          const tp = tRel % CICLO;
          if (tp < MIME.pegar) {
            p = de;
            fase = 'pegar';
          } else if (tp < MIME.pegar + MIME.carregar) {
            p = misto(de, ate, easeInOut((tp - MIME.pegar) / MIME.carregar));
            fase = 'carregar';
          } else if (tp < MIME.pegar + MIME.carregar + MIME.soltar) {
            p = ate;
            fase = 'soltar';
          } else {
            const q = (tp - MIME.pegar - MIME.carregar - MIME.soltar) / MIME.voltar;
            p = misto(ate, de, easeInOut(q));
            fase = 'voltar';
            // a mão "sai de cena" no ar e reaparece em cima da origem
            alpha = q < 0.35 ? 0 : q < 0.55 ? (q - 0.35) / 0.2 : 1;
          }
        } else {
          p = de; // ainda esperando os bichos nascerem: fica onde vai pegar
          fase = 'espera';
        }
      } else if (de) {
        // passo que só aponta: a mão desliza até o alvo e pulsa (o CSS cuida
        // da pulsação); o lerp com dt mantém o movimento igual a 60 ou 120 Hz
        if (!segue) segue = de;
        else segue = misto(segue, de, 1 - Math.exp(-dt * 7));
        p = segue;
      }

      if (p) {
        const off = HAND_PX * TIP_U;
        mao.style.transform = `translate3d(${Math.round(p.x - off)}px, ${Math.round(p.y - off)}px, 0)`;
        mao.style.opacity = String(alpha);
      }
      mao.dataset.fase = fase;
      if (drop && temAro && ate) {
        // o aro fica CENTRADO no corpo: é ali que o dedo tem que soltar
        drop.style.transform = `translate3d(${Math.round(ate.x)}px, ${Math.round(ate.y)}px, 0)`;
      }
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [step, def.mime, def.target, def.delayMs, temAro]);

  return (
    <>
      {temAro && (
        <div
          ref={dropRef}
          className="tutorial-aro"
          data-testid="tutorial-aro"
          data-active={def.mime ? 'true' : 'false'}
          aria-hidden
        />
      )}
      <div
        ref={maoRef}
        className="tutorial-luva-mao"
        data-testid="tutorial-luva"
        data-action={def.action}
        data-fase="apontar"
        aria-hidden
      >
        <GloveIcon size={HAND_PX} />
      </div>
    </>
  );
}

/**
 * Fantasma do botão de venda: mesmo lugar, mesmo tamanho e mesmas regras de
 * janela do `SellFab` (a classe `.sell-fab` é reaproveitada), só que pontilhado,
 * apagado e surdo para o ponteiro. Ensina ONDE o botão dourado vai aparecer
 * quando o jogador pegar a criatura — sem ele a mímica do passo 5 apontaria
 * para o vazio, porque o FAB real só nasce durante o arraste.
 */
function TutorialFabFantasma() {
  return (
    <div
      className="sell-fab tutorial-fab-alvo"
      data-testid={TUTORIAL_FAB_ALVO_ID}
      data-tutorial-fantasma=""
      aria-hidden
    >
      <SellIcon size={28} />
      <span className="sell-fab-count">aqui</span>
    </div>
  );
}

/** monta a luvinha enquanto o tutorial estiver rodando (null fora dele) */
export function TutorialHand() {
  const step = useGameStore((s) => s.tutorialStep);
  if (!step) return null;
  return (
    <>
      <TutorialFaixa step={step} />
      {/* key por passo: cada passo recomeça a mímica do zero */}
      <TutorialLuva key={step} step={step} />
      {/* o fantasma precisa existir no DOM antes de a mão medir o destino */}
      {step === 'vender' && <TutorialFabFantasma />}
    </>
  );
}
