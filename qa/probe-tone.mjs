// SONDAS DE TOM NA ARENA — corpo ampliado + A/B de luz, no cenário travado.
//
// Estado da investigação (medido, não chutado):
//  - a TEXTURA da Nereia é FRIA em todas as 10 faixas (qa/probe-textura-warm.mjs:
//    média ~(75,182,207), r−b entre −110 e −151, 0% de pixels quentes) -> o
//    amarronzado NÃO vem da pintura da escultora;
//  - no PALCO do bestiário ela está azure e o usuário diz que está certo;
//  - o ACES é o MESMO nos dois caminhos (qtACESFilmic do BloomGate é verbatim
//    dos chunks do three), então tomemapping não explica a diferença;
//  - sobram as LUZES: Lighting.tsx põe um point light da equipe do jogador
//    DOURADO em 5 dos 6 biomas (no gelo: #f2d89a!) a ARENA_R*0,17 do chão, na
//    altura da cintura da criatura, e os cenários (Underwater/UniverseEnd/
//    Volcanic) acrescentam mais point lights. O palco do bestiário não tem
//    nenhuma dessas.
// O que a sonda RESOLVEU (15/nov, o caso da Nereia "amarronzada"): nenhuma das
// hipóteses acima. Nem a pintura, nem a luz da arena, nem o ACES. O marrom era
// o ARO DA EQUIPE no fresnel do próprio rig (NereiaMeshRig:
// uFTeam * pow(1−ndv, 2,2) * 0,3, com uFTeam = TEAM_TINT.player #f5c451):
// emissivo, então ignora o bioma (igual em todas as fases), e some no bestiário
// porque lá não há unidade e o tint cai no TEAM_TINT.neutral frio. Na malha
// PBR clara o expoente largo do figurino lavava metade da barriga; a emenda é
// pow 4,2 + mix para o azul-claro da paleta (0,78). A sonda mostra o corpo em
// Gélido/Subaquático e o % de pixels quentes do corpo caiu de 2%/1% para 0%.
//
// Esta sonda cola a câmera no corpo (OrbitControls, minDistance 3) na fase de
// preparação — MESMA luz/bloom da batalha — e tira prints do corpo em quatro
// estados de luz, no MESMO bioma. Os números saem dos próprios PNG (é o quadro
// composto que o usuário vê, bloom incluso).
// Uso: node qa/probe-tone.mjs [cenário...]  (padrão: ice underwater volcanic)
// O cenário é FIXADO pelo seletor da casa (Configurações → 🌄 Cenário →
// [data-testid="scenario-<id>"]), então o A/B roda no MESMO bioma sorteado de
// verdade — e nos biomas que o usuário apontou (neve e água).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const OUT = '/tmp/opencode/tom-check';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5173/element-merge/';
const BIOMAS = process.argv.slice(2).length ? process.argv.slice(2) : ['ice', 'underwater', 'volcanic'];

// ---------- decodificador PNG (o mesmo da sonda de textura) ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let p = 8;
  let w = 0,
    h = 0,
    depth = 0,
    ctype = 0,
    interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString('ascii');
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG depth=${depth} interlace=${interlace}`);
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : (() => { throw new Error('ctype ' + ctype); })();
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = raw.slice(rp, rp + stride);
    rp += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v;
      if (filter === 0) v = line[i];
      else if (filter === 1) v = line[i] + a;
      else if (filter === 2) v = line[i] + b;
      else if (filter === 3) v = line[i] + ((a + b) >> 1);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a),
          pb = Math.abs(pp - b),
          pc = Math.abs(pp - c);
        v = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('filter ' + filter);
      cur[i] = v & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

/** corpo no recorte: ignora o fundo (o piso/fog da arena) filtrando o canto e
 *  olhando só o miolo; devolve média RGB, r−b e % de pixels quentes */
function analise(path) {
  const { w, h, ch, px } = decodePng(readFileSync(path));
  const x0 = Math.round(w * 0.22),
    x1 = Math.round(w * 0.78);
  const y0 = Math.round(h * 0.15),
    y1 = Math.round(h * 0.85);
  let r = 0,
    g = 0,
    b = 0,
    n = 0,
    warm = 0,
    branco = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
      if (px[i] > px[i + 2] + 8) warm++;
      // pixels "estourados": os que viram casca de ovo/branco-quente no ACES
      if (px[i] > 170 && px[i + 1] > 150 && px[i + 2] < px[i] + 12) branco++;
    }
  return {
    tamanho: `${w}x${h}`,
    mediaRGB: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
    rMenosB: Math.round(r / n) - Math.round(b / n),
    quentes: ((warm / n) * 100).toFixed(0) + '%',
    estouradosQuentes: ((branco / n) * 100).toFixed(0) + '%',
  };
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

const HEMI_DO_BIOMA = {
  '8fb2ff': 'arcane',
  e2edc5: 'forest',
  d9f3ff: 'gelo',
  b96743: 'vulcânico',
  '8de8eb': 'água',
  '8fdcff': 'fim-do-universo',
};

for (let i = 0; i < BIOMAS.length; i++) {
  const cenario = BIOMAS[i];
  const rodada = i + 1;
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));
  await page.addInitScript(() => {
    const et = new EventTarget();
    window.__threeRs = [];
    et.addEventListener('observe', (e) => {
      const d = e.detail;
      if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
    });
    window.__THREE_DEVTOOLS__ = et;
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const click = async (sel) => {
    const el = page.locator(sel);
    if (await el.count()) await el.click();
  };
  await click('[data-testid="open-settings"]');
  await click('[data-testid="settings-tab-scenario"]');
  await click(`[data-testid="scenario-${cenario}"]`);
  await click('[data-testid="settings-tab-debug"]');
  await click('[data-testid="debug-toggle"]');
  await click('[data-testid="close-settings"]');
  await click('[data-testid="play"]');
  await page.waitForSelector('[data-testid="shop"]');
  if (await page.locator('[data-testid="tutorial-skip"]').count()) await click('[data-testid="tutorial-skip"]');
  await page.waitForTimeout(400);
  await click('[data-testid="open-bestiary"]');
  await page.waitForTimeout(600);
  await click('[data-testid="debug-level-nereia-1"]');
  await page.waitForTimeout(250);
  await click('[data-testid="debug-spawn-nereia"]');
  await page.waitForTimeout(700);
  if (await page.locator('[data-testid="discovery-close"]').count()) await click('[data-testid="discovery-close"]');
  if (await page.locator('[data-testid="close-bestiary"]').count()) await click('[data-testid="close-bestiary"]');
  await page.waitForTimeout(900);

  // cola a câmera no corpo: o alvo do OrbitControls vira a própria unidade e a
  // distância vai ao clamp (minDistance 3) — o corpo enche o quadro
  const mira = await page.evaluate(() => {
    let scene = null;
    for (const s of window.__threeRs) {
      if (s.isScene && s.__r3f?.root?.getState?.()?.gl?.domElement?.offsetWidth) scene = s;
    }
    if (!scene) return { err: 'sem cena visível' };
    const st = scene.__r3f.root.getState();
    window.__tom = { scene, gl: st.gl, camera: st.camera, controls: st.controls };
    let unit = null;
    scene.traverse((o) => {
      if (o.userData && o.userData.species === 'nereia' && !unit) unit = o;
    });
    if (!unit) return { err: 'sem nereia na cena' };
    const V = unit.position.constructor;
    const p = unit.getWorldPosition(new V());
    if (st.controls) {
      st.controls.target.copy(p).add(new V(0, 0.25, 0));
    }
    st.camera.position.set(p.x, p.y + 0.5, p.z + 3.25);
    st.camera.lookAt(p.x, p.y + 0.25, p.z);
    if (st.controls) st.controls.update();
    // bioma: a cor da luz hemisférica identifica o cenário (tabela de Lighting.tsx)
    let hemi = null;
    let pontos = [];
    scene.traverse((o) => {
      if (o.isHemisphereLight) hemi = o.color.getHexString();
      if (o.isPointLight)
        pontos.push({
          cor: '#' + o.color.getHexString(),
          intens: +o.intensity.toFixed(1),
          y: +o.position.y.toFixed(1),
          z: +o.position.z.toFixed(1),
          quente: +(o.color.r - o.color.b).toFixed(2),
        });
    });
    window.__tom.p = p;
    return { hemi, pontos, alvo: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)] };
  });
  const bioma = HEMI_DO_BIOMA[mira.hemi ?? ''] ?? `? (${mira.hemi})`;
  console.log(`\n===== rodada ${rodada} — bioma ${bioma} =====`);
  console.log('point lights da arena:', JSON.stringify(mira.pontos));

  /** recorte do corpo (px CSS do canvas) a partir da caixa projetada */
  const rectCorpo = async () =>
    page.evaluate(() => {
      const { gl, camera, scene } = window.__tom;
      let sm = null;
      scene.traverse((o) => {
        if (o.isSkinnedMesh && !sm) sm = o;
      });
      if (!sm) return null;
      if (!sm.geometry.boundingBox) sm.geometry.computeBoundingBox();
      sm.updateWorldMatrix(true, false);
      const bb = sm.geometry.boundingBox;
      const V = sm.position.constructor;
      const W = gl.domElement.width,
        H = gl.domElement.height;
      const pts = [];
      for (const sx of [bb.min.x, bb.max.x])
        for (const sy of [bb.min.y, bb.max.y])
          for (const sz of [bb.min.z, bb.max.z]) {
            const v = new V(sx, sy, sz).applyMatrix4(sm.matrixWorld).project(camera);
            pts.push({ x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H });
          }
      const xs = pts.map((q) => q.x),
        ys = pts.map((q) => q.y);
      const rct = gl.domElement.getBoundingClientRect();
      const kx = rct.width / W,
        ky = rct.height / H;
      const pad = 14;
      return {
        x: Math.max(0, rct.left + Math.min(...xs) * kx - pad),
        y: Math.max(0, rct.top + Math.min(...ys) * ky - pad),
        width: Math.min(rct.right - (rct.left + Math.min(...xs) * kx - pad), (Math.max(...xs) - Math.min(...xs)) * kx + pad * 2),
        height: Math.min(rct.bottom - (rct.top + Math.min(...ys) * ky - pad), (Math.max(...ys) - Math.min(...ys)) * ky + pad * 2),
      };
    });

  const tiro = async (nome) => {
    const clip = await rectCorpo();
    if (!clip) return console.log(`  ${nome}: sem recorte`);
    await page.screenshot({ path: `${OUT}/${nome}.png`, clip });
    console.log(`  ${nome}: ${clip.width.toFixed(0)}x${clip.height.toFixed(0)}px ->`, JSON.stringify(analise(`${OUT}/${nome}.png`)));
  };

  await page.waitForTimeout(500);
  const tag = `r${rodada}-${bioma.replace(/[^a-z]/gi, '')}`;
  await tiro(`${tag}-A-base`);

  // A/B no MESMO bioma e MESMO enquadre: só a luz muda
  const mexe = (modo) =>
    page.evaluate((m) => {
      const scene = window.__tom.scene;
      if (!scene.__bak) {
        scene.__bak = [];
        scene.traverse((o) => {
          if (o.isLight) scene.__bak.push({ l: o, i: o.intensity, c: o.color.clone() });
        });
      }
      for (const { l, i, c } of scene.__bak) {
        l.intensity = i;
        l.color.copy(c);
      }
      const pts = [];
      scene.traverse((o) => {
        if (o.isPointLight) pts.push(o);
      });
      if (m === 'quente-off') {
        let alvo = null;
        for (const p of pts) if (!alvo || p.color.r - p.color.b > alvo.color.r - alvo.color.b) alvo = p;
        if (alvo) alvo.intensity = 0;
        return 'point mais quente apagado';
      }
      if (m === 'quente-branco') {
        let n = 0;
        for (const p of pts)
          if (p.color.r - p.color.b > 0.02) {
            p.color.setRGB(1, 1, 1);
            n++;
          }
        return n + ' point lights quentes viraram brancas (mesma força)';
      }
      if (m === 'points-off') {
        for (const p of pts) p.intensity = 0;
        return pts.length + ' point lights apagadas';
      }
      return 'restaurado';
    }, modo);

  await mexe('quente-off');
  await page.waitForTimeout(350);
  await tiro(`${tag}-B-sem-point-quente`);

  await mexe('quente-branco');
  await page.waitForTimeout(350);
  await tiro(`${tag}-C-point-quente-branca`);

  await mexe('points-off');
  await page.waitForTimeout(350);
  await tiro(`${tag}-D-so-luzes-frias`);

  await page.screenshot({ path: `${OUT}/${tag}-arena-cheia.png` });
  await page.close();
}
await browser.close();
console.log('\nprints em', OUT);
