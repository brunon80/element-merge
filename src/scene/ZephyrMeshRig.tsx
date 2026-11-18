import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WIND_URLS } from './modelUrls';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, setSeedAttribute, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import {
  attackPose,
  WIND_ATTACK_WINDOW,
  WIND_ROLE_LOOK,
  type WindRigProps,
} from './WindRig';
import { WIND_FRAG } from './windShaders';
import { readModel } from './modelPreload';
import { SummonReveal, SummonSigil } from './SummonFX';

/**
 * ZÉFIRO DE MALHA 3D IMPORTADA — A ÁRVORE INTEIRA (Nv.1..5): cada forma da
 * evolução do vento é um mesh texturizado criado fora do jogo
 * (`src/models/wind/wind_model_lvl1..5.glb` — ~25-31 mil vértices, UMA malha
 * com UMA textura cada; SEM ossos e SEM animação no arquivo). Enquanto a
 * malha desce (demanda), o SELO DE INVOCÇÃO (`SummonFX`) segura o buraco — o
 * figurino procedural de vendaval (`WindRig`) nunca mais pipoca no campo;
 * ficou só doador de efeitos e coreografia.
 *
 * Os GLBs não trazem esqueleto, então o ESQUELETO NASCE EM CÓDIGO
 * (`root → spine → head → fin0 → fin1`), com pesos de pele por FAIXA de Y
 * (`ensureSkin`, uma vez por geometria, compartilhados entre instâncias) e a
 * coreografia de rajada do WindRig (`attackPose`: inalar → soltar). As caixas
 * dos cinco modelos DIFEREM (a coruja Nv.4 é larga e baixinha; o sopro Nv.1 é
 * a bolota alta), então TODOS os marcos — juntas, faixas de pele, zona das
 * barbatanas e o gradiente do invólucro — nascem da bbox de cada malha na
 * mesma régua porcentual do sopro (`BODY_FRAC`). A "vida" vem em camadas, no
 * mesmo idioma dos rigs da casa:
 *  1. RESPIRAÇÃO + cambalear idle nos ossos (o funil infla/murcha com a SUCÇÃO
 *     da inalação, a cabeça atrasa o lean, as barbatanas são amostradas NO
 *     PASSADO — follow-through);
 *  2. COREOGRAFIA DE RAJADA idêntica — janela do motor (`lastAttackAt`) e
 *     `demoAttackSeq` do bestiário;
 *  3. VIDA DO VENTO no material: grão das fitas CORRENDO PARA CIMA + as
 *     barbatanas acima da raiz batendo com fase própria (o rosto lê firme);
 *  4. os MESMOS motes subindo em espiral e a poeira FRIA sugada do pool
 *     (mais de cada, quanto mais alto o nível — como no WindRig);
 *  5. INVOLTÓRIO DE VENTO (o antigo abraçando o novo, em TODOS os níveis):
 *     uma casca da mesma malha vestida com o WIND_FRAG literal — fitas em
 *     espiral, torção + balanço, nuvem de tempestade translúcida. O
 *     deslocamento é pelo EIXO do corpo, nunca pela normal (lição das
 *     "rachaduras"). O rosto lê ATRAVÉS do véu.
 *
 * GIRO DO INVOLTÓRIO POR NÍVEL: o Nv.1 (bolota ~quadrada na vista de cima)
 * conserva a revolução contínua lenta aprovada; as formas 2..5 têm ASAS/BRAÇOS
 * longes do eixo (envergadura crua ~1,0 num box 1,98) — girar isso 360°
 * varreria para fora do buraco (regra da casa: o giro é LENTO de propósito
 * para não alargar a varredura). Nelas o giro vira VARREDURA OSCILANTE (o
 * rafale balança o véu, nunca o repisa em torno do corpo) com teto de ângulo
 * (`uAngMax`) medido para a sobra do próprio footprint — ver a tabela
 * `SHELL_SPIN`.
 *
 * ENCAIXE: cada modelo é escalado para o topo autoral da forma (`formTops`
 * 1,68 → 4,27 — o invólucro desta espécie é o PADRÃO da escada mundo dos puros:
 * 0,691 no Nv.1, ~×1,37 por fusão até 2,43 no Nv.5) e FLUTUA à altura do
 * figurino do seu nível (`FLOAT_Y` — o vento nunca pisou o chão senão no Nv.5
 * tornado; aqui é a base da malha). TETO DE LARGURA: o invólucro autoral
 * (`footprintOf`, tabela `data/footprints.ts`) é o contrato — encaixo (mesh +
 * abraço) ≤ entrada nos dois eixos. A coruja Nv.4 e o dragão Nv.5 abrem as
 * asas: são elas que puxam o `familyRadius` da
 * família (e o `slotFit` encolhe a família inteira para o buraco, como no
 * dragão de fogo).
 */

/** dados da espécie (a altura autoral de cada forma vem do catálogo, não do modelo) */
const ZEPHYR_DEF = getSpecies('zephyr');
const LEVEL_1 = 1;

/** topo autoral por forma (Nv.1..5) — a mesma escada que o motor usa p/ o canhão */
const TOP_BY_LEVEL = [1, 2, 3, 4, 5].map((l) => formTop(ZEPHYR_DEF, l));

/** o vendaval criatura abaixo flutua mais (o Nv.5 da malha pisa o chão) — o mesmo FLOAT_Y do WindRig */
const FLOAT_Y = [0.34, 0.24, 0.13, 0.05, 0];

/** URL da malha da forma (índice = nível−1, mapa central em `modelUrls`). O encaixe por bbox torna o resto automático */
const windUrlFor = (level: number): string => WIND_URLS[level - 1];

/**
 * Rumo da malha POR NÍVEL (índice = nível-1): o rig encara o INIMIGO no +Z
 * local (o mesmo +Z do avanço da rajada). O print das quatro vistas
 * (mesh-viewer) mostrou os cinco nascendo virados para +Z. Se algum print
 * mostrar o bicho DE COSTAS ou de lado, vire aqui (Math.PI para meia-volta;
 * π/2 e -π/2 para os lados).
 */
export const MODEL_YAWS = [0, 0, 0, 0, 0];
const yawFor = (level: number): number => MODEL_YAWS[level - 1];

/** brasa fria do emissivo (tempestade, não fogo) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#4f9fd0');
const EMISSIVE_FLASH = new THREE.Color('#eaf6ff');

/**
 * Abraço estático do invólucro (em metros do MODELO Nv.1): a folga da casca
 * para fora. Como os 5 modelos têm caixas DIFERENTES, a folga é PROPORCIONAL
 * ao tamanho (regra do fogo, que vale em dobro no vento: o véu nunca pode
 * vazar do buraco).
 */
const SHELL_HUG = 0.12;

/** altura de caixa do sopro Nv.1 — a régua que calibra o abraço e a fervura */
const SPAN_NV1 = 1.977;

/**
 * GIRO DO INVOLTÓRIO por nível (índice = nível-1). Nv.1: revolução contínua
 * lenta (uSpin rad/s) + torção alta — a bolota girando é o redemoinho aprovado
 * na primeira rodada. Nv.2..5: asas e braços de vento longe do eixo girando
 * 360° varreriam o buraco (a sobra do footprint autoral não paga o círculo);
 * lá o véu BALANÇA (uSway em rad, oscilante) com teto de ângulo (uAngMax)
 * medido para a sobra do footprint no eixo profundo — as garras do rafale
 * (`uFlare`) ainda aceleram tudo, só que batem no teto em vez de repisar o
 * corpo inteiro.
 */
const SHELL_SPIN = [
  { twist: 0.8, spin: 0.9, sway: 0.0, angMax: 0.0, noise: 1.2 }, // Nv.1 = como foi aprovado
  { twist: 0.16, spin: 0.0, sway: 0.3, angMax: 0.75, noise: 0.9 },
  { twist: 0.1, spin: 0.0, sway: 0.22, angMax: 0.55, noise: 0.8 }, // asas largas: varredura curta
  { twist: 0.16, spin: 0.0, sway: 0.3, angMax: 0.8, noise: 0.9 },
  { twist: 0.16, spin: 0.0, sway: 0.32, angMax: 0.8, noise: 0.9 },
];

/**
 * ENVOLTÓRIO DE VENTO: casca da mesma malha folgada ao longo do EIXO do corpo
 * (a lição do fogo vale em dobro aqui — o wind tem barbatanas finas) vestida
 * com o WIND_FRAG LITERAL do figurino. O vertex reescreve a fervura do
 * WIND_VERT trocando o deslocamento pela NORMAL pelo eixo suavizado, e mantém
 * torção + rotação diferencial + balanço da coluna. Os varying batem com o
 * WIND_FRAG (vU/vAng/vN1/vG/vNrm/vView), então o fragment — fitas, nuvem de
 * tempestade, mesclagem e anti-NaN — é o mesmo. Os marcos (base do eixo,
 * altura do corpo, folga) vêm da bbox de CADA malha via uniforms — a mesma
 * fervura vale para a bolota Nv.1 e para o dragão Nv.5.
 */
const SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uSeed;
uniform float uHurt;
uniform float uFlare;
uniform float uTwist;
uniform float uSpin;
uniform float uSway;
uniform float uAngMax;
uniform float uNoiseTw;
uniform float uBend;
uniform float uPhase;
uniform float uYMin;
uniform float uModelH;
uniform float uBelly;
uniform float uHug;
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
  vU = uv.y;
  vAng = atan(pos.z, pos.x);

  // altura NO MODELO (caixa de cada malha): tudo cresce com a altura, a base
  // fica mais firme — o mesmo gradiente do WIND_VERT (gfrac), agora na régua
  // da bbox desta malha (uYMin..uYMin+uModelH)
  float gh = pos.y - uYMin;
  float gfrac = clamp(gh / max(0.001, uModelH), 0.0, 1.0);
  vG = gfrac;

  // ruído anisotrópico subindo pela superfície (idêntico ao WIND_VERT)
  vec3 q = vec3(pos.x * 2.4, pos.y * 1.4 - uTime * 2.1, pos.z * 2.4) + uSeed + aSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.2 + vec3(3.1, -uTime * 1.6, 1.7) + 11.0);
  vN1 = mix(n1, n2, 0.3);

  float amp = uAmp * (1.0 + uHurt * 0.35) * (1.0 + uFlare * 0.35);
  // folga + turbulência no EIXO do corpo (não na normal): nas barbatanas
  // finas as duas faces empurriam para lados opostos e dobravam na quina
  // (as "rachaduras" do invólucro do fogo) — no eixo as faces andam juntas
  vec3 away = pos - vec3(0.0, uBelly, 0.0); // umbigo do corpo (centro da nuvem)
  vec3 axis = normalize(vec3(away.x, away.y * 0.3, away.z) + 1e-5);
  pos += axis * (uHug + ((n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9) * amp);

  // torção + rotação com ruído dentro do ângulo (espiral bamba). Nv.1 gira de
  // verdade (uSpin·uTime); nos níveis de asas o giro vira varredura OSCILANTE
  // (uSway·sin) e o ângulo total bate no teto uAngMax (0 = sem teto) — a sobra
  // do footprint autoral é o orçamento do varrimento
  float ang =
    uTwist * gh * (1.0 + uFlare * 0.6) +
    (uSpin * uTime + uSway * sin(uTime * 0.9 + uPhase)) * (1.0 - 0.4 * gfrac) * (1.0 + uFlare * 0.9) +
    (fbm(q * 0.8 + 5.0) - 0.5) * uNoiseTw;
  if (uAngMax > 0.0) ang = clamp(ang, -uAngMax, uAngMax);
  float c = cos(ang);
  float s = sin(ang);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  vNrm = normalMatrix * normal;

  // a coluna balança como um funil solto (mesma fase do corpo — uPhase)
  float sway = uBend * gfrac * gfrac * (1.0 + uFlare * 0.8);
  pos.x += sin(uTime * 0.85 + uPhase) * sway;
  pos.z += cos(uTime * 0.67 + uPhase * 1.7) * sway * 0.8;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const tmpWorld = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

/**
 * Marcos do corpo em PORCENTAGEM da altura da malha — a régua que o sopro Nv.1
 * consagrou (bbox y −1,00..+0,98). Cada modelo tem a própria caixa (a coruja
 * Nv.4 é larga e baixa; o dragão Nv.5 cresce de novo), então esqueleto, pesos
 * de pele e shaders NASCEM DA BBOX de cada malha nesta mesma régua: cauda do
 * sopro, coração da nuvem, topo da cara e raiz/ponta das barbatanas — e o
 * invólucro/motes entendem "embaixo/topo" por essa régua.
 */
const BODY_FRAC = {
  /** juntas: cauda do funil, coração da nuvem, topo da cara, raiz/ponta das barbatanas */
  joints: [0.001, 0.431, 0.6586, 0.7193, 0.871],
  /** faixas dos pesos de pele (rampas de `ensureSkin`) */
  tRootSpine: [0.1528, 0.4057],
  tSpineHead: [0.4057, 0.6485],
  tHeadFin: [0.6485, 0.7294],
  tFinRamp: [0.7598, 0.9115],
  /** umbigo do corpo (centro do eixo do invólucro) */
  belly: 0.4545,
  /** barbatanas/ asas de vento: onde começam as partes livres (rosto abaixo, sempre firme)
   *  e qual a rampa até as pontas — para o shader de vida do corpo */
  finStart: 0.6586,
  finSpan: 0.3288,
};

/**
 * Esqueleto em código (o GLB não traz nenhum): `root → spine → head → fin0 →
 * fin1`. Juntas calcadas nos marcos do MODELO (frações da bbox,
 * `BODY_FRAC.joints`).
 */

/**
 * Pesos de pele POR FAIXA DE Y (2 influências por vértice, rampas suaves —
 * sem costuras duras). Uma vez por geometria (`userData` guarda o pino); as
 * instâncias compartilham os atributos, cada uma anima o PRÓPRIO esqueleto.
 * Abaixo da rampa Spine→Head o rosto nunca herda das barbatanas (os olhos
 * ficam firmes). As faixas vêm da bbox da malha (`BODY_FRAC.t*`). Carimba
 * também o `aSeed` que o WIND_FRAG/SHELL exigem (lição WebKit: bound curto =
 * o WebKit não desenha).
 */
function ensureSkin(
  geo: THREE.BufferGeometry,
  seed: number,
  t: {
    rootSpine: readonly [number, number];
    spineHead: readonly [number, number];
    headFin: readonly [number, number];
    finRamp: readonly [number, number];
  },
): void {
  if (!geo.userData.windSeed) {
    setSeedAttribute(geo, seed);
    geo.userData.windSeed = true;
  }
  if (geo.userData.zephyrSkin) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  const band = (y: number, a: number, b: number) => THREE.MathUtils.clamp((y - a) / (b - a), 0, 1);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    let a: number, b: number, w: number;
    if (y < t.spineHead[0]) {
      a = 0; b = 1; w = band(y, t.rootSpine[0], t.rootSpine[1]); // Root → Spine
    } else if (y < t.headFin[0]) {
      a = 1; b = 2; w = band(y, t.spineHead[0], t.spineHead[1]); // Spine → Head
    } else if (y < t.headFin[1]) {
      a = 2; b = 3; w = band(y, t.headFin[0], t.headFin[1]); // Head → Fin0
    } else {
      a = 3; b = 4; w = band(y, t.finRamp[0], t.finRamp[1]); // Fin0 → Fin1 (ponta = 1.0)
    }
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    wgt[i * 4] = 1 - w;
    wgt[i * 4 + 1] = w;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.zephyrSkin = true;
}

/**
 * Dispatcher do Zéfiro: Nv.1..5 = a malha importada da forma (sopro → dragão
 * dos ventos, uma por nível); enquanto ela desce (demanda, uma vez por forma),
 * o SELO PROCEDURAL DE INVOCÇÃO segura o buraco — o figurino de vendaval
 * antigo nunca mais aparece no campo (a lição da troca: o monstro velho
 * pipocando antes da malha desvaloriza o print; o `WindRig` antigo ficou só
 * doador de efeitos).
 */
export function ZephyrRig(props: WindRigProps) {
  const level = clampLevel(props.level);
  const url = windUrlFor(level);
  return (
    <Suspense fallback={<SummonSigil species="zephyr" level={level} url={url} seed={props.seed} />}>
      <SummonReveal species="zephyr" level={level} seed={props.seed}>
        <WindMeshRig {...props} level={level} />
      </SummonReveal>
    </Suspense>
  );
}

/** motes do funil: poeira, folhas e luz subindo em espiral (o MATE do WindRig) */
function makeMoteGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uR1;
uniform float uR2;
uniform float uSpin;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.26 + 0.46 * aRand.z;
  float prog = fract(uTime * speed * 0.6 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * uSpin * (1.35 - 0.55 * prog) + prog * 7.5;
  float r = mix(uR1, uR2, prog * prog) * (0.5 + 0.6 * aRand.z);
  vec3 p = vec3(cos(ang) * r, prog * uHeight, sin(ang) * r);
  p.x += sin(uTime * 3.1 + aRand.x * 9.0 + prog * 8.0) * 0.06;
  p.z += cos(uTime * 2.7 + aRand.y * 7.0 + prog * 6.0) * 0.06;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (4.4 * (1.0 - prog) + 1.5) * (0.65 + 0.6 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // vivem até o topo do funil (o rastro de detritos é a marca do vendaval)
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.72, 1.0, prog)) * uAlpha;
  vec3 dust = vec3(0.7, 0.65, 0.53);
  vC = mix(mix(dust, vec3(0.62, 0.85, 0.98), aRand.z), vec3(1.0, 1.0, 1.0), prog) * 1.05;
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.1, length(d));
  if (!(m > 0.001 && vA > 0.001)) discard; // anti-NaN: aditivo + NaN = mancha preta via bloom
  gl_FragColor = vec4(vC, m * vA * 0.8);
}
`;

/** malha pura da forma — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function WindMeshRig({
  seed,
  unitId,
  emberScale = 1,
  demoAttackSeq,
  smoke,
  level = LEVEL_1,
}: WindRigProps) {
  const url = windUrlFor(level);
  const { scene } = readModel(url);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/flicker não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${url} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    weldDispNormals(geo); // solda para as fitas de vento não rasgarem nas arestas duras
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    const at = (f: number) => bb.min.y + f * spanY; // fração da caixa → metro do modelo
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      jointY: BODY_FRAC.joints.map(at),
      yMin: bb.min.y,
      spanY,
      bellyY: at(BODY_FRAC.belly),
      finY0: at(BODY_FRAC.finStart),
      finSpan: BODY_FRAC.finSpan * spanY,
      skin: {
        rootSpine: BODY_FRAC.tRootSpine.map(at) as [number, number],
        spineHead: BODY_FRAC.tSpineHead.map(at) as [number, number],
        headFin: BODY_FRAC.tHeadFin.map(at) as [number, number],
        finRamp: BODY_FRAC.tFinRamp.map(at) as [number, number],
      },
    };
  }, [scene]);

  // encaixe autoral: altura = formTop da forma, o corpo centralizado no eixo,
  // a BASE flutuando à altura do figurino do nível (o sopro antigo FLUTUAVA —
  // só o Nv.5 tornado pisava o chão); o offset compensa a rotação de rumo
  // (matriz T·R·S). TETO DE LARGURA: a malha também respeita o buraco — o
  // invólucro autoral da FORMA (`footprintOf`, assinado na tabela de
  // `data/footprints.ts`) é o contrato: encaixo (mesh + abraço de vento) ≤
  // entrada, nos dois eixos (a coruja Nv.4 abre as asas — é ela que manda no
  // enquadramento da família, não o contrário)
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('zephyr', level as MonsterLevel);
    const hug = SHELL_HUG * (SPAN_NV1 / src.spanY); // abraço proporcional ao tamanho
    // meias-extensões NA ORDEM DO RUMO — AABB EXATA da caixa girada (round 7,
    // a mesma fórmula do fogo/água): half = hx·|cos| + hz·|sin| nos eixos do
    // mundo. O vento encara o +Z em todas as formas (yaw 0), então o resultado
    // é o mesmo de antes — mas a fórmula é o contrato das quatro famílias
    const yaw = yawFor(level);
    const hx = Math.max(-bb.min.x, bb.max.x);
    const hz = Math.max(-bb.min.z, bb.max.z);
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const halfWide = hx * ca + hz * sa; // o que o buraco VÊ de esq/dir
    const halfAlong = hx * sa + hz * ca; // e de trás/frente
    const sW = Math.min(foot.x / (halfWide + hug), foot.z / (halfAlong + hug));
    const s = Math.min(TOP_BY_LEVEL[level - 1] / src.spanY, sW);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(yaw) + cz * Math.sin(yaw));
    const pz = cx * Math.sin(yaw) - cz * Math.cos(yaw);
    return { s, pos: [px, FLOAT_Y[level - 1] - bb.min.y * s, pz] as [number, number, number] };
  }, [src, level]);

  // material por instância: textura do GLB + brasa FRIA emissiva + fitas de
  // vento correndo para cima no vértice (o MESMO ruído dos shaders da casa)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.85,
      metalness: 0,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.7,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.045 };
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uYMin = { value: src.yMin };
      sh.uniforms.uSpanY = { value: src.spanY };
      sh.uniforms.uFinY0 = { value: src.finY0 };
      sh.uniforms.uFinSpan = { value: src.finSpan };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nuniform float uYMin;\nuniform float uSpanY;\nuniform float uFinY0;\nuniform float uFinSpan;\nvarying float vRibbon;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // VENTO NA MALHA (o gesto do figurino, não "gelatina"): grão das
          // fitas CORRENDO PARA CIMA (análogo da fervura que sobe no fogo) e
          // as barbatanas/ acréscimos acima da raiz (uFinY0, marco da bbox
          // desta malha) batendo com FASE PRÓPRIA (o mesmo critério de fase
          // azimutal da crina do fogo). Abaixo da raiz é sólido: rosto/olhos
          // nunca tremem.
          float h = clamp((transformed.y - uYMin) / max(uSpanY, 1e-4), 0.0, 1.0);
          float fin = clamp((transformed.y - uFinY0) / max(uFinSpan, 1e-4), 0.0, 1.0);
          float w = fin * fin; // raiz plantada na cabeça, barbatana livre
          float ph = atan(transformed.z, transformed.x) * 1.3 + uFSeed;
          // batida das barbatanas (mollejo lateral — dois harmônicos)
          transformed.x += (sin(uFT * 4.3 + ph) * 0.6 + sin(uFT * 8.9 + ph * 2.2) * 0.3) * uFA * 1.8 * w;
          transformed.z += (cos(uFT * 3.9 + ph * 1.4) * 0.5 + sin(uFT * 7.7 + ph * 0.7) * 0.25) * uFA * 1.8 * w;
          // fitas de vento subindo pela superfície (grão fino, fluxo vertical;
          // o corpo do vento ferve MENOS que o do fogo — é seda, não plasma)
          float fn = fbm(transformed * 2.6 + vec3(0.0, -uFT * 2.1, 0.0) + uFSeed);
          // as fitas saem pela NORMAL SOLDADEIRA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): duplicatas do mesmo ponto nas arestas duras têm
          // normais diferentes e pela objectNormal a malha rasgava (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uFA * (0.8 + 1.4 * h);
          // o emissivo acende nas FITAS que passam (mesmo traço do WIND_FRAG:
          // faixa senoidal viajante em azimute × altura), contido — nuvem de
          // tempestade, não bola de luz
          float ribbon = 0.5 + 0.5 * sin(ph * 2.6 + transformed.y * 13.0 - uFT * 5.2);
          vRibbon = smoothstep(0.62, 0.95, ribbon);`,
        );
      sh.fragmentShader =
        'varying float vRibbon;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 + 0.5 * vRibbon;`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // ESQUELETO POR INSTÂNCIA: a geometria (com os pesos de `ensureSkin`) é
  // compartilhada, mas os ossos e a animação são privados de cada unidade —
  // dois Zéfiros em cena nunca dançam sincronizados.
  const rig = useMemo(() => {
    ensureSkin(src.geo, seed, src.skin);
    const mk = (name: string, y: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, y, 0);
      return b;
    };
    // juntas absolutas (marcos da bbox) viram offsets locais na cadeia
    const jy = src.jointY;
    const root = mk('root', jy[0]);
    const spine = mk('spine', jy[1] - jy[0]);
    const head = mk('head', jy[2] - jy[1]);
    const fin0 = mk('fin0', jy[3] - jy[2]);
    const fin1 = mk('fin1', jy[4] - jy[3]);
    root.add(spine);
    spine.add(head);
    head.add(fin0);
    fin0.add(fin1);
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, spine, head, fin0, fin1]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // barbatanas + shader viajam além da esfera da malha
    return { skinned, bones: { root, spine, head, fin0, fin1 } };
  }, [src, body, seed]);

  // motes subindo em espiral pelo funil + poeira fria: o mesmo idioma visual
  // do WindRig (quanto maior o vendaval, mais motes e mais largo o funil)
  const motes = useMemo(
    () => ({
      geo: makeMoteGeo(10 + level * 9),
      mat: new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: TOP_BY_LEVEL[level - 1] },
          uR1: { value: 0.15 + 0.05 * level },
          uR2: { value: 0.55 + 0.16 * level },
          uSpin: { value: 1.1 + 0.4 * level },
        },
      }),
    }),
    [emberScale, level],
  );

  // INVOLTÓRIO: a casca de vento do antigo (WIND_FRAG literal; eixo em vez de
  // normal no vertex) por cima da textura — mesclagem NORMAL como o figurino.
  // Os uniforms de caixa (base, altura, umbigo, folga) são PROPORCIONAIS à
  // malha (SPAN_NV1 / spanY): a casca do dragão Nv.5 ferve nas MESMAS medidas
  // de mundo do sopro — senão o ruído inflaria 20% da barriga dele e vazaria
  // do buraco.
  const shellMat = useMemo(() => {
    const spin = SHELL_SPIN[level - 1];
    return new THREE.ShaderMaterial({
      vertexShader: SHELL_VERT,
      fragmentShader: WIND_FRAG,
      transparent: true,
      blending: THREE.NormalBlending, // nuvem translúcida: nada estoura
      depthWrite: false,
      side: THREE.DoubleSide, // a parede de dentro do vórtice é mais fraca
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: seed },
        uPhase: { value: seed },
        uAmp: { value: 0.1 * (SPAN_NV1 / src.spanY) },
        uHug: { value: SHELL_HUG * (SPAN_NV1 / src.spanY) },
        uTwist: { value: spin.twist },
        uSpin: { value: spin.spin }, // LENTO de propósito (Nv.1): varredura dentro da pegada
        uSway: { value: spin.sway }, // Nv.2..5: o véu BALANÇA, não repisa o corpo
        uAngMax: { value: spin.angMax },
        uNoiseTw: { value: spin.noise },
        uBend: { value: 0.02 + 0.012 * level },
        uFlare: { value: 0 },
        uHurt: { value: 0 },
        uYOff: { value: 0 },
        uYMin: { value: src.yMin },
        uModelH: { value: src.spanY },
        uBelly: { value: src.bellyY },
        uAlpha: { value: 1 },
        // o véu é mais denso que o do fogo (mesclagem NORMAL + dupla face):
        // 0,62 deixa a cara ler ATRAVÉS do vento; suba se quiser mais nuvem
        uAlphaMul: { value: 0.62 },
        uSoft: { value: 1 },
        uCold: { value: new THREE.Color(WIND_ROLE_LOOK.body!.cold) },
        uMid: { value: new THREE.Color(WIND_ROLE_LOOK.body!.mid) },
        uHot: { value: new THREE.Color(WIND_ROLE_LOOK.body!.hot) },
      },
    });
  }, [seed, src, level]);

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      rig.skinned.skeleton?.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    },
    [body, shellMat, rig, motes],
  );

  const animRef = useRef<THREE.Group>(null!);
  const shellRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const dustAcc = useRef(0);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  useFrame((_, dtRaw) => {
    const g = animRef.current;
    const glow = glowRef.current;
    if (!g || !glow) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;
    const top = TOP_BY_LEVEL[level - 1];
    const jy = src.jointY;
    const spin = SHELL_SPIN[level - 1];

    // estado da unidade no motor — os mesmos canais do WindRig
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let dying = 0;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
          dying = 1 - alpha;
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > WIND_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // ---- DANÇA DO VENDAVAL nos ossos: a FÓRMULA EXATA do WindRig mora no
    // osso SPINE (respiração do funil + sucção da inalação + expansão do
    // release), a cabeça ATRASA o lean e as barbatanas são amostradas NO
    // PASSADO — o arraste que escala de grupo nenhum faz ----
    const pulse =
      Math.sin(t * 1.35 + seed) * 0.6 + Math.sin(t * 2.7 + 2.2 + seed * 0.4) * 0.4;
    const surge = Math.max(0, Math.sin(t * 0.7 + seed) * 1.4 - 0.7) * 0.12;
    const breathe = 1 + pulse * 0.028 + pose.suck * -0.06 + pose.flare * 0.03;
    const hpDip = 0.78 + 0.22 * hpFrac;
    const wilt = dying * 0.9; // morte: o funil se desmancha
    const lagA = attackPose(sinceAttack - 0.07);
    const lagB = attackPose(sinceAttack - 0.14);
    const b = rig.bones;
    b.spine.scale.set(
      breathe * (1 - wilt * 0.4),
      (1 + pulse * 0.03 + pose.flare * 0.07 + pose.suck * 0.05) * hpDip * (1 - wilt * 0.55),
      breathe * (1 - wilt * 0.4),
    );
    b.spine.rotation.z = Math.sin(t * 0.9 + seed) * 0.045 + pose.lean * 0.25;
    b.spine.rotation.x = Math.sin(t * 1.1 + seed * 0.8) * 0.03 + pose.lean * 0.9;
    // o sopro FLUTUA (FLOAT_Y + bob + surge do WindRig) — o repouso do osso
    // entra na conta (lição do root do ignis)
    b.root.position.y = jy[0] + Math.sin(t * 1.6 + seed) * 0.11 + surge * 0.6;
    b.head.rotation.x =
      Math.sin(t * 1.3 + seed * 0.6) * 0.05 + pose.lean * 0.45 - hurt * 0.15 + wilt * 0.5;
    b.head.rotation.z = Math.sin(t * 1.1 + seed * 0.5) * 0.04;
    // barbatanas arrastam atrás do funil e ESCANCARAM no release (amostradas
    // 70/140 ms no passado — o atraso do tecido de vento)
    b.fin0.rotation.x = lagA.lean * 0.45 + lagA.swing * 0.22 + Math.sin(t * 1.5 + seed) * 0.05 + wilt * 0.5;
    b.fin0.rotation.z = Math.sin(t * 1.25 + seed * 0.7) * 0.06;
    b.fin1.rotation.x = lagB.lean * 0.3 + lagB.swing * 0.5 + Math.sin(t * 1.9 + seed * 1.4) * 0.08 + wilt * 0.7;
    b.fin1.rotation.z = Math.sin(t * 1.4 + seed * 0.9) * 0.09;
    b.fin1.scale.y = (1 + lagA.flare * 0.18 + pulse * 0.04) * (1 - wilt * 0.4);
    // giro lento do corpo inteiro no idle (o vendaval respira girando — o
    // WindRig balança o y do grupo; a rotação DE VELOCIDADE é do invólucro)
    g.rotation.y = Math.sin(t * 0.35 + seed * 0.5) * 0.16;
    g.position.z = pose.stepZ;

    // o invólucro cola no beat do SPINE (respiração + lean) — skinning aproximado
    const env = shellRef.current;
    if (env) {
      env.scale.set(b.spine.scale.x, b.spine.scale.y, b.spine.scale.z);
      env.rotation.set(b.spine.rotation.x, 0, b.spine.rotation.z);
    }
    // fervor do vento (o MESMO ampMul/spinBoost do WindRig): HP/fraca ferve
    // menos, estouro acelera torção, morrer desmancha o funil
    const ampMul =
      (0.7 + 0.3 * hpFrac) * (1 + pose.flare * 0.45) * (1 + hurt * 0.35) * (1 + dying * 0.9);
    const spinBoost = 1 + pose.flare * 1.6 + dying * 1.4;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uFlare.value = pose.flare;
    shellMat.uniforms.uAmp.value = 0.1 * (SPAN_NV1 / src.spanY) * ampMul;
    shellMat.uniforms.uSpin.value = spin.spin * spinBoost;
    shellMat.uniforms.uSway.value = spin.sway * (1 + pose.flare * 0.8) * (1 + dying * 1.2);
    shellMat.uniforms.uBend.value = (0.02 + 0.012 * level) * (1 + dying * 2.2);
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.75 + pulse * 0.08 + pose.flare * 0.2) * alpha);

    // ---- vida no material do corpo: fitas + brasa fria (fervor na MESMA
    // medida de mundo em qualquer malha: SPAN_NV1 / spanY) ----
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      sh.uniforms.uFA.value = 0.045 * (SPAN_NV1 / src.spanY) * ampMul;
    }
    body.emissiveIntensity = Math.max(
      0,
      (0.7 + pulse * 0.12 + pose.flare * 0.5 + hurt * 0.8) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.7 + pose.flare * 0.25));

    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;

    // ---- POEIRA sugada pelo funil (o canal de poeira FRIA do WindRig;
    // quanto mais alto o vendaval, mais poeira) ----
    if (smoke && alpha > 0.25) {
      dustAcc.current += dt * (1.1 + 2.1 * level);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 4) {
        dustAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.5 + 0.16 * level),
            top * (0.2 + Math.random() * 0.6),
            (Math.random() - 0.5) * (0.5 + 0.16 * level),
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + 0.016 * level,
          heat: 0.06 + Math.random() * 0.14, // poeira fria, não brasa
          life: 0.85 + 0.09 * level,
          lifeVar: 0.45,
          jitter: 0.2,
          rise: 0.3 + 0.05 * level,
          drag: 2.9,
        });
      }
      if (dustAcc.current > 4) dustAcc.current = 4;
    }

    // ---- clarão frio da tempestade (carrega no arremesso como o WindRig;
    // forma maior, clarão maior — a mesma escada do procedural) ----
    const s2 = Math.max(
      0.8,
      1.5 + level * 0.28 + pulse * 0.25 + hurt * 0.4 + pose.flare * 0.7,
    );
    glow.scale.setScalar(s2);
    glow.position.y = top * 0.52;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.18 + level * 0.02 + pulse * 0.05 + hurt * 0.16 + pose.flare * 0.24) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={yawFor(level)} scale={fit.s}>
        <primitive object={rig.skinned} />
        {/* pivô no joelho do spine: a casca respira/inclina junto do corpo */}
        <group ref={shellRef} position={[0, src.jointY[1], 0]}>
          <mesh
            geometry={src.geo}
            material={shellMat}
            position={[0, -src.jointY[1], 0]}
            frustumCulled={false}
          />
        </group>
      </group>
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.72}>
        <spriteMaterial
          map={circleTexture()}
          color="#7fc4ee"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}
