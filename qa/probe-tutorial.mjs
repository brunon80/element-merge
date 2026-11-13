// Sonda do TUTORIAL DA LUVINHA — os 5 passos da mão de luva. jsdom não tem CSS
// nem WebGL, então isto roda no browser real e confere o que só o browser mostra:
//
//   A) primeira vez: "Jogar" abre a luvinha com a ARENA VAZIA e o passo 1;
//      o card ensinado fica dourado e o resto da loja está "fora do passo";
//      cada passo só libera a jogada dele (toque, compra, arraste, venda) e as
//      outras vêm com o recado certo;
//   B) A LUVA NÃO JOGA SOZINHA: nos passos 4 e 5 ela percorre o gesto em MÍMICA
//      (fases pegar/carregar/soltar), mas nenhuma criatura é arrastada, fundida
//      ou venda — nada de sell-fab, nada de drag armado, tabuleiro intacto. É a
//      regressão que o usuário apontou;
//   C) quem joga é o jogador: o arraste real funde (passo 4) e a venda real
//      fecha o passo 5, com o cofre intocado o tutorial inteiro;
//   D) enquadre: com a faixa da luvinha na tela, os 24 buracos continuam
//      resolvendo para o CANVAS (24/24) — faixa, aro e fantasma não engolem
//      ponteiro;
//   E) quem já tem jogo salvo É PERGUNTADO; o tutorial começa vazio, gasta
//      moeda VIRTUAL (o save não muda) e "Pular" devolve o time no MESMO buraco;
//   F) "Repetir tutorial" nas configurações reinicia os 5 passos e devolve o
//      time no fim; depois de assistido o tutorial não volta sozinho;
//   G) no retrato (390x844) o fantasma do botão dourado coincide com o botão
//      real (mesma regra de janela do .sell-fab) e os 24 buracos seguem livres;
//   H) console sem erro/aviso.
//
// Uso: QA_OUT=/tmp/… QA_URL=http://localhost:5173/element-merge/ node qa/probe-tutorial.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.QA_OUT ?? '/tmp/opencode/tutorial';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';
const SAVE_KEY = 'elemental-merge-save-v1';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1373, height: 749 }, // 13" laptop comum
  deviceScaleFactor: 1.5, // ler o glifo no print custa metade do pixel de CPU
});
const msgs = [];
page.on('console', (m) =>
  ['error', 'warning'].includes(m.type()) && msgs.push(`${m.type()}: ${m.text()}`),
);
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
  // o toast some em ~2,8s: coletamos o texto no nascimento, via MutationObserver
  window.__toasts = [];
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      for (const t of document.querySelectorAll('[data-testid="toast"]')) {
        const txt = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!txt || t.dataset.qaToast === txt) continue;
        t.dataset.qaToast = txt;
        window.__toasts.push(txt);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
});

const toasts = () => page.evaluate(() => window.__toasts ?? []);
const ultimoToast = async () => (await toasts()).at(-1) ?? '';

/** marco de progresso em stderr (stdout vai para arquivo e sai em blocos) */
const t0 = Date.now();
const mark = (what) => process.stderr.write(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}\n`);
let lastMark = 'início';
let watchdog = null;
const armWatchdog = (what) => {
  lastMark = what;
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    console.log(`\nveredito: TRAVOU depois de "${lastMark}"`);
    process.exit(2);
  }, 240_000);
};

let checks = 0;
let failures = 0;
const check = (ok, label, extra = '') => {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ERR '}${label}${extra ? ` — ${extra}` : ''}`);
};

/** print por RECORTE (screenshot de ELEMENTO trava com o 3D animando) */
const shotBox = async (locator, file, pad = 0) => {
  const b = await locator.boundingBox();
  if (!b) return false;
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const x = Math.max(0, Math.min(b.x - pad, vp.w - 1));
  const y = Math.max(0, Math.min(b.y - pad, vp.h - 1));
  const width = Math.max(1, Math.min(b.width + pad * 2, vp.w - x));
  const height = Math.max(1, Math.min(b.height + pad * 2, vp.h - y));
  if (width < 4 || height < 4) return false;
  await page.screenshot({ timeout: 60000, path: `${OUT}/${file}`, clip: { x, y, width, height } });
  return true;
};
const shotFull = (file) => page.screenshot({ timeout: 60000, path: `${OUT}/${file}` });

// ───────────────────────── leitura do estado pela janela ─────────────────────

const passoAtual = () =>
  page.evaluate(() => document.querySelector('[data-testid="tutorial-faixa"]')?.dataset.step ?? null);

const coinsNaTela = () =>
  page.evaluate(() => document.querySelector('[data-testid="coins"]')?.textContent?.trim() ?? '');

const moedasNoCofre = () =>
  page.evaluate(
    (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? 'null')?.coins ?? null;
      } catch {
        return null;
      }
    },
    SAVE_KEY,
  );

/** a luva: fase da mímica + onde a PONTA do indicador encosta (13,5% do desenho) */
const luva = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="tutorial-luva"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      fase: el.dataset.fase ?? '',
      tipX: r.left + r.width * 0.135,
      tipY: r.top + r.height * 0.135,
      op: getComputedStyle(el).opacity,
      w: Math.round(r.width),
    };
  });

/** aro do destino + fantasma do botão dourado + faixa (caixas medidas) */
const marcas = () =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        w: Math.round(r.width),
        pe: cs.pointerEvents,
        hit: (() => {
          const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return h ? `${h.tagName}`.slice(0, 20) : 'nada';
        })(),
      };
    };
    return {
      aro: box('[data-testid="tutorial-aro"]'),
      fabFantasma: box('[data-testid="tutorial-fab-alvo"]'),
      faixa: box('[data-testid="tutorial-faixa"]'),
      fabReal: box('[data-testid="sell-fab"]'),
    };
  });

/** unidades da cena (mundo + projeção). z>0 = lado do jogador */
const readUnits = () =>
  page.evaluate(() => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    scene.updateMatrixWorld(true);
    let cam = null;
    scene.traverse((o) => {
      if (!cam && o.__r3f && o.__r3f.root) cam = o.__r3f.root.getState().camera;
    });
    cam.updateMatrixWorld(true);
    const me = cam.matrixWorldInverse.elements;
    const pe = cam.projectionMatrix.elements;
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const proj = (x, y, z) => {
      const cx = me[0] * x + me[4] * y + me[8] * z + me[12];
      const cy = me[1] * x + me[5] * y + me[9] * z + me[13];
      const cz = me[2] * x + me[6] * y + me[10] * z + me[14];
      const cw = pe[3] * cx + pe[7] * cy + pe[11] * cz + pe[15];
      return [
        r.left + ((pe[0] * cx + pe[4] * cy + pe[8] * cz + pe[12]) / cw + 1) / 2 * r.width,
        r.top + (1 - (pe[1] * cx + pe[5] * cy + pe[9] * cz + pe[13]) / cw) / 2 * r.height,
      ];
    };
    const out = [];
    scene.traverse((o) => {
      if (!o.userData || o.userData.unitId === undefined) return;
      const p = o.getWorldPosition(o.position.clone());
      const [sx, sy] = proj(p.x, p.y + 0.6, p.z);
      out.push({
        unitId: o.userData.unitId,
        species: o.userData.species,
        level: o.userData.level,
        player: p.z > 0,
        wx: Math.round(p.x * 100) / 100,
        wz: Math.round(p.z * 100) / 100,
        sx: Math.round(sx),
        sy: Math.round(sy),
      });
    });
    return out;
  });

const meusUnits = async () => (await readUnits()).filter((u) => u.player);

/**
 * A cena 3D devolve a criatura ao buraco dela com animação depois de um drop
 * recusado. Ler a tela nesse instante engana: o print da unidade está no meio
 * do caminho e o `mouse.down` cai no VÉU (aí o gesto vira órbita de câmera e a
 * sonda culpa o tutorial). Então: só lê posição quando a cena parar de mexer.
 */
const cenaQuieta = async (limite = 30) => {
  let anterior = null;
  for (let i = 0; i < limite; i++) {
    const atual = (await readUnits())
      .map((u) => `${u.unitId}:${u.wx},${u.wz}`)
      .sort()
      .join('|');
    if (anterior !== null && atual === anterior) return true;
    anterior = atual;
    await page.waitForTimeout(120);
  }
  return false;
};

/**
 * Os 24 buracos projetados: o chão de cada um tem que continuar resolvendo para
 * o CANVAS (a regra do enquadre). A luva, o aro e o fantasma são
 * pointer-events:none; a faixa é a única peça que come ponteiro e ela mesma se
 * reposiciona para não cobrir buraco.
 */
const holes = () =>
  page.evaluate(() => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    let cam = null;
    scene.traverse((o) => {
      if (!cam && o.__r3f && o.__r3f.root) cam = o.__r3f.root.getState().camera;
    });
    cam.updateMatrixWorld(true);
    const me = cam.matrixWorldInverse.elements;
    const pe = cam.projectionMatrix.elements;
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    const out = [];
    for (const side of [1, -1])
      for (let row = 0; row < 3; row++)
        for (const colX of [-7.8, -2.6, 2.6, 7.8]) {
          const p = [colX, 0.28, side * (3.1 + 5.2 * row)];
          const cx = me[0] * p[0] + me[4] * p[1] + me[8] * p[2] + me[12];
          const cy = me[1] * p[0] + me[5] * p[1] + me[9] * p[2] + me[13];
          const cz = me[2] * p[0] + me[6] * p[1] + me[10] * p[2] + me[14];
          const cw = pe[3] * cx + pe[7] * cy + pe[11] * cz + pe[15];
          const ndx = (pe[0] * cx + pe[4] * cy + pe[8] * cz + pe[12]) / cw;
          const ndy = (pe[1] * cx + pe[5] * cy + pe[9] * cz + pe[13]) / cw;
          const px = r.left + ((ndx + 1) / 2) * r.width;
          const py = r.top + ((1 - ndy) / 2) * r.height;
          const hit = document.elementFromPoint(px, py);
          const offscreen = ndx < -1 || ndx > 1 || ndy < -1 || ndy > 1 || cw <= 0;
          out.push({
            ok: !offscreen && !!hit && hit.tagName === 'CANVAS',
            onde: `x${colX} z${p[2] > 0 ? '+' : '-'}${row}`,
            naFrente: offscreen ? 'FORA DO ENQUADRE' : hit ? `${hit.tagName}.${hit.className}`.slice(0, 46) : 'nada',
            px: Math.round(px),
            py: Math.round(py),
          });
        }
    return out;
  });

/** a faixa do tutorial nunca pode sentar em cima do botão de venda (nem do fantasma) */
const checarFaixaForaDoFab = async (rotulo) => {
  armWatchdog(`faixa fora do FAB ${rotulo}`);
  const m = await marcas();
  const alvo = m.fabFantasma ?? m.fabReal;
  const x = m.faixa;
  if (!alvo || !x) {
    check(false, `${rotulo}: dá para medir faixa e botão`, `faixa=${!!x} botao=${!!alvo}`);
    return;
  }
  const cobre = x.left < alvo.right && x.right > alvo.left && x.top < alvo.bottom && x.bottom > alvo.top;
  check(
    !cobre,
    `${rotulo}: a faixa não cobre o botão de venda`,
    cobre
      ? `faixa ${x.left}..${x.right}×${x.top}..${x.bottom} ⨯ botão ${alvo.left}..${alvo.right}×${alvo.top}..${alvo.bottom}`
      : '',
  );
};

const checarEnquadre = async (rotulo) => {
  armWatchdog(`enquadre ${rotulo}`);
  const hs = await holes();
  const ruins = hs.filter((h) => !h.ok);
  check(ruins.length === 0, `enquadre ${rotulo}: 24 buracos livres`, ruins.map((h) => `${h.onde}→${h.naFrente}`).join(' | '));
};

/** o que está na frente de um ponto da tela (CANVAS = o ponteiro chega no jogo) */
const frenteEm = (x, y) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el ? `${el.tagName}.${el.className}`.slice(0, 60) : 'nada';
    },
    [x, y],
  );

/** a loja: que está dourado, que está travado e o que diz o card travado */
const loja = () =>
  page.evaluate(() => {
    const ids = ['ignis', 'nereia', 'golem', 'zephyr'];
    const out = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="shop-${id}"]`);
      if (!el) continue;
      out[id] = {
        doPasso: el.getAttribute('data-tutorial-do-passo'),
        disabled: el.disabled,
        texto: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    }
    return out;
  });

/**
 * Arrasta de A até B em pixels de janela. Devolve true quando o arraste REALMENTE
 * pegou a criatura — o FAB dourado nasce com o `dragId` vivo, então ele é o
 * termômetro: sem ele o gesto foi órbita de câmera, não arraste, e a sonda teria
 * que culpar a si mesma (não ao jogo).
 */
const arrastar = async (de, para, passos = 18) => {
  await page.mouse.move(de[0], de[1]);
  await page.mouse.down();
  await page.mouse.move(de[0] + 14, de[1] - 8); // passa do limiar e promove o arraste
  await page.waitForTimeout(140);
  const armado = await page.evaluate(() => document.querySelectorAll('[data-testid="sell-fab"]').length > 0);
  const dx = para[0] - (de[0] + 14);
  const dy = para[1] - (de[1] - 8);
  for (let i = 1; i <= passos; i++) {
    await page.mouse.move(de[0] + 14 + (dx * i) / passos, de[1] - 8 + (dy * i) / passos);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(450);
  return armado;
};

/**
 * Assiste à MÍMICA com um rAF dentro DA PRÓPRIA aba, gravando a caixa da mão a
 * cada frame. Medir do Node (`page.evaluate` a cada 80 ms) é o que fazia a sonda
 * culpar o jogo: com a máquina carregada uma frame pode durar MAIS que a janela
 * de uma fase (o `solte` dura 850 ms) e a amostragem pula a fase inteira — aí a
 * checagem 'a luva percorreu o trajeto' falha sem o jogo ter errado nada.
 * Devolve o conjunto de fases vistas + a ÚLTIMA amostra de cada fase (no `solte`
 * é o frame em que o dedo já está no destino, que é a foto que interessa).
 */
const assistirMimica = async (limiteMs = 14000) => {
  await page.evaluate((ms) => {
    window.__luvaFrames = [];
    const fim = performance.now() + ms;
    const passo = () => {
      const el = document.querySelector('[data-testid="tutorial-luva"]');
      if (el) {
        const r = el.getBoundingClientRect();
        window.__luvaFrames.push({
          fase: el.dataset.fase ?? '',
          tipX: r.left + r.width * 0.135,
          tipY: r.top + r.height * 0.135,
          op: getComputedStyle(el).opacity,
          w: Math.round(r.width),
        });
      }
      if (performance.now() < fim) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }, limiteMs);

  const fases = new Set();
  const vista = {};
  let qtde = 0;
  const fimNode = Date.now() + limiteMs + 5000;
  while (Date.now() < fimNode) {
    await page.waitForTimeout(300);
    const frames = await page.evaluate(() => window.__luvaFrames ?? []);
    qtde = frames.length;
    for (const f of frames) {
      if (!f.fase) continue;
      fases.add(f.fase);
      vista[f.fase] = f;
    }
    if (fases.has('soltar')) break;
  }
  return { fases, vista, qtde };
};

const abrirPeloMenu = async () => {
  await page.click('[data-testid="play"]');
  const prompt = page.locator('[data-testid="tutorial-prompt-go"]');
  if (await prompt.count()) {
    await prompt.click(); // já há time guardado: deixamos o tutorial começar vazio
  }
  await page.waitForSelector('[data-testid="tutorial-faixa"]');
};

// ═════════════════════ A · primeira vez: os cinco passos ═════════════════════

armWatchdog('abrir o site');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(URL, { waitUntil: 'networkidle' });
mark('site aberto, save zerado');

await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="tutorial-faixa"]');
mark('tutorial aberto');

check((await passoAtual()) === 'escolher', 'passo 1 é "escolher"');
check((await page.locator('[data-testid="tutorial-prompt"]').count()) === 0, 'sem jogo salvo, a pergunta não aparece');
check((await meusUnits()).length === 0, 'tutorial SEMPRE começa com a arena vazia');
check(await page.locator('[data-testid="tutorial-luva"]').isVisible(), 'a luvinha está na tela');
check(
  (await page.locator('[data-testid="tutorial-caption"]').textContent()).includes('primeiro monstro'),
  'a faixa diz o que fazer',
);
check((await page.locator('[data-testid="tutorial-skip"]').count()) === 1, 'há botão de pular tutorial');
check((await page.locator('[data-testid="start-battle"]').isDisabled()) === true, 'o combate está travado no tutorial');

let lj = await loja();
check(lj.ignis?.doPasso === 'true' && !lj.ignis.disabled, 'o card ensinado está dourado e livre');
check(lj.golem?.doPasso === 'false' && lj.golem.disabled, 'os outros cards estão fora do passo');
check(/fora do passo/.test(lj.zephyr?.texto ?? ''), 'o card travado explica por quê');
await shotBox(page.locator('[data-testid="tutorial-faixa"]'), '01-faixa-passo1.png', 8);
await shotFull('01-passo1-arena-vazia.png');

// toque fora da hora: passo 1 não deixa abrir o inspetor (não há bicho, mas a
// loja responde) — a régua de verdade aparece no passo 3
await checarEnquadre('no passo 1');

// ── passo 1 → 2: chamar o monstro
await page.click('[data-testid="shop-ignis"]');
await page.waitForTimeout(700);
check((await passoAtual()) === 'inpecionar', 'passo 2 é "inpecionar"');
check((await meusUnits()).length === 1, 'o monstro entrou em cena');

// ── passo 2: tocar no monstro abre o card de status
{
  const [u] = await meusUnits();
  await page.mouse.click(u.sx, u.sy);
  await page.waitForTimeout(500);
  check(await page.locator('[data-testid="inspector"]').isVisible(), 'o toque em cena abriu os status');
  check((await passoAtual()) === 'comprar', 'passo 3 é "comprar"');
}
await shotBox(page.locator('[data-testid="tutorial-luva"]').first(), '02-luva-aponta.png', 20);

// ── passo 3: a régua barra o que não é a compra
{
  const antes = await meusUnits();
  await page.mouse.click(antes[0].sx, antes[0].sy);
  await page.waitForTimeout(350);
  check(/Nada de inspetor agora/.test(await ultimoToast()), 'fora do passo, o toque é recusado com recado');
  check((await passoAtual()) === 'comprar', 'a jogada errada não avançou o passo');
}
await page.click('[data-testid="shop-ignis"]');
await page.waitForTimeout(700);
check((await passoAtual()) === 'arrastar', 'passo 4 é "arrastar"');
check((await meusUnits()).length === 2, 'há duas criaturas para fundir');

// ═════════════ B · a luva ilustra, ela NÃO joga pelo jogador ═════════════════

armWatchdog('mímica do passo 4');
{
  const antes = await meusUnits();
  const { fases, vista, qtde: qtde4 } = await assistirMimica();
  check(fases.has('carregar') && fases.has('soltar'), 'a luva percorreu o trajeto (mímica)',
    `${[...fases].join(',')} (${qtde4} frames)`);
  const depois = await meusUnits();
  check(depois.length === 2, 'depois da mímica ainda há DUAS criaturas (nada foi fundido)', `${depois.length}`);
  check(
    depois.every((u) => u.level === 1) && antes.length === depois.length &&
      depois.every((a) => antes.some((b) => b.unitId === a.unitId && b.wx === a.wx && b.wz === a.wz)),
    'nenhuma criatura se moveu durante a mímica',
  );
  check((await page.locator('[data-testid="sell-fab"]').count()) === 0, 'a mímica não armou venda alguma');
  check((await passoAtual()) === 'arrastar', 'a mímica não fechou o passo 4');
  const m = await marcas();
  check(!!m.aro, 'existe o aro pontilhado no buraco de destino');
  const alvo = depois.map((u) => Math.hypot(u.sx - m.aro.x, u.sy - m.aro.y));
  check(Math.min(...alvo) < 70, 'o aro está em cima da criatura de destino', `${Math.round(Math.min(...alvo))}px`);
  check(m.aro.pe === 'none', 'o aro é surdo ao ponteiro');
  const soltou = vista.soltar;
  const dist = soltou && m.aro ? Math.hypot(soltou.tipX - m.aro.x, soltou.tipY - m.aro.y) : Infinity;
  check(dist < 90, 'na fase "solte", a ponta do dedo encosta no destino',
    Number.isFinite(dist) ? `${Math.round(dist)}px` : `frames=${qtde4} fases=${[...fases].join(',')}`);
  await shotFull('04-mimica-arrastar.png');
  await shotBox(page.locator('[data-testid="tutorial-luva"]').first(), '04-luva-mimica.png', 40);
  await checarEnquadre('no passo 4 (com aro e faixa)');

  // soltar em buraco livre não vale (mover não é o passo) e explica
  armWatchdog('drop errado no passo 4');
  await cenaQuieta();
  const [a] = await meusUnits();
  const vazio = [a.sx + 150, a.sy + 90];
  check(await arrastar([a.sx, a.sy], vazio), 'o arraste no vazio pegou a criatura');
  check(/Solte em cima da outra criatura/.test(await ultimoToast()), 'soltar no vazio explica o passo');
  check((await meusUnits()).length === 2, 'soltar no vazio não fundiu nada');
  check((await passoAtual()) === 'arrastar', 'o passo 4 continua aberto');

  // ── o jogador faz o arraste de verdade → funde
  armWatchdog('arraste do jogador (fusão)');
  check(
    (await page.locator('[data-testid="inspector"]').count()) === 0,
    'o card de status fechou na entrada do passo de arraste (ele cobre a arena no celular)',
  );
  await cenaQuieta();
  const [p1, p2] = await meusUnits();
  {
    const f1 = await frenteEm(p1.sx, p1.sy);
    const f2 = await frenteEm(p2.sx, p2.sy);
    check(
      f1.startsWith('CANVAS') && f2.startsWith('CANVAS'),
      'o corpo das criaturas do passo está livre para o ponteiro',
      `p1:${f1} | p2:${f2}`,
    );
  }
  check(await arrastar([p1.sx, p1.sy], [p2.sx, p2.sy]), 'o arraste do jogador pegou a criatura');
  await page.waitForTimeout(900); // a criatura comida ainda passa um instante na cena
  const fundiu = await meusUnits();
  if (fundiu.length !== 1) console.log('  depuração — toasts:', JSON.stringify((await toasts()).slice(-3)), JSON.stringify(fundiu));
  check(fundiu.length === 1 && fundiu[0].level === 2, 'o arraste do jogador fundiu em Nv.2', `${fundiu.length}×Nv.${fundiu[0]?.level}`);
  check((await passoAtual()) === 'vender', 'passo 5 é "vender"');
}
await shotFull('05-passo5-vender.png');

// ═══════════════════ C · o fantasma do botão dourado ═════════════════════════

{
  const m = await marcas();
  check(!!m.fabFantasma, 'existe o fantasma do botão de venda');
  check(m.fabFantasma?.pe === 'none', 'o fantasma é surdo ao ponteiro', String(m.fabFantasma?.pe));
  check(m.fabFantasma?.hit === 'CANVAS', 'no lugar do fantasma quem recebe o ponteiro é o canvas', String(m.fabFantasma?.hit));
  const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  check(
    !!m.fabFantasma && Math.abs(m.fabFantasma.right - (viewport.w - 14)) < 4,
    'o fantasma mora na mesma borda direita do FAB real',
    m.fabFantasma ? `right=${m.fabFantasma.right} de ${viewport.w - 14}` : 'sem fantasma',
  );

  armWatchdog('mímica do passo 5');
  const antes = await meusUnits();
  const moedaAntes = await coinsNaTela();
  const { fases, vista, qtde: qtde5 } = await assistirMimica();
  check(fases.has('carregar') && fases.has('soltar'), 'no passo 5 a luva percorre a venda (mímica)',
    `${[...fases].join(',')} (${qtde5} frames)`);
  const m2 = await marcas();
  check(!!m2.fabFantasma, 'o fantasma continua lá durante a mímica do passo 5');
  const soltou5 = vista.soltar;
  const dist5 = soltou5 && m2.fabFantasma
    ? Math.hypot(soltou5.tipX - m2.fabFantasma.x, soltou5.tipY - m2.fabFantasma.y)
    : Infinity;
  check(dist5 < 90, 'a ponta do dedo chega no botão dourado',
    Number.isFinite(dist5) ? `${Math.round(dist5)}px` : `frames=${qtde5} fases=${[...fases].join(',')}`);
  const depois = await meusUnits();
  check(depois.length === 1 && depois[0].level === 2, 'a mímica NÃO vendeu a criatura');
  check((await coinsNaTela()) === moedaAntes, 'a mímica não mexeu no saldo');
  check((await passoAtual()) === 'vender', 'a mímica não fechou o passo 5');
  check((await page.locator('[data-testid="sell-fab"]').count()) === 0, 'sem arraste, não há FAB de venda');
  await checarFaixaForaDoFab('no passo 5 (desktop)');

  // ── o jogador vende de verdade: o FAB real nasce em cima do fantasma
  armWatchdog('venda do jogador');
  await cenaQuieta();
  const oVendido = (await meusUnits()).sort((a, b) => b.level - a.level)[0];
  const u = oVendido;
  const alvoFab = m2.fabFantasma ?? { x: oVendido?.sx ?? 0, y: (oVendido?.sy ?? 0) - 120 };
  check(!!u && !!m2.fabFantasma, 'há criatura e fantasma para a venda do jogador');
  await page.mouse.move(u.sx, u.sy);
  await page.mouse.down();
  await page.mouse.move(u.sx + 14, u.sy - 8);
  await page.waitForTimeout(140);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(u.sx + 14 + ((alvoFab.x - u.sx - 14) * i) / 12, u.sy - 8 + ((alvoFab.y - u.sy + 8) * i) / 12);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(400);
  const fabReal = (await marcas()).fabReal;
  check(!!fabReal, 'segurando a criatura, o FAB dourado apareceu');
  check(
    !!fabReal && Math.abs(fabReal.x - alvoFab.x) < 6 && Math.abs(fabReal.y - alvoFab.y) < 6,
    'o FAB real coincide com o fantasma ensinado',
    fabReal ? `${fabReal.x},${fabReal.y} vs ${alvoFab.x},${alvoFab.y}` : '',
  );
  await shotFull('06-fantasma-vs-fab.png');
  await page.mouse.up();
  await page.waitForTimeout(1200); // a criatura vendida ainda some da cena aos poucos

  {
    const listaVenda = await toasts();
    const iVenda = listaVenda.findIndex((t) => /vendido/.test(t));
    const iDesp = listaVenda.findIndex((t) => /Tutorial concluído/.test(t));
    check(iVenda >= 0, 'o recado da venda apareceu na tela', listaVenda.at(-1) ?? '');
    check(iDesp === -1, 'a despedida ainda NÃO chegou (ela espera o recado da venda)',
      `vendido=${iVenda} despedida=${iDesp}`);
  }
  check((await meusUnits()).length === 0, 'a venda do jogador sumiu a criatura');
  check((await passoAtual()) === null, 'os 5 passos terminaram: a luva foi embora');
  check((await page.locator('[data-testid="tutorial-luva"]').count()) === 0, 'sumiu a luva');
  check((await page.locator('[data-testid="tutorial-fab-alvo"]').count()) === 0, 'sumiu o fantasma');
  await page.waitForTimeout(1900); // a despedida chega DEPOIS do recado da venda
  const lista = await toasts();
  check(/Tutorial concluído/.test(lista.join(' ⋮ ')), 'o tutorial se despediu');
  check(
    /Tutorial concluído/.test(lista.at(-1) ?? ''),
    'a despedida é o último recado (ela não atropela a venda)',
    lista.slice(-2).join(' ⋮ '),
  );
  lj = await loja();
  check(
    ['ignis', 'nereia', 'golem', 'zephyr'].every((id) => lj[id]?.doPasso === 'true' && !lj[id].disabled),
    'a loja voltou a liberar tudo',
  );
  check((await page.locator('[data-testid="start-battle"]').getAttribute('data-tutorial-bloqueado')) === 'false', 'o combate saiu do regime do tutorial');
}
await checarEnquadre('depois do tutorial');
await shotFull('07-depois-do-tutorial.png');

// ══════════════════ E · quem já tem jogo salvo é perguntado ══════════════════

armWatchdog('jogador com save');
await page.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k) ?? 'null');
  if (!s) return;
  s.tutorialDone = false;
  s.coins = 1234;
  s.retainedRoster = [{ species: 'golem', level: 2, tile: 3 }];
  s.stats.matchesPlayed = 3;
  localStorage.setItem(k, JSON.stringify(s));
}, SAVE_KEY);
await page.goto(URL, { waitUntil: 'networkidle' });
mark('save de jogador antigo no ar');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="tutorial-prompt"]');
check(await page.locator('[data-testid="tutorial-prompt"]').isVisible(), 'quem tem jogo salvo É PERGUNTADO');
check(await page.locator('[data-testid="tutorial-prompt"]').isVisible(), 'ainda na tela inicial (nada apagado)');
await shotBox(page.locator('[data-testid="tutorial-prompt"]'), '08-pergunta.png', 0);
await page.click('[data-testid="tutorial-prompt-go"]');
await page.waitForSelector('[data-testid="tutorial-faixa"]');
check((await meusUnits()).length === 0, 'mesmo com time guardado, o tutorial começa vazio');
check((await coinsNaTela()).includes('1234'), 'o saldo do cofre aparece na partida do tutorial');

await page.click('[data-testid="shop-ignis"]');
await page.waitForTimeout(500);
check((await coinsNaTela()).includes('1134'), 'a compra do tutorial gasta moeda VIRTUAL na tela');
check((await moedasNoCofre()) === 1234, 'o COFRE não foi tocado pela compra do tutorial');
await page.click('[data-testid="tutorial-skip"]');
await page.waitForTimeout(700);
check((await passoAtual()) === null, 'pular fecha a luvinha');
{
  const meus = await meusUnits();
  check(meus.length === 1 && meus[0].level === 2 && meus[0].species === 'golem', 'o time guardado voltou');
  check(Math.abs(meus[0].wx - 7.8) < 0.2 && Math.abs(meus[0].wz - 3.1) < 0.2, 'e voltou no MESMO buraco', `x${meus[0]?.wx} z${meus[0]?.wz}`);
}
check((await coinsNaTela()).includes('1234'), 'o saldo volta exatamente ao do cofre');
check((await moedasNoCofre()) === 1234, 'o cofre continua intacto depois de pular');
await shotFull('09-time-que-voltou.png');

// ── F · repetir tutorial pelas configurações
armWatchdog('repetir tutorial');
await page.click('[data-testid="open-settings"]');
await page.waitForSelector('[data-testid="settings-menu"]');
await page.click('[data-testid="settings-tab-progress"]');
check((await page.locator('[data-testid="tutorial-replay"]').count()) === 1, 'há "Repetir tutorial" nas configurações');
await page.click('[data-testid="tutorial-replay"]');
await page.waitForSelector('[data-testid="tutorial-replay-confirm"]');
check(/arena vazia/.test(await page.locator('[data-testid="tutorial-replay-confirm"]').textContent()), 'o confirm avisa que a arena esvazia');
await page.click('[data-testid="tutorial-replay-go"]');
await page.waitForSelector('[data-testid="tutorial-faixa"]');
check((await passoAtual()) === 'escolher', 'repetir volta ao passo 1');
await page.waitForTimeout(900); // a criatura vendida/sumida sai da cena aos poucos
{
  const sobras = await meusUnits();
  check(
    sobras.length === 0,
    'repetir começa com a arena vazia de novo',
    sobras.map((u) => `${u.species} Nv.${u.level} x${u.wx} z${u.wz}`).join(' | '),
  );
}
await page.click('[data-testid="tutorial-skip"]');
await page.waitForTimeout(700);
check((await meusUnits()).length === 1, 'e o time guardado voltou de novo');

// ── F2 · assistido: o tutorial não volta sozinho
armWatchdog('não repetir sozinho');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
check((await passoAtual()) === null, 'reabrir o jogo não reabre o tutorial');
check((await page.locator('[data-testid="tutorial-luva"]').count()) === 0, 'nenhuma luva na tela');

// ═══════════════════════ G · retrato 390×844 ════════════════════════════════

armWatchdog('retrato');
await page.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k) ?? 'null');
  if (s) {
    s.tutorialDone = false;
    localStorage.setItem(k, JSON.stringify(s));
  }
}, SAVE_KEY);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(URL, { waitUntil: 'networkidle' });
await abrirPeloMenu();
await page.click('[data-testid="shop-ignis"]');
await page.waitForTimeout(600);
{
  const [u] = await meusUnits();
  await page.mouse.click(u.sx, u.sy);
  await page.waitForTimeout(450);
}
await page.click('[data-testid="shop-ignis"]');
await page.waitForTimeout(600);
await checarEnquadre('no retrato, passo 4');
{
  check(
    (await page.locator('[data-testid="inspector"]').count()) === 0 &&
      (await page.locator('[data-testid="tutorial-fab-alvo"]').count()) === 0,
    'no retrato o card de status saiu do caminho do arraste',
  );
  await cenaQuieta();
  const [p1, p2] = await meusUnits();
  check(await arrastar([p1.sx, p1.sy], [p2.sx, p2.sy], 14), 'no retrato o arraste pegou a criatura');
}
check((await passoAtual()) === 'vender', 'no retrato também chega ao passo 5');
{
  await page.waitForTimeout(900);
  const m = await marcas();
  check(!!m.fabFantasma, 'no retrato há fantasma do botão');
  check(m.fabFantasma?.w === 52, 'no compacto o fantasma encolhe para 52px, como o FAB', `${m.fabFantasma?.w}px`);
  await checarFaixaForaDoFab('no passo 5 (retrato)');
  await cenaQuieta();
  const maisForte = (await meusUnits()).sort((a, b) => b.level - a.level)[0];
  const u = maisForte;
  const alvo = m.fabFantasma ?? { x: (u?.sx ?? 0) + 60, y: (u?.sy ?? 0) - 120 };
  await page.mouse.move(u.sx, u.sy);
  await page.mouse.down();
  await page.mouse.move(u.sx + 12, u.sy - 8);
  await page.waitForTimeout(140);
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(u.sx + 12 + ((alvo.x - u.sx - 12) * i) / 10, u.sy - 8 + ((alvo.y - u.sy + 8) * i) / 10);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(400);
  const fabReal = (await marcas()).fabReal;
  check(
    !!fabReal && Math.abs(fabReal.x - alvo.x) < 6 && Math.abs(fabReal.y - alvo.y) < 6,
    'no retrato o FAB real também coincide com o fantasma',
    fabReal ? `${fabReal.x},${fabReal.y} vs ${alvo.x},${alvo.y}` : '',
  );
  await shotFull('10-retrato-passo5.png');
  await page.mouse.up();
  await page.waitForTimeout(500);
  await checarEnquadre('no retrato, passo 5');
}

// ═══════════════════════════ H · console limpo ═══════════════════════════════

const relevantes = msgs.filter((m) => !/THREE-|Multiple instances of Three.js|Download the React DevTools/i.test(m));
check(relevantes.length === 0, 'console sem erro/aviso', relevantes.slice(0, 4).join(' | '));

console.log(`\nveredito: ${checks} checagens, ${failures} falha(s) — prints em ${OUT}`);
if (watchdog) clearTimeout(watchdog);
await browser.close();
process.exit(failures ? 1 : 0);
