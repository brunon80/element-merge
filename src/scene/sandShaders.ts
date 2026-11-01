import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT } from './stoneShaders';

/**
 * Shader de AREIA COMPACTADA para a espécie Areia (Nv.6 — o gênio do deserto,
 * terra+ar). A areia da criatura NÃO é plástico bege liso (o modelo antigo):
 * é uma DUNA QUE GANHA VONTADE —
 *
 *  - relevo de TWO FREQÜÊNCIAS: lombadas largas de dune (fbm) + grão miúdo
 *    (fnoise em escala alta) deslocando a casca;
 *  - o grão ESCORREGA para baixo no espaço do objeto (ruído rolando em +y com
 *    o tempo = a face da dune deslizando, a dune "andando" sem sair do lugar);
 *  - VEIOS DE ESCORRIMENTO (o análogo das trincas da pedra): filetes escuros
 *    de avalanche que descem pela superfície, e que ACENDEM âmbar quando o
 *    gênio carrega a rajada (uCharge) — a areia vibrando de energia;
 *  - PULVERIZAÇÃO DE MICA: pontinhos esparsos que pegam a luz (uSpeckle), o
 *    brilho seco de deserto ao sol;
 *  - opaco, mesclagem normal, NUNCA aditivo (regra de legibilidade do
 *    projeto); sem tint da equipe — areia é o ocre do deserto sempre (a
 *    regra da nuvem/vapor: translúcido ou granular não aceita tinta de time).
 *
 * Instanciado por aSeed (peças do rig; o ProjectileField usa o material de
 * pedra na paleta areia para o núcleo compactado da rajada).
 */

export const SAND_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // lombada de duna + grão
uniform float uFlow;   // velocidade do grão escorregando (duna viva)
uniform float uBreath;
uniform float uHurt;
uniform float uCharge; // carregando a rajada: a areia vibra
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = position + uSeed + aSeed;
  // lombadas de duna (largo) + grão (miúdo). o ruído largo ROLA para baixo:
  // a face da duna deslizando grão a grão
  float dune = fbm(vLocal * 1.7 + vec3(0.0, uTime * uFlow, 0.0));
  float grain = fnoise(vLocal * 7.2 + vec3(0.0, uTime * uFlow * 2.6, 0.0));
  float amp = uAmp * (1.0 + uHurt * 0.25 + uCharge * 0.5);
  pos += nrm * ((dune - 0.5) * 1.5 + (grain - 0.5) * 0.6) * amp;
  // pulso de carga: a duna inteira treme com a energia
  pos *= 1.0 + uBreath * 0.012 + uCharge * 0.03;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vNrm = normalMatrix * (mat3(instanceMatrix) * nrm);
    vec4 mv = viewMatrix * wp;
  #else
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vNrm = normalMatrix * nrm;
    vec4 mv = viewMatrix * wp;
  #endif
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const SAND_FRAG = /* glsl */ `
uniform vec3 uSandA;     // areia clara (o topo varrido pelo vento)
uniform vec3 uSandB;     // areia sombra (vale entre as lombadas)
uniform vec3 uFlowCol;   // filete de avalanche (escuro) + âmbar na carga
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform float uTime;
uniform float uSeed;
uniform float uFlow;
uniform float uFlowGlow; // brilho âmbar dos veios carregando a rajada
uniform float uCharge;
uniform float uHurt;
uniform float uSpeckle;  // mica pegando sol
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // manchas de duna (duas areias) + grão fino visível no shading
  float mottle = fbm(vec3(vLocal.x * 2.0, vLocal.y * 2.0 - uTime * uFlow, vLocal.z * 2.0));
  float grain = fnoise(vLocal * 16.0);
  vec3 col = mix(uSandB, uSandA, smoothstep(0.3, 0.75, mottle));
  col *= 0.94 + 0.12 * grain; // o grão piando claro/escuro na luz

  // veios de ESCORRIMENTO: o mesmo truque dobrado das trincas do gelo
  // (cume estreito de ruído) descendo com o tempo — avalanche miúda na face
  // da duna. escuros por padrão, âmbar quando a criatura carrega a rajada
  float vein = abs(fnoise(vec3(vLocal.x * 3.1, vLocal.y * 1.6 - uTime * uFlow * 1.8, vLocal.z * 3.1)) * 2.0 - 1.0);
  float w = 0.06 + uCharge * 0.05;
  float streak = 1.0 - smoothstep(w, w + 0.1, vein);
  float seg = step(0.42, fbm(vLocal * 1.3 + 7.0)); // o veio param e recomeçam
  streak *= seg;
  col = mix(col, uFlowCol * 0.55, streak * 0.5);               // sulco escuro
  col += uFlowCol * streak * (uFlowGlow + uCharge * 1.4);      // brasa de duna

  // mica: pontinhos esparsos que estouram na luz (sem blowout: teto baixo)
  float mica = fnoise(vLocal * 30.0);
  col += vec3(1.0, 0.92, 0.7) * smoothstep(0.86, 0.97, mica) * uSpeckle * 0.5;

  // luz da arena: areia é opaca mas seca — sombra quente (o chão do deserto
  // rebatedor), nunca a sombra azul fria da rocha
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb * 1.15 + uKeyColor * (0.35 + 0.65 * ndl));
  // rim seco de vento (leve, sem virar aro)
  float fres = pow(1.0 - max(0.0, dot(n, vd)), 2.4);
  col += uSkyColor * fres * 0.22;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.45);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SandMaterialOpts {
  /** areia clara / areia de sombra / filete de avalanche */
  sandA: string;
  sandB: string;
  flow?: string;
  amp: number;
  /** velocidade do grão escorregando (0 = duna morta) */
  flowSpeed?: number;
  flowGlow?: number;
  speckle?: number;
  seed?: number;
  breath?: number;
}

export function makeSandMaterial(o: SandMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: SAND_VERT,
    fragmentShader: SAND_FRAG,
    // areia compactada: OPACA (grão não é gás — depthWrite liga)
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uFlow: { value: o.flowSpeed ?? 0.35 },
      uBreath: { value: o.breath ?? 1 },
      uHurt: { value: 0 },
      uCharge: { value: 0 },
      uFlowGlow: { value: o.flowGlow ?? 0.15 },
      uSpeckle: { value: o.speckle ?? 1 },
      uSandA: { value: new THREE.Color(o.sandA) },
      uSandB: { value: new THREE.Color(o.sandB) },
      uFlowCol: { value: new THREE.Color(o.flow ?? '#ffb347') },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
    },
  });
}
