import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PLASMA_URL } from './modelUrls';
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
import {
  attackPose,
  PLASMA_ATTACK_WINDOW,
  PLASMA_WINDUP,
  PLASMA_SPARK,
  CORE_LOOK,
  type PlasmaRigProps,
} from './PlasmaRig';

/**
 * PLASMA DE MALHA 3D IMPORTADA — A ESTRELA DE BOLSO (Nv.7): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/plasma/plasma.glb` —
 * malha ÚNICA com textura 2048²; SEM ossos e SEM animação): a forja de ferro
 * forjado que segura uma ESTRELA em miniatura acorrentada, o sol branco-incandes-
 * cente aceso no peito, os VEIOS DE PLASMA rosa percorrendo a jaula e o bafo
 * quente da bigorna. Enquanto a malha desce (demanda), o SELO DE INVOCÇÃO
 * (`SummonFX`) segura o buraco — o figurino da forja (`PlasmaRig`) nunca mais
 * pipoca no campo (ficou só doador de efeitos e coreografia) — e TODOS os efeitos
 * da estrela continuam vivos por cima da malha, no mesmo idioma dos demais
 * figurinos da linha "modelos 3D":
 *
 *  1. PLASMA VIVO na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no emissivo —
 *     onde a tinta é CLARA/ROSA (o sol do peito e os veios de plasma pegando luz)
 *     a centelha da IDENTIDADE (#ff9ef5 do motor) ACENDE pelas costuras do ferro,
 *     num sorteio duro de celula; a jaula DESTORCE de leve na afinação (treme
 *     curto na normal SOLDADA `aDispNrm`, lição das soldas). O FERRO NÃO BRANQUEIA
 *     sob dano — o feedback migra para o plasma das costuras (a "carne que volta"
 *     da forja);
 *  2. O SOL DO PEITO (o único ponto aceso da estrela — a lição do card miúdo):
 *     clarão aditivo MIÚDO plantado na FRENTE do sol do GLB (o miolo é ROSA-CLARO,
 *     nunca #ffffff — blowout cortado) + auréola de estilhaços de plasma (dois
 *     `starburst` em leque) — NUNCA a bola sólida do núcleo do rig antigo (a malha
 *     já traz a estrela esculpida; religar uma bola na frente seria a bola do
 *     Magmar cortada na aprovação);
 *  3. BAFO DA FORJA (o calor que sobe da bigorna — o motivo de vida quente): os
 *     vapores quentes do rig antigo SObem da base e puxam para o rosa da estrela
 *     (cinza QUEENTE escuro, nunca bola de neve clara), agora escalados ao encaixe
 *     da malha; a cadência ACELERA na descarga do feixe;
 *  4. COROA DE FILAMENTOS DE PLASMA orbitando o sol (as proeminências presas na
 *     jaula): um enxame rosa-branco numa faixa do corpo (da base à cabeça, NUNCA
 *     acima da malha — lição da trovoada), metade gira para o lado oposto (caos).
 *
 * SEM fumaça do pool no corpo: a forja solta BAFO QUENTE e plasma, não fuligem de
 * grafite (o smokePool do rig antigo só ia no bafo da descarga). A coreografia é
 * a MESMA timeline do motor (janela 0,48 s — a mais NERVOSA da árvore: a contenção
 * APERTA a jaula e a estrela ENCOLHE sob a pressão; a descarga é quase instantânea
 * — os garfos ABREM, a estrela ESTUFA e a gaiola solta o torque) lida de
 * `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o mesmo show. Sem
 * ossos: o rig antigo animava o GRUPO raiz (apertar, estufar, destorcer) e a
 * malha herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x ±0,457, spanY 0,856), como os
 * demais Nv.7, e o encaixe vem da LARGURA (o teto de altura 4,2/0,856=4,91 não
 * aperta). `MEDIDO.plasma` no degrau 2,5 quadrado (a régua nova dos Nv.7-cubo,
 * igual à dos irmãos — em 1,9 o cubo ficava BAIXO ao lado dos Nv.6) põe a malha
 * do mesmo porte dos Nv.6; a cara encara o INIMIGO no +Z local (rumo 0 — o SOL do
 * peito e os garfos da jaula saíram no painel "frente (+Z)" do viewer de 4 vistas,
 * `qa/mesh-viewer-shot.mjs`). O `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const PLASMA_DEF = getSpecies('plasma');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(PLASMA_DEF, PLASMA_DEF.levelMin);

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou o SOL do peito e os
 * garfos que abrem a jaula no +Z — como as demais malhas da linha. Se um GLB
 * substituto vier virado, vire aqui.
 */
export const PLASMA_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola de
 * plasma ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa
 * CPU e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração da estrela em PORCENTAGEM da altura da malha: o SOL em miniatura (a
 * fornalha do plasma) mora um dedo ACIMA do meio geométrico, segurado pelos
 * garfos da jaula. É a régua de CORE_Y: clarão, auréola e a coroa de filamentos
 * nascem dessa altura.
 */
const CORE_FRAC = 0.56;

/**
 * ESTIQUE VERTICAL da malha (X/Z ficam em `fit.s`, Y em `fit.s·YSTRETCH`): a
 * caixa do plasma é a MAIS LARGA dos Nv.7 (x ±0,457) e a mais ACHATADA, então na
 * escala uniforme o invólucro encosta no anel (raio 2,5) ANTES de alcançar o teto
 * de altura (`TOP/spanY ≈ 4,9` ainda sobra folga — é a LARGURA que segura). A
 * sonda mediu topo 3,67 (abaixo dos Nv.6 ~4,0-4,5). Esticar SÓ o Y em 1,18 põe o
 * topo na MESMA faixa dos Nv.6 sem alargar a pegada (o anel e o vão horizontal
 * contra o vizinho NÃO mudam — overlap só olha X/Z), a técnica de sempre pra
 * "levantar" um modelo atarracado.
 */
const YSTRETCH = 1.18;

/** brasa base do emissivo (o plasma contido na jaula) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#5e2a48');
const EMISSIVE_FLASH = new THREE.Color('#ffe3f6');

/**
 * VERTEX do BAFO DA FORJA escalado ao encaixe da malha (o calor que sobe da
 * bigorna do PlasmaRig antigo: cinza QUEENTE escuro puxando para o rosa da
 * estrela, nunca bola de neve clara). `uScale` amarra o raio/altura ao porte da
 * malha (caixa crua ~0,86); `uCharge` acelera e alarga a pluma na descarga do
 * feixe. Nasce da base e sobe fino, esquentando no meio e esfriando no topo.
 */
const HEAT_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uScale;
uniform float uYScale;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.3 + 0.34 * aRand.z;
  float prog = fract(uTime * speed * 0.26 * (1.0 + uCharge * 1.3) + aRand.y);
  // sobe FINO e torto (o bafo quente é leve e nervoso)
  float ang = aRand.x * 6.28318 + prog * (1.2 + 1.6 * aRand.z) + uTime * 0.16;
  float r = (0.42 + prog * (0.5 + 0.5 * aRand.z)) * uScale;
  float y = (0.1 + prog * (1.6 + 0.45 * aRand.z)) * uYScale;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // puff quente MOLE (cinza queenete, sem borda dura)
  float size = (6.5 + 9.0 * aRand.z) * (0.85 + uCharge * 0.7) * uSizeMul * (0.6 + prog * 0.95);
  gl_PointSize = min(140.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.5, 1.0, prog)) * uAlpha * 0.45;
  // cinza QUEENTE escuro -> puxa para o rosa da estrela no meio -> esfria no topo
  float heat = sin(prog * 3.14159);
  vC = mix(vec3(0.5, 0.44, 0.47), vec3(0.94, 0.66, 0.80), heat * (0.6 + uCharge * 0.3));
  gl_Position = projectionMatrix * mv;
}
`;

const HEAT_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.04, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.5);
}
`;

/**
 * VERTEX da COROA DE FILAMENTOS DE PLASMA orbitando o sol (as proeminências
 * presas na jaula): cada filamento rosa-branco orbita numa faixa própria do corpo
 * (da base à cabeça, NUNCA acima da malha — lição da trovoada), com raio/altura
 * tremendo em senóides desencontradas e um arco DURO (o plasma que religa e
 * estala — lampejo intermitente). Metade gira para o lado oposto (caos). Rosa do
 * motor; o arco lampejante vira rosa-quase-branco (nunca #ffffff puro).
 */
const FILAMENT_ORBIT_VERT = /* glsl */ `
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
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.9 + 0.7 * aRand.z) * (1.0 + uCharge * 1.8);
  float r = mix(uR1, uR2, aRand.z) * (0.82 + 0.3 * sin(uTime * 2.0 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.16 * sin(uTime * 2.6 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // arco DURO: o plasma religa num instante sorteado (o lampejo estala)
  float arc = step(0.66, fract(sin(floor(uTime * (12.0 + 14.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.0 + 3.0 * aRand.z) * (0.65 + 0.6 * arc) * uSizeMul * (1.0 + uCharge * 0.7);
  gl_PointSize = min(85.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.5 + 0.5 * arc) * uAlpha * (0.55 + 0.35 * uCharge);
  vec3 tint = vec3(1.0, 0.62, 0.96); // o rosa-vitríolo do motor (#ff9ef5)
  vC = mix(tint, vec3(1.0, 0.89, 0.96), arc * 0.55); // ao religar vira rosa-quase-branco
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher do Plasma: Nv.7 = a malha importada da estrela de bolso; enquanto
 * ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO segura o
 * buraco — o figurino da forja antigo nunca mais aparece no campo (a lição da
 * troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `PlasmaRig` antigo ficou só doador de efeitos e coreografia).
 */
export function PlasmaRig(props: PlasmaRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="plasma" url={PLASMA_URL} seed={props.seed} />}>
      <SummonReveal species="plasma" seed={props.seed}>
        <PlasmaMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function PlasmaMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: PlasmaRigProps) {
  const { scene } = readModel(PLASMA_URL);

  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${PLASMA_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ a jaula destorcer sem rasgar nas arestas duras do GLB
    // (qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração da estrela: o SOL em miniatura (a fornalha do plasma)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 4,91 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('plasma', PLASMA_DEF.levelMin as MonsterLevel);
    const yaw = PLASMA_MODEL_YAW;
    const hx = Math.max(-bb.min.x, bb.max.x);
    const hz = Math.max(-bb.min.z, bb.max.z);
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const halfWide = hx * ca + hz * sa;
    const halfAlong = hx * sa + hz * ca;
    const sW = Math.min(foot.x / (halfWide + SHELL_HUG), foot.z / (halfAlong + SHELL_HUG));
    const s = Math.min(TOP / src.spanY, sW);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(yaw) + cz * Math.sin(yaw));
    const pz = cx * Math.sin(yaw) - cz * Math.cos(yaw);
    return {
      s,
      pos: [px, -bb.min.y * s * YSTRETCH, pz] as [number, number, number],
    };
  }, [src]);

  const s = fit.s;
  const coreY = src.coreY * s * YSTRETCH;

  // material por instância: textura do GLB + PLASMA VIVO — a leitura da pintura no
  // emissivo (o sol do peito e os veios de plasma acendem o rosa da IDENTIDADE
  // pelas costuras do ferro) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // FERRO FORJADO: metal médio, rugosidade média (o ferro vivo pega o reflexo
      // da arena; quem brilha é o plasma nas costuras, não o albedo)
      roughness: 0.44,
      metalness: 0.62,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.22,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLT = { value: 0 };
      sh.uniforms.uLSeed = { value: seed };
      sh.uniforms.uLCharge = { value: 0 };
      sh.uniforms.uLHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uLT;\nuniform float uLSeed;\nuniform float uLCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // a JAULA destorce de leve (o torque do plasma preso): treme CURTO e
          // sorteado por celula dura, na normal SOLDADA (aDispNrm — senão as
          // arestas duras abririam as "rachaduras" do qa/probe-cracks.mjs). A
          // régua é MILIMÉTRICA (o ruído vale 0..1 e a amplitude mora em METROS).
          float cell = fnoise(floor(vJit * 15.0) + uLSeed);
          float strain = sin(uLT * 15.0 + cell * 60.0) * (0.0006 + uLCharge * 0.003);
          transformed += aDispNrm * (cell * 0.0035 + strain);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uLT;\nuniform float uLCharge;\nuniform float uLHurt;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // O PLASMA VIRA VIDA: onde a pintura é CLARA/ROSA (o sol do peito e os
          // veios de plasma pegando luz) a centelha da IDENTIDADE (#ff9ef5 do
          // motor) ACENDE pelas costuras do ferro num sorteio duro de celula — o
          // SOL do peito é o único ponto aceso da estrela e é ele que lê no card
          // miúdo.
          vec4 pain = texture2D(map, vMapUv);
          float pink = clamp(pain.r + pain.b - 1.6 * pain.g - 0.2, 0.0, 1.0);
          float lum = clamp(pain.r + pain.g + pain.b - 1.5, 0.0, 1.0);
          float ck = step(0.5, fract(sin(floor(uLT * 7.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // veios de plasma (o miolo quente é ROSA-CLARO, nunca #ffffff — blowout cortado)
          totalEmissiveRadiance += vec3(1.0, 0.62, 0.96) * (pink + 0.4 * lum) * (0.3 + 0.5 * ck + uLCharge * 1.0);
          totalEmissiveRadiance *= 1.0 + uLCharge * 1.0 + uLHurt * 0.7;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // coroa de filamentos de plasma orbitando o sol (as proeminências presas):
  // faixas do corpo (da base ao topo da cabeça), nunca acima da malha
  const orbit = useMemo(
    () => ({
      geo: makeSparkGeo(24),
      mat: new THREE.ShaderMaterial({
        vertexShader: FILAMENT_ORBIT_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.2 * s * YSTRETCH },
          uY1: { value: (src.spanY * s - 0.14 * s) * YSTRETCH },
          uR1: { value: s * 0.52 },
          uR2: { value: s * 0.78 },
          uSpin: { value: 2.0 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // bafo da forja subindo da base (o calor quente — escalado ao porte da malha) —
  // o motivo de vida quente da espécie (cinza queenete, nunca bola de neve clara)
  const heat = useMemo(
    () => ({
      geo: makeSparkGeo(embers ?? 20),
      mat: new THREE.ShaderMaterial({
        vertexShader: HEAT_VERT,
        fragmentShader: HEAT_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uScale: { value: s },
          uYScale: { value: s * YSTRETCH },
        },
      }),
    }),
    [embers, emberScale, s],
  );

  // auréola de estilhaços (rosa do motor + rosa-quase-branco — o projétil-
  // assinatura da estrela é o feixe de plasma)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, CORE_LOOK.gold),
      makeStarburstGeo(seed + 7.4, 14, CORE_LOOK.white),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      heat.geo.dispose();
      heat.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, heat, starburstGeos]);

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

    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let frontZ = -1;
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
      if (demoT.current > PLASMA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= PLASMA_WINDUP * PLASMA_ATTACK_WINDOW && sinceAttack <= PLASMA_ATTACK_WINDOW;
    // a descarga é QUASE INSTANTÂNEA: o clarão do feixe nasce no disparo e some em ~0,2 s
    const flash = striking ? Math.max(0, 1 - (sinceAttack - PLASMA_WINDUP * PLASMA_ATTACK_WINDOW) / 0.2) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (jaula destorcendo + plasma das costuras acendendo sob
    // pressão)
    const sh = body.userData.shader as
      | { uniforms: { uLT: { value: number }; uLCharge: { value: number }; uLHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uLT.value = t;
      sh.uniforms.uLCharge.value = pose.charge;
      sh.uniforms.uLHurt.value = hurt;
    }
    // o plasma NERVA (o gatilho mais rápido da árvore): pisca rápido e ARDE cheio
    const flicker = 0.5 + 0.22 * Math.sin(t * 5.1 + seed) + 0.18 * Math.sin(t * 11.7 + seed * 0.7);
    body.emissiveIntensity = Math.max(
      0,
      (0.22 + flicker * 0.05 + pose.charge * 0.9 + flash * 0.7 + hurt * 0.4 + crumble * 0.4) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.3 + flash * 0.45 + pose.charge * 0.45));

    // bafo da forja: acelera na descarga; na morte a jaula ROMPE (bafo de uma vez)
    heat.mat.uniforms.uTime.value = t;
    heat.mat.uniforms.uAlpha.value = alpha;
    heat.mat.uniforms.uCharge.value = Math.min(1, pose.charge + pose.flare * 0.5 + crumble * 0.8);

    // coroa de filamentos orbitando o sol (o turbilhão DOBRA na pressão da jaula)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.7;

    // ---- corpo: a CONTENÇÃO NERVOSA (a jaula APERTA e a estrela ENCOLHE sob a
    // pressão ao carregar; os garfos ABREM, a estrela ESTUFA e a gaiola solta o
    // torque na descarga) ----
    const sway = Math.sin(t * 0.6 + seed) * 0.01 + Math.sin(t * 1.4 + 1.7) * 0.005;
    g.scale.set(
      1 + pose.bulge * 0.07,
      1 + pose.bulge * 0.09 - pose.crouch * 0.04,
      1 + pose.bulge * 0.07,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.5 + seed * 0.6) * 0.006;
    g.rotation.x = pose.crouch * 0.02;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.006 - pose.crouch * 0.02;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão do SOL aceso no peito (o miolo de luz do rig antigo — plantado
    // na FRENTE do sol do GLB, MIÚDO e ROSA-CLARO nunca blowout #ffffff) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.3 + flicker * 0.05 + pose.charge * 0.5 + hurt * 0.15));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.025 * Math.sin(t * 4.0 + seed) + pose.charge * 0.08) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.5 + 0.12 * s));
    const flashS = flash > 0 ? 0.8 + 1.3 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.24 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para o
    // envelope total nunca passar do anel (a auréola é a ÚNICA malha além da
    // silhueta que a sonda de footprint lê — por isso o fator é apertado)
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.26;
    aura.rotation.z = Math.sin(t * 1.1 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.5 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.38 * (1 + Math.sin(t * 5.2 + seed) * 0.05 + pose.charge * 0.15));
    const auraPulse = 0.6 + 0.4 * Math.sin(t * 8.2 + seed);
    const pinkShard = starburstRefs.current[0];
    const whiteShard = starburstRefs.current[1];
    if (pinkShard) {
      (pinkShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.08) * auraPulse * alpha;
    }
    if (whiteShard) {
      (whiteShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.12) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente ao sol
    coreGlow.scale.setScalar(0.24 + pose.charge * 0.18 + flash * 0.16); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.07 + pose.charge * 0.16 + flash * 0.14) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={PLASMA_MODEL_YAW} scale={[fit.s, fit.s * YSTRETCH, fit.s]}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* bafo da forja subindo da base (o calor quente — cinza queenete, nunca claro) */}
      <points geometry={heat.geo} material={heat.mat} frustumCulled={false} />
      {/* coroa de filamentos de plasma orbitando o sol (as proeminências presas) */}
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
      {/* SEM anéis de chão: a base da forja é o envelope que a malha já dá (a
          lição do Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.24} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={PLASMA_SPARK}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.3}>
        <spriteMaterial
          map={circleTexture()}
          color={CORE_LOOK.white}
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
          color={CORE_LOOK.white}
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
