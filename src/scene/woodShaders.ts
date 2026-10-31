import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT, TEAM_TINT } from './stoneShaders';

/**
 * Shader de MADEIRA para a espécie Madeira (Nv.6 — terra+água, "ancião das
 * raízes"). Mesmo figurino do golem (stoneShaders): corpo OPACA que escreve
 * profundidade e se autombreia — é isso que dá peso de tronco vivo — com a
 * iluminação fake da arena (ARENA_LIGHT) e aro na cor da equipe. As três
 * camadas procedurais são a versão lenhosa das camadas da rocha:
 *
 *  - relevo: sulcos VERTICAIS de casca (ruído esticado ao longo de Y, como o
 *    grão do tronco) + bojos de nó (fbm), deslocando os vértices na normal —
 *    nenhuma peça "limpa" do catálogo parece usinada;
 *  - manchas: duas tonalidades de madeira + musgo nas encimadas/fendas +
 *    gotas de resina âmbar;
 *  - seiva: veios estreitos de esmeralda cavados na madeira (as "folhas" da
 *    referência) que pulsam devagar com a regeneração (uSap) e ACENDEM quando
 *    a criatura carrega o disparo (uCharge) — o análogo exato das fissuras de
 *    magma do golem.
 *
 * Suporta instancing (aSeed por peça/projétil) porque o projétil-assinatura
 * da Madeira (semente de casca + seiva) desenha com o MESMO material.
 */

export const WOOD_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;    // relevo/sulcos da casca
uniform float uBreath; // succo lento da árvore viva (incha um pouco)
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
  // grão do tronco: ruído MUITO mais denso no XZ do que no Y → sulcos
  // verticais de casca; o fbm baixinho faz os bojos e torcidos do tronco
  float grain = fnoise(vLocal * vec3(11.0, 1.1, 11.0));
  float boulder = fbm(vLocal * 1.6);
  float amp = uAmp * (1.0 + uHurt * 0.3);
  pos += nrm * ((grain - 0.5) * 0.9 + (boulder - 0.5) * 1.6) * amp;
  // succo da árvore viva (bem lento — madeira não "respira" como pedra)
  pos *= 1.0 + uBreath * 0.012 * (0.55 + 0.45 * boulder);
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

export const WOOD_FRAG = /* glsl */ `
uniform vec3 uBarkA;
uniform vec3 uBarkB;
uniform vec3 uMoss;
uniform vec3 uSapCol;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform vec3 uTeamColor;
uniform float uTime;
uniform float uSeed;
uniform float uSapGlow;
uniform float uSap;    // pulso lento da seiva (regeneração)
uniform float uCharge; // carregando o disparo: a seiva corre acesa
uniform float uHurt;
uniform float uSpeck;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);

  // madeira manchada + sulcos claros/escuros do grão
  float mottle = fbm(vLocal * 2.0);
  float grain = fnoise(vLocal * vec3(13.0, 1.3, 13.0));
  vec3 col = mix(uBarkB, uBarkA, smoothstep(0.30, 0.72, mottle));
  col *= 0.84 + 0.3 * grain;

  // musgo: pega nas encimadas e nos ombros (a madeira viva da referência)
  float moss = fbm(vLocal * 1.7 + 3.7);
  float mossMask = smoothstep(0.52, 0.68, moss) * (0.35 + 0.65 * max(0.0, n.y));
  col = mix(col, uMoss, mossMask * 0.5);

  // seiva esmeralda: veio estreito (mesma anatomia das fissuras do golem)
  float vein = fnoise(vLocal * 3.0 + vec3(0.0, uTime * 0.05, 0.0));
  float crack = smoothstep(0.44, 0.49, vein) * (1.0 - smoothstep(0.51, 0.57, vein));
  col += uSapCol * crack * uSapGlow * (uSap + uCharge * 1.5);

  // gotas de resina âmbar nas fendas (o acento quente da referência)
  float drop = fnoise(vLocal * 15.0);
  col += vec3(0.36, 0.23, 0.07) * smoothstep(0.80, 0.95, drop) * uSpeck;

  // hemisfério + key quente da arena (o figurino do golem: opaco com luz
  // fake é o que mantém o monstro legível de longe no tabuleiro)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.34 + 0.66 * ndl));
  vec3 hv = normalize(uKeyDir + vd);
  col += uKeyColor * pow(max(0.0, dot(n, hv)), 24.0) * 0.1;

  // aro na cor da equipe (as luzes pontuais da arena)
  float rim = pow(1.0 - max(0.0, dot(n, vd)), 2.2);
  col += uTeamColor * rim * 0.28;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface WoodMaterialOpts {
  /** casca clara / casca escura / musgo / seiva */
  barkA: string;
  barkB: string;
  moss: string;
  sap: string;
  amp: number;
  sapGlow?: number;
  speck?: number;
  seed?: number;
  breath?: number;
  teamColor?: string;
}

export function makeWoodMaterial(o: WoodMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: WOOD_VERT,
    fragmentShader: WOOD_FRAG,
    // tronco sólido: opaco, escreve profundidade, só face externa
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
      uSap: { value: 0.55 },
      uSapGlow: { value: o.sapGlow ?? 0.5 },
      uSpeck: { value: o.speck ?? 1 },
      uBarkA: { value: new THREE.Color(o.barkA) },
      uBarkB: { value: new THREE.Color(o.barkB) },
      uMoss: { value: new THREE.Color(o.moss) },
      uSapCol: { value: new THREE.Color(o.sap) },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
      uTeamColor: { value: new THREE.Color(o.teamColor ?? TEAM_TINT.neutral) },
    },
  });
}
