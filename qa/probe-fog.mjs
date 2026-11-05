// Sonda do 🌫️ FOG ADAPTIVO (src/scene/AdaptiveFog.tsx): mede a densidade de
// neblina que a vegetação do anel externo REALMENTE recebe em cada cenário,
// nas duas calibrações de câmera que importam — celular retrato (390×844,
// câmera a ~2,3R) e desktop de janela larga (1600×900, câmera baixa a 1,316R)
// — mais o zoom máximo da órbita. O defeito cobrado pelo usuário: fog fixo
// engolia as árvores da floresta no mobile. A sonda lê a cena viva via
// __THREE_DEVTOOLS__ (collector instalado com addInitScript ANTES do bundle),
// varre as instâncias dos ambientes (InstancedMesh.instanceMatrix) na faixa
// ARENA_R+4 .. ARENA_R+92 com −2<y<22 (vegetação/rochas; lua/céu ficam de
// fora), projeta na direção da câmera e aponta a PIOR folha (t=1 some no fog).
// Meta: pior t ≤ 0,55 em todo cenário vivo (universe-end NEM tem fog).
// Uso: npm run dev + node qa/probe-fog.mjs [webkit|chromium] [saidaDir]
import { webkit, chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[3] ?? tmpdir();
mkdirSync(OUT, { recursive: true });
const URL_APP = process.env.QA_URL ?? 'http://localhost:5173/';
let ENGINE = process.argv[2] ?? 'webkit';

async function openBrowser() {
  if (ENGINE === 'webkit') {
    try {
      return await webkit.launch();
    } catch (e) {
      console.log('webkit indisponivel; fallback: chromium');
      ENGINE = 'chromium';
    }
  }
  return chromium.launch();
}

const browser = await openBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

// collector de cena ANTES do bundle rodar (three registra só as Scene)
await page.addInitScript(() => {
  window.__scenes = [];
  window.__THREE_DEVTOOLS__ = {
    dispatchEvent: (ev) => {
      const d = ev && ev.detail;
      if (d && d.isScene) window.__scenes.push(d);
    },
  };
});

const msgs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => msgs.push(`[pageerror] ${String(e).slice(0, 200)}`));

await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForTimeout(2200);

const ARENA_R = 23.1;

const measure = () =>
  page.evaluate((R) => {
    const scenes = (window.__scenes || []).filter((s) => s && s.isScene);
    let scene = null;
    let best = -1;
    for (const s of scenes) {
      let n = 0;
      s.traverse(() => n++);
      if (n > best) {
        best = n;
        scene = s;
      }
    }
    if (!scene) return { err: 'sem cena' };
    scene.updateMatrixWorld(true);
    const fog = scene.fog;
    let camera = null;
    scene.traverse((o) => {
      if (!camera && o.__r3f) {
        try {
          const st = o.__r3f.root.getState();
          if (st && st.camera && st.camera.isPerspectiveCamera) camera = st.camera;
        } catch (e) {}
      }
    });
    if (!camera) return { err: 'sem camera' };
    camera.updateMatrixWorld(true);
    const viewDir = camera.up.clone().set(0, 0, 0);
    camera.getWorldDirection(viewDir);
    const camPos = camera.position;
    const scratch = camPos.clone();
    let worst = 0;
    let worstR = 0;
    let samples = 0;
    let heavy = 0;
    const consider = (x, y, z, mw) => {
      scratch.set(x, y, z);
      if (mw) scratch.applyMatrix4(mw);
      const r = Math.hypot(scratch.x, scratch.z);
      if (r < R + 4 || r > R + 104) return;
      if (scratch.y < -2 || scratch.y > 26) return; // lua/céu começam a y 32
      samples++;
      if (!fog) return;
      const depth =
        (scratch.x - camPos.x) * viewDir.x +
        (scratch.y - camPos.y) * viewDir.y +
        (scratch.z - camPos.z) * viewDir.z;
      const t = Math.min(1, Math.max(0, (depth - fog.near) / (fog.far - fog.near)));
      if (t > 0.55) heavy++;
      if (t > worst) {
        worst = t;
        worstR = r;
      }
    };
    scene.traverse((o) => {
      if (o.isInstancedMesh && o.instanceMatrix && o.instanceMatrix.array) {
        const a = o.instanceMatrix.array;
        const n = Math.min(o.count, 1200);
        for (let i = 0; i < n; i++) {
          const b = i * 16;
          consider(a[b + 12], a[b + 13], a[b + 14], o.matrixWorld);
        }
      } else if (o.isMesh) {
        consider(o.position.x, o.position.y, o.position.z, o.matrixWorld);
      }
    });
    return {
      temFog: !!fog,
      near: fog ? +fog.near.toFixed(1) : null,
      far: fog ? +fog.far.toFixed(1) : null,
      camDist: fog ? +(fog.near - R * 0.4).toFixed(1) : null,
      amostras: samples,
      piorT: +worst.toFixed(2),
      piorR: +worstR.toFixed(1),
      acimaDe055: heavy,
    };
  }, ARENA_R);

const SCENES = ['forest', 'ice', 'volcanic', 'underwater', 'arcane', 'universe-end'];
const results = {};

for (const sc of SCENES) {
  await page.click('[data-testid="open-settings"]');
  await page.click('[data-testid="settings-tab-scenario"]');
  await page.click(`[data-testid="scenario-${sc}"]`);
  await page.click('[data-testid="close-settings"]');
  await page.waitForTimeout(2600);

  // retrato de celular: a calibração CAMERA_POS (~2,3R) — era onde a floresta
  // sumia; print para aprovação visual
  await page.setViewportSize({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.waitForTimeout(900);
  const mobile = await measure();
  await page.screenshot({ path: join(OUT, `fog-${sc}-390.png`) });

  // desktop de janela larga: enquadro baixo novo (1,316R)
  await page.setViewportSize({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.waitForTimeout(900);
  const desktop = await measure();
  if (sc === 'forest') await page.screenshot({ path: join(OUT, 'fog-forest-1600.png') });

  // zoom máximo da órbita: empurra a CÂMERA para longe; o OrbitControls a
  // puxa de volta no teto do cenário (maxDistance) no frame seguinte
  await page.evaluate((R) => {
    const scenes = (window.__scenes || []).filter((s) => s && s.isScene);
    let scene = null;
    let best = -1;
    for (const s of scenes) {
      let n = 0;
      s.traverse(() => n++);
      if (n > best) {
        best = n;
        scene = s;
      }
    }
    if (!scene) return;
    let camera = null;
    scene.traverse((o) => {
      if (!camera && o.__r3f) {
        try {
          const st = o.__r3f.root.getState();
          if (st && st.camera && st.camera.isPerspectiveCamera) camera = st.camera;
        } catch (e) {}
      }
    });
    if (!camera) return;
    camera.position.set(0, R * 1.2, R * 3.4); // além de qualquer teto; o clamp manda
  }, ARENA_R);
  await page.waitForTimeout(900);
  const zoomed = await measure();

  results[sc] = { mobile, desktop, zoomed };
}

await browser.close();

const ok = (m) => m.temFog === false ? 'nofog' : m.piorT <= 0.55;
const veredito = {};
for (const [sc, r] of Object.entries(results)) {
  if (sc === 'universe-end') {
    veredito[sc] = r.mobile.temFog === false && r.desktop.temFog === false;
  } else {
    veredito[sc] = ok(r.mobile) && ok(r.desktop) && ok(r.zoomed);
  }
}

console.log('FOG', JSON.stringify({ engine: ENGINE, results, veredito, tudoVerde: Object.values(veredito).every(Boolean) }, null, 1));
console.log('CONSOLE:', msgs.length);
for (const m of msgs) console.log(' ', m);
