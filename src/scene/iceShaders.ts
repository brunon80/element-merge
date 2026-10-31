import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { blackCubeTexture } from './envProbe';
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
 *  - reflexo do ambiente (adaptado de um tutorial de gelo em GLSL + da
 *    receita three `envMap`/MixOperation/reflectivity .5): a amostragem de
 *    "cubemap" é REAL — um cubemap 128px da arena capturado uma vez pelo
 *    envProbe e mixado a uEnvMix (o "reflectivity" da receita) — e atrás
 *    dele fica uma mini-arena procedural (céu/piso/holofotes da equipe) p/
 *    a beirada nunca ficar escura; a normal map virou micro-relevo
 *    procedural (passo pequeno no ruído = vidro liso, não gelo jateado) que
 *    perturba a normal e faz o brilho DANÇAR na superfície; specular
 *    apertado estilo exp128; fresnel^3);
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
  // relevos de cristal: flautas alongadas no Y (o icicle cresce no prumo)
  // + lascas de fratura em fbm baixinho. Frequência calibrada p/ a malha
  // DENSE dos terraços (12×6): facetagem grande e lida de longe — freq
  // alta demais em malha densa vira ruído de moagem (cristal lixado)
  float facets = fnoise(vLocal * vec3(3.2, 0.9, 3.2));
  float chips = fbm(vLocal * 1.7);
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
uniform float uCrackWidth; // meia-largura do CUME da trinca (unidades de ruído)
uniform float uCharge;   // carregando o disparo: as trincas acendem por dentro
uniform float uHurt;
uniform float uSparkle;
uniform float uAlpha;
uniform float uBump;     // micro-relevo procedural (equivale ao normal map do
                         // tutorial: perturba a normal e faz o reflexo dançar)
uniform float uReflPow;  // aperto do specular (cristal = brilho bem pontual)
uniform samplerCube uEnv; // cubemap real da arena (tiro único via envProbe)
uniform float uEnvMix;   // peso do reflexo real (o reflectivity ~.5 da receita)
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n0 = normalize(vNrm);
  vec3 vd = normalize(vView);

  // 1. Normal perturbada (a ideia do normal map do tutorial, sem textura):
  // gradiente aproximado de ruído inclina a normal em POUCOS graus — a
  // diferença foi tomada com passo pequeno no espaço do RUÍDO (0.12 da
  // célula) e o fator é discreto (0.9): relevo demais viria gelo jateado /
  // fosco (reflexo borrado), e o pedido é cristal liso de vidro. A normal
  // perturbada afeta TODAS as camadas abaixo (key, spec, reflexo, fresnel),
  // então o brilho corre pela superfície quando o cristal gira
  float fx = fnoise(vLocal * 9.0 + 3.1);
  float bx = fnoise(vLocal * 9.0 + vec3(0.12, 0.0, 0.0) + 3.1);
  float fz = fnoise(vLocal * 9.0 + 8.9);
  float bz = fnoise(vLocal * 9.0 + vec3(0.0, 0.0, 0.12) + 8.9);
  vec3 tangY = normalize(cross(n0, vec3(0.0, 1.0, 0.0) + n0 * 0.1));
  vec3 tangX = cross(n0, tangY);
  vec3 n = normalize(n0 + (tangX * (bx - fx) + tangY * (bz - fz)) * (0.9 * uBump));

  // corpo de glaciar: branco com MANCHAS RARAS de densidade azulada (o miolo
  // do gelo aparece pouco — o pedido é ser BRANCO, e o print cobrou o azul
  // "marmorizado" ocupando metade da superfície)
  float dens = fbm(vLocal * 1.6);
  vec3 col = mix(uIceA, uIceB, smoothstep(0.5, 0.9, dens));

  // veios de fratura INTERNOS: trinca FINA e SEGMENTADA (o gelo racha em
  // linhas que PARAM e RECOMEÇAM), não a onda de contorno do mármore/madeira
  // que o print mostrou. A receita: o ruído é DOBRADO (abs(2v-1) transforma a
  // linha de nível 0.5 em cume estreito — onde vale ~0 é a trinca) e um
  // segundo ruído grosseiro (seg) corta o cume em traços. uCrackWidth é a
  // MEIA-LARGURA do cume em unidades de ruído (afinada a 0.05); uCrackScale
  // segue a frequência por porte da peça (peça grande = trincas mais densas)
  float vw = fnoise(vLocal * 3.4 * uCrackScale + vec3(0.0, uTime * 0.03, 0.0));
  float vein = abs(vw * 2.0 - 1.0);
  float w = uCrackWidth;
  float seg = smoothstep(0.32, 0.66, fbm(vLocal * 6.5 * uCrackScale + 11.3));
  float crack = pow(1.0 - smoothstep(0.0, w, vein), 1.6) * seg;
  float pulse = 0.55 + 0.2 * sin(uTime * 1.2 + uSeed) + uCharge * 1.6;
  col += uCrackCol * crack * uCrackGlow * pulse;

  // 2+3. Ambiente e fresnel: difuso hemisférico + key quente da arena (o
  // figurino físico da árvore — sem isso o cristal ficaria chapado)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.30 + 0.70 * ndl));

  // 4. Reflexo do ambiente — a "amostragem de cubemap" do tutorial, sem
  // cubemap: o vetor refletido varre uma mini-arena fake (céu #8fb2ff em
  // cima, piso escuro embaixo, holofotes laterais na cor da equipe e uma
  // varredura horizontal de janelas/specs). É o que faz o gelo parecer
  // espelhado de qualquer ângulo, não só do topo
  vec3 refl = reflect(-vd, n);
  vec3 iceEnv = mix(uGroundColor * 0.7, uSkyColor, smoothstep(-0.25, 0.55, refl.y));
  float sides = smoothstep(0.30, 0.85, abs(refl.x)) * smoothstep(0.45, 0.0, abs(refl.y));
  iceEnv += uTeamColor * sides * 0.35;
  float streak = 0.5 + 0.5 * sin(refl.x * 9.0 + refl.z * 7.0 + uSeed);
  iceEnv += uSkyColor * smoothstep(0.1, 0.8, refl.y) * 0.7 * pow(streak, 4.0);
  // o envMap da receita, agora de verdade: cubemap 128px da ARENA capturado
  // one-shot pelo envProbe (aqui o background é cor sólida, então captura-se
  // a arena inteira). O mix usa uEnvMix (o reflectivity ~.5 / MixOperation da
  // receita): reflexo real do tabuleiro/arquibancada/aliados varrendo as
  // facetas, e o fake continua na mistura p/ a beirada nunca ficar escura
  // demais (cristal legível no tabuleiro, a regra da legibilidade)
  // (.rgb: o shim do three reescreve textureCube→texture, que no GLSL ES
  // 3.0 devolve vec4 — sem o .rgb o driver barra "vec4 → vec3")
  vec3 envReal = textureCube(uEnv, refl).rgb;
  vec3 env = mix(iceEnv, envReal, uEnvMix);
  float fres = pow(1.0 - max(0.0, dot(n, vd)), 3.0); // rasante espelha quase tudo
  col = mix(col, env, fres * 0.62);
  // aro reflexivo na frente (o fresnel do tutorial com a nossa leitura)
  col += uTeamColor * fres * 0.20;

  // 5. Especular apertado (o "brilho do gelo" do tutorial, exp 128): key +
  // um segundo brilho frio dos pontuais da arena, ambos na normal perturbada
  vec3 hv = normalize(uKeyDir + vd);
  col += uKeyColor * pow(max(0.0, dot(n, hv)), uReflPow) * 0.5;
  vec3 hv2 = normalize(normalize(vec3(-0.55, 0.6, 0.58)) + vd);
  col += uSkyColor * pow(max(0.0, dot(n, hv2)), uReflPow) * 0.22;
  // glitter gelado: pontinhos piscam mais forte no ângulo rasante (floco de
  // gelo na borda do cristal pega luz)
  float grit = fnoise(vLocal * 24.0);
  col += vec3(0.5, 0.62, 0.7) * smoothstep(0.88, 0.99, grit) * uSparkle * (0.45 + 0.9 * fres);

  // 6. Alfa: mais denso de frente, espelhado/beirada opaca (cristal visto de
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
  /** meia-largura do cume da trinca em unidades de ruído (fina = gelo) */
  crackWidth?: number;
  sparkle?: number;
  alpha?: number;
  /** micro-relevo da normal (0 = liso; ~1 = cristais de gelosura dançando no reflexo) */
  bump?: number;
  /** expoente do specular (cristal pede brilho bem pontual) */
  reflPow?: number;
  /** peso do reflexo REAL capturado da arena (receita: reflectivity ~.5) */
  envMix?: number;
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
      uBump: { value: o.bump ?? 1 },
      uReflPow: { value: o.reflPow ?? 110 },
      // cubemap real da arena (envProbe); placeholder escuro até o tiro da
      // captura — e o fake procedural continua atrás, dando legibilidade
      uEnv: { value: blackCubeTexture() },
      uEnvMix: { value: o.envMix ?? 0.5 },
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
