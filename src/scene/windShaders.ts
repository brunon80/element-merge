import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';

/**
 * Shaders de VENTO compartilhados: o rig do zéfiro (WindRig) monta o funil e os
 * anéis com este material. A ideia é a de seda em movimento — a superfície é
 * translúcida (dá para ver o lado de dentro do funil girando), tem fitas de
 * vento que sobem em espiral, e a coluna inteira se torce e balança como um
 * funil real:
 *
 *  - rotação DIFERENCIAL: a base gira mais rápido que o topo (`uSpin`), então o
 *    funil cisalha em vez de girar como um sólido;
 *  - torção irregular: o ruído entra no ângulo de torção, então a espiral nunca
 *    é a de um cilindro reto;
 *  - balanço global: `uBend` desloca a coluna pelo `gfrac` (fração da altura do
 *    MODELO, não da peça), mantendo as emendas das peças contínuas — por isso
 *    cada material recebe `uYOff` (a altura da peça no modelo) e `uModelH`.
 */

export const WIND_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;   // fase do ruído (por peça)
uniform float uPhase;  // fase do balanço (compartilhada pela criatura toda)
uniform float uAmp;    // turbulência (desloca a casca ao longo da normal)
uniform float uTwist;  // enrolamento por altura
uniform float uSpin;   // rad/s na base (o topo gira mais devagar)
uniform float uBend;   // balanço lateral da coluna
uniform float uFlare;  // energia reunida no ataque (acelera torção e brilho)
uniform float uHurt;   // flash de dano
uniform float uYOff;   // altura da peça dentro do modelo (emendas contínuas)
uniform float uModelH; // altura da forma atual
attribute float aSeed;
varying float vU;
varying float vAng;
varying float vN1;
varying float vG;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vU = uv.y;
  vAng = atan(pos.z, pos.x);

  // altura global dentro do modelo (0 no chão .. 1 no topo da forma)
  float gh = pos.y + uYOff;
  float gfrac = clamp(gh / max(0.001, uModelH), 0.0, 1.0);
  vG = gfrac;

  // ruído anisotrópico subindo pela superfície
  vec3 q = vec3(pos.x * 2.4, pos.y * 1.4 - uTime * 2.1, pos.z * 2.4) + uSeed + aSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.2 + vec3(3.1, -uTime * 1.6, 1.7) + 11.0);
  vN1 = mix(n1, n2, 0.3);

  // casca ondulando (tecido de vento)
  float amp = uAmp * (1.0 + uHurt * 0.35) * (1.0 + uFlare * 0.35);
  pos += nrm * ((n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9) * amp;

  // torção + rotação diferencial com o ruído dentro do ângulo (espiral bamba)
  float ang =
    uTwist * gh * (1.0 + uFlare * 0.6) +
    uTime * uSpin * (1.0 - 0.4 * gfrac) * (1.0 + uFlare * 0.9) +
    (fbm(q * 0.8 + 5.0) - 0.5) * 1.2;
  float c = cos(ang);
  float s = sin(ang);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  nrm.xz = mat2(c, -s, s, c) * nrm.xz;

  // a coluna balança como um funil solto (mesma fase para todas as peças)
  float sway = uBend * gfrac * gfrac * (1.0 + uFlare * 0.8);
  pos.x += sin(uTime * 0.85 + uPhase) * sway;
  pos.z += cos(uTime * 0.67 + uPhase * 1.7) * sway * 0.8;

  #ifdef USE_INSTANCING
    vNrm = normalMatrix * (mat3(instanceMatrix) * nrm);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  #else
    vNrm = normalMatrix * nrm;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  #endif
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const WIND_FRAG = /* glsl */ `
uniform vec3 uCold;
uniform vec3 uMid;
uniform vec3 uHot;
uniform float uTime;
uniform float uPhase;
uniform float uAlpha;
uniform float uAlphaMul;
uniform float uSoft;    // 1 = casca (some na borda de baixo), 0 = bola cheia
uniform float uFlare;
uniform float uHurt;
varying float vU;
varying float vAng;
varying float vN1;
varying float vG;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 vd = normalize(vView);
  float rim = pow(1.0 - abs(dot(normalize(vNrm), vd)), 1.5);

  // fitas de vento: faixas que sobem pela superfície (varrem com o tempo).
  // um único passo de ruído + uma faixa senoidal viajante — barato o bastante
  // para várias camadas translúcidas sobrepostas sem derrubar o quadro.
  float band = fnoise(vec3(vAng * 2.6, vU * 4.0 - uTime * 2.4 + vN1 * 0.8, uPhase));
  band = smoothstep(0.26, 0.82, band);
  float ribbon = 0.5 + 0.5 * sin(vAng * 8.0 + vU * 13.0 - uTime * 5.2);
  band = mix(band, ribbon, 0.42);

  float heat = clamp(
    band * 0.45 + vN1 * 0.25 + rim * 0.45 + uFlare * 0.28 + 0.12 * (1.0 - vG), 0.0, 1.0
  );
  // nuvem de tempestade: cinza-azulado na massa, branco só nas fitas/tornos e
  // nas bordas iluminadas (branco em tudo = "bola de luz", não vento)
  vec3 col = mix(uCold, uMid, smoothstep(0.08, 0.55, heat));
  col = mix(col, uHot, smoothstep(0.74, 1.0, heat) * 0.85);
  col += uHot * rim * 0.35;
  col = mix(vec3(1.0), col, uHurt * 0.45); // flash de dano

  // massa translúcida (mesclagem normal, não aditiva: nada estoura), base mais
  // densa que o topo; a face de dentro do funil é mais fraca
  float a = 0.3 + 0.62 * band + 0.6 * rim;
  a *= 1.0 - 0.3 * smoothstep(0.6, 1.0, vG);
  a *= mix(1.0, smoothstep(0.0, 0.1, vU), uSoft);
  a *= gl_FrontFacing ? 1.0 : 0.45;
  a *= uAlphaMul * uAlpha;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col, a);
}
`;

export interface WindMaterialOpts {
  cold: string;
  mid: string;
  hot: string;
  amp: number;
  twist?: number;
  spin?: number;
  bend?: number;
  alphaMul?: number;
  /** 1 = casca aberta (some na borda inferior), 0 = volume cheio (bolas) */
  soft?: number;
  seed?: number;
  phase?: number;
  yOff?: number;
  modelH?: number;
}

export function makeWindMaterial(o: WindMaterialOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: WIND_VERT,
    fragmentShader: WIND_FRAG,
    transparent: true,
    // mesclagem NORMAL (não aditiva): as camadas de vento se sobrepõem sem
    // estourar em branco — o corpo é uma nuvem translúcida, e o que deve brilhar
    // no vendaval (detritos, clarão) continua em aditivo dentro do rig
    blending: THREE.NormalBlending,
    depthWrite: false,
    // dupla face: vê-se a parede de dentro do funil girando (ela é mais fraca)
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uPhase: { value: o.phase ?? 0 },
      uAmp: { value: o.amp },
      uTwist: { value: o.twist ?? 0.9 },
      uSpin: { value: o.spin ?? 1.8 },
      uBend: { value: o.bend ?? 0.05 },
      uFlare: { value: 0 },
      uHurt: { value: 0 },
      uYOff: { value: o.yOff ?? 0 },
      uModelH: { value: o.modelH ?? 2 },
      uAlpha: { value: 1 },
      uAlphaMul: { value: o.alphaMul ?? 1 },
      uSoft: { value: o.soft ?? 1 },
      uCold: { value: new THREE.Color(o.cold) },
      uMid: { value: new THREE.Color(o.mid) },
      uHot: { value: new THREE.Color(o.hot) },
    },
  });
}
