// Sonda de depuração: LOCALIZA o quadrilátero claro que aparece no chão dos
// prints da Obsidiana. Esconde candidatos por CLASSE (placas de slot do
// tabuleiro, marcador dourado, laje de vidro da criatura, placas de sombra) e
// tira um print por passo; a leitura é feita depois, comparando os prints.
// Uso: node qa/probe-quad.mjs <especie>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SPECIES = process.argv[2] ?? 'obsidiana';
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

await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
await page.click(`[data-testid="debug-spawn-${SPECIES}"]`);
await page.waitForTimeout(600);
if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="discovery-close"]');
}
await page.waitForTimeout(2500);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -1400);
await page.waitForTimeout(900);

// inventário uma vez, com um id estável por mesh (índice do traverse)
await page.evaluate(() => {
  const scene = (window.__threeRs || []).find((s) => s && s.isScene);
  window.__SCENE = scene;
  let i = 0;
  const map = new Map();
  scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh)) return;
    o.userData.probeId = i;
    map.set(i, o);
    i++;
  });
  window.__MAP = map;
  const p = (o) => (o.geometry?.parameters || {});
  const wp = (o) => [o.matrixWorld.elements[12], o.matrixWorld.elements[13], o.matrixWorld.elements[14]];
  const basic = (o) => (Array.isArray(o.material) ? o.material : [o.material]).some((m) => m?.type === 'MeshBasicMaterial');
  window.__CLASSES = {
    // placas de slot (2.112 de largura) espalhadas pelo tabuleiro
    slots: [...map.values()].filter((o) => p(o).width === 2.112 && basic(o)),
    // placa dourada/âmbar sob a unidade recém-spawnada
    gold: [...map.values()].filter((o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      return m?.type === 'MeshBasicMaterial' && m?.color?.getHexString() === 'e0b96a';
    }),
    // laje de vidro da própria criatura (material de ice, rente ao chão)
    slab: [...map.values()].filter((o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      return m?.uniforms?.uIceA && wp(o)[1] < 0.5;
    }),
    // qualquer MeshBasicMaterial rente ao chão (marcadores/sombra)
    groundBasic: [...map.values()].filter((o) => wp(o)[1] < 0.45 && basic(o)),
  };
  return Object.fromEntries(Object.entries(window.__CLASSES).map(([k, v]) => [k, v.length]));
}).then((counts) => console.log('classes:', JSON.stringify(counts)));

const shot = async (name) => {
  await page.waitForTimeout(450);
  await canvas.screenshot({ path: `${OUT}\\quad-${name}.png` });
};

const hide = (cls) =>
  page.evaluate((c) => {
    for (const o of window.__CLASSES[c]) o.userData.wasVisible = o.visible, (o.visible = false);
  }, cls);
const showAll = () =>
  page.evaluate(() => {
    for (const [i, o] of window.__MAP) {
      if (o.userData.wasVisible !== undefined) {
        o.visible = o.userData.wasVisible;
        delete o.userData.wasVisible;
      }
      void i;
    }
  });

await shot('00-baseline');
await hide('slots');
await shot('01-no-slots');
await showAll();
await hide('gold');
await shot('02-no-gold');
await showAll();
await hide('slab');
await shot('03-no-slab');
await showAll();
await hide('groundBasic');
await shot('04-no-ground-basic');
await showAll();

await browser.close();
console.log('probe em', OUT);
