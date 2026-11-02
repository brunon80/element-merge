// close-up DEDICADO da frente: spawna a espécie (+aliada), ORBITA a câmera até a
// frente do modelo e dá zoom; depois captura o combate inteiro (afinação,
// goela/bochecha abrindo, projétil em voo). A câmera padrão da arena olha a
// COSTAS das unidades — a frente só aparece orbitando (o ângulo bom ~155° pra
// espécies plantadas de frente p/ +Z) e nos frames de COMBATE (a unidade vira
// pro alvo). Uso:
//   node qa/probe-front.mjs <especie> [aliada] [outDir] [graus]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'geodo';
const ally = process.argv[3] ?? 'golem';
const OUT = process.argv[4] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-front';
const deg = Number(process.argv[5] ?? 155);
mkdirSync(OUT, { recursive: true });

const msgs = [];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

const spawn = async (id) => {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(600);
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
await page.waitForTimeout(2400);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
const cy = box.y + box.height * 0.45;
// orbita até a frente do modelo (arrasto: ângulo = 2π·dx/altura do viewport)
const dx = Math.round(((deg * Math.PI) / 180) * box.height / (2 * Math.PI));
await page.mouse.move(box.x + 120, cy);
await page.mouse.down();
await page.mouse.move(box.x + 120 + dx, cy, { steps: 18 });
await page.mouse.up();
await page.mouse.wheel(0, -1100);
await page.waitForTimeout(1200);
await canvas.screenshot({ path: `${OUT}\\${sp}-face-closed.png` });

// afinação/arremesso: o combate mesmo (o card não dá zoom no modelo)
await page.click('[data-testid="start-battle"]');
for (let i = 0; i < 30; i++) {
  await canvas.screenshot({ path: `${OUT}\\${sp}-f-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(150);
}
await browser.close();
console.log(`front shots de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 20).join('\n') : 'SEM ERROS/WARNINGS no console');
