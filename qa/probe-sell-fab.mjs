// Sonda do BOTÃO FLUTUANTE DE VENDA — a lixeira do dock virou um FAB de 72px
// (52px no compacto) que só existe enquanto o jogador segura uma criatura.
// jsdom não tem CSS nem WebGL, então isto roda no browser real e confere:
//   1) fora do arraste NÃO existe botão; segurando a criatura ele aparece, com
//      data-sell-target, sem onClick e fora da ordem de tab (não se clica);
//   2) o pulso: respirando devagar (≈2,6s) parado e ACELERADO (≈0,6s) quando o
//      arraste para em cima dele (data-hot), com o chip dizendo "solte";
//   3) o FAB NUNCA engole um dos 24 buracos do tabuleiro — se a caixa dele
//      cobrisse um ponto de chão, apontar ali venderia a criatura em vez de
//      pousá-la (é a mesma regra da sonda de enquadramento: 24/24);
//   4) soltar o arraste EM CIMA do botão vende: a criatura some, o toast traz o
//      valor, a loja mostra o reembolso, o botão desaparece e o soltar NÃO
//      deixou criatura nenhuma no buraco que estava sob o FAB;
//   5) o antigo filete da loja sumiu mesmo (nenhum .sell-bin / sell-bin);
//   6) no retrato (390x844) idem, na faixa livre abaixo do HUD;
//   7) console sem erro/aviso.
//
// Uso: QA_OUT=/tmp/… QA_URL=http://localhost:5173/element-merge/ node qa/probe-sell-fab.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.QA_OUT ?? '/tmp/opencode/sell-fab';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1373, height: 749 }, // 13" laptop comum
  // dsf 1.5: o bastante para ler o glifo/chip no print, e metade do custo de
  // screenshot (swiftshader paga cada pixel em CPU — a sonda inteira é CPU)
  deviceScaleFactor: 1.5,
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
  // o toast some sozinho em ~2,8s: a sonda lê o texto DEPOIS de esperar o drop,
  // então ele é coletado por MutationObserver assim que nasce. Cada elemento de
  // toast guarda no dataset o último texto já coletado — assim o mesmo texto
  // repetido (venda em dois cenários) não é descartado como se fosse o antigo
  window.__toasts = [];
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      for (const t of document.querySelectorAll('[data-testid="toast"]')) {
        const txt = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        if (t.dataset.qaToast === txt) continue;
        t.dataset.qaToast = txt;
        window.__toasts.push(txt);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
});

const toasts = () => page.evaluate(() => window.__toasts ?? []);

/** marco de progresso em stderr (stdout vai para arquivo e sai em blocos) */
const t0 = Date.now();
const mark = (what) => process.stderr.write(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}\n`);

/** relógio de bordo: se a sonda travar, o último marco diz ONDE ela parou
 *  (o hang da sonda não devolve stack — só silêncio) */
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

let failures = 0;
const check = (ok, label, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ERR '}${label}${extra ? ` — ${extra}` : ''}`);
};

/** print por RECORTE (o screenshot de ELEMENTO trava com o 3D animando) */
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

armWatchdog('abrir o site');
mark('browser no ar');
await page.goto(URL, { waitUntil: 'networkidle' });
mark('site aberto');
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
mark('partida aberta');
await page.waitForTimeout(1200);

const closeBestiary = async () => {
  if ((await page.locator('[data-testid="close-bestiary"]').count()) === 0) return;
  await page.click('[data-testid="close-bestiary"]');
  await page.waitForTimeout(250);
};

const spawn = async (id, lvl) => {
  armWatchdog(`spawn ${id} Nv.${lvl}`);
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  const lv = page.locator(`[data-testid="debug-level-${id}-${lvl}"]`);
  if (await lv.count()) await lv.click();
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(400);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
    await page.click('[data-testid="discovery-close"]');
  await closeBestiary();
  await page.waitForTimeout(150);
  mark(`spawn ${id} Nv.${lvl} pronto`);
};

/** unidades da cena com a projeção na tela (corpo, chão do slot, ponto vizinho) */
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
    const proj = (x, y, z) => {
      const cx = me[0] * x + me[4] * y + me[8] * z + me[12];
      const cy = me[1] * x + me[5] * y + me[9] * z + me[13];
      const cz = me[2] * x + me[6] * y + me[10] * z + me[14];
      const cw = pe[3] * cx + pe[7] * cy + pe[11] * cz + pe[15];
      return [
        (pe[0] * cx + pe[4] * cy + pe[8] * cz + pe[12]) / cw,
        (pe[1] * cx + pe[5] * cy + pe[9] * cz + pe[13]) / cw,
      ];
    };
    const out = [];
    scene.traverse((o) => {
      if (!o.userData || o.userData.unitId === undefined) return;
      const p = o.getWorldPosition(o.position.clone());
      out.push({
        unitId: o.userData.unitId,
        species: o.userData.species,
        level: o.userData.level,
        gx: proj(p.x, p.y + 0.6, p.z)[0],
        gy: proj(p.x, p.y + 0.6, p.z)[1],
        bx: proj(p.x, 0.28, p.z)[0],
        by: proj(p.x, 0.28, p.z)[1],
      });
    });
    return out;
  });

/**
 * Os 24 buracos do tabuleiro projetados no DOM, com o QUE está na frente de
 * cada um. Com um arraste armado, o FAB de venda entra na pilha de pintura: se
 * a caixa dele cobrir o chão de um buraco, apontar ali acende a venda e soltar
 * VENDE a criatura em vez de pousá-la — o pior tipo de engano possível.
 */
const holesHit = () =>
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
    const other = ['.hud', '.dock', '.shop', '.battle-controls', '.codex-fab', '.turbo-fab', '[data-testid="merge-preview"]'].flatMap(
      (sel) =>
        [...document.querySelectorAll(sel)].map((e) => {
          const r = e.getBoundingClientRect();
          return {
            sel,
            x: `${Math.round(r.left)}..${Math.round(r.right)}`,
            y: `${Math.round(r.top)}..${Math.round(r.bottom)}`,
          };
        }),
    );
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
            where: offscreen
              ? 'FORA DO ENQUADRE'
              : hit
                ? `${hit.tagName}.${hit.className}`.slice(0, 50)
                : 'nada',
            sell: !offscreen && !!hit && !!hit.closest('[data-sell-target]'),
            canvas: !offscreen && !!hit && hit.tagName === 'CANVAS',
            px: Math.round(px),
            py: Math.round(py),
          });
        }
    return { fab: !!document.querySelector('[data-sell-target]'), other, holes: out };
  });

/** estado/estilo do FAB medidos no browser */
const probeFab = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="sell-fab"]');
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const glyph = el.querySelector('svg.sell-glyph');
    const gr = glyph ? glyph.getBoundingClientRect() : null;
    const value = el.querySelector('[data-testid="sell-fab-value"]');
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      exists: true,
      hot: el.getAttribute('data-hot'),
      hasSellAttr: el.hasAttribute('data-sell-target'),
      hasOnclick: el.hasAttribute('onclick') || !!el.onclick,
      tabIndex: el.tabIndex,
      rect: {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      zIndex: cs.zIndex,
      animName: cs.animationName,
      animDuration: cs.animationDuration,
      glyph: gr ? { w: Math.round(gr.width), h: Math.round(gr.height) } : null,
      text: (value?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      hitAtCenter: hit ? `${hit.tagName}.${hit.className}`.slice(0, 60) : 'nada',
      hitIsTarget: !!hit && !!hit.closest('[data-sell-target]'),
      oldBin: !!document.querySelector('.sell-bin, [data-testid="sell-bin"]'),
      shopPresent: !!document.querySelector('[data-testid="shop"]'),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });

const coins = () =>
  page.evaluate(() => document.querySelector('[data-testid="coins"]')?.textContent ?? '');

const toPage = (box) => (nx, ny) => [
  box.x + ((nx + 1) / 2) * box.width,
  box.y + ((1 - ny) / 2) * box.height,
];

const dragTo = async (from, to, steps = 16) => {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
};

// ---------- ponto livre no MEIO da arena (não é buraco, não é DOM) ----------
const arenaPoint = (box) => [box.x + box.width / 2, box.y + box.height * 0.42];

// ---------- cenário A: desktop largo ----------
// três criaturas: uma vendida em cada cenário (A desktop, B janela baixinha,
// C retrato) — sobra sempre uma viva para o próximo arraste
await spawn('ignis', '1');
await spawn('ignis', '1');
await spawn('ignis', '1');
await page.waitForTimeout(600);

armWatchdog('leitura do FAB fora do arraste');
const fabBefore = await probeFab();
mark('FAB fora do arraste lido');
check(!fabBefore.exists, 'fora do arraste não existe botão de venda na tela', JSON.stringify(fabBefore));
check(!fabBefore.oldBin, 'a lixeira do dock sumiu do DOM', `sell-bin: ${fabBefore.oldBin}`);

armWatchdog('leituras iniciais do arraste');
let canvasBox = await page.locator('canvas').first().boundingBox();
let units = await readUnits();
mark('unidades lidas');
const carried = units[0];
if (!carried) {
  console.log('ERRO: não havia criatura para arrastar');
  await browser.close();
  process.exit(1);
}
let map = toPage(canvasBox);
const [ax, ay] = map(carried.gx, carried.gy);
armWatchdog(`arraste desktop desde (${Math.round(ax)},${Math.round(ay)})`);
await dragTo([ax, ay], arenaPoint(canvasBox));
mark('arraste desktop armado');

let fab = await probeFab();
check(fab.exists, 'segurando a criatura o botão aparece', JSON.stringify(fab.rect ?? {}));
check(fab.hasSellAttr, 'o botão carrega data-sell-target (o alvo do arraste)');
check(!fab.hasOnclick && fab.tabIndex === -1, 'o botão não se clica: sem onClick e fora do tab', `tabIndex ${fab.tabIndex}`);
check(fab.glyph?.w >= 16 && fab.glyph?.h >= 16, 'o glifo é um SVG customizado com caixa real', JSON.stringify(fab.glyph));
check(fab.animName !== 'none' && fab.hot === 'false', 'pulso respirando armado (sem dedo em cima)', `${fab.animName} ${fab.animDuration}`);
const slow = parseFloat(fab.animDuration) || 0;
check(slow >= 2, 'pulso devagar (≥2s) enquanto só respira', `animation-duration: ${fab.animDuration}`);
check(/\+/.test(fab.text), 'chip mostra o valor a devolver', JSON.stringify(fab.text));
check(fab.zIndex && Number(fab.zIndex) >= 36, 'FAB acima da prévia de fusões na pilha de pintura', `z-index ${fab.zIndex}`);

// os buracos continuam todos alcançáveis com o FAB na tela?
armWatchdog('projeção dos 24 buracos');
let reach = await holesHit();
mark('buracos lidos');
check(reach.fab, 'a sonda vê o alvo de venda durante o arraste');
const swallowed = reach.holes.filter((h) => h.sell);
const notCanvas = reach.holes.filter((h) => !h.canvas);
check(swallowed.length === 0, 'o FAB não engole nenhum dos 24 buracos', swallowed.map((h) => `(${h.px},${h.py}) ${h.where}`).join(' | '));
check(notCanvas.length === 0, 'nenhum buraco atrás de outro DOM durante o arraste', notCanvas.map((h) => `(${h.px},${h.py}) ${h.where}`).join(' | '));
console.log(`  desktop: caixas DOM = ${JSON.stringify(reach.other)}`);

await page.screenshot({ timeout: 60000, path: `${OUT}/01-desktop-fab-durante-o-arraste.png` });
await shotBox(page.locator('[data-testid="sell-fab"]'), '01b-fab-desktop.png', 10);

// ---------- o dedo em cima: acelera + vira "solte" ----------
const fabRect = fab.rect;
const fx = (fabRect.left + fabRect.right) / 2;
const fy = (fabRect.top + fabRect.bottom) / 2;
check(fab.hitIsTarget, 'o centro do FAB resolve para o alvo de venda (elementFromPoint)', fab.hitAtCenter);
await page.mouse.move(fx - 60, fy);
await page.waitForTimeout(120);
await page.mouse.move(fx, fy, { steps: 6 });
await page.waitForTimeout(300);
fab = await probeFab();
check(fab.exists && fab.hot === 'true', 'o arraste em cima do botão acende data-hot', `hot: ${fab.hot}`);
const fast = parseFloat(fab.animDuration) || 0;
check(fast > 0 && fast <= 1, 'o pulso ACELERA em cima do botão (≤1s)', `de ${slow}s para ${fab.animDuration}`);
check(fast < slow / 2, 'pelo menos duas vezes mais rápido que o pulso parado', `${slow}s → ${fast}s`);
check(fab.text.includes('solte'), 'o chip pede o soltar quando está em cima', JSON.stringify(fab.text));
await shotBox(page.locator('[data-testid="sell-fab"]'), '02-fab-hot.png', 10);

// sair de cima volta a respirar devagar
await page.mouse.move(fx, fy - 140, { steps: 4 });
await page.waitForTimeout(250);
fab = await probeFab();
check(fab.exists && fab.hot === 'false', 'sair de cima do botão desarma o hot', `hot: ${fab.hot}`);
check((parseFloat(fab.animDuration) || 0) === slow, 'o pulso volta à duração devagar', `animation-duration: ${fab.animDuration}`);

// ---------- soltar em cima: vende ----------
const coinsBefore = await coins();
const toastsBefore = (await toasts()).length;
const beforeIds = (await readUnits()).map((u) => u.unitId);
await page.mouse.move(fx, fy, { steps: 4 });
await page.waitForTimeout(250);
armWatchdog('soltar sobre o FAB');
await page.mouse.up();
mark('solto sobre o FAB');
await page.waitForTimeout(900);
const afterIds = (await readUnits()).map((u) => u.unitId);
const toastList = await toasts();
const toast = toastList.slice(toastsBefore).join(' | ');
const fabAfter = await probeFab();
check(beforeIds.length === afterIds.length + 1, 'a criatura sumiu do tabuleiro', `${beforeIds.length} → ${afterIds.length}`);
check(/vendido/.test(toast) && /\+?\d{2,}/.test(toast), 'toast traz a venda com o valor', JSON.stringify(toast));
check((await coins()) !== coinsBefore, 'a loja mostra o reembolso', `${coinsBefore} → ${await coins()}`);
check(!fabAfter.exists, 'solto o arraste, o botão desaparece', JSON.stringify(fabAfter.rect ?? {}));
const hoverReset = await page.evaluate(() => !!document.querySelector('[data-sell-target]'));
check(!hoverReset, 'nenhum alvo de venda vivo depois do arraste');

// ---------- cenário B: janela larga e baixinha (1280x610) ----------
armWatchdog('cenário 1280x610');
await page.setViewportSize({ width: 1280, height: 610 });
await page.waitForTimeout(1200);
canvasBox = await page.locator('canvas').first().boundingBox();
map = toPage(canvasBox);
units = await readUnits();
const carriedB = units[0];
if (!carriedB) {
  console.log('ERRO: sem criatura para o cenário de 1280x610');
} else {
  const [bxa, bya] = map(carriedB.gx, carriedB.gy);
  await dragTo([bxa, bya], arenaPoint(canvasBox));
  fab = await probeFab();
  check(fab.exists, '1280x610: o botão aparece do mesmo jeito', JSON.stringify(fab.rect ?? {}));
  reach = await holesHit();
  const sw = reach.holes.filter((h) => h.sell);
  check(sw.length === 0, '1280x610: o FAB continua sem engolir buraco nenhum', sw.map((h) => `(${h.px},${h.py}) ${h.where}`).join(' | '));
  console.log(`  1280x610: caixas DOM = ${JSON.stringify(reach.other)}`);
  await page.screenshot({ timeout: 60000, path: `${OUT}/03-1280x610-fab.png` });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

// ---------- cenário C: retrato 390x844 ----------
armWatchdog('cenário retrato');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
canvasBox = await page.locator('canvas').first().boundingBox();
map = toPage(canvasBox);
let carriedP = null;
for (let t = 0; t < 8 && !carriedP; t++) {
  const u = await readUnits();
  carriedP = u[0] ?? null;
  if (!carriedP) await page.waitForTimeout(400);
}
if (!carriedP) {
  check(false, 'retrato: a câmera nunca assentou (nenhuma unidade lida)');
} else {
  const [px, py] = map(carriedP.gx, carriedP.gy);
  armWatchdog(`arraste retrato desde (${Math.round(px)},${Math.round(py)})`);
  await dragTo([px, py], [canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.5]);
  fab = await probeFab();
  check(fab.exists, 'no retrato o botão aparece', JSON.stringify(fab.rect ?? {}));
  check(fab.rect.h <= 60 && fab.glyph?.w <= 26, 'no retrato ele encolhe (52px, glifo 20px)', `${fab.rect.h}px glifo ${JSON.stringify(fab.glyph)}`);
  check(fab.rect.top >= 100 && fab.rect.bottom <= fab.viewport.h - 90, 'no retrato ele mora na faixa livre abaixo do HUD e acima da loja', JSON.stringify(fab.rect));
  reach = await holesHit();
  const swP = reach.holes.filter((h) => h.sell);
  check(swP.length === 0, 'retrato: o FAB não engole buraco nenhum', swP.map((h) => `(${h.px},${h.py}) ${h.where}`).join(' | '));
  console.log(`  retrato: caixas DOM = ${JSON.stringify(reach.other)}`);
  console.log(`  retrato: outros DOMs sobre buracos → ${JSON.stringify(reach.holes.filter((h) => !h.canvas).map((h) => `${h.where}@${h.px},${h.py}`))}`);
  await page.screenshot({ timeout: 60000, path: `${OUT}/04-retrato-fab.png` });
  await shotBox(page.locator('[data-testid="sell-fab"]'), '04b-fab-retrato.png', 10);

  // vender no retrato também
  const beforeP = (await readUnits()).map((u) => u.unitId);
  const toastsP = (await toasts()).length;
  const cfx = (fab.rect.left + fab.rect.right) / 2;
  const cfy = (fab.rect.top + fab.rect.bottom) / 2;
  await page.mouse.move(cfx, cfy, { steps: 6 });
  await page.waitForTimeout(350);
  fab = await probeFab();
  check(fab.hot === 'true', 'retrato: hot ao chegar em cima do botão', `hot ${fab.hot}`);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const afterP = (await readUnits()).map((u) => u.unitId);
  check(beforeP.length === afterP.length + 1, 'retrato: soltar em cima vende', `${beforeP.length} → ${afterP.length}`);
  const toastP = (await toasts()).slice(toastsP).join(' | ');
  check(/vendido/.test(toastP), 'retrato: toast da venda também aparece', JSON.stringify(toastP));
  console.log(`  retrato: toasts coletados = ${JSON.stringify(await toasts())}`);
}

armWatchdog('fechamento');
mark('medidas prontas');
console.log(`\nconsole: ${msgs.length ? msgs.join('\n  ') : 'SEM ERROS/WARNINGS'}`);
console.log(`prints em ${OUT}`);
console.log(`\nveredito: ${failures === 0 ? 'SEM FALHAS' : `${failures} FALHA(S)`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
