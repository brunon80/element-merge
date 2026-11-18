import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SAND_URL } from './modelUrls';
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
import { SummonReveal, SummonSigil } from './SummonFX';
import {
  attackPose,
  GRIT_FRAG,
  makeGritGeo,
  SAND_ATTACK_WINDOW,
  SAND_WINDUP,
  type SandRigProps,
} from './SandRig';

/**
 * AREIA DE MALHA 3D IMPORTADA — O GOLEM DE AREIA (Nv.6): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/sand/sand.glb` —
 * 30.560 vértices NÃO-indexados, UMA malha com UMA textura 2048²; PLY
 * re-empacotado, SEM ossos e SEM animação no arquivo): o colosso de areia
 * compactada com faixa-em-redemoinho cruzando o peito, ombros de duna e a
 * cauda de estilhaços atrás. Enquanto a malha desce (demanda), o SELO DE
 * INVOCÇÃO (`SummonFX`) segura o buraco — o gênio do deserto do `SandRig`
 * nunca mais pipoca no campo (ficou só doador de efeitos e coreografia) — e
 * TODOS os efeitos da areia continuam vivos por cima da malha, no mesmo
 * idioma dos oito figurinos da linha "modelos 3D":
 *
 *  1. AREIA BRILHANTE no material da malha (o pedido do usuário para esta
 *     espécie): `onBeforeCompile` com o ruído de `flameShaders.ts` — o GRÃO
 *     ESCORREGENDO devagar pelas encostas como avalanche (na normal SOLDADA,
 *     `aDispNrm`, lição das rachaduras do golé) + a MICA DO DESERTO: fagulhas
 *     duras de ouro que PISCAM por toda a casca, acendendo no ângulo rasante
 *     (a mica do `sandShaders` lida na pintura do GLB — o "brilho" é creme
 *     ocre, nunca #ffe*: o gatilho do blowout);
 *  2. VÉU DE GRÃO (o antigo abraçando o novo): uma casca da MESMA malha,
 *     inflada pelo `SHELL_HUG`, vestida com as FITAS EM ESPIRAL subindo pelo
 *     corpo (o véu de turbilhão do `SandRig`: fitas de grão em suspensão) e a
 *     CROSTA DE MICA que engrossa quando ele recolhe a rajada nas garras;
 *     aditiva e translúcida por cima da textura. SEM aro na cor da equipe — a
 *     regra da nuvem do rig antigo (o véu é ocre em todos os canais).
 *  3. os efeitos da areia religados no CORE da malha (o peito colossal, no
 *     meio da caixa; a cauda-funil é a metade de BAIXO): a chuva de GRÃOS que
 *     DESPRENDEM da cauda do rig antigo (a MESMA casca dura de disco, régua
 *     escalada pelo encaixe), o halo de grão ORBITANDO o corpo (não acima
 *     dele — lição da trovoada; metade gira para o lado oposto), os estalos de
 *     grão que saltam do core e somem, o pool de lufadas de poeira exalando
 *     do peito, a auréola de estilhaços âmbar+ocre, a POEIRA CONTÍNUA na base
 *     (a cauda nunca de vazando grão — heat 0,14 ocre) e a RAJADA DE POEIRA
 *     nos pés no instante do disparo (heat 0,16, empurrando para FRENTE, a
 *     MESMA assinatura do rig procedural) — mais a rajada dupla do motor
 *     (doubleShot: o recole curto de re-carga 0,3 s depois).
 *
 * A coreografia é a MESMA timeline do motor (janela 0,6 s: torce recolhendo o
 * vendaval, o gênio SOBE porque a cauda encolhe do chão → varre para frente
 * disparando) lida de `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara
 * o mesmo show. Sem ossos aqui: a areia nunca teve esqueleto procedural (o rig
 * animava o GRUPO raiz — flutuação do gênio, torção do vendaval) e a malha
 * herda esse grupo exatamente como as parts herdavam.
 *
 * ENCAIXE: o topo autoral da forma (3,7) daria escala 1,88 na caixa da malha
 * (y −0,999..+0,974) mas a LADEIRA do X aperta antes — o TETO da linha de
 * `data/footprints.ts` manda (mesmo precedente do Raio/Ancient Tree/Ice Cube/
 * Magmar): a malha encosta em `MEDIDO.areia` (que já estava assinada em 1,9
 * quadrado) com o abraço do invólucro, e os efeitos (grãos, anéis de chão,
 * auréola) moram dentro dessa mesma linha. O GLB encara o inimigo no +Z (rumo
 * 0 — o PEITORAL e o abdômen esculpidos em areia conferidos na primeira vista
 * do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`, painel "frente (+Z)"; as
 * fitas e os estilhaços da cauda pendem para trás); o `slotFit` da família
 * (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const AREIA_DEF = getSpecies('areia');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(AREIA_DEF, AREIA_DEF.levelMin);


/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (`qa/mesh-viewer-shot.mjs`, 17/nov — painel superior esquerdo =
 * frente +Z) mostrou o PEITORAL/abdômen esculpidos e a faixa de redemoinho
 * cruzando o peito no +Z, com os estilhaços da cauda pendendo para as costas
 * — como as demais malhas da linha. Se um GLB substituto vier virado, vire aqui.
 */
export const SAND_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): o deslocamento do véu de
 * grão para fora. MESMO 0,13 dos invólucros de chama/trovoada/raízes/geada/
 * brasa — e a sonda de footprint lê a caixa CPU e NÃO vê essa infla, então ela
 * mora na linha da tabela.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do colosso em PORCENTAGEM da altura da malha: o core dos efeitos
 * mora no peito colossal (o gênio tem cintura estreita e peito enorme — o
 * truque de escala da casa), uma régua ABAIXO do meio geométrico. É a régua de
 * CORE_Y: clarões, lufadas, estalos e auréola nascem dessa altura; os grãos
 * caem das bandas da cauda (`TAIL_FRAC`).
 */
const CORE_FRAC = 0.5;

/** topo das bandas da cauda-funil em PORCENTAGEM da altura (de lá o grão solta) */
const TAIL_FRAC = 0.55;

/** brasa base do emissivo (o âmbar baixo pintado nos veios de avalanche) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#b9772f');
const EMISSIVE_FLASH = new THREE.Color('#fff0d0');

/**
 * VERTEX da chuva de GRÃOS DA CAUDA na régua ESCALADA da malha (o `GRIT_VERT`
 * do rig antigo é amarrado às medidas do gênio procedural; aqui tudo sai das
 * uniforms, com raio e altura em metros DO MODELO × encaixe): cada grão sai de
 * uma banda do funil, CAI em arco até o chão e é sorteado por partícula — o
 * charge arranca mais grão (a rajada rasgando a própria cauda). A casca dura é
 * o MESMO `GRIT_FRAG` exportado (disco de borda seca: grão, não fiapo de nuvem).
 */
const MGRIT_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uTailH;
uniform float uR0;
uniform float uR1;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.3 + 0.4 * aRand.z;
  float prog = fract(uTime * speed * 0.45 + aRand.y);
  // sai de uma banda do funil (raio cresce para baixo) e CAI em arco
  float ang = aRand.x * 6.28318 + prog * (1.5 + 2.0 * aRand.z) + uTime * 0.5;
  float y = mix(uTailH * (0.35 + 0.6 * aRand.z), 0.02, prog);
  float r = mix(uR0 + uR0 * 0.4 * aRand.z, uR1, prog * 0.7);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (1.6 + 2.4 * aRand.z) * uSizeMul * (1.0 + uCharge * 0.35);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.7, 0.98, prog)) * uAlpha;
  // ocre do grão com quina clara iluminada (sem blowout)
  vC = mix(vec3(0.86, 0.66, 0.36), vec3(1.0, 0.87, 0.6), uCharge * 0.5 + 0.25 * aRand.z);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do HALO DE GRÃO ORBITANDO o colosso (o MESMO esqueleto das faíscas
 * da trovoada/esporos do ancião/brasas do colosso, re-ancorado na duna): cada
 * partícula orbita numa faixa própria do corpo (da base ao topo da cabeça,
 * nunca acima dela — lição da trovoada), com raio e altura tremendo em
 * senóides desencontradas (caos) e um estalo de hash (o grão que pisca na
 * luz). Metade do enxame gira para o lado oposto.
 */
const SGRAIN_VERT = /* glsl */ `
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
  // sinal sorteado: metade do halo gira para um lado, metade para o outro (caos)
  float dir = 0.5 - step(0.5, fract(aRand.z * 3.77));
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.4);
  float r = mix(uR1, uR2, aRand.z) * (0.82 + 0.3 * sin(uTime * 1.9 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.13 * sin(uTime * 2.4 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // grão PISCA na luz: hash de alta frequência com aleatoriedade por partícula
  float flick = step(0.5, fract(sin(floor(uTime * (11.0 + 13.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.6 + 2.4 * aRand.z) * (0.75 + 0.45 * flick) * uSizeMul * (1.0 + uCharge * 0.5);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = flick * uAlpha * (0.5 + 0.3 * uCharge);
  // ocre do grão + quina creme iluminada; a que pisca vira ouro
  vec3 tint = mix(vec3(0.72, 0.55, 0.3), vec3(0.98, 0.82, 0.55), step(0.6, fract(aRand.y * 7.13)));
  vC = mix(tint, vec3(1.0, 0.86, 0.5), flick * 0.5) * 0.9;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do ESTALO DE GRÃO do coração: cada partícula (posição = direção
 * unitária do estalo, `aRand` = sorteios por partícula) roda num ciclo próprio
 * e só vive a janela do pop — abre num estalo, salta do colosso para fora e
 * morre desbotando; o resto do tempo vA=0 (o fragmento descarta). `uCharge`
 * acelera e engorda o estalo na hora de recolher a rajada (o MESMO mecanismo
 * das faíscas da trovoada, vestido de grão dourado).
 */
const SPOP_VERT = /* glsl */ `
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
  float cyc = uTime * (1.4 + 2.6 * aRand.z) * (1.0 + uCharge * 1.1) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.24 + 0.16 * aRand.y; // janela do pop (quanto do ciclo o grão vive)
  float off = step(w, k); // fora da janela: apagado
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.35 + 0.65 * step(0.3, fract(sin(floor(cyc * (24.0 + 22.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.0 + 2.8 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.6);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  // grão dourado esfriando para ocre no fim do arco
  vC = mix(vec3(1.0, 0.84, 0.52), vec3(0.7, 0.53, 0.28), life * 0.8);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VÉU DE GRÃO (o antigo abraçando o novo): a casca de turbilhão do rig
 * procedural, deslocada para fora com o `uHug` + fervura em PATAMAR (o grão
 * agregado em placas — duna não derrete em onda larga de água) por cima da
 * textura. Renderizada aditiva e translúcida: só as FITAS EM ESPIRAL subindo
 * pelo corpo (o véu do deserto: fitas de grão em suspensão, ocre em todos os
 * canais), as MICAS que piscam e o halo de poeira acendem; o resto do corpo lê
 * pela pintura do GLB. A CROSTA DE MICA engrossa quando ele recolhe a rajada.
 * SEM aro na cor da equipe (a regra da nuvem do rig antigo).
 */
const VEIL_SHELL_VERT = /* glsl */ `
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
  float n1 = fbm(vLocal * 2.1);
  // placa dura em patamar: a duna esboroada em lajes de areia (grão agregado,
  // não onda lisa — a lição do grão escorregando)
  float k = step(0.5, fnoise(vLocal * 4.5 + vec3(0.0, uTime * 0.2, 0.0)));
  float amp = uAmp * (1.0 + uHurt * 0.2 + uCrumble * 2.8) * (1.0 + uCharge * 0.6);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.2 + (k - 0.5) * 0.9) * amp);
  // crosta de mica: flocos duros que engrossam quando ele recolhe a rajada
  float rime = step(0.5, fnoise(vLocal * 3.4 + vec3(0.0, uTime * 0.35, 0.0) + uSeed));
  pos += nrm * rime * (0.004 + uCharge * 0.012);
  vN1 = n1;
  vNrm = normalMatrix * nrm;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const VEIL_SHELL_FRAG = /* glsl */ `
uniform vec3 uRibbon;
uniform vec3 uMica;
uniform vec3 uCool;
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
  // fitas EM ESPIRAL subindo pelo corpo (o véu de turbilhão do rig antigo: o
  // ângulo polar + a altura + o ruído viram fitas inclinadas que sobem)
  float ang = atan(vLocal.z, vLocal.x);
  float spiral = sin(ang * 2.0 + vLocal.y * 4.2 - uTime * (1.6 + uCharge * 1.8) + fnoise(vLocal * 2.4 + uSeed) * 2.2);
  float ribbon = smoothstep(0.55, 0.86, spiral) * (1.0 - smoothstep(0.9, 1.05, spiral));
  vec3 col = uRibbon * ribbon * (0.5 + uCharge * 1.0);
  // micas piscando (o "brilho" do grão: flocos duros que acendem e apagam)
  float micaOn = step(0.62, fnoise(vLocal * 7.5 + vec3(uTime * 1.1) + uSeed));
  float micaGate = step(0.7, fnoise(vLocal * 2.2 - vec3(uTime * 0.7) + uSeed));
  col += uMica * micaOn * micaGate * (0.1 + uCharge * 0.4) * 0.7;
  // halo de poeira (ocre, NUNCA tint de equipe — a regra da nuvem) + fita
  // clara no aro + o núcleo âmbar do meio do corpo
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uCool * rim * 0.2;
  col += uRibbon * rim * (0.08 + uCharge * 0.2);
  col += uMica * rim * (0.05 + uCharge * 0.14);
  col = mix(col, vec3(1.0, 0.94, 0.8), uHurt * 0.4); // flash de dano
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
 * Dispatcher da Areia: Nv.6 = a malha importada do golem de areia; enquanto
 * ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO
 * segura o buraco — o figurino do deserto antigo nunca mais aparece no campo
 * (a lição da troca: o monstro velho pipocando antes da malha desvaloriza o
 * print; o `SandRig` antigo ficou só doador de efeitos).
 */
export function SandRig(props: SandRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="areia" url={SAND_URL} seed={props.seed} />}>
      <SummonReveal species="areia" seed={props.seed}>
        <SandMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function SandMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq, smoke }: SandRigProps) {
  const { scene } = readModel(SAND_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/charge não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${SAND_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ o relevo de grão não rasgar nas arestas — a malha é a MAIS
    // soldada da linha (4.114 soldas duras >60° na leitura crua do GLB;
    // qa/probe-cracks.mjs conta 14,8 mil pares de vértices coincidentes)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do colosso (peito colossal) e o topo das bandas da cauda: as
      // duas origens dos efeitos
      coreY: CORE_FRAC * spanY, // local na base do rig (base no y 0 local antes do fit)
      tailH: TAIL_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: o TETO da linha de `MEDIDO` manda (a LADEIRA do X aperta
  // antes do teto de altura — ver o doc no topo); plantado com a base no y 0
  // local, centro do corpo no eixo do rig; o offset compensa a rotação de rumo
  // (matriz T·R·S) e a AABB é a EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('areia', AREIA_DEF.levelMin as MonsterLevel);
    const yaw = SAND_MODEL_YAW;
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

  // alturas locais dos dois corações (peito colossal + bandas da cauda): a base
  // da malha já fica plantada no y 0 do rig (o `pos` do fit levanta a base crua
  // até o chão), então moram na própria porcentagem da caixa escalada — SEM
  // somar `pos[1]` de novo (a lição do Raio: somar de novo deixava o enxame
  // flutuando acima da malha)
  const s = fit.s;
  const coreY = src.coreY * s;
  const tailH = src.tailH * s;

  // material por instância: textura do GLB + AREIA BRILHANTE — o grão
  // escorregando no relevo e as MICAS piscando (o pedido do usuário), via
  // onBeforeCompile com o MESMO ruído de flameShaders.ts; a pintura do GLB já
  // traz o ocre da duna e a faixa de redemoinho
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // um dedo de metal e a rugosidade mais baixa que a pedra: a mica do
      // deserto pede REFLEXO seco de grão (sem virar plástico molhado)
      roughness: 0.52,
      metalness: 0.12,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.16,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uST = { value: 0 };
      sh.uniforms.uSA = { value: 0.018 };
      sh.uniforms.uSSeed = { value: seed };
      sh.uniforms.uSCharge = { value: 0 };
      sh.vertexShader =
        `uniform float uST;\nuniform float uSA;\nuniform float uSSeed;\nuniform float uSCharge;\nvarying vec3 vSand;\nvarying float vGrain;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // o GRÃO ESCORRENDO devagar pelas encostas (a avalanche do sandShaders
          // rastejando na casca INTEIRA): é isso que faz a tinta do GLB parecer
          // duna viva, não argila pintada
          float fn = fbm(transformed * 2.8 + vec3(0.0, -uST * 0.55, 0.0) + uSSeed);
          // o grão sai pela NORMAL SOLDADA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): na aresta dura do GLB cada cópia do mesmo ponto
          // sairia para o lado da sua normal própria e abriria as "rachaduras"
          // (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uSA * 2.0;
          // CROSTA DE MICA: flocos duros em patamar que engrossam quando ele
          // recolhe a rajada nas garras (o gênio arreia de brilho antes do tiro)
          float rime = step(0.5, fnoise(transformed * 3.4 + vec3(0.0, uST * 0.35, 0.0) + uSSeed));
          transformed += aDispNrm * rime * (0.003 + uSCharge * 0.01);
          // vSand: posição local p/ a mica calcular; vGrain: o veio de avalanche
          vSand = position;
          vGrain = fbm(transformed * 5.0 + vec3(uST * 1.4) + uSSeed);`,
        );
      sh.fragmentShader =
        'uniform float uST;\nuniform float uSCharge;\nvarying vec3 vSand;\nvarying float vGrain;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          // o veio de avalanche (quase apagado — a duna é seca, não derretida)
          float av = smoothstep(0.48, 0.53, vGrain) * (1.0 - smoothstep(0.56, 0.62, vGrain));
          totalEmissiveRadiance *= 1.0 + uSCharge * 1.0 + av * (0.5 + uSCharge * 1.8) + 0.25 * max(0.0, vGrain - 0.58);
          // AREIA BRILHANTE (o pedido do usuário): fagulhas DURAS de mica que
          // piscam por grão — grade 3D de células duras, sorteio por célula,
          // janelas que acendem e apagam num ciclo rápido (o cintilar do ouro
          // no sol do deserto), e acendem mais no ÂNGULO RASANTE (mica que
          // pega a luz de lado). Ocre-creme, nunca #ffe*: o gatilho do blowout.
          vec3 cell = floor(vSand * 46.0);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float live = step(0.9, h); // só uma em cada dez células é mica
          float cyc = fract(uST * (1.4 + 2.4 * fract(h * 13.13)) + h * 9.1);
          float blink = smoothstep(0.0, 0.18, cyc) * (1.0 - smoothstep(0.34, 0.62, cyc));
          float glint = dot(normal, normalize(vViewPosition));
          float graze = pow(1.0 - abs(clamp(glint, -1.0, 1.0)), 2.0); // clamp p/ pow (lição WebKit)
          float mica = live * blink * (0.4 + 0.9 * graze) * (0.55 + uSCharge * 0.9);
          totalEmissiveRadiance += vec3(1.0, 0.84, 0.5) * mica * 0.7;`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // VÉU: a casca de turbilhão (shader próprio acima) por cima da textura — um
  // material por unidade. SEM tint de equipe (a regra da nuvem do rig antigo)
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VEIL_SHELL_VERT,
        fragmentShader: VEIL_SHELL_FRAG,
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
          uCrumble: { value: 0 },
          uAlpha: { value: 0.4 },
          uRibbon: { value: new THREE.Color('#9c7130') }, // fita de grão em suspensão (ocre fundo)
          uMica: { value: new THREE.Color('#ffcf7a') }, // ouro da mica
          uCool: { value: new THREE.Color('#a9853f') }, // poeira do halo
        },
      }),
    [seed],
  );

  // ---- os efeitos da areia, religados nos dois corações da malha ----

  // chuva de GRÃOS DA CAUDA (a MESMA casca dura `GRIT_FRAG` do rig antigo, com
  // a régua do funil escalada pelo encaixe): o gênio nunca de vazando grão
  const gritCount = embers ?? 22;
  const grit = useMemo(
    () => ({
      geo: makeGritGeo(gritCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: MGRIT_VERT,
        fragmentShader: GRIT_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uTailH: { value: tailH },
          uR0: { value: s * 0.42 },
          uR1: { value: s * 0.95 },
        },
      }),
    }),
    [gritCount, emberScale, tailH, s],
  );

  // halo de grão ORBITANDO o colosso: faixas do corpo (da base à cabeça),
  // nunca acima da malha; metade gira para o lado oposto (caos da lição) e o
  // turbilhão do gênio é CADÊNCIA DE VENTO (spin 2,6 — o mesmo do véu da cauda)
  const grains = useMemo(
    () => ({
      geo: makeSparkGeo(30),
      mat: new THREE.ShaderMaterial({
        vertexShader: SGRAIN_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.2 * s },
          uY1: { value: src.spanY * s - 0.12 * s },
          uR1: { value: s * 0.6 },
          uR2: { value: s * 0.86 },
          uSpin: { value: 2.6 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // ESTALOS-POP do coração: cada partícula é um grão que estala do peito e
  // some — num ciclo próprio vive ~25% do tempo, saltando para fora num
  // abrir-e-fechar. A régua do voo mora entre a casca (s×0,4) e por baixo do
  // anel externo (s×0,9), então o pop nunca encosta na linha do buraco.
  const pops = useMemo(() => {
    const n = 28;
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
      pos[i * 3] = Math.cos(az) * rr * 1.0; // o colosso é largo...
      pos[i * 3 + 1] = z * 1.05; // ...e alto de peito
      pos[i * 3 + 2] = Math.sin(az) * rr * 0.6; // ...mas FUNDO fino (cauda)
      rnd[i * 3] = rand();
      rnd[i * 3 + 1] = rand();
      rnd[i * 3 + 2] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    return {
      geo,
      mat: new THREE.ShaderMaterial({
        vertexShader: SPOP_VERT,
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

  // lufadas do peito: mini-cuspes de poeira de grão aditivas exalando do core
  // para fora (o vendaval contido do gênio)
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#d9b26a',
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

  // auréola de estilhaços (âmbar + ocre queimado — o projétil-assinatura do
  // gênio é lufa-swirl de grão com núcleo compactado) no coração
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 24, '#e89a3a'),
      makeStarburstGeo(seed + 7.4, 16, '#d9b26a'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of bursts.mats) m.dispose();
      grit.geo.dispose();
      grit.mat.dispose();
      grains.geo.dispose();
      grains.mat.dispose();
      pops.geo.dispose();
      pops.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, bursts, grit, grains, pops, starburstGeos]);

  /** dispara uma lufada do peito (volley = salvas da rajada, mais compridas) */
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
  const dustAcc = useRef(0);
  const strikesDone = useRef(new Set<number>());
  const kicksDone = useRef(new Set<number>());

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
      if (demoT.current > SAND_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const windupEnd = SAND_WINDUP * SAND_ATTACK_WINDOW;
    const releasing = sinceAttack >= windupEnd && sinceAttack <= SAND_ATTACK_WINDOW;
    // o clarão da rajada nasce no release e some em ~0,3 s (a varredura das
    // garras do rig antigo; aqui alimenta clarão/lufadas/poeira)
    const flash = releasing ? Math.max(0, 1 - (sinceAttack - windupEnd) / 0.3) : 0;

    // RAJADA DE POEIRA nos pés no instante do disparo (a assinatura do rig:
    // poeira OCRE quente — heat 0,16, nunca fuligem cinza — EMPURRADA para
    // frente pela rajada) + salva de lufadas + a poeira do 2º tiro do
    // doubleShot (o recole de re-carga 0,3 s depois)
    const kickKey = sinceAttack >= 0 ? Math.round((sinceAttack - 0.3) * 20) : -1;
    const kick = releasing && sinceAttack >= 0.3 && sinceAttack <= 0.48 && kickKey >= 0;
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
        for (let i = 0; i < 7; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.6 * s, coreY + (Math.random() - 0.5) * 0.6 * s, frontZ * (0.6 + Math.random() * 0.7) * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.1 + Math.random() * 0.06,
            heat: 0.16, // poeira OCRE quente (nunca fuligem cinza)
            life: 0.8 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.2,
            rise: 0.15,
            drag: 3.0,
            vx: (Math.random() - 0.5) * 1.6,
            vz: 0.8 + Math.random() * 1.6, // a rajada empurra para frente
          });
        }
      }
    }
    if (kick && !kicksDone.current.has(kickKey)) {
      kicksDone.current.add(kickKey);
      if (kicksDone.current.size > 8) kicksDone.current.clear();
      spawnBurst([0, 0.2, frontZ], true);
      if (smoke) {
        g.updateWorldMatrix(true, false);
        for (let i = 0; i < 3; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.2 * s, coreY + (Math.random() - 0.5) * 0.5 * s, frontZ * (0.5 + Math.random() * 0.6) * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.08 + Math.random() * 0.05,
            heat: 0.16,
            life: 0.7 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.15,
            drag: 3.0,
            vx: (Math.random() - 0.5) * 1.4,
            vz: 0.8 + Math.random() * 1.4,
          });
        }
      }
    }

    // a cauda NUNCA para de vazar grão: poeirinha na base do funil (o grão é
    // SUSPENSO pelo turbilhão — rise 0,35, a anti-gravidade do gênio)
    if (smoke && alpha > 0.3) {
      dustAcc.current += dt * (0.9 + 0.9 * pose.charge) * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 3) {
        dustAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        const ang = Math.random() * 6.283;
        const r = (0.55 + Math.random() * 0.5) * s;
        tmpWorld
          .set(Math.cos(ang) * r, 0.1 + Math.random() * 0.5 * s, Math.sin(ang) * r)
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + Math.random() * 0.04,
          heat: 0.14,
          life: 1.0 + Math.random() * 0.6,
          lifeVar: 0.35,
          jitter: 0.16,
          rise: 0.35,
          drag: 2.4,
        });
      }
      if (dustAcc.current > 2) dustAcc.current = 2;
    }
    // exalação contínua do peito: bafo de poeira para todos os lados, dobrando
    // de cadência quando ele recolhe a rajada
    if (alpha > 0.25) {
      burstAcc.current += dt * (2.4 + pose.charge * 6.0) * (0.7 + 0.3 * hpFrac);
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
        // nascem DENTRO do colosso e furam o véu: raio de saída na régua da
        // malha (enxuto: a sonda pega a lufada no pico e o invólucro todo tem
        // que morrer dentro do anel)
        const r0 = s * 0.5 + grow * s * 0.16;
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, coreY + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 46);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad);
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * (d.volley ? 0.65 : 0.75);
        mat.color.set(d.volley ? '#e8c68f' : i % 2 === 0 ? '#d9b26a' : '#c98f3e');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do véu (carga acende fitas/crosta; morte esvazia E DESMANCHA em
    // areia: `uCrumble` engrossa a fervura — a mesma leitura do `uAmp ×
    // (1 + crumble·2,8)` do rig antigo)
    const crumble = 1 - alpha;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = pose.charge + flash * 0.6;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uCrumble.value = crumble;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.4 + pose.charge * 0.2 + flash * 0.3) * alpha);

    // uniforms do corpo (grão escorrendo + crosta de mica + carga no material
    // da malha)
    const sh = body.userData.shader as
      | { uniforms: { uST: { value: number }; uSA: { value: number }; uSCharge: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uST.value = t;
      sh.uniforms.uSA.value = 0.018 * (0.8 + 0.2 * hpFrac) * (1 + flash * 0.5 + hurt * 0.5 + crumble * 2.8);
      sh.uniforms.uSCharge.value = pose.charge;
    }
    // a duna respira devagar (o `flowGlow` quase apagado do rig) e o BRILHO da
    // mica ACRESCE na carga da rajada — o ouro do deserto se acendendo
    const sandBreath = 0.4 + 0.2 * Math.sin(t * 0.55 + seed) + pose.charge * 1.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.16 + sandBreath * 0.1 + flash * 0.5 + hurt * 0.8) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + flash * 0.25 + pose.charge * 0.2));

    // chuva de grãos da cauda (o relógio, a morte e a carga — o arco e o
    // sorteio são todo do shader: grão com arrasto, nunca em linha)
    grit.mat.uniforms.uTime.value = t;
    grit.mat.uniforms.uAlpha.value = alpha;
    grit.mat.uniforms.uCharge.value = pose.charge + flash * 0.5;

    // halo de grão orbitando o corpo (o turbilhão DOBRA na rajada)
    grains.mat.uniforms.uTime.value = t;
    grains.mat.uniforms.uAlpha.value = alpha;
    grains.mat.uniforms.uCharge.value = pose.charge + flash;

    // estalos-pop do peito (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    pops.mat.uniforms.uTime.value = t;
    pops.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    pops.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: FLUTUAÇÃO do gênio (a cauda encolhe do chão na carga e ele
    // SOBE), torção do vendaval, afundar o peito no tiro, afundar no chão na
    // morte (o grupo que o rig antigo animava; a malha + o véu herdam tudo) ----
    const sway = Math.sin(t * 0.45 + seed) * 0.02 + Math.sin(t * 1.0 + 1.7) * 0.007;
    const wilt = crumble * 0.7; // morrendo: o gênio DESMONTA em areia
    g.scale.set(
      (1 + pose.flare * 0.02) * (1 + wilt * 0.3),
      (1 - pose.rise * 0.015) - wilt * 0.5,
      (1 + pose.flare * 0.02) * (1 + wilt * 0.3),
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.36 + seed * 0.6) * 0.009 + wilt * 0.1;
    g.rotation.x = -pose.rise * 0.02 - pose.twist * 0.08 + wilt * 0.2;
    g.position.y =
      Math.sin(t * 0.8 + seed) * 0.05 + pose.rise * 0.14 - pose.doubleKick * 0.04 - wilt * 0.35;
    g.position.z = pose.stepZ;

    // ---- clarão âmbar do peito + clarão da rajada (o núcleo aceso DENTRO da
    // duna do rig antigo: SÓBRIO, nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.3, 1.5 + sandBreath * 0.1 + pose.charge * 0.4 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + 0.02 * Math.sin(t * 1.4 + seed) + pose.charge * 0.06) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.7 + 0.16 * s));
    const flashS = flash > 0 ? 0.8 + 1.2 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.2 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para
    // o envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.35;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.58 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.1));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.8 + seed);
    const amberShard = starburstRefs.current[0];
    const dustShard = starburstRefs.current[1];
    if (amberShard) {
      (amberShard.material as THREE.MeshBasicMaterial).opacity = (0.1 + pose.charge * 0.06) * auraPulse * alpha;
    }
    if (dustShard) {
      (dustShard.material as THREE.MeshBasicMaterial).opacity = (0.07 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -0.7);
    coreGlow.scale.setScalar(0.5 + pose.charge * 0.16 + flash * 0.16);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.08 + pose.charge * 0.1 + flash * 0.1) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={SAND_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* véu de grão: a MESMA malha vestida com as fitas espiral do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* chuva de grãos desprender da cauda (a MESMA casca dura do rig antigo) */}
      <points geometry={grit.geo} material={grit.mat} frustumCulled={false} />
      {/* halo de grão orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={grains.geo} material={grains.mat} frustumCulled={false} />
      {/* estalos-pop: grãos que saltam do peito e morrem desbotando */}
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
              opacity={i === 0 ? 0.2 : 0.15}
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
      {/* SEM anéis de chão: o gênio do rig antigo nunca teve anéis de duna no
          tabuleiro (mesma régua do Magmar — só se re-ancora o que o rig antigo
          de fato tinha; e torus girando infla a leitura da sonda até √2×) */}
      <sprite ref={coreGlowRef} position={[0, coreY, -0.7]} scale={0.5} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffcf7a"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.6}>
        <spriteMaterial
          map={circleTexture()}
          color="#e8c68f"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} position={[0, coreY, -1.2]} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#fff0d0"
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
