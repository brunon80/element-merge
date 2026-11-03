// O RETÂNGULO PRETO NASCE EM QUAL PASS? Esta sonda CONGELA o pipeline e aí mede
// a mesma imagem por três canais, sem que nenhum frame novo entre no meio:
//
//   1. o PRINT da página  -> a verdade visível (o retângulo preto do usuário);
//   2. a cópia do `renderTarget1` (a cena HDR já resolvida do multisample);
//   3. a cópia do `renderTarget2` (a cena depois do bloom).
//
// O congelamento é um `composer.render` embrulhado: a janela segue rodando, mas
// nenhum GL novo é desenhado — o canvas continua mostrando o último frame
// apresentado. Assim o print e as leituras dos buffers falam do MESMO frame.
//
// O que cada leitura é: os render targets do composer são HalfFloat (e o 1 é
// multisample), então `readPixels` direto neles é inválido/instável. A sonda
// amostra a TEXTURA do buffer num quad de tela-cheia e grava num RGBA8 pequeno
// — readback de RGBA8 simples é sempre válido. Preto EXATO (0,0,0) num HalfFloat
// significa "texel zerado": nunca foi escrito, ou foi escrito por algo que
// escreveu preto. O fundo da arena é #0b1020 (11,16,32) cru, então o fundo da
// arena NUNCA é contado como preto — o que sobra é o defeito.
//
// Leitura do resultado:
//   print tem bloco + rt2 tem bloco + rt1 limpo  -> o veneno entra no bloom/resolve
//   rt1 tem bloco                                 -> a cena já chega preta (RenderPass)
//   print tem bloco + rt1 e rt2 limpos            -> o problema é a camada do
//                                                    canvas (composição/alpha), não o GL
//
// Uso: node qa/probe-frozen.mjs [especie] [webkit|chromium] [tentativas] [framesPorTentativa]
import { mkdirSync, writeFileSync } from 'node:fs';

const sp = process.argv[2] ?? 'primordial';
const engine = process.argv[3] ?? 'webkit';
const TENTATIVAS = Number(process.argv[4] ?? 18);
const FRAME_MS = Number(process.argv[5] ?? 120);
const OUT = `C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-frozen-${engine}`;
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';
mkdirSync(OUT, { recursive: true });

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

// bloco preto no PRINT: preto puro, corrida horizontal longa, coluna cheia no
// meio do bbox e bbox quase todo preto (o buraco negro do Primordial é redondo)
const printBloco = async () => {
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
    if (!best) return { print: [c.width, c.height], bloco: null };
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
    return { print: [c.width, c.height], bloco: { w: best.w, h: hmax, x0: best.x0, y0: ytop, fill: +fill.toFixed(2), solido } };
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

const montou = await page.evaluate(() => {
  const Q = window.__QT;
  if (!Q) return { err: 'sem __QT (cabo dev do BloomGate)' };
  const T = Q.THREE;
  const gl = Q.gl;
  const C = Q.composer;
  const H = (window.__QTH = window.__QTH || {});

  // ---- o congelador: a janela roda, o composer não desenha nada novo ----
  if (!C.__qtRender) {
    C.__qtRender = C.render.bind(C);
    C.render = function (dt) {
      if (H.frozen) return;
      return C.__qtRender(dt);
    };
  }
  H.frozen = false;

  // ---- quad de tela-cheia que só copia (clamp) a textura de um render target ----
  const mat = new T.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader:
      'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 r = min(max(c.rgb, vec3(0.0)), vec3(1.0)); gl_FragColor = vec4(r, 1.0); }',
    depthTest: false,
    depthWrite: false,
  });
  const sc = new T.Scene();
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  sc.add(mesh);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const size = gl.getSize(new T.Vector2());
  const dpr = gl.getPixelRatio();
  const rw = Math.max(64, Math.round(size.x * dpr * 0.5));
  const rh = Math.max(64, Math.round(size.y * dpr * 0.5));
  if (H.rt8) H.rt8.dispose();
  H.rt8 = new T.WebGLRenderTarget(rw, rh, {
    type: T.UnsignedByteType,
    depthBuffer: false,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
  });
  const buf = new Uint8Array(rw * rh * 4);

  // mede o preto EXATO no RGBA8 copiado do buffer (a arena é #0b1020, nunca preta)
  H.olhar = (rt) => {
    const prev = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    mat.uniforms.tDiffuse.value = rt.texture;
    gl.setRenderTarget(H.rt8);
    gl.autoClear = true;
    gl.render(sc, cam);
    gl.autoClear = prevAuto;
    gl.readRenderTargetPixels(H.rt8, 0, 0, rw, rh, buf);
    gl.setRenderTarget(prev);
    let zero = 0;
    let mx0 = 1e9, mx1 = -1, my0 = 1e9, my1 = -1;
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) {
        const i = (y * rw + x) * 4;
        if (buf[i] > 3 || buf[i + 1] > 3 || buf[i + 2] > 3) continue;
        zero++;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
    return {
      rw, rh, total: rw * rh, zero,
      bbox: zero ? [mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1] : null,
    };
  };

  H.png = () => {
    const c = document.createElement('canvas');
    c.width = rw; c.height = rh;
    const g = c.getContext('2d');
    const img = g.createImageData(rw, rh);
    for (let y = 0; y < rh; y++) {
      const src = ((rh - 1 - y) * rw) * 4; // GL de baixo pra cima
      for (let x = 0; x < rw * 4; x++) img.data[y * rw * 4 + x] = buf[src + x];
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };

  // ---- leitura FLOAT exata: diz se o preto é "nunca escrito" (0 exato) ou
  //      "conteúdo escuro de verdade" (1e-5, 1e-4...) ----
  const matRaw = new T.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
    depthTest: false,
    depthWrite: false,
    blending: T.NoBlending, // senão o readback vem misturado com o que estava no rt32
  });
  const scRaw = new T.Scene();
  const meshRaw = new T.Mesh(new T.PlaneGeometry(2, 2), matRaw);
  meshRaw.frustumCulled = false;
  scRaw.add(meshRaw);
  const fw = Math.max(64, Math.round(size.x * dpr * 0.5));
  const fh = Math.max(64, Math.round(size.y * dpr * 0.5));
  if (H.rt32) H.rt32.dispose();
  H.rt32 = new T.WebGLRenderTarget(fw, fh, {
    format: T.RGBAFormat,
    type: T.FloatType,
    depthBuffer: false,
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
  });
  const fbuf = new Float32Array(fw * fh * 4);
  H.olharF = (rt) => {
    const prev = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    matRaw.uniforms.tDiffuse.value = rt.texture;
    gl.setRenderTarget(H.rt32);
    gl.autoClear = true;
    gl.render(scRaw, cam);
    gl.autoClear = prevAuto;
    let erro = 0;
    try {
      gl.readRenderTargetPixels(H.rt32, 0, 0, fw, fh, fbuf);
    } catch (e) {
      erro = 1;
    }
    gl.setRenderTarget(prev);
    let zerado = 0;
    let quase = 0;
    let maximo = -1;
    let amostraZ = 0;
    let somaAbs = 0;
    let nan = 0;
    let nx0 = 1e9, nx1 = -1, ny0 = 1e9, ny1 = -1;
    const nanExemplos = [];
    let mx0 = 1e9, mx1 = -1, my0 = 1e9, my1 = -1;
    for (let i = 0; i < fw * fh; i++) {
      const r = fbuf[i * 4];
      const g = fbuf[i * 4 + 1];
      const b = fbuf[i * 4 + 2];
      const a = fbuf[i * 4 + 3];
      if (!(r === r) || !(g === g) || !(b === b)) {
        nan++;
        const x = i % fw;
        const y = (i / fw) | 0;
        if (x < nx0) nx0 = x;
        if (x > nx1) nx1 = x;
        if (y < ny0) ny0 = y;
        if (y > ny1) ny1 = y;
        if (nanExemplos.length < 6)
          nanExemplos.push(`@${x},${y} (${r},${g},${b},a=${a}) rNaNum=${r === r ? '' : r < 0 ? '-NaN' : 'NaN'}`);
      }
      const m = Math.max(Math.abs(r), Math.abs(g), Math.abs(b));
      const x = i % fw;
      const y = (i / fw) | 0;
      if (r === 0 && g === 0 && b === 0) {
        zerado++;
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      } else if (m < 2e-3) quase++;
      if (m > maximo) maximo = m;
      if (i === 120 * fw + 300) amostraZ = a;
      somaAbs += Math.abs(a);
    }
    // dentro da caixa dos zeros: o MAIOR valor que aparece lá e uma amostra
    // exata no centro. 0 exato = nunca escrito/limpo; 1e-5 = conteúdo escuro
    let maxDentroCaixa = -1;
    const centro = [];
    if (mx1 >= mx0) {
      const cx = (mx0 + mx1) >> 1;
      const cy = (my0 + my1) >> 0;
      for (let y = my0; y <= my1; y += 3)
        for (let x = mx0; x <= mx1; x += 3) {
          const i = (y * fw + x) * 4;
          const m = Math.max(Math.abs(fbuf[i]), Math.abs(fbuf[i + 1]), Math.abs(fbuf[i + 2]));
          if (m > maxDentroCaixa) maxDentroCaixa = m;
        }
      for (const yy of [my0 + 4, cy, my1 - 4])
        for (const xx of [mx0 + 4, cx, mx1 - 4]) {
          const i = (yy * fw + xx) * 4;
          centro.push(`(${fbuf[i]},${fbuf[i + 1]},${fbuf[i + 2]},a=${fbuf[i + 3]})`);
        }
    }
    return {
      fw, fh, erro, nan, zerado, quase, total: fw * fh,
      maximoCor: +maximo.toFixed(6),
      alfaMedio: +(somaAbs / (fw * fh)).toFixed(4),
      alfaAmostra: amostraZ,
      caixaZeros: mx1 >= mx0 ? [mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1] : null,
      maxDentroDaCaixa: +maxDentroCaixa.toFixed(8),
      amostrasDentro: centro,
      nanCaixa: nx1 >= nx0 ? [nx0, ny0, nx1 - nx0 + 1, ny1 - ny0 + 1] : null,
      nanExemplos,
    };
  };

  const bloom = C.passes.find((p) => p.nMips !== undefined);
  H.bloom = bloom;
  const ficha = (rt) => ({
    amostras: rt.samples,
    tipo: String(rt.texture.type),
    w: rt.width,
    h: rt.height,
    depth: rt.depthBuffer,
    colorSpace: String(rt.texture.colorSpace),
  });
  return {
    passes: C.passes.map((p) => `${p.constructor.name}:${p.enabled ? 'on' : 'off'}${p.needsSwap ? '/swap' : ''}`),
    rt1: ficha(C.renderTarget1),
    rt2: ficha(C.renderTarget2),
    paridade: { read: C.readBuffer === C.renderTarget1 ? 'rt1' : 'rt2', write: C.writeBuffer === C.renderTarget1 ? 'rt1' : 'rt2' },
    bloom: bloom ? { strength: +bloom.strength.toFixed(3), enabled: bloom.enabled, threshold: bloom.threshold } : null,
    dpr,
    rw,
    rh,
    gl2: !!gl.capabilities.isWebGL2,
    extMS: (() => {
      const ctx = gl.getContext();
      return {
        multisampledRTV: !!ctx.getExtension('WEBGL_multisampled_render_to_texture'),
        antialias: gl.getContextAttributes().antialias,
      };
    })(),
  };
});
console.log('pipeline:', JSON.stringify(montou));
if (montou.err) {
  console.log('ABORTOU');
  await browser.close();
  process.exit(1);
}

await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(900);

let achados = 0;
const linhas = [];
for (let i = 0; i < TENTATIVAS; i++) {
  // roda alguns frames, congela, e aí mede tudo do MESMO frame
  await page.evaluate(() => (window.__QTH.frozen = false));
  await page.waitForTimeout(FRAME_MS);
  await page.evaluate(() => (window.__QTH.frozen = true));

  const p1 = await printBloco();
  const p2 = await printBloco(); // dois prints congelados: mesmo quadro?
  const r1 = await page.evaluate((comCadeia) => {
    const H = window.__QTH;
    const C = H.C ?? window.__QT.composer;
    const a = H.olhar(C.renderTarget1);
    const pa = H.png();
    const b = H.olhar(C.renderTarget2);
    const pb = H.png();
    const B = H.bloom;
    const br = H.olhar(B.renderTargetBright);
    const pbr = H.png();
    const m0 = H.olhar(B.renderTargetsHorizontal[0]);
    const pm0 = H.png();
    const f1 = H.olharF(C.renderTarget1);
    const f2 = H.olharF(C.renderTarget2);
    // Onde a caixa de NaN nasce na cadeia do bloom? O highpass pesca >limiar do
    // rt1, os borrões descem a escada de mips e o compósito volta pro rt2 — o
    // PRIMEIRO buffer da cadeia com a caixa já diz de onde ela vem
    const cadeia = [];
    if (comCadeia) {
      const B2 = H.bloom;
      const empurra = (nome, rt) => {
        const f = H.olharF(rt);
        cadeia.push({
          nome,
          tam: `${rt.width}x${rt.height}`,
          nan: f.nan,
          nanCaixa: f.nanCaixa, // bbox dos NaN (no tamanho daquele buffer)
          nanAmostras: f.nanExemplos,
        });
      };
      empurra('bright', B2.renderTargetBright);
      for (let i = 0; i < B2.renderTargetsHorizontal.length; i++) {
        empurra(`h[${i}]`, B2.renderTargetsHorizontal[i]);
        empurra(`v[${i}]`, B2.renderTargetsVertical[i]);
      }
    }
    return {
      rt1: a, png1: pa, rt2: b, png2: pb, bright: br, pngBright: pbr, mip0: m0, pngMip0: pm0,
      f1, f2, cadeia,
      paridade: { read: C.readBuffer === C.renderTarget1 ? 'rt1' : 'rt2' },
    };
  }, !!(p1.bloco && p1.bloco.solido));

  const solido = !!(p1.bloco && p1.bloco.solido);
  const mesmaImagem = JSON.stringify(p1.bloco) === JSON.stringify(p2.bloco);
  const rot = (b) => (b ? `${b.w}x${b.h}@${b.x0},${b.y0}` : 'nenhum');
  linhas.push(
    `${String(i).padStart(2)}: print=${solido ? 'BLOCO' : 'limpo'} ${rot(p1.bloco)} ` +
      `rt1NaN=${r1.f1.nan} rt2NaN=${r1.f2.nan} ` +
      `rt1preto=${r1.rt1.zero}/${r1.rt1.total} ${JSON.stringify(r1.rt1.bbox)} ` +
      `rt2preto=${r1.rt2.zero}/${r1.rt2.total} ${JSON.stringify(r1.rt2.bbox)} congel2=${mesmaImagem ? 'igual' : 'MUDOU'}`,
  );
  if (solido && achados < 3) {
    achados++;
    console.log(linhas[linhas.length - 1]);
    console.log(`   >>> CONGELADO com bloco: print ${JSON.stringify(p1.bloco)} | paridade ${JSON.stringify(r1.paridade)}`);
    console.log(`       rt1   ${JSON.stringify(r1.rt1)}`);
    console.log(`       rt2   ${JSON.stringify(r1.rt2)}`);
    console.log(`       bright ${JSON.stringify(r1.bright)}`);
    console.log(`       mip0  ${JSON.stringify(r1.mip0)}`);
    console.log(`       FLOAT rt1 ${JSON.stringify(r1.f1)}`);
    console.log(`       FLOAT rt2 ${JSON.stringify(r1.f2)}`);
    if (r1.cadeia.length) {
      console.log('       CADEIA DO BLOOM (onde o NaN entra):');
      for (const c of r1.cadeia) console.log(`         ${c.nome.padEnd(8)} ${c.tam.padEnd(10)} nan=${String(c.nan).padStart(7)} caixa=${JSON.stringify(c.nanCaixa)}`);
      console.log(`         amostras rt2: ${JSON.stringify(r1.f2.nanExemplos)}`);
    }
    await page.screenshot({ path: `${OUT}/print-${i}.png` });
    writeFileSync(`${OUT}/rt1-${i}.png`, Buffer.from(r1.png1.split(',')[1], 'base64'));
    writeFileSync(`${OUT}/rt2-${i}.png`, Buffer.from(r1.png2.split(',')[1], 'base64'));
    writeFileSync(`${OUT}/bright-${i}.png`, Buffer.from(r1.pngBright.split(',')[1], 'base64'));
    writeFileSync(`${OUT}/mip0-${i}.png`, Buffer.from(r1.pngMip0.split(',')[1], 'base64'));
  }
  await page.waitForTimeout(40);
}
console.log(linhas.join('\n'));
console.log(`\nblocos em ${achados}/${TENTATIVAS} prints congelados`);
console.log('CONSOLE:', msgs.length);
for (const m of msgs.slice(0, 15)) console.log('  ' + m);
await browser.close();
