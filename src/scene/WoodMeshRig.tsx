import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TREE_URL } from './modelUrls';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, getGeometry, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import { BURST_CAP, makeSparkGeo, makeStarburstGeo, SPARK_FRAG } from './LightningRig';
import { readModel } from './modelPreload';
import { TEAM_TINT } from './stoneShaders';
import { SummonReveal, SummonSigil } from './SummonFX';
import {
  attackPose,
  makeSporeGeo,
  SPORE_FRAG,
  SPORE_VERT,
  type WoodRigProps,
  WOOD_ATTACK_WINDOW,
  WOOD_WINDUP,
} from './WoodRig';

/**
 * MADEIRA DE MALHA 3D IMPORTADA — O ANCIÃO DAS RAÍZES (Nv.6): a forma da
 * espécie vira um mesh texturizado criado fora do jogo
 * (`src/models/tree/tree.glb` — 32.248 vértices, UMA malha com UMA textura;
 * PLY re-empacotado, SEM ossos e SEM animação no arquivo): o tronco-ancião de
 * cara irada, copa de raízes em coroa e os OLHOS CIANO pintados na casca.
 * Enquanto a malha desce (demanda), o SELO DE INVOCÇÃO (`SummonFX`) segura o
 * buraco — o tronco com asas de cristal do `WoodRig` nunca mais pipoca no
 * campo (ficou só doador de efeitos e coreografia) — e TODOS os efeitos da
 * madeira continuam vivos por cima da malha, no mesmo idioma dos cinco
 * figurinos da linha "modelos 3D":
 *
 *  1. VIDA DA CASCA no material da malha: `onBeforeCompile` com o ruído de
 *     `flameShaders.ts` — a SEIVA CORRENDO devagar pelo relevo (na normal
 *     SOLDADA, `aDispNrm`, lição das rachaduras do golé) e os ESPINHOS DE
 *     CASCA que eriçam quando ele carrega a catapulta de seiva;
 *  2. INVOLTÓRIO DE SEIVA (o antigo abraçando o novo): uma casca da MESMA
 *     malha, inflada pelo `SHELL_HUG`, vestida com as NERVURAS DE SEIVA e os
 *     CLAREIOS DE MUSGO do shader antigo (nervura esmeralda escorrendo +
 *     clareio duro em patamar + aro da equipe), aditivo e translúcida por cima
 *     da textura;
 *  3. os efeitos da floresta religados no CORE da malha (o coração do tronco,
 *     um dedo abaixo da cara pintada): a chuva de ESPOROS/FOLHAS do rig antigo
 *     (os mesmos shaders, do topo da copa escalada até o chão), o enxame de
 *     esporos-faísca ORBITANDO o corpo (não acima dele — lição da trovoada),
 *     as faíscas-POP de seiva que ESTALAM do core e somem, o pool de rajadas
 *     exalando do peito, a aura de estilhaços esmeralda+âmbar, os anéis de
 *     chão e a nuvem de esporos nos pés no instante do arremesso.
 *
 * A coreografia é a MESMA timeline do motor (janela 0,5 s: agacha-e-torce →
 * tranco da catapulta) lida de `lastAttackAt`, e o `demoAttackSeq` do
 * bestiário dispara o mesmo show. Sem ossos aqui: a madeira nunca teve
 * esqueleto procedural (o rig da casa animava o GRUPO raiz — succo do tronco,
 * torção, agachamento de raiz) e a malha herda esse grupo exatamente como as
 * parts herdavam.
 *
 * ENCAIXE: o topo autoral da forma (4,0) daria escala 2,34 na caixa da malha
 * (y −0,876..+0,835) e o ancião viraria o tronco do tamanho do buraco que o
 * `SLOT_FIT_MAX` sempre quis evitar — o TETO da linha de `data/footprints.ts`
 * manda (mesmo precedente do Raio): a malha encosta em `MEDIDO.madeira` com o
 * abraço do invólucro, e os efeitos (esporos, anéis de chão, aura) moram
 * dentro dessa mesma linha. O GLB encara o inimigo no +Z (rumo 0 — a cara
 * irada de olhos ciano conferida no viewer de 4 vistas,
 * `qa/mesh-viewer-shot.mjs`); o `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const MADEIRA_DEF = getSpecies('madeira');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(MADEIRA_DEF, MADEIRA_DEF.levelMin);


/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (`qa/mesh-viewer-shot.mjs`, 17/nov) mostrou a CARA IRADA DE
 * OLHOS CIANO no +Z — como as cinco malhas da linha. Se um GLB substituto
 * vier virado, vire aqui.
 */
export const TREE_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): o deslocamento da casca
 * de seiva para fora. MESMO 0,13 dos invólucros de chama/trovoada — e a sonda
 * de footprint lê a caixa CPU e NÃO vê essa infla, então ela mora na linha da
 * tabela.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do tronco em PORCENTAGEM da altura da malha: o core dos efeitos fica
 * um dedo abaixo do meio da caixa (o ancião é pesado de raiz), com a cara
 * pintada e a copa uma régua ACIMA dele. É a régua de CORE_Y: clarões,
 * rajadas, faíscas-pop, esporos e aura nascem dessa altura.
 */
const CORE_FRAC = 0.55;

/** brasa base do emissivo (a seiva esmeralda pintada nos olhos/veios) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#3ec46e');
const EMISSIVE_FLASH = new THREE.Color('#d8ffd0');

/**
 * VERTEX da FAÍSCA-POP DE SEIVA: cada partícula (posição = direção unitária do
 * estalo, `aRand` = sorteios por partícula) roda num ciclo próprio e só vive a
 * janela do pop — abre num estalo, salta do tronco para fora e morre desbotando;
 * o resto do tempo vA=0 (o fragmento descarta). `uCharge` acelera e engorda o
 * estalo na hora de carregar a catapulta. A janela ~0,15 s e o flicker de hash
 * são a receita do "aparece e some" (o MESMO mecanismo das faíscas do Raio,
 * vestido de seiva esmeralda e âmbar).
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
  float cyc = uTime * (1.6 + 3.0 * aRand.z) * (1.0 + uCharge * 0.9) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.26 + 0.14 * aRand.y; // janela do pop (quanto do ciclo a faísca vive)
  float off = step(w, k); // fora da janela: apagada
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.35 + 0.65 * step(0.3, fract(sin(floor(cyc * (30.0 + 26.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.4 + 3.2 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  // seiva esmeralda + âmbar de resina (a paleta do rig antigo)
  vec3 tint = mix(vec3(0.24, 0.86, 0.45), vec3(0.92, 0.78, 0.28), step(0.55, aRand.y));
  vC = mix(tint, vec3(0.92, 1.0, 0.85), env * 0.55);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do ENXAME DE ESPOROS-FAÍSCA orbitando o corpo (o MESMO esqueleto das
 * faíscas da trovoada, re-ancorado no tronco): cada partícula orbita numa
 * faixa própria do corpo (nada de anel flutuando acima da copa — lição da
 * trovoada), com raio e altura tremendo em senóides desencontradas (caos) e
 * um estalo de hash em alta frequência (o "aparece e some"). `uSpin` dobra na
 * carga do arremesso.
 */
const WSPARK_VERT = /* glsl */ `
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
  // sinal sorteado: metade do enxame gira para um lado, metade para o outro (caos)
  float dir = 0.5 - step(0.5, fract(aRand.z * 3.77));
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.2);
  float r = mix(uR1, uR2, aRand.z) * (0.8 + 0.35 * sin(uTime * 2.4 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.16 * sin(uTime * 3.4 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // esporo ESTALA: quadrado de alta frequência com aleatoriedade por partícula
  float flick = step(0.58, fract(sin(floor(uTime * (15.0 + 16.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (3.2 + 2.8 * aRand.z) * (0.7 + 0.5 * flick) * uSizeMul * (1.0 + uCharge * 0.6);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = flick * uAlpha * (0.5 + 0.25 * uCharge);
  // seiva esmeralda com acento âmbar de resina; a que ESTALA vai para o verde-leite
  vec3 tint = mix(vec3(0.28, 0.85, 0.42), vec3(0.9, 0.76, 0.3), step(0.62, fract(aRand.y * 7.13)));
  vC = mix(tint, vec3(0.88, 1.0, 0.82), flick * 0.7) * 0.85;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * INVOLTÓRIO DE SEIVA (o antigo abraçando o novo): a casca de seiva do rig
 * procedural, deslocada para fora com o `uHug` + fervura em PATAMAR (ruído de
 * 2 níveis — a seiva risca, não mancha) por cima da textura. Renderizada
 * aditiva e translúcida: só as NERVURAS DE SEIVA, os CLAREIOS DE MUSGO e o
 * ARO da equipe acendem; o resto do corpo lê pela pintura do GLB. Os ESPINHOS
 * DE CASCA eriçam na carga do arremesso.
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
  // fenda dura em patamar: a casca infla em blocos riscados (casca velha racha em placa)
  float k = step(0.5, fnoise(vLocal * 6.0));
  float amp = uAmp * (1.0 + uHurt * 0.3) * (1.0 + uCharge * 0.5);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.1 + (k - 0.5) * 0.8) * amp);
  // espinhos de casca: farpas duras que eriçam quando ele carrega a seiva
  float spines = step(0.5, fnoise(vLocal * 3.4 + vec3(0.0, uTime * 0.4, 0.0) + uSeed));
  pos += nrm * spines * (0.004 + uCharge * 0.016);
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
  // nervuras de seiva: traço esmeralda ESCORRENDO pela casca (mais lento que
  // a eletricidade do Raio — seiva mana, não risca)
  float vein = fnoise(vLocal * 4.6 + vec3(uTime * 0.28, uTime * -0.5, 0.0) + uSeed);
  float veinMask = smoothstep(0.50, 0.545, vein) * (1.0 - smoothstep(0.56, 0.61, vein));
  float dash = 0.6 + 0.4 * sin(uTime * 9.0 - vLocal.y * 26.0 + uSeed);
  vec3 col = uVein * veinMask * dash * (0.4 + uCharge * 0.8);
  // clareios de musgo: ilhas duras que acendem e apagam (o análogo lenhoso do snap elétrico)
  float glowOn = step(0.5, fnoise(vLocal * 3.6 + vec3(uTime * 1.8) + uSeed));
  float glowGate = step(0.76, fnoise(vLocal * 1.7 - vec3(uTime * 1.4) + uSeed));
  col += uCool * glowOn * glowGate * (0.12 + uCharge * 0.4) * 0.6;
  // aro na cor da equipe + o aro esmeralda da seiva + o âmbar da resina
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uTeamColor * rim * 0.26;
  col += uCore * rim * (0.07 + uCharge * 0.22);
  col += uVein * rim * (0.1 + uCharge * 0.3);
  col = mix(col, vec3(1.0, 0.99, 0.9), uHurt * 0.4); // flash de dano
  float a = uAlpha * (0.45 + 0.4 * vN1) * (1.0 + uCharge * 0.5);
  if (!(a > 0.004)) discard; // discard invertido: NaN nunca escreve (lição WebKit)
  gl_FragColor = vec4(col, min(1.0, a));
}
`;

const tmpDir = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const tmpWorld = new THREE.Vector3();

interface BurstBolt {
  dir: [number, number, number];
  life: number;
  max: number;
  rad: number;
  volley: boolean;
}

/**
 * Dispatcher da Madeira: Nv.6 = a malha importada do ancião das raízes;
 * enquanto ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE
 * INVOCÇÃO segura o buraco — o figurino da floresta antiga nunca mais
 * aparece no campo (a lição da troca: o monstro velho pipocando antes da
 * malha desvaloriza o print; o `WoodRig` antigo ficou só doador de efeitos).
 */
export function WoodRig(props: WoodRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="madeira" url={TREE_URL} seed={props.seed} />}>
      <SummonReveal species="madeira" seed={props.seed}>
        <TreeMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function TreeMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq, smoke }: WoodRigProps) {
  const { scene } = readModel(TREE_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/charge não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${TREE_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    weldDispNormals(geo); // solda para o relevo de seiva não rasgar nas arestas duras (28.815 soldas duras, qa/probe-cracks.mjs)
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do tronco, um dedo abaixo do meio da caixa: a origem de todos os efeitos
      coreY: CORE_FRAC * spanY, // local na base do rig (base no y 0 local antes do fit)
    };
  }, [scene]);

  // encaixe autoral: o TETO da linha de `MEDIDO` manda (o topo autoral 4,0
  // inflaria o ancião para fora do buraco — ver o doc no topo); plantado com
  // a base no y 0 local, centro do corpo no eixo do rig; o offset compensa a
  // rotação de rumo (matriz T·R·S) e a AABB é a EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('madeira', MADEIRA_DEF.levelMin as MonsterLevel);
    const yaw = TREE_MODEL_YAW;
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

  // altura local do coração do tronco (o núcleo dos efeitos): a base da malha
  // já fica plantada no y 0 do rig (o `pos` do fit levanta a base crua até o
  // chão), então o core mora na própria porcentagem da caixa escalada — SEM
  // somar `pos[1]` de novo (a lição do Raio: somar de novo deixava o enxame
  // flutuando acima da copa)
  const coreY = src.coreY * fit.s;

  // material por instância: textura do GLB + brasa de seiva + a seiva correndo
  // no relevo e os espinhos de carga via onBeforeCompile (o MESMO ruído de flameShaders.ts)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.72,
      metalness: 0,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.32,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.022 };
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFCharge = { value: 0 };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nuniform float uFCharge;\nvarying float vFlick;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // a SEIVA correndo devagar pela casca INTEIRA: é isso que faz a tinta
          // do GLB parecer madeira viva, não argila pintada (mana, não fervura —
          // mais lento e raso que o plasma da trovoada)
          float fn = fbm(transformed * 3.2 + vec3(0.0, -uFT * 1.35, 0.0) + uFSeed);
          // o grão sai pela NORMAL SOLDADA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): na aresta dura do GLB cada cópia do mesmo ponto
          // sairia para o lado da sua normal própria e abriria as "rachaduras"
          // (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uFA * 2.0;
          // ESPINHOS DE CASCA do rig antigo: farpas duras em patamar que eriçam
          // na carga da catapulta (o ancião arreia antes de arremessar)
          float spines = step(0.5, fnoise(transformed * 3.4 + vec3(0.0, uFT * 0.4, 0.0) + uFSeed));
          transformed += aDispNrm * spines * (0.003 + uFCharge * 0.012);
          vFlick = fbm(transformed * 5.0 + vec3(uFT * 2.4) + uFSeed);`,
        );
      sh.fragmentShader =
        'uniform float uFCharge;\nvarying float vFlick;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 + uFCharge * 1.3 + 0.3 * max(0.0, vFlick - 0.55);`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // INVOLTÓRIO: a casca de seiva do antigo (shader próprio acima) por cima da
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
          uAmp: { value: 0.04 },
          uHug: { value: SHELL_HUG },
          uSeed: { value: seed },
          uCharge: { value: 0 },
          uHurt: { value: 0 },
          uAlpha: { value: 0.45 },
          uVein: { value: new THREE.Color('#3ee27f') },
          uCool: { value: new THREE.Color('#9fd84f') },
          uCore: { value: new THREE.Color('#ffd34f') },
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

  // ---- os efeitos da floresta, religados no coração da malha ----
  const s = fit.s;

  // CHUVA DE ESPOROS/FOLHAS do rig antigo (os MESMOS shaders exportados),
  // caindo do TOPO DA COPA escalada (não do topo autoral 4,0 — a copa da
  // malha é mais baixa) e varrendo na régua do encaixe `s` (nada de folha
  // atravessando a linha do buraco — lição da trovoada com a aura deslocada)
  const sporeCount = embers ?? 14;
  const spores = useMemo(
    () => ({
      geo: makeSporeGeo(sporeCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPORE_VERT,
        fragmentShader: SPORE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: src.spanY * s },
          uSpread: { value: s * 0.6 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [sporeCount, emberScale, src.spanY, s],
  );

  // esporos-faísca ORBITANDO o tronco: faixas do corpo (do joelho à copa),
  // nunca acima da malha; mais partículas e giro mais caótico que a trovoada
  // (metade do enxame gira para o outro lado — o pedido explícito da rodada)
  const sparks = useMemo(
    () => ({
      geo: makeSparkGeo(34),
      mat: new THREE.ShaderMaterial({
        vertexShader: WSPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: coreY - 0.55 * s },
          uY1: { value: src.spanY * s - 0.15 * s },
          uR1: { value: s * 0.62 },
          uR2: { value: s * 0.9 },
          uSpin: { value: 2.6 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, coreY, s],
  );

  // FAÍSCAS-POP do coração: cada partícula é um estalo de seiva que some — num
  // ciclo próprio ela vive ~35% do tempo, saltando do tronco para fora num
  // abrir-e-fechar de olhos (janela de ~0,15 s), o resto do tempo fica
  // apagada. O timing é tudo no shader (nada de bookkeeping por partícula no
  // CPU); a régua do voo mora entre a casca (s×0.38) e por baixo do anel
  // externo (s×0.92), então o pop nunca encosta na linha do buraco.
  const cracks = useMemo(() => {
    const n = 34;
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
      pos[i * 3 + 1] = z * 1.15; // levemente alta: o ancião é mais alto que largo
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
          uR0: { value: s * 0.38 },
          uR1: { value: s * 0.92 },
        },
      }),
    };
  }, [seed, emberScale, s]);

  // rajadas do coração: mini-cuspes de seiva aditivos exalando do peito para fora
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#9df0b0',
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

  // aura de estilhaços (esmeralda + âmbar) no coração
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 26, '#2fc46f'),
      makeStarburstGeo(seed + 7.4, 18, '#e8c341'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of bursts.mats) m.dispose();
      spores.geo.dispose();
      spores.mat.dispose();
      sparks.geo.dispose();
      sparks.mat.dispose();
      cracks.geo.dispose();
      cracks.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, bursts, spores, sparks, cracks, starburstGeos]);

  /** dispara uma rajada do coração (volley = salvas do arremesso, mais compridas) */
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
      if (demoT.current > WOOD_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const windupEnd = WOOD_WINDUP * WOOD_ATTACK_WINDOW;
    const releasing = sinceAttack >= windupEnd && sinceAttack <= WOOD_ATTACK_WINDOW;
    // o clarão do tranco nasce no release e some em ~0,3 s (o rig antigo não
    // tinha flash; aqui ele alimenta clarão/rajadas do arremesso)
    const flash = releasing ? Math.max(0, 1 - (sinceAttack - windupEnd) / 0.3) : 0;

    // salva de rajadas no instante do disparo (uma por ataque do motor) + a
    // nuvem de esporos nos pés (a MESMA assinatura do rig procedural)
    if (releasing && strikeKey >= 0 && !strikesDone.current.has(strikeKey)) {
      strikesDone.current.add(strikeKey);
      if (strikesDone.current.size > 8) strikesDone.current.clear();
      for (let k = 0; k < 3; k++) {
        tmpDir
          .set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.6 + 0.15, frontZ * (0.8 + Math.random() * 0.4))
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], true);
      }
      if (smoke) {
        g.updateWorldMatrix(true, false);
        for (let i = 0; i < 5; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.1 * s, 0.08, (Math.random() - 0.5) * 0.8 * s + frontZ * 0.15 * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.07 + Math.random() * 0.05,
            heat: 0.04, // esporos frios (nada de brasa)
            life: 0.8 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 0.9,
            vz: (Math.random() - 0.5) * 0.9,
          });
        }
      }
    }

    // exalação contínua do coração: cuspes curtos de seiva para todos os lados,
    // dobrando de cadência quando ele carrega a catapulta
    if (alpha > 0.25) {
      burstAcc.current += dt * (3.0 + pose.charge * 5.2) * (0.7 + 0.3 * hpFrac);
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

    // rajadas: crescem do peito para fora, piscam e apagam
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
        // nascem DENTRO do tronco e furam a casca: raio de saída na régua da
        // malha (enxuto: a sonda pega a rajada no pico e o invólucro todo tem
        // que morrer dentro do anel)
        const r0 = s * 0.5 + grow * s * 0.18;
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, coreY + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 52);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad);
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * (d.volley ? 0.7 : 0.8);
        mat.color.set(d.volley ? '#d8ffcf' : i % 2 === 0 ? '#9df0b0' : '#e8d15a');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do invólucro (carga acende nervuras/espinhos; morte esvazia)
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = pose.charge + flash * 0.6;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.45 + pose.charge * 0.18 + flash * 0.3) * alpha);

    // uniforms do corpo (relevo de seiva + espinhos + carga no material da malha)
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number }; uFCharge: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      sh.uniforms.uFA.value = 0.022 * (0.8 + 0.2 * hpFrac) * (1 + flash * 0.6 + hurt * 0.5);
      sh.uniforms.uFCharge.value = pose.charge;
    }
    // a seiva pulsa devagar com a regeneração (quanto mais HP, mais viva) e
    // ACRESCITA na carga do arremesso (o MESMO pulso do rig procedural)
    const vig = 0.35 + 0.65 * hpFrac;
    const sapPulse = 0.42 + 0.22 * Math.sin(t * 1.55 + seed) * vig + pose.charge * 1.15;
    body.emissiveIntensity = Math.max(
      0,
      (0.32 + sapPulse * 0.25 + flash * 0.8 + hurt * 1.0) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + flash * 0.3 + pose.charge * 0.25));

    // chuva de esporos (o relógio, a morte e a carga — o flutter é todo do shader)
    spores.mat.uniforms.uTime.value = t;
    spores.mat.uniforms.uAlpha.value = alpha;
    spores.mat.uniforms.uCharge.value = pose.charge + flash * 0.5;

    // esporos-faísca orbitando o corpo
    sparks.mat.uniforms.uTime.value = t;
    sparks.mat.uniforms.uAlpha.value = alpha;
    sparks.mat.uniforms.uCharge.value = pose.charge + flash;

    // faíscas-pop do coração (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    cracks.mat.uniforms.uTime.value = t;
    cracks.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    cracks.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: succo do tronco, torção do tranco, agachamento de raiz (o
    // grupo que o rig antigo animava; a malha + o invólucro herdam tudo junto) ----
    const sway = Math.sin(t * 0.45 + seed) * 0.02 + Math.sin(t * 1.0 + 1.7) * 0.008;
    const crouchY = 1 - pose.crouch * 0.07;
    const wilt = (1 - alpha) * 0.6; // morrendo: a madeira se desfaz e afunda
    g.scale.set(
      (1 + pose.crouch * 0.05 + pose.flare * 0.02) * (1 + wilt * 0.3),
      crouchY - wilt * 0.45,
      (1 + pose.crouch * 0.05) * (1 + wilt * 0.3),
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.38 + seed * 0.6) * 0.012;
    g.rotation.x = pose.crouch * 0.05 - pose.twist * 0.1 + wilt * 0.18;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.01 + pose.crouch * -0.02 - wilt * 0.3;
    g.position.z = pose.stepZ;

    // ---- clarão esmeralda do coração + clarão do tranco ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.4, 1.6 + sapPulse * 0.12 + pose.charge * 0.5 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 1.55 + seed) + pose.charge * 0.07) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.7 + 0.18 * s));
    const flashS = flash > 0 ? 0.8 + 1.2 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.22 * alpha;

    const aura = burstAuraRef.current;
    // a aura gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para
    // o envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.35;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.62 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.08));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 7.5 + seed);
    const greenShard = starburstRefs.current[0];
    const amberShard = starburstRefs.current[1];
    if (greenShard) {
      (greenShard.material as THREE.MeshBasicMaterial).opacity = (0.12 + pose.charge * 0.06) * auraPulse * alpha;
    }
    if (amberShard) {
      (amberShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -0.8);
    coreGlow.scale.setScalar(0.52 + pose.charge * 0.14 + flash * 0.18);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.14 + pose.charge * 0.08 + flash * 0.1) * alpha;

    // anéis de chão do ancião (a assinatura plantada na terra)
    for (const ring of refsGroundRings.current) {
      if (!ring) continue;
      ring.mesh.rotation.z += ring.spin * dt * (1 + pose.charge * 1.5);
      ring.mat.opacity = ring.base * (0.68 + 0.32 * Math.sin(t * 6.2 + ring.phase * 2.2)) * alpha;
    }
  });

  const refsGroundRings = useRef<
    { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number; phase: number; spin: number }[]
  >([]);

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={TREE_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* invólucro de seiva: a MESMA malha vestida com as nervuras do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* chuva de esporos/folhas caindo da copa (os mesmos shaders do rig antigo) */}
      <points geometry={spores.geo} material={spores.mat} frustumCulled={false} />
      {/* esporos-faísca orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
      {/* faíscas-pop: estalos de seiva que saltam do coração e morrem em ~0,15 s */}
      <points geometry={cracks.geo} material={cracks.mat} position={[0, coreY, 0]} frustumCulled={false} />
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
            color={i === 0 ? '#3ee27f' : '#ffd34f'}
            transparent
            opacity={i === 0 ? 0.58 : 0.35}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <sprite ref={coreGlowRef} position={[0, coreY, -0.8]} scale={0.52} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#3fe07f"
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
          color="#7fd6a0"
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
          color="#eaffd0"
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
