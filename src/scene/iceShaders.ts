import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT, TEAM_TINT } from './stoneShaders';

/**
 * Shader de GELO CRISTALINO para a espécie Gelo (Nv.6 — water+air). O pedido
 * do usuário: maior, MAIS BRANCO, com aparência translúcida/transparente e
 * reflexiva — e o padrão continua o do golem (objeto físico, sem energia
 * aditiva). A receita do "cristal" sem blending aditivo nem refração real:
 *
 *  - corpo quase BRANCO (o gelo legível de longe no tabuleiro), com manchas
 *    azuladas de densidade no miolo (glaciar) e veios de fratura INTERNOS —
 *    trinca fina de gelo que brilha por dentro (uCharge acende na carga do
 *    disparo, igual às fissuras da pedra/madeira);
 *  - reflexo fake do ambiente: specular apertado da key + reflexo do "teto"
 *    da arena varrendo com o fresnel (quanto mais de lado, mais espelhado) —
 *    é isso que dá o brilho reflexivo de cristal sem cubemap;
 *  - translucidez física: face frontal, alpha alto (~0.85), depthWrite LIGADO
 *    — o cristal se autobreia e embacia o que passa por dentro (depthTest
 *    contra si mesmo), sem o blowout do aditivo;
 *  - relevo: deslocamento sutil nas arestas (cristal cresce torto, lascas)
 *    e cintilância de glitter gelado.
 *
 * Suporta instancing (aSeed por peça/projétil): a estaca-assinatura do Gelo
 * desenha com o MESMO material, e os cacos do impacto também.
 */

export const ICE_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // lascas/relevo do cristal
uniform float uBreath; // gelo "respirando" (expansão térmica mínima)
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
  // relevos de cristal: facetas alongadas no Y (o icicle cresce no prumo)
  // + lascas de fratura em fbm baixinho
  float facets = fnoise(vLocal * vec3(7.0, 1.6, 7.0));
  float chips = fbm(vLocal * 2.2);
  float amp = uAmp * (1.0 + uHurt * 0.3);
  pos += nrm * ((facets - 0.5) * 0.7 + (chips - 0.5) * 1.5) * amp;
  // expansão térmica gelada (bem mais contida que a respiração da pedra)
  pos *= 1.0 + uBreath * 0.006 * (0.55 + 0.45 * chips);
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

export const ICE_FRAG = /* glsl */ `
uniform vec3 uIceA;      // gelo claro (quase branco)
uniform vec3 uIceB;      // densidade azulada do miolo
uniform vec3 uCrackCol;  // veios de fratura internos
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform vec3 uTeamColor;
uniform float uTime;
uniform float uSeed;
uniform float uCrackGlow;
uniform float uCrackScale; // multiplicador da frequência das trincas (peças grandes pedem >1)
uniform float uCrackWidth; // meia-espessura do veio ( largo demais vira onda de contorno)
uniform float uCharge;   // carregando o disparo: as trincas acendem por dentro
uniform float uHurt;
uniform float uSparkle;
uniform float uAlpha;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // corpo de glaciar: branco com manchas densas azuladas (o miolo do gelo)
  float dens = fbm(vLocal * 1.6);
  vec3 col = mix(uIceA, uIceB, smoothstep(0.34, 0.78, dens));

  // veios de fratura INTERNOS: trinca FINA e irregular que racha o cristal.
  // A frequência é multiplicada por uCrackScale (peça grande = veios mais
  // densos; na frequência fixa o padrão esticava nas peças grandes e virava
  // onda de contorno larga) e a meia-espessura vem de uCrackWidth — gelo
  // racha em planos limpos, então a faixa é fina, não a fissura larga da
  // pedra; brilha por dentro, sem aditivo
  float vein = fnoise(vLocal * 4.2 * uCrackScale + vec3(0.0, uTime * 0.04, 0.0));
  float w = uCrackWidth;
  float crack = smoothstep(0.5 - w, 0.5 - w * 0.2, vein) * (1.0 - smoothstep(0.5 + w * 0.2, 0.5 + w, vein));
  float pulse = 0.55 + 0.2 * sin(uTime * 1.2 + uSeed) + uCharge * 1.6;
  col += uCrackCol * crack * uCrackGlow * pulse;

  // glitter gelado: pontinhos que piscam quando o ângulo bate a key
  float grit = fnoise(vLocal * 24.0);
  col += vec3(0.5, 0.62, 0.7) * smoothstep(0.88, 0.99, grit) * uSparkle;

  // hemisfério + key quente da arena (o figurino físico da árvore)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.30 + 0.70 * ndl));

  // reflexo fake de ambiente: specular apertado da key (cristal reflete
  // "janelas" pontuais) + uma faixa do "teto" da arena varrendo com o
  // fresnel — girar o cristal acende e apaga o brilho, o truque do reflexo
  vec3 hv = normalize(uKeyDir + vd);
  col += uKeyColor * pow(max(0.0, dot(n, hv)), 60.0) * 0.42;
  vec3 refl = reflect(-vd, n);
  float ceiling = smoothstep(0.15, 0.85, refl.y);
  float streak = 0.5 + 0.5 * sin(refl.x * 9.0 + refl.z * 7.0 + uSeed);
  col += uSkyColor * ceiling * (0.25 + 0.75 * streak * streak) * 0.30;

  // aro reflexivo (fresnel forte: a beirada do cristal espelha a arena)
  float fres = pow(1.0 - max(0.0, dot(n, vd)), 2.4);
  col += vec3(0.75, 0.87, 1.0) * fres * 0.55;
  col += uTeamColor * fres * 0.22;

  // alfa: mais denso de frente, espelhado/beirada opaca (cristal visto de
  // lado reflete quase tudo) — embacia o fundo sem virar "fantasma"
  float a = clamp(uAlpha + fres * (1.0 - uAlpha) * 0.9 + crack * 0.25, 0.0, 1.0);

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.5);
  gl_FragColor = vec4(col, a);
}
`;

export interface IceMaterialOpts {
  /** gelo claro / azul do miolo / cor dos veios de fratura */
  iceA: string;
  iceB: string;
  crack: string;
  amp: number;
  crackGlow?: number;
  /** frequência relativa das trincas (peças grandes do corpo pedem >1) */
  crackScale?: number;
  /** meia-espessura do veio de fratura (fina = trinca de cristal) */
  crackWidth?: number;
  sparkle?: number;
  alpha?: number;
  seed?: number;
  breath?: number;
  teamColor?: string;
}

export function makeIceMaterial(o: IceMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: ICE_VERT,
    fragmentShader: ICE_FRAG,
    // cristal: translúcido (alpha no frag), mas escreve profundidade — o
    // próprio corpo se autobreia/embacia e mantém o peso físico do golem
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uBreath: { value: o.breath ?? 1 },
      uHurt: { value: 0 },
      uCharge: { value: 0 },
      uCrackGlow: { value: o.crackGlow ?? 0.6 },
      uCrackScale: { value: o.crackScale ?? 1 },
      uCrackWidth: { value: o.crackWidth ?? 0.04 },
      uSparkle: { value: o.sparkle ?? 1 },
      uAlpha: { value: o.alpha ?? 0.85 },
      uIceA: { value: new THREE.Color(o.iceA) },
      uIceB: { value: new THREE.Color(o.iceB) },
      uCrackCol: { value: new THREE.Color(o.crack) },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
      uTeamColor: { value: new THREE.Color(o.teamColor ?? TEAM_TINT.neutral) },
    },
  });
}
