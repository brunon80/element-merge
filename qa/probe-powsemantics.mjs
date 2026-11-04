// Semântica de pow(base negativa) NO GL DA MÁQUINA — o defeito do zéfiro no
// iPhone (iOS Metal) NÃO reproduz no WebKit do Windows: esta sonda prova o
// porquê com quads descartáveis (canvas own-page com preserveDrawingBuffer,
// readback confiável — diferente do canvas do jogo, onde readPixels é instável).
// Diferenciação: NaN → step(0,c)=0, step(c,c)=0, RGB vira 0 no readback;
// base clampada a 0 (ANGLE/SwiftShader) → pow=0 → step(0,0)=1.
// Uso: node qa/probe-powsemantics.mjs [webkit|chromium]
const engine = process.argv[2] ?? 'webkit';
const { webkit, chromium } = await import('playwright');
const browser =
  engine === 'chromium'
    ? await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
    : await webkit.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const res = await page.evaluate(() => {
  const run = (frag) => {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) return 'sem webgl';
    const sh = (t, s) => {
      const o = gl.createShader(t);
      gl.shaderSource(o, s);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) return gl.getShaderInfoLog(o);
      return o;
    };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }');
    const fs = sh(gl.FRAGMENT_SHADER, frag);
    if (typeof vs === 'string' || typeof fs === 'string')
      return 'compile: ' + (typeof vs === 'string' ? vs : fs);
    const pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return 'link: ' + gl.getProgramInfoLog(pr);
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 1, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4);
    gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [...px];
  };
  const out = {};
  const PRE = 'precision highp float;\n';
  // A: pow negativa pura — r=cor crua, g=step(0,c) (1 se c>=0), b=(c<1)
  out.powNeg = run(PRE +
    'void main(){ float c = pow(-0.25, 1.5); gl_FragColor = vec4(c, step(0.0, c), step(c, 0.999), 1.0); }'
  );
  // B: controle positiva — pow(0.25,1.5)=0.125 → r~32, g=255
  out.powPos = run(PRE +
    'void main(){ float c = pow(0.25, 1.5); gl_FragColor = vec4(c, step(0.0, c), step(c, 0.999), 1.0); }'
  );
  // C: detector de NaN por auto-comparação — step(c,c) (NaN → 0, número → 1)
  out.powNegSelfEq = run(PRE +
    'void main(){ float c = pow(-0.25, 1.5); gl_FragColor = vec4(step(c, c), step(c, c), 0.0, 1.0); }'
  );
  // D: discard "ao natural" sobre alfa NaN — se NaN existe, `a <= x` é FALSE
  // e o quad escreve VERMELHO (é assim que o texel podre vira preto via bloom);
  // se a máquina clampa pow p/ 0, o discard pega e o pixel fica VERDE (clear).
  out.discardNaN = run(PRE +
    'void main(){ float a = pow(-0.25, 1.5); if (a <= 0.002) discard; gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'
  );
  // E: mesma coisa com o discard invertido da lição 4 (deve descartar nos DOIS mundos)
  out.discardInvert = run(PRE +
    'void main(){ float a = pow(-0.25, 1.5); if (!(a > 0.002)) discard; gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'
  );
  return out;
});

console.log(`[${engine}] pow semantics:`, JSON.stringify(res, null, 1));
await browser.close();
