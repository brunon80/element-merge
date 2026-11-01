import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT } from './stoneShaders';

/**
 * Shader de VAPOR/NUVEM FERVENTE para a espécie Vapor (Nv.6 — fogo+água, a
 * "caldeira viva"). O vapor da criatura NÃO é uma bolinha branca semitransparente
 * (o modelo antigo era uma chaleira marrom com bolhas): é uma NUVEM que ferve
 * por dentro, com o corpo deslocado por ruído e a ALFA também em ruído — a
 * silhueta da nuvem se desfaz em fiapos, o miolo é denso e a base é quente
 * (cor pêssego: o fogo que ferve a caldeira vem de BAIXO).
 *
 * A receita, sem blending aditivo (a regra da legibilidade do projeto):
 *  - deslocamento por fbm ANIMADO rolando para baixo no espaço do objeto → a
 *    nuvem parece subir/ferver sem a malha se mexer;
 *  - alfa procedural (fiapos na beirada, denso no miolo) + fresnel (a borda da
 *    nuvem é iluminada por trás e fica mais densa no ângulo rasante — caminho
 *    óptico maior, como nuvem de verdade);
 *  - luz da arena difusa (half-lambert: nuvem deixa a luz atravessar, por isso
 *    o lado escuro não apaga) + gradiente vertical quente/frio pela ALTURA DE
 *    MUNDO (uHotY), não pela posição no objeto — as nuvens empilhadas da
 *    criatura esquentam conforme descem para a boca da caldeira;
 *  - uCharge: carregando o jato, a nuvem INTEIRA acende para o branco-escaldante
 *    e engrossa (a vaporada antes do disparo).
 *
 * Instanciado por aSeed (peças do rig e o jato-assinatura no ProjectileField).
 */

export const STEAM_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // bolhas/relevo da nuvem
uniform float uBreath; // a nuvem respira (sobe e desce de volume)
uniform float uHurt;
uniform float uCharge; // carregando o jato: a nuvem INCHA
attribute float aSeed;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
varying float vWorldY;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = position + uSeed + aSeed;
  // bolhação: fbm em duas escalas (lombadas largas + fiapos) rolando para
  // BAIXO no espaço do objeto — é o que faz a nuvem parecer subir fervendo
  float blobs = fbm(vLocal * 1.5 + vec3(0.0, -uTime * 0.22, 0.0));
  float wisps = fnoise(vLocal * 3.6 + vec3(0.0, -uTime * 0.5, 0.0));
  float amp = uAmp * (1.0 + uHurt * 0.25 + uCharge * 0.55);
  pos += nrm * ((blobs - 0.5) * 1.5 + (wisps - 0.5) * 0.7) * amp;
  // volume da nuvem ao carregar (incha sem sair do lugar)
  pos *= 1.0 + uBreath * 0.02 * (0.5 + 0.5 * blobs) + uCharge * 0.05;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vNrm = normalMatrix * (mat3(instanceMatrix) * nrm);
    vec4 mv = viewMatrix * wp;
  #else
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vNrm = normalMatrix * nrm;
    vec4 mv = viewMatrix * wp;
  #endif
  vWorldY = wp.y;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const STEAM_FRAG = /* glsl */ `
uniform vec3 uCool;      // vapor frio no topo da nuvem
uniform vec3 uWarm;      // aquecido embaixo (o fogo sob a caldeira)
uniform vec3 uHot;       // escaldante quando carrega o jato
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform float uTime;
uniform float uSeed;
uniform float uAlpha;
uniform float uSwirl;    // velocidade da alfa correndo (a nuvem vira fiapos)
uniform float uCharge;
uniform float uHurt;
uniform float uHotY;     // altura de MUNDO do fogo: gradiente quente/frio
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
varying float vWorldY;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // densidade procedural ANIMADA: a alfa corre para baixo (a nuvem sobe) em
  // duas frequências — sem isso a nuvem é uma bola de plástico fosco
  float d = fbm(vLocal * 1.9 + vec3(0.0, -uTime * uSwirl, 0.0));
  float fine = fnoise(vLocal * 5.5 + vec3(uTime * uSwirl * 0.6, -uTime * uSwirl * 1.7, 0.0));
  float den = 0.35 + 0.65 * smoothstep(0.28, 0.85, d) + 0.22 * (fine - 0.5); // contraste maior: caroco denso + buraco fiapo (o "aquário" do print pedia)

  // cor: frio em cima, pêssego embaixo (o fogo da caldeira clareia a base da
  // nuvem — gradiente pela altura de mundo, não do objeto)
  float heat = 1.0 - smoothstep(uHotY, uHotY + 1.8, vWorldY);
  vec3 col = mix(uCool, uWarm, clamp(heat, 0.0, 1.0) * 0.9);
  col = mix(col, uHot, clamp(uCharge * (0.35 + 0.65 * heat), 0.0, 1.0));

  // luz da arena, meia-difusa: nuvem deixa luz entrar, então o lado escuro
  // NÃO apaga (0.45 de piso) — nuvem apagada vira fantasma cinza no tabuleiro
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = 0.45 + 0.55 * max(0.0, dot(n, uKeyDir));
  col *= (amb * 1.4 + uKeyColor * ndl * 1.1);

  // dispersão na casca (o limbo da nuvem acende de leve, SEM virar aro de
  // aquário). SEM tint da equipe: vapor escaldante é branco-pêssego sempre
  // (a lição do halo de geada — de raspão o fresnel puxava pra cor do time)
  float fres = pow(1.0 - max(0.0, dot(n, vd)), 2.2);
  col += uSkyColor * fres * 0.3;

  // ALFA ao contrário do objeto sólido: nuvem é densa de frente e FIAPA no
  // limbo — a silhueta se desfaz (com alfa alta no rasante vira bola de vidro)
  float a = uAlpha * den * (1.06 - 0.5 * fres) * (1.0 + uCharge * 0.25);
  a = clamp(a, 0.0, 0.94);
  if (a < 0.03) discard;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.4);
  gl_FragColor = vec4(col, a);
}
`;

export interface SteamMaterialOpts {
  /** vapor frio / aquecido pela brasa / escaldante carregando o jato */
  cool: string;
  warm: string;
  hot?: string;
  amp: number;
  alpha?: number;
  /** rolagem da alfa (a nuvem se desfaz subindo) */
  swirl?: number;
  /** altura de mundo do fogo que ferve a caldeira (gradiente quente/frio) */
  hotY?: number;
  seed?: number;
  breath?: number;
}

export function makeSteamMaterial(o: SteamMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: STEAM_VERT,
    fragmentShader: STEAM_FRAG,
    // nuvem: sem escrever profundidade — as camadas se somam (vapor sobre
    // vapor = mais denso), exatamente como nuvem real; NUNCA aditivo
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uAmp: { value: o.amp },
      uBreath: { value: o.breath ?? 1 },
      uHurt: { value: 0 },
      uCharge: { value: 0 },
      uAlpha: { value: o.alpha ?? 0.72 },
      uSwirl: { value: o.swirl ?? 0.5 },
      uHotY: { value: o.hotY ?? 0.35 },
      uCool: { value: new THREE.Color(o.cool) },
      uWarm: { value: new THREE.Color(o.warm) },
      uHot: { value: new THREE.Color(o.hot ?? '#fff0dd') },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
    },
  });
}
