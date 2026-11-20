// 4-view do viewer p/ os 6 GLBs novos (reusa um só chromium).
// Uso: node qa/mesh6-shot.mjs  -> /tmp/opencode/shots7/<name>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/opencode/shots7';
mkdirSync(OUT, { recursive: true });
const MODELS = ['crystal', 'haze', 'obsidian', 'pantano', 'plasma', 'storm'];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
for (const m of MODELS) {
  const src = `./src/models/${m}/${m}.glb`;
  page.on('pageerror', (e) => console.log(`${m} pageerror:`, e.message));
  await page.goto(
    `http://localhost:5173/element-merge/mesh-viewer.html?src=${encodeURIComponent(src)}`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(() => document.title === 'ok', null, { timeout: 90000 });
  await page.screenshot({ path: `${OUT}/${m}.png` });
  console.log('ok', m, '->', `${OUT}/${m}.png`);
}
await browser.close();
