// Sonda do site PUBLICADO no GitHub Pages: confere que os DOIS mundos do mesmo
// site entregam as configurações de gráficos VIVAS — aba "✨ Gráficos" aberta,
// os três botões do modo de desempenho (perf-mode-auto/full/eco) e o slider do
// bloom. A raiz é sempre o build da main e /dev/ é o preview da dev; se a raiz
// ficar atrasada em conteúdo (marcadores de código ausentes no bundle publicado),
// é o bug do `dist-main/` commitado voltando (06/nov: o 2º checkout do deploy
// trocava o build recém-feito pelo commitado e o Pages publicava código de dias
// atrás com o job verde).
//
// Uso: node qa/probe-site-live.mjs [saidaDir]
//   QA_BASE p/ outro host (default https://brunon80.github.io/element-merge/)
//   prints em <saidaDir>/live-{root,dev}.png
//
// A sonda recarrega a página uma vez para passar também pelo caminho do service
// worker (o cache do aparelho é o que segura casca velha depois de um deploy).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? tmpdir();
mkdirSync(OUT, { recursive: true });
const BASE = (process.env.QA_BASE ?? 'https://brunon80.github.io/element-merge/').replace(/\/+$/, '');
const WORLDS = [
  { name: 'root', path: '/', label: 'produção (raiz, build da main)' },
  { name: 'dev', path: '/dev/', label: 'preview (/dev/, build da dev)' },
];

const browser = await chromium.launch();
const rows = [];
let broke = 0;

for (const world of WORLDS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const url = `${BASE}${world.path}?probe=${Date.now()}`; // fura o max-age=600 do CDN
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="open-settings"]', { timeout: 30_000 });

  // segunda passada: já com SW instalado (network-first na navegação), igual ao
  // aparelho de quem jogou antes do deploy
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="open-settings"]', { timeout: 30_000 });

  const pageUrl = new URL(url);
  const indexHtml = await (await fetch(url)).text();
  const scriptSrc = /<script type="module"[^>]*src="([^"]+)"/.exec(indexHtml)?.[1] ?? '';
  const bundleUrl = new URL(scriptSrc, pageUrl);
  const swUrl = new URL('sw.js', pageUrl); // resolve no diretório do próprio mundo
  const swText = await (await fetch(`${swUrl}?probe=${Date.now()}`)).text();
  const cacheName = /ebma-\$\{SITE_DIR\}-v\d+/.exec(swText)?.[0] ?? '?';

  await page.click('[data-testid="open-settings"]');
  await page.waitForSelector('[data-testid="settings-menu"]');
  await page.click('[data-testid="settings-tab-graphics"]');
  const found = await page.evaluate(() => {
    const modes = ['auto', 'full', 'eco'].filter(
      (m) => !!document.querySelector(`[data-testid="perf-mode-${m}"]`),
    );
    const radios = document.querySelectorAll('[aria-label="Modo de desempenho (bateria)"] [role="radio"]');
    const checked = document.querySelector(
      '[aria-label="Modo de desempenho (bateria)"] [role="radio"][aria-checked="true"]',
    )?.textContent;
    return {
      modes,
      radios: radios.length,
      checked,
      bloom: !!document.querySelector('[data-testid="bloom-intensity"]'),
      scenery: !!document.querySelector('[data-testid="scenery-bloom-intensity"]'),
      heading: document.querySelector('.settings-overlay h3')?.textContent?.trim(),
    };
  });
  await page.screenshot({ path: join(OUT, `live-${world.name}.png`) });

  const bundleBytes = await (await fetch(`${bundleUrl}?probe=${Date.now()}`)).text();
  const perfMarker = (bundleBytes.match(/perf-mode-/g) ?? []).length;

  const bad =
    found.modes.length !== 3 ||
    found.radios !== 3 ||
    !found.bloom ||
    !found.scenery ||
    perfMarker === 0 ||
    cacheName === '?';
  if (bad) broke++;
  rows.push({
    mundo: world.label,
    bundle: bundleUrl.pathname.split('/').pop(),
    'perf-mode no bundle': perfMarker,
    'aba Gráficos': found.heading ?? '(sumida)',
    botões: found.modes.join('|') || '(nenhum)',
    marcado: found.checked ?? '?',
    bloom: found.bloom && found.scenery ? 'sim' : 'NÃO',
    sw: cacheName,
    status: bad ? 'VERMELHO' : 'ok',
  });
  await ctx.close();
}
await browser.close();

console.table(rows);
console.log(`BASE ${BASE}`);
if (broke) {
  console.log(`\n🛑 ${broke} mundo(s) sem as configurações de gráficos — conteúdo publicado atrasado?`);
  process.exit(1);
}
console.log('\n✅ os dois mundos entregam as configurações de gráficos');
