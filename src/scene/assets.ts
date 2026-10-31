import * as THREE from 'three';

/** Geometrias compartilhadas (cache) — evita criar/recriar por unidade. */

const cache = new Map<string, THREE.BufferGeometry>();

export type GeoKind =
  | 'sphere'
  | 'box'
  | 'cone'
  | 'cyl'
  | 'torus'
  | 'dodeca'
  | 'octa'
  | 'ico'
  | 'capsule'
  | 'plane'
  | 'ring'
  | 'drop'
  | 'vortex';

export function getGeometry(kind: GeoKind, args: number[]): THREE.BufferGeometry {
  const key = `${kind}:${args.join(',')}`;
  let geo = cache.get(key);
  if (geo) return geo;
  switch (kind) {
    case 'sphere':
      geo = new THREE.SphereGeometry(args[0], args[1] ?? 14, args[2] ?? 12);
      break;
    case 'box':
      geo = new THREE.BoxGeometry(args[0], args[1], args[2]);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(args[0], args[1], args[2] ?? 8);
      break;
    case 'cyl':
      // args extras: [4] = segmentos verticais, [5] = 1 para tubo aberto (casca)
      geo = new THREE.CylinderGeometry(
        args[0],
        args[1],
        args[2],
        args[3] ?? 10,
        args[4] ?? 1,
        args[5] === 1,
      );
      break;
    case 'torus':
      geo = new THREE.TorusGeometry(args[0], args[1], args[2] ?? 8, args[3] ?? 24);
      break;
    case 'dodeca':
      geo = new THREE.DodecahedronGeometry(args[0]);
      break;
    case 'octa':
      geo = new THREE.OctahedronGeometry(args[0]);
      break;
    case 'ico':
      geo = new THREE.IcosahedronGeometry(args[0]);
      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(args[0], args[1], 4, 10);
      break;
    case 'plane':
      geo = new THREE.PlaneGeometry(args[0], args[1]);
      break;
    case 'ring':
      geo = new THREE.RingGeometry(args[0], args[1], args[2] ?? 32);
      break;
    case 'drop':
      geo = flameDropGeometry(args[0], args[1] ?? 1, args[2] ?? 26, args[3] ?? 22);
      break;
    case 'vortex':
      geo = vortexGeometry(
        args[0],
        args[1],
        args[2],
        args[3] ?? 22,
        args[4] ?? 26,
        args[5] ?? 1.7,
        args[6] ?? 0,
      );
      break;
  }
  cache.set(key, geo);
  return geo;
}

/**
 * Gota de chama (lathe): base larga, bojo abaixo do meio, afunilando até a
 * ponta; ondulação de borda tipo língua de fogo. Sem cache quando chamada
 * direto (útil para geometrias que precisam de atributos próprios,
 * ex.: projéteis instanciados).
 */
export function flameDropGeometry(
  r: number,
  h = 1,
  rings = 26,
  radial = 22,
): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const base = 0.3 + 0.7 * Math.sin(Math.min(1, t * 2.3) * Math.PI * 0.5);
    const taper = Math.pow(1 - t, 0.5);
    const ripple = 0.9 + 0.1 * Math.cos(t * 13);
    profile.push(new THREE.Vector2(Math.max(0.002, r * base * taper * ripple), t * h));
  }
  return new THREE.LatheGeometry(profile, radial);
}

/**
 * Superfície de revolução de um VÓRTICE (funil de vento / tornado): o raio vai
 * de `rBase` (embaixo) até `rTop` (em cima) seguindo `curve` (>1 fecha a base e
 * abre o topo, como um tornado de verdade) e com uma ondulação senoidal de
 * raio (`ripple`) para a coluna não parecer um cone liso. A casca é aberta nas
 * duas pontas — o material do vento é translúcido e dupla face, então enxerga-
 * se o lado de dentro do funil girando. base do funil fica em y = 0 da peça.
 */
export function vortexGeometry(
  rBase: number,
  rTop: number,
  h: number,
  rings = 22,
  radial = 26,
  curve = 1.7,
  ripple = 0,
): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const base = rBase + (rTop - rBase) * Math.pow(t, curve);
    const wob = 1 + ripple * Math.sin(t * Math.PI * 2.6 + 0.6);
    profile.push(new THREE.Vector2(Math.max(0.004, base * wob), t * h));
  }
  return new THREE.LatheGeometry(profile, radial);
}

// ---------------------------------------------------------------------------
// Texturas procedurais (sem URLs externas)
// ---------------------------------------------------------------------------

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

let circleTex: THREE.Texture | null = null;

/** Ponto suave (partículas/projéteis billboard). */
export function circleTexture(): THREE.Texture {
  if (circleTex) return circleTex;
  const [c, ctx] = makeCanvas(64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  circleTex = new THREE.CanvasTexture(c);
  return circleTex;
}

let flameTex: THREE.Texture | null = null;
export function flameIconTexture(): THREE.Texture {
  if (flameTex) return flameTex;
  const [c, ctx] = makeCanvas(64);
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.bezierCurveTo(46, 24, 52, 34, 44, 48);
  ctx.bezierCurveTo(40, 56, 24, 56, 20, 48);
  ctx.bezierCurveTo(12, 34, 18, 24, 32, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(32, 26);
  ctx.bezierCurveTo(40, 38, 38, 48, 32, 50);
  ctx.bezierCurveTo(26, 48, 24, 38, 32, 26);
  ctx.fill();
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}

let slowTex: THREE.Texture | null = null;
export function slowIconTexture(): THREE.Texture {
  if (slowTex) return slowTex;
  const [c, ctx] = makeCanvas(64);
  ctx.strokeStyle = '#7ad4ff';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const ang of [90, 30, 150]) {
    const a = (ang * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(32 - Math.cos(a) * 20, 32 - Math.sin(a) * 20);
    ctx.lineTo(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20);
    ctx.stroke();
  }
  ctx.fillStyle = '#bfe9ff';
  ctx.beginPath();
  ctx.arc(32, 32, 8, 0, Math.PI * 2);
  ctx.fill();
  slowTex = new THREE.CanvasTexture(c);
  return slowTex;
}

/** Desenha texto (número de dano) num canvas de sprite. */
export function drawPopupText(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
): void {
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = 'bold 72px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(8,10,20,0.85)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, 64, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 64);
}
