// variação RÁPIDA do probe-impact: JPEG do viewport inteiro (codifica ~4x mais
// rápido que PNG no SwiftShader, ~2-3 frames/s) e ~150 frames sem espera. Alvo:
// pegar o voo + a explosão do projétil da espécie, que dura ~1 s e escapa do
// sampling de 1 s do probe normal.
// Precisa de ALIADA TANQUE: espécie com range curto para de atirar sem alvo ao
// alcance — sem tanque na frente, o print só mostra idle.
// Uso: node qa/probe-impact-fast.mjs <especie> [aliada] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'abissal';
const ally = process.argv[3] ?? 'golem'; // tanque na frente para o tiroteio não parar
const OUT = process.argv[4] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-impact-fast';
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
await spawn(ally);

// zoom para FORA: o campo inteiro no enquadre (projétil atravessa a arena)
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
await page.mouse.wheel(0, 2400);
await page.waitForTimeout(1200);

await page.click('[data-testid="start-battle"]');

for (let i = 0; i < 150; i++) {
  await page.screenshot({ path: `${OUT}\\f-${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 55 });
}
await browser.close();
console.log(`fast impact shots de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 20).join('\n') : 'SEM ERROS/WARNINGS no console');
