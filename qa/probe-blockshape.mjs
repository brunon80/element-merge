// GEOMETRIA EXATA DO BLOCO PRETO. As varreduras com passo (stride) aproximam o
// retângulo; esta mede de verdade: varre o PNG pixel a pixel, acha o MAIOR
// retângulo eixo-alinhado 100% preto (algoritmo de histograma de colunas, o
// clássico da maior área) e devolve as bordas exatas + o que tem dentro e
// encostado fora. As bordas exatas é que dizem o que é: se casam com o tamanho
// de um render target (2360x1900, 1180x950, 590x475...), é buffer; se casam com
// a caixa de um quad da cena, é objeto.
//
// Uso: node qa/probe-blockshape.mjs <arquivo.png> [mais.png ...]
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  console.log('uso: node qa/probe-blockshape.mjs <print.png> [...]');
  process.exit(1);
}

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

for (const arq of arquivos) {
  const b64 = readFileSync(resolve(arq)).toString('base64');
  const r = await page.evaluate(async (data) => {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const px = img.data;
    const W = c.width;
    const H = c.height;
    const preto = (x, y) => {
      const i = (y * W + x) * 4;
      return px[i] <= 6 && px[i + 1] <= 6 && px[i + 2] <= 6 && px[i + 3] > 250;
    };
    // maior retângulo só de preto: histograma de alturas + pilha monotônica
    const h = new Int32Array(W + 1);
    let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
    const stack = new Int32Array(W + 1);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) h[x] = preto(x, y) ? h[x] + 1 : 0;
      h[W] = 0;
      let top = 0;
      stack[top] = 0;
      for (let x = 0; x <= W; x++) {
        while (top >= 0 && h[stack[top]] >= h[x]) {
          const altura = h[stack[top]];
          const inicio = top > 0 ? stack[top - 1] + 1 : 0;
          const larg = x - inicio;
          const area = altura * larg;
          if (area > best.area) best = { area, x0: inicio, x1: x - 1, y0: y - altura + 1, y1: y };
          top--;
        }
        top++;
        stack[top] = x;
      }
    }
    // contagem global de preto + bbox de todo preto
    let pretos = 0;
    let mx0 = 1e9, mx1 = -1, my0 = 1e9, my1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (preto(x, y)) {
          pretos++;
          if (x < mx0) mx0 = x;
          if (x > mx1) mx1 = x;
          if (y < my0) my0 = y;
          if (y > my1) my1 = y;
        }
    // o que tem DENTRO do bloco (cores distintas) e logo FORA das bordas
    const coresDentro = new Map();
    let alfaDentro = new Map();
    if (best.area) {
      for (let y = best.y0; y <= best.y1; y += 7)
        for (let x = best.x0; x <= best.x1; x += 7) {
          const i = (y * W + x) * 4;
          const k = `${px[i]},${px[i + 1]},${px[i + 2]}`;
          coresDentro.set(k, (coresDentro.get(k) || 0) + 1);
          alfaDentro.set(String(px[i + 3]), (alfaDentro.get(String(px[i + 3])) || 0) + 1);
        }
    }
    const fora = [];
    if (best.area) {
      const xm = (best.x0 + best.x1) >> 1;
      const ym = (best.y0 + best.y1) >> 1;
      for (const [x, y, rot] of [
        [best.x0 - 2, ym, 'esq'],
        [best.x1 + 2, ym, 'dir'],
        [xm, best.y0 - 2, 'cima'],
        [xm, best.y1 + 2, 'baixo'],
      ]) {
        const i = (y * W + x) * 4;
        fora.push(`${rot}: ${px[i]},${px[i + 1]},${px[i + 2]},a=${px[i + 3]}`);
      }
    }
    const topCores = [...coresDentro.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      tam: [W, H],
      temAlfa: img.data.some((_, i) => i % 4 === 3 && px[i] !== 255),
      pretos,
      bboxPretos: pretos ? [mx0, my0, mx1 - mx0 + 1, my1 - my0 + 1] : null,
      bloco: best.area ? { ...best, w: best.x1 - best.x0 + 1, h: best.y1 - best.y0 + 1 } : null,
      alfaDentro: [...alfaDentro.entries()],
      topCores,
      fora,
    };
  }, b64);

  console.log(`\n=== ${arq}`);
  console.log(`  canvas ${r.tam}  pretoTotal ${r.pretos}  bboxPreto ${JSON.stringify(r.bboxPretos)}  alfaVariado ${r.temAlfa}`);
  if (r.bloco) {
    const b = r.bloco;
    console.log(`  MAIOR RETANGULO PRETO: x ${b.x0}..${b.x1}  y ${b.y0}..${b.y1}  = ${b.w}x${b.h}  area ${b.area} (${((b.area / (r.tam[0] * r.tam[1])) * 100).toFixed(1)}% do frame)`);
    console.log(`  CSS px (dpr): ${b.w / 2}x${b.h / 2} em metade | ${b.w / 4}x${b.h / 4} em um quarto`);
    console.log(`  cores dentro: ${JSON.stringify(r.topCores)}  alfa dentro: ${JSON.stringify(r.alfaDentro)}`);
    console.log(`  encostado fora: ${r.fora.join(' | ')}`);
  } else console.log('  nenhum retângulo preto');
}
await browser.close();
