// Sonda de ENQUADRE + REGRAS DE PARTIDA: (1) projeta o chão dos 24 buracos e
// exige que `document.elementFromPoint` caia no CANVAS — o dock DOM engole o
// `pointerdown`, então buraco projetado em cima da loja fica sem conserto (o
// enquadramento vem de ORBIT_TARGET/CAMERA_POS em game/board.ts + max-width do
// painel na loja); (2) faz um ARRASTE REAL de fusão no canvas e confere que o
// filho nasce no slot do ALVO; (3) entra em combate e exige a loja FECHADA.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT =
  process.env.QA_OUT ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\framing';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1373, height: 749 } }); // 13" laptop comum
const msgs = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && msgs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
  // 🎓 num perfil limpo é o TUTORIAL DA LUVINHA que abre no `play`, e ele barra
  // qualquer jogada fora dos 5 passos (spawn de depuração incluso). Esta sonda
  // não testa o tutorial — então marcamos o flag no save ANTES do app nascer.
  // `loadSave` é defensivo: um objeto só com `tutorialDone` vira o save padrão
  // em tudo o mais.
  try {
    const K = 'elemental-merge-save-v1';
    const s = JSON.parse(localStorage.getItem(K) ?? '{}');
    s.tutorialDone = true;
    localStorage.setItem(K, JSON.stringify(s));
  } catch {
    localStorage.setItem('elemental-merge-save-v1', JSON.stringify({ tutorialDone: true }));
  }
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}\\01-preparacao-vazia.png` });

/**
 * TODOS os 24 buracos têm que estar alcançáveis pelo ponteiro: o chão do slot
 * projetado na tela não pode cair em cima de painel algum (a loja/DOM engole o
 * pointerdown e a criatura daquele buraco fica impossível de arrastar).
 * O tabuleiro é derivado de game/board.ts: cols 0..3 → x ±7,8/±2,6; linhas
 * 0..2 → |z| = 3,1 + 5,2·linha.
 */
const reach = await page.evaluate(() => {
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
  const blocked = [];
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
        if (offscreen || !hit || hit.tagName !== 'CANVAS') {
          blocked.push({
            side: side > 0 ? 'jogador' : 'inimigo',
            row,
            x: colX,
            where: offscreen ? 'FORA DO ENQUADRE' : `${hit.className || hit.tagName}`,
            px: Math.round(px),
            py: Math.round(py),
          });
        }
      }
  return { total: 24, blocked };
});
console.log(
  `\nburacos alcançáveis pelo ponteiro: ${reach.total - reach.blocked.length}/${reach.total}`,
);
for (const b of reach.blocked)
  console.log(
    `  ${b.side} linha ${b.row} x=${b.x} → ${b.where} (${b.px},${b.py})`,
  );

const spawn = async (id, lvl) => {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  const btn = page.locator(`[data-testid="debug-spawn-${id}"]`);
  if (!(await btn.count())) {
    console.log(`(sem spawn para ${id})`);
  } else {
    if (lvl) {
      const lv = page.locator(`[data-testid="debug-level-${id}-${lvl}"]`);
      if (await lv.count()) await lv.click();
    }
    await btn.click();
    await page.waitForTimeout(400);
    if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
      await page.click('[data-testid="discovery-close"]');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
};

// figurinos grandes (os que antes derramavam) + dois pares iguais para fundir
for (const [id, lvl] of [
  ['colosso', '9'],
  ['astral', '9'],
  ['abissal', '8'],
  ['vulcanico', '8'],
  ['golem', '1'],
  ['golem', '1'],
  ['ignis', '5'],
]) await spawn(id, lvl);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}\\02-preparacao-grandes.png` });

// leitura da cena: unidades + suas origens (centro do slot) + projeção na tela
const readUnits = () =>
  page.evaluate(() => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    const anyObj = (window.__threeRs || []).find((s) => s && s.isMesh) || null;
    let cam = null;
    scene.traverse((o) => {
      if (!cam && o.__r3f && o.__r3f.root) cam = o.__r3f.root.getState().camera;
    });
    scene.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    const me = cam.matrixWorldInverse.elements;
    const pe = cam.projectionMatrix.elements;
    const out = [];
    scene.traverse((o) => {
      if (!o.userData || o.userData.unitId === undefined) return;
      const p = o.getWorldPosition(o.position.clone());
      const proj = (ax3, ay3, az3) => {
        const cx = me[0] * ax3 + me[4] * ay3 + me[8] * az3 + me[12];
        const cy = me[1] * ax3 + me[5] * ay3 + me[9] * az3 + me[13];
        const cz = me[2] * ax3 + me[6] * ay3 + me[10] * az3 + me[14];
        const cw = pe[3] * cx + pe[7] * cy + pe[11] * cz + pe[15];
        return [
          (pe[0] * cx + pe[4] * cy + pe[8] * cz + pe[12]) / cw,
          (pe[1] * cx + pe[5] * cy + pe[9] * cz + pe[13]) / cw,
        ];
      };
      const [gx, gy] = proj(p.x, p.y, p.z);
      // ponto de AGARRE: um pouco acima da base, no corpo (o hitbox é o cilindro
      // do figurino; a origem no chão costuma ficar ABAIXO da silhueta)
      const [hx, hy] = proj(p.x, p.y + 1.3, p.z);
      out.push({
        unitId: o.userData.unitId,
        species: o.userData.species,
        level: o.userData.level,
        x: +p.x.toFixed(2),
        z: +p.z.toFixed(2),
        sx: gx,
        sy: gy,
        hx,
        hy,
      });
    });
    void anyObj;
    return out;
  });

const units = await readUnits();
console.log('unidades antes da fusão (mundo + NDC):');
for (const u of units)
  console.log(
    `  #${u.unitId} ${u.species.padEnd(10)} nv${u.level}  x=${String(u.x).padStart(7)} z=${String(u.z).padStart(6)}  ndc=(${u.sx.toFixed(2)},${u.sy.toFixed(2)})`,
  );

const golens = units.filter((u) => u.species === 'golem');
if (golens.length < 2) {
  console.log('ERRO: precisava de dois golems Nv.1 para o arraste');
  process.exit(1);
}
const [carried, target] = golens; // A carregada, largada SOBRE B

const canvasBox = await page.locator('canvas').first().boundingBox();
const toPage = (sx, sy) => [
  canvasBox.x + ((sx + 1) / 2) * canvasBox.width,
  canvasBox.y + ((1 - sy) / 2) * canvasBox.height,
];
const [ax, ay] = toPage(carried.hx, carried.hy); // agarre no corpo
const [bx, by] = toPage(target.sx, target.sy); // largada no centro do slot do alvo
console.log(`\narraste: #${carried.unitId} (${ax.toFixed(0)},${ay.toFixed(0)}) → #${target.unitId} (${bx.toFixed(0)},${by.toFixed(0)})`);

await page.mouse.move(ax, ay);
await page.mouse.down();
for (let i = 1; i <= 18; i++) {
  await page.mouse.move(ax + ((bx - ax) * i) / 18, ay + ((by - ay) * i) / 18);
  await page.waitForTimeout(45);
}
await page.screenshot({ path: `${OUT}\\03-arraste-sobre-o-alvo.png` });
await page.mouse.up();
await page.waitForTimeout(1400);

const after = await readUnits();
console.log('\nunidades depois do arraste:');
for (const u of after)
  console.log(`  #${u.unitId} ${u.species.padEnd(10)} nv${u.level}  x=${String(u.x).padStart(7)} z=${String(u.z).padStart(6)}`);

const filho = after.find((u) => u.species === 'golem' && u.level === 2);
const buracoOrigem = after.find((u) => u.unitId === carried.unitId);
console.log(
  filho
    ? `\nfilho Nv.2 em (${filho.x}, ${filho.z}) | alvo estava em (${target.x}, ${target.z}) | origem ainda existe? ${!!buracoOrigem}`
    : '\nERRO: nenhum golem Nv.2 depois do arraste',
);
await page.screenshot({ path: `${OUT}\\04-depois-do-arraste.png` });

// combate: loja fechada? cards desabilitados? enquadramento da luta?
await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(1600);
const disabled = await page.evaluate(() =>
  ['ignis', 'nereia', 'golem', 'zephyr'].map((id) => {
    const b = document.querySelector(`[data-testid="shop-${id}"]`);
    return `${id}:${b?.disabled ? 'FECHADA' : 'aberta'}${b?.textContent?.includes('em combate') ? '/em combate' : ''}`;
  }),
);
console.log(`\nloja em combate → ${disabled.join('  ')}`);
await page.screenshot({ path: `${OUT}\\05-combate-loja-fechada.png` });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}\\06-combate-lutando.png` });

console.log(`\nconsole: ${msgs.length ? msgs.join('\n') : 'SEM ERROS/WARNINGS'}`);
console.log(`prints em ${OUT}`);
await browser.close();
