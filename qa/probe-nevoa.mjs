// Sonda de depuração da Névoa: captura o voo da PLUMA DE BRUMA (instância do
// material de nuvem glacial uCool #eef5fb / seed 4,9) e o estouro da SEMENTE
// DE GEADA (crack #d2e9f4) + os cacos de gelo do impacto (iceA #f4faff).
// Uso: node qa/probe-nevoa.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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
await spawn('nevoa');
await spawn('golem');
await page.waitForTimeout(1500);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -700);
await page.waitForTimeout(800);

const poll = () =>
  page.evaluate(() => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    let plume = 0;
    let plumeAt = null;
    let shards = 0;
    let shardsAt = null;
    let shardInfo = null;
    scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const m = ms[0];
      if (o.isInstancedMesh && m?.uniforms?.uCool?.value?.getHexString?.() === 'eef5fb'
        && m?.uniforms?.uSeed?.value === 4.9) {
        plume = o.count;
        if (o.count > 0) {
          const a = o.instanceMatrix.array;
          plumeAt = [+a[12].toFixed(2), +a[13].toFixed(2), +a[14].toFixed(2)];
        }
      }
      const geo = o.geometry;
      if (
        o.isMesh &&
        o.visible &&
        geo?.type === 'OctahedronGeometry' &&
        geo.parameters?.radius === 0.5 &&
        geo.parameters?.detail === 0 &&
        m?.uniforms?.uIceA?.value?.getHexString?.() === 'f4faff'
      ) {
        shards++;
        const e = o.matrixWorld.elements;
        shardsAt = [+e[12].toFixed(2), +e[13].toFixed(2), +e[14].toFixed(2)];
        shardInfo = {
          scale: [
            +Math.hypot(e[0], e[1], e[2]).toFixed(3),
            +Math.hypot(e[4], e[5], e[6]).toFixed(3),
            +Math.hypot(e[8], e[9], e[10]).toFixed(3),
          ],
          alpha: m.uniforms?.uAlpha?.value,
          env: !!m.uniforms?.uEnv?.value,
        };
      }
    });
    return { plume, plumeAt, shards, shardsAt, shardInfo };
  });

// zoom de trabalho ANTES da luta (igual ao laço principal: roda o scroll no
// MEIO do canvas — sem clique, que na preparação agarra unidade/seleção)
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -560);
await page.waitForTimeout(500);

await page.click('[data-testid="start-battle"]');
let shots = 0;
let plumeShots = 0;
let shardShots = 0;
let seenPlume = 0;
let seenShard = 0;
for (let i = 0; i < 150 && shots < 8; i++) {
  const s = await poll();
  if (s.plume > 0) seenPlume++;
  if (s.shards > 0) seenShard++;
  const wantShard = s.shards > 0 && shardShots < 4;
  const wantPlume = s.plume > 0 && plumeShots < 4;
  if (wantShard || wantPlume) {
    await canvas.screenshot({ path: `${OUT}\\nevoa-${String(shots).padStart(2, '0')}.png` });
    console.log(
      `shot ${shots} ${wantShard ? 'CACOS' : 'pluma'} plume=${s.plume}@${JSON.stringify(s.plumeAt)} cacos=${s.shards}@${JSON.stringify(s.shardsAt)} info=${JSON.stringify(s.shardInfo)}`,
    );
    if (wantShard) shardShots++;
    else plumeShots++;
    shots++;
  }
  if (i % 15 === 0) console.log(`t${i} plume=${s.plume} cacos=${s.shards}`);
  await page.waitForTimeout(70);
}
await browser.close();
console.log(`frames com pluma: ${seenPlume} | frames com cacos: ${seenShard} | prints: ${shots}`);
