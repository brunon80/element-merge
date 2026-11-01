// Bissecção do WIND_FRAG no vento da areia: aplica variantes do fragment
// (desligando uma linha de cada vez) e tira um print por variante.
// Uso: node qa/probe-veil2.mjs [saidaDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\probe2';
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
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
await page.click('[data-testid="debug-spawn-areia"]');
await page.waitForTimeout(600);
if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="discovery-close"]');
}
await page.waitForTimeout(2500);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -1400);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}\\v00-base.png` });

const variants = {
  // A: tira o flash de dano (mix branco)
  v01-no-flash: (fs) => fs.replace('col = mix(vec3(1.0), col, uHurt * 0.45);', ''),
  // B: rim zerado (tira o halo de borda clara)
  v02-no-rimlight: (fs) => fs.replace('col += uHot * rim * 0.35;', ''),
  // C: heat sem o termo do band (sem fitas)
  v03-no-bandheat: (fs) => fs.replace('band * 0.45 + ', ''),
  // D: alfa sem rim (mata o aro luminoso do funil)
  v04-no-rimalpha: (fs) => fs.replace(' + 0.6 * rim', ''),
  // E: alfa capado em 0.85 (anti-acúmulo)
  v05-alpha-cap: (fs) => fs.replace('a *= uAlphaMul * uAlpha;', 'a = min(a, 0.85); a *= uAlphaMul * uAlpha;'),
  // F: só cor flat do mid (sem mix de hot)
  v06-flat-mid: (fs) => fs.replace('col = mix(col, uHot, smoothstep(0.74, 1.0, heat) * 0.85);', ''),
};

await page.evaluate(() => {
  const scene = (window.__threeRs || []).find((s) => s && s.isScene);
  window.__probe = scene;
});

for (const [name, fn] of Object.entries(variants)) {
  const n = await page.evaluate(fnBody, { fn: fn.toString() });
  console.log(name, 'mats:', n);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
}

async function fnBody({ fn }) {
  const f = eval('(' + fn + ')');
  let n = 0;
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin')) {
        if (!m.userData.__orig) m.userData.__orig = m.fragmentShader;
        m.fragmentShader = f(m.userData.__orig);
        m.needsUpdate = true;
        n++;
      }
    }
  });
  return n;
}

await browser.close();
console.log('probe2 em', OUT);
