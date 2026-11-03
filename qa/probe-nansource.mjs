// DE ONDE VÊM OS ~7 NaN DA CENA? A sonda de frames congelados (probe-frozen)
// pinou a mecânica do "quadrado preto":
//
//   * o renderTarget1 (a cena HDR, já resolvida do multisample) tem 6-10 texels
//     NaN num quadradinho de ~18x14 device px, sempre rente à borda do disco de
//     acreção do Primordial;
//   * o highpass do bloom pesca esses texels e CADA borrão da escada de mips
//     MULTIPLICA a área contaminada (v[0]=91, v[1]=912, v[2]=6992, v[3]=48096,
//     v[4]=309132) até encher metade do mip mais grosso;
//   * o compósito somatório devolve essa caixa pro renderTarget2 e a cópia final
//     desenha NaN como preto puro no canvas -> "o monstro inteiro e seus ataques
//     são quadrados pretos" (iOS/WebKit: o texel NaN vira (0,0,0) na amostragem).
//
// Esta sonda caça o AUTOR do NaN. O truque é o congelamento do `composer.render`:
// nenhum frame novo entra e o JavaScript é de fio único — dentro de UM
// `page.evaluate` os uniforms do rig ficam PARADOS no estado exato do frame
// doente, então dá pra fazer experiência controlada no mesmo tick:
//
//   1. varredura CPU: todo uniform de todo material e toda matriz do cena em
//      busca de não-finito (NaN/Inf vindos de Math.pow(base<0, fração) no rig são
//      o suspeito nº1 de NaN esparso);
//   2. ablação por objeto: esconde um objeto, re-renderiza o MESMO frame, mede o
//      NaN do renderTarget1 — o objeto cujo sumiço zera o NaN é o culpado;
//   3. o fragmentShader do suspeito: mostra as linhas com pow/sqrt/log/atan/divisão
//      (GLSL pow(base<0, x) é INDEFINIDO = NaN, e é assim que um rig "sadio" no
//      papel vira NaN num driver);
//   4. prova o remendo defensivo no MESMO frame: troca o fragmentShader da
//      pastilha de resolve por um sanificador (NaN/Inf -> 0 + teto), sem passar
//      novo no pipeline. Se o NaN do renderTarget2 vai a zero com ela e volta sem
//      ela, a sanificação na cadeia estanca o bug mesmo antes do conserto na raiz.
//
// Uso: node qa/probe-nansource.mjs [especie] [webkit|chromium] [tentativas] [msPorTentativa]
import { mkdirSync } from 'node:fs';

const sp = process.argv[2] ?? 'primordial';
const engine = process.argv[3] ?? 'webkit';
const TENTATIVAS = Number(process.argv[4] ?? 16);
const FRAME_MS = Number(process.argv[5] ?? 110);
const OUT = `C:/Users/bruno/AppData/Local/Temp/opencode/shots-nansource-${engine}`;
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
  H.C = C;
  H.scene = Q.scene;

  // ---- o congelador: a janela roda, o composer não desenha nada novo ----
  if (!C.__qtRender) {
    C.__qtRender = C.render.bind(C);
    C.render = function (dt) {
      if (H.frozen) return;
      return C.__qtRender(dt);
    };
  }
  H.frozen = false;

  // ---- quad de tela-cheia que copia EXATO (sem clamp) pra um RT float ----
  const matRaw = new T.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
    depthTest: false,
    depthWrite: false,
    blending: T.NoBlending,
  });
  const scRaw = new T.Scene();
  const meshRaw = new T.Mesh(new T.PlaneGeometry(2, 2), matRaw);
  meshRaw.frustumCulled = false;
  scRaw.add(meshRaw);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const size = gl.getSize(new T.Vector2());
  const dpr = gl.getPixelRatio();
  H.rtFloat = (fator) => {
    const fw = Math.max(64, Math.round(size.x * dpr * fator));
    const fh = Math.max(64, Math.round(size.y * dpr * fator));
    const key = `rtF_${fw}x${fh}`;
    if (!H[key]) {
      const rt = new T.WebGLRenderTarget(fw, fh, {
        format: T.RGBAFormat,
        type: T.FloatType,
        depthBuffer: false,
        minFilter: T.NearestFilter,
        magFilter: T.NearestFilter,
      });
      rt.__buf = new Float32Array(fw * fh * 4);
      H[key] = rt;
    }
    return H[key];
  };

  // conta NaN (e Inf) nos texels do RT lido; `detalhe` pega bbox + amostras
  H.nanAt = (rt, fator = 0.5, detalhe = false) => {
    const dst = H.rtFloat(fator);
    const buf = dst.__buf;
    const prev = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    matRaw.uniforms.tDiffuse.value = rt.texture;
    gl.setRenderTarget(dst);
    gl.autoClear = true;
    gl.render(scRaw, cam);
    gl.autoClear = prevAuto;
    gl.readRenderTargetPixels(dst, 0, 0, dst.width, dst.height, buf);
    gl.setRenderTarget(prev);
    const fw = dst.width;
    const fh = dst.height;
    let nan = 0, inf = 0;
    let nx0 = 1e9, nx1 = -1, ny0 = 1e9, ny1 = -1;
    const exemplos = [];
    for (let i = 0; i < fw * fh; i++) {
      const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2], a = buf[i * 4 + 3];
      const ruim = !(r === r) || !(g === g) || !(b === b) || !(a === a);
      const grande = Math.abs(r) === Infinity || Math.abs(g) === Infinity || Math.abs(b) === Infinity || Math.abs(a) === Infinity;
      if (!ruim && !grande) continue;
      if (ruim) nan++;
      else inf++;
      const x = i % fw, y = (i / fw) | 0;
      if (x < nx0) nx0 = x;
      if (x > nx1) nx1 = x;
      if (y < ny0) ny0 = y;
      if (y > ny1) ny1 = y;
      if (detalhe && exemplos.length < 8) exemplos.push(`@${x},${y} (${r},${g},${b},a=${a})`);
    }
    return {
      grade: `${fw}x${fh}`,
      nan,
      inf,
      caixa: nx1 >= nx0 ? [nx0, ny0, nx1 - nx0 + 1, ny1 - ny0 + 1] : null,
      exemplos,
    };
  };

  // instantâneo da cena: uniforms e matrizes com não-finito
  H.cpuSujo = () => {
    const sujos = [];
    const visto = new Set();
    const ruin = (v) => typeof v === 'number' && !Number.isFinite(v);
    H.scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (!m || visto.has(m.uuid)) continue;
        visto.add(m.uuid);
        const u = m.uniforms;
        if (!u) continue;
        for (const [k, val] of Object.entries(u)) {
          const v = val && typeof val === 'object' && 'value' in val ? val.value : val;
          let a = null;
          if (ruin(v)) a = String(v);
          else if (v && typeof v === 'object') {
            for (const p of ['x', 'y', 'z', 'w']) if (ruin(v[p])) a = `${p}=${v[p]}`;
            if (!a && Array.isArray(v)) for (const q of v) if (ruin(q)) a = `arr=${q}`;
            if (!a && typeof v.toArray === 'function') for (const q of v.toArray()) if (ruin(q)) a = `mat=${q}`;
          }
          if (a) sujos.push(`uniform ${m.name || m.type}#${k}: ${a} (em ${o.name || o.type})`);
        }
      }
      const e = o.matrixWorld.elements;
      for (let i = 0; i < 16; i++)
        if (ruin(e[i])) {
          sujos.push(`matriz ${o.name || o.type}: el[${i}]=${e[i]}`);
          break;
        }
    });
    return sujos;
  };

  const bloom = C.passes.find((p) => p.nMips !== undefined);
  H.bloom = bloom;
  let comMat = 0;
  H.scene.traverse((o) => {
    if (o.material) comMat++;
  });
  return {
    passes: C.passes.map((p) => `${p.constructor.name}:${p.enabled ? 'on' : 'off'}${p.needsSwap ? '/swap' : ''}`),
    rt1: [C.renderTarget1.width, C.renderTarget1.height, C.renderTarget1.samples],
    rt2: [C.renderTarget2.width, C.renderTarget2.height, C.renderTarget2.samples],
    objetosComMaterial: comMat,
    bloom: bloom ? { strength: +bloom.strength.toFixed(3), threshold: bloom.threshold, nMips: bloom.nMips } : null,
  };
});
console.log('pipeline:', JSON.stringify(montou));
if (montou.err) {
  console.log('ABORTOU');
  await browser.close();
  process.exit(1);
}
if (!montou.bloom || montou.bloom.strength < 0.5) {
  // o gate do bloom fecha quando NÃO há primordial vivo em cena: sem essa o
  // "cenaNaN=0" sai limpo por defeito (o monstro nem estava na tela).
  console.log('ABORTOU: gate do bloom fechado = o primordial NÃO spawnou (não medir com ele ausente)');
  await browser.close();
  process.exit(1);
}

await page.click('[data-testid="start-battle"]');
await page.waitForTimeout(900);

let doente = 0;
const linhas = [];
for (let i = 0; i < TENTATIVAS; i++) {
  await page.evaluate(() => (window.__QTH.frozen = false));
  await page.waitForTimeout(FRAME_MS);

  // congela e caça tudo no MESMO tick (uniforms parados no frame doente)
  const r = await page.evaluate(() => {
    const H = window.__QTH;
    const C = H.C;
    H.frozen = true;
    const out = {};
    const pin = () => {
      C.readBuffer = C.renderTarget1;
      C.writeBuffer = C.renderTarget2;
    };

    // a cena do frame ao vivo (sem re-renderizar)
    pin();
    out.rt1AoVivo = H.nanAt(C.renderTarget1, 0.5, true);

    // se o frame ao vivo não tem NaN, re-renderiza o frame parado e procura de novo
    if (!out.rt1AoVivo.nan) {
      C.__qtRender(0);
      pin();
      out.reRenderizou = true;
      out.rt1AoVivo = H.nanAt(C.renderTarget1, 0.5, true);
      if (!out.rt1AoVivo.nan) return out;
    }

    // 1) CPU suja?
    out.cpuSujo = H.cpuSujo();

    // 2) ablação objeto a objeto, com o bloom desligado (leitura barata). resolve
    //    e cópia seguem ligados -> continuam trocando os buffers, e o pin() põe
    //    rt1 como alvo do RenderPass de novo: rt1 = a cena pura de cada tentativa.
    const bloomPass = H.bloom;
    const copia = C.passes[C.passes.length - 1];
    const resolve = C.passes[1];
    const antes = { b: bloomPass.enabled, c: copia.enabled, r: resolve.enabled };
    const medeCena = () => {
      bloomPass.enabled = false;
      C.__qtRender(0);
      pin();
      const m = H.nanAt(C.renderTarget1, 0.5, false);
      bloomPass.enabled = antes.b;
      return m;
    };
    const alvos = [];
    H.scene.traverse((o) => {
      if (!o.material || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      alvos.push({ o, nome: o.name || o.type, tipo: o.type, fs: (m.fragmentShader || '').length });
    });

    // ablação por BISECÇÃO: esconder uma subárvore inteira zera o NaN? desce ali.
    // Assim o caça-nanho custa ~30 re-renderizações em vez de 868.
    const identidade = (o) => {
      const geo = o.geometry;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      return {
        objeto: `${o.name || o.type}/${o.type}`,
        geometria: `${geo?.type ?? '-'} ${JSON.stringify(geo?.parameters ?? {}).slice(0, 200)}`,
        vertices: geo?.attributes?.position?.count ?? null,
        escala: o.scale.toArray().map((v) => +v.toFixed(3)),
        pos: o.getWorldPosition(new window.__QT.THREE.Vector3()).toArray().map((v) => +v.toFixed(2)),
        uniforms: Object.keys(mat?.uniforms ?? {}),
        blending: mat?.blending,
        transparent: mat?.transparent,
        fragmentShader: (mat?.fragmentShader || '').slice(0, 1600),
      };
    };
    const comMaterial = (no) => {
      let tem = false;
      no.traverse((c) => {
        if (c.material) tem = true;
      });
      return tem;
    };
    const nanSemNo = (no) => {
      no.visible = false;
      const m = medeCena();
      no.visible = true;
      return m.nan;
    };
    const achados = [];
    let orcamentos = 320;
    const vistosNaN = new Map();
    const desce = (no, caminho) => {
      if (orcamentos <= 0) return;
      for (const f of no.children) {
        if (!f.visible || !comMaterial(f)) continue;
        if (orcamentos <= 0) return;
        orcamentos--;
        if (nanSemNo(f) !== 0) continue;
        const rot = `${caminho}>${f.name || f.type}`;
        const antes = achados.length;
        desce(f, rot);
        if (achados.length === antes) {
          const id = identidade(f);
          id.caminho = rot;
          achados.push(id);
        }
      }
    };
    desce(H.scene, 'scene');
    out.ablacao = { total: alvos.length, sumiu: achados, orcamentosUsados: 90 - orcamentos };
    out.controle = medeCena(); // tudo de volta: o NaN tem que reaparecer

    // 3) o shader do suspeito já veio inteiro no dump da ablação; nada a fazer aqui
    out.shaders = [];

    // 4) A/B da sanificação no MESMO frame: troca o fragmentShader da pastilha de
    //    resolve por um sanificador e medida do rt2 (a cena depois do bloom)
    const matR = resolve.material;
    const glslOriginal = matR.fragmentShader;
    const glslSanity = `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D( tDiffuse, vUv );
        vec3 r = c.rgb;
        bool limpo = r.r < 1e6 && r.r > -1e6 && r.g < 1e6 && r.g > -1e6 && r.b < 1e6 && r.b > -1e6;
        r = limpo ? r : vec3( 0.0 );
        r = min( max( r, vec3( 0.0 ) ), vec3( 60000.0 ) );
        gl_FragColor = vec4( r, c.a < 1e6 && c.a > -1e6 ? c.a : 0.0 );
      }`;
    const renderCompleto = () => {
      C.__qtRender(0);
      pin();
      return H.nanAt(C.renderTarget2, 0.5, true);
    };
    matR.fragmentShader = glslSanity;
    matR.needsUpdate = true;
    const comSan = renderCompleto();
    matR.fragmentShader = glslOriginal;
    matR.needsUpdate = true;
    const semSan = renderCompleto();
    out.sanificacao = {
      semSan: { nan: semSan.nan, inf: semSan.inf, caixa: semSan.caixa },
      comSan: { nan: comSan.nan, inf: comSan.inf, caixa: comSan.caixa },
    };

    bloomPass.enabled = antes.b;
    copia.enabled = antes.c;
    resolve.enabled = antes.r;
    pin();
    return out;
  });

  const n = r.rt1AoVivo?.nan ?? 0;
  linhas.push(
    `${String(i).padStart(2)}: cenaNaN=${n} rt2NaN=${r.sanificacao?.semSan.nan ?? '-'} sanificado=${r.sanificacao?.comSan.nan ?? '-'}`,
  );
  if (n > 0) {
    doente++;
    console.log(linhas[linhas.length - 1]);
    console.log(`   CENA  ${JSON.stringify(r.rt1AoVivo)}`);
    console.log(`   CPU suja (${(r.cpuSujo ?? []).length}): ${(r.cpuSujo ?? []).slice(0, 12).join(' | ')}`);
    console.log(
      `   ABLAÇÃO (bissecção, ${r.ablacao.orcamentosUsados} re-renderizações de ${r.ablacao.total} objetos) -> NaN SUMIU só escondendo:`,
    );
    for (const c of r.ablacao.sumiu) {
      console.log(
        `     ${c.caminho}  ${c.objeto}  ${c.geometria}\n       vertices=${c.vertices} escala=${JSON.stringify(c.escala)} pos=${JSON.stringify(c.pos)}\n       uniforms=${JSON.stringify(c.uniforms)} blending=${c.blending} transparent=${c.transparent}`,
      );
      console.log(`       fragmentShader:\n${c.fragmentShader}`);
    }
    console.log(`   controle (tudo de volta): ${JSON.stringify(r.controle)}`);
    console.log(`   SANIFICAÇÃO no mesmo frame: SEM ${JSON.stringify(r.sanificacao.semSan)} | COM ${JSON.stringify(r.sanificacao.comSan)}`);
    for (const s of r.shaders.slice(0, 6)) console.log(`   SUSPEITO ${s.obj} (${s.material}):\n     ${s.ls.join('\n     ')}`);
    await page.screenshot({ path: `${OUT}/doente-${i}.png` });
    if (doente >= 2) break;
  }
  await page.evaluate(() => (window.__QTH.frozen = false));
  await page.waitForTimeout(40);
}
console.log('\n' + linhas.join('\n'));
console.log(`\ndoentes em ${doente}/${TENTATIVAS}`);
console.log('CONSOLE:', msgs.length);
for (const m of msgs.slice(0, 15)) console.log('  ' + m);
await browser.close();
