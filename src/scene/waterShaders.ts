import * as THREE from 'three';
import { NOISE_GLSL } from './flameShaders';
import { ARENA_LIGHT, TEAM_TINT } from './stoneShaders';

/**
 * Shaders de ÁGUA compartilhados: o rig da Nereia (WaterRig) e os projéteis
 * usam este material. A receita é o inverso do vento — água é MASSA:
 *
 *  - corpo translúcido mas denso (mesclagem normal, como o vento aprovado):
 *    AZUL (fundo profundo, topo mais claro) com ONDAS BRANCAS FINAS descendo
 *    de cima para baixo — o único branco do material são essas ondas e a
 *    espuma do cume; o aro da silhueta é azul, nunca branco;
 *  - ondulação de superfície: o ruído desloca a casca ao longo da normal com
 *    o tempo (a água "respira" em ondas que sobem pelo corpo);
 *  - balanço por altura: `uSwell`/`uBend` deslocam o corpo pelo `gfrac` (fração
 *    da altura do MODELO, via uYOff/uModelH — as emendas das peças ficam
 *    contínuas) e `uSurge` empurra/repuxa o corpo durante o arremesso;
 *  - a face de dentro é mais fraca (vê-se a corrente interna pela casca).
 */

export const WATER_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;   // fase do ruído (por peça)
uniform float uPhase;  // fase do balanço (compartilhada pela criatura toda)
uniform float uAmp;    // ondulação da superfície
uniform float uSwell;  // rola o corpo para frente/trás com as ondas
uniform float uBend;   // balanço lateral
uniform float uSurge;  // arremesso: negativo = puxando, positivo = soltando
uniform float uFlare;  // energia reunida no ataque
uniform float uHurt;
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

  // correntes subindo pela superfície (mais lento que o vento: água tem peso)
  vec3 q = vec3(pos.x * 2.2, pos.y * 1.7 - uTime * 1.35, pos.z * 2.2) + uSeed + aSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.4 + vec3(2.2, -uTime * 2.7, 1.1) + 7.0);
  vN1 = mix(n1, n2, 0.35);

  // onda na casca
  float amp = uAmp * (1.0 + uHurt * 0.4) * (1.0 + uFlare * 0.5);
  pos += nrm * ((n1 - 0.5) * 1.8 + (n2 - 0.5) * 1.0) * amp;

  // o corpo rola com a maré e embica no arremesso (mesma fase para todas as peças)
  float roll = uSwell * gfrac * (1.0 + uFlare * 0.9);
  pos.z += roll * sin(uTime * 1.3 + uPhase * 1.4 + gh * 1.1);
  pos.z += uSurge * 0.34 * gfrac;
  pos.x += uBend * gfrac * cos(uTime * 0.8 + uPhase + gh * 0.9);
  pos.y += 0.12 * uSwell * gfrac * sin(uTime * 1.1 + uPhase * 2.1);

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

export const WATER_FRAG = /* glsl */ `
uniform vec3 uDeep;  // azul profundo (base da massa)
uniform vec3 uMid;   // azure das correntes
uniform vec3 uFoam;  // ondas/espuma — o ÚNICO branco do material
uniform vec3 uTeamColor;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAmbColor;
uniform float uTime;
uniform float uPhase;
uniform float uSeed;
uniform float uHurt;
uniform float uFoamAmt;  // quanta onda branca (cavalos de onda têm mais)
varying float vU;
varying float vAng;
varying float vN1;
varying float vG;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vNrm);
  vec3 vd = normalize(vView);
  float ndv = max(0.0, dot(n, vd));

  // corpo SEMPRE azul: gradiente vertical (base escura, topo mais claro)
  // com correntes de leve — a cor é ALBEDO OPACO, igual ao rig de pedra
  float cur = fnoise(vec3(vAng * 2.0, vU * 2.6 - uTime * 0.8 + vN1 * 0.5, uPhase));
  float grad = 0.30 + 0.28 * vG + 0.26 * cur;
  vec3 col = mix(uDeep, uMid, clamp(grad, 0.0, 1.0));

  // ---- ONDAS BRANCAS DESCENDO DE CIMA PARA BAIXO ----
  float off = fnoise(vec3(vAng * 1.5, vG * 0.9, uPhase + uSeed)) * 0.55;
  float fall = fract(vG * 2.3 + uTime * 0.5 + off);
  // a frente da onda entra suave, a traseira corta seco (crista da onda)
  float band = smoothstep(0.0, 0.13, fall) * (1.0 - smoothstep(0.13, 0.30, fall));
  band *= smoothstep(0.32, 0.62, fnoise(vec3(vAng * 3.1, vG * 4.2 - uTime * 0.45, uPhase)));
  // ondinhas finas descendo mais rápido por cima
  float rib = fract(vG * 5.4 + uTime * 1.15 + off * 1.7 + 0.37);
  float ribMask = smoothstep(0.0, 0.08, rib) * (1.0 - smoothstep(0.08, 0.2, rib));
  float waves = clamp(band + ribMask * 0.35, 0.0, 1.0);
  col = mix(col, uFoam, waves * uFoamAmt);

  // espuma só no topo das cristas (cume das ondas grandes)
  float crest = smoothstep(0.68, 0.95, vN1) * smoothstep(0.8, 0.98, vG);
  col = mix(col, uFoam, crest * uFoamAmt * 0.6);

  // hemisfério + key quente da arena (mesma receita do rig de pedra aprovado)
  float hemi = 0.5 + 0.5 * n.y;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) + uAmbColor;
  float ndl = max(0.0, dot(n, uKeyDir));
  col *= (amb + uKeyColor * (0.34 + 0.66 * ndl));

  // aro: azul da corrente + aro da equipe nas laterais (como na pedra)
  float rim = pow(1.0 - ndv, 2.4);
  col += uMid * rim * 0.35;
  col += uTeamColor * pow(1.0 - ndv, 2.2) * 0.28;

  col = mix(vec3(1.0), col, 1.0 - uHurt * 0.5); // flash de dano
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface WaterMaterialOpts {
  deep: string;
  mid: string;
  foam: string;
  amp: number;
  swell?: number;
  bend?: number;
  alphaMul?: number;
  foamAmt?: number;
  /** 1 = casca aberta (some na borda inferior), 0 = volume cheio (bolas) */
  soft?: number;
  seed?: number;
  phase?: number;
  yOff?: number;
  modelH?: number;
  /** aro lateral na cor da equipe (igual ao rig de pedra) */
  teamColor?: string;
}

/**
 * ÁGUA OPACA, no mesmo figurino do rig de pedra aprovado: albedo azul saturado
 * + ondas brancas + iluminação fake da arena (hemisfério/key/aro da equipe).
 * Nada de alpha — corpo denso, zero empilhamento, cor exatamente calibrada.
 * O pipeline é o linear padrão do three (Color(hex) lineariza; o ShaderMaterial
 * escreve cru no framebuffer), então os hex do catálogo escolhem o resultado
 * já sabendo disso (#4db4ff vira azure forte no pixel).
 */
export function makeWaterMaterial(o: WaterMaterialOpts): THREE.ShaderMaterial {
  const L = ARENA_LIGHT;
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    // rocha/água de verdade: opaca, escreve profundidade, só face externa
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uPhase: { value: o.phase ?? 0 },
      uAmp: { value: o.amp },
      uSwell: { value: o.swell ?? 0.05 },
      uBend: { value: o.bend ?? 0.04 },
      uSurge: { value: 0 },
      uFlare: { value: 0 },
      uHurt: { value: 0 },
      uYOff: { value: o.yOff ?? 0 },
      uModelH: { value: o.modelH ?? 2 },
      // legados (o rig os escreve; o frag opaco os ignora):
      uAlpha: { value: 1 },
      uAlphaMul: { value: o.alphaMul ?? 1 },
      uSoft: { value: o.soft ?? 1 },
      uFoamAmt: { value: o.foamAmt ?? 0.5 },
      uDeep: { value: new THREE.Color(o.deep) },
      uMid: { value: new THREE.Color(o.mid) },
      uFoam: { value: new THREE.Color(o.foam) },
      uTeamColor: { value: new THREE.Color(o.teamColor ?? TEAM_TINT.neutral) },
      uKeyDir: { value: new THREE.Vector3(L.keyDir[0], L.keyDir[1], L.keyDir[2]) },
      uKeyColor: { value: new THREE.Color(L.keyColor).multiplyScalar(L.keyIntensity) },
      uSkyColor: { value: new THREE.Color(L.skyColor).multiplyScalar(L.hemiIntensity) },
      uGroundColor: { value: new THREE.Color(L.groundColor).multiplyScalar(L.hemiIntensity) },
      uAmbColor: { value: new THREE.Color(L.ambColor).multiplyScalar(L.ambIntensity) },
    },
  });
}
