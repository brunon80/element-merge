import { memo, useLayoutEffect, useRef } from 'react';
import { PURE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { mergeOptionsFor } from '../game/fusion/fusionRules';
import type { MonsterLevel, SpeciesId } from '../game/types';
import type { UiUnit } from '../store/gameStore';
import { FUSION_MSG, useGameStore } from '../store/gameStore';
import { MergeThumb } from '../scene/MergeThumb';

/**
 * Prévia de fusões do arraste: o painel que persegue o ponteiro (mouse OU
 * toque) enquanto o jogador segura uma criatura SOBRE outra criatura aliada.
 *
 *  • linha 1 — o que acontece SE ELE SOLTAR AGORA: `arrastada + alvo =
 *    resultado`. O resultado é SEMPRE revelado nesta linha (miniatura e nome),
 *    mesmo espécie inédita: segurar a criatura em cima da parceira é o que
 *    compra a prévia — a árvore continua selada na enciclopédia.
 *  • resto — TODAS as outras fusões que a criatura arrastada pode fazer no
 *    nível dela (regra única via `mergeOptionsFor`/`checkFusion`); o par já
 *    mostrado na linha 1 não se repete aqui.
 *  • espécie ainda não descoberta (parceira ou resultado fora da linha 1)
 *    aparece como no bestiário: thumbnail em silhueta escura + nome "???".
 *
 * O painel NUNCA cobre os monstros do arraste: cada apoio (direita, esquerda,
 * acima, abaixo) fica a `RAIO` px do corpo do monstro na mão (embaixo do
 * ponteiro) E do corpo do monstro da célula mirada, e o apoio escolhido é o que
 * tapa menos os dois cabendo inteiro na janela. `pointer-events: none` também
 * garante que o botão de venda continue enxergando o chão pelo
 * `elementFromPoint` do BattleScene. As miniaturas 3D são desenhadas pelo
 * `MergeStage` (um único contexto WebGL; z 37) acima do DOM do painel (z 36),
 * abaixo dos overlays.
 */

/** corpo do monstro na tela + folga: o painel fica a pelo menos isso do
 *  ponteiro (e do centro do slot mirado) — é o raio de "não pode tapar" */
const RAIO = 62;
/** respiro mínimo do painel com a borda da janela */
const EDGE = 10;

interface Cell {
  species: SpeciesId;
  level: MonsterLevel;
  /** silhueta escura como o card selado do bestiário? */
  locked: boolean;
}

interface PreviewRow {
  a: Cell;
  b: Cell;
  /** resultado; null quando o par da linha atual NÃO funde (✕ + motivo) */
  c: Cell | null;
  reason?: string;
}

const cellLabel = (cell: Cell): string =>
  cell.locked ? '???' : getSpecies(cell.species).name;

/** Uma linha "A + B = C" com miniatura + nome + nível em cada letra. */
function Row({
  row,
  currentIndex,
  testid,
  highlight,
}: {
  row: PreviewRow;
  /** index base dos três Views drei desta linha no palco (único por linha) */
  currentIndex: number;
  testid: string;
  highlight: 'valid' | 'invalid' | null;
}) {
  const c = row.c;
  return (
    <div className={`mp-row${highlight ? ` mp-${highlight}` : ''}`} data-testid={testid}>
      <span className="mp-cell">
        <MergeThumb
          species={row.a.species}
          level={row.a.level}
          locked={row.a.locked}
          viewIndex={currentIndex}
        />
        <b>{cellLabel(row.a)}</b>
        <i>Nv.{row.a.level}</i>
      </span>
      <span className="mp-op">+</span>
      <span className="mp-cell">
        <MergeThumb
          species={row.b.species}
          level={row.b.level}
          locked={row.b.locked}
          viewIndex={currentIndex + 1}
        />
        <b>{cellLabel(row.b)}</b>
        <i>Nv.{row.b.level}</i>
      </span>
      <span className="mp-op">{c ? '=' : '✕'}</span>
      {c ? (
        <span className="mp-cell">
          <MergeThumb
            species={c.species}
            level={c.level}
            locked={c.locked}
            viewIndex={currentIndex + 2}
          />
          <b>{cellLabel(c)}</b>
          <i>Nv.{c.level}</i>
        </span>
      ) : (
        <span className="mp-cell">
          <span className="mt-box mp-no" aria-hidden>
            ✕
          </span>
          <b>?</b>
          <i>—</i>
        </span>
      )}
    </div>
  );
}

const RowMemo = memo(Row);

/** O painel em si (só monta quando visível: os hooks vivem enquanto ele vive). */
function MergePreviewPanelInner({
  dragged,
  occupant,
  fusion,
  invalidReason,
  dragScreen,
  dragTargetScreen,
  dragCarriedScreen,
  discovered,
}: {
  dragged: UiUnit;
  occupant: UiUnit;
  /** presente quando o par atual FUNDE (linha 1 com resultado revelado) */
  fusion: { species: SpeciesId; level: MonsterLevel } | null;
  /** motivo quando o par atual NÃO funde (linha 1 com ✕) */
  invalidReason: string | null;
  dragScreen: { x: number; y: number } | null;
  /** tela do corpo no slot mirada — o monstro dele também não pode ser tapado */
  dragTargetScreen: { x: number; y: number } | null;
  /** tela do corpo da criatura que está na mão (flutua acima do ponteiro) */
  dragCarriedScreen: { x: number; y: number } | null;
  discovered: SpeciesId[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** último apoio escolhido (direita/esquerda/acima/abaixo) — evita tremura */
  const apoioRef = useRef(0);

  // regra única de "descoberta" da enciclopédia: puros sempre; espécie da
  // árvore só depois da primeira fusão que a gerou
  const known = (id: SpeciesId): boolean =>
    PURE_SPECIES_IDS.includes(id) || discovered.includes(id);

  const a: Cell = { species: dragged.species, level: dragged.level, locked: false };
  const b: Cell = { species: occupant.species, level: occupant.level, locked: false };
  const current: PreviewRow = fusion
    ? {
        a,
        b,
        // a linha do "se eu soltar agora" NUNCA fica selada: a prévia do
        // resultado é a recompensa de estar com a criatura na mão
        c: { species: fusion.species, level: fusion.level, locked: false },
      }
    : { a, b, c: null, reason: invalidReason ?? 'Essa combinação não funde.' };

  const currentPartner = fusion ? occupant.species : null;
  const others = mergeOptionsFor(dragged.species, dragged.level)
    .filter((o) => o.partner !== currentPartner)
    .map<PreviewRow>((o) => ({
      // a criatura na mão é sempre visível; só a PARCEIRA e o RESULTADO
      // inéditos entram selados na lista
      a,
      b: { species: o.partner, level: o.level, locked: !known(o.partner) },
      c: { species: o.result, level: o.resultLevel, locked: !known(o.result) },
    }));

  // ---------- persegue o ponteiro sem cobrir NENHUM dos dois monstros --------
  // roda a cada render (as coords vêm do store a cada pointermove): o painel lê
  // o próprio tamanho e escolhe entre quatro apoios (direita, esquerda, acima,
  // abaixo) o que ao mesmo tempo cabe na janela e tapa menos os corpos na tela:
  // o monstro na mão (embaixo do ponteiro) e o monstro da célula mirada.
  // layout effect: posiciona ANTES de pintar, sem tremida.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    if (!pw || !ph) return; // jsdom/testes: sem caixa medida, sem placement
    const W = window.innerWidth;
    const H = window.innerHeight;
    const px = dragScreen?.x ?? W / 2;
    const py = dragScreen?.y ?? H / 2;
    // os corpos que o painel tem o dever de não cobrir: o dedo em si, o monstro
    // da célula mirada e o corpo (flutuante) da criatura que está na mão
    const alvos = [
      { x: px, y: py },
      ...(dragTargetScreen ? [dragTargetScreen] : []),
      ...(dragCarriedScreen ? [dragCarriedScreen] : []),
    ];
    const apoios = [
      { left: px + RAIO, top: py - ph / 2 }, // direita
      { left: px - RAIO - pw, top: py - ph / 2 }, // esquerda
      { left: px - pw / 2, top: py - RAIO - ph }, // acima
      { left: px - pw / 2, top: py + RAIO }, // abaixo
    ];
    // trocar de lado no meio do gesto tremula a tela; preferimos o apoio de antes
    const antes = apoioRef.current;
    let melhor = 0;
    let pior = Number.POSITIVE_INFINITY;
    apoios.forEach((c, i) => {
      // (a) ficar fora da janela custa bem caro — o painel tem que caber inteiro
      const fora =
        Math.max(0, EDGE - c.left) +
        Math.max(0, c.left + pw - (W - EDGE)) +
        Math.max(0, EDGE - c.top) +
        Math.max(0, c.top + ph - (H - EDGE));
      // (b) tapar monstro: medimos o deslize (px) necessário para liberar cada
      // corpo; o pior corpo manda
      let tapa = 0;
      for (const alvo of alvos) {
        const ix = Math.max(0, Math.min(c.left + pw, alvo.x + RAIO) - Math.max(c.left, alvo.x - RAIO));
        const iy = Math.max(0, Math.min(c.top + ph, alvo.y + RAIO) - Math.max(c.top, alvo.y - RAIO));
        if (ix > 0 && iy > 0) tapa = Math.max(tapa, Math.min(ix, iy));
      }
      const custo = fora * 40 + tapa * 6 + (i === antes ? 0 : 18);
      if (custo < pior) {
        pior = custo;
        melhor = i;
      }
    });
    apoioRef.current = melhor;
    const escolhida = apoios[melhor];
    const clamp = (v: number, max: number): number => Math.max(EDGE, Math.min(v, max));
    const x = clamp(escolhida.left, W - pw - EDGE);
    const y = clamp(escolhida.top, H - ph - EDGE);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  });

  return (
    <div ref={panelRef} className="merge-preview panel" data-testid="merge-preview" aria-hidden>
      <RowMemo
        row={current}
        currentIndex={100}
        testid="mp-current"
        highlight={fusion ? 'valid' : 'invalid'}
      />
      {current.reason && <p className="mp-reason">{current.reason}</p>}
      {others.length > 0 && (
        <>
          <div className="mp-title" data-testid="mp-title">
            Outras fusões possíveis
          </div>
          {others.map((o, i) => (
            <RowMemo
              key={`${o.b.species}@${o.b.level}=${o.c!.species}`}
              row={o}
              currentIndex={110 + i * 3} // cada linha tem 3 Views; index único no palco
              testid={`mp-option-${o.b.species}`}
              highlight={null}
            />
          ))}
        </>
      )}
      {others.length === 0 && current.c === null && (
        <p className="mp-hint">Esta criatura não funde com mais nada neste nível.</p>
      )}
    </div>
  );
}

export function MergePreviewPanel() {
  const dragId = useGameStore((s) => s.dragId);
  const dragHover = useGameStore((s) => s.dragHover);
  const dragScreen = useGameStore((s) => s.dragScreen);
  const dragTargetScreen = useGameStore((s) => s.dragTargetScreen);
  const dragCarriedScreen = useGameStore((s) => s.dragCarriedScreen);
  const sellHover = useGameStore((s) => s.sellHover);
  const units = useGameStore((s) => s.units);
  const discovered = useGameStore((s) => s.discovered);

  const dragged = dragId !== null ? units.find((u) => u.id === dragId) : undefined;
  // só abre EM CIMA de outra criatura aliada: destino "merge" ou "invalid"
  // com alvo (buraco vazio = mover, e mover não tem o que fundir na prévia)
  const occupant =
    dragHover && dragHover.targetId !== undefined
      ? units.find((u) => u.id === dragHover.targetId)
      : undefined;
  // sobre o botão de venda o painel desaparece junto com os destaques da arena
  if (!dragged || !occupant || sellHover) return null;

  const valid = dragHover?.kind === 'merge' && dragHover.fusion;
  return (
    <MergePreviewPanelInner
      dragged={dragged}
      occupant={occupant}
      fusion={valid ? { species: dragHover!.fusion!.species, level: dragHover!.fusion!.level } : null}
      invalidReason={
        !valid && dragHover?.reason
          ? FUSION_MSG[dragHover.reason] ?? dragHover.reason
          : !valid
            ? 'Essa combinação não funde.'
            : null
      }
      dragScreen={dragScreen}
      dragTargetScreen={dragTargetScreen}
      dragCarriedScreen={dragCarriedScreen}
      discovered={discovered}
    />
  );
}
