// captura o FX de IMPACTO: o tabuleiro INIMIGO fica FORA do enquadre padrão
// (a câmera default corta as fileiras de trás), então aqui a câmera dá zoom
// PARA FORA antes do combate e os 44 frames de 140 ms pegam o voo + a
// explosão do projétil no alvo. Uso:
//   node qa/probe-impact.mjs <especie> [aliada] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'geodo';
const ally = process.argv[3] ?? 'golem';
const OUT = process.argv[4] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-impact';
mkdirSync(OUT, { recursive: true });

const msgs = [];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

const spawn = async (id) => {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(500);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="discovery-close"]');
  }
};

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
await spawn(sp);
if (ally && ally !== sp) await spawn(ally);
await page.waitForTimeout(2000);

// zoom para FORA: o campo inimigo inteiro entra no enquadre
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
await page.mouse.wheel(0, 2400);
await page.waitForTimeout(1200);
await canvas.screenshot({ path: `${OUT}\\wide-0.png` });

await page.click('[data-testid="start-battle"]');
for (let i = 0; i < 44; i++) {
  await canvas.screenshot({ path: `${OUT}\\i-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(140);
}
await browser.close();
console.log(`impact shots de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 20).join('\n') : 'SEM ERROS/WARNINGS no console');
