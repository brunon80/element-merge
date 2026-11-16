// SONDAS DE "RACHADURAS": mede o RASGO que o deslocamento de vértice ao longo
// da normal (relevo uFA dos rigs de malha) abre nas ARESTAS DURAS dos GLBs —
// vértices duplicados na MESMA posição com normais diferentes são puxados em
// direções diferentes e a costura abre, deixando ver o que está atrás.
// Compara ANTES (objectNormal) e DEPOIS (aDispNrm soldada por posição, como
// weldDispNormals faz): o DEPOIS deve dar rasgo 0 (cópias coincidentes recebem
// o mesmo deslocamento).
// Uso: node qa/probe-cracks.mjs [caminho.glb ...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---- ruído literal de NOISE_GLSL (flameShaders.ts), versão JS ----
const fract = (x) => x - Math.floor(x);
function fhash3(x, y, z) {
  x = fract(x * 0.3183099 + 0.71) * 17.0;
  y = fract(y * 0.3183099 + 0.113) * 17.0;
  z = fract(z * 0.3183099 + 0.419) * 17.0;
  return fract(x * y * z * (x + y + z));
}
function fnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3.0 - 2.0 * fx);
  fy = fy * fy * (3.0 - 2.0 * fy);
  fz = fz * fz * (3.0 - 2.0 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(fhash3(ix, iy, iz), fhash3(ix + 1, iy, iz), fx), l(fhash3(ix, iy + 1, iz), fhash3(ix + 1, iy + 1, iz), fx), fy),
    l(l(fhash3(ix, iy, iz + 1), fhash3(ix + 1, iy, iz + 1), fx), l(fhash3(ix, iy + 1, iz + 1), fhash3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz
  );
}
function fbm(x, y, z) {
  let v = 0.0, a = 0.55;
  for (let k = 0; k < 3; k++) {
    v += a * fnoise(x, y, z);
    x = x * 2.07 + 1.7; y = y * 2.07 + 9.2; z = z * 2.07 + 4.3;
    a *= 0.5;
  }
  return v;
}

// ---- parser GLB mínimo (JSON chunk + BIN chunk) ----
function parseGlb(path) {
  const buf = Buffer.from(readFileSync(path));
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: não é GLB`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  const accCache = new Map();
  function accessor(i) {
    if (accCache.has(i)) return accCache.get(i);
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    let arr;
    if (a.componentType === 5126) arr = new Float32Array(bin.buffer, bin.byteOffset + base, a.count * comps);
    else if (a.componentType === 5123) arr = new Uint16Array(bin.buffer, bin.byteOffset + base, a.count * comps);
    else if (a.componentType === 5125) arr = new Uint32Array(bin.buffer, bin.byteOffset + base, a.count * comps);
    else if (a.componentType === 5121) arr = new Uint8Array(bin.buffer, bin.byteOffset + base, a.count * comps);
    else throw new Error(`componentType ${a.componentType} não suportado`);
    accCache.set(i, arr);
    return arr;
  }
  const prims = [];
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      if (!p.attributes?.POSITION) continue;
      prims.push({
        pos: accessor(p.attributes.POSITION),
        nrm: p.attributes.NORMAL ? accessor(p.attributes.NORMAL) : null,
      });
    }
  }
  return prims;
}

// ---- grupo de solda por posição (mesma quantização do weldDispNormals) ----
function weldGroups(pos) {
  const keyToGroup = new Map();
  const groups = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const key =
      Math.round(pos[i * 3] * 1e4) + ',' + Math.round(pos[i * 3 + 1] * 1e4) + ',' + Math.round(pos[i * 3 + 2] * 1e4);
    let g = keyToGroup.get(key);
    if (g === undefined) {
      g = [];
      keyToGroup.set(key, g);
      groups.push(g);
    }
    g.push(i);
  }
  return groups.filter((g) => g.length > 1);
}

// ---- fórmula do relevo do GolemMeshRig (rn1/rn2 × uFA) ----
function scaleGolem(px, py, pz, uFA, seed) {
  const x = px + seed, y = py + seed, z = pz + seed;
  const rn1 = fbm(x * 1.7, y * 1.7, z * 1.7);
  const rn2 = fnoise(x * 4.4 + 7.0, y * 4.4 + 7.0, z * 4.4 + 7.0);
  return ((rn1 - 0.5) * 1.6 + (rn2 - 0.5) * 0.8) * uFA;
}

const SEEDS = [0, 3.7, 11.3]; // seed da unidade varia: mede o pior caso
function probe(path, uFA) {
  const prims = parseGlb(path);
  let hardWelds = 0;
  let gaps = [];
  for (let seedI = 0; seedI < SEEDS.length; seedI++) {
    const seed = SEEDS[seedI];
    for (const prim of prims) {
      const { pos, nrm } = prim;
      if (!nrm) continue;
      for (const g of weldGroups(pos)) {
        // cópias COINCIDENTES antes: o rasgo é o que sobe na posição deslocada
        let maxDistOld = 0;
        let maxDistNew = 0;
        // normal média do grupo (o aDispNrm do fix)
        let ax = 0, ay = 0, az = 0;
        for (const i of g) {
          ax += nrm[i * 3]; ay += nrm[i * 3 + 1]; az += nrm[i * 3 + 2];
        }
        const len = Math.hypot(ax, ay, az) || 1;
        ax /= len; ay /= len; az /= len;
        // ANTES: cada cópia anda s*n_própria; DEPOIS: todas andam s*n̄ (0 relativo)
        let anyDiffer = false;
        for (let a = 0; a < g.length && !anyDiffer; a++) {
          for (let b = a + 1; b < g.length; b++) {
            const ia = g[a], ib = g[b];
            const dot = nrm[ia * 3] * nrm[ib * 3] + nrm[ia * 3 + 1] * nrm[ib * 3 + 1] + nrm[ia * 3 + 2] * nrm[ib * 3 + 2];
            if (dot < 0.9999) {
              anyDiffer = true;
              break;
            }
          }
        }
        if (!anyDiffer) continue;
        hardWelds++;
        const s = scaleGolem(pos[g[0] * 3], pos[g[0] * 3 + 1], pos[g[0] * 3 + 2], uFA, seed);
        for (let a = 0; a < g.length; a++) {
          for (let b = a + 1; b < g.length; b++) {
            const ia = g[a], ib = g[b];
            // distância pós-deslocamento entre as cópias (posições-base iguais)
            const ox = (nrm[ia * 3] - nrm[ib * 3]) * s;
            const oy = (nrm[ia * 3 + 1] - nrm[ib * 3 + 1]) * s;
            const oz = (nrm[ia * 3 + 2] - nrm[ib * 3 + 2]) * s;
            maxDistOld = Math.max(maxDistOld, Math.hypot(ox, oy, oz));
          }
        }
        gaps.push(maxDistOld); // maxDistNew é 0 por construção (n̄ igual p/ todos)
      }
    }
  }
  gaps.sort((a, b) => a - b);
  const p = (f) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * f))] : 0);
  const worst = gaps.length ? gaps[gaps.length - 1] : 0;
  const mean = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const over = (t) => gaps.filter((g) => g > t).length;
  console.log(
    `${path}\n  soldas duras=${hardWelds} | rasgo ANTES: médio=${mean.toFixed(4)} p50=${p(0.5).toFixed(4)} p95=${p(0.95).toFixed(4)} MAX=${worst.toFixed(4)} (>${(0.02).toFixed(2)}: ${over(0.02)}, >0,05: ${over(0.05)}) | rasgo DEPOIS: 0 por construção`
  );
}

const files = process.argv.slice(2);
const targets =
  files.length > 0
    ? files.map((f) => [f, 0.075])
    : [
        ...[1, 2, 3, 4, 5].map((l) => [`src/models/golem/golem_model_lvl${l}.glb`, 0.075]),
        ...[1, 2, 3, 4, 5].map((l) => [`src/models/fire/fire_model_lvl${l}.glb`, 0.06]),
      ];
for (const [f, ufa] of targets) probe(fileURLToPath(new URL(`../${f}`, import.meta.url)), ufa);
