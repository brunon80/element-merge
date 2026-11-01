// Auditoria visual da ENCICLOPÉDIA inteira: destrava as espécies (lotes de 4,
// com uma partida nova entre lotes) e printa CADA CARD como o usuário vê — DOM +
// 3D junto (screenshot do elemento, que captura também o canvas do palco por
// cima). Cataloga erros/warnings do console e confere quantos contextos WebGL a
// página abriu. É o verificador da arquitetura de contexto único (iOS/WebKit).
//
// Uso: node qa/audit-bestiary.mjs [chromium|webkit] [saidaDir] [especie ...]
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';

const WHICH = process.argv[2] ?? 'webkit';
const OUT = process.argv[3] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\best';
const SPECIES = process.argv.slice(4);
const ALL = [
  'ignis', 'zephyr', 'golem', 'nereia', 'raio', 'madeira', 'magma', 'gelo',
  'vapor', 'areia', 'tempestade', 'obsidiana', 'pantano', 'plasma', 'nevoa', 'cristal',
];
const list = SPECIES.length ? SPECIES : ALL;
mkdirSync(OUT, { recursive: true });

const browser =
  WHICH === 'webkit' ? await webkit.launch() : await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
const page = await browser.newPage({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 2 });

const msgs = [];
const seen = new Set();
const keep = (s) => {
  const k = String(s).slice(0, 200);
  if (seen.has(k)) return;
  seen.add(k);
  msgs.push(k);
};
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) keep(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => keep(`pageerror: ${String(e.message ?? e)}`));

// clique via DOM: em viewport pequeno vários botões caem fora da dobra e o
// clique "acionável" do Playwright trava esperando
const tap = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.click();
  }, sel);

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(1600);
await tap('[data-testid="open-settings"]');
await page.waitForTimeout(300);
await tap('[data-testid="settings-tab-debug"]');
await page.waitForTimeout(200);
await tap('[data-testid="debug-toggle"]');
await tap('[data-testid="close-settings"]');

const canvases = () =>
  page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')];
    return list.map((c) => {
      const r = c.getBoundingClientRect();
      let alive = false;
      try {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        alive = !!gl && !gl.isContextLost();
      } catch {
        alive = false;
      }
      return { size: `${Math.round(r.width)}x${Math.round(r.height)}`, cls: c.className, alive };
    });
  });

await tap('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');

for (let i = 0; i < list.length; i += 4) {
  const batch = list.slice(i, i + 4);
  // destrava as espécies do lote (aparece o selo de descoberta: fecha)
  for (const id of batch) {
    await tap('[data-testid="open-bestiary"]');
    await page.waitForSelector('[data-testid="bestiary"]');
    await tap(`[data-testid="debug-spawn-${id}"]`);
    await page.waitForTimeout(450);
    if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
      await tap('[data-testid="discovery-close"]');
    await tap('[data-testid="close-bestiary"]');
    await page.waitForTimeout(250);
  }

  await tap('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  for (const id of batch) {
    const card = page.locator(`.beast-card:has([data-testid="debug-spawn-${id}"])`);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1100); // viewer monta + giro da vitrola
    await card.screenshot({ path: `${OUT}\\card-${id}.png` }).catch(() => {});
  }
  console.log(
    `lote ${batch.join(',')}: canvases=${JSON.stringify(await canvases())}`,
  );
  await tap('[data-testid="close-bestiary"]');
  await page.waitForTimeout(400);
  await tap('[data-testid="quit"]'); // partida nova p/ o próximo lote
  await page.waitForTimeout(900);
  await tap('[data-testid="play"]');
  await page.waitForSelector('[data-testid="shop"]').catch(() => {});
  await page.waitForTimeout(500);
}

await page.screenshot({ path: `${OUT}\\99-fim.png` });
console.log('CONSOLE:', msgs.length);
for (const m of msgs.slice(0, 30)) console.log('  ' + m);
await browser.close();
