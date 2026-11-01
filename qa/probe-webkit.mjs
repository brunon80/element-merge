// Sonda WebKit (o motor do iOS Safari): WebGL2 disponível? GLSL compila?
// Erros de shader aparecem no console — é o verificador de compatibilidade
// mais perto do iPhone que dá rodar nesta máquina.
// Uso: node qa/probe-webkit.mjs [saidaDir]
import { webkit } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\webkit';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/';

const browser = await webkit.launch(); // sem flags: o mais perto do iOS real
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });

const msgs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') msgs.push(`[${t}] ${m.text().slice(0, 400)}`);
});
page.on('pageerror', (e) => msgs.push(`[pageerror] ${String(e).slice(0, 400)}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const caps = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl2 = c.getContext('webgl2');
  const gl1 = gl2 ? null : document.createElement('canvas').getContext('webgl');
  const gl = gl2 ?? gl1;
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const canvas = document.querySelector('canvas');
  return {
    webgl2: !!gl2,
    renderer: gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null,
    maxTex: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
    maxFragUniforms: gl ? gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) : 0,
    maxVertUniforms: gl ? gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) : 0,
    maxTexUnits: gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : 0,
    maxVaryings: gl ? gl.getParameter(gl.MAX_VARYING_VECTORS) : 0,
    derivatives: !!(gl && (gl2 || gl.getExtension('OES_standard_derivatives'))),
    halfFloat: !!(gl && (gl2 ? gl.getExtension('EXT_color_buffer_float') : gl.getExtension('EXT_color_buffer_half_float'))),
    ua: navigator.userAgent,
    canvasInDom: !!canvas,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
  };
});
console.log('CAPS', JSON.stringify(caps, null, 1));

// tenta ler de volta o que o canvas realmente desenhou (preto = shader morto)
await page.waitForTimeout(1500);
const shot = await page.screenshot({ path: `${OUT}\\webkit-menu.png` });
const px = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { err: 'sem canvas' };
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { err: 'sem contexto no canvas' };
  const w = canvas.width, h = canvas.height;
  const buf = new Uint8Array(4 * 9);
  let nonBg = 0, total = 0;
  // varre uma grade 12x12 no meio do canvas lida do framebuffer
  const full = new Uint8Array(4);
  for (let gy = 0; gy < 12; gy++)
    for (let gx = 0; gx < 12; gx++) {
      const x = Math.floor((w * (gx + 0.5)) / 12);
      const y = Math.floor((h * (gy + 0.5)) / 12);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, full);
      total++;
      const r = full[0], g = full[1], b = full[2];
      // fundo #0b1020 (com flip y vira rgb(11,16,32) aproximado)
      if (!(r < 26 && g < 30 && b < 52)) nonBg++;
    }
  return { nonBg, total, ratio: +(nonBg / total).toFixed(3) };
});
console.log('PIX', JSON.stringify(px));
console.log('CONSOLE:', msgs.length);
for (const m of msgs.slice(0, 40)) console.log('  ' + m);
await browser.close();
