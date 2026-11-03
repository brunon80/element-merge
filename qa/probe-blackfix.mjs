// VARREDURA DE BLOCO PRETO (a verdade visível): a única medição em que o bug é
// o que o usuário vê é o PRINT do WebKit — readPixels do back buffer é instável
// (preserveDrawingBuffer=false) e ler HalfFloat multisample é INVÁLIDO, então as
// sondas de buffer mentem. Esta sonda entra em combate, tira N prints e caça o
// retângulo preto eixo-alinhado em cada um (preto puro r,g,b<=6, corrida longa,
// coluna cheia no meio, preenchimento do bbox quase total — o buraco negro do
// próprio Primordial é redondo e fica de fora).
//
// Antes dos prints ela aplica uma CIRURGIA no pipeline pela alavanca dev
// `window.__QT` (nada do fonte é tocado) e o A/B é a taxa de frames com bloco.
// CIRURGIAS:
//   none        nada (linha de base do defeito)
//   msaa0       render targets do composer sem multisample
//   floatRT     render targets do composer em Float (sem teto de 65504)
//   bloomHalf   cadeia de mips do bloom com metades do tamanho (menos memória/
//               resolve — o bloom é upscale de qualquer jeito)
//   clamp       pass sanificante (NaN->0, negativo->0, teto 4096) depois do RenderPass
//   semcopia    pass de cópia desligado (o bloom despeja direto na tela)
//   nobloom     pass de bloom nunca ligado (controle negativo conhecido)
// Uso: node qa/probe-blackfix.mjs [especie] [webkit|chromium] [prints] [cirurgia]
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'primordial';
const engine = process.argv[3] ?? 'webkit';
const PRINTS = Number(process.argv[4] ?? 14);
const CIRURGIA = process.argv[5] ?? 'none';
const DPR = Number(process.env.QA_DPR ?? 2);
const OUT = process.argv[6] ?? `C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-blackfix-${CIRURGIA}-dpr${DPR}`;
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';

const { webkit, chromium } = await import('playwright');
const launch =
  engine === 'chromium'
    ? () =>
        chromium.launch({
          args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
        })
    : () => webkit.launch();

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 });
const msgs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`));

// caça o bloco preto no print composto, com o mesmo critério da varredura PowerShell
const findBlack = async () => {
  const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async (data) => {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const preto = (x, y) => {
      const i = (y * c.width + x) * 4;
      return px[i] <= 6 && px[i + 1] <= 6 && px[i + 2] <= 6;
    };
    let best = null;
    for (let y = 40; y < c.height - 40; y += 4) {
      let run = 0;
      let x0 = 0;
      for (let x = 40; x < c.width - 40; x += 3) {
        if (preto(x, y)) {
          if (run === 0) x0 = x;
          run++;
        } else {
          if (run > 60) {
            const wpx = run * 3;
            if (!best || wpx > best.w) best = { w: wpx, x0, x1: x };
          }
          run = 0;
        }
      }
    }
    if (!best) return null;
    const xm = (best.x0 + best.x1) >> 1;
    let hmax = 0, ytop = 0, runY = 0;
    for (let y = 0; y < c.height; y++) {
      if (preto(xm, y)) { if (runY === 0) ytop = y; runY++; if (runY > hmax) hmax = runY; }
      else runY = 0;
    }
    let dentro = 0, total = 0;
    for (let y = ytop; y <= ytop + hmax; y += 6)
      for (let x = best.x0; x <= best.x1; x += 6) { total++; if (preto(x, y)) dentro++; }
    const fill = total ? dentro / total : 0;
    const solido = best.w * hmax > 40000 && fill > 0.85 && hmax > best.w * 0.15;
    return { w: best.w, h: hmax, x0: best.x0, y0: ytop, fill: +fill.toFixed(2), solido, print: [c.width, c.height] };
  }, b64);
};

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');

const closeBestiary = async () => {
  if (await page.locator('[data-testid="close-bestiary"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="close-bestiary"]');
    await page.waitForTimeout(400);
  }
};
const spawn = async (id) => {
  await closeBestiary();
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(700);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
    await page.click('[data-testid="discovery-close"]');
  await closeBestiary();
};
await spawn(sp);
await spawn('golem');

// ---- a cirurgia ----------
const cir = await page.evaluate((nome) => {
  const Q = window.__QT;
  if (!Q) return { err: 'sem __QT' };
  const T = Q.THREE;
  const C = Q.composer;
  const bloom = C.passes.find((p) => p.nMips !== undefined);
  const renderPass = C.passes[0];
  const copyPass = C.passes[C.passes.length - 1];
  const rts = [C.renderTarget1, C.renderTarget2];
  const antes = {
    samples: rts.map((r) => r.samples),
    type: rts.map((r) => String(r.texture.type)),
    mips: bloom.renderTargetsHorizontal.map((r) => [r.width, r.height]),
    bright: [bloom.renderTargetBright.width, bloom.renderTargetBright.height],
    copia: copyPass.enabled,
  };
  if (nome === 'msaa0') {
    for (const rt of rts) {
      rt.samples = 0;
      rt.dispose();
    }
  } else if (nome === 'floatRT') {
    for (const rt of rts) {
      rt.texture.type = T.FloatType;
      rt.dispose();
    }
  } else if (nome === 'bloomHalf') {
    const w = bloom.renderTargetBright.width;
    const h = bloom.renderTargetBright.height;
    bloom.setSize(Math.max(8, w / 2), Math.max(8, h / 2));
  } else if (nome === 'clamp') {
    const SP = copyPass.constructor;
    const V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
    const pass = new SP({
      name: 'qtClamp',
      uniforms: { tDiffuse: { value: null }, uTeto: { value: 4096 } },
      vertexShader: V,
      fragmentShader:
        'uniform sampler2D tDiffuse; uniform float uTeto; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 r = mix(vec3(0.0), c.rgb, vec3(greaterThanEqual(c.rgb, vec3(0.0)))); gl_FragColor = vec4(min(r, vec3(uTeto)), c.a); }',
    });
    C.insertPass(pass, 1);
  } else if (nome === 'semcopia') {
    copyPass.enabled = false;
  } else if (nome === 'resolve') {
    // mantém o MSAA no RenderPass, mas o bloom só mexe num buffer SEM
    // multisample: um pass de cópia logo depois do RenderPass resolve o
    // multisample numa vez só (o caminho que o gelo já usa e é limpo) e o
    // UnrealBloomPass passa a compor num buffer simples
    const rt2 = C.renderTarget2;
    rt2.samples = 0;
    rt2.texture.samples = 0;
    rt2.dispose();
    const SP = copyPass.constructor;
    const V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
    C.insertPass(
      new SP({
        name: 'qtResolve',
        uniforms: { tDiffuse: { value: null } },
        vertexShader: V,
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
      }),
      1,
    );
  } else if (nome === 'nobloom') {
    bloom.enabled = false;
  }
  const depois = {
    samples: rts.map((r) => r.samples),
    type: rts.map((r) => String(r.texture.type)),
    mips: bloom.renderTargetsHorizontal.map((r) => [r.width, r.height]),
    bright: [bloom.renderTargetBright.width, bloom.renderTargetBright.height],
    copia: copyPass.enabled,
    bloomOn: bloom.enabled,
    forcas: C.passes.map((p) => `${p.name || p.constructor.name}:${p.enabled ? 'on' : 'off'}`),
  };
  return { antes, depois };
}, CIRURGIA);
console.log(`CIRURGIA ${CIRURGIA}:`, JSON.stringify(cir, null, 1));

await page.click('[data-testid="start-battle"]');
let comBloco = 0;
const blocos = [];
for (let i = 0; i < PRINTS; i++) {
  const b = await findBlack();
  const solido = !!(b && b.solido);
  if (solido) comBloco++;
  if (b) {
    blocos.push(b);
    await page.screenshot({ path: `${OUT}\\luta-${String(i).padStart(2, '0')}.png` });
  }
  await page.waitForTimeout(150);
}
console.log(
  `\n[${CIRURGIA}] ${engine}: ${comBloco}/${PRINTS} prints com BLOCO PRETO sólido` +
    (blocos.length ? ` | maiores: ${blocos.map((b) => `${b.w}x${b.h}${b.solido ? '' : '?'}`).join(' ')}` : ''),
);
console.log('CONSOLE:', msgs.length);
for (const m of msgs.slice(0, 15)) console.log('  ' + m);
await browser.close();
