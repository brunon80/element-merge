// Inspeção visual de UMA espécie via Playwright (o ciclo de melhoria de
// aparência): debug on → spawn debug → close no viewer do bestiário (câmera
// na FRENTE do modelo; clique sem arrasto = demo de arremesso) → arena (órbita
// 180° + zoom) → rajada de combate (pose de arremesso, projétil, impacto).
// Erros/warnings de shader aparecem no console — é o vereditor de compilação.
// Uso: node .scratch/inspect-species.mjs <especie> [especieAliada] [saidaDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

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
page.on('dialog', (d) => d.dismiss().catch(() => {})); // dialog nativo trava o screenshot inteiro

// Screenshot SEM as esperas do Playwright: nem "element to be stable" (carta do
// bestiário pulsa em CSS; o dpr adaptativo do R3F redimensiona o canvas sob
// swiftshader) nem o raster do compositor (page.screenshot a seco também TRAVA
// 30 s no headless). Captura direto pelo CDP num session dedicado, com o clip
// em CSS-px (escala 1 = o que a tela mostra).
const cdp = await page.context().newCDPSession(page);
const shoot = async (path, bb) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip: { x: bb.x, y: bb.y, width: bb.width, height: bb.height, scale: 1 },
      });
      await writeFile(path, Buffer.from(data, 'base64'));
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.waitForTimeout(400 * attempt);
    }
  }
};

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
// o tutorial BLOQUEIA o debug-spawn (gateTutorial: `debug` nunca passa com
// passo ativo) — contexto limpo do Playwright SEMPRE inicia o tutorial, então
// pule quando ele aparecer (lição do qa/probe-footprint.mjs)
if (await page.locator('[data-testid="tutorial-skip"]').count())
  await page.click('[data-testid="tutorial-skip"]');

await spawn(sp);
if (ally && ally !== sp) await spawn(ally);
await page.waitForTimeout(2200);

const canvas = page.locator('canvas').first();
// o `dpr` adaptativo do R3F redimensiona o canvas da arena sem parar (fps baixo
// no swiftshader/headless) → screenshot de ELEMENTO nunca acha estabilidade;
// captura CDP pelo recorte da caixa, sem espera
const shootCanvas = async (name) => {
  await shoot(`${OUT}\\${sp}-${name}.png`, await canvas.boundingBox());
};
await shootCanvas('idle');

// close no bestiário (reabre): o card é uma JANELA do palco único de contexto
// (BestiaryStage) — o print do elemento pega o 3D por cima do DOM; clique SEM
// arrasto na caixa dispara a demo de ataque
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
const card = page.locator(`.beast-card:has([data-testid="debug-spawn-${sp}"])`);
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(1600); // viewer monta (IntersectionObserver)
const viewer = card.locator('.beast-card-model');
// screenshot do ELEMENTO trava em "element to be stable" quando a carta recém-
// descoberta pulsa em CSS (a caixa nunca assenta) — captura CDP pelo recorte
// da caixa, sem espera de estabilidade
const shootViewer = async (name) => {
  await shoot(`${OUT}\\${sp}-${name}.png`, await viewer.boundingBox());
};
await shootViewer('view-1');
const vb = await viewer.boundingBox();
await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(320); // windup
await shootViewer('view-windup');
await page.waitForTimeout(260); // arremesso
await shootViewer('view-release');
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
await shootCanvas('front');
await page.mouse.wheel(0, -800);
await page.waitForTimeout(900);
await shootCanvas('macro');

// rajada rápida: pose de arremesso, projétil em voo e estilhaço no alvo
await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(1400);
for (let i = 0; i < 40; i++) {
  await shootCanvas(`b-${String(i).padStart(2, '0')}`);
  await page.waitForTimeout(150);
}

await browser.close();
console.log(`shots de ${sp} em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 40).join('\n') : 'SEM ERROS/WARNINGS no console');
