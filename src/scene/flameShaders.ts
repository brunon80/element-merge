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
  float rim = pow(1.0 - abs(dot(normalize(vNrm), vd)), 1.6);
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
