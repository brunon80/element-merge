// screenshot do viewer de malha (4 vistas, `mesh-viewer.html` na raiz) via
// chromium/swiftshader. Uso: node qa/mesh-viewer-shot.mjs [src] [outDir]
import { chromium } from 'playwright';
const src = process.argv[2] ?? './src/models/water/water_model_lvl1.glb';
const out = process.argv[3] ?? '/tmp/opencode/shots-mesh';
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:5173/element-merge/water-viewer.html?src=${encodeURIComponent(src)}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.title === 'ok', null, { timeout: 60000 });
await page.screenshot({ path: `${out}/views.png` });
console.log('ok ->', `${out}/views.png`);
await browser.close();
