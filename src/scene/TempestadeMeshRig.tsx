import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { STORM_URL } from './modelUrls';
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
  TEMPESTADE_ATTACK_WINDOW,
  TEMPESTADE_WINDUP,
  type TempestadeRigProps,
} from './TempestadeRig';

/**
 * TEMPESTADE DE MALHA 3D IMPORTADA — A MURALHA DE RAIOS (Nv.7): a forma da
 * espécie vira um mesh texturizado criado fora do jogo (`src/models/storm/storm.glb`
 * — malha ÚNICA com textura 2048²; SEM ossos e SEM animação): a bigorna de nuvem
 * de tempestade com o VENTRE LILÁS aceso por dentro, os mastros para-raios no
 * topo e as cortinas de chuva batendo nas laterais. Enquanto a malha desce
 * (demanda), o SELO DE INVOCÇÃO (`SummonFX`) segura o buraco — o figurino da
 * trovoada (`TempestadeRig`) nunca mais pipoca no campo (ficou só doador de
 * efeitos e coreografia) — e TODOS os efeitos da muralha continuam vivos por cima
 * da malha, no mesmo idioma dos demais figurinos da linha "modelos 3D":
 *
 *  1. RELÂMPAGO INTRA-NUVEM na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no
 *     emissivo — onde a tinta é CLARA/AZULADA (as arestas da bigorna e o ventre
 *     pegando luz) o LILÁS-relâmpago da IDENTIDADE (#d0b6ff do motor, a mesma cor
 *     do projétil) ACENDE POR DENTRO da nuvem, num sorteio duro de celula (o
 *     clarão que estala e some, relâmpago intra-nuvem); a nuvem INCHA de leve na
 *     afinação (treme curto na normal SOLDADA `aDispNrm`, lição das soldas). A
 *     LIÇÃO DO PRINT: a nuvem é ESCURA (ardósia), o albedo escuro é o que impede
 *     o blowout — quem clareia é o relâmpago lilás por dentro, nunca o albedo;
 *  2. O VENTRE LILÁS (o único ponto aceso da muralha — a lição do card miúdo):
 *     clarão aditivo miúdo plantado na FRENTE do ventre do GLB + auréola de
 *     estilhaços elétricos (dois `starburst` em leque) — NUNCA a bola do núcleo do
 *     rig antigo (a malha já traz o ventre aceso esculpido; religar uma bola na
 *     frente seria a bola do Magmar cortada na aprovação);
 *  3. CORTINA DE CHUVA (o vendaval — a ASSINATURA plantada da muralha): as fitas
 *     cinza-ardósia do rig antigo correm para baixo EMBRULHANDO o corpo (a
 *     cortina larga o muro em volta), agora escaladas ao encaixe da malha; o
 *     `gust` da rajada varre as fitas para frente no disparo. A cortina precisa
 *     LER contra o tabuleiro (meio-termo ardósia, NUNCA branco de lavadora);
 *  4. ARCOS ELÉTRICOS orbitando o corpo (os curtos-circuitos dos mastros): um
 *     enxame lilás-duro numa faixa do corpo (da base à cabeça, NUNCA acima da
 *     malha — lição da trovoada), metade gira para o lado oposto (caos), cada arco
 *     RELIGA e estala num instante sorteado.
 *
 * SEM fumaça do pool no corpo: a tempestade solta CHUVA e RELÂMPAGO, não fuligem
 * de grafite (o smokePool do rig antigo só ia no respingo frio da rajada e na
 * bruma da base). A coreografia é a MESMA timeline do motor (janela 0,55 s: o
 * muro INCHA inspirando o campo — mastros flexionam para trás, ar é SUGADO para
 * dentro; a descarga é quase junto — mastros ESTALAM para frente, o ar varre com
 * o vendaval) lida de `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o
 * mesmo show. Sem ossos: o rig antigo animava o GRUPO raiz (inchar, flexionar os
 * mastros, avançar a frente) e a malha herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x ±0,499, spanY ~0,90), como os
 * demais Nv.7, e o encaixe vem da LARGURA (o teto de altura 4,5/0,90=5,0 não
 * aperta). `MEDIDO.tempestade` no degrau 2,5 quadrado (a régua nova dos Nv.7-cubo,
 * igual à dos irmãos — em 1,9 o cubo ficava BAIXO ao lado dos Nv.6) põe a malha
 * do mesmo porte dos Nv.6; a cara encara o INIMIGO no +Z local (rumo 0 — o ventre
 * lilás e os mastros da frente saíram no painel "frente (+Z)" do viewer de 4
 * vistas, `qa/mesh-viewer-shot.mjs`). O `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const TEMPESTADE_DEF = getSpecies('tempestade');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(TEMPESTADE_DEF, TEMPESTADE_DEF.levelMin);

/** o lilás-relâmpago da tempestade (= a cor do projétil do motor, #d0b6ff) */
const STORM_LILAC = '#d0b6ff';

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou o ventre lilás e os
 * mastros para-raios no +Z — como as demais malhas da linha. Se um GLB substituto
 * vier virado, vire aqui.
 */
export const TEMPESTADE_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola
 * elétrica ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa
 * CPU e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração da muralha em PORCENTAGEM da altura da malha: o VENTRE LILÁS (a
 * fornalha elétrica da nuvem) mora ABAIXO do meio geométrico — a bigorna
 * afunila para baixo e o ventre aceso é a barriga da tempestade. É a régua de
 * CORE_Y: clarão, auréola e o centro das cortinas de chuva nascem dessa altura.
 */
const CORE_FRAC = 0.46;

/**
 * ESTIQUE VERTICAL da malha (X/Z em `fit.s`, Y em `fit.s·YSTRETCH`): a caixa da
 * tempestade é a MAIS LARGA de todas (x ±0,499) e achatada, então na escala
 * uniforme o invólucro encosta no anel (2,5) antes de subir — a sonda mediu topo
 * 3,53 (o mais baixo dos Nv.7). Esticar SÓ o Y em 1,18 põe o topo na faixa dos
 * Nv.6 sem alargar a pegada (anel e vão horizontal intocados — overlap só lê X/Z).
 * Uma muralha de tempestade MAIS ALTA é inclusive mais fiel à bigorna de nuvem.
 */
const YSTRETCH = 1.18;

/** brasa base do emissivo (o acinzentado do ventre) e o flash do relâmpago */
const EMISSIVE_BASE = new THREE.Color('#39415e');
const EMISSIVE_FLASH = new THREE.Color('#d0b6ff');

/**
 * VERTEX da CORTINA DE CHUVA escalada ao encaixe da malha (as fitas de chuva do
 * TempestadeRig antigo: cinza-ardósia correndo para baixo EMBRULHANDO o corpo —
 * a cortina é larga e gira de verdade, devagar). `uScale` amarra o raio/altura ao
 * porte da malha (caixa crua ~0,9); `uGust` empurra as fitas para frente quando a
 * rajada varre; `uCharge` inclina mais. Fio de chuva: perolado frio clareando
 * perto do chão (NUNCA branco puro — a lição do véu da areia).
 */
const RAIN_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo no muro, y: fase, z: velocidade/tamanho
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uGust;
uniform float uScale;
uniform float uYScale;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 1.1 + 0.9 * aRand.z;
  float prog = fract(uTime * speed * 0.42 + aRand.y);
  // largo o corpo em volta (cortina gira de verdade, devagar) e cai inclinando
  float ang = aRand.x * 6.28318 + uTime * 0.85;
  float rad = (0.92 + 0.16 * aRand.z) * uScale;
  float x = cos(ang) * rad + sin(aRand.y * 9.0 + uTime * 1.3) * 0.1 * uScale;
  float z = sin(ang) * rad + prog * (0.4 + uCharge * 1.4 + uGust * 0.9) * uScale;
  float y = mix(0.86 + 0.16 * aRand.y, 0.02, prog) * uYScale;
  vec3 p = vec3(x, y, z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // gota curta e dura: ponto pequeno (não o fiapo macio do vapor)
  float size = (2.4 + 2.8 * aRand.z) * uSizeMul * (1.0 + uCharge * 0.3);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - smoothstep(0.86, 1.0, prog)) * uAlpha;
  // o fio de chuva: perolado frio clareando perto do chão (NUNCA branco puro)
  vC = mix(vec3(0.55, 0.62, 0.78), vec3(0.8, 0.85, 0.95), prog * 0.7 + 0.2 * aRand.z);
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // gota elongada (streak): elipse vertical estreita
  vec2 q = vec2(d.x * 2.2, d.y);
  float m = smoothstep(0.5, 0.18, length(q));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.5);
}
`;

/**
 * VERTEX dos ARCOS ELÉTRICOS orbitando a muralha (os curtos-circuitos dos
 * mastros): cada arco lilás-duro orbita numa faixa própria do corpo (da base à
 * cabeça, NUNCA acima da malha — lição da trovoada), com raio/altura tremendo em
 * senóides desencontradas e um RELIGAR duro (o arco que estala e some). Metade
 * gira para o lado oposto (caos). Lilás do motor; o arco lampejante vira
 * lilás-quase-branco.
 */
const ARC_ORBIT_VERT = /* glsl */ `
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
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.8 + 0.6 * aRand.z) * (1.0 + uCharge * 1.7);
  float r = mix(uR1, uR2, aRand.z) * (0.84 + 0.28 * sin(uTime * 2.4 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.15 * sin(uTime * 3.0 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // arco RELIGA: estala num instante sorteado (o relâmpago curto)
  float arc = step(0.6, fract(sin(floor(uTime * (14.0 + 16.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.0 + 3.0 * aRand.z) * (0.6 + 0.6 * arc) * uSizeMul * (1.0 + uCharge * 0.7);
  gl_PointSize = min(85.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.45 + 0.55 * arc) * uAlpha * (0.55 + 0.4 * uCharge);
  vec3 tint = vec3(0.82, 0.71, 1.0); // o lilás-relâmpago do motor (#d0b6ff)
  vC = mix(tint, vec3(0.95, 0.92, 1.0), arc * 0.5); // ao religar vira lilás-quase-branco
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher da Tempestade: Nv.7 = a malha importada da muralha de raios;
 * enquanto ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO
 * segura o buraco — o figurino da trovoada antigo nunca mais aparece no campo (a
 * lição da troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `TempestadeRig` antigo ficou só doador de efeitos e coreografia).
 */
export function TempestadeRig(props: TempestadeRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="tempestade" url={STORM_URL} seed={props.seed} />}>
      <SummonReveal species="tempestade" seed={props.seed}>
        <TempestadeMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function TempestadeMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: TempestadeRigProps) {
  const { scene } = readModel(STORM_URL);

  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${STORM_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ a nuvem inchar sem rasgar nas arestas duras do GLB
    // (qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração da muralha: o VENTRE LILÁS (a fornalha elétrica da nuvem)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 5,0 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('tempestade', TEMPESTADE_DEF.levelMin as MonsterLevel);
    const yaw = TEMPESTADE_MODEL_YAW;
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

  // material por instância: textura do GLB + RELÂMPAGO INTRA-NUVEM — a leitura da
  // pintura no emissivo (o ventre e as arestas da bigorna acendem o lilás da
  // IDENTIDADE por dentro) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // NUVEM de tempestade: rugosa, sem metal (a bigorna é fosca e pesada — o
      // brilho vem só do relâmpago por dentro, nunca do albedo)
      roughness: 0.9,
      metalness: 0.02,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.16,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWT = { value: 0 };
      sh.uniforms.uWSeed = { value: seed };
      sh.uniforms.uWCharge = { value: 0 };
      sh.uniforms.uWHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uWT;\nuniform float uWSeed;\nuniform float uWCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // a NUVEM incha de leve (a inspiração do campo): treme CURTO e sorteado
          // por celula dura, na normal SOLDADA (aDispNrm — senão as arestas duras
          // abririam as "rachaduras" do qa/probe-cracks.mjs). A régua é MILIMÉTRICA
          // (o ruído vale 0..1 e a amplitude mora em METROS).
          float cell = fnoise(floor(vJit * 11.0) + uWSeed);
          float swell = sin(uWT * 5.0 + cell * 30.0) * (0.0012 + uWCharge * 0.004);
          transformed += aDispNrm * (cell * 0.006 + swell);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uWT;\nuniform float uWCharge;\nuniform float uWHurt;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // O RELÂMPAGO VIRA VIDA POR DENTRO: onde a pintura é CLARA/AZULADA (as
          // arestas da bigorna e o ventre pegando luz) o LILÁS-relâmpago da
          // IDENTIDADE (#d0b6ff do motor, a cor do projétil) ACENDE por dentro da
          // nuvem num sorteio duro de celula — o clarão que ESTALA e SOME
          // (relâmpago intra-nuvem). O VENTRE é o único ponto aceso da muralha e é
          // ele que lê no card miúdo. A nuvem é ESCURA: quem clareia é o relâmpago,
          // nunca o albedo (a regra do print: albedo claro vira bola branca).
          vec4 pain = texture2D(map, vMapUv);
          float bluish = clamp(pain.b + pain.g - 1.6 * pain.r - 0.0, 0.0, 1.0);
          float lum = clamp(pain.r + pain.g + pain.b - 1.4, 0.0, 1.0);
          // o clarão intra-nuvem pisca SORTIDO (o raio estala e some, não pisca suave)
          float bolt = step(0.55, fract(sin(floor(uWT * (7.0 + 4.0 * uWCharge) + floor(vJit.y * 7.0)) * 43758.5453)));
          totalEmissiveRadiance += vec3(0.82, 0.71, 1.0) * (0.5 * bluish + 0.4 * lum) * bolt * (0.35 + uWCharge * 1.6);
          totalEmissiveRadiance *= 1.0 + uWCharge * 0.8 + uWHurt * 0.6;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // arcos elétricos orbitando o corpo (os curtos-circuitos dos mastros): faixas do
  // corpo (da base ao topo da cabeça), nunca acima da malha
  const orbit = useMemo(
    () => ({
      geo: makeSparkGeo(22),
      mat: new THREE.ShaderMaterial({
        vertexShader: ARC_ORBIT_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.2 * s * YSTRETCH },
          uY1: { value: (src.spanY * s - 0.12 * s) * YSTRETCH },
          uR1: { value: s * 0.54 },
          uR2: { value: s * 0.8 },
          uSpin: { value: 1.7 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // cortina de chuva embrulhando o corpo (a ASSINATURA plantada — escalada ao
  // porte da malha; a muralha exige no mínimo ~26 gotas caindo sempre)
  const rain = useMemo(
    () => ({
      geo: (() => {
        const g = new THREE.BufferGeometry();
        const n = Math.max(26, embers ?? 26);
        const pos = new Float32Array(n * 3);
        const rnd = new Float32Array(n * 3);
        let st = 0x5f3a77b9 ^ (n * 2654435761);
        const rand = () => {
          st = (st * 1664525 + 1013904223) >>> 0;
          return st / 4294967296;
        };
        for (let i = 0; i < n * 3; i++) rnd[i] = rand();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
        return g;
      })(),
      mat: new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uGust: { value: 0 },
          uScale: { value: s },
          uYScale: { value: s * YSTRETCH },
        },
      }),
    }),
    [embers, emberScale, s],
  );

  // auréola de estilhaços (lilás do motor + lilás-quase-branco — o projétil-
  // assinatura da muralha é o raio)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, STORM_LILAC),
      makeStarburstGeo(seed + 7.4, 14, '#efe8ff'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      rain.geo.dispose();
      rain.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, rain, starburstGeos]);

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
      if (demoT.current > TEMPESTADE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= TEMPESTADE_WINDUP * TEMPESTADE_ATTACK_WINDOW && sinceAttack <= TEMPESTADE_ATTACK_WINDOW;
    // o raio sai QUASE JUNTO: o clarão do disparo nasce e some em ~0,2 s
    const flash = striking ? Math.max(0, 1 - (sinceAttack - TEMPESTADE_WINDUP * TEMPESTADE_ATTACK_WINDOW) / 0.2) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (nuvem inchando + relâmpago intra-nuvem acendendo sob
    // carga)
    const sh = body.userData.shader as
      | { uniforms: { uWT: { value: number }; uWCharge: { value: number }; uWHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uWT.value = t;
      sh.uniforms.uWCharge.value = pose.charge;
      sh.uniforms.uWHurt.value = hurt;
    }
    // o ventre respira e o relâmpago ARDE cheio na inspiração do campo
    const churn =
      Math.sin(t * 0.8 + seed) * 0.5 + Math.sin(t * 1.9 + seed * 0.7) * 0.3 + Math.sin(t * 3.4 + 1.1) * 0.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.16 + churn * 0.03 + pose.charge * 0.6 + flash * 0.8 + hurt * 0.4 + crumble * 0.4) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.3 + flash * 0.5 + pose.charge * 0.4));

    // cortina de chuva: a rajada varre para frente; na morte a tempestade DESABA
    rain.mat.uniforms.uTime.value = t;
    rain.mat.uniforms.uAlpha.value = alpha;
    rain.mat.uniforms.uCharge.value = pose.charge + flash * 0.5;
    rain.mat.uniforms.uGust.value = pose.gust + crumble * 0.5;

    // arcos orbitando o corpo (o turbilhão DOBRA na carga e solta o vendaval)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.8;

    // ---- corpo: a frente de tempestade (INCHA inspirando + afunda o teto ao
    // carregar, AVANÇA e os mastros ESTALAM para frente na descarga) ----
    const sway = Math.sin(t * 0.34 + seed) * 0.012 + Math.sin(t * 0.78 + 1.7) * 0.005;
    g.scale.set(
      1 + pose.swell * 0.07,
      1 - pose.swell * 0.05,
      1 + pose.swell * 0.07,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.3 + seed * 0.6) * 0.008;
    g.rotation.x = -pose.lean * 0.04;
    g.position.y = Math.sin(t * 0.6 + seed) * 0.01;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão do VENTRE LILÁS aceso no peito (o miolo de luz do rig antigo —
    // plantado na FRENTE do ventre do GLB, MIÚDO e SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.3 + churn * 0.06 + pose.charge * 0.5 + hurt * 0.15));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.025 * Math.sin(t * 3.2 + seed) + pose.charge * 0.08) * alpha,
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
    aura.position.z = frontZ * -0.28;
    aura.rotation.z = Math.sin(t * 1.0 + seed) * 0.1;
    aura.rotation.x = Math.sin(t * 1.4 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.38 * (1 + Math.sin(t * 5.0 + seed) * 0.05 + pose.charge * 0.16));
    const auraPulse = 0.6 + 0.4 * Math.sin(t * 9.0 + seed);
    const lilacShard = starburstRefs.current[0];
    const whiteShard = starburstRefs.current[1];
    if (lilacShard) {
      (lilacShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.08) * auraPulse * alpha;
    }
    if (whiteShard) {
      (whiteShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.13) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente ao ventre
    coreGlow.scale.setScalar(0.24 + pose.charge * 0.18 + flash * 0.16); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.07 + pose.charge * 0.16 + flash * 0.15) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={TEMPESTADE_MODEL_YAW} scale={[fit.s, fit.s * YSTRETCH, fit.s]}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* cortina de chuva embrulhando o corpo (a ASSINATURA plantada da muralha) */}
      <points geometry={rain.geo} material={rain.mat} frustumCulled={false} />
      {/* arcos elétricos orbitando o corpo (os curtos-circuitos dos mastros) */}
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
      {/* SEM anéis de chão: a poça de chuva é o envelope que a malha já dá (a
          lição do Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.24} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={STORM_LILAC}
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
          color="#efe8ff"
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
          color="#efe8ff"
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
