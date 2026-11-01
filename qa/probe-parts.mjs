// Sonda de depuração: inventário das MALHAS de uma espécie na cena (geometria,
// posição de mundo, material e uniforms de cor) — para identificar o QUE é
// cada peça no print. Uso: node qa/probe-parts.mjs <especie> [outra]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SPECIES = process.argv.slice(2);
if (!SPECIES.length) {
  console.log('uso: node qa/probe-parts.mjs <especie> [outra...]');
  process.exit(1);
}
const OUT = 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\probe';
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

for (const id of SPECIES) {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(600);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="discovery-close"]');
  }
}
await page.waitForTimeout(2500);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -1400);
await page.waitForTimeout(900);

const inv = await page.evaluate(() => {
  const scene = (window.__threeRs || []).find((s) => s && s.isScene);
  if (!scene) return { err: 'sem cena no registro devtools' };
  scene.updateMatrixWorld(true);
  const out = [];
  const warns = [];
  const matTag = (m) => {
    if (!m) return '-';
    if (m.type === 'ShaderMaterial') {
      if (m.uniforms?.uIceA) return `ice(${m.uniforms.uIceA.value.getHexString()}+${m.uniforms.uIceB.value.getHexString()}) env${m.uniforms.uEnvMix.value} a${m.uniforms.uAlpha.value} cg${m.uniforms.uCrackGlow.value} tc${m.uniforms.uTeamColor.value.getHexString()}`;
      if (m.uniforms?.uGold) return `core(${m.uniforms.uGold.value.getHexString()})`;
      if (m.uniforms?.uCool) return 'wind/arc';
      return 'shader';
    }
    return m.type + (m.color ? `(${m.color.getHexString()})` : '');
  };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh || o.isSprite || o.isPoints || o.isLine)) return;
    const e0 = o.matrixWorld.elements;
    // pools instanciados ociosos: o objeto fica na ORIGEM e, se count > 0 sem
    // matriz gravada, desenha uma instância identidade ali (o "blob" do print)
    if (o.isInstancedMesh && Math.hypot(e0[12], e0[13], e0[14]) < 2.5) {
      warns.push(
        `INSTANCED ${o.count > 0 ? 'ATIVA' : 'ociosa'} NA ORIGEM vis=${o.visible} count=${o.count}/${o.instanceMatrix.count} ` +
          `geo=${o.geometry?.type} ${o.geometry?.parameters ? JSON.stringify(o.geometry.parameters) : ''} ` +
          `mat=${(Array.isArray(o.material) ? o.material : [o.material]).map(matTag).join('|')}`,
      );
    }
    if (!o.isMesh && !o.isInstancedMesh) return;
    const g = o.geometry;
    const p = g?.parameters || {};
    const e = o.matrixWorld.elements; // posição de mundo sem precisar do THREE
    const wp = [e[12], e[13], e[14]];
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    out.push({
      geo: g?.type,
      args: [p.type, p.radius, p.radiusTop, p.radiusBottom, p.height, p.detail, p.innerRadius, p.outerRadius, p.segments, p.widthSegments, p.thetaSegments].filter((x) => x !== undefined).join(','),
      verts: g?.attributes?.position?.count ?? 0,
      pos: [+wp[0].toFixed(2), +wp[1].toFixed(2), +wp[2].toFixed(2)],
      scale: [+o.scale.x.toFixed(2), +o.scale.y.toFixed(2), +o.scale.z.toFixed(2)],
      vis: o.visible,
      inst: o.isInstancedMesh ? `c${o.count}/${o.instanceMatrix.count}` : '',
      mats: ms.map(matTag).join(' | '),
    });
  });
  return { rows: out, warns };
});
if (inv.err) {
  console.log(inv.err);
  await browser.close();
  process.exit(1);
}
for (const w of inv.warns) console.log(`!! ${w}`);
for (const r of inv.rows.sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0])) {
  console.log(
    `y${r.pos[1].toFixed(2).padStart(7)} x${r.pos[0].toFixed(2).padStart(7)} z${r.pos[2].toFixed(2).padStart(7)}  ${String(r.geo).padEnd(18)} ${String(r.args).padEnd(22)} v${String(r.verts).padEnd(5)} s${JSON.stringify(r.scale).padEnd(20)}${r.vis ? ' ' : 'HIDDEN            '}${r.inst.padEnd(9)} ${r.mats}`,
  );
}
console.log('total meshes:', inv.rows.length);
// dump de TODO objeto (mesh, instância, sprite, points, linha) perto de um
// ponto do mundo — para identificar o que desenha cada borrão do print
const near = await page.evaluate(() => {
  const scene = (window.__threeRs || []).find((s) => s && s.isScene);
  if (!scene) return [];
  scene.updateMatrixWorld(true);
  const tag = (m) => {
    if (!m) return '-';
    if (m.type === 'ShaderMaterial') {
      if (m.uniforms?.uIceA) return `ice(${m.uniforms.uIceA.value.getHexString()}+${m.uniforms.uIceB.value.getHexString()}) a${m.uniforms.uAlpha.value} cg${m.uniforms.uCrackGlow.value}`;
      if (m.uniforms?.uGold) return `core(${m.uniforms.uGold.value.getHexString()}) a${m.uniforms.uAlpha.value}`;
      if (m.uniforms?.uCool) return 'wind/arc';
      return 'shader';
    }
    if (m.isSpriteMaterial) return `sprite(${m.color.getHexString()}) a${m.opacity} map${m.map ? 'y' : 'n'}`;
    if (m.isPointsMaterial) return `points(${m.color.getHexString()}) a${m.opacity}`;
    if (m.isLineBasicMaterial) return `line(${m.color.getHexString()})`;
    return m.type + (m.color ? `(${m.color.getHexString()})a${m.opacity ?? 1}` : '');
  };
  const chain = (o) => {
    const names = [];
    for (let p = o; p && names.length < 6; p = p.parent) names.push(p.name || p.type);
    return names.join('<');
  };
  const hits = [];
  scene.traverse((o) => {
    const e = o.matrixWorld.elements;
    const d = Math.hypot(e[12], e[13], e[14]);
    if (d > 3.2) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    hits.push({
      d: +d.toFixed(2),
      pos: [+e[12].toFixed(2), +e[13].toFixed(2), +e[14].toFixed(2)],
      type: o.type,
      vis: o.visible,
      count: o.isInstancedMesh ? o.count : undefined,
      geo: o.geometry?.type,
      verts: o.geometry?.attributes?.position?.count ?? 0,
      scale: [+o.scale.x.toFixed(2), +o.scale.y.toFixed(2), +o.scale.z.toFixed(2)],
      mats: ms.filter(Boolean).map(tag).join(' | '),
      up: chain(o),
    });
  });
  return hits;
});
for (const h of near.sort((a, b) => a.d - b.d)) {
  console.log(
    `NEAR d${String(h.d).padStart(5)} y${h.pos[1].toFixed(2).padStart(7)} x${h.pos[0].toFixed(2).padStart(7)} z${h.pos[2].toFixed(2).padStart(7)} ${String(h.type).padEnd(14)}${h.vis ? ' ' : 'HIDDEN       '}${String(h.geo).padEnd(20)} v${String(h.verts).padEnd(5)} s${JSON.stringify(h.scale)} ${h.mats}  «${h.up}»`,
  );
}
await canvas.screenshot({ path: `${OUT}\\probe-parts.png` });
await browser.close();
console.log('probe em', OUT);
