// Inspeção visual em WEBKIT (o motor do iOS Safari): mesmo roteiro do
// inspect-species, mas no navegador que compila GLSL como o iPhone. Se um
// shader quebra só no iOS, é aqui que ele aparece (console + print preto).
// Uso: node qa/inspect-webkit.mjs <especie> [aliada] [saidaDir]
import { webkit } from 'playwright';
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'gelo';
const ally = process.argv[3] ?? 'golem';
const OUT = process.argv[4] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-webkit';
mkdirSync(OUT, { recursive: true });

const msgs = [];
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text().slice(0, 500)}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${String(e.message ?? e).slice(0, 500)}`));

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
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
  await page.waitForTimeout(700);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
    await page.click('[data-testid="discovery-close"]');
};

await spawn(sp);
if (ally && ally !== sp) await spawn(ally);
await page.waitForTimeout(2500);

const canvas = page.locator('canvas').first();
await canvas.screenshot({ path: `${OUT}\\${sp}-idle.png` });

// viewer do bestiário (câmera frontal) + demo de arremesso
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
const card = page.locator(`.beast-card:has([data-testid="debug-spawn-${sp}"])`);
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(1800);
const viewer = card.locator('.beast-card-model');
await viewer.screenshot({ path: `${OUT}\\${sp}-view-1.png` });
const vb = await viewer.boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(340);
await viewer.screenshot({ path: `${OUT}\\${sp}-view-windup.png` });
await page.waitForTimeout(280);
await viewer.screenshot({ path: `${OUT}\\${sp}-view-release.png` });
await page.click('[data-testid="close-bestiary"]');
await page.waitForTimeout(500);

// zoom na arena (roda, sem clique no tabuleiro)
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
await page.mouse.wheel(0, -700);
await page.waitForTimeout(1200);
await canvas.screenshot({ path: `${OUT}\\${sp}-front.png` });
await page.mouse.wheel(0, -700);
await page.waitForTimeout(1000);
await canvas.screenshot({ path: `${OUT}\\${sp}-macro.png` });

// combate: projétil + impacto
await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(1500);
for (let i = 0; i < 12; i++) {
  await canvas.screenshot({ path: `${OUT}\\${sp}-b-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(160);
}

// quantos pixels têm cor de material (nada de shader preto/magenta)
const stats = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return { ctx: !!gl, w: c.width, h: c.height };
});
console.log('CANVAS', JSON.stringify(stats));
await browser.close();
console.log(`shots webkit de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 40).join('\n') : 'SEM ERROS/WARNINGS no console');
