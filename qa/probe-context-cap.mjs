// O WebKit devolve o SLOT de contexto quando chamamos loseContext()? O iOS tem
// teto baixo (~8) e mata o contexto mais antigo — decidir isso define a
// arquitetura dos viewers do bestiário (um canvas por card vs. canvas único).
import { webkit } from 'playwright';

const browser = await webkit.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.setContent('<!doctype html><meta charset=utf-8><title>t</title>');

const res = await page.evaluate(async () => {
  const out = { semLoss: [], comLoss: [] };
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    document.body.appendChild(c);
    return c;
  };
  // 1) 12 contextos SEM devolver
  for (let i = 0; i < 12; i++) {
    const c = mk();
    const gl = c.getContext('webgl2');
    out.semLoss.push(gl ? 'ok' : 'nulo');
  }
  // 2) contexto novo depois de devolver todos com loseContext
  const all = [...document.querySelectorAll('canvas')];
  for (const c of all) {
    const gl = c.getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
    c.width = 0;
    c.height = 0;
    c.remove();
  }
  await new Promise((r) => setTimeout(r, 500));
  for (let i = 0; i < 12; i++) {
    const c = mk();
    const gl = c.getContext('webgl2');
    out.comLoss.push(gl ? (gl.isContextLost() ? 'perdido' : 'ok') : 'nulo');
  }
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log(logs.slice(0, 10).join('\n') || '(sem logs)');
await browser.close();
