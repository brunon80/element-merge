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

const W = Number(process.env.SHOT_W ?? 340); // recorte (CSS px) em volta da previsao do alvo
const H = Number(process.env.SHOT_H ?? 280);
const ZOOM = Number(process.env.SHOT_ZOOM ?? 3);
// SHOT_BURST=N: alem do print do voo, imprime a MESMA janela N vezes em
// rajada (170 ms entre eles) para pegar o IMPACTO e o FX assentando
const BURST = Number(process.env.SHOT_BURST ?? 0);
// Latência do poll até o pixel do print. O print NÃO é instantâneo: entre a
// sonda e os pixels existêm ~150 ms (evaluate + screenshot). O tiro do astral
// voa ~19 u/s (range 11,5 => voo < 1 s), entao com 0,07 s o recorte chega
// DEPOIS do impacto (o print mostra a fagulha do FX, nao a silhueta em voo).
// Para silhuetas rapidas, passe SHOT_LATENCY=0.16 (compensa o custo do print).
const SHOT_LATENCY = Number(process.env.SHOT_LATENCY ?? 0.07); // s: do poll ate o pixel do print chegar no recorte
// SHOT_HIDE: paletas (hex) cujas UNIDADES sao ESCONDIDAS antes do print. Sem
// isso o recorte do colosso era sempre uma parede das proprias pecas do figurino
// (o anel dele e grande e o tiro nasce dentro da saia) e o print nao respondia
// "o que o JOGADOR ve do tiro". Esconder e so visibilidade: o rig continua
// tocando e o motor continua atirando, entao o print mostra o tiro SOBRE O PISO
// (identidade do tiro isolada) e o frame aberto continua validando o contexto.
const HIDE = (process.env.SHOT_HIDE ?? '')
  .split(',')
  .map((h) => h.trim().replace('#', '').toLowerCase())
  .filter(Boolean);

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

const poll = (env) =>
  page.evaluate(
    ([hex, box, clip, dims]) => {
      const W = dims.w;
      const H = dims.h;
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
      // CENSO da janela do print: qualquer Mesh/Sprite/Instância cuja caixa
      // (esfera aproximada) caia no retângulo do recorte — responde "o que é
      // esse vulto branco no print" sem chute de cor
      const near = [];
      const CLIPX = clip ? clip.x : -1;
      const CLIPY = clip ? clip.y : -1;
      const bb = (o) => {
        if (!o.geometry) return null;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        const wp = o.getWorldPosition(new (o.position.constructor)(bs.center.x, bs.center.y, bs.center.z));
        const sc = o.getWorldScale(new (o.position.constructor)(1, 1, 1));
        const r = bs.radius * Math.max(sc.x, sc.y, sc.z);
        return { c: [wp.x, wp.y, wp.z], r };
      };
      const pushNear = (label, c, r) => {
        if (CLIPX < 0) return;
        const q = proj(c[0], c[1], c[2]);
        if (!q) return;
        const sx = ((q.cx + 1) / 2) * box.width;
        const sy = ((1 - q.cy) / 2) * box.height;
        if (sx < CLIPX - r || sx > CLIPX + W + r || sy < CLIPY - r || sy > CLIPY + H + r) return;
        const p2 = proj(c[0] + r, c[1], c[2]);
        const spanPx = p2 ? Math.abs(((p2.cx + 1) / 2) * box.width - sx) * 2 : 0;
        near.push(`${label} tela=(${Math.round(sx)},${Math.round(sy)}) ~${Math.round(spanPx)}px`);
      };
      scene.traverse((o) => {
        const ms0 = Array.isArray(o.material) ? o.material : [o.material];
        const matName = ms0[0]?.type ?? '?';
        if (o.isInstancedMesh) {
          const b = bb(o);
          if (b) pushNear(`INST ${o.geometry?.type} x${o.count} ${matName}`, b.c, b.r + 1);
        } else if (o.isSprite) {
          const p = o.getWorldPosition(new (o.position.constructor)());
          pushNear(`SPRITE ${matName} s=${o.scale.x.toFixed(2)}`, [p.x, p.y, p.z], o.scale.x);
        } else if (o.isMesh && !o.isInstancedMesh && o.geometry) {
          const p0 = ms0[0];
          const emis = p0?.uniforms?.uGold?.value?.getHexString?.() ?? null;
          const rk = p0?.uniforms?.uRockA?.value?.getHexString?.() ?? null;
          const ck = p0?.uniforms?.uCrack?.value?.getHexString?.() ?? null;
          const p = o.getWorldPosition(new (o.position.constructor)());
          pushNear(
            `MESH ${o.geometry?.type} ${matName}${emis ? ' G' + emis : ''}${rk ? ' R' + rk : ''}${
              ck ? ' C' + ck : ''
            }${p0?.transparent ? ' T' : ''}`,
            [p.x, p.y, p.z],
            (o.geometry.boundingSphere?.radius ?? 0.3) * 2,
          );
        }
      });
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
      return { hits, pools, near, pv, t: performance.now(), camPos: [...cam.position] };
    },
    [HEX || null, box, env ?? null, { w: W, h: H }],
  );

/** Esconde (so para o print) toda PECAS SOLTA cujo material carrega uma das
 *  paletas dadas. NUNCA toca nos InstancedMesh (os pools do projetil), entao o
 *  que sobra no recorte e o piso da arena + o tiro. A visibilidade e so do
 *  print: o rig continua animado e o motor continua atirando. */
const hidePieces = async (hexes) => {
  const r = await page.evaluate((list) => {
    const scene = (window.__threeRs || []).find((s) => s && s.isScene);
    if (!scene) return { err: 'sem scene' };
    const hit = (o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        const u = m?.uniforms;
        if (!u) continue;
        for (const k of ['uRockA', 'uRockB', 'uGold', 'uCrack']) {
          const hx = u[k]?.value?.getHexString?.();
          if (hx && list.includes(hx)) return true;
        }
      }
      return false;
    };
    const hidden = [];
    scene.traverse((o) => {
      if (o.isInstancedMesh) return; // pools do projetil ficam SEMPRE na cena
      if (!o.isMesh && !o.isSprite) return;
      if (!hit(o)) return;
      o.visible = false;
      hidden.push(o);
    });
    window.__hiddenPieces = hidden;
    return { n: hidden.length };
  }, hexes);
  return r;
};

const showPieces = async () =>
  page.evaluate(() => {
    for (const o of window.__hiddenPieces || []) o.visible = true;
    window.__hiddenPieces = [];
    return true;
  });

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
let lastClip = null; // recorte do ultimo print: a sonda seguinte faz o censo dele
for (let i = 0; i < 900 && shots < 6; i++) {
  const s = await poll(lastClip);
  if (s.err) {
    if (i % 60 === 0) console.log(`t${i} ${s.err}`);
    await page.waitForTimeout(45);
    continue;
  }
  // identidade por INSTANCIA (pool+indice): o pool recicla slots, entao a
  // velocidade so e confiavel entre duas sondas que viram o MESMO slot. So
  // interessa o que esta VOANDO (mais de 3 u/s): o resto e slot parado do pool.
  // Guard anti-reciclagem: um slot verdadeiro nao pode teleportar — a mais
  // rapida da arvore (astral, 15*1,12~17 u/s) anda <0,25u num poll de 45-100ms,
  // entao >1,2u de salto entre sondas e slot reusado por OUTRA volida e a
  // velocidade e mentira (isso poluia a eleicao com motes da cauda).
  const cur = new Map(s.hits.map((h) => [`${h.key}#${h.idx}`, h]));
  const pairs = [];
  const dt = prevMap ? (s.t - prevT) / 1000 : 0;
  if (prevMap && dt > 0.001 && dt < 0.5) {
    for (const [k, h] of cur) {
      const before = prevMap.get(k);
      if (!before) continue;
      const jump = Math.hypot(h.at[0] - before.at[0], h.at[1] - before.at[1], h.at[2] - before.at[2]);
      if (jump > 1.2) continue;
      const v = [
        (h.at[0] - before.at[0]) / dt,
        (h.at[1] - before.at[1]) / dt,
        (h.at[2] - before.at[2]) / dt,
      ];
      const sp = Math.hypot(...v);
      if (sp > 3) pairs.push({ h, v, sp });
    }
  }
  prevMap = cur;
  prevT = s.t;
  let best = null;
  let bestSpeed = 0;
  if (pairs.length) {
    // direcao consensual do voo: a media das velozidades (peso pela velocidade).
    // O CORPO do tiro e o acerto MAIS AVANCADO nessa direcao — as pontas de
    // cauda/rasto atrasam dele (a cauda do cometa, a pedraria da bomba), e foi
    // assim que a sonda parou de eleger o mote errado so porque a cor bate
    const w = [0, 0, 0];
    for (const p of pairs) {
      w[0] += p.v[0] * p.sp;
      w[1] += p.v[1] * p.sp;
      w[2] += p.v[2] * p.sp;
    }
    const wl = Math.hypot(...w) || 1;
    const dirc = [w[0] / wl, w[1] / wl, w[2] / wl];
    let bestAdv = -Infinity;
    for (const p of pairs) {
      const adv = p.h.at[0] * dirc[0] + p.h.at[1] * dirc[1] + p.h.at[2] * dirc[2];
      // empate (~3u de velozidade): escolhe o MAIOR raio (o corpo da silhueta,
      // nao a farpa miuda do rasto), e na sequencia o mais rapido
      const better =
        adv > bestAdv + 0.05 ||
        (adv > bestAdv - 0.05 &&
          (p.h.rad > (best?.h.rad ?? 0) + 1e-9 ||
            (Math.abs(p.h.rad - (best?.h.rad ?? 0)) < 1e-9 && p.sp > bestSpeed)));
      if (better) {
        best = p;
        bestAdv = adv;
        bestSpeed = p.sp;
      }
    }
  }
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
        lastClip = { x: clipX, y: clipY }; // a proxima sonda faz o censo desta janela
        const name = String(shots).padStart(2, '0');
        const hid = HIDE.length ? await hidePieces(HIDE) : null;
        const raw = await page.screenshot({ clip: { x: clipX, y: clipY, width: W, height: H } });
        const census = await poll(lastClip); // o censo da JANELA DESTE print (1 frame depois)
        if (hid) await showPieces();
        writeFileSync(`${OUT}\\crop-${name}.png`, raw);
        writeFileSync(
          `${OUT}\\big-${name}.png`,
          await decorate(raw, sx - clipX, sy - clipY, best.h.span * box.width, W),
        );
        // MODO RAJADA (SHOT_BURST=N): a mesma janela impressa N vezes em
        // sequencia. O print nao e instantaneo (o recorte chega ~0,2 s depois
        // da sonda) e o tempo de voo ate o IMPACTO nao cabe numa foto so — com
        // a rajada de prints na MESMA janela a gente pega o voo, a detonacao e
        // a poeira assentando, sem depender de acertar o instante
        for (let b = 0; b < BURST; b++) {
          await page.waitForTimeout(170);
          const extra = await page.screenshot({ clip: { x: clipX, y: clipY, width: W, height: H } });
          writeFileSync(`${OUT}\\burst-${name}-${String(b).padStart(2, '0')}.png`, extra);
        }
        console.log(
          `shot ${shots} ${best.h.geo}@${JSON.stringify(best.h.at.map((n) => +n.toFixed(2)))} vel=${bestSpeed.toFixed(1)}u/s R${best.h.rock ?? '-'} G${best.h.gold ?? '-'} C${best.h.crack ?? '-'} 0,3u=${(best.h.span * box.width).toFixed(0)}px tela=(${Math.round(sx)},${Math.round(sy)})${hid ? ` escondidas=${hid.n ?? hid.err}` : ''}`,
        );
        console.log(`  censo: ${JSON.stringify(census.near ?? census.err)}`);
        shots++;
      }
    }
  }
  if (i % 60 === 0) console.log(`t${i} pools=${JSON.stringify(s.pools)}`);
  await page.waitForTimeout(45);
}
await browser.close();
console.log(`prints: ${shots} (crop + big em ${OUT})`);
