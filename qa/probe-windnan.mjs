// A/B do NaN do vento (report iOS: anéis/lâminas do zéfiro pretos no WebKit).
// O WebKit do Windows NÃO reproduz o defeito: probe-powsemantics provou que o
// ANGLE daqui clampa pow(base<0) para 0.0 (o iPhone/Metal produz NaN). Então a
// injeção de eps abaixo nunca fica PRETA nesta máquina — ela só prova que a
// linha foi encontrada e substituída. Em iPhone real (Safari/App, não dá pra
// rodar node) é que o eps faria a malha inteira escurecer. A checagem séria do
// fix é ESTATICA: pino em windProgression.test.ts (clamp + discard invertido).
//   eps   — soma 2,1e-6 ao escalar o dot do fresnel (base do pow fica negativa
//           em toda a malha, tanto na fonte antiga quanto na clampeada);
//   fix   — desfaz o eps e confere a receita da lição 4 (clamp + discard invertido).
// Uso: node qa/probe-windnan.mjs [saidaDir]
import { mkdirSync } from 'node:fs';
import { webkit } from 'playwright';

const OUT = process.argv[2] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\shots-windnan';
mkdirSync(OUT, { recursive: true });
const URL = process.env.QA_URL ?? 'http://localhost:5173/element-merge/';

const msgs = [];
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 950 }, deviceScaleFactor: 2 });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) msgs.push(`${m.type()}: ${m.text().slice(0, 400)}`);
});
page.on('pageerror', (e) => msgs.push(`pageerror: ${String(e.message ?? e).slice(0, 400)}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);
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
  await page.waitForTimeout(700);
  if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false))
    await page.click('[data-testid="discovery-close"]');
  if (await page.locator('[data-testid="close-bestiary"]').isVisible().catch(() => false))
    await page.click('[data-testid="close-bestiary"]');
  await page.waitForTimeout(400);
};
await spawn('zephyr');
await spawn('golem');

// aproxima a câmera do zéfiro (roda, sem clicar no tabuleiro)
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.42);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(1200);
await canvas.screenshot({ path: `${OUT}\\antes.png` });

// cirurgia: injeta/retira o NaN no fresnel do WIND_FRAG em todos os materiais
// do vento (ShaderMaterial com a linha do pow; dedupe por uuid)
const patch = async (modo) => page.evaluate((m) => {
  const Q = window.__QT;
  if (!Q?.composer) return { err: 'sem __QT.composer' };
  const scene = Q.composer.passes[0].scene;
  const OLD_LINE = 'pow(1.0 - abs(dot(normalize(vNrm), vd)), 1.5)';
  const FIXED_LINE = 'pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 1.5)';
  const seen = new Set();
  const mats = [];
  scene.traverse((o) => {
    const mt = o.material;
    if (!mt || !mt.isShaderMaterial) return;
    for (const one of Array.isArray(mt) ? mt : [mt]) {
      if (seen.has(one.uuid)) continue;
      if (typeof one.fragmentShader === 'string' &&
          (one.fragmentShader.includes(OLD_LINE) || one.fragmentShader.includes(FIXED_LINE) ||
           one.fragmentShader.includes('pow(1.0 - (abs('))) {
        seen.add(one.uuid);
        mats.push(one);
      }
    }
  });
  if (!mats.length) return { err: 'nenhum material do vento com a linha do pow' };
  for (const one of mats) {
    if (m === 'eps') {
      if (one.fragmentShader.includes(OLD_LINE)) {
        one.fragmentShader = one.fragmentShader.replace(
          OLD_LINE,
          'pow(1.0 - (abs(dot(normalize(vNrm), vd)) + 0.0000021), 1.5)'
        );
      } else {
        // fonte já clampeada: o eps entra DEPOIS do clamp (simula o estouro de ULP)
        one.fragmentShader = one.fragmentShader.replace(
          FIXED_LINE,
          'pow(1.0 - (clamp(dot(normalize(vNrm), vd), -1.0, 1.0) + 0.0000021), 1.5)'
        );
      }
    } else if (m === 'fix') {
      one.fragmentShader = one.fragmentShader
        .replace(
          'pow(1.0 - (abs(dot(normalize(vNrm), vd)) + 0.0000021), 1.5)',
          FIXED_LINE
        )
        .replace(
          'pow(1.0 - (clamp(dot(normalize(vNrm), vd), -1.0, 1.0) + 0.0000021), 1.5)',
          FIXED_LINE
        )
        .replace('if (a <= 0.002) discard;', 'if (!(a > 0.002)) discard;');
    }
    one.needsUpdate = true;
  }
  return { mats: mats.length };
}, modo);

console.log('EPS:', JSON.stringify(await patch('eps')));
await page.waitForTimeout(1400);
await canvas.screenshot({ path: `${OUT}\\eps-nan.png` });

console.log('FIX:', JSON.stringify(await patch('fix')));
await page.waitForTimeout(1400);
await canvas.screenshot({ path: `${OUT}\\fix-clamp.png` });

await browser.close();
console.log(`shots em ${OUT}`);
console.log(msgs.length ? msgs.slice(0, 20).join('\n') : 'SEM ERROS/WARNINGS no console');
