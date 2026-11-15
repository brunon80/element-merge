// SONDA DA TEXTURA EMBEBIDA NUM .GLB: decodifica o PNG dentro do chunk BIN
// (sem dependency nenhuma: inflate + unfilter dos filtros do PNG) e diz, por
// FAIXA horizontal da imagem, a cor média e quantos pixels estão QUENTES
// (r > b + 8). É a resposta objetiva para "o amarronzado é da pintura da
// escultora ou da luz/aro da arena" — obrigatória antes de pintar por cima de
// um modelo importado. No aquático Nv.1: média ~(75,182,207), r−b de −110 a
// −151 e 0% de pixels quentes em TODAS as 10 faixas -> a escultora pintou
// FRIO, o quente vinha do aro de equipe (emissivo) no shader do rig.
// Uso: node qa/probe-textura-warm.mjs [caminho.glb ...]  (padrão: o aquático)
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const files = process.argv.slice(2);
if (!files.length) files.push('src/models/water/water_model_lvl1.glb');

const crcOk = true; // não validamos CRC: só lemos dados

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é glTF binary');
  let off = 12;
  const chunks = {};
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    // o tipo do chunk é pad com NUL: "BIN\0" -> 'BIN'
    const type = buf.slice(off + 4, off + 8).toString('ascii').replace(/\0+$/, '');
    chunks[type] = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return chunks;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let p = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString('ascii');
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG não suportado (depth=${depth} interlace=${interlace})`);
  const channels = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 0 ? 1 : (() => { throw new Error('ctype ' + ctype); })();
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = raw.slice(rp, rp + stride);
    rp += stride;
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v;
      if (filter === 0) v = line[i];
      else if (filter === 1) v = line[i] + a;
      else if (filter === 2) v = line[i] + b;
      else if (filter === 3) v = line[i] + ((a + b) >> 1);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('filter ' + filter);
      cur[i] = v & 0xff;
    }
  }
  return { w, h, channels, px: out };
}

for (const f of files) {
  const buf = readFileSync(f);
  const chunks = parseGlb(buf);
  const json = JSON.parse(chunks.JSON.toString('utf8').replace(/\0+$/, ''));
  console.log(`\n### ${f} — ${buf.length / 1e6} MB, meshes ${json.meshes?.length}, materiais ${json.materials?.length}`);
  console.log('materiais:', JSON.stringify(json.materials?.map((m) => ({ nome: m.name, baseColor: m.pbrMetallicRoughness?.baseColorFactor, temMap: m.pbrMetallicRoughness?.baseColorTexture !== undefined, emissivo: m.emissiveFactor }))));
  const imgs = json.images ?? [];
  for (const [i, im] of imgs.entries()) {
    if (im.bufferView === undefined) continue;
    const bv = json.bufferViews[im.bufferView];
    const bin = chunks.BIN;
    const png = bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
    let img;
    try {
      img = decodePng(png);
    } catch (e) {
      console.log(`  imagem ${i}: ${e.message}`);
      continue;
    }
    const { w, h, channels, px } = img;
    console.log(`  imagem ${i} (${im.mimeType}, ${im.name ?? ''}): ${w}x${h} canais=${channels} bytes=${png.length / 1e6} MB`);
    const FAIXAS = 10;
    for (let band = 0; band < FAIXAS; band++) {
      const y0 = Math.floor((band * h) / FAIXAS);
      const y1 = Math.floor(((band + 1) * h) / FAIXAS);
      let r = 0, g = 0, b = 0, n = 0, warm = 0, alpha0 = 0;
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * channels;
          if (channels === 4 && px[i + 3] < 24) { alpha0++; continue; }
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
          if (px[i] > px[i + 2] + 8) warm++;
        }
      if (!n) continue;
      const mr = Math.round(r / n), mb = Math.round(b / n);
      console.log(
        `    faixa ${band + 1}/${FAIXAS} (y ${y0}-${y1}): média rgb=(${mr},${Math.round(g / n)},${mb})  r−b=${mr - mb > 0 ? '+' : ''}${mr - mb}  quentes=${((warm / n) * 100).toFixed(0)}%${alpha0 ? `  transparentes=${((alpha0 / (w * (y1 - y0))) * 100).toFixed(0)}%` : ''}`,
      );
    }
  }
}
void crcOk;
