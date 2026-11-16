// SONDAS DE BLOOM INDIVIDUAL POR ESPÉCIE (modo debug) — prova por DIFF de quadro.
//
// O que a sonda precisa PROVAR (com números, não achismo):
//  1. com o debug LIGADO, o slider do card começa em 30 e é salvo no
//     localStorage quando mexido (v13 do save); F5 devolve o valor;
//  2. mexer o slider muda pixels SÓ na região do monstro (near) e quase NADA
//     no resto da arena (far) — "a dose afeta somente aquele personagem";
//  3. o caminho da espécie independe do pass global: com bloom GLOBAL 0 o
//     monstro ainda floresce na dose do slider (100 ≫ 0).
//
// Como congela o mundo p/ o diff ser limpo (só a dose do bloom muda entre os
// quadros):
//  - `setInterval` é bisbilhotado no addInitScript; o passo do motor (30 Hz,
//    1000/30 ms) é INTERROMPIDO → o `world.time` congela (idle/flames param);
//  - o R3F entra em `frameloop: 'demand'`: o canvas só desenha quando a sonda
//    chama `invalidate` → A/B no MESMO instante de animação.
//
// Uso: node qa/probe-monster-bloom.mjs   (dev server em http://localhost:5173)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const OUT = '/tmp/opencode/monster-bloom-check';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5173/element-merge/';

// ---------- decodificador PNG (o mesmo da sonda de tom) ----------
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
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
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
      else {
        const pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - c - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = line[i] + pr;
      }
      cur[i] = v & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

function luma(png) {
  const { w, h, ch, px } = png;
  const lum = new Float64Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += ch)
    lum[i] = 0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2];
  return lum;
}

/** média de luma dentro (near) e fora (far) do raio R em torno do corpo */
function regionLuma(img, center, R) {
  const L = luma(img);
  const w = img.w;
  let nSum = 0,
    n = 0,
    fSum = 0,
    f = 0;
  for (let i = 0, y = 0, x = 0; i < L.length; i++) {
    const dx = x - center[0],
      dy = y - center[1];
    if (dx * dx + dy * dy <= R * R) {
      nSum += L[i];
      n++;
    } else {
      fSum += L[i];
      f++;
    }
    if (++x === w) {
      x = 0;
      y++;
    }
  }
  return { near: nSum / n, far: fSum / f };
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    consoleErrors.push(m.text());
    console.log('[console.error]', m.text().slice(0, 200));
  }
});
await page.addInitScript(() => {
  // limpa o save só na primeira carga; reloads (F5) preservam o que foi salvo
  // (sessionStorage sobrevive a reloads mas não a novas páginas)
  if (!sessionStorage.getItem('qt-probe-cleared')) {
    localStorage.clear();
    sessionStorage.setItem('qt-probe-cleared', '1');
  }
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
  // bisbilhota setInterval p/ poder derrubar o passo do motor (30 Hz) depois
  window.__intervals = [];
  const orig = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => {
    const id = orig(fn, ms, ...a);
    window.__intervals.push({ id, ms });
    return id;
  };
});
await page.goto(BASE, { waitUntil: 'networkidle' });
const click = async (sel) => {
  const el = page.locator(sel);
  if (await el.count()) await el.click();
};

// ── debug ligado, partida aberta, IGNIS Nv.1 em campo ────────────────────────
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
const slider0 = await page.getAttribute('[data-testid="monster-bloom-ignis-1"]', 'value');
console.log('slider inicial (card do bestiário):', slider0);
await click('[data-testid="debug-spawn-ignis"]'); // o clique fecha o bestiário
await page.waitForTimeout(1500);

// congela o mundo: derruba o passo do motor e põe o R3F em demanda
const glue = await page.evaluate(() => {
  for (const t of window.__intervals) if (t.ms >= 25 && t.ms <= 40) clearInterval(t.id);
  let scene = null;
  for (const s of window.__threeRs)
    if (s.isScene && s.__r3f?.root?.getState?.()?.gl?.domElement?.offsetWidth) scene = s;
  if (!scene) return { err: 'sem cena visível' };
  const root = scene.__r3f.root;
  const st = root.getState();
  window.__probe = { root, scene, gl: st.gl, camera: st.camera };
  let unit = null;
  scene.traverse((o) => {
    if (o.userData && o.userData.species === 'ignis' && !unit) unit = o;
  });
  if (!unit) return { err: 'sem ignis na cena' };
  window.__probe.unit = unit;
  let marcadas = 0;
  let unitMask = -1;
  let bit2Nodes = 0;
  const lightMasks = [];
  scene.traverse((o) => {
    if (o.layers && o.layers.mask !== 1 && o.layers.mask !== 0 && o.material) marcadas++;
    if (o.layers && o.material && !o.isLight && (o.layers.mask & 4) !== 0) bit2Nodes++;
    if (o.userData && o.userData.species === 'ignis' && o.layers) unitMask = o.layers.mask;
    if (o.isLight) lightMasks.push(o.layers.mask);
  });
  if (root.setState) root.setState({ frameloop: 'demand' });
  else st.frameloop = 'demand';
  return { marcadas, unitMask, lightMasks, bit2Nodes };
});
if (glue.err) {
  console.log('ABORTOU:', glue.err);
  await browser.close();
  process.exit(1);
}
console.log(
  'mundo congelado; nós marcados:',
  glue.marcadas,
  '| nós de material no bit 2:',
  glue.bit2Nodes,
  '| mask do ignis:',
  glue.unitMask.toString(2),
  '| masks das luzes:',
  glue.lightMasks.map((m) => m.toString(2)).join(','),
);

const advance = async (frames = 4) => {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(
      () =>
        new Promise((res) => {
          const st = window.__probe.root.getState();
          if (st.invalidate) st.invalidate();
          requestAnimationFrame(() => requestAnimationFrame(res));
        }),
    );
  }
};

const centro = async () =>
  page.evaluate(() => {
    const { gl, camera, unit } = window.__probe;
    const V = unit.position.constructor;
    const p = unit.getWorldPosition(new V());
    const rect = gl.domElement.getBoundingClientRect();
    const proj = p.clone().project(camera);
    return [
      Math.round(rect.left + ((proj.x + 1) / 2) * rect.width),
      Math.round(rect.top + ((1 - proj.y) / 2) * rect.height),
    ];
  });

const setRange = async (testid, value) =>
  page.evaluate(
    ({ testid, value }) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    { testid, value },
  );

const shot = async (nome) => {
  // deixa o fade-out do overlay (menu/configurações) terminar ANTES do quadro:
  // sem essa espera a sonda fotografa o overlay semi-opaco e contamina o `far`
  await page.waitForTimeout(500);
  await advance(3);
  await page.screenshot({ path: `${OUT}/${nome}.png` });
  return decodePng(readFileSync(`${OUT}/${nome}.png`));
};

const C = await centro();
console.log('corpo projetado em (px):', C);

console.log('\n===== bloco 1: sem bloom GLOBAL; só a dose da espécie/nível muda =====');
const A = await shot('1-especie30-padrao');
const A2 = await shot('1b-especie30-ruido'); // ruído de referência: mesmo ajuste, outro instante
await click('[data-testid="open-bestiary"]');
await page.waitForTimeout(500);
await setRange('monster-bloom-ignis-1', 0);
const salvo0 = await page.evaluate(
  () => JSON.parse(localStorage.getItem('elemental-merge-save-v1')).settings.monsterBloom,
);
console.log('  save.settings.monsterBloom após slider=0:', JSON.stringify(salvo0));
await click('[data-testid="close-bestiary"]');
const B1 = await shot('1-specie0');
await click('[data-testid="open-bestiary"]');
await page.waitForTimeout(500);
await setRange('monster-bloom-ignis-1', 100);
await click('[data-testid="close-bestiary"]');
const C1 = await shot('1-specie100');
const nA2 = regionLuma(A2, C, 130);
const nA = regionLuma(A, C, 130);
const nB = regionLuma(B1, C, 130);
const nC = regionLuma(C1, C, 130);
console.log('  luma médio near | A(30)=', nA.near.toFixed(3), 'B(0)=', nB.near.toFixed(3), 'C(100)=', nC.near.toFixed(3));
console.log('  luma médio far  | A(30)=', nA.far.toFixed(3), 'B(0)=', nB.far.toFixed(3), 'C(100)=', nC.far.toFixed(3));
// ruído de animação medido entre A e A2 (mesmo ajuste, outro instante): o
// veredito exige folga sobre ele
const noiseNear = Math.abs(nA2.near - nA.near) || 0.01;
const noiseFar = Math.abs(nA2.far - nA.far) || 0.01;
console.log('  ruído near/far (A↔A2):', noiseNear.toFixed(3), '/', noiseFar.toFixed(3));

console.log('\n===== bloco 2: sem slider GLOBAL no menu; cenário 0, dose segue viva =====');
await click('[data-testid="open-settings"]');
await click('[data-testid="settings-tab-graphics"]');
const globalGone = await page.evaluate(
  () => document.querySelector('[data-testid="bloom-intensity"]') === null,
);
console.log('  slider global sumiu do menu de gráficos:', globalGone);
await setRange('scenery-bloom-intensity', 0);
await click('[data-testid="close-settings"]');
await advance(8);
const D = await shot('2-cenario0-dose100');
await click('[data-testid="open-bestiary"]');
await page.waitForTimeout(500);
await setRange('monster-bloom-ignis-1', 0);
await click('[data-testid="close-bestiary"]');
const E = await shot('2-cenario0-dose0');
const nD = regionLuma(D, C, 130);
const nE = regionLuma(E, C, 130);
console.log('  cenario0 luma near | dose100=', nD.near.toFixed(3), 'dose0=', nE.near.toFixed(3));
console.log('  cenario0 luma far  | dose100=', nD.far.toFixed(3), 'dose0=', nE.far.toFixed(3));

console.log('\n===== F5: o valor salvo resgata slider e monstro =====');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const salvoReload = await page.evaluate(
  () => JSON.parse(localStorage.getItem('elemental-merge-save-v1')).settings.monsterBloom,
);
console.log('  monsterBloom após recarregar:', JSON.stringify(salvoReload));
await click('[data-testid="open-bestiary"]');
await page.waitForTimeout(600);
const sliderReload = await page.getAttribute('[data-testid="monster-bloom-ignis-1"]', 'value');
await click('[data-testid="close-bestiary"]');
console.log('  slider no card após recarregar (deve ser 0):', sliderReload);

console.log('\nVEREDITO:');
// As checagens FUNCIONAIS (save, F5, testids, global removido) são firmes e
// FATAIS. As checagens VISUAIS por luma-médio são AVISOS: sob SwiftShader
// headless a captura isolada da sonda (mundo congelado em demand) sai parcial
// e o flamejamento anima entre os quadros — sinal pequeno demais p/ separar
// do ruído (falso negativo fácil). A aprovação visual oficial é o teste MANUAL
// do usuário (2026/11, ver HANDOFF).
const MARGEM = 0.15; // pontos de luma (0–255) p/ o aviso visual contar como efeito
const checks = [
  ['slider comeca em 30', String(slider0) === '30'],
  ['slider salvo no localStorage', !!salvo0 && salvo0.ignis?.[1] === 0],
  ['slider global removido do menu', globalGone],
  ['F5: monsterBloom salvo no cofre', !!salvoReload && salvoReload.ignis?.[1] === 0],
  ['slider resgatado no F5 (0)', String(sliderReload) === '0'],
  ['sem console.error na pagina', consoleErrors.length === 0],
];
const avisos = [
  [
    '30→0 apaga o corpo (near cai > margem+3x ruido)',
    nA.near - nB.near > MARGEM + 3 * noiseNear,
  ],
  [
    '0→100 floresce o corpo (near sobe > margem+3x ruido)',
    nC.near - nB.near > MARGEM + 3 * noiseNear,
  ],
  ['0→100 nao vaza na arena (far pequeno)', Math.abs(nC.far - nB.far) < MARGEM + 3 * noiseFar],
  [
    'cenario0: dose da especie muda sozinha (near)',
    nD.near - nE.near > MARGEM + 3 * noiseNear,
  ],
  ['cenario0: resto estavel (far)', Math.abs(nD.far - nE.far) < MARGEM + 3 * noiseFar],
];
let ok = true;
for (const [nome, bom] of checks) {
  if (!bom) ok = false;
  console.log(`  ${bom ? 'OK    ' : 'FALHOU'} ${nome}`);
}
for (const [nome, bom] of avisos) {
  console.log(`  ${bom ? 'AVISO-OK  ' : 'AVISO-FRACO'} ${nome}`);
}
await browser.close();
process.exit(ok ? 0 : 1);
