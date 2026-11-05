// Sonda de áudio WebKit (o motor do iOS Safari): o contexto criado ANTES do
// gesto abre com resume() sozinho — o fluxo do código antigo — ou só abre com
// uma amostra muda tocando DENTRO do gesto (o warmUp)? Mede a política de
// autoplay do motor e confere console 0. Não precisa do dev server.
// Uso: node qa/probe-audio-webkit.mjs [webkit|chromium]
// Obs.: o WebKit headless (WPE) não é o iOS real — sem hardware de áudio e
// sem o estado 'interrupted'. O que ele prova aqui é (1) Web Audio presente,
// (2) console limpo nos dois fluxos, (3) o que o motor exige do gesto.
// Sem WebKit instalado na máquina, roda o Chromium com o gate estrito de
// autoplay (--autoplay-policy=document-user-activation-required) como smoke.
import { webkit, chromium } from 'playwright';

let ENGINE = process.argv[2] ?? 'webkit';

const PAGE = `<!doctype html><meta charset=utf-8><title>probe audio</title>
<button id="go" style="width:200px;height:80px">unlock</button><script>
window.T = { log: [] };
window.C = function (warm) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) { window.T.log.push('SEM WEB AUDIO'); return null; }
  const ctx = new Ctor();
  window.T.log.push('criado fora do gesto: state=' + ctx.state + ' sr=' + ctx.sampleRate);
  ctx.addEventListener('statechange', () => window.T.log.push('statechange: ' + ctx.state));
  document.getElementById('go').addEventListener('click', () => {
    if (warm) {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      window.T.log.push('amostra muda disparada no gesto');
    }
    ctx.resume().then(
      () => window.T.log.push('resume resolveu: state=' + ctx.state),
      (e) => window.T.log.push('resume recusou: ' + String(e).slice(0, 80))
    );
  }, { once: true });
  window.CTX = ctx;
  return ctx;
};
<\/script>`;

async function openBrowser() {
  if (ENGINE === 'webkit') {
    try {
      return await webkit.launch();
    } catch (e) {
      console.log(
        'webkit indisponivel nesta maquina (' +
          String(e).split('\n')[0] +
          '); fallback: chromium com gate estrito de autoplay'
      );
      ENGINE = 'chromium';
    }
  }
  return chromium.launch({
    args: ['--autoplay-policy=document-user-activation-required'],
  });
}

async function run(label, warm) {
  const browser = await openBrowser();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`[pageerror] ${String(e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text().slice(0, 200)}`);
  });
  await page.setContent(PAGE);
  await page.evaluate(`window.C(${warm ? 'true' : 'false'})`);
  await page.waitForTimeout(600);
  const idle = await page.evaluate('window.CTX ? window.CTX.state : "sem contexto"');
  await page.click('#go'); // input real: conta como user activation
  await page.waitForTimeout(900);
  const out = { label, stateSemGesto: idle, log: await page.evaluate('window.T.log.slice()'), errs };
  await browser.close();
  console.log(label.toUpperCase(), JSON.stringify(out, null, 1));
  return out;
}

const bare = await run('so-resume (fluxo antigo)', false);
const warm = await run('resume+amostra-muda (warmUp)', true);

console.log('CONSOLE:', bare.errs.length + warm.errs.length);
if (bare.log.includes('SEM WEB AUDIO')) console.log('AVISO: este build WebKit headless não expõe Web Audio');
