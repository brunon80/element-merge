// Legibilidade do PROJETIL em voo, recortado e ampliado — a pergunta que o
// frame aberto da arena nao responde (o tiro tem ~20 px no zoom do jogo).
// Como achamos a camera: nenhum registro nosso expoe o renderer, mas no fiber
// cada Object3D criado por JSX carrega `__r3f` com `.root` — de la sai o estado
// do canvas (camera/gl/size). Com a camera temos projectionMatrix ×
// matrixWorldInverse e projectamos a INSTANCIA do pool na tela: o recorte nasce
// em cima do alvo, nao por chute de cor.
// O tiro e RAPIDO (Nv.8: ~17,7 u/s = ~2 unidades entre uma sonda e o print),
// entao a sonda mede a VELEZITUDE entre duas sondagens, extrapola o tempo do
// screenshot e marca a preducao com uma mira ciã + um anel de 0,3 unidade de
// raio — assim da pra conferir se a mira esta mesmo no alvo e medir o tamanho
// real do tiro em pixels. Cada print sai cru (pixels reais) e 3x ampliado sem
// suavizar (e assim que se le a silhueta).
// Uso: node qa/probe-projectile.mjs <especie> [aliada] [saidaDir] [hexDoNucleo]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const SP = process.argv[2];
const ALLY = process.argv[3] ?? 'golem';
const OUT = process.argv[4] ?? `C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-projectile-${SP}`;
const HEX = (process.argv[5] ?? '').replace('#', '').toLowerCase(); // nucleo do tiro (uGold/uCrack/uRockA)
if (!SP) {
  console.error('uso: node qa/probe-projectile.mjs <especie> [aliada] [saidaDir] [hexDoNucleo]');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const W = 340; // recorte (CSS px) em volta da previsao do alvo
const H = 280;
const ZOOM = 3;
const SHOT_LATENCY = 0.07; // s: do poll ate o pixel do print chegar no recorte

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(() => {
  const et = new EventTarget();
  window.__threeRs = [];
  et.addEventListener('observe', (e) => {
    if (e.detail && e.detail.isScene) window.__threeRs.push(e.detail);
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

const spawn = async (id) => {
  await page.click('[data-testid="open-bestiary"]');
  await page.waitForSelector('[data-testid="bestiary"]');
  await page.click(`[data-testid="debug-spawn-${id}"]`);
  await page.waitForTimeout(600);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
    await page.click('[data-testid="discovery-close"]');
  }
};
await spawn(SP);
if (ALLY && ALLY !== '-') await spawn(ALLY);
await page.waitForTimeout(1600);

const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();

const poll = () =>
  page.evaluate(
    (hex) => {
      const scene = (window.__threeRs || []).find((s) => s && s.isScene);
      if (!scene) return { err: 'sem scene' };
      // o estado do canvas pela alcà `__r3f.root` do fiber: camera, gl, tamanho
      let st = null;
      scene.traverse((o) => {
        if (st || !o.__r3f) return;
        const r = o.__r3f.root;
        if (!r) return;
        st = typeof r.getState === 'function' ? r.getState() : r;
        if (!st?.camera) st = null;
      });
      if (!st) return { err: 'sem estado do canvas (sem __r3f.root)' };
      const cam = st.camera;
      if (!cam.projectionMatrix || !cam.matrixWorldInverse) return { err: 'camera sem matrizes' };
      const mm = (a, b) => {
        const o = new Array(16);
        for (let c = 0; c < 4; c++)
          for (let r = 0; r < 4; r++)
            o[c * 4 + r] =
              a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        return o;
      };
      const pv = mm(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements);
      const proj = (x, y, z) => {
        const w = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
        if (!w) return null;
        return {
          cx: (pv[0] * x + pv[4] * y + pv[8] * z + pv[12]) / w,
          cy: (pv[1] * x + pv[5] * y + pv[9] * z + pv[13]) / w,
        };
      };
      const hits = [];
      const pools = [];
      scene.traverse((o) => {
        if (!o.isInstancedMesh || o.count <= 0) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const u = ms[0]?.uniforms;
        const p = o.geometry?.parameters ?? {};
        pools.push(`${o.geometry?.type}(${[p.radiusTop, p.radiusBottom ?? p.radius, p.height ?? p.detail, p.radialSegments].join(',')})x${o.count}`);
        // so prismas/olidros com raio real (os anéis-decalque e o tabuleiro sao
        // Plane sem raio) e nada miudo demais (farpas de cacos: raio 0,018)
        const rad = p.radiusTop ?? p.radius;
        if (!Number.isFinite(rad) || rad < 0.03) return;
        const gold = u?.uGold?.value?.getHexString?.() ?? null;
        const crack = u?.uCrack?.value?.getHexString?.() ?? null;
        const rock = u?.uRockA?.value?.getHexString?.() ?? null;
        if (hex && ![gold, crack, rock].includes(hex)) return;
        const a = o.instanceMatrix.array;
        const key = `${o.geometry?.type}|${[rock, gold, crack].join('/')}|${[p.radiusTop, p.radiusBottom ?? p.radius, p.height ?? p.detail, p.radialSegments].join(',')}`;
        for (let i = 0; i < o.count; i++) {
          const off = i * 16;
          const at = [a[off + 12], a[off + 13], a[off + 14]];
          const q = proj(at[0], at[1], at[2]);
          if (!q) continue;
          // quanto vale 0,3 unidade de mundo em NDC (regua de tamanho no print)
          const side = proj(at[0] + 0.3, at[1], at[2]) ?? proj(at[0], at[1] + 0.3, at[2]);
          hits.push({
            at,
            rad,
            key,
            idx: i,
            px: q.cx,
            py: q.cy,
            span: side ? Math.hypot(side.cx - q.cx, side.cy - q.cy) : 0,
            geo: `${o.geometry?.type}(${[p.radiusTop, p.radiusBottom ?? p.radius, p.height ?? p.detail, p.radialSegments].join(',')})`,
            rock,
            gold,
            crack,
          });
        }
      });
      return { hits, pools, pv, t: performance.now(), camPos: [...cam.position] };
    },
    HEX || null,
  );

const decorate = async (buf, cx, cy, r03) => {
  const b64 = buf.toString('base64');
  const out = await page.evaluate(
    async ([data, x, y, r, z, css]) => {
      const img = new Image();
      await new Promise((ok, no) => {
        img.onload = ok;
        img.onerror = no;
        img.src = `data:image/png;base64,${data}`;
      });
      const cv = document.createElement('canvas');
      cv.width = img.width * z;
      cv.height = img.height * z;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, cv.width, cv.height);
      // a image tem `css` px de mundo por pixel CSS do recorte -> pixels da image
      const px = (cssPx) => cssPx * (img.width / css) * z;
      const gx = x * (img.width / css) * z;
      const gy = y * (img.height / css) * z;
      g.strokeStyle = '#00e5ff';
      g.lineWidth = Math.max(2, z);
      g.beginPath(); // mira: a posicao prevista do tiro
      g.moveTo(gx - px(14), gy);
      g.lineTo(gx + px(14), gy);
      g.moveTo(gx, gy - px(14));
      g.lineTo(gx, gy + px(14));
      g.stroke();
      g.beginPath(); // anel de 0,3 unidade de raio (a régua de tamanho)
      g.arc(gx, gy, px(r), 0, Math.PI * 2);
      g.stroke();
      return cv.toDataURL('image/png').split(',')[1];
    },
    [b64, cx, cy, r03, ZOOM, W],
  );
  return Buffer.from(out, 'base64');
};

/** NDC pela matriz P·V da ultima sonda (evita uma segunda travessia da cena) */
const projNdc = (pv, x, y, z) => {
  const w = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
  if (!w) return null;
  return {
    cx: (pv[0] * x + pv[4] * y + pv[8] * z + pv[12]) / w,
    cy: (pv[1] * x + pv[5] * y + pv[9] * z + pv[13]) / w,
  };
};

await page.click('[data-testid="start-battle"]');
let shots = 0;
let prevMap = null; // instancia (pool+indice) vista na sonda anterior
let prevT = 0;
for (let i = 0; i < 900 && shots < 6; i++) {
  const s = await poll();
  if (s.err) {
    if (i % 60 === 0) console.log(`t${i} ${s.err}`);
    await page.waitForTimeout(45);
    continue;
  }
  // identidade por INSTANCIA (pool+indice): o pool recicla slots, entao a
  // velocidade so e confiavel entre duas sondas que viram o MESMO slot. So
  // interessa o que esta VOANDO (mais de 3 u/s): o resto e slot parado do pool
  const cur = new Map(s.hits.map((h) => [`${h.key}#${h.idx}`, h]));
  let best = null;
  let bestSpeed = 0;
  const dt = prevMap ? (s.t - prevT) / 1000 : 0;
  if (prevMap && dt > 0.001 && dt < 0.5) {
    for (const [k, h] of cur) {
      const before = prevMap.get(k);
      if (!before) continue;
      const v = [
        (h.at[0] - before.at[0]) / dt,
        (h.at[1] - before.at[1]) / dt,
        (h.at[2] - before.at[2]) / dt,
      ];
      const sp = Math.hypot(...v);
      if (sp > 3 && (sp > bestSpeed || (Math.abs(sp - bestSpeed) < 2 && h.rad > (best?.h.rad ?? 0)))) {
        best = { h, v };
        bestSpeed = sp;
      }
    }
  }
  prevMap = cur;
  prevT = s.t;
  if (best) {
    const f = SHOT_LATENCY;
    const at = [best.h.at[0] + best.v[0] * f, best.h.at[1] + best.v[1] * f, best.h.at[2] + best.v[2] * f];
    const q = projNdc(s.pv, at[0], at[1], at[2]);
    if (q && Number.isFinite(q.cx) && Number.isFinite(q.cy)) {
      const sx = box.x + ((q.cx + 1) / 2) * box.width;
      const sy = box.y + ((1 - q.cy) / 2) * box.height;
      if (sx > box.x + 10 && sx < box.x + box.width - 10 && sy > box.y + 10 && sy < box.y + box.height - 10) {
        const clipX = Math.max(0, Math.min(box.x + box.width - W, sx - W / 2));
        const clipY = Math.max(0, Math.min(box.y + box.height - H, sy - H / 2));
        const name = String(shots).padStart(2, '0');
        const raw = await page.screenshot({ clip: { x: clipX, y: clipY, width: W, height: H } });
        writeFileSync(`${OUT}\\crop-${name}.png`, raw);
        writeFileSync(
          `${OUT}\\big-${name}.png`,
          await decorate(raw, sx - clipX, sy - clipY, best.h.span * box.width, W),
        );
        console.log(
          `shot ${shots} ${best.h.geo}@${JSON.stringify(best.h.at.map((n) => +n.toFixed(2)))} vel=${bestSpeed.toFixed(1)}u/s R${best.h.rock ?? '-'} G${best.h.gold ?? '-'} C${best.h.crack ?? '-'} 0,3u=${(best.h.span * box.width).toFixed(0)}px tela=(${Math.round(sx)},${Math.round(sy)})`,
        );
        shots++;
      }
    }
  }
  if (i % 60 === 0) console.log(`t${i} pools=${JSON.stringify(s.pools)}`);
  await page.waitForTimeout(45);
}
await browser.close();
console.log(`prints: ${shots} (crop + big em ${OUT})`);
