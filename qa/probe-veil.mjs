// Sonda de depuração: identifica O QUE está desenhando as faixas brancas no
// funil de areia. Esconde candidatos um a um (pools de fumaça/particles/
// sprites/points/vento) e tira um print após cadaToggle; a análise de pixels
// é feita depois com PowerShell.
// Uso: node qa/probe-veil.mjs [saidaDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'C:\\Users\\bruno\\AppData\\Local\\Temp\\opencode\\probe';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1180, height: 950 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
// hook de devtools do three: three dispara 'observe' (detail = renderer/scene)
// via __THREE_DEVTOOLS__.dispatchEvent — tem que ser um EventTarget
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
try {
  await page.click('[data-testid="open-settings"]');
} catch (e) {
  await page.screenshot({ path: `${OUT}\\p00-dead.png` });
  console.log('app não respondeu; title=', await page.title());
  console.log('body:', (await page.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\n/g, ' | '));
  throw e;
}
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
await spawn('areia');
await spawn('golem');
await page.waitForTimeout(2200);

// enquadra o gênio (zoom p/ perto como o front.png do laço principal)
const canvas = page.locator('canvas').first();
const box = await canvas.boundingBox();
await page.mouse.wheel(box.x + box.width / 2, box.y + box.height * 0.45, -1400);
await page.waitForTimeout(900);

// inventário da cena via registro devtools do three
const inv = await page.evaluate(() => {
  const rs = window.__threeRs || [];
  const scene = rs.find((s) => s && s.isScene);
  if (!scene) return { err: 'scene not found in ' + rs.length + ' registers' };
  const groups = [];
  scene.traverse((o) => {
    const mat = o.material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    const info = [];
    for (const m of mats) {
      const tag = m.type === 'ShaderMaterial' ? (m.vertexShader.includes('uSpin') ? 'wind' : 'shader') : m.type;
      info.push(tag);
    }
    const entry = {
      uuid: o.uuid,
      type: o.type,
      mats: info.join(','),
      parent: o.parent?.uuid ?? '',
    };
    if (o.type === 'Group' && !o.material) {
      let kids = 0, shader = 0, wind = 0, sprite = 0, points = 0;
      o.traverse((x) => {
        if (x !== o && x.isSprite) sprite++;
        else if (x.isPoints) points++;
        else if (x.isMesh || x.isInstancedMesh) {
          kids++;
          const ms = Array.isArray(x.material) ? x.material : [x.material];
          for (const m of ms) {
            if (m?.type === 'ShaderMaterial') { shader++; if (m.vertexShader?.includes('uSpin')) wind++; }
          }
        }
      });
      Object.assign(entry, { kids, shader, wind, sprite, points });
      groups.push(entry);
    } else if (o.isSprite || o.isPoints || o.isMesh || o.isInstancedMesh) {
      groups.push(entry);
    }
  });
  window.__probe = scene;
  return { n: groups.length };
});
if (inv.err) { console.log(inv.err); await browser.close(); process.exit(1); }
console.log('scene nodes:', inv.n);

const shot = (name) => canvas.screenshot({ path: `${OUT}\\${name}.png` });
await shot('p00-base');

// 1) esconde TODOS os ShaderMaterial de vento (funil/halo/esteiras)
let r = await page.evaluate(() => {
  const hidden = [];
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    if (ms.some((m) => m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin'))) {
      o.visible = false;
      hidden.push(o.uuid);
    }
  });
  return hidden.length;
});
console.log('hide wind:', r);
await shot('p01-no-wind');

// 2) esconde sprites
r = await page.evaluate(() => {
  let n = 0;
  window.__probe.traverse((o) => {
    if (o.isSprite) { o.visible = false; n++; }
  });
  return n;
});
console.log('hide sprites:', r);
await shot('p02-no-sprites');

// 3) esconde points
r = await page.evaluate(() => {
  let n = 0;
  window.__probe.traverse((o) => {
    if (o.isPoints) { o.visible = false; n++; }
  });
  return n;
});
console.log('hide points:', r);
await shot('p03-no-points');

// 4) esconde MeshStandard transparente (smoke pool / particles do Effects)
r = await page.evaluate(() => {
  let n = 0;
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    if (ms.some((m) => m?.transparent && m?.type !== 'ShaderMaterial')) { o.visible = false; n++; }
  });
  return n;
});
console.log('hide transparent std:', r);
await shot('p04-no-transparent');

// 5) esconde MeshStandard NÃO transparente (partes do corpo)
r = await page.evaluate(() => {
  let n = 0;
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    if (ms.some((m) => !m?.transparent && m?.type?.startsWith('Mesh'))) { o.visible = false; n++; }
  });
  return n;
});
console.log('hide opaque std:', r);
await shot('p05-no-opaque');

// 6) só não-opaco de volta: revela tudo não-transparente de novo
await page.evaluate(() => {
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    if (ms.some((m) => m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin'))) o.visible = true;
  });
});
await shot('p06-wind-only');

// 7) override dos uniforms do vento: mid VERMELHO puro + alphaMul 2 — se o
// funil ficar vermelho opaco, o problema é só a conta de alfa/cor do shader;
// se continuar claro, o shader não está usando os uniforms que achamos
await page.evaluate(() => {
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin')) {
        m.uniforms.uMid.value.setRGB(1, 0, 0);
        m.uniforms.uCold.value.setRGB(0.4, 0, 0);
        m.uniforms.uHot.value.setRGB(1, 0.3, 0.1);
        m.uniforms.uAlphaMul.value = 2.0;
        m.needsUpdate = true;
      }
    }
  });
});
await page.waitForTimeout(600);
await shot('p07-veil-red');

// 7b) despeja os uniforms do material do funil (o maior) p/ caçar NaN/zero
const dump = await page.evaluate(() => {
  let target = null, best = 0;
  window.__probe.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh)) return;
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    const m = ms.find((x) => x?.type === 'ShaderMaterial' && x.vertexShader?.includes('uSpin'));
    if (m) {
      const vr = m.vertexShader.includes('uModelH');
      void vr;
      const area = (o.geometry?.attributes?.position?.count ?? 0);
      if (area > best) { best = area; target = m; }
    }
  });
  if (!target) return { err: 'no wind mat' };
  const out = {};
  for (const [k, u] of Object.entries(target.uniforms)) {
    const v = u.value;
    out[k] = typeof v === 'number' ? (Number.isFinite(v) ? +v.toFixed(3) : 'NaN!') : String(v);
  }
  const geo = window.__probe;
  void geo;
  return out;
});
console.log('uniforms do funil:', JSON.stringify(dump));
await shot('p07b-after-dump');

// 7c) flash de dano DESLIGado (mid volta ao ocre): se o branco sumir, o
// culpado é o mix(vec3(1.0), col, uHurt) com uHurt travado em >0
await page.evaluate(() => {
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin')) {
        m.fragmentShader = m.fragmentShader.replace(
          'col = mix(vec3(1.0), col, uHurt * 0.45);',
          '/* flash off */',
        );
        m.uniforms.uCold.value.set(0x5f441c);
        m.uniforms.uMid.value.set(0x93692c);
        m.uniforms.uHot.value.set(0xd9b26a);
        m.needsUpdate = true;
      }
    }
  });
});
await page.waitForTimeout(700);
await shot('p07c-no-flash-ocre');

// 8) corpo inteiro escondido, véus visíveis sozinhos sobre o fundo
await page.evaluate(() => {
  window.__probe.traverse((o) => {
    if (o === window.__probe) return;
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    const isWind = ms.some((m) => m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin'));
    if (!isWind && (o.isMesh || o.isInstancedMesh || o.isSprite || o.isPoints)) o.visible = false;
  });
});
await shot('p08-veils-alone');

// 8b) fragment FORÇADO: cor fixa ocre a 0.5 de alfa, blending normal explícito,
// sem ruído nenhum — prova se o pipeline desenha vento aditivo ou não
await page.evaluate(() => {
  window.__probe.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m?.type === 'ShaderMaterial' && m.vertexShader?.includes('uSpin')) {
        m.vertexShader = /* glsl */ `
          varying vec2 vUv2;
          void main() {
            vUv2 = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;
        m.fragmentShader = /* glsl */ `
          varying vec2 vUv2;
          void main() { gl_FragColor = vec4(0.58, 0.41, 0.17, 0.5); }
        `;
        m.blending = 1; // NormalBlending
        m.transparent = true;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
    }
  });
});
await page.waitForTimeout(900);
await shot('p09-frag-forced');

await browser.close();
console.log('probe em', OUT);
