import * as THREE from 'three';

/**
 * Shaders de chama compartilhados: a criatura (FlameRig), os projéteis
 * (bola de fogo com a MESMA aparência) e futuros efeitos usam exatamente o
 * mesmo visual. Suporta renderização instanciada (InstancedMesh) e um
 * 'aSeed' por parte/projétil para dessincronizar o fervor.
 */

export const NOISE_GLSL = /* glsl */ `
float fhash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float fnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fhash(i), fhash(i + vec3(1, 0, 0)), f.x),
        mix(fhash(i + vec3(0, 1, 0)), fhash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(fhash(i + vec3(0, 0, 1)), fhash(i + vec3(1, 0, 1)), f.x),
        mix(fhash(i + vec3(0, 1, 1)), fhash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  for (int k = 0; k < 3; k++) {
    v += a * fnoise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 4.3);
    a *= 0.5;
  }
  return v;
}
`;

export const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;
uniform float uHurt;
attribute float aSeed; // phase por parte/projétil (0 quando ausente)
varying float vN1;
varying float vH;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vH = uv.y;
  // ruído anisotrópico: fino na horizontal, grosso na vertical, subindo rápido
  vec3 q = vec3(pos.x * 3.2, pos.y * 1.35 - uTime * 3.1, pos.z * 3.2) + uSeed + aSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.1 + vec3(0.0, -uTime * 2.2, 0.0) + 17.0);
  vN1 = mix(n1, n2, 0.25);
  // base firme, pontas violentas
  float amp = uAmp * mix(0.5, 1.5, uv.y) * (1.0 + uHurt * 0.5);
  pos += normal * ((n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9) * amp;
  // pontas "chupadas" para cima (língua de fogo)
  pos.y += (n1 - 0.4) * amp * uv.y;
  // torção que cresce com a altura
  float tw = (fbm(q * 1.5 + 13.0) - 0.5) * 1.8 * clamp(pos.y, 0.0, 1.4);
  float c = cos(tw);
  float s = sin(tw);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  #ifdef USE_INSTANCING
    vNrm = normalMatrix * (mat3(instanceMatrix) * normal);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  #else
    vNrm = normalMatrix * normal;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  #endif
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const FLAME_FRAG = /* glsl */ `
uniform vec3 uCold;
uniform vec3 uMid;
uniform vec3 uHot;
uniform float uAlpha;
uniform float uAlphaMul;
uniform float uHurt;
varying float vN1;
varying float vH;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vec3 vd = normalize(vView);
  // clamp antes do pow (regra HANDOFF #4: base de pow nunca negativa — WebKit
  // produz NaN e desenha preto; ULPs de dot normalizado estouram 1.0)
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 1.6);
  // calor: base incandescente, topo esfriando; ruído mancha o gradiente
  float heat = clamp(1.18 - vH * 1.15 + (vN1 - 0.5) * 0.5, 0.0, 1.0);
  vec3 col = mix(uMid, uHot, smoothstep(0.6, 0.98, heat));
  col = mix(uCold, col, smoothstep(0.12, 0.6, heat));
  col += uHot * rim * 0.65;
  col *= 1.08;
  col = mix(vec3(1.0, 0.95, 0.85), col, 1.0 - uHurt * 0.45); // flash de dano
  // base quase opaca → topo translúcido
  float a = (0.82 + 0.35 * vN1) * (1.0 - 0.62 * smoothstep(0.5, 1.1, vH));
  a *= uAlphaMul * uAlpha;
  gl_FragColor = vec4(col, a);
}
`;

export interface FlameMaterialOpts {
  cold: string;
  mid: string;
  hot: string;
  amp: number;
  alphaMul?: number;
  seed?: number;
}

/**
 * Geometria das brasas: N pontos com um `aRand` aleatório (ângulo, fase,
 * velocidade/tamanho) — a posição de cada brasa nasce no vertex shader, então
 * o buffer fica vazio e só cresce no `prog` do ciclo de vida.
 */
export function makeEmberGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

/** sistema de brasas compartilhado: FlameRig e a malha importada do Ignis Nv.1
 *  usam exatamente as mesmas fagulhas subindo (identidade da chama da espécie) */
export function makeEmberParticles(o: {
  count: number;
  emberScale: number;
  level: number;
  topY: number;
}): { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial } {
  return {
    geo: makeEmberGeo(o.count),
    mat: new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: o.emberScale },
        uSpread: { value: 0.55 + o.level * 0.18 }, // fogo maior solta brasas mais longe
        uHeight: { value: o.topY }, // brasas sobem junto da coluna de fogo do nível
      },
    }),
  };
}

export const EMBER_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: velocidade/tamanho
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uSpread;
uniform float uHeight;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.32 + 0.42 * aRand.z;
  float prog = fract(uTime * speed + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.5 * (1.0 + aRand.z);
  float r = mix(0.14, 0.75, prog) * (0.5 + 0.5 * aRand.z) * uSpread;
  vec3 p = vec3(cos(ang) * r, mix(0.2, 1.0, prog) * uHeight, sin(ang) * r);
  p.x += sin(uTime * 2.3 + aRand.x * 10.0 + prog * 9.0) * 0.08;
  p.z += cos(uTime * 2.0 + aRand.y * 8.0 + prog * 7.0) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (5.0 * (1.0 - prog) + 1.2) * (0.7 + 0.5 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.45, 1.0, prog)) * uAlpha;
  vC = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.28, 0.05), prog);
  gl_Position = projectionMatrix * mv;
}
`;

export const EMBER_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.12, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA);
}
`;

export function makeFlameMaterial(o: FlameMaterialOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uHurt: { value: 0 },
      uAlpha: { value: 1 },
      uAlphaMul: { value: o.alphaMul ?? 1 },
      uCold: { value: new THREE.Color(o.cold) },
      uMid: { value: new THREE.Color(o.mid) },
      uHot: { value: new THREE.Color(o.hot) },
    },
  });
}
