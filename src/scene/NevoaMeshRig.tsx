import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HAZE_URL } from './modelUrls';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import { makeStarburstGeo, makeSparkGeo, SPARK_FRAG } from './LightningRig';
import { readModel } from './modelPreload';
import { SummonReveal, SummonSigil } from './SummonFX';
import { makeMoteGeo } from './NevoaRig';
import {
  attackPose,
  NEVOA_ATTACK_WINDOW,
  NEVOA_WINDUP,
  NEVOA_FROST,
  type NevoaRigProps,
} from './NevoaRig';

/**
 * NÉVOA DE MALHA 3D IMPORTADA — O ESPECTRO DA BRUMA (Nv.7): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/haze/haze.glb` —
 * ~39.200 vértices, UMA malha com UMA textura 2048²; SEM ossos e SEM animação):
 * o bruto de nuvem glacial com o MEDALHÃO DE GEADA aceso no peito, os cristais
 * de gelo flutuando nos ombros, os olhos ciano fendados e o corpo que afunila em
 * funil de névoa até a poça. Enquanto a malha desce (demanda), o SELO DE
 * INVOCÇÃO (`SummonFX`) segura o buraco — o figurino de bruma (`NevoaRig`) nunca
 * mais pipoca no campo (ficou só doador de efeitos e coreografia) — e TODOS os
 * efeitos da névoa continuam vivos por cima da malha, no mesmo idioma dos demais
 * figurinos da linha "modelos 3D":
 *
 *  1. GEADA VIVA na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no emissivo —
 *     onde a tinta é CLARA/azulada (o medalhão e os veios de gelo pegando luz) a
 *     geada da IDENTIDADE (#cfe6ee do motor) ACENDE pelas trincas, num sorteio
 *     duro de cristal; o corpo TREME de leve na afinação (treme curto na normal
 *     SOLDADA `aDispNrm`, lição das soldas, em régua milimétrica);
 *  2. O MEDALHÃO DO PEITO (o único ponto aceso do espectro — a lição do card
 *     miúdo): clarão aditivo miúdo plantado na FRENTE do medalhão do GLB +
 *     auréola de estilhaços de gelo (dois `starburst` em leque) — NUNCA o
 *     icosaedro sólido do coração do rig antigo (a malha já traz a pedra esculpida;
 *     religar um núcleo na frente seria a bola do Magmar cortada na aprovação);
 *  3. GEADA DESCENDO (o frio caído — o oposto do vapor): os flocos do rig antigo
 *     CAEM em deriva larga do manto e pousam na poça — agora escalados ao encaixe
 *     da malha; a cadência ACELERA quando o espectro exala o bafo;
 *  4. HALO DE FLOCOS orbitando o corpo (as gotas congeladas do rig antigo): um
 *     enxame duro de gelo numa faixa do corpo (da base à cabeça, NUNCA acima da
 *     malha — lição da trovoada), metade gira para o lado oposto.
 *
 * SEM fumaça do pool: frio não suja, só geada (a regra do NevoaRig antigo — o
 * smokePool é grafite-fuligem). A coreografia é a MESMA timeline do motor (janela
 * 0,66 s: o espectro ASPIRA o ar — manto contrai, o coração acende os veios, ele
 * SE ERGUE na inspiração; no bafo o manto ESTUFA, uma onda de bruma sai do peito
 * e a nuvem INTEIRA clareia) lida de `lastAttackAt`, e o `demoAttackSeq` do
 * bestiário dispara o mesmo show. Sem ossos: o rig antigo animava o GRUPO raiz
 * (contrair/estufar, erguer, vergar) e a malha herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x −0,358..0,402, y −0,449..0,493,
 * z −0,311..0,248 — spanY 0,941), como os demais Nv.7, e o encaixe vem da
 * LARGURA (o teto de altura 4,4/0,941=4,68 não aperta). `MEDIDO.nevoa` no degrau
 * da linha (~1,9) põe a malha do mesmo porte dos Nv.6; a cara encara o INIMIGO no
 * +Z local (rumo 0 — o MEDALHÃO de gelo e os olhos ciano saíram no painel "frente
 * (+Z)" do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`). O `slotFit` da família
 * (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const NEVOA_DEF = getSpecies('nevoa');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(NEVOA_DEF, NEVOA_DEF.levelMin);

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou o MEDALHÃO de gelo e os
 * olhos ciano no +Z — como as demais malhas da linha. Se um GLB substituto vier
 * virado, vire aqui.
 */
export const NEVOA_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola de
 * flocos ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa
 * CPU e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do espectro em PORCENTAGEM da altura da malha: o MEDALHÃO DE GEADA do
 * peito (a fornalha do frio) mora um dedo ACIMA do meio geométrico. É a régua de
 * CORE_Y: clarão, auréola e o fim do funil dos flocos nascem dessa altura.
 */
const CORE_FRAC = 0.6;

/** brasa base do emissivo (a geada vitrificada do espectro) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#3f5a72');
const EMISSIVE_FLASH = new THREE.Color('#cfe6ee');

/**
 * VERTEX da GEADA DESCENDO escalada ao encaixe da malha (o frio caído do
 * NevoaRig antigo: flocos largos no ombro, apertados pousando na poça do peito →
 * chão). `uScale` amarra o raio/altura ao porte da malha (a caixa crua é ~0,94, o
 * rig antigo era ~4 alto); `uCharge` acelera a queda quando o espectro exala o
 * bafo. Esfria do branco glacial (recém-solto) para o azul-geada perto do chão.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.3 + 0.3 * aRand.z;
  float prog = fract(uTime * speed * 0.22 * (1.0 + uCharge * 0.9) + aRand.y);
  // deriva torto-espiral em torno da coluna do manto (raio cresce descendo)
  float ang = aRand.x * 6.28318 - prog * (0.8 + 1.8 * aRand.z) + uTime * 0.12;
  float r = (0.5 + prog * (0.55 + 0.7 * aRand.z)) * uScale;
  float y = (2.0 - prog * (1.85 + 0.35 * aRand.z)) * uScale;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // floco pequeno e SECO (não o puff fofo do vapor quente)
  float size = (3.4 + 5.0 * aRand.z) * (0.8 + uCharge * 0.5) * uSizeMul * (0.7 + prog * 0.5);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce do manto e morre pousando na poça
  vA = smoothstep(0.0, 0.1, prog) * (1.0 - smoothstep(0.55, 1.0, prog)) * uAlpha;
  // esfriando: branco glacial -> azul-geada perto do chão
  vC = mix(vec3(0.95, 0.98, 1.0), vec3(0.72, 0.83, 0.92), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // floco duro-miúdo com halo mínimo (o contrário do fiapo macio do vapor)
  float m = smoothstep(0.5, 0.28, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.5);
}
`;

/**
 * VERTEX do HALO DE FLOCOS orbitando o espectro (as gotas congeladas do rig
 * antigo): cada floco duro orbita numa faixa própria do corpo (da base à cabeça,
 * NUNCA acima da malha — lição da trovoada), com raio/altura tremendo em senóides
 * desencontradas e um lampejo duro (o cristal pegando luz). Metade gira para o
 * lado oposto (caos). Geada do motor; a que lampeja vira branco-quase-puro.
 */
const SHARD_ORBIT_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: raio/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uY0;
uniform float uY1;
uniform float uR1;
uniform float uR2;
uniform float uSpin;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float dir = 0.5 - step(0.5, fract(aRand.z * 3.77));
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.4);
  float r = mix(uR1, uR2, aRand.z) * (0.85 + 0.25 * sin(uTime * 1.6 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 2.1 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float glint = step(0.5, fract(sin(floor(uTime * (10.0 + 12.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.0 + 2.6 * aRand.z) * (0.7 + 0.5 * glint) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.55 + 0.45 * glint) * uAlpha * (0.55 + 0.3 * uCharge);
  vec3 tint = vec3(0.81, 0.9, 0.93); // a geada do motor (#cfe6ee)
  vC = mix(tint, vec3(0.95, 0.98, 1.0), step(0.6, fract(aRand.y * 7.13)) * 0.5 + glint * 0.45);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher da Névoa: Nv.7 = a malha importada do espectro da bruma; enquanto
 * ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO segura o
 * buraco — o figurino do espectro antigo nunca mais aparece no campo (a lição da
 * troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `NevoaRig` antigo ficou só doador de efeitos e coreografia).
 */
export function NevoaRig(props: NevoaRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="nevoa" url={HAZE_URL} seed={props.seed} />}>
      <SummonReveal species="nevoa" seed={props.seed}>
        <NevoaMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function NevoaMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: NevoaRigProps) {
  const { scene } = readModel(HAZE_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/carga não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${HAZE_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ o tremor do gelo não rasgar nas arestas duras do GLB
    // (qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do espectro: o MEDALHÃO DE GEADA do peito (fornalha do frio)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 4,68 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('nevoa', NEVOA_DEF.levelMin as MonsterLevel);
    const yaw = NEVOA_MODEL_YAW;
    const hx = Math.max(-bb.min.x, bb.max.x);
    const hz = Math.max(-bb.min.z, bb.max.z);
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const halfWide = hx * ca + hz * sa; // o que o buraco VÊ de esq/dir
    const halfAlong = hx * sa + hz * ca; // e de trás/frente
    const sW = Math.min(foot.x / (halfWide + SHELL_HUG), foot.z / (halfAlong + SHELL_HUG));
    const s = Math.min(TOP / src.spanY, sW);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(yaw) + cz * Math.sin(yaw));
    const pz = cx * Math.sin(yaw) - cz * Math.cos(yaw);
    return {
      s,
      pos: [px, -bb.min.y * s, pz] as [number, number, number],
    };
  }, [src]);

  // altura local do coração (medalhão do peito): a base da malha já fica plantada
  // no y 0 do rig, então mora na própria porcentagem escalada — SEM somar `pos[1]`
  // de novo (a lição do Raio)
  const s = fit.s;
  const coreY = src.coreY * s;

  // material por instância: textura do GLB + GEADA VIVA — a leitura da pintura no
  // emissivo (o medalhão e os veios de gelo acendem a geada da IDENTIDADE pelas
  // trincas) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // gelo vitrificado mas nuvem por cima: rugoso, quase sem metal (o reflexo
      // puro some no fundo — o corpo é bruma, não espelho)
      roughness: 0.62,
      metalness: 0.12,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.2,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNT = { value: 0 };
      sh.uniforms.uNSeed = { value: seed };
      sh.uniforms.uNCharge = { value: 0 };
      sh.uniforms.uNHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uNT;\nuniform float uNSeed;\nuniform float uNCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // o GELO zumba de leve na afinação (o frio contraído): treme CURTO e
          // sorteado por cristal (celula dura), na normal SOLDADA (aDispNrm —
          // senão as arestas duras abririam as "rachaduras" do qa/probe-cracks.mjs).
          // A régua é MILIMÉTRICA (o ruído vale 0..1 e a amplitude mora em METROS).
          float crys = fnoise(floor(vJit * 13.0) + uNSeed);
          float shiver = sin(uNT * 13.0 + crys * 60.0) * (0.0007 + uNCharge * 0.003);
          transformed += aDispNrm * (crys * 0.0035 + shiver);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uNT;\nuniform float uNCharge;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // A BRUMA VIRA VIDA: onde a pintura é CLARA/azulada (o medalhão e os
          // veios de gelo pegando luz) a geada da IDENTIDADE (#cfe6ee do motor)
          // ACENDE pelas trincas num sorteio duro de cristal — o MEDALHÃO do peito
          // é o único ponto aceso do espectro e é ele que lê no card miúdo.
          vec4 pain = texture2D(map, vMapUv);
          float lum = clamp(pain.b + pain.g - pain.r - 0.55, 0.0, 1.0);
          float ck = step(0.5, fract(sin(floor(uNT * 6.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // veios de geada (nunca branco puro somado a tudo — a regra do gelo)
          totalEmissiveRadiance += vec3(0.72, 0.85, 0.93) * lum * (0.25 + 0.5 * ck + uNCharge * 0.9);
          totalEmissiveRadiance *= 1.0 + uNCharge * 0.8;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // halo de flocos de gelo orbitando o espectro (as gotas congeladas): faixas do
  // corpo (da base ao topo da cabeça), nunca acima da malha
  const orbit = useMemo(
    () => ({
      geo: makeSparkGeo(22),
      mat: new THREE.ShaderMaterial({
        vertexShader: SHARD_ORBIT_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.22 * s },
          uY1: { value: src.spanY * s - 0.14 * s },
          uR1: { value: s * 0.5 },
          uR2: { value: s * 0.8 },
          uSpin: { value: 1.5 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // geada descendo: funil do ombro para a poça do peito/chão (escalado ao porte
  // da malha) — o frio CAINDO (o motivo de vida da espécie, o oposto do vapor)
  const motes = useMemo(
    () => ({
      geo: makeMoteGeo(embers ?? 26),
      mat: new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uScale: { value: s },
        },
      }),
    }),
    [embers, emberScale, s],
  );

  // auréola de estilhaços (geada do motor + branco-quase-puro — o projétil-
  // assinatura da bruma é onda de geada glacial)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, NEVOA_FROST),
      makeStarburstGeo(seed + 7.4, 14, '#eef7fb'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, motes, starburstGeos]);

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const flashRef = useRef<THREE.Sprite>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const burstAuraRef = useRef<THREE.Group>(null!);
  const starburstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);
  const demoT = useRef(-1);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  useFrame((_, dtRaw) => {
    const g = animRef.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor (dano, HP, morte, ataque) — os mesmos canais
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let frontZ = -1; // para onde a criatura aponta (jogador ataca para -Z)
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        frontZ = u.side === 'player' ? -1 : 1;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > NEVOA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= NEVOA_WINDUP * NEVOA_ATTACK_WINDOW && sinceAttack <= NEVOA_ATTACK_WINDOW;
    // o clarão do bafo nasce no disparo e some em ~0,3 s (a nuvem clareia quase junto)
    const flash = striking ? Math.max(0, 1 - (sinceAttack - NEVOA_WINDUP * NEVOA_ATTACK_WINDOW) / 0.3) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (cristais zunindo + veios do medalhão acendendo)
    const sh = body.userData.shader as
      | { uniforms: { uNT: { value: number }; uNCharge: { value: number }; uNHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uNT.value = t;
      sh.uniforms.uNCharge.value = pose.charge;
      sh.uniforms.uNHurt.value = hurt;
    }
    // o espectro respira devagar (o frio é lento) e o medalhão arde na aspiração
    const coldBreath =
      Math.sin(t * 0.5 + seed) * 0.5 +
      Math.sin(t * 1.1 + seed * 0.7) * 0.3 +
      Math.sin(t * 2.3 + 1.1) * 0.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.2 + coldBreath * 0.04 + pose.charge * 0.6 + flash * 0.6 + hurt * 0.4 + crumble * 0.3) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.5 + flash * 0.35 + pose.charge * 0.35));

    // geada descendo: a queda acelera ao exalar o bafo; na morte o espectro SE
    // DESMANCHA (a carga de morte despeja neve de uma vez)
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.8);

    // halo de flocos orbitando o corpo (o turbilhão DOBRA na aspiração)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: o espectro flutua preso pela cauda-funil (NÃO voa): CONTRAI na
    // aspiração (frio juntando), ESTUFA no bafo, e SE ERGUE na inspiração ----
    const sway = Math.sin(t * 0.35 + seed) * 0.02 + Math.sin(t * 0.8 + 1.7) * 0.007;
    const breathe = Math.sin(t * 0.8 + seed) * 0.012;
    g.scale.set(
      1 + pose.gather * 0.05 + breathe * 0.3,
      1 - pose.gather * 0.02 + pose.lift * 0.04 + breathe,
      1 + pose.gather * 0.05 + breathe * 0.3,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.3 + seed * 0.6) * 0.01;
    g.rotation.x = pose.lift * 0.025 - pose.twist * 0.05;
    // levita rente à poça (a cauda-funil continua plantada — o funil disfarça o
    // vão); na inspiração o fôlego ergue mais um dedo; SEM passar do fit (lição do
    // envelope fantasma — a posição sobe em UNIDADES DO RIG, pequenas)
    g.position.y = pose.lift * 0.05 + Math.sin(t * 0.62 + seed) * 0.012;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão do MEDALHÃO aceso no peito (o miolo de luz do rig antigo —
    // plantado na FRENTE do medalhão do GLB, MIÚDO e SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.3 + coldBreath * 0.08 + pose.charge * 0.4 + hurt * 0.2));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 1.9 + seed) + pose.charge * 0.07) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.5 + 0.1 * s));
    const flashS = flash > 0 ? 0.7 + 1.1 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.22 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para o
    // envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.28;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.38 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.12));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const frostShard = starburstRefs.current[0];
    const whiteShard = starburstRefs.current[1];
    if (frostShard) {
      (frostShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.07) * auraPulse * alpha;
    }
    if (whiteShard) {
      (whiteShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente ao medalhão
    coreGlow.scale.setScalar(0.24 + pose.charge * 0.16 + flash * 0.14); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.06 + pose.charge * 0.14 + flash * 0.12) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={NEVOA_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* geada descendo do manto e pousando na poça (o frio caído — o oposto do vapor) */}
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      {/* halo de flocos de gelo orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={orbit.geo} material={orbit.mat} frustumCulled={false} />
      <group ref={burstAuraRef} position={[0, coreY, 0]}>
        {starburstGeos.map((geometry, i) => (
          <mesh
            key={`starburst${i}`}
            ref={(mesh) => {
              starburstRefs.current[i] = mesh;
            }}
            geometry={geometry}
            renderOrder={2}
            frustumCulled={false}
          >
            <meshBasicMaterial
              vertexColors
              transparent
              opacity={i === 0 ? 0.18 : 0.14}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      {/* SEM anéis de chão: a poça de geada é o envelope que a malha já dá (a
          lição do Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.24} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={NEVOA_FROST}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.3}>
        <spriteMaterial
          map={circleTexture()}
          color="#eef7fb"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#eef7fb"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
