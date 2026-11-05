// Sonda do ⏩ Turbo de combate: o FAB do relógio só existe no COMBATE, cicla
// 1×→3×→5×→1× (data-on + data-scale + aria-pressed + contagem) e os gradientes
// ouro (3×) e ouro→perigo (5×) são o que o navegador realmente calcula. Pino
// de conteúdo do styles.css: o probe busca `src/styles.css?raw` do dev server
// (no vitest o pipeline de CSS stubbeia ?raw, então é aqui que o CSS é
// pinchado).
// Uso: npm run dev + node qa/probe-turbo.mjs [webkit|chromium] [saidaDir]
//   (QA_URL p/ outro servidor; prints do FAB em <saidaDir>/turbo-{off,3,5}.png)
import { webkit, chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[3] ?? tmpdir(); // prints do FAB em <saida>/turbo-{off,3,5}.png
mkdirSync(OUT, { recursive: true });

const URL_APP = process.env.QA_URL ?? 'http://localhost:5173/';
let ENGINE = process.argv[2] ?? 'webkit';

async function openBrowser() {
  if (ENGINE === 'webkit') {
    try {
      return await webkit.launch();
    } catch (e) {
      console.log(
        'webkit indisponivel nesta maquina (' +
          String(e).split('\n')[0] +
          '); fallback: chromium',
      );
      ENGINE = 'chromium';
    }
  }
  return chromium.launch();
}

const browser = await openBrowser();
const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });

const msgs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => msgs.push(`[pageerror] ${String(e).slice(0, 200)}`));

await page.goto(URL_APP, { waitUntil: 'load' });
await page.waitForTimeout(2200);

// exército: uma invocação debug de ignis (qualquer bicho serve — o FAB não
// depende de espécie) e o início do combate
await page.click('[data-testid="open-settings"]');
await page.click('[data-testid="settings-tab-debug"]');
await page.click('[data-testid="debug-toggle"]');
await page.click('[data-testid="close-settings"]');
await page.click('[data-testid="play"]');
await page.waitForSelector('[data-testid="shop"]');
await page.click('[data-testid="open-bestiary"]');
await page.waitForSelector('[data-testid="bestiary"]');
await page.click(`[data-testid="debug-spawn-ignis"]`);
await page.waitForTimeout(900);
if (await page.locator('[data-testid="discovery-overlay"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="discovery-close"]');
}
if (await page.locator('[data-testid="close-bestiary"]').isVisible().catch(() => false)) {
  await page.click('[data-testid="close-bestiary"]'); // o spawn pode fechar o painel sozinho
}
await page.waitForSelector('[data-testid="shop"]');

const fabLoc = page.locator('[data-testid="turbo-fab"]');
const fabPrep = await fabLoc.count(); // preparação: o FAB NÃO pode existir

await page.click('[data-testid="start-battle"]');
await page.waitForSelector('[data-testid="turbo-fab"]', { timeout: 8000 });

const fabBoxDesktop = await fabLoc.boundingBox();
const codexBoxDesktop = await page.locator('[data-testid="open-bestiary"]').boundingBox();

// pino de conteúdo do CSS, lido do dev server como texto puro — SEMPRE
// relativo à página (o servidor tem base /element-merge/; caminhos
// absolutos dariam 404)
const css = await page.evaluate(() =>
  fetch('src/styles.css?raw').then((r) => (r.ok ? r.text() : `HTTP ${r.status}`)),
);
const cssPins = {
  stateGold: css.includes(".turbo-fab[data-on='true']") && css.includes('var(--gold), var(--fire)'),
  stateRed: css.includes(".turbo-fab[data-scale='5']") && css.includes('var(--gold), var(--danger)'),
  desktopRail: css.includes('left: 14px') && css.includes('calc(50% + 84px)'),
  compactRail: css.includes('164px + env(safe-area-inset-top)'),
};

const snap = async () =>
  page.evaluate(() => {
    const b = document.querySelector('[data-testid="turbo-fab"]');
    if (!b) return null;
    return {
      on: b.getAttribute('data-on'),
      scale: b.getAttribute('data-scale'),
      pressed: b.getAttribute('aria-pressed'),
      count: b.querySelector('.turbo-fab-count')?.textContent?.trim(),
      bg: getComputedStyle(b).backgroundImage.slice(0, 120),
    };
  });

const clipFab = async () => {
  const b = await fabLoc.boundingBox();
  return { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 30 };
};

const s1 = await snap(); // 1× discreto
await page.screenshot({ path: join(OUT, 'turbo-off.png'), clip: await clipFab() });
await page.click('[data-testid="turbo-fab"]');
await page.waitForTimeout(300);
const s3 = await snap(); // 3× em ouro
await page.screenshot({ path: join(OUT, 'turbo-3.png'), clip: await clipFab() });
await page.click('[data-testid="turbo-fab"]');
await page.waitForTimeout(300);
const s5 = await snap(); // 5× ouro→perigo
await page.screenshot({ path: join(OUT, 'turbo-5.png'), clip: await clipFab() });
await page.click('[data-testid="turbo-fab"]');
await page.waitForTimeout(300);
const s1Again = await snap(); // o ciclo fecha voltando a 1×

const bgGold3 = /rgb\(245,\s*196,\s*81\)/.test(s3?.bg ?? '') && /rgb\(255,\s*122,\s*61\)/.test(s3?.bg ?? '');
const bgRed5 = /rgb\(245,\s*196,\s*81\)/.test(s5?.bg ?? '') && /rgb\(255,\s*93,\s*115\)/.test(s5?.bg ?? '');

// compacto (390×844 = celular): o FAB cai para a coluna esquerda abaixo do
// toast e continua debaixo do codex em qualquer largura
await page.setViewportSize({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.waitForTimeout(500);
const fabBoxMobile = await fabLoc.boundingBox();
const codexBoxMobile = await page.locator('[data-testid="open-bestiary"]').boundingBox();

await browser.close();

const railOkDesktop =
  fabBoxDesktop !== null &&
  fabBoxDesktop.x < 90 &&
  codexBoxDesktop !== null &&
  fabBoxDesktop.y >= codexBoxDesktop.y + codexBoxDesktop.height + 6;
const railOkMobile =
  fabBoxMobile !== null &&
  fabBoxMobile.x < 70 &&
  fabBoxMobile.y >= 150 && // abaixo da faixa do toast
  codexBoxMobile !== null &&
  fabBoxMobile.y >= codexBoxMobile.y + codexBoxMobile.height + 6;

console.log('TURBO', JSON.stringify({
  engine: ENGINE,
  fabNaPreparacao: fabPrep, // deve ser 0
  fabNoCombate: fabBoxDesktop !== null,
  s1,
  s3,
  s5,
  s1Again,
  cicloOk:
    s1?.on === 'false' && s3?.on === 'true' && s5?.on === 'true' && s1Again?.on === 'false' &&
    s1?.scale === '1' && s3?.scale === '3' && s5?.scale === '5' && s1Again?.scale === '1' &&
    s1?.count === '1×' && s3?.count === '3×' && s5?.count === '5×' && s1Again?.count === '1×' &&
    s1?.pressed === 'false' && s3?.pressed === 'true' && s5?.pressed === 'true' && s1Again?.pressed === 'false',
  bgGold3,
  bgRed5,
  bgDistintos: s1?.bg !== s3?.bg && s3?.bg !== s5?.bg && s1?.bg !== s5?.bg,
  cssPins,
  railOkDesktop,
  railOkMobile,
  fabBoxDesktop,
  fabBoxMobile,
}, null, 1));
console.log('CONSOLE:', msgs.length);
for (const m of msgs) console.log(' ', m);
