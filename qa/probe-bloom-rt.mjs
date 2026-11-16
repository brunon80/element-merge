// diagnóstico do bloom individual: lê os RTs HalfFloat da cadeia mb via __QT.stack
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/element-merge/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
const click = async (sel) => {
  const el = page.locator(sel);
  if (await el.count()) await el.click();
};
await click('[data-testid="open-settings"]');
await click('[data-testid="settings-tab-debug"]');
await click('[data-testid="debug-toggle"]');
await click('[data-testid="close-settings"]');
await click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
if (await page.locator('[data-testid="tutorial-skip"]').count())
  await click('[data-testid="tutorial-skip"]');
await page.waitForTimeout(400);
await click('[data-testid="open-bestiary"]');
await page.waitForTimeout(600);
await click('[data-testid="debug-spawn-ignis"]');
await page.waitForTimeout(2000); // muitos frames com a cadeia rodando (dose padrão 30)

const diag = await page.evaluate(() => {
  const QT = window.__QT;
  if (!QT) return { err: 'sem __QT' };
  const { gl, scene, camera, stack, THREE } = QT;
  const h2f = (v) => {
    const s = v & 0x8000 ? -1 : 1;
    const e = (v >> 10) & 0x1f;
    const f = v & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  };
  const grab = (rt) => {
    const w = rt.width, h = rt.height;
    const buf = new Uint16Array(w * h * 4);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    let nz = 0, sum = 0, max = 0, n = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = h2f(buf[i]), g = h2f(buf[i + 1]), b = h2f(buf[i + 2]);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
      if (L > 0.01) nz++;
      sum += L;
      if (L > max) max = L;
    }
    return { px: n, nz, media: +(sum / n).toFixed(4), max: +max.toFixed(3) };
  };
  // quantos nós têm algum bit 2..31 (banco de unidades)?
  let unitBits = 0;
  const masks = new Set();
  scene.traverse((o) => {
    if (o.material && !o.isLight && o.layers.mask >>> 2 !== 0) {
      unitBits++;
      masks.add(o.layers.mask);
    }
  });
  return {
    capture: grab(stack.mbCapture),
    source: grab(stack.mbSource),
    bloomed: grab(stack.mbBloomTarget),
    sceneBuf1: (() => { try { return grab(stack.composer.renderTarget1); } catch (e) { return String(e); } })(),
    sceneBuf2: (() => { try { return grab(stack.composer.renderTarget2); } catch (e) { return String(e); } })(),
    unitBits,
    masks: [...masks].slice(0, 12),
    camMask: camera.layers.mask,
    mbStrength: stack.mbBloom.strength,
    mbScale: stack.mbComposite.uniforms.uMonsterScale.value,
    compActive: (() => {
      try { return stack.mbComposite.enabled; } catch { return '?'; }
    })(),
  };
});
console.log(JSON.stringify(diag, null, 1));
await browser.close();
