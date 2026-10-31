import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT } from './stoneShaders';

/**
 * Shaders do RAIO (Nv.6 — fogo domado pelo vendaval). Três materiais formam
 * o figurino elétrico da árvore elemental (mesma abordagem dos puros: casca
 * OPACA para o corpo, só os arcos/plasma são aditivos):
 *
 *  - makeLightningShellMaterial: corpo dourado-opaco com iluminação fake da
 *    arena (ver stoneShaders/ARENA_LIGHT), nervuras elétricas correntendo pela
 *    casca, aletas de descarga eriçadas na carga e uma CAVIDADE de plasma no
 *    centro do peito (recorte com limiar de ruído) que deixa o núcleo dourado
 *    vazando para fora — o "centro brilhante exalando" do espírito da trovoada;
 *  - makeArcMaterial: arcos aditivos (anéis orbitando o corpo, lasca de
 *    corrente, cone de faísca): traço tracejado correndo ao longo do uv.y com
 *    sobressaltos nervosos + zigue-zague radial nos vértices (patamar de
 *    ruído, como o relevo do golem, para as linhas não virarem rabiscos);
 *  - makeCoreMaterial: plasma dourado pulsante (núcleo, centro do projétil).
 *
 * Todos suportam instancing (aSeed por peça/projétil) porque o projétil do
 * Raio desenha com os MESMOS materiais da criatura (igual bola de fogo do
 * Ignis e matacão do golem).
 */

const STEPPED_GLSL = /* glsl */ `
// ruído em patamar (2 níveis): cria fendas de borda dura — eletricidade risca,
// não mancha; é o truque que separa "raio" de "bruma"
float sstep2(float x) {
  return step(0.5, x);
}
float stepped(vec3 p, float f) {
  return sstep2(fnoise(p * f));
}
`;

export const LIGHTNING_SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // relevo/arestas da casca
uniform float uCharge; // carga do disparo (o corpo eriça)
uniform float uHurt;
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
${STEPPED_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = position + uSeed + aSeed;
  float n1 = fbm(vLocal * 1.9);
  float k = stepped(vLocal, 6.0); // fenda dura: aresta deslocada some/infla
  float amp = uAmp * (1.0 + uHurt * 0.3);
  pos += nrm * ((n1 - 0.5) * 1.1 + (k - 0.5) * 0.8) * amp;
  // aletas de descarga: pontas eriçadas pelo campo, crescem com a carga
  float spikes = stepped(vLocal * 3.4 + vec3(0.0, uTime * 0.7, 0.0), 4.2);
  pos += nrm * spikes * (0.005 + uCharge * 0.018);
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

export const LIGHTNING_SHELL_FRAG = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uDark;
uniform vec3 uVein;
uniform vec3 uCore;
uniform vec3 uCool;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform vec3 uTeamColor;
uniform float uTime;
uniform float uSeed;
uniform float uCharge;
uniform float uHurt;
uniform float uCoreCut; // >0: cavidade de plasma que expõe o núcleo
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
${STEPPED_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // cavidade do núcleo: limiar móvel do ruído abre um buraco irregular no
  // peito; o plasma dourado (renderizado aditivo, por dentro) aparece aqui
  float cav = fbm(vLocal * 2.4 + vec3(0.0, uTime * 0.35, 0.0));
  if (cav > uCoreCut) discard;
  float holeGlow = smoothstep(uCoreCut - 0.10, uCoreCut - 0.01, cav) * 1.0;
  // casca: duas tonalidades + faíscas minerais
  float mottle = fbm(vLocal * 2.2);
  float speck = fnoise(vLocal * 13.0);
  vec3 col = mix(uDark, uBody, smoothstep(0.30, 0.72, mottle));
  col += vec3(0.20, 0.17, 0.08) * smoothstep(0.74, 0.95, speck) * 0.6;

  // nervuras elétricas: traço duro e estreito correndo pela casca
  float vein = fnoise(vLocal * 5.2 + vec3(uTime * 0.9, uTime * 0.5, 0.0));
  float veinMask = smoothstep(0.50, 0.545, vein) * (1.0 - smoothstep(0.56, 0.61, vein));
  float dash = 0.55 + 0.45 * sin(uTime * 26.0 + vLocal.y * 60.0 + uSeed);
  col += uVein * veinMask * dash * (0.45 + uCharge * 0.75);

  // estalos instantâneos: ilhas duras que acendem e apagam
  float snap = sstep2(fnoise(vLocal * 3.6 + vec3(uTime * 5.5)));
  float snapOn = step(0.78, fnoise(vLocal * 1.7 - vec3(uTime * 4.2)));
  col += uVein * snap * snapOn * (0.12 + uCharge * 0.4) * 0.5;

  // hemisfério + key quente da arena (o mesmo figurino do golem: opaco com
  // luz fake é o que mantém o monstro legível de longe no tabuleiro)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.34 + 0.66 * ndl));
  vec3 hv = normalize(uKeyDir + vd);
  col += uKeyColor * pow(max(0.0, dot(n, hv)), 24.0) * 0.1;

  // aro na cor da equipe + aro dourado elétrico por cima; o aro FRIO azul é a
  // assinatura da corrente (o azul elétrico da referência, o ouro como acento)
  float rim = pow(1.0 - max(0.0, dot(n, vd)), 2.2);
  col += uTeamColor * rim * 0.26;
  col += uCore * rim * (0.06 + uCharge * 0.2);
  col += uCool * rim * (0.12 + uCharge * 0.4);
  col += uCore * holeGlow;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface LightningShellOpts {
  body: string;
  dark: string;
  vein: string;
  core: string;
  cool?: string;
  amp: number;
  coreCut?: number;
  seed?: number;
  teamColor?: string;
}

export function makeLightningShellMaterial(o: LightningShellOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: LIGHTNING_SHELL_VERT,
    fragmentShader: LIGHTNING_SHELL_FRAG,
    // corpo sólido: opaco, escreve profundidade (peso/legibilidade no tabuleiro)
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uCharge: { value: 0 },
      uHurt: { value: 0 },
      uCoreCut: { value: o.coreCut ?? 0 },
      uBody: { value: new THREE.Color(o.body) },
      uDark: { value: new THREE.Color(o.dark) },
      uVein: { value: new THREE.Color(o.vein) },
      uCore: { value: new THREE.Color(o.core) },
      uCool: { value: new THREE.Color(o.cool ?? '#5fc8ff') },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
      uTeamColor: { value: new THREE.Color(o.teamColor ?? '#c8dcff') },
    },
  });
}

export const ARC_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uJitter; // deslocamento radial (zigue-zague do traço)
uniform float uFlow;   // velocidade do tracejado
attribute float aSeed;
varying vec2 vUv;
varying float vN1;
${NOISE_GLSL}
${STEPPED_GLSL}
void main() {
  vUv = uv;
  vec3 pos = position;
  #ifdef USE_INSTANCING
    vec3 nrm = normalize(mat3(instanceMatrix) * normal);
  #else
    vec3 nrm = normalize(normal);
  #endif
  // zigue-zague em PATAMAR (2 níveis ao longo do traço): a linha vira uma
  // polilinha de segmentos tortos, não um rabisco senoidal
  float seg = stepped(vec3(0.0, vUv.y * 7.0, uSeed + aSeed), 1.0);
  float side = stepped(vec3(vUv.y * 13.0, uSeed, aSeed), 1.0) * 2.0 - 1.0;
  float boil = 0.7 + 0.3 * sin(uTime * 22.0 + vUv.y * 24.0 + aSeed * 7.0);
  pos += nrm * (seg * 2.0 - 1.0) * side * uJitter * boil;
  vN1 = fnoise(vec3(vUv.y * 40.0, uSeed, uTime * 0.7));
  #ifdef USE_INSTANCING
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  #endif
}
`;

export const ARC_FRAG = /* glsl */ `
uniform vec3 uGold;
uniform vec3 uWhite;
uniform vec3 uCool;
uniform float uCoolAmt; // peso do azul elétrico sobre o traço (0=so ouro)
uniform float uTime;
uniform float uSeed;
uniform float uDash;   // densidade dos traços ao longo do uv.y
uniform float uFlow;   // sentido/velocidade da corrente
uniform float uCharge;
uniform float uAlpha;
varying vec2 vUv;
varying float vN1;
${NOISE_GLSL}
void main() {
  // traços correndo ao longo do fio (a corrente flui pelo anel/projétil) com
  // flicker nervoso de alta frequência
  float f = fract(vUv.y * uDash - uTime * uFlow + uSeed);
  float dash = smoothstep(0.04, 0.16, f) * (1.0 - smoothstep(0.38, 0.52, f));
  float flick = 0.72 + 0.28 * sin(uTime * 47.0 + vUv.y * 80.0 + uSeed * 3.1);
  dash *= flick;
  float core = smoothstep(0.22, 0.9, dash + 0.18 * vN1);
  vec3 col = mix(uGold, uWhite, core) * (0.55 + 0.3 * vN1);
  // azul elétrico por cima do ouro (a corrente da referência é azul-clara
  // com acentos dourados): o traço fica frio nas pontas e quente no miolo
  float coolMix = uCoolAmt * (0.55 + 0.45 * core);
  col = mix(col, mix(uCool, uWhite, core * 0.8), coolMix);
  float a = (0.12 + 0.55 * dash) * uAlpha * (1.0 + uCharge * 0.4);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(col * (1.0 + uCharge * 0.25), min(1.0, a));
}
`;

export interface ArcMaterialOpts {
  gold: string;
  white: string;
  cool?: string;
  coolAmt?: number;
  jitter: number;
  dash: number;
  flow?: number;
  seed?: number;
}

export function makeArcMaterial(o: ArcMaterialOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ARC_VERT,
    fragmentShader: ARC_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uJitter: { value: o.jitter },
      uDash: { value: o.dash },
      uFlow: { value: o.flow ?? 5 },
      uCharge: { value: 0 },
      uAlpha: { value: 1 },
      uGold: { value: new THREE.Color(o.gold) },
      uWhite: { value: new THREE.Color(o.white) },
      uCool: { value: new THREE.Color(o.cool ?? '#5fc8ff') },
      uCoolAmt: { value: o.coolAmt ?? 0 },
    },
  });
}

export const CORE_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;
attribute float aSeed;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = position + uSeed + aSeed;
  float n1 = fbm(vLocal * 3.0 + vec3(0.0, uTime * 1.4, uTime * 0.6));
  pos += nrm * (n1 - 0.5) * uAmp;
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

export const CORE_FRAG = /* glsl */ `
uniform vec3 uGold;
uniform vec3 uWhite;
uniform vec3 uCool;
uniform float uTime;
uniform float uSeed;
uniform float uCharge;
uniform float uAlpha;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  float boil = fbm(vLocal * 5.0 + vec3(uTime * 2.2));
  float pulse = 0.82 + 0.12 * sin(uTime * 9.0 + uSeed);
  vec3 vd = normalize(vView);
  float fres = pow(1.0 - abs(dot(normalize(vNrm), vd)), 1.5);
  vec3 col = mix(uGold, uWhite, clamp(boil * 0.62 - 0.28, 0.0, 0.38));
  // núcleo quente e legível, com apenas um contorno azul elétrico discreto
  col = col * pulse + uCool * fres * 0.16;
  col *= 1.0 + uCharge * 0.22;
  float a = uAlpha * (0.78 + 0.12 * boil);
  gl_FragColor = vec4(col, a);
}
`;

export interface CoreMaterialOpts {
  gold: string;
  white: string;
  cool?: string;
  amp?: number;
  seed?: number;
}

export function makeCoreMaterial(o: CoreMaterialOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp ?? 0.05 },
      uCharge: { value: 0 },
      uAlpha: { value: 1 },
      uGold: { value: new THREE.Color(o.gold) },
      uWhite: { value: new THREE.Color(o.white) },
      uCool: { value: new THREE.Color(o.cool ?? '#5fc8ff') },
    },
  });
}
