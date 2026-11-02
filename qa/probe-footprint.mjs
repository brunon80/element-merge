// Sonda de INVÓLUCRO EM MUNDO REAL: mede, na cena viva, a caixa delimitadora de
// cada unidade (só as malhas do figurino — HUD, anel de seleção e hitbox ficam
// de fora) e diz se o figurino CABE no slot e se ele invade o slot vizinho.
// É a resposta objetiva para "o monstro tem que caber no spot sem sobrepor".
//
// Uso:  node qa/probe-footprint.mjs [especie ...]   (default: as pesadas da árvore)
// Amb:  QA_URL (default http://localhost:5173/element-merge/), QA_W/QA_H, QA_OUT
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SPECIES = process.argv.slice(2);
if (!SPECIES.length) {
  SPECIES.push(
    'colosso',
    'astral',
    'vulcanico',
    'abissal',
    'cosmico',
    'geodo',
    'tempestade',
    'cristal',
    'nevoa',
    'areia',
    'gelo',
    'vapor',
  );
}
const OUT =
  process.env.QA_OUT ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\footprint';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: {
    width: Number(process.env.QA_W ?? 1280),
    height: Number(process.env.QA_H ?? 800),
  },
});
const msgs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));

// captura a cena pelo registro do three devtools (o padrão das sondas irmãs)
await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    const d = e.detail;
    if (d && (d.isScene || d.isWebGLRenderer)) window.__threeRs.push(d);
  });
  window.__THREE_DEVTOOLS__ = et;
});

await page.goto(process.env.QA_URL ?? 'http://localhost:5173/element-merge/', {
  waitUntil: 'networkidle',
});
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');

for (const spec of SPECIES) {
  // aceita "especie" ou "especie@nivel" (os puros têm seletor de forma no card)
  const [id, lvl] = spec.split('@');
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  const btn = page.locator(`[data-testid="debug-spawn-${id}"]`);
  if (await btn.count()) {
    if (lvl) {
      const lvBtn = page.locator(`[data-testid="debug-level-${id}-${lvl}"]`);
      if (await lvBtn.count()) await lvBtn.click();
    }
    await btn.click();
    await page.waitForTimeout(450);
    if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
      await page.click('[data-testid="discovery-close"]');
    }
  } else {
    console.log(`(sem botão de spawn para ${id})`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
await page.waitForTimeout(3000); // a escala de spawn entra em 0,45 s

const probe = await page.evaluate(() => {
  const scene = (window.__threeRs || []).find((s) => s && s.isScene);
  if (!scene) return { err: 'sem cena no registro devtools' };
  scene.updateMatrixWorld(true);

  const corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);

  // caixa acumulada à mão: o probe não importa three, só lê o que a cena já tem
  const newBox = () => ({
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  });
  const isEmpty = (b) => b.minX > b.maxX;
  const addGeo = (box, geo, e) => {
    if (!geo) return;
    let b = geo.boundingBox;
    if (!b) {
      geo.computeBoundingBox();
      b = geo.boundingBox;
    }
    if (!b) return;
    for (const [sx, sy, sz] of corners) {
      const px = sx < 0 ? b.min.x : b.max.x;
      const py = sy < 0 ? b.min.y : b.max.y;
      const pz = sz < 0 ? b.min.z : b.max.z;
      const wx = e[0] * px + e[4] * py + e[8] * pz + e[12];
      const wy = e[1] * px + e[5] * py + e[9] * pz + e[13];
      const wz = e[2] * px + e[6] * py + e[10] * pz + e[14];
      if (wx < box.minX) box.minX = wx;
      if (wx > box.maxX) box.maxX = wx;
      if (wy < box.minY) box.minY = wy;
      if (wy > box.maxY) box.maxY = wy;
      if (wz < box.minZ) box.minZ = wz;
      if (wz > box.maxZ) box.maxZ = wz;
    }
  };

  const units = [];
  scene.traverse((o) => {
    if (!o.userData || o.userData.unitId === undefined) return;
    const box = newBox();
    const skip = new Set(['hud', 'selring', 'hitbox']);
    const walk = (child) => {
      if (skip.has(child.name)) return;
      if (child.isMesh && child.visible) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        if (mats.every((m) => m && m.visible !== false)) {
          addGeo(box, child.geometry, child.matrixWorld.elements);
        }
      }
      for (const c of child.children) walk(c);
    };
    for (const c of o.children) walk(c);
    if (isEmpty(box)) return;
    const s = o.scale.x || 1;
    // origem da unidade = centro do slot (a posição do motor). As meias-medidas
    // AUTHORED (÷ escala da raiz) são o que entra na tabela de footprint.
    const ox = o.getWorldPosition ? o.getWorldPosition(o.position.clone()) : o.position;
    units.push({
      unitId: o.userData.unitId,
      species: o.userData.species,
      level: o.userData.level,
      ox: ox.x,
      oz: ox.z,
      // extensões medidas a partir do CENTRO DO SLOT (o que sobe para fora do buraco)
      aRight: (box.maxX - ox.x) / s,
      aLeft: (ox.x - box.minX) / s,
      aFwd: (box.maxZ - ox.z) / s,
      aBack: (ox.z - box.minZ) / s,
      aTop: (box.maxY - ox.y) / s,
      // caixa em mundo real (já escalada) serve para o teste de sobreposição
      minX: box.minX,
      maxX: box.maxX,
      minZ: box.minZ,
      maxZ: box.maxZ,
      maxY: box.maxY,
      rootScale: s,
      // o MESGO invólucro em MUNDO REAL (autoral × escala da raiz): é isto que o
      // jogador vê e é isto que tem que caber no buraco — a medida autoral serve
      // só para alimentar a tabela `data/footprints.ts`
      wLeft: (ox.x - box.minX),
      wRight: (box.maxX - ox.x),
      wBack: (ox.z - box.minZ),
      wFwd: (box.maxZ - ox.z),
      wTop: (box.maxY - ox.y),
    });
  });
  units.sort((a, b) => a.unitId - b.unitId);

  const overlaps = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const px = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const pz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (px > 0.02 && pz > 0.02) {
        overlaps.push({
          ia: a.unitId,
          ib: b.unitId,
          a: a.species,
          b: b.species,
          px: +px.toFixed(2),
          pz: +pz.toFixed(2),
        });
      }
    }
  }

  let far = 0;
  for (const u of units) {
    far = Math.max(
      far,
      Math.hypot(u.maxX, u.maxZ),
      Math.hypot(u.minX, u.maxZ),
      Math.hypot(u.maxX, u.minZ),
      Math.hypot(u.minX, u.minZ),
    );
  }
  return { units, overlaps, far };
});

if (probe.err) {
  console.log('ERRO:', probe.err);
  await page.screenshot({ path: `${OUT}\\footprint-erro.png` });
  process.exit(1);
}

const capX = Number(process.env.QA_SLOT_X_HALF ?? 2.6);
const capZ = Number(process.env.QA_SLOT_Z_HALF ?? 2.6);
/** anel do buraco desenhado na arena (`MONSTER_FOOT_R`): a regra de projeto */
const footR = Number(process.env.QA_FOOT_R ?? 2.5);
console.log(
  `\ninvólucro EM MUNDO REAL (o que o jogador vê) e a medida AUTHORED (o que vai` +
    ` na tabela); célula = ${2 * capX} × ${2 * capZ}, anel do buraco r=${footR}`,
);
console.log(
  'UNIDADE               nv  esc   MUNDO Z(trás/fte)  X(esq/dir)   topo  autoral Z / X   no buraco?   no anel?',
);
let needX = 0;
let needZ = 0;
for (const u of probe.units) {
  const xb = Math.max(u.wLeft, u.wRight); // envergadura em mundo real
  const zf = Math.max(u.wBack, u.wFwd); // profundidade em mundo real
  needX = Math.max(needX, xb);
  needZ = Math.max(needZ, zf);
  const cell = xb <= capX + 1e-3 && zf <= capZ + 1e-3;
  const ring = xb <= footR + 1e-3 && zf <= footR + 1e-3;
  console.log(
    `${u.species.padEnd(20)}${String(u.level).padEnd(4)}${u.rootScale.toFixed(2).padStart(5)}` +
      `   ${u.wBack.toFixed(2).padStart(6)} /${u.wFwd.toFixed(2).padStart(6)}` +
      `   ${u.wLeft.toFixed(2).padStart(6)} /${u.wRight.toFixed(2).padStart(6)}` +
      `   ${u.wTop.toFixed(2).padStart(6)}` +
      `   ${u.aBack.toFixed(2)} /${u.aRight.toFixed(2)}` +
      `      ${cell ? 'SIM' : `NÃO (precisa ${Math.max(xb, zf).toFixed(2)})`}` +
      `      ${ring ? 'SIM' : `NÃO (${Math.max(xb, zf).toFixed(2)} > ${footR})`}`,
  );
}
console.log(`\nmaior invólucro em mundo real: X ${needX.toFixed(2)}  Z ${needZ.toFixed(2)}`);
console.log(`canto mais longe do centro ocupado: ${probe.far.toFixed(2)}`);
console.log(`\nSOBREPOSIÇÕES de invólucro entre unidades: ${probe.overlaps.length}`);
for (const o of probe.overlaps) {
  console.log(`  #${o.ia} ${o.a} × #${o.ib} ${o.b}: penetração x=${o.px} z=${o.pz}`);
}

const canvas = page.locator('canvas').first();
await canvas.screenshot({ path: `${OUT}\\footprint-arena.png` });
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -1200);
await page.waitForTimeout(900);
await canvas.screenshot({ path: `${OUT}\\footprint-arena-zoomout.png` });

console.log(`\nconsole: ${msgs.length ? msgs.join('\n') : 'SEM ERROS/WARNINGS'}`);
console.log(`prints em ${OUT}`);
await browser.close();
