import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';

/**
 * Shader de PEDRA para o elemento terra (golem). Diferente do fogo/vento, a
 * rocha é OPACA (depthWrite ligado, face frontal): assim ela se autobreia e
 * bloqueia o que está atrás — é isso que dá peso de montanha.
 *
 * O visual vem de três camadas procedurais:
 *  - relevo: ruído desloca os vértices ao longo da normal (seixos, sulcos de
 *    erosão, arestas quebradas), então nenhuma peça de geometria "limpa"
 *    (caixa/dodecaedro/cápsula) parece usinada;
 *  - manchas: duas tonalidades de pedra + pontinhos claros de mineral;
 *  - fissuras: faixas estreitas de magma que pulsam e ACENDEM quando o golem
 *    carrega o golpe (o castigo visual do soco).
 *
 * A iluminação é uma reimplementação barata da luz da arena (ver Lighting.tsx):
 * hemisfério (céu #8fb2ff / chão #141a2c), ambiente #a8c4ff e a key quente
 * #ffe9c4 vinda de [7,13,5] — os valores já vêm multiplicados pelas intensidades.
 * O aro (rim) recebe a cor da equipe (dourado/jogador, violeta/IA), que é como
 * as luzes pontuais da arena batem nas laterais.
 */

export const STONE_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // relevo/erosão
uniform float uBreath; // pressão interna (a montanha respira)
uniform float uHurt;
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = position + uSeed + aSeed;
  float n1 = fbm(vLocal * 1.7);
  float n2 = fnoise(vLocal * 4.4 + 7.0);
  float amp = uAmp * (1.0 + uHurt * 0.3);
  pos += nrm * ((n1 - 0.5) * 1.6 + (n2 - 0.5) * 0.8) * amp;
  // respiração lenta do monólito (incha um pouco, nunca vira "bolha")
  pos *= 1.0 + uBreath * 0.014 * (0.55 + 0.45 * n1);
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

export const STONE_FRAG = /* glsl */ `
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform vec3 uCrack;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform vec3 uTeamColor;
uniform float uTime;
uniform float uSeed;
uniform float uCrackGlow;
uniform float uCharge;
uniform float uHurt;
uniform float uSpeck;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // pedra manchada + mineral claro
  float mottle = fbm(vLocal * 2.1);
  float speck = fnoise(vLocal * 13.0);
  vec3 col = mix(uRockB, uRockA, smoothstep(0.32, 0.74, mottle));
  col += vec3(0.14, 0.14, 0.13) * smoothstep(0.72, 0.94, speck) * uSpeck;

  // fissuras de magma: faixa estreita onde o ruído cruza o limiar
  float vein = fnoise(vLocal * 3.1 + vec3(0.0, uTime * 0.06, 0.0));
  float crack = smoothstep(0.45, 0.5, vein) * (1.0 - smoothstep(0.52, 0.58, vein));
  float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + uSeed) + uCharge * 1.5;
  col += uCrack * crack * uCrackGlow * pulse * 1.7;

  // hemisfério + key quente da arena (com "wrap" pra face não virar silhueta)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.34 + 0.66 * ndl));
  vec3 hv = normalize(uKeyDir + vd);
  col += uKeyColor * pow(max(0.0, dot(n, hv)), 24.0) * 0.1;

  // aro na cor da equipe (as luzes pontuais da arena)
  float rim = pow(1.0 - max(0.0, dot(n, vd)), 2.2);
  col += uTeamColor * rim * 0.3;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** iluminação padrão da arena (espelha Lighting.tsx, já vezes intensidade) */
export const ARENA_LIGHT = {
  keyDir: [0.4527, 0.8404, 0.3233], // normalize([7,13,5])
  keyColor: '#ffe9c4',
  keyIntensity: 1.7,
  skyColor: '#8fb2ff',
  groundColor: '#141a2c',
  hemiIntensity: 0.75,
  ambColor: '#a8c4ff',
  ambIntensity: 0.18,
};

export const TEAM_TINT = { player: '#f5c451', ai: '#9d5cff', neutral: '#c8dcff' };

export interface StoneMaterialOpts {
  /** pedra clara / pedra escura / cor das fissuras */
  rockA: string;
  rockB: string;
  crack: string;
  amp: number;
  crackGlow?: number;
  speck?: number;
  seed?: number;
  breath?: number;
  teamColor?: string;
}

export function makeStoneMaterial(o: StoneMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: STONE_VERT,
    fragmentShader: STONE_FRAG,
    // rocha sólida: opaca, escreve profundidade, só face externa
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uBreath: { value: o.breath ?? 1 },
      uHurt: { value: 0 },
      uCharge: { value: 0 },
      uCrackGlow: { value: o.crackGlow ?? 0.5 },
      uSpeck: { value: o.speck ?? 1 },
      uRockA: { value: new THREE.Color(o.rockA) },
      uRockB: { value: new THREE.Color(o.rockB) },
      uCrack: { value: new THREE.Color(o.crack) },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
      uTeamColor: { value: new THREE.Color(o.teamColor ?? TEAM_TINT.neutral) },
    },
  });
}
