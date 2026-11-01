// Sonda de depuração: CAPTURA o instante em que a lasca da Obsidiana está em
// voo e o instante em que os cacos de vidro do impacto aparecem (procura na
// cena pelas pools: instância com o material de vidro da lasca / malhas do
// pool de estilhaços de vidro). Tira um print por instante detectado.
// Uso: node qa/probe-flake.mjs <especie> [aliada]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SP = process.argv[2] ?? 'obsidiana';
const ALLY = process.argv[3] ?? 'golem';
const OUT = 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\probe';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');

const spawn = async (id) => {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(600);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="discovery-close"]');
  }
};
await spawn(SP);
if (ALLY && ALLY !== '-') await spawn(ALLY);
await page.waitForTimeout(1500);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -700);
await page.waitForTimeout(800);

// detector: a lasca é a ÚNICA instância com o material de vidro da espécie
// (iceA #332c47); os cacos do impacto são as malhas do pool de estilhaços com
// geometry OctahedronGeometry 0,5 (o corpo usa 1,1/0,9/0,7 — não confunde)
const poll = () =>
  page.evaluate(() => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    let flakes = 0;
    let flakesAt = null;
    let shards = 0;
    let shardsAt = null;
    scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const m = ms[0];
      if (o.isInstancedMesh && m?.uniforms?.uIceA?.value?.getHexString?.() === '332c47') {
        flakes = o.count;
        if (o.count > 0) {
          const a = o.instanceMatrix.array; // coluna-maior: 12,13,14 = translação
          flakesAt = [+a[12].toFixed(2), +a[13].toFixed(2), +a[14].toFixed(2)];
        }
      }
      const geo = o.geometry;
      if (
        o.isMesh &&
        o.visible &&
        geo?.type === 'OctahedronGeometry' &&
        geo.parameters?.radius === 0.5 &&
        geo.parameters?.detail === 0 &&
        m?.uniforms?.uIceA?.value?.getHexString?.() === '2a2438'
      ) {
        shards++;
        const e = o.matrixWorld.elements;
        shardsAt = [+e[12].toFixed(2), +e[13].toFixed(2), +e[14].toFixed(2)];
      }
    });
    return { flakes, flakesAt, shards, shardsAt };
  });

await page.click('[data-testid="start-battle"]');
let shots = 0;
let flakeShots = 0;
let shardShots = 0;
let seenFlake = 0;
let seenShard = 0;
for (let i = 0; i < 150 && shots < 7; i++) {
  const s = await poll();
  if (s.flakes > 0) seenFlake++;
  if (s.shards > 0) seenShard++;
  const wantFlake = s.flakes > 0 && flakeShots < 3;
  const wantShard = s.shards > 0 && shardShots < 4;
  if (wantFlake || wantShard) {
    await canvas.screenshot({ path: `${OUT}\\flake-${String(shots).padStart(2, '0')}.png` });
    console.log(
      `shot ${shots} ${wantShard ? 'CACOS' : 'lasca'} flake=${s.flakes}@${JSON.stringify(s.flakesAt)} cacos=${s.shards}@${JSON.stringify(s.shardsAt)}`,
    );
    if (wantShard) shardShots++;
    else flakeShots++;
    shots++;
  }
  if (i % 10 === 0) console.log(`t${i} flake=${s.flakes} cacos=${s.shards}`);
  await page.waitForTimeout(90);
}
await browser.close();
console.log(`frames com lasca: ${seenFlake} | frames com cacos: ${seenShard} | prints: ${shots}`);
