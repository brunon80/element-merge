import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import lavaUrl from '../models/lava/lava.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, getGeometry, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import {
  attackPose,
  EMBER_FRAG,
  EMBER_VERT,
  MAGMA_ATTACK_WINDOW,
  MAGMA_WINDUP,
  MagmaRig as MagmaStageRig,
  makeEmberGeo,
  type MagmaRigProps,
} from './MagmaRig';
import { BURST_CAP, makeSparkGeo, makeStarburstGeo, SPARK_FRAG } from './LightningRig';

/**
 * MAGMA DE MALHA 3D IMPORTADA — O COLOSSO DE LAVA (Nv.6): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/lava/lava.glb` —
 * 24.643 vértices NÃO-indexados, UMA malha com UMA textura 2048²; PLY
 * re-empacotado, SEM ossos e SEM animação no arquivo): o colosso de blocos de
 * basalto quase preto com rios de lava laranja nas costuras, o peito com uma
 * FORNALHA acesa e a boca de cratera no topo da cabeça. O figurino procedural
 * do vulcão (os três socalcos do `MagmaRig`) só aparece como fallback enquanto
 * a malha da forma carrega — e TODOS os efeitos do magma continuam vivos por
 * cima dela, no mesmo idioma dos sete figurinos da linha "modelos 3D":
 *
 *  1. LAVA VIVA no material da malha (o pedido do usuário para esta espécie):
 *     `onBeforeCompile` com o ruído de `flameShaders.ts` — os VEIOS DE LAVA
 *     RASTEJANDO pelas encostas (na normal SOLDADA, `aDispNrm`, lição das
 *     rachaduras do golé), a CROSTA QUE ARDE e engrossa quando ele carrega o
 *     matacão; no emissivo, os rios pulsando e ACENDENDO na carga (o `crack
 *     Glow` do basalto antigo vestido na pintura do GLB);
 *  2. INVOLTÓRIO DE BRASA (o antigo abraçando o novo): uma casca da MESMA
 *     malha, inflada pelo `SHELL_HUG`, vestida com as TRINCAS INCANDESCENTES
 *     e o BRILHO DE FORNALHA da receita do vulcão (veio largo escorrendo +
 *     brasas duras em patamar piscando), aditiva e translúcida por cima da
 *     textura. Diferente da geada do gelo, AQUI o aro segue a brasa do corpo
 *     (laranja), nunca o tint da equipe — o fogo do vulcão é a assinatura;
 *  3. os efeitos do magma religados na FORNALHA da malha (o peito aceso, no
 *     meio da caixa, e a cratera no topo): as BRASAS QUE SOREM da cratera do
 *     rig antigo (os MESMOS shaders, nascendo da boca escalada), as brasas-
 *     faísca ORBITANDO o corpo (não acima dele — lição da trovoada), o pool
 *     de lufadas de fumaça quente exalando do peito, a auréola de estilhaços
 *     em brasa, o fio contínuo de fumaça da cratera e a BAFOFADA DE CINZAS
 *     nos pés no instante do arremesso (heat 0,3 — cinza ainda quente, a
 *     MESMA assinatura do rig procedural). SEM anéis de chão: o vulcão nunca
 *     os teve, e a placa inventada arriscaria a infla √2 da sonda num torus
 *     que rodasse — ficou de fora de propósito. SEM o núcleo de plasma da
 *     cratera: no rig antigo a bola de lava fervia FUNDIDA num copo de torus
 *     (borda de cratera em y 2,82); na malha a boca é rasa e a bola ficava
 *     um gorro vermelho flutuando na cabeça — removido a pedido do usuário
 *     na aprovação; a cratera segue acesa só com o clarão aditivo e as brasas.
 *
 * A coreografia é a MESMA timeline do motor (janela 0,55 s: agacha-e-torce com
 * o braço do matacão recuando → tranco para frente, cratera CLAREIA como
 * erupção curta) lida de `lastAttackAt`, e o `demoAttackSeq` do bestiário
 * dispara o mesmo show. Sem ossos aqui: o magma nunca teve esqueleto
 * procedural (o rig animava o GRUPO raiz — torção, agachamento de joelhos de
 * pedra) e a malha herda esse grupo exatamente como as parts herdavam.
 *
 * ENCAIXE: o topo autoral da forma (3,9) daria escala ~1,97 na caixa da malha
 * e o colosso encostaria no teto de altura com folga mínima — o TETO da linha
 * de `data/footprints.ts` manda (mesmo precedente do Raio/Ancient Tree/Ice
 * Cube): a malha encosta em `MEDIDO.magma` com o abraço do invólucro, e os
 * efeitos (brasas, fumaça, auréola) moram dentro dessa mesma linha. O GLB
 * encara o inimigo no +Z (rumo 0 — o PEITO DE FORNALHA acesa conferido na
 * primeira vista do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`, painel
 * "frente (+Z)"); o `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const MAGMA_DEF = getSpecies('magma');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(MAGMA_DEF, MAGMA_DEF.levelMin);

/** URL da malha da forma. O encaixe por bbox torna o resto automático */
const LAVA_URL = lavaUrl;

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (`qa/mesh-viewer-shot.mjs`, 17/nov — painel superior esquerdo =
 * frente +Z) mostrou o PEITO DE FORNALHA ACESA e a cratera voltada ao +Z —
 * como as demais malhas da linha. Se um GLB substituto vier virado, vire aqui.
 */
export const MAGMA_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): o deslocamento da casca
 * de brasa para fora. MESMO 0,13 dos invólucros de chama/trovoada/raízes/geada
 * — e a sonda de footprint lê a caixa CPU e NÃO vê essa infla, então ela mora
 * na linha da tabela.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do colosso em PORCENTAGEM da altura da malha: a FORNALHA do peito
 * mora quase no meio da caixa (o busto de blocos), e a cratera no topo. É a
 * régua de CORE_Y: clarões, lufadas e auréola nascem do peito; as brasas sobem
 * da cratera (`CRATER_FRAC`).
 */
const CORE_FRAC = 0.55;

/** boca da cratera em PORCENTAGEM da altura (o topo da cabeça — de lá sobem as
 *  brasas e sai o fio de fumaça, o `CRATER_Y` do rig antigo lido na caixa) */
const CRATER_FRAC = 0.88;

/** brasa base do emissivo (os rios de lava pintados nas costuras) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#ff6a1f');
const EMISSIVE_FLASH = new THREE.Color('#ffe3b8');

/**
 * VERTEX da BRASA-POP DO PEITO: cada partícula (posição = direção unitária do
 * estalo, `aRand` = sorteios por partícula) roda num ciclo próprio e só vive a
 * janela do pop — abre num estalo, salta do colosso para fora e morre
 * esfriando (branca → laranja → brasa vermelha, a paleta das brasas do rig);
 * o resto do tempo vA=0 (o fragmento descarta). `uCharge` acelera e engorda o
 * estalo na hora de carregar o matacão (o MESMO mecanismo das faíscas da
 * trovoada, vestido de lava).
 */
const POP_VERT = /* glsl */ `
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
  float cyc = uTime * (1.5 + 2.8 * aRand.z) * (1.0 + uCharge * 0.9) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.25 + 0.15 * aRand.y; // janela do pop (quanto do ciclo a brasa vive)
  float off = step(w, k); // fora da janela: apagada
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.35 + 0.65 * step(0.3, fract(sin(floor(cyc * (28.0 + 24.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.2 + 3.0 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  // esfriando em voo: branca no berço -> laranja -> brasa vermelha (a paleta do rig)
  vC = mix(vec3(1.0, 0.82, 0.45), vec3(0.95, 0.3, 0.07), life);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do ENXAME DE BRASAS-FAÍSCA orbitando o colosso (o MESMO esqueleto
 * das faíscas da trovoada/esporos do ancião, re-ancorado no basalto): cada
 * partícula orbita numa faixa própria do corpo (da base à boca da cratera,
 * nada de anel flutuando acima da cabeça — lição da trovoada), com raio e
 * altura tremendo em senóides desencontradas (caos) e um estalo de hash em
 * alta frequência (o "aparece e some"). `uSpin` é mais LENTO que o do ancião
 * (a brasa do vulcão sobe pesado) e dobra na carga do arremesso.
 */
const LSPARK_VERT = /* glsl */ `
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
  float r = mix(uR1, uR2, aRand.z) * (0.8 + 0.35 * sin(uTime * 2.0 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 2.6 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // brasa ESTALA: quadrado de alta frequência com aleatoriedade por partícula
  float flick = step(0.55, fract(sin(floor(uTime * (12.0 + 14.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (3.0 + 2.6 * aRand.z) * (0.7 + 0.5 * flick) * uSizeMul * (1.0 + uCharge * 0.6);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = flick * uAlpha * (0.5 + 0.25 * uCharge);
  // lava laranja + branco de fornalha; a que ESTALA vai para o vermelho-brasa
  vec3 tint = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.85, 0.5), step(0.6, fract(aRand.y * 7.13)));
  vC = mix(tint, vec3(0.95, 0.35, 0.1), flick * 0.5);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * INVOLTÓRIO DE BRASA (o antigo abraçando o novo): a casca de basalto do rig
 * procedural, deslocada para fora com o `uHug` + fervura em PATAMAR (ruído de
 * 2 níveis — a rocha racha em placas duras, não derrete em onda larga de
 * água) por cima da textura. Renderizada aditiva e translúcida: só as TRINCAS
 * INCANDESCENTES, as BRASAS DURAS que piscam e o halo de fornalha acendem; o
 * resto do corpo lê pela pintura do GLB. A CROSTA incandescente engrossa na
 * carga do arremesso. O aro do aro é a BRASA do vulcão (laranja), nunca o
 * tint da equipe — geada é azul-branco, lava é laranja, sempre (as duas lições
 * espelhadas da linha).
 */
const EMBER_SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uAmp;
uniform float uHug;
uniform float uCharge;
uniform float uHurt;
uniform float uCrumble;
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
  // trinca dura em patamar: o basalto racha em placas (veio largo — vulcão
  // racha em rios de lava, não em fio de gelo)
  float k = step(0.5, fnoise(vLocal * 5.0));
  float amp = uAmp * (1.0 + uHurt * 0.2 + uCrumble * 2.4) * (1.0 + uCharge * 0.5);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.1 + (k - 0.5) * 1.0) * amp);
  // crosta incandescente: placas duras em patamar que engrossam quando ele carrega o matacão
  float rime = step(0.5, fnoise(vLocal * 3.0 + vec3(0.0, uTime * 0.25, 0.0) + uSeed));
  pos += nrm * rime * (0.004 + uCharge * 0.012);
  vN1 = n1;
  vNrm = normalMatrix * nrm;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const EMBER_SHELL_FRAG = /* glsl */ `
uniform vec3 uVein;
uniform vec3 uHot;
uniform vec3 uCore;
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
  // trincas incandescentes: rio LARGO escorrendo (o crack largo do basalto
  // antigo — vulcão racha em rios, não em fio de gelo)
  float vein = fnoise(vLocal * 3.6 + vec3(uTime * 0.12, uTime * -0.5, 0.0) + uSeed);
  float veinMask = smoothstep(0.48, 0.54, vein) * (1.0 - smoothstep(0.56, 0.64, vein));
  float seg = 0.6 + 0.4 * step(0.5, fnoise(vLocal * 9.0 + uSeed)); // traço segmentado
  vec3 col = uVein * veinMask * seg * (0.5 + uCharge * 1.1);
  // brasas duras que acendem e apagam (o análogo incandescente do snap elétrico)
  float glowOn = step(0.5, fnoise(vLocal * 3.4 + vec3(uTime * 1.4) + uSeed));
  float glowGate = step(0.78, fnoise(vLocal * 1.7 - vec3(uTime * 0.8) + uSeed));
  col += uHot * glowOn * glowGate * (0.14 + uCharge * 0.45) * 0.8;
  // halo de fornalha (laranja, NUNCA tint de equipe — a lição espelhada da geada)
  // + o rio claro no aro + o núcleo do peito
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uHot * rim * 0.22;
  col += uVein * rim * (0.1 + uCharge * 0.24);
  col += uCore * rim * (0.06 + uCharge * 0.18);
  col = mix(col, vec3(1.0, 1.0, 1.0), uHurt * 0.4); // flash de dano
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
 * Dispatcher do Magma: Nv.6 = a malha importada do colosso de lava; enquanto
 * ela carrega, o figurino procedural do vulcão segura o palco (o mesmo
 * `Suspense` dos demais figurinos da linha "modelos 3D").
 */
export function MagmaRig(props: MagmaRigProps) {
  return (
    <Suspense fallback={<MagmaStageRig {...props} />}>
      <MagmaMeshRig {...props} />
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function MagmaMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq, smoke }: MagmaRigProps) {
  useGLTF.preload(LAVA_URL);
  const { scene } = useGLTF(LAVA_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/charge não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${LAVA_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    weldDispNormals(geo); // solda p/ o relevo de lava não rasgar nas arestas (213 soldas duras >60° — qa/probe-cracks.mjs)
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // a fornalha do peito (meio da caixa) e a boca da cratera (o topo): as
      // duas origens dos efeitos
      coreY: CORE_FRAC * spanY, // local na base do rig (base no y 0 local antes do fit)
      craterY: CRATER_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: o TETO da linha de `MEDIDO` manda (o topo autoral 3,9
  // inflaria o colosso quase até o teto da altura — ver o doc no topo);
  // plantado com a base no y 0 local, centro do corpo no eixo do rig; o offset
  // compensa a rotação de rumo (matriz T·R·S) e a AABB é a EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('magma', MAGMA_DEF.levelMin as MonsterLevel);
    const yaw = MAGMA_MODEL_YAW;
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

  // alturas locais dos dois corações (fornalha do peito + boca da cratera): a
  // base da malha já fica plantada no y 0 do rig (o `pos` do fit levanta a
  // base crua até o chão), então moram na própria porcentagem da caixa
  // escalada — SEM somar `pos[1]` de novo (a lição do Raio: somar de novo
  // deixava o enxame flutuando acima da malha)
  const s = fit.s;
  const coreY = src.coreY * s;
  const craterY = src.craterY * s;

  // material por instância: textura do GLB + brasa laranja + os VEIOS DE LAVA
  // VIVOS rastejando no relevo e a crosta incandescente na carga via
  // onBeforeCompile (o MESMO ruído de flameShaders.ts; a pintura do GLB já
  // traz os rios de lava nas costuras)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.62,
      metalness: 0.04,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.5,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uLT = { value: 0 };
      sh.uniforms.uLA = { value: 0.02 };
      sh.uniforms.uLSeed = { value: seed };
      sh.uniforms.uLCharge = { value: 0 };
      sh.vertexShader =
        `uniform float uLT;\nuniform float uLA;\nuniform float uLSeed;\nuniform float uLCharge;\nvarying float vLiq;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // a LAVA VIVA rastejando devagar pelas encostas INTEIRAS: é isso que
          // faz a tinta do GLB parecer rocha fervendo, não argila pintada
          // (rasteja para baixo como rio de lava escorrendo — mais lento e
          // raso que a seiva do ancião)
          float fn = fbm(transformed * 2.6 + vec3(0.0, -uLT * 1.1, 0.0) + uLSeed);
          // o grão sai pela NORMAL SOLDADA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): na aresta dura do GLB cada cópia do mesmo ponto
          // sairia para o lado da sua normal própria e abriria as "rachaduras"
          // (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uLA * 2.0;
          // CROSTA QUE ARDE: placas duras em patamar que engrossam na carga do
          // matacão (o vulcão se incendeia inteiro antes do arremesso)
          float rime = step(0.5, fnoise(transformed * 3.0 + vec3(0.0, uLT * 0.25, 0.0) + uLSeed));
          transformed += aDispNrm * rime * (0.003 + uLCharge * 0.01);
          vLiq = fbm(transformed * 4.5 + vec3(uLT * 1.8) + uLSeed);`,
        );
      sh.fragmentShader =
        'uniform float uLCharge;\nvarying float vLiq;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          // os RIOS DE LAVA VIVA acendem e pulsam na carga (o crackGlow do
          // basalto antigo lido na pintura do GLB): veio largo em banda
          float rv = smoothstep(0.44, 0.52, vLiq) * (1.0 - smoothstep(0.55, 0.64, vLiq));
          totalEmissiveRadiance *= 1.0 + uLCharge * 1.4 + rv * uLCharge * 2.6 + 0.45 * max(0.0, vLiq - 0.5);`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // INVOLTÓRIO: a casca de brasa (shader próprio acima) por cima da textura —
  // um material por unidade. SEM tint de equipe (lava é laranja, sempre)
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EMBER_SHELL_VERT,
        fragmentShader: EMBER_SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.042 },
          uHug: { value: SHELL_HUG },
          uSeed: { value: seed },
          uCharge: { value: 0 },
          uHurt: { value: 0 },
          uCrumble: { value: 0 },
          uAlpha: { value: 0.45 },
          uVein: { value: new THREE.Color('#ff6a1f') },
          uHot: { value: new THREE.Color('#e0501a') },
          uCore: { value: new THREE.Color('#ffbe55') },
        },
      }),
    [seed],
  );

  // ---- os efeitos do magma, religados nos dois corações da malha ----

  // CHUVA ASCENDENTE DE BRASAS da cratera (os MESMOS shaders exportados do
  // rig antigo), nascendo da BOCA ESCALADA (não do topo autoral 3,9) e na
  // régua do encaixe `s` (nada de brasa atravessando a linha do buraco)
  const emberCount = embers ?? 16;
  const embersGeo = useMemo(
    () => ({
      geo: makeEmberGeo(emberCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCraterY: { value: craterY },
          uCraterR: { value: s * 0.3 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberCount, emberScale, craterY, s],
  );

  // brasas-faísca ORBITANDO o colosso: faixas do corpo (da base à boca da
  // cratera), nunca acima da cabeça; giro LENTO (brasa pesada — cadência 1,8)
  // e metade do enxame para o lado oposto (caos da lição)
  const sparks = useMemo(
    () => ({
      geo: makeSparkGeo(28),
      mat: new THREE.ShaderMaterial({
        vertexShader: LSPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.25 * s },
          uY1: { value: craterY },
          uR1: { value: s * 0.62 },
          uR2: { value: s * 0.88 },
          uSpin: { value: 1.8 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, craterY, s],
  );

  // BRASAS-POP do peito: cada partícula é um estalo de lava que some — num
  // ciclo próprio ela vive ~25% do tempo, saltando do colosso para fora num
  // abrir-e-fechar, o resto do tempo fica apagada. O timing é tudo no shader;
  // a régua do voo mora entre a casca (s×0,4) e por baixo do anel externo
  // (s×0,9), então o pop nunca encosta na linha do buraco.
  const pops = useMemo(() => {
    const n = 30;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    let st = (Math.floor(seed * 1000) ^ 0x51f2b3c7) >>> 0;
    const rand = () => {
      st = (st * 1664525 + 1013904223) >>> 0;
      return st / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const z = rand() * 2 - 1;
      const az = rand() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - z * z));
      pos[i * 3] = Math.cos(az) * rr * 1.1; // o colosso é mais largo que fundo
      pos[i * 3 + 1] = z * 1.0;
      pos[i * 3 + 2] = Math.sin(az) * rr * 0.5;
      rnd[i * 3] = rand();
      rnd[i * 3 + 1] = rand();
      rnd[i * 3 + 2] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    return {
      geo,
      mat: new THREE.ShaderMaterial({
        vertexShader: POP_VERT,
        fragmentShader: SPARK_FRAG, // o mesmo disco macio da faísca orbitante
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uR0: { value: s * 0.4 },
          uR1: { value: s * 0.9 },
        },
      }),
    };
  }, [seed, emberScale, s]);

  // lufadas do peito: mini-cuspes de fumaça/fogo aditivos exalando da fornalha
  // para fora (o bafo quente do vulcão)
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#ff8a3a',
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

  // auréola de estilhaços em brasa (laranja + branco de fornalha) no peito
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 24, '#ff6a1f'),
      makeStarburstGeo(seed + 7.4, 16, '#ffbe55'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of bursts.mats) m.dispose();
      embersGeo.geo.dispose();
      embersGeo.mat.dispose();
      sparks.geo.dispose();
      sparks.mat.dispose();
      pops.geo.dispose();
      pops.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, bursts, embersGeo, sparks, pops, starburstGeos]);

  /** dispara uma lufada do peito (volley = salvas do arremesso, mais compridas) */
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
  const ashAcc = useRef(0);
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
      if (demoT.current > MAGMA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const windupEnd = MAGMA_WINDUP * MAGMA_ATTACK_WINDOW;
    const releasing = sinceAttack >= windupEnd && sinceAttack <= MAGMA_ATTACK_WINDOW;
    // a erupção curta do tranco nasce no release e some em ~0,3 s (o rig
    // antigo clareava a cratera como erupção; aqui ela alimenta clarão/lufadas)
    const flash = releasing ? Math.max(0, 1 - (sinceAttack - windupEnd) / 0.3) : 0;

    // salva de lufadas no instante do disparo (uma por ataque do motor) + a
    // BAFOFADA DE CINZAS nos pés (heat 0,3 — cinza AINDA QUENTE, a MESMA
    // assinatura do rig procedural: cinza quente, não poeira fria)
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
        for (let i = 0; i < 6; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.3 * s, 0.06, (Math.random() - 0.5) * 1.0 * s + frontZ * 0.2 * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.1 + Math.random() * 0.06,
            heat: 0.3, // cinza ainda quente na base
            life: 0.9 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.24,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.0,
            vz: (Math.random() - 0.5) * 1.2,
          });
        }
      }
    }

    // rosnado do vulcão: fio contínuo de fumaça FINA da cratera (o mesmo
    // acerto de cadência do rig antigo) + lufadas do peito exalando
    if (smoke && alpha > 0.3) {
      ashAcc.current += dt * 0.5 * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (ashAcc.current >= 1 && guard < 2) {
        ashAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        tmpWorld
          .set((Math.random() - 0.5) * 0.5 * s, craterY + 0.15 * s, (Math.random() - 0.5) * 0.5 * s)
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + Math.random() * 0.04,
          heat: 0.14,
          life: 1.4 + Math.random() * 0.8,
          lifeVar: 0.4,
          jitter: 0.12,
          rise: 0.85,
          drag: 2.2,
        });
      }
      if (ashAcc.current > 2) ashAcc.current = 2;
    }
    if (alpha > 0.25) {
      burstAcc.current += dt * (2.4 + pose.charge * 5.0) * (0.7 + 0.3 * hpFrac);
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

    // lufadas: crescem do peito para fora, piscam e apagam
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
        // nascem DENTRO do colosso e furam a casca: raio de saída na régua da
        // malha (enxuto: a sonda pega a lufada no pico e o invólucro todo tem
        // que morrer dentro do anel)
        const r0 = s * 0.5 + grow * s * 0.18;
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, coreY + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 46);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad);
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * (d.volley ? 0.7 : 0.8);
        mat.color.set(d.volley ? '#ffd08a' : i % 2 === 0 ? '#ff8a3a' : '#ff6a1f');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do invólucro (carga acende trincas/crosta; morte esvazia E
    // desaba: `uCrumble` engrossa a fervura — o vulcão desmorona, a mesma
    // leitura do `uAmp × (1 + crumble·2,6)` do rig antigo)
    const crumble = 1 - alpha;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = pose.charge + flash * 0.6;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uCrumble.value = crumble;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.45 + pose.charge * 0.2 + flash * 0.35) * alpha);

    // uniforms do corpo (relevo de lava viva + crosta + carga no material da malha)
    const sh = body.userData.shader as
      | { uniforms: { uLT: { value: number }; uLA: { value: number }; uLCharge: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uLT.value = t;
      sh.uniforms.uLA.value = 0.02 * (0.8 + 0.2 * hpFrac) * (1 + flash * 0.6 + hurt * 0.5 + crumble * 2.6);
      sh.uniforms.uLCharge.value = pose.charge;
    }
    // os RIOS DE LAVA pulsam devagar (o crackGlow respirando do rig antigo) e
    // ACRESCITA na carga do matacão (a cratera clareia como erupção)
    const lavaPulse = 0.5 + 0.2 * Math.sin(t * 0.9 + seed) + pose.charge * 1.4 + flash * 0.8;
    body.emissiveIntensity = Math.max(
      0,
      (0.5 + lavaPulse * 0.3 + hurt * 1.0) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + flash * 0.4 + pose.charge * 0.3));

    // brasas da cratera (o relógio, a morte e a carga — a espiral e o
    // esfriamento são todo do shader: vulcão expele, nunca em linha)
    embersGeo.mat.uniforms.uTime.value = t;
    embersGeo.mat.uniforms.uAlpha.value = alpha;
    embersGeo.mat.uniforms.uCharge.value = pose.charge + flash * 0.8;

    // brasas-faísca orbitando o corpo
    sparks.mat.uniforms.uTime.value = t;
    sparks.mat.uniforms.uAlpha.value = alpha;
    sparks.mat.uniforms.uCharge.value = pose.charge + flash;

    // brasas-pop do peito (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    pops.mat.uniforms.uTime.value = t;
    pops.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    pops.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: respiração da montanha, torção do arremesso, agachamento de
    // joelhos de pedra (o grupo que o rig antigo animava; a malha + o
    // invólucro + o núcleo herdam tudo junto) ----
    const sway = Math.sin(t * 0.45 + seed) * 0.016 + Math.sin(t * 1.0 + 1.7) * 0.006;
    const crouchY = 1 - pose.crouch * 0.05;
    const wilt = crumble * 0.6; // morrendo: a montanha desaba
    g.scale.set(
      (1 + pose.crouch * 0.04 + pose.flare * 0.02) * (1 + wilt * 0.3),
      crouchY - wilt * 0.45,
      (1 + pose.crouch * 0.04) * (1 + wilt * 0.3),
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.38 + seed * 0.6) * 0.008;
    g.rotation.x = pose.crouch * 0.04 - pose.twist * 0.1 + wilt * 0.18;
    g.position.y = Math.sin(t * 0.8 + seed) * 0.01 + pose.crouch * -0.02 - wilt * 0.3;
    g.position.z = pose.stepZ;

    // ---- clarão de brasa do peito + clarão do tranco (a erupção curta da
    // cratera do rig antigo, lida em sprites) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.4, 1.6 + lavaPulse * 0.12 + pose.charge * 0.5 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.025 * Math.sin(t * 1.55 + seed) + pose.charge * 0.08) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, craterY, frontZ * -(0.35 + 0.1 * s));
    const flashS = flash > 0 ? 0.9 + 1.3 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.25 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`)
    // para o envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.35;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.6 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.08));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 7.5 + seed);
    const orangeShard = starburstRefs.current[0];
    const paleShard = starburstRefs.current[1];
    if (orangeShard) {
      (orangeShard.material as THREE.MeshBasicMaterial).opacity = (0.12 + pose.charge * 0.06) * auraPulse * alpha;
    }
    if (paleShard) {
      (paleShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -0.7);
    coreGlow.scale.setScalar(0.5 + pose.charge * 0.16 + flash * 0.18);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.12 + pose.charge * 0.1 + flash * 0.12) * alpha;

    // clarão da boca da cratera (o core glow do rig antigo, plantado na cratera
    // escalada — é a assinatura de "vulcão aceso" à distância)
    const craterGlow = craterGlowRef.current;
    craterGlow.position.set(0, craterY + 0.1 * s, 0);
    craterGlow.scale.setScalar(Math.max(0.55, (0.7 + pose.charge * 0.5 + pose.flare * 0.15) * s));
    (craterGlow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.03 * Math.sin(t * 1.9 + seed) + pose.charge * 0.12 + flash * 0.15) * alpha,
    );
  });

  const craterGlowRef = useRef<THREE.Sprite>(null!);

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={MAGMA_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* invólucro de brasa: a MESMA malha vestida com as trincas do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* brasas que SOREM da cratera (os mesmos shaders do rig antigo) */}
      <points geometry={embersGeo.geo} material={embersGeo.mat} frustumCulled={false} />
      {/* brasas-faísca orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
      {/* brasas-pop: estalos de lava que saltam do peito e morrem esfriando */}
      <points geometry={pops.geo} material={pops.mat} position={[0, coreY, 0]} frustumCulled={false} />
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
              opacity={i === 0 ? 0.22 : 0.16}
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
      <sprite ref={coreGlowRef} position={[0, coreY, -0.7]} scale={0.5} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffbe55"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={craterGlowRef} position={[0, 2.9, 0]} scale={0.8}>
        <spriteMaterial
          map={circleTexture()}
          color="#ff7a2a"
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.7}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffa04a"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} position={[0, 2.9, -1.0]} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffe3b8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      {/* sem anéis de chão: o vulcão nunca os teve (e a placa inventada
          arriscaria a infla √2 da sonda se girasse) */}
    </group>
  );
}
