import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RAY_URL } from './modelUrls';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, getGeometry, setSeedAttribute, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import {
  attackPose,
  BURST_CAP,
  type LightningRigProps,
  LIGHTNING_ATTACK_WINDOW,
  LIGHTNING_WINDUP,
  makeSparkGeo,
  makeStarburstGeo,
  SPARK_FRAG,
  SPARK_VERT,
} from './LightningRig';
import { makeArcMaterial } from './lightningShaders';
import { readModel } from './modelPreload';
import { TEAM_TINT } from './stoneShaders';
import { SummonReveal, SummonSigil } from './SummonFX';

/**
 * RAIO DE MALHA 3D IMPORTADA — O ESPÍRITO DA TROVOADA (Nv.6): a forma da
 * espécie vira um mesh texturizado criado fora do jogo
 * (`src/models/ray/ray.glb` — 29.619 vértices, UMA malha com UMA textura;
 * gerado no Hunyuan3D via trimesh, SEM ossos e SEM animação no arquivo): o
 * orbe dourado de cara irada enrolado nas fitas do vendaval, com os relâmpagos
 * já pintados/soldados na casca. Enquanto a malha desce (demanda), o SELO DE
 * INVOCÇÃO (`SummonFX`) segura o buraco — o dodeca elétrico antigo do
 * `LightningRig` nunca mais pipoca no campo; ele ficou só doador de efeitos e
 * coreografia — e TODOS os efeitos da trovoada continuam vivos por cima da
 * malha, no mesmo idioma dos quatro puros da linha "modelos 3D":
 *
 *  1. VIDA DA CASCA no material da malha: `onBeforeCompile` com o ruído de
 *     `flameShaders.ts` — relevo de faísca correndo pela superfície (na normal
 *     SOLDADA, `aDispNrm`, lição das rachaduras do golé) e as ALETAS DE
 *     DESCARGA do shader antigo, que eriçam na carga do disparo;
 *  2. INVOLTÓRIO ELÉTRICO (o antigo abraçando o novo): uma casca da MESMA
 *     malha, inflada pelo `SHELL_HUG`, vestida com as NERVURAS ELÉTRICAS e os
 *     estalos instantâneos do shell antigo (nervuras correntio + snap duro em
 *     patamar + aro da equipe), aditiva e translúcida por cima da textura;
 *  3. um ENXAME de correntes orbitando o corpo (sete toros com o material de
 *     arco, cada um num plano/sentido/frequência de pulso — girando,
 *     precessando e estalando rápido, todos por dentro do anel de chão
 *     externo), as faíscas que ESTALAM
 *     orbitando o núcleo, o pool de rajadas exalando do peito, a aura de
 *     estilhaços, os anéis de chão e o clarão do release — tudo religado no
 *     CORE da malha (a bolota dourada no meio das fitas).
 *
 * A coreografia é a MESMA timeline do motor (janela 0,42 s: carga → descarga)
 * lida de `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o mesmo
 * show. Sem ossos aqui: a trovoada nunca teve esqueleto procedural (o rig da
 * casa animava o GRUPO raiz — flutuação, respiração elétrica, estufa da carga)
 * e a malha herda esse grupo exatamente como as parts herdavam.
 *
 * ENCAIXE: o topo autoral da forma (3,8) daria escala 1,93 na caixa da malha
 * (y −0,998..+0,971) e a trovoada viraria a bola de relâmpago do tamanho do
 * buraco que o `SLOT_FIT_MAX` sempre quis evitar — o TETO da linha de
 * `data/footprints.ts` manda (mesmo precedente do Nv.1 do golé): a malha
 * encosta em `MEDIDO.raio` com o abraço do invólucro, e os efeitos (arcos,
 * anéis de chão, aura) moram dentro dessa mesma linha. O GLB encara o inimigo
 * no +Z (rumo 0 — os olhos irados conferidos no viewer de 4 vistas,
 * `qa/mesh-viewer-shot.mjs`); o `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const RAIO_DEF = getSpecies('raio');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(RAIO_DEF, RAIO_DEF.levelMin);


/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (`qa/mesh-viewer-shot.mjs`, 17/nov) mostrou a CARA IRADA no +Z
 * — como as dez malhas dos puros. Se um GLB substituto vier virado, vire aqui.
 */
export const RAY_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): o deslocamento da casca
 * elétrica para fora. Na régua da caixa da trovoada (spanY 1,97 ≈ a faísca do
 * fogo) vale o MESMO 0,13 do invólucro de chama — e a sonda de invólucro lê a
 * caixa CPU e NÃO vê essa infla, então ela mora na linha da tabela.
 */
const SHELL_HUG = 0.13;

/**
 * VERTEX da FAÍSCA-POP: cada partícula (posição = direção unitária do estalo,
 * `aRand` = sorteios por partícula) roda num ciclo próprio e só vive a janela
 * do pop — abre num estalo, salta do orbe para fora e morre desbotando; o
 * resto do tempo vA=0 (o fragmento descarta). `uCharge` acelera e engorda o
 * estalo na hora de carregar a descarga. A janela ~0,15 s e o flicker de
 * hash são a receita do "aparece e some" pedido.
 */
const CRACK_VERT = /* glsl */ `
attribute vec3 aRand; // x: fase do ciclo, y: tint/jitter, z: velocidade/tamanho
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uR0;
uniform float uR1;
varying float vA;
varying vec3 vC;
void main() {
  float cyc = uTime * (1.8 + 3.2 * aRand.z) * (1.0 + uCharge * 0.8) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.26 + 0.14 * aRand.y; // janela do pop (quanto do ciclo a faísca vive)
  float off = step(w, k); // fora da janela: apagada
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.35 + 0.65 * step(0.3, fract(sin(floor(cyc * (36.0 + 30.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.4 + 3.4 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  vec3 tint = mix(vec3(1.0, 0.86, 0.38), vec3(0.45, 0.78, 1.0), step(0.5, aRand.y));
  vC = mix(tint, vec3(1.0, 0.98, 0.9), env * 0.55);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * FICHA DO ENXAME DE ARCOS (um por corrente orbitante): `r` é o raio do toro
 * em frações do encaixe `s` (o maior, 0,84, mais o tubo e o pulso de 1,12×
 * fecha em ~s×0,98 — com folga por dentro do anel de chão externo, que é a
 * linha VISÍVEL do buraco; a sonda também pega os transientes de exalação no
 * pico, então a régua precisa sobra); `y` desloca o plano da corrente do
 * núcleo para o enxame não virar um só toro; `tilt` é a inclinação base (x,z)
 * que a precessão caótica balança ±0,4; `wf` é a frequência do pulso (escala
 * e brilho); `spin` é a velocidade angular (rad/s, sinal = sentido); `flow`
 * é a corrente do traço no shader (sinal = para onde a fagulha corre); `cool`
 * é o quanto a corrente é azul (0 = ouro puro); `a` é o brilho base.
 */
const ARC_RINGS = [
  { r: 0.55, tube: 0.038, y: -0.14, tilt: [0.5, 0.4], wf: 7.2, spin: 2.6, jitter: 0.22, dash: 22, flow: 11, cool: 0.85, a: 0.95 },
  { r: 0.66, tube: 0.03, y: 0.08, tilt: [1.55, -0.3], wf: 5.4, spin: -3.1, jitter: 0.26, dash: 16, flow: -9, cool: 0.35, a: 1 },
  { r: 0.73, tube: 0.044, y: -0.05, tilt: [1.0, 1.2], wf: 8.8, spin: 3.6, jitter: 0.18, dash: 30, flow: 13, cool: 0.95, a: 0.85 },
  { r: 0.79, tube: 0.026, y: 0.12, tilt: [0.2, -1.1], wf: 6.1, spin: -2.4, jitter: 0.24, dash: 20, flow: -15, cool: 0.5, a: 1 },
  { r: 0.84, tube: 0.034, y: 0, tilt: [1.35, 0.65], wf: 9.6, spin: 4.2, jitter: 0.2, dash: 34, flow: 16, cool: 0.8, a: 0.8 },
  { r: 0.6, tube: 0.048, y: 0.16, tilt: [0.85, -1.6], wf: 6.8, spin: -2.9, jitter: 0.28, dash: 14, flow: -10, cool: 0.25, a: 0.9 },
  { r: 0.77, tube: 0.022, y: -0.1, tilt: [1.9, 0.15], wf: 7.8, spin: 3.3, jitter: 0.16, dash: 26, flow: 12, cool: 0.9, a: 0.85 },
];

/**
 * Núcleo do orbe em PORCENTAGEM da altura da malha (a bolota dourada no meio
 * das fitas fica quase no centro da caixa — o rosto irado um dedo acima). É a
 * régua de CORE_Y: clarões, rajadas, faíscas e aura nascem dessa altura.
 */
const CORE_FRAC = 0.5;

/** brasa base do emissivo (mesma família do núcleo dourado) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#ffcf4d');
const EMISSIVE_FLASH = new THREE.Color('#fff6d8');

/**
 * INVOLTÓRIO ELÉTRICO (o antigo abraçando o novo): a casca da MESMA malha,
 * deslocada para fora com o `uHug` + fervura nervosa em PATAMAR (ruído de 2
 * níveis — eletricidade risca, não mancha, o mesmo truque do shell antigo),
 * com as ALETAS de descarga eriçando na carga. Renderizada aditiva e
 * translúcida por cima da textura: só as NERVURAS, os ESTALOS e o ARO da
 * equipe acendem; o resto do corpo lê pela pintura do GLB.
 */
const SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;
uniform float uHug;
uniform float uCharge;
uniform float uHurt;
varying vec3 vLocal;
varying float vN1;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vLocal = pos + uSeed;
  float n1 = fbm(vLocal * 1.9);
  // fenda dura em patamar: a casca infla em blocos riscados, não em onda
  float k = step(0.5, fnoise(vLocal * 6.0));
  float amp = uAmp * (1.0 + uHurt * 0.3) * (1.0 + uCharge * 0.5);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.1 + (k - 0.5) * 0.8) * amp);
  // aletas de descarga do shell antigo: pontas eriçadas pelo campo, crescem na carga
  float spikes = step(0.5, fnoise(vLocal * 3.4 + vec3(0.0, uTime * 0.7, 0.0) + uSeed));
  pos += nrm * spikes * (0.004 + uCharge * 0.02);
  vN1 = n1;
  vNrm = normalMatrix * nrm;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uVein;
uniform vec3 uCool;
uniform vec3 uCore;
uniform vec3 uTeamColor;
uniform float uTime;
uniform float uSeed;
uniform float uCharge;
uniform float uHurt;
uniform float uAlpha;
varying vec3 vLocal;
varying float vN1;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 vd = normalize(vView);
  // nervuras elétricas: traço duro e estreito correndo pela casca (o shell antigo)
  float vein = fnoise(vLocal * 5.2 + vec3(uTime * 0.9, uTime * 0.5, 0.0) + uSeed);
  float veinMask = smoothstep(0.50, 0.545, vein) * (1.0 - smoothstep(0.56, 0.61, vein));
  float dash = 0.55 + 0.45 * sin(uTime * 26.0 + vLocal.y * 60.0 + uSeed);
  vec3 col = uVein * veinMask * dash * (0.45 + uCharge * 0.75);
  // estalos instantâneos: ilhas duras que acendem e apagam (o snap antigo)
  float snap = step(0.5, fnoise(vLocal * 3.6 + vec3(uTime * 5.5) + uSeed));
  float snapOn = step(0.78, fnoise(vLocal * 1.7 - vec3(uTime * 4.2) + uSeed));
  col += uVein * snap * snapOn * (0.12 + uCharge * 0.4) * 0.5;
  // aro na cor da equipe + aro dourado elétrico + o azul frio da corrente
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uTeamColor * rim * 0.26;
  col += uCore * rim * (0.06 + uCharge * 0.2);
  col += uCool * rim * (0.12 + uCharge * 0.4);
  col = mix(col, vec3(1.0, 0.97, 0.88), uHurt * 0.4); // flash de dano
  float a = uAlpha * (0.45 + 0.4 * vN1) * (1.0 + uCharge * 0.5);
  if (!(a > 0.004)) discard; // discard invertido: NaN nunca escreve (lição WebKit)
  gl_FragColor = vec4(col, min(1.0, a));
}
`;

const tmpDir = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

interface BurstBolt {
  dir: [number, number, number];
  life: number;
  max: number;
  rad: number;
  volley: boolean;
}

/**
 * Dispatcher do Raio: Nv.6 = a malha importada do espírito da trovoada;
 * enquanto ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE
 * INVOCÇÃO segura o buraco — o figurino elétrico antigo nunca mais aparece
 * no campo (a lição da troca: o monstro velho pipocando antes da malha
 * desvaloriza o print; o `LightningRig` antigo ficou só doador de efeitos).
 */
export function LightningRig(props: LightningRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="raio" url={RAY_URL} seed={props.seed} />}>
      <SummonReveal species="raio" seed={props.seed}>
        <RayMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function RayMeshRig({ seed, unitId, emberScale = 1, demoAttackSeq }: LightningRigProps) {
  const { scene } = readModel(RAY_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/charge não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${RAY_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    weldDispNormals(geo); // solda para o relevo de faísca não rasgar nas arestas duras
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o orbe dourado no meio das fitas: a origem de todos os efeitos
      coreY: (bb.min.y + CORE_FRAC * spanY) - bb.min.y, // local na base do rig (base no y 0 local antes do fit)
    };
  }, [scene]);

  // encaixe autoral: o TETO da linha de `MEDIDO` manda (o topo autoral 3,8
  // inflaria a trovoada para fora do buraco — ver o doc no topo); plantada com
  // a base no y 0 local, centro do corpo no eixo do rig; o offset compensa a
  // rotação de rumo (matriz T·R·S) e a AABB é a EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('raio', RAIO_DEF.levelMin as MonsterLevel);
    const yaw = RAY_MODEL_YAW;
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
    return { s, pos: [px, -bb.min.y * s, pz] as [number, number, number] };
  }, [src]);

  // altura local do núcleo da trovoada (o coração dos efeitos): a base da
  // malha já fica plantada no y 0 do rig (o `pos` do fit levanta a base crua
  // até o chão), então o orbe dourado mora na própria porcentagem da caixa
  // escalada — SEM somar `pos[1]` de novo (isso deixava o enxame flutuando
  // acima da cabeça, o erro que a sonda de visual pegou)
  const coreY = src.coreY * fit.s;

  // material por instância: textura do GLB + brasa emissiva + relevo de faísca
  // e aletas de carga via onBeforeCompile (o MESMO ruído de flameShaders.ts)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.6,
      metalness: 0,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.5,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.03 };
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFCharge = { value: 0 };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nuniform float uFCharge;\nvarying float vFlick;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // grão de faísca correndo pela casca INTEIRA: é isso que faz a tinta
          // do GLB parecer plasma, não argila pintada (o corpo do antigo fervia
          // no shader; aqui a tinta ferve menos que o invólucro)
          float fn = fbm(transformed * 3.6 + vec3(0.0, -uFT * 2.6, 0.0) + uFSeed);
          // o grão sai pela NORMAL SOLDADA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): na aresta dura do GLB cada cópia do mesmo ponto
          // sairia para o lado da sua normal própria e abriria as "rachaduras"
          // (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uFA * 2.0;
          // ALETAS DE DESCARGA do shell antigo: ilhas duras em patamar que
          // eriçam na carga do disparo (a trovoada arrepia antes de riscar)
          float fin = step(0.5, fnoise(transformed * 3.4 + vec3(0.0, uFT * 0.7, 0.0) + uFSeed));
          transformed += aDispNrm * fin * (0.004 + uFCharge * 0.02);
          vFlick = fbm(transformed * 5.0 + vec3(uFT * 3.2) + uFSeed);`,
        );
      sh.fragmentShader =
        'uniform float uFCharge;\nvarying float vFlick;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 + uFCharge * 1.4 + 0.35 * max(0.0, vFlick - 0.55);`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // INVOLTÓRIO: a casca elétrica do antigo (shader próprio acima) por cima da
  // textura — um material por unidade
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.045 },
          uHug: { value: SHELL_HUG },
          uSeed: { value: seed },
          uCharge: { value: 0 },
          uHurt: { value: 0 },
          uAlpha: { value: 0.5 },
          uVein: { value: new THREE.Color('#7cc9ff') },
          uCool: { value: new THREE.Color('#3f9dff') },
          uCore: { value: new THREE.Color('#ffcf4d') },
          uTeamColor: { value: new THREE.Color('#c8dcff') },
        },
      }),
    [seed],
  );

  // tint da equipe (o aro do invólucro bate na cor do lado — igual ao rig antigo)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  useEffect(() => {
    (shellMat.uniforms.uTeamColor.value as THREE.Color).set(team);
  }, [shellMat, team]);

  // ---- os efeitos da trovoada, religados no núcleo da malha ----
  const s = fit.s;

  // ENXAME DE ARCOS: sete correntes orbitando o corpo em inclinações e
  // sentidos diferentes, velozes e nervosas — o enxame inteiro (toro na caixa
  // CPU, no pulso máximo de escala) morre POR DENTRO do anel de chão externo:
  // o raio do maior é 0,84×s + tubo, e os 1,12× do pulso+carga fecham em
  // ~s×0,98. O zigue-zague do shader (jitter) é a fervura que só o olho vê —
  // a sonda lê a caixa CPU e pega também os transientes no pico da exalação.
  const ringGeoSeeds = useMemo(
    () =>
      ARC_RINGS.map((c, i) => {
        const g = getGeometry('torus', [c.r * s, c.tube, 6, 26]).clone();
        setSeedAttribute(g, seed + i * 3.3);
        return g;
      }),
    [s, seed],
  );
  const ringMats = useMemo(
    () =>
      ARC_RINGS.map((c, i) =>
        makeArcMaterial({
          gold: i % 2 === 0 ? '#ffd98a' : '#ffc63a',
          white: i % 3 === 0 ? '#dff2ff' : '#fffbe0',
          cool: i % 2 === 0 ? '#38a8ff' : '#7fc4ff',
          coolAmt: c.cool,
          jitter: c.jitter,
          dash: c.dash,
          flow: c.flow,
          seed: seed + i * 3.3,
        }),
      ),
    [seed],
  );

  // faíscas estalando ao redor do núcleo (o MESMO shader de pontos do antigo)
  const sparks = useMemo(
    () => ({
      geo: makeSparkGeo(26),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: coreY - 0.4 * s },
          uY1: { value: coreY + 0.4 * s },
          uR1: { value: s * 0.5 },
          uR2: { value: s * 0.78 },
          uSpin: { value: 3.4 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, coreY, s],
  );

  // FAÍSCAS-POP do núcleo: cada partícula é um estalo que some — num ciclo
  // próprio ela vive ~35% do tempo, saltando do orbe para fora num abrir-e-
  // fechar de olhos (janela de ~0,15 s), o resto do tempo fica apagada. O
  // timing é tudo no shader (nada de bookkeeping por partícula no CPU); a
  // régua do voo mora entre a casca (s×0,34) e por baixo do anel externo
  // (s×0,90), então o pop nunca encosta na linha do buraco.
  const cracks = useMemo(() => {
    const n = 36;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    let st = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
    const rand = () => {
      st = (st * 1664525 + 1013904223) >>> 0;
      return st / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const z = rand() * 2 - 1;
      const az = rand() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - z * z));
      pos[i * 3] = Math.cos(az) * rr;
      pos[i * 3 + 1] = z * 0.9; // levemente achatada: a trovoada é mais larga que alta
      pos[i * 3 + 2] = Math.sin(az) * rr;
      rnd[i * 3] = rand();
      rnd[i * 3 + 1] = rand();
      rnd[i * 3 + 2] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    return {
      geo,
      mat: new THREE.ShaderMaterial({
        vertexShader: CRACK_VERT,
        fragmentShader: SPARK_FRAG, // o mesmo disco macio da faísca orbitante
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uR0: { value: s * 0.34 },
          uR1: { value: s * 0.9 },
        },
      }),
    };
  }, [seed, emberScale, s]);

  // rajadas do núcleo: mini-descargas aditivas exalando do peito para fora
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#ffe98a',
        map: circleTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    return { geo, mats };
  }, []);

  const burstData = useMemo<BurstBolt[]>(
    () =>
      Array.from({ length: BURST_CAP }, () => ({
        dir: [0, 1, 0] as [number, number, number],
        life: 0,
        max: 0.16,
        rad: 1,
        volley: false,
      })),
    [],
  );

  // aura de estilhaços (azul + ouro) no núcleo
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 26, '#28baff'),
      makeStarburstGeo(seed + 7.4, 18, '#ffd34f'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of ringMats) m.dispose();
      for (const g of ringGeoSeeds) g.dispose();
      for (const m of bursts.mats) m.dispose();
      sparks.geo.dispose();
      cracks.geo.dispose();
      cracks.mat.dispose();
      sparks.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, ringMats, ringGeoSeeds, bursts, sparks, cracks, starburstGeos]);

  /** dispara uma rajada do núcleo (volley = salvas do ataque, mais compridas) */
  const spawnBurst = (dir: [number, number, number], volley: boolean): void => {
    let idx = -1;
    let minLife = Infinity;
    for (let i = 0; i < BURST_CAP; i++) {
      const d = burstData[i];
      if (d.life <= 0) {
        idx = i;
        break;
      }
      if (d.life < minLife) {
        minLife = d.life;
        idx = i;
      }
    }
    if (idx < 0) return;
    const d = burstData[idx];
    d.dir = dir;
    d.max = volley ? 0.16 + Math.random() * 0.08 : 0.12 + Math.random() * 0.09;
    d.life = d.max;
    d.rad = 0.8 + Math.random() * 0.6;
    d.volley = volley;
  };

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const flashRef = useRef<THREE.Sprite>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const burstAuraRef = useRef<THREE.Group>(null!);
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const starburstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringRefs = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const burstAcc = useRef(0);
  const strikesDone = useRef(new Set<number>());

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
    let strikeKey = -1;
    let frontZ = -1; // para onde a criatura aponta (jogador ataca para -Z)
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        frontZ = u.side === 'player' ? -1 : 1;
        strikeKey = Math.round(u.lastAttackAt * 10);
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      strikeKey = Math.round(demoT.current * 100);
      if (demoT.current > LIGHTNING_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const releasing =
      sinceAttack >= LIGHTNING_WINDUP * LIGHTNING_ATTACK_WINDOW &&
      sinceAttack <= LIGHTNING_ATTACK_WINDOW;

    // salva de rajadas no instante do disparo (uma por ataque do motor)
    if (releasing && strikeKey >= 0 && !strikesDone.current.has(strikeKey)) {
      strikesDone.current.add(strikeKey);
      if (strikesDone.current.size > 8) strikesDone.current.clear();
      for (let k = 0; k < 3; k++) {
        tmpDir
          .set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.6 + 0.15, frontZ * (0.8 + Math.random() * 0.4))
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], true);
      }
    }

    // exalação contínua do núcleo: rajadas curtas para todos os lados,
    // dobrando de cadência quando ele carrega a descarga
    if (alpha > 0.25) {
      burstAcc.current += dt * (3.2 + pose.charge * 5.4) * (0.7 + 0.3 * hpFrac);
      let guard = 0;
      while (burstAcc.current >= 1 && guard < 3) {
        burstAcc.current -= 1;
        guard++;
        tmpDir
          .set(Math.random() * 2 - 1, Math.random() * 1.4 - 0.4, Math.random() * 2 - 1)
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], false);
      }
      if (burstAcc.current > 3) burstAcc.current = 3;
    }

    // rajadas: crescem do peito para fora, piscam nervosas e apagam
    for (let i = 0; i < BURST_CAP; i++) {
      const mesh = burstRefs.current[i];
      const mat = bursts.mats[i];
      const d = burstData[i];
      if (!mesh) continue;
      if (d.life > 0) {
        d.life -= dt;
        const k = Math.max(0, 1 - d.life / d.max);
        const grow = Math.min(1, k / 0.3);
        const len = (d.volley ? 0.22 : 0.15) * (0.5 + 0.5 * grow) * d.max * 5;
        // nascem DENTRO do orbe e furam as fitas: raio de saída na régua da
        // malha (enxuto: a sonda pega a rajada no pico e o invólucro todo tem
        // que morrer dentro do anel)
        const r0 = s * 0.45 + grow * s * 0.18;
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, coreY + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 61);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad);
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * (d.volley ? 0.7 : 0.8);
        mat.color.set(d.volley ? '#cfeaff' : i % 2 === 0 ? '#ffe98a' : '#a5d8ff');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do invólucro (carga acende nervuras/aletas; morte esvazia)
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = pose.charge + pose.flash * 0.6;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.5 + pose.charge * 0.18 + pose.flash * 0.3) * alpha);

    // uniforms do corpo (relevo + aletas + carga no material da malha)
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number }; uFCharge: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      sh.uniforms.uFA.value = 0.03 * (0.8 + 0.2 * hpFrac) * (1 + pose.flash * 0.6 + hurt * 0.5);
      sh.uniforms.uFCharge.value = pose.charge;
    }
    body.emissiveIntensity = Math.max(
      0,
      (0.5 + pose.charge * 0.9 + pose.flash * 1.2 + hurt * 1.1) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive.copy(EMISSIVE_BASE).lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + pose.flash * 0.3));

    sparks.mat.uniforms.uTime.value = t;
    sparks.mat.uniforms.uAlpha.value = alpha;
    sparks.mat.uniforms.uCharge.value = pose.charge + pose.flash;

    // faíscas-pop do núcleo (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    cracks.mat.uniforms.uTime.value = t;
    cracks.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    cracks.mat.uniforms.uCharge.value = pose.charge + pose.flash * 0.6;

    // ---- corpo: flutuação, respiração elétrica, estufa na carga (o grupo que
    // o rig antigo animava; a malha + o invólucro herdam tudo junto) ----
    const pulse =
      Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.4 + 1.9 + seed * 0.5) * 0.4;
    const breathe = 1 + pulse * 0.018 + pose.swell * 0.06;
    const hpDip = 0.86 + 0.14 * hpFrac;
    const wilt = (1 - alpha) * 0.6; // morte: a trovoada murcha e afunda
    g.scale.set(
      breathe * (1 + wilt * 0.3),
      breathe * hpDip + pose.flash * 0.04 - wilt * 0.45,
      breathe * (1 + wilt * 0.3),
    );
    g.rotation.y = Math.sin(t * 0.5 + seed * 0.7) * 0.25;
    g.rotation.z = Math.sin(t * 0.8 + seed) * 0.02;
    g.rotation.x = pose.swell * -0.03 + wilt * 0.2;
    g.position.z = pose.stepZ;
    g.position.y = -wilt * 0.3;

    // ---- enxame de arcos orbitais: cada corrente gira num sentido, precessa
    // balançando nervosa, e PULSA escala e brilho na sua frequência (mais a
    // carga do disparo esticando tudo) — os uniforms do shader de arco só
    // vivem se alimentados aqui (dash correndo, flicker, zigue-zague) ----
    for (let i = 0; i < ringRefs.current.length; i++) {
      const c = ARC_RINGS[i];
      const mat = ringMats[i];
      if (mat) {
        mat.uniforms.uTime.value = t;
        mat.uniforms.uCharge.value = pose.charge + pose.flash * 0.8;
      }
      const grp = ringRefs.current[i];
      if (!grp) continue;
      grp.rotation.y += c.spin * dt * (1 + pose.charge * 1.6 + pose.flash * 2.2);
      grp.rotation.x = c.tilt[0] + Math.sin(t * (1.3 + i * 0.37) + seed) * 0.42;
      grp.rotation.z = c.tilt[1] + Math.cos(t * (1.1 + i * 0.29) + seed * 0.6) * 0.38;
      const beat = Math.sin(t * c.wf + i * 1.9 + seed);
      grp.scale.setScalar(1 + beat * 0.07 + pose.charge * 0.05 + pose.flash * 0.08);
      if (mat) mat.uniforms.uAlpha.value = Math.max(0, c.a * (0.62 + 0.38 * beat) * alpha);
    }

    // ---- clarão dourado do núcleo + clarão branco do disparo ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.4, 1.6 + pulse * 0.15 + pose.charge * 0.5 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.055 + 0.025 * pulse + pose.charge * 0.08) * alpha,
    );
    const flash = flashRef.current;
    flash.position.set(0, coreY, -frontZ * (0.7 + 0.18 * s));
    const flashS = pose.flash > 0 ? 0.8 + 1.2 * (1 - pose.flash) : 0.0;
    flash.scale.setScalar(flashS);
    (flash.material as THREE.SpriteMaterial).opacity = pose.flash * 0.24 * alpha;

    const aura = burstAuraRef.current;
    // a aura gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para
    // o envelope total nunca passar do anel — lição da sonda com o encaixe
    // 1,68: deslocamento fixo em mundo + estilhaços longos estouravam 2,5
    aura.position.z = -frontZ * 0.35;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.62 * (1 + Math.sin(t * 5.6 + seed) * 0.05 + pose.charge * 0.08));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 11 + seed);
    const blueShard = starburstRefs.current[0];
    const goldShard = starburstRefs.current[1];
    if (blueShard) {
      (blueShard.material as THREE.MeshBasicMaterial).opacity = (0.12 + pose.charge * 0.06) * auraPulse * alpha;
    }
    if (goldShard) {
      (goldShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.z = -frontZ * 0.8;
    coreGlow.scale.setScalar(0.52 + pose.charge * 0.14 + pose.flash * 0.18);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.14 + pose.charge * 0.08 + pose.flash * 0.1) * alpha;

    // anéis de chão da trovoada (a assinatura plantada na terra)
    for (const ring of refsGroundRings.current) {
      if (!ring) continue;
      ring.mesh.rotation.z += ring.spin * dt * (1 + pose.charge * 1.5);
      ring.mat.opacity = ring.base * (0.68 + 0.32 * Math.sin(t * 7.5 + ring.phase * 2.2)) * alpha;
    }
  });

  const refsGroundRings = useRef<
    { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number; phase: number; spin: number }[]
  >([]);

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={RAY_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* invólucro elétrico: a MESMA malha vestida com as nervuras do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* enxame de correntes orbitando o núcleo (giro+precessão+pulso no
          useFrame; os materiais de arco vivos são alimentados lá) */}
      {ringGeoSeeds.map((geo, i) => (
        <group
          key={`ring${i}`}
          ref={(gr) => {
            ringRefs.current[i] = gr;
          }}
          position={[0, coreY + ARC_RINGS[i].y, 0]}
          rotation={[ARC_RINGS[i].tilt[0], 0, ARC_RINGS[i].tilt[1]]}
        >
          <mesh geometry={geo} material={ringMats[i]} frustumCulled={false} />
        </group>
      ))}
      {Array.from({ length: BURST_CAP }, (_, i) => (
        <mesh
          key={`burst${i}`}
          ref={(m) => {
            burstRefs.current[i] = m;
          }}
          geometry={bursts.geo}
          material={bursts.mats[i]}
          frustumCulled={false}
        />
      ))}
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
              opacity={i === 0 ? 0.25 : 0.18}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      {([0, 1] as const).map((i) => (
        <mesh
          key={`ground-ring${i}`}
          ref={(mesh) => {
            if (mesh && refsGroundRings.current[i] === undefined) {
              refsGroundRings.current[i] = {
                mesh,
                mat: mesh.material as THREE.MeshBasicMaterial,
                base: i === 0 ? 0.58 : 0.35,
                phase: i,
                spin: i === 0 ? 0.5 : -0.35,
              };
            }
          }}
          position={[0, 0.055 + i * 0.025, 0]}
          rotation={[-Math.PI / 2, 0, i * 0.12]}
          renderOrder={1}
          frustumCulled={false}
        >
          <torusGeometry args={[i === 0 ? s * 0.78 : s * 1.05, i === 0 ? 0.026 : 0.017, 8, 96]} />
          <meshBasicMaterial
            color={i === 0 ? '#35caff' : '#ffd34f'}
            transparent
            opacity={i === 0 ? 0.58 : 0.35}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
      {/* faíscas-pop: estalos que saltam do orbe e morrem em ~0,15 s */}
      <points geometry={cracks.geo} material={cracks.mat} position={[0, coreY, 0]} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, coreY, 0.8]} scale={0.52} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffc83d"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.8}>
        <spriteMaterial
          map={circleTexture()}
          color="#6db9ff"
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} position={[0, coreY, -1.35]} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#fff0bd"
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
