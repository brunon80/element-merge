// lê o bounding box CRÚ (caixa CPU) de cada GLB da linha "modelos 3D" direto do
// chunk JSON do glTF (accessors POSITION têm min/max) — sem browser. A rig usa
// essa caixa p/ o fit (spanY, meias-caixas em X/Z) e p/ assinar o footprint.
// Uso: node qa/glb-box.mjs [path.glb ...]
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  for (const f of ['crystal', 'haze', 'obsidian', 'pantano', 'plasma', 'storm'])
    files.push(`src/models/${f}/${f}.glb`);
}
const fmt = (n) => n.toFixed(3);
for (const f of files) {
  const buf = readFileSync(f);
  if (buf.toString('ascii', 0, 4) !== 'glTF') {
    console.log(`${f}: não é glTF`);
    continue;
  }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  let verts = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const posAcc = json.accessors[prim.attributes.POSITION];
      if (posAcc?.min && posAcc?.max) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], posAcc.min[i]);
          max[i] = Math.max(max[i], posAcc.max[i]);
        }
        verts += posAcc.count;
      }
      if (prim.indices != null) tris += json.accessors[prim.indices].count / 3;
      else if (posAcc) tris += posAcc.count / 3;
    }
  }
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  console.log(
    `${f}\n  box x[${fmt(min[0])}..${fmt(max[0])}] y[${fmt(min[1])}..${fmt(max[1])}] z[${fmt(min[2])}..${fmt(max[2])}]` +
      `\n  span X=${fmt(dx)} Y=${fmt(dy)} Z=${fmt(dz)}  halfX=${fmt(Math.max(-min[0], max[0]))} halfZ=${fmt(Math.max(-min[2], max[2]))}` +
      `\n  verts=${verts} tris=${Math.round(tris)} meshes=${(json.meshes ?? []).length} nodes=${(json.nodes ?? []).length} mats=${(json.materials ?? []).length}`,
  );
}
