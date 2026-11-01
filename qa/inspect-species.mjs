// Inspeção visual de UMA espécie via Playwright (o ciclo de melhoria de
// aparência): debug on → spawn debug → close no viewer do bestiário (câmera
// na FRENTE do modelo; clique sem arrasto = demo de arremesso) → arena (órbita
// 180° + zoom) → rajada de combate (pose de arremesso, projétil, impacto).
// Erros/warnings de shader aparecem no console — é o vereditor de compilação.
// Uso: node .scratch/inspect-species.mjs <especie> [especieAliada] [saidaDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const sp = process.argv[2];
const ally = process.argv[3] ?? 'golem'; // tanque p/ a luta durar
const OUT = process.argv[4] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots';
if (!sp) {
  console.error('uso: node inspect-species.mjs <especie> [aliada] [saida]');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const msgs = [];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text()}`);
  else if (process.env.QA_LOG && m.text().includes(process.env.QA_LOG)) console.log(m.text());
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
await page.waitForTimeout(2200);

const canvas = page.locator('canvas').first();
await canvas.screenshot({ path: `${OUT}\\${sp}-idle.png` });

// close no bestiário (reabre): o card é uma JANELA do palco único de contexto
// (BestiaryStage) — o print do elemento pega o 3D por cima do DOM; clique SEM
// arrasto na caixa dispara a demo de ataque
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
const card = page.locator(`.beast-card:has([data-testid="debug-spawn-${sp}"])`);
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(1600); // viewer monta (IntersectionObserver)
const viewer = card.locator('.beast-card-model');
await viewer.screenshot({ path: `${OUT}\\${sp}-view-1.png` });
const vb = await viewer.boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(320); // windup
await viewer.screenshot({ path: `${OUT}\\${sp}-view-windup.png` });
await page.waitForTimeout(260); // arremesso
await viewer.screenshot({ path: `${OUT}\\${sp}-view-release.png` });
await page.click('[data-testid="close-bestiary"]');
await page.waitForTimeout(400);

// órbita ~180° (arrasto horizontal: ângulo = 2π*dx/altura) + zoom
const box = await canvas.boundingBox();
const cy = box.y + box.height * 0.45;
await page.mouse.move(box.x + 120, cy);
await page.mouse.down();
await page.mouse.move(box.x + 120 + box.height / 2, cy, { steps: 16 });
await page.mouse.up();
await page.mouse.wheel(0, -600);
await page.waitForTimeout(1000);
await canvas.screenshot({ path: `${OUT}\\${sp}-front.png` });
await page.mouse.wheel(0, -800);
await page.waitForTimeout(900);
await canvas.screenshot({ path: `${OUT}\\${sp}-macro.png` });

// rajada rápida: pose de arremesso, projétil em voo e estilhaço no alvo
await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(1400);
for (let i = 0; i < 40; i++) {
  await canvas.screenshot({ path: `${OUT}\\${sp}-b-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(150);
}

await browser.close();
console.log(`shots de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 40).join('\n') : 'SEM ERROS/WARNINGS no console');
