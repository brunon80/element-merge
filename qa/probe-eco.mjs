// Sonda do 🔋 MODO ECONÔMICO (battery). Mede o efeito VIVO das cinco alavancas
// no pipeline render vivo (via __THREE_DEVTOOLS__ + estado r3f):
//  1) fps real do canvas: cheio ~60 → econômico ~30 (batimento demand);
//  2) dpr efetivo do renderer: 2 → 1,25 (em viewport dsf 2);
//  3) shadowMap.autoUpdate: true no jogo, FALSE no menu econômico (cacheada);
//  4) UA de iPhone: o AUTO liga o eco sozinho (data-eco no shell);
//  5) combate no eco continua vivo (FAB do turbo existe, motor a 30 Hz).
// O rAF do WebKit headless NÃO tem o teto de 60 Hz do vsync — 'cheio' sai
// daqui com centenas de fps; no iPhone real cheio=60 e eco≈30. A sonda
// confere a RAZÃO (eco ≤ 0,85× cheio) e os flags exatos de sombra/dpr.
// Uso: npm run dev + node qa/probe-eco.mjs [saidaDir]
import { webkit, chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? tmpdir();
mkdirSync(OUT, { recursive: true });
const URL_APP = process.env.QA_URL ?? 'http://localhost:5173/';

const COLLECTOR = () => {
  window.__scenes = [];
  window.__THREE_DEVTOOLS__ = {
    dispatchEvent: (ev) => {
      const d = ev && ev.detail;
      if (d && d.isScene) window.__scenes.push(d);
    },
  };
};

const MEASURE = () =>
  window.__measure();

const CAMPOS = () => window.__camPos();

function installMeasure(page) {
  return page.evaluate(() => {
    window.__measure = async (ms = 2000) => {
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
      let gl = null;
      scene.traverse((o) => {
        if (!gl && o.__r3f) {
          try {
            const st = o.__r3f.root.getState();
            if (st && st.gl && st.gl.info) gl = st.gl;
          } catch (e) {}
        }
      });
      if (!gl) return { err: 'sem renderer' };
      const f0 = gl.info.render.frame;
      await new Promise((r) => setTimeout(r, ms));
      const f1 = gl.info.render.frame;
      return {
        fps: +(((f1 - f0) / ms) * 1000).toFixed(1),
        dpr: +gl.getPixelRatio().toFixed(2),
        winDpr: window.devicePixelRatio,
        shadows: gl.shadowMap.enabled,
        autoUpdate: gl.shadowMap.autoUpdate,
      };
    };
    // posição da câmera viva (para a sonda provar que o arraste girou MESMO)
    window.__camPos = () => {
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
      if (!scene) return null;
      let cam = null;
      scene.traverse((o) => {
        if (!cam && o.__r3f) {
          try {
            const st = o.__r3f.root.getState();
            if (st && st.camera) cam = st.camera;
          } catch (e) {}
        }
      });
      return cam ? [+cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3)] : null;
    };
  });
}

const msgs = [];
const wireConsole = (page) => {
  const ok = (t) => !t.includes('GL Driver Message') && !t.includes('GPU stall'); // readback do próprio Playwright (screenshot), não do jogo
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && ok(m.text())) msgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${String(e).slice(0, 200)}`));
};

// ── bloco A: WebKit desktop (render de verdade) — eco por toggle manual ──────
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844, deviceScaleFactor: 2 } });
await page.addInitScript(COLLECTOR);
wireConsole(page);
await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForTimeout(2400);
await installMeasure(page);

// baseline em modo CHEIO (webkit desktop: o auto não liga o eco sozinho)
const cheio = { menu0: await page.evaluate(MEASURE) };

// floresta como cenário (mesmo terreno das outras sondas)
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-scenario"]');
await page.click('[data-testid="scenario-forest"]');
await page.waitForTimeout(400);

// painel Gráficos agora tem o radiogroup do desempenho
await page.click('[data-testid="settings-tab-graphics"]');
const ecoHintCheio = await page.locator('[data-testid="perf-eco-active"]').count();
await page.screenshot({ path: join(OUT, 'eco-settings-390.png') });
await page.click('[data-testid="perf-mode-eco"]');
await page.waitForTimeout(500);
const ecoHintEco = await page.locator('[data-testid="perf-eco-active"]').count();
await page.click('[data-testid="close-settings"]');
await page.waitForTimeout(1200);

const eco = { menu: await page.evaluate(MEASURE) };
await page.screenshot({ path: join(OUT, 'eco-floresta-eco-390.png') });

// combate no eco: debug-spawn + start-battle (o motor caiu para 30 Hz também)
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
await page.click('[data-testid="debug-spawn-ignis"]');
if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="discovery-close"]');
}
if (await page.locator('[data-testid="close-bestiary"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="close-bestiary"]');
}
await page.waitForSelector('[data-testid="shop"]');
await page.click('[data-testid="start-battle"]');
await page.waitForSelector('[data-testid="turbo-fab"]', { timeout: 8000 });
eco.combate = await page.evaluate(MEASURE);
eco.shadowCombate = await page.evaluate(() => {
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
  let gl = null;
  scene.traverse((o) => {
    if (!gl && o.__r3f) {
      try {
        const st = o.__r3f.root.getState();
        if (st && st.gl && st.gl.info) gl = st.gl;
      } catch (e) {}
    }
  });
  return { fpsFabVivo: true, autoUpdate: gl.shadowMap.autoUpdate };
});

// ── vazão de órbita no COMBATE: o teto de 30 Hz do demand precisa valer
// DEPOIS do giro ── no menu mobile a canvas fica COBERTA pelos painéis do
// menu (elementFromPoint entrega .menu-card em todo canto), então a órbita
// é medida onde a canvas manda: o céu aberto do tabuleiro de combate.
// A inércia (damping) do OrbitControls continua emitindo 'change' depois que
// o ponteiro sai, e cada 'change' invalida o canvas demand — se a cauda
// renderizar a 60 Hz, o teto econômico só valia enquanto a cena estava quieta.
const flickPoint = [300, 260];
const flickHit = await page.evaluate(
  ([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${String(el.className).slice(0, 30)}` : 'null';
  },
  flickPoint,
);
const cam0 = await page.evaluate(CAMPOS);
await page.mouse.move(flickPoint[0], flickPoint[1]);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  await page.mouse.move(flickPoint[0] - i * 11, flickPoint[1]);
  await page.waitForTimeout(40);
}
await page.mouse.up();
const cam1 = await page.evaluate(CAMPOS);
const camDelta = cam0 && cam1 ? Math.hypot(cam0[0] - cam1[0], cam0[1] - cam1[1], cam0[2] - cam1[2]) : 0;
const flick = await page.evaluate(MEASURE); // cauda de ~2 s com o dedo já fora da tela

// volta ao cheio no meio do combate: o fps sobe de novo
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-graphics"]');
await page.click('[data-testid="perf-mode-full"]');
await page.click('[data-testid="close-settings"]');
await page.waitForTimeout(1200);
cheio.combate = await page.evaluate(MEASURE);
await browser.close();

// ── bloco B: UA de iPhone — o AUTO acende o eco sem ninguém clicar ───────────
const b2 = await chromium.launch();
const iphone = await b2.newContext({
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  hasTouch: true,
  isMobile: true,
});
const p2 = await iphone.newPage();
wireConsole(p2);
await p2.goto(URL_APP, { waitUntil: 'load' });
await p2.waitForTimeout(2400);
const uaEco = await p2.evaluate(() => {
  const shell = document.querySelector('.app-shell');
  const canvas = document.querySelector('canvas');
  return {
    dataEco: shell ? shell.getAttribute('data-eco') : null,
    canvasRatio: canvas ? +(canvas.width / canvas.clientWidth).toFixed(2) : null,
  };
});
await iphone.close();
await b2.close();

// ── veredito ─────────────────────────────────────────────────────────────────
// dpr efetivo do r3f = clamp(devicePixelRatio, dpr[0], dpr[1]); no headless o
// devicePixelRatio é 1 — o teto 1,25 só pega de verdade num aparelho real.
const clampDpr = (win, lo, hi) => Math.min(Math.max(win, lo), hi);
const okCheio =
  cheio.menu0.fps > 40 &&
  cheio.menu0.dpr === clampDpr(cheio.menu0.winDpr, 1, 2) &&
  cheio.menu0.autoUpdate === true;
const okEcoMenu =
  eco.menu.fps >= 20 &&
  eco.menu.fps <= 36 &&
  eco.menu.dpr === clampDpr(eco.menu.winDpr, 1, 1.25) &&
  eco.menu.autoUpdate === false;
const okEcoMenorQueCheio = eco.menu.fps < cheio.menu0.fps * 0.85;
const okCombateEco = eco.combate.fps >= 20 && eco.combate.fps <= 36 && eco.shadowCombate.autoUpdate === true;
const okVoltaCheia = cheio.combate.fps >= eco.combate.fps * 1.4;
const okToggleUi = ecoHintCheio === 0 && ecoHintEco === 1;
const okUA = uaEco.dataEco === 'on';
// o arraste tem que ter girado a câmera DE VERDADE (senão a medição seguinte
// não diria nada) e a cauda pós-soltar tem que respeitar o teto de 30 Hz
const okOrbitCap = camDelta > 0.3 && flick.fps <= 36;

const veredito = {
  cheioMenu: okCheio,
  ecoMenu: okEcoMenu && okEcoMenorQueCheio,
  combateNoEco: okCombateEco,
  voltaAoCheioSobeFps: okVoltaCheia,
  toggleNoPainel: okToggleUi,
  iPhoneUaLigaEcoSozinho: okUA,
  orbitCapMantido: okOrbitCap,
  tudoVerde:
    okCheio && okEcoMenu && okEcoMenorQueCheio && okCombateEco && okVoltaCheia &&
    okToggleUi && okUA && okOrbitCap,
};
console.log(
  'ECO',
  JSON.stringify({ cheio, eco, flick: { ...flick, camDelta, hit: flickHit }, uaEco, ecoHintCheio, ecoHintEco, veredito }, null, 1),
);
console.log('CONSOLE:', msgs.length);
for (const m of msgs) console.log(' ', m);
