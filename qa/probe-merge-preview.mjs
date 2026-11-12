// Sonda da PRÉVIA DE FUSÕES do arraste — o painel que persegue o ponteiro
// quando o jogador segura uma criatura SOBRE outra aliada. jsdom não tem WebGL
// nem CSS, então isto roda no browser real e confere:
//   1) baseline: o filho do arraste está SELADO na enciclopédia antes;
//   2) linha 1 revela o filho AINDA INÉDITO antes de soltar (nome + miniatura),
//      com as outras linhas selando o que não foi descoberto (silhueta + '???');
//   3) o painel persegue o ponteiro e NUNCA cobre os DOIS monstros do arraste (o
//      que está na mão e o do slot mirada), nem engole o pointerdown
//      (elementFromPoint no ponteiro continua sendo o CANVAS);
//   4) o palco da prévia é um ÚNICO canvas extra e desenha de verdade (draw
//      calls > 0) — e morre no soltar (volta a 1 canvas);
//   5) o arraste continua fundindo por baixo do painel (o drop acontece);
//   6) par inválido: linha ✕ + motivo legível, sem esconder as opções válidas;
//   7) no retrato (390x844) idem, e espécie já descoberta sai do selo;
//   8) console sem erro/aviso.
//
// Uso: QA_OUT=/tmp/… QA_URL=http://localhost:5173/element-merge/ node qa/probe-merge-preview.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.QA_OUT ?? '/tmp/opencode/merge-preview';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1373, height: 749 }, // 13" laptop comum
  deviceScaleFactor: 2, // as caixinhas de 44 px da prévia só se lêem ampliadas
});
const msgs = [];
page.on('console', (m) =>
  ['error', 'warning'].includes(m.type()) && msgs.push(`${m.type()}: ${m.text()}`),
);
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

// DevTools hook: guarda cenas e renderizadores WebGL criados (three.js)
await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
});

let failures = 0;
const check = (ok, label, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ERR '}${label}${extra ? ` — ${extra}` : ''}`);
};

/** print por RECORTE: o screenshot de ELEMENTO espera rolagem + estabilidade e
 *  trava com o painel fixo e o 3D animando; recorte no canvas da página não.
 *  O recorte é amarrado à janela visível (elemento dentro de lista rolável tem
 *  caixa fora da tela, e o Playwright recusa recorte fora da imagem). */
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

await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
await page.waitForTimeout(1200);

const closeBestiary = async () => {
  // o spawn do debug FECHA a enciclopédia sozinho; quando ela continua aberta
  // (baseline, cancelamento) o fechamento é o botão próprio — Escape não fecha,
  // e o overlay aberto engoliria todo o arraste seguinte
  if ((await page.locator('[data-testid="close-bestiary"]').count()) === 0) return;
  await page.click('[data-testid="close-bestiary"]');
  await page.waitForTimeout(250);
};

const spawn = async (id, lvl) => {
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
};

// dois pares de puros Nv.5: (Ignis + Gólem → Magma) no desktop e (Ignis +
// Nereia → Vapor) no retrato; um Gólem Nv.3 entra depois para o caso inválido
await spawn('ignis', '5');
await spawn('golem', '5');
await spawn('ignis', '5');
await spawn('nereia', '5');
await page.waitForTimeout(2500);

// baseline do selo: Magma NÃO aparece na enciclopédia ainda (é justamente o que
// a linha 1 do painel revela no arraste, antes de soltar)
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
const sealedBefore = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="bestiary"]');
  return {
    hasMagma: (root?.textContent ?? '').includes('Magma'),
    lockedCards: document.querySelectorAll('.beast-card.locked').length,
  };
});
// referência visual do selo do bestiário (a mesma massa escura que a prévia usa)
await shotBox(page.locator('.beast-card.locked').first(), '00-card-selado.png');
await page.click('[data-testid="close-bestiary"]');
await page.waitForTimeout(500);
const openAfterClose = await page.evaluate(() => !!document.querySelector('[data-testid="bestiary"]'));
check(!openAfterClose, 'enciclopédia fechada antes do arraste (o overlay engole o ponteiro)', `aberta: ${openAfterClose}`);
check(
  !sealedBefore.hasMagma && sealedBefore.lockedCards > 0,
  'baseline: Magma está SELADA na enciclopédia antes do arraste',
  JSON.stringify(sealedBefore),
);

/** unidades da cena com a projeção na tela (corpo e chão do slot) */
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
      const [gx, gy] = proj(p.x, p.y + 0.6, p.z); // corpo, não a base no chão
      const [bx, by] = proj(p.x, 0.28, p.z); // chão do slot
      // um ponto DENTRO do mesmo buraco (meio da largura do slot à direita): é
      // para onde o ponteiro anda sem trocar de alvo (no eixo vertical da tela
      // um dedo que sobe pula várias linhas do tabuleiro)
      const [nx, ny] = proj(p.x + 1.3, 0.28, p.z);
      out.push({
        unitId: o.userData.unitId,
        species: o.userData.species,
        level: o.userData.level,
        gx,
        gy,
        bx,
        by,
        nx,
        ny,
      });
    });
    return out;
  });

/** estado do painel + geometria, medidos no browser (px,py = ponteiro atual) */
const probePanel = (px, py) =>
  page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('[data-testid="merge-preview"]');
      if (!el) return { exists: false };
      const r = el.getBoundingClientRect();
      const inside = (cx, cy) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      const rows = [...el.querySelectorAll('[data-testid^="mp-"]')].map((row) => ({
        testid: row.getAttribute('data-testid'),
        cls: row.className,
        text: row.textContent.replace(/\s+/g, ' ').trim(),
        boxes: [...row.querySelectorAll('.mt-box')].map((b) => ({
          locked: b.className.includes('locked'),
          w: Math.round(b.getBoundingClientRect().width),
        })),
      }));
      const models = [...el.querySelectorAll('.mt-model')].map((m) => {
        const mr = m.getBoundingClientRect();
        return { w: Math.round(mr.width), h: Math.round(mr.height) };
      });
      const notes = [...el.querySelectorAll('.mp-title, .mp-reason, .mp-hint')].map((n) =>
        n.textContent.replace(/\s+/g, ' ').trim(),
      );
      const hit = document.elementFromPoint(x, y);
      return {
        exists: true,
        rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
        transform: getComputedStyle(el).transform,
        pointerEvents: getComputedStyle(el).pointerEvents,
        rows,
        models,
        notes,
        pointerInsidePanel: inside(x, y),
        hitAtPointer: hit ? `${hit.tagName}.${hit.className}`.slice(0, 60) : 'nada',
        hitIsCanvas: !!hit && hit.tagName === 'CANVAS',
        canvases: document.querySelectorAll('canvas').length,
        renderers: (window.__threeRs || [])
          .filter((o) => o && o.isWebGLRenderer)
          .map((o) => o.info?.render?.calls ?? -1),
        viewport: { w: window.innerWidth, h: window.innerHeight },
      };
    },
    [px, py],
  );

const canvasBox = await page.locator('canvas').first().boundingBox();
const toPage = (box) => (nx, ny) => [
  box.x + ((nx + 1) / 2) * box.width,
  box.y + ((1 - ny) / 2) * box.height,
];
const page13 = toPage(canvasBox);

/** distância de Tchebychev do centro do corpo até o retângulo do painel: > 0
 *  significa que o corpo está FORA do painel (e de quanto). RAIO é o mesmo raio
 *  de "não pode tapar" do MergePreviewPanel. Os DOIS corpos mais perto do
 *  ponteiro são exatamente os do arraste (o que está na mão, que segue o dedo, e
 *  o do slot mirada, que está debaixo dele); qualquer outro monstro do tabuleiro
 *  fica a uma célula (~100 px) de distância. */
const RAIO = 62;
const corposDoArrasteLivres = async (rect, ponteiro, map = page13) => {
  if (!rect) return { ok: false, detalhe: 'sem painel' };
  const unidades = (await readUnits()).map((u) => {
    const [x, y] = map(u.gx, u.gy); // corpo, não a base no chão
    return {
      o: `${u.species}${u.level}#${u.unitId}`,
      em: `(${Math.round(x)},${Math.round(y)})`,
      atePonteiro: Math.max(Math.abs(x - ponteiro[0]), Math.abs(y - ponteiro[1])),
      folga: Math.max(
        Math.max(rect.left - x, x - rect.right),
        Math.max(rect.top - y, y - rect.bottom),
      ),
    };
  });
  const pares = unidades.sort((a, b) => a.atePonteiro - b.atePonteiro).slice(0, 2);
  return {
    // 2 px de tolerância: a sonda arredonda a caixa do painel para comparar
    ok: unidades.length >= 2 && pares.every((m) => m.folga >= RAIO - 2),
    detalhe: `${pares
      .map((m) => `${m.o} ${m.em} folga ${m.folga.toFixed(1)}px`)
      .join(' | ')} (o terceiro monstro mais perto está a ${Math.round(
      [...unidades]
        .sort((a, b) => a.atePonteiro - b.atePonteiro)
        .slice(2)[0]?.atePonteiro ?? -1,
    )}px do dedo)`,
  };
};

const units0 = await readUnits();
const carried = units0.find((u) => u.species === 'ignis' && u.level === 5);
const target = units0.find((u) => u.species === 'golem' && u.level === 5);
if (!carried || !target) {
  console.log('ERRO: faltou par Nv.5 para o arraste');
  await browser.close();
  process.exit(1);
}
console.log(`\narraste: #${carried.unitId} ignis5 → #${target.unitId} golem5 (esperado: revelar magma6)`);

const [ax, ay] = page13(carried.gx, carried.gy);
const [bx, by] = page13(target.bx, target.by);

check((await probePanel(bx, by)).exists === false, 'nenhum painel antes do arraste');

const hitAt = (x, y) =>
  page.evaluate(
    ([px, py]) => {
      const h = document.elementFromPoint(px, py);
      return {
        where: h ? `${h.tagName}.${h.className}`.slice(0, 70) : 'nada',
        bestiaryOpen: !!document.querySelector('[data-testid="bestiary"]'),
        shopOpen: !!document.querySelector('[data-testid="shop"]'),
      };
    },
    [x, y],
  );
console.log(`\nagarre (${Math.round(ax)},${Math.round(ay)}): ${JSON.stringify(await hitAt(ax, ay))}`);
console.log(`alvo   (${Math.round(bx)},${Math.round(by)}): ${JSON.stringify(await hitAt(bx, by))}`);

await page.mouse.move(ax, ay);
await page.mouse.down();
for (let i = 1; i <= 18; i++) {
  await page.mouse.move(ax + ((bx - ax) * i) / 18, ay + ((by - ay) * i) / 18);
  await page.waitForTimeout(45);
}
await page.waitForTimeout(700); // frames do palco da prévia

let p = await probePanel(bx, by);
console.log('\npainel durante o arraste:');
for (const row of p.rows ?? [])
  console.log(`  ${row.testid?.padEnd(20)} ${row.cls?.padEnd(24)} ${row.text}`);
console.log(`  notas: ${JSON.stringify(p.notes)}`);
console.log(
  `  miniaturas: ${JSON.stringify(p.models)}  canvases: ${p.canvases}  draw calls por renderizador: ${JSON.stringify(p.renderers)}`,
);

const current = (p.rows ?? []).find((r) => r.testid === 'mp-current');
const options = (p.rows ?? []).filter((r) => r.testid?.startsWith('mp-option-'));
check(p.exists, 'painel abre sobre a criatura aliada');
check(!!current && current.cls.includes('mp-valid'), 'linha 1 marcada como fusão válida', current?.cls ?? '');
check(
  !!current && /Ignis/.test(current.text) && /Gólem/.test(current.text),
  'linha 1 mostra os dois ingredientes',
  current?.text ?? '',
);
check(!!current && /Magma/.test(current.text), 'linha 1 REVELA o filho inédito (Magma) antes de soltar', current?.text ?? '');
check(
  !!current && /Nv\.6/.test(current.text) && current.boxes.length === 3 && !current.boxes[2].locked,
  'miniatura do resultado da linha 1 não é silhueta',
  JSON.stringify(current?.boxes ?? []),
);
check(options.length === 2, 'as outras fusões possíveis da criatura na mão (2)', `reais: ${options.length}`);
check(options.every((r) => /Nv\.5/.test(r.text)), 'parceiras cobradas no MESMO nível', options.map((r) => r.text).join(' | '));
check(options.every((r) => !r.boxes[1].locked), 'parceiras puras nunca entram seladas', JSON.stringify(options.map((r) => r.boxes[1])));
check(
  options.every((r) => r.text.includes('???') && r.boxes[2].locked),
  'resultados inéditos das outras linhas: ??? + silhueta',
  options.map((r) => `${r.testid}:${r.text}`).join(' | '),
);
check(!options.some((r) => /Magma/.test(r.text)), 'par já mirado na linha 1 não se repete na lista');

check(p.pointerEvents === 'none', 'painel é DOM inerte (pointer-events: none)', p.pointerEvents ?? '');
check(
  !p.pointerInsidePanel,
  'painel NÃO cobre o ponto do ponteiro (o monstro sob o dedo)',
  `painel ${JSON.stringify(p.rect)} × ponteiro (${Math.round(bx)},${Math.round(by)})`,
);
check(p.hitIsCanvas, 'o ponteiro continua vendo o canvas (elementFromPoint)', p.hitAtPointer ?? '');
let folga = await corposDoArrasteLivres(p.rect, [bx, by]);
check(folga.ok, 'nenhum dos DOIS monstros do arraste fica sob o painel', folga.detalhe);
check(
  !!p.rect &&
    p.rect.left >= 0 &&
    p.rect.top >= 0 &&
    p.rect.right <= (p.viewport?.w ?? 0) &&
    p.rect.bottom <= (p.viewport?.h ?? 0),
  'painel inteiro dentro da janela',
  `${JSON.stringify(p.rect)} em ${JSON.stringify(p.viewport)}`,
);
check(
  (p.models ?? []).length === 3 * (1 + options.length) && (p.models ?? []).every((m) => m.w > 0 && m.h > 0),
  'cada miniatura tem caixa real para o drei recortar',
  JSON.stringify(p.models),
);
check(p.canvases === 2, 'palco da prévia = UM canvas extra (2 no total)', `canvases: ${p.canvases}`);
const stageCalls = (p.renderers ?? [])[1] ?? 0;
check(stageCalls > 0, 'o palco da prévia desenha as miniaturas (draw calls)', `calls: ${JSON.stringify(p.renderers)}`);
await page.screenshot({ timeout: 60000, path: `${OUT}/01-painel-sobre-o-alvo.png` });
await shotBox(page.locator('[data-testid="merge-preview"]'), '01b-painel-close.png', 4);
// a miniatura SELADA ampliada: tem que ter a FORMA escura, não um buraco preto
const sealedThumb = page.locator('[data-testid^="mp-option-"] .mt-box.locked').first();
check((await sealedThumb.count()) > 0, 'pelo menos uma miniatura selada desenhada no painel');
await shotBox(sealedThumb, '01c-miniatura-selada.png', 2);

// ---------- persegue o ponteiro ----------
const before = p.transform;
// anda o ponteiro para OUTRO ponto do MESMO buraco (no eixo Y da tela um dedo
// que sobe atravessa linhas inteiras do tabuleiro e o painel fecharia — o que
// seria comportamento certo, mas não testa o que queremos aqui)
const mid = (await readUnits()).find((u) => u.unitId === target.unitId) ?? target;
const [mx, my] = page13(mid.nx, mid.ny);
await page.mouse.move(mx, my);
await page.waitForTimeout(320);
p = await probePanel(mx, my);
check(p.exists && p.transform !== before, 'painel acompanha o ponteiro quando ele anda', `${before} → ${p.transform}`);
check(
  !!p.rect && !p.pointerInsidePanel,
  'andar o ponteiro não faz o painel cobri-lo',
  `painel ${JSON.stringify(p.rect)} × (${Math.round(mx)},${Math.round(my)})`,
);
check(p.hitIsCanvas, 'canvas continua alcançável sob o ponteiro', p.hitAtPointer ?? '');
folga = await corposDoArrasteLivres(p.rect, [mx, my]);
check(folga.ok, 'andar o ponteiro mantém os dois corpos fora do painel', folga.detalhe);
const matXY = (m) => {
  const n = /matrix\(([^)]+)\)/.exec(m ?? '');
  if (!n) return [NaN, NaN];
  const parts = n[1].split(',').map((v) => Number(v.trim()));
  return [parts[4], parts[5]];
};
const [ox, oy] = matXY(before);
const [px2, py2] = matXY(p.transform);
check(
  Math.hypot(px2 - ox, py2 - oy) > 5,
  'o painel se reposicionou junto do dedo (translation > 5px)',
  `(${ox},${oy}) → (${px2},${py2})`,
);
await page.screenshot({ timeout: 60000, path: `${OUT}/02-painel-apos-mover-o-ponteiro.png` });

// perto da borda direita: o painel troca de lado em vez de sair da tela
const edgeX = Math.min(canvasBox.x + canvasBox.width - 40, bx + 200);
await page.mouse.move(edgeX, by + 4);
await page.waitForTimeout(320);
const pe = await probePanel(edgeX, by + 4);
if (pe.exists) {
  check(
    !pe.pointerInsidePanel,
    'perto da borda o painel troca de lado (não cobre o dedo)',
    `painel ${JSON.stringify(pe.rect)} × (${Math.round(edgeX)},${Math.round(by + 4)})`,
  );
  check(pe.rect.left >= 0 && pe.rect.right <= pe.viewport.w, 'painel segue dentro da janela na borda', JSON.stringify(pe.rect));
  const folgaBorda = await corposDoArrasteLivres(pe.rect, [edgeX, by + 4]);
  check(folgaBorda.ok, 'na borda da janela os dois corpos continuam fora do painel', folgaBorda.detalhe);
} else {
  check(false, 'painel sumiu ao mover para a borda (o alvo continua sob o ponteiro?)');
}

// ---------- soltar: o painel não pode atrapalhar a fusão ----------
await page.mouse.move(bx, by);
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForTimeout(1400);
const afterDrop = await readUnits();
const canvasesAfter = await page.evaluate(() => document.querySelectorAll('canvas').length);
check((await probePanel(bx, by)).exists === false, 'painel fecha ao soltar o arraste');
check(canvasesAfter === 1, 'palco da prévia desmonta com o arraste (volta a 1 canvas)', `canvases: ${canvasesAfter}`);
check(
  afterDrop.some((u) => u.species === 'magma' && u.level === 6),
  'a fusão aconteceu DEBAIXO do painel (Magma Nv.6 no slot do alvo)',
  afterDrop.map((u) => `${u.species}${u.level}`).join(','),
);
const overlay = await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false);
check(overlay, 'descoberta inédita abriu o overlay de praxe');
if (overlay) await page.click('[data-testid="discovery-close"]');
await page.screenshot({ timeout: 60000, path: `${OUT}/03-depois-da-fusao.png` });

// ---------- inválido: ✕ + motivo legível, sem esconder as opções válidas ----------
const units1 = await readUnits();
const held = units1.find((u) => u.species === 'ignis' && u.level === 5);
await spawn('golem', '3');
await page.waitForTimeout(900);
const small = (await readUnits()).find((u) => u.species === 'golem' && u.level === 3);
if (!held || !small) {
  console.log('ERRO: faltou Ignis Nv.5 ou Gólem Nv.3 para o caso inválido');
} else {
  const [ix, iy] = page13(held.gx, held.gy);
  const [sx, sy] = page13(small.bx, small.by);
  await page.mouse.move(ix, iy);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(ix + ((sx - ix) * i) / 14, iy + ((sy - iy) * i) / 14);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  p = await probePanel(sx, sy);
  const badRow = (p.rows ?? []).find((r) => r.testid === 'mp-current');
  const optCount = (p.rows ?? []).filter((r) => r.testid?.startsWith('mp-option-')).length;
  console.log(`\npainel sobre par inválido: ${JSON.stringify(badRow?.text)} | notas ${JSON.stringify(p.notes)} | ${optCount} opções`);
  check(p.exists, 'painel também abre sobre par que NÃO funde (lista o que ele pode fazer)');
  check(!!badRow && badRow.cls.includes('mp-invalid') && badRow.text.includes('✕'), 'linha 1 do par inválido mostra ✕', badRow?.text ?? '');
  check((p.notes ?? []).some((n) => /mesmo nível/.test(n)), 'motivo legível do bloqueio aparece na tela', JSON.stringify(p.notes));
  check(optCount === 3, 'as outras fusões dele continuam listadas (3)', `reais: ${optCount}`);
  check(!p.pointerInsidePanel && p.hitIsCanvas, 'par inválido: painel também não cobre o dedo', `hit: ${p.hitAtPointer}`);
  const folgaRuim = await corposDoArrasteLivres(p.rect, [sx, sy]);
  check(folgaRuim.ok, 'par inválido: os dois corpos seguem fora do painel', folgaRuim.detalhe);
  await page.screenshot({ timeout: 60000, path: `${OUT}/04-par-invalido.png` });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

// ---------- retrato (celular): painel estreito, sem cobrir o dedo ----------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1000);
const boxP = (await page.locator('canvas').first().boundingBox()) ?? canvasBox;
const pagePhone = toPage(boxP);
const insideBox = (x, y) =>
  x >= boxP.x + 12 && x <= boxP.x + boxP.width - 12 && y >= boxP.y + 12 && y <= boxP.y + boxP.height - 12;

// a câmera se rearredonda na virada de orientação: relê as projeções até os
// dois pontos do arraste caírem dentro do canvas (senão o dedo cai fora da tela)
let heldP = null;
let mateP = null;
for (let tentativa = 0; tentativa < 8; tentativa++) {
  const unitsP = await readUnits();
  const a = unitsP.find((u) => u.species === 'ignis' && u.level === 5);
  const b = unitsP.find((u) => u.species === 'nereia' && u.level === 5);
  if (a && b && insideBox(...pagePhone(a.gx, a.gy)) && insideBox(...pagePhone(b.bx, b.by))) {
    heldP = a;
    mateP = b;
    break;
  }
  await page.waitForTimeout(500);
}
if (!heldP || !mateP) {
  check(false, 'arraste do retrato: a câmera nunca assentou (pontos fora do canvas)');
} else {
  const [hx, hy] = pagePhone(heldP.gx, heldP.gy);
  const [tx, ty] = pagePhone(mateP.bx, mateP.by);
  console.log(
    `\ncanvas ${JSON.stringify(boxP)} | agarre ndc(${heldP.gx.toFixed(2)},${heldP.gy.toFixed(2)}) → (${Math.round(hx)},${Math.round(hy)}) ${JSON.stringify(await hitAt(hx, hy))}`,
  );
  console.log(`alvo   ndc(${mateP.bx.toFixed(2)},${mateP.by.toFixed(2)}) → (${Math.round(tx)},${Math.round(ty)}) ${JSON.stringify(await hitAt(tx, ty))}`);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(hx + ((tx - hx) * i) / 16, hy + ((ty - hy) * i) / 16);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(700);
  p = await probePanel(tx, ty);
  const curP = (p.rows ?? []).find((r) => r.testid === 'mp-current');
  const rowsP = (p.rows ?? []).filter((r) => r.testid?.startsWith('mp-option-'));
  console.log('\npainel no retrato:');
  for (const row of p.rows ?? []) console.log(`  ${row.testid?.padEnd(20)} ${row.text}`);
  console.log(`  painel ${JSON.stringify(p.rect)} × dedo (${Math.round(tx)},${Math.round(ty)}) — hit: ${p.hitAtPointer}`);
  check(p.exists, 'no retrato o painel abre do mesmo jeito');
  check(!!curP && /Vapor/.test(curP.text), 'linha 1 revela o filho inédito no retrato (Vapor)', curP?.text ?? '');
  check(!p.pointerInsidePanel, 'no retrato o painel NÃO cobre o dedo', `painel ${JSON.stringify(p.rect)} × (${Math.round(tx)},${Math.round(ty)})`);
  check(p.hitIsCanvas, 'no retrato o ponteiro continua vendo o canvas', p.hitAtPointer ?? '');
  const folgaP = await corposDoArrasteLivres(p.rect, [tx, ty], pagePhone);
  check(folgaP.ok, 'no retrato os DOIS monstros do arraste ficam fora do painel', folgaP.detalhe);
  check(p.canvases === 2, 'no retrato continua sendo um canvas único para as miniaturas', `canvases: ${p.canvases}`);
  check(
    rowsP.some((r) => /Magma/.test(r.text) && !r.boxes[2].locked),
    'espécie já descoberta sai do selo (nome, sem silhueta)',
    rowsP.map((r) => r.text).join(' | '),
  );
  check(
    rowsP.some((r) => r.testid === 'mp-option-zephyr' && r.text.includes('???') && r.boxes[2].locked),
    'o que continua inédito segue selado (mesmo painel, linhas diferentes)',
    rowsP.map((r) => `${r.testid}:${r.text}`).join(' | '),
  );
  await page.screenshot({ timeout: 60000, path: `${OUT}/05-retrato-painel.png` });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

console.log(`\nconsole: ${msgs.length ? msgs.join('\n  ') : 'SEM ERROS/WARNINGS'}`);
console.log(`prints em ${OUT}`);
console.log(`\nveredito: ${failures === 0 ? 'SEM FALHAS' : `${failures} FALHA(S)`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
