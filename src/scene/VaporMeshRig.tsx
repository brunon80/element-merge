import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { STEAM_URL } from './modelUrls';
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
  makeSteamRiseGeo,
  RISE_FRAG,
  STEAM_LOOK,
  VAPOR_ATTACK_WINDOW,
  VAPOR_WINDUP,
  type VaporRigProps,
} from './VaporRig';

/**
 * VAPOR DE MALHA 3D IMPORTADA — A MÁQUINA A VAPOR (Nv.6): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/steam/steam.glb` —
 * 27.950 vértices NÃO-indexados, UMA malha com UMA textura 2048²; PLY
 * re-empacotado, SEM ossos e SEM animação no arquivo): o robô-caldeira de
 * chapa enferrujada com o portal de fogo aceso no peito, as janelinhas de
 * água azul viva nas costuras e as CHAMINÉS nos ombros e na cabeça. Enquanto
 * a malha desce (demanda), o SELO DE INVOCÇÃO (`SummonFX`) segura o buraco —
 * o figurino da caldeira (`VaporRig`) nunca mais pipoca no campo (ficou só
 * doador de efeitos e coreografia) — e TODOS os efeitos do vapor continuam
 * vivos por cima da malha, no mesmo idioma dos demais figurinos da linha
 * "modelos 3D":
 *
 *  1. VAPOR SAINDO DAS PERNAS E BRAÇOS-OMBROS (o pedido do usuário para esta
 *     espécie): as colunas de vapor (`RISE_FRAG` do rig antigo, re-vestidas)
 *     agora parafusam nos CANOS QUE O GLB OFERECE — as duas chaminés dos
 *     ombros, a pilha da cabeça, os cotovelos e as juntas dos joelhos. Cada
 *     junta é um `points` plantado no próprio encaixe (o enxame sobe de
 *     y 0 LOCAL, torto e espiralando, esfriando do pêssego do braseiro para o
 *     branco-azulado); as chaminés também cospem no pool de fumaça (heat 0,22
 *     — vapor claro, nunca fuligem);
 *  2. CALDEIRA VIVA na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no
 *     emissivo — onde a tinta é AZUL (as costuras de água) a água FERVE com
 *     ondulação lenta + tremido de fervura; onde é LARANJA (o portal e a porta
 *     do fogo) a brasa ESTALA em sorteio duro; as chapas TREMEM com a
 *     fervura (tremer curto na normal SOLDADA, `aDispNrm`, lição das soldas —
 *     aqui só 747 soldas duras, a malha menos soldada do lote);
 *  3. VÉU DE VAPOR (o antigo abraçando o novo): casca da MESMA malha inflada
 *     pelo `SHELL_HUG`, vestida com fitas de nuvem subindo em espiral e a
 *     nuvem INTEIRA INCHANDO E CLAREANDO quando a caldeira carrega o jato (o
 *     `uCharge` do vapor no rig antigo); aditivo, branco-pêssego em todos os
 *     canais — SEM tint de equipe (a regra da nuvem do rig antigo).
 *
 * SEM o núcleo de água fervendo SÓLIDO do rig antigo (a bola achatada boiando
 * na boca): o GLB não tem boca aberta no topo — tem um portal redondo VERTICAL
 * no peito; religar a peça horizontal ali seria o mesmo gorro vermelho do
 * Magmar (a lição: só peça SÓLIDA com o MESMO encaixe físico). O portal fica
 * aceso com o clarão aditivo plantado na frente dele + os estalos de gotas
 * que saltam do peito + a leitura viva da pintura (item 2). Os gotas ferventes
 * em ÓRBITA da nuvem viram o halo de gotas escaldantes orbitando o corpo (não
 * acima dele — lição da trovoada); a baforada da boca virou baforada do peito
 * EMPURRADA para frente no disparo; e a morte é a ARREBENTAÇÃO em vaporada do
 * rig antigo (`uCrumble` engrossando o véu + a carga de morte inchando tudo).
 *
 * A coreografia é a MESMA timeline do motor (janela 0,62 s: a fervura sobe
 * devagar e segura no pico, ela AGACHA carregando o peso, o jato sai quase
 * junto com a varredura) lida de `lastAttackAt`, e o `demoAttackSeq` do
 * bestiário dispara o mesmo show. Sem ossos: o rig antigo animava o GRUPO
 * raiz (agachar, torcer, empurrar para frente) e a malha herda esse grupo.
 *
 * ENCAIXE: aqui o TETO DE ALTURA aperta antes da largura — `MEDIDO.vapor`
 * (2,06×1,85, o único degrau não-quadrado da linha, herdado do pote largo do
 * rig antigo) daria encaixe 2,14 pela frente, mas a caixa y −1,002..0,974 com
 * o topo autoral 3,6 segura tudo em 1,822. O GLB encara o inimigo no +Z local
 * (rumo 0 — o PORTAL DE FOGO e a plaqueta da cara saíram no painel "frente
 * (+Z)" do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`); o `slotFit` da
 * família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const VAPOR_DEF = getSpecies('vapor');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(VAPOR_DEF, VAPOR_DEF.levelMin);


/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (17/nov, `qa/mesh-viewer-shot.mjs`; painel superior esquerdo =
 * frente +Z) mostrou o PORTAL DE FOGO redondo no peito e a plaqueta da cara
 * no +Z — como as demais malhas da linha. Se um GLB substituto vier virado,
 * vire aqui.
 */
export const VAPOR_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): deslocamento do véu de
 * vapor para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa CPU e
 * NÃO vê essa infla, então ela mora na linha da tabela.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do robô em PORCENTAGEM da altura da malha: o PORTAL DE FOGO do
 * peito (a fornalha que o fogo lambia por dentro) mora um dedo ACIMA do meio
 * geométrico. É a régua de CORE_Y: clarões, estalos de gota, lufadas e bafo
 * nascem dessa altura.
 */
const CORE_FRAC = 0.58;

/**
 * ENCAIXES DOS CANOS DE VAPOR em coordenadas DO MODELO (a caixa crua vai de
 * y −1,002 a 0,974): as chaminés dos ombros (o pedido do usuário: ombros/
 * braços), a pilha da cabeça (o apito da caldeira nunca cala), os cotovelos
 * (as juntas dos braços vazando) e os joelhos (as pernas — vapor baixo e
 * rasteiro). Cada um vira um `points` plantado no encaixe escalado.
 */
const VENT_STACK: [number, number, number] = [0, 0.93, -0.04]; // chaminé da cabeça
const VENT_SHOULDER: [number, number, number] = [0.58, 0.74, 0.0]; // chaminés dos ombros
const VENT_ELBOW: [number, number, number] = [0.72, -0.05, 0.02]; // juntas dos cotovelos
const VENT_KNEE: [number, number, number] = [0.4, -0.3, 0.18]; // juntas dos joelhos

/** brasa base do emissivo (o portal de fogo pintado no peito) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#ff9a4d');
const EMISSIVE_FLASH = new THREE.Color('#fff2e0');

/**
 * VERTEX do VAPOR SUBINDO DE UM CANO: o fiapo do rig antigo (`RISE_VERT`)
 * re-vestido para nascer do y 0 LOCAL (o `points` é plantado no encaixe do
 * cano), subindo torto e ESPIRALANDO, alargando o leque e ESFRIANDO do
 * pêssego do braseiro para o branco-azulado. `uH` é a régua de coluna (a
 * chaminé da cabeça cospe alto; o joelho, rasteiro) e `uSpread` abre o leque
 * — `uCharge` acelera e engrossa a coluna no disparo (o MESMO mecanismo do
 * rig antigo nos ombros carregando o jato).
 */
const VENT_RISE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uH;
uniform float uSpread;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.22 + 0.3 * aRand.z;
  float prog = fract(uTime * speed * 0.28 * (1.0 + uCharge * 0.8) + aRand.y);
  // sobe torto e ESPIRALA (o vapor se enrola em si mesmo)
  float ang = aRand.x * 6.28318 + prog * (1.2 + 2.4 * aRand.z) + uTime * 0.25;
  float r = uSpread * (0.25 + 1.1 * prog * (0.5 + 0.7 * aRand.z));
  float y = prog * uH * (0.7 + 0.6 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // nuvem felpuda: ponto GRANDE e macio (não o pingo duro da brasa)
  float size = (5.5 + 9.0 * aRand.z) * (0.8 + uCharge * 0.6) * uSizeMul * (0.55 + prog * 0.7);
  // CLAMP: perto da câmera o sprite vira parede de vapor (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce denso no cano, desmancha no alto (a nuvem some virando fiapo)
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.45, 1.0, prog)) * uAlpha;
  // esfriando: pêssego do braseiro -> branco azulado
  vC = mix(vec3(1.0, 0.85, 0.66), vec3(0.87, 0.93, 0.98), smoothstep(0.0, 0.6, prog));
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do HALO DE GOTAS ESCALDANTES orbitando o robô (as gotas ferventes do
 * nuvento antigo, re-ancoradas na chapa): cada gota orbita numa faixa própria
 * do corpo (da base à cabeça, NUNCA acima da malha — lição da trovoada), com
 * raio e altura tremendo em senóides desencontradas e um lampejo duro (o
 * brilho molhado da gota na luz). Metade do enxame gira para o lado oposto.
 */
const SDROP_VERT = /* glsl */ `
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
  // sinal sorteado: metade gira para um lado, metade para o outro (caos)
  float dir = 0.5 - step(0.5, fract(aRand.z * 3.77));
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.4);
  float r = mix(uR1, uR2, aRand.z) * (0.85 + 0.25 * sin(uTime * 1.6 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 2.1 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // gota BRILHA molhada: lampejo duro de alta frequência sorteado por partícula
  float glint = step(0.5, fract(sin(floor(uTime * (10.0 + 12.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.2 + 2.6 * aRand.z) * (0.7 + 0.5 * glint) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.55 + 0.45 * glint) * uAlpha * (0.55 + 0.3 * uCharge);
  // azul-claro da água quente; a que lampeja vira branco-vapor
  vec3 tint = mix(vec3(0.62, 0.8, 0.92), vec3(0.93, 0.97, 1.0), step(0.6, fract(aRand.y * 7.13)));
  vC = mix(tint, vec3(1.0, 0.97, 0.93), glint * 0.45) * 0.95;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do ESTALO DE GOTAS do peito (a fervura entalada na chapa): cada
 * partícula (posição = direção unitária do estalo) roda num ciclo próprio e
 * só vive a janela do pop — abre num estalo, salta do robô para fora e morre
 * desbotando ESFRIANDO do pêssego escaldante para o branco-azulado. O
 * `uCharge` acelera e engorda o estalo quando a caldeira carrega o jato.
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
  float cyc = uTime * (1.3 + 2.4 * aRand.z) * (1.0 + uCharge * 1.2) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.22 + 0.16 * aRand.y; // janela do pop (quanto do ciclo a gota vive)
  float off = step(w, k); // fora da janela: apagada
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.4 + 0.6 * step(0.3, fract(sin(floor(cyc * (20.0 + 18.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.0 + 2.8 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.6);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  // gota escaldante esfriando no arco: pêssego -> branco-azulado
  vC = mix(vec3(1.0, 0.85, 0.66), vec3(0.78, 0.9, 0.98), life * 0.85);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VÉU DE VAPOR (o antigo abraçando o novo): a casca de nuvem do rig
 * procedural deslocada para fora com `uHug` + fervura em PLACA (as bolhas
 * grandes da água em ebulição — amp alto mas em PATAMAR duro, o contrário da
 * onda lisa) por cima da textura. Renderizada aditiva: só as FITAS DE NUVEM
 * subindo pelo corpo, o borrifo de fervura e a orla clara acendem; o resto
 * lê pela pintura do GLB. A nuvem INTEIRA INCHA E CLAREIA na carga do jato
 * (o `uCharge` do vapor do rig antigo) e ARREBENTA na morte (`uCrumble`).
 * Branco-pêssego em todos os canais — SEM aro na cor da equipe (a regra da
 * nuvem do rig antigo).
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
  float n1 = fbm(vLocal * 2.0);
  // bolha GROSSA em patamar: a fervura da caldeira (o amp alto do vapor
  // antigo — bolhas largas, mas NÃO montanhas: a panela não vira pão sovado)
  float k = step(0.42, fnoise(vLocal * 2.6 + vec3(0.0, uTime * 0.5, 0.0)));
  float amp = uAmp * (1.0 + uHurt * 0.2 + uCrumble * 2.8) * (1.0 + uCharge * 0.9);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.1 + (k - 0.42) * 1.4) * amp);
  // orvalho de fervura: pingos duros que engrossam quando ela carrega o jato
  float dew = step(0.55, fnoise(vLocal * 3.8 + vec3(0.0, uTime * 0.5, 0.0) + uSeed));
  pos += nrm * dew * (0.004 + uCharge * 0.014);
  vN1 = n1;
  vNrm = normalMatrix * nrm;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const VEIL_SHELL_FRAG = /* glsl */ `
uniform vec3 uRibbon;
uniform vec3 uWarm;
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
  // fitas de nuvem subindo pelo corpo (o turbilhão do nuvento antigo: fitas
  // inclinadas que sobem, cadência de vapor — mais lenta que a de vento)
  float ang = atan(vLocal.z, vLocal.x);
  float spiral = sin(ang * 2.0 + vLocal.y * 3.4 - uTime * (1.1 + uCharge * 1.6) + fnoise(vLocal * 2.2 + uSeed) * 2.4);
  float ribbon = smoothstep(0.5, 0.82, spiral) * (1.0 - smoothstep(0.88, 1.04, spiral));
  vec3 col = uRibbon * ribbon * (0.45 + uCharge * 1.0);
  // borrifo de fervura: pingos duros de luz que acendem e apagam (a água
  // estalando na chapa) — pêssego do braseiro
  float spkOn = step(0.66, fnoise(vLocal * 8.0 + vec3(uTime * 1.6) + uSeed));
  float spkGate = step(0.62, fnoise(vLocal * 2.4 - vec3(uTime * 0.9) + uSeed));
  col += uWarm * spkOn * spkGate * (0.12 + uCharge * 0.5) * 0.65;
  // orla de vapor (branco-pêssego, NUNCA tint de equipe — a regra da nuvem)
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uCool * rim * 0.22;
  col += uRibbon * rim * (0.08 + uCharge * 0.22);
  col = mix(col, vec3(1.0, 0.98, 0.95), uHurt * 0.4); // flash de dano
  // a nuvem INTEIRA incha e clareia na carga (o uCharge do vapor antigo)
  float a = uAlpha * (0.4 + 0.4 * vN1) * (1.0 + uCharge * 0.7);
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
 * Dispatcher do Vapor: Nv.6 = a malha importada da máquina a vapor; enquanto
 * ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO
 * segura o buraco — o figurino da caldeira antigo nunca mais aparece no
 * campo (a lição da troca: o monstro velho pipocando antes da malha
 * desvaloriza o print; o `VaporRig` antigo ficou só doador de efeitos).
 */
export function VaporRig(props: VaporRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="vapor" url={STEAM_URL} seed={props.seed} />}>
      <SummonReveal species="vapor" seed={props.seed}>
        <VaporMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function VaporMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq, smoke }: VaporRigProps) {
  const { scene } = readModel(STEAM_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/carga não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${STEAM_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ o tremido das chapas não rasgar nas arestas (747 soldas duras
    // na leitura crua — a menos soldada do lote; qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do robô: o PORTAL DE FOGO no peito (fornalha viva)
      coreY: CORE_FRAC * spanY, // local na base do rig (base no y 0 local antes do fit)
    };
  }, [scene]);

  // encaixe autoral: aqui o TETO DE ALTURA manda (3,6/1,976 = 1,822 aperta
  // antes da frente 2,06/0,97 = 2,14 — ver o doc no topo); plantado com a base
  // no y 0 local, centro do corpo no eixo do rig; o offset compensa a rotação
  // de rumo (matriz T·R·S) e a AABB é a EXATA da caixa girada. Os canos de
  // vapor (encaixes do MODELO) saem convertidos p/ o rig local junto.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('vapor', VAPOR_DEF.levelMin as MonsterLevel);
    const yaw = VAPOR_MODEL_YAW;
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
    const vent = (m: [number, number, number]): [number, number, number] => [
      m[0] * s + px,
      (m[1] - bb.min.y) * s,
      m[2] * s + pz,
    ];
    return {
      s,
      pos: [px, -bb.min.y * s, pz] as [number, number, number],
      // os cinco canos (espelhados nos lados): chaminé da cabeça, ombros,
      // cotovelos, joelhos — o VAPOR SAI DAS PERNAS E BRAÇOS-OMBROS (pedido)
      vents: {
        stack: vent(VENT_STACK),
        shoulder: [vent(VENT_SHOULDER), vent([-VENT_SHOULDER[0], VENT_SHOULDER[1], VENT_SHOULDER[2]])] as const,
        elbow: [vent(VENT_ELBOW), vent([-VENT_ELBOW[0], VENT_ELBOW[1], VENT_ELBOW[2]])] as const,
        knee: [vent(VENT_KNEE), vent([-VENT_KNEE[0], VENT_KNEE[1], VENT_KNEE[2]])] as const,
      },
    };
  }, [src]);

  // altura local do coração (portal do peito): a base da malha já fica
  // plantada no y 0 do rig, então mora na própria porcentagem escalada — SEM
  // somar `pos[1]` de novo (a lição do Raio)
  const s = fit.s;
  const coreY = src.coreY * s;

  // material por instância: textura do GLB + CALDEIRA VIVA — a leitura da
  // pintura no emissivo (as costuras AZUIS fervendo a água, o portal LARANJA
  // estalando a brasa) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // chapa enferrujada com as juntas molhadas: metal médio e rugosidade
      // de ferro gasto (a cal de areia lia plasticoso no robô)
      roughness: 0.46,
      metalness: 0.42,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.32,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uVT = { value: 0 };
      sh.uniforms.uVSeed = { value: seed };
      sh.uniforms.uVCharge = { value: 0 };
      sh.uniforms.uVHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uVT;\nuniform float uVSeed;\nuniform float uVCharge;\nuniform float uVHurt;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // as CHAPAS TREMEM com a fervura dentro (o tch-tch-tch da caldeira):
          // treme CURTO e sorteado por chapa (celula dura), na normal SOLDADA
          // (aDispNrm, solda por POSIÇÃO em weldDispNormals — senão as arestas
          // duras abririam as "rachaduras" do qa/probe-cracks.mjs). A régua é
          // MILIMÉTRICA: o ruído vale 0..1 e a amplitude mora em METROS — o
          // plate × 0,6 cru do primeiro print estufava o robô INTEIRO em
          // balão de 1,9 m (braços e pernas soldavam no torso; sonda não vê
          // displaced, só o print cobra — a lição do envelope fantasma)
          float plate = fnoise(floor(vJit * 12.0) + uVSeed);
          float rattle = sin(uVT * 15.0 + plate * 60.0) * (0.0012 + uVCharge * 0.004 + uVHurt * 0.003);
          transformed += aDispNrm * (plate * 0.006 + rattle);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uVT;\nuniform float uVCharge;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // A PINTURA VIRA VIDA: lida a TEXTURA e separe o AZUL da agua (as
          // janelinhas nas costuras) do LARANJA do braseiro (o portal e a porta
          // do fogo). Onde e azul, a agua FERVE (ondulacao lenta + tremido de
          // fervura); onde e laranja, a brasa ESTALA em sorteio duro.
          vec4 pain = texture2D(map, vMapUv);
          float blue = clamp(pain.b - pain.r - 0.12, 0.0, 1.0);
          float fire = clamp(pain.r - pain.b - 0.15, 0.0, 1.0);
          float boil = 0.55 + 0.3 * sin(uVT * 2.2 + pain.g * 57.0 + vJit.y * 9.0) + 0.15 * sin(uVT * 9.0 + pain.b * 91.0);
          float ck = step(0.45, fract(sin(floor(uVT * 8.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // a agua fervendo nas costuras: azul-ciano SOBRIO (o gatilho do
          // blowout: nunca branco puro somado a tudo)
          totalEmissiveRadiance += vec3(0.16, 0.42, 0.66) * blue * (0.5 + 0.6 * boil + uVCharge * 0.9);
          // o braseiro estalando no portal e na porta do fogo
          totalEmissiveRadiance *= 1.0 + uVCharge * 1.2 + fire * (0.3 + 0.55 * ck + uVCharge * 1.0);
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // VÉU: a casca de nuvem (shader próprio acima) por cima da textura — um
  // material por unidade. Branco-pêssego SEM tint de equipe (a regra da nuvem)
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
          uAmp: { value: 0.045 },
          uHug: { value: SHELL_HUG },
          uSeed: { value: seed },
          uCharge: { value: 0 },
          uHurt: { value: 0 },
          uCrumble: { value: 0 },
          uAlpha: { value: 0.4 },
          uRibbon: { value: new THREE.Color(STEAM_LOOK.steam.cool) }, // fita de nuvem fria
          uWarm: { value: new THREE.Color(STEAM_LOOK.steam.warm) }, // pêssego do braseiro
          uCool: { value: new THREE.Color('#cfe0ee') }, // orla de vapor
        },
      }),
    [seed],
  );

  // ---- os canos de vapor: cinco enxames plantados nos encaixes do GLB ----
  // (a chaminé da cabeça cospe ALTO — é o apito; os ombros são o pedido do
  // usuário; cotovelos e joelhos vazam fiapos baixos)
  const vents = useMemo(() => {
    const make = (n: number, h: number, spread: number) => ({
      geo: makeSteamRiseGeo(n),
      mat: new THREE.ShaderMaterial({
        vertexShader: VENT_RISE_VERT,
        fragmentShader: RISE_FRAG, // o MESMO fiapo macio de nuvem do rig antigo
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uH: { value: h },
          uSpread: { value: spread },
          uCharge: { value: 0 },
        },
      }),
    });
    return {
      stack: make(embers ?? 12, 1.9 * s, 0.16 * s),
      shoulder: [make(embers ?? 10, 1.5 * s, 0.18 * s), make(embers ?? 10, 1.5 * s, 0.18 * s)] as const,
      elbow: [make(6, 0.7 * s, 0.12 * s), make(6, 0.7 * s, 0.12 * s)] as const,
      knee: [make(7, 0.5 * s, 0.1 * s), make(7, 0.5 * s, 0.1 * s)] as const,
    };
  }, [embers, emberScale, s]);

  // halo de gotas ESCALDANTES orbitando o robô: faixas do corpo (da base ao
  // topo da cabeça), nunca acima da malha; metade gira para o lado oposto
  const droplets = useMemo(
    () => ({
      geo: makeSparkGeo(26),
      mat: new THREE.ShaderMaterial({
        vertexShader: SDROP_VERT,
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
          uR2: { value: s * 0.82 },
          uSpin: { value: 2.0 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // ESTALOS-POP do peito: cada partícula é uma gota escaldante que estala do
  // portal e some — voo entre a casca (s×0,4) e por baixo do anel externo
  // (s×0,85), então o pop nunca encosta na linha do buraco.
  const pops = useMemo(() => {
    const n = 24;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    let st = (Math.floor(seed * 1000) ^ 0x9ac1d4e7) >>> 0;
    const rand = () => {
      st = (st * 1664525 + 1013904223) >>> 0;
      return st / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const z = rand() * 2 - 1;
      const az = rand() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - z * z));
      pos[i * 3] = Math.cos(az) * rr * 1.1; // o robô é LARGO de ombros...
      pos[i * 3 + 1] = z * 0.9; // ...e a plaqueta da cara fecha o topo
      pos[i * 3 + 2] = Math.sin(az) * rr * 0.55; // ...mas FUNDO fino (chapa)
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
          uR1: { value: s * 0.85 },
        },
      }),
    };
  }, [seed, emberScale, s]);

  // lufadas do peito/canos: mini-cuspes de vapor branco-pêssego aditivos
  // exalando para fora (a caldeira nunca sossegada)
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#dfe9f2',
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

  // auréola de estilhaços (pêssego do braseiro + branco-vapor — o
  // projétil-assinatura da caldeira é cunha de vapor com núcleo fervente)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 24, '#ffd2a6'),
      makeStarburstGeo(seed + 7.4, 16, '#eaf2f8'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of bursts.mats) m.dispose();
      for (const v of [vents.stack, ...vents.shoulder, ...vents.elbow, ...vents.knee]) {
        v.geo.dispose();
        v.mat.dispose();
      }
      droplets.geo.dispose();
      droplets.mat.dispose();
      pops.geo.dispose();
      pops.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, bursts, vents, droplets, pops, starburstGeos]);

  /** dispara uma lufada (volley = salvas do bafo do disparo, mais compridas) */
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
  const steamAcc = useRef(0);
  const strikeDone = useRef(false);

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
      if (demoT.current > VAPOR_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= VAPOR_WINDUP * VAPOR_ATTACK_WINDOW && sinceAttack <= VAPOR_ATTACK_WINDOW;
    // o clarão do bafo nasce no disparo e some em ~0,3 s (a varredura dos
    // bicos do rig antigo; aqui alimenta clarão/lufadas/bafo)
    const flash = striking ? Math.max(0, 1 - (sinceAttack - VAPOR_WINDUP * VAPOR_ATTACK_WINDOW) / 0.3) : 0;

    // BAFOREADA no instante do disparo (a MESMA assinatura do rig: vapor
    // grosso heat 0,35 EMPURRADO para frente — só que saindo do PEITO e dos
    // ombros, já que a malha não tem boca aberta no topo)
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      for (let k = 0; k < 3; k++) {
        tmpDir
          .set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5 + 0.2, frontZ * (0.8 + Math.random() * 0.4))
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], true);
      }
      if (smoke) {
        g.updateWorldMatrix(true, false);
        for (let i = 0; i < 8; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.6 * s, coreY + (Math.random() - 0.5) * 0.7 * s, frontZ * -(0.4 + Math.random() * 0.8) * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.14 + Math.random() * 0.08,
            heat: 0.35, // vapor escaldante (quente, mas mais claro que cinza)
            life: 1.1 + Math.random() * 0.6,
            lifeVar: 0.35,
            jitter: 0.26,
            rise: 0.9,
            drag: 2.6,
            vx: (Math.random() - 0.5) * 1.2,
            vz: -(0.5 + Math.random() * 1.0) * frontZ, // a varredura empurra p/ frente
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > VAPOR_ATTACK_WINDOW) strikeDone.current = false;

    // a caldeira NUNCA para de ferver: fio contínuo de vapor das CHAMINÉS
    // (a pilha da cabeça + os ombros; heat 0,22 — vapor claro, nunca fuligem)
    if (smoke && alpha > 0.3) {
      steamAcc.current += dt * (0.6 + 0.7 * pose.charge) * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (steamAcc.current >= 1 && guard < 3) {
        steamAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        const which = Math.random();
        const v =
          which < 0.4
            ? fit.vents.stack
            : which < 0.7
              ? fit.vents.shoulder[Math.random() < 0.5 ? 0 : 1]
              : fit.vents.knee[Math.random() < 0.5 ? 0 : 1];
        tmpWorld
          .set(v[0] + (Math.random() - 0.5) * 0.14 * s, v[1] + (Math.random() - 0.5) * 0.08 * s, v[2] + (Math.random() - 0.5) * 0.14 * s)
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.08 + Math.random() * 0.05,
          heat: 0.22, // vapor quente e claro (nunca fuligem)
          life: 1.5 + Math.random() * 0.8,
          lifeVar: 0.4,
          jitter: 0.14,
          rise: 0.95,
          drag: 2.0,
        });
      }
      if (steamAcc.current > 2) steamAcc.current = 2;
    }
    // exalação contínua do peito: bafo de vapor para todos os lados, dobrando
    // de cadência quando ela carrega o jato
    if (alpha > 0.25) {
      burstAcc.current += dt * (2.2 + pose.charge * 6.5) * (0.7 + 0.3 * hpFrac);
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
        // nascem DENTRO do robô e furam o véu: raio de saída na régua da
        // malha (enxuto: a sonda pega a lufada no pico e o invólucro todo tem
        // que morrer dentro do anel)
        const r0 = s * 0.5 + grow * s * 0.14;
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, coreY + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 40);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad);
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * (d.volley ? 0.6 : 0.7);
        mat.color.set(d.volley ? '#eef4fa' : i % 2 === 0 ? '#dfe9f2' : '#ffd2a6');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do véu (carga INCHA e CLAREIA a nuvem inteira — o `uCharge` do
    // vapor antigo; morte ARREBENTA em vaporada: `uCrumble` + carga de morte)
    const crumble = 1 - alpha;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.7 + flash * 0.5);
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uCrumble.value = crumble;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.4 + pose.charge * 0.25 + flash * 0.3) * alpha);

    // uniforms do corpo (chapas tremendo com a fervura + portal/brasa acesos)
    const sh = body.userData.shader as
      | { uniforms: { uVT: { value: number }; uVCharge: { value: number }; uVHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uVT.value = t;
      sh.uniforms.uVCharge.value = pose.charge;
      sh.uniforms.uVHurt.value = hurt;
    }
    // o braseiro estala devagar (o `fireBreath` de três senóides do rig) e o
    // portal ACENDE mais quando ela carrega o jato
    const fireBreath =
      Math.sin(t * 0.6 + seed) * 0.5 +
      Math.sin(t * 1.3 + seed * 0.7) * 0.3 +
      Math.sin(t * 2.7 + 1.4) * 0.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.32 + fireBreath * 0.06 + pose.charge * 0.5 + flash * 0.6 + hurt * 0.7) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + flash * 0.25 + pose.charge * 0.25));

    // os CANOS DE VAPOR: relógio, morte e carga — a coluna é toda do shader
    for (const v of [vents.stack, ...vents.shoulder, ...vents.elbow, ...vents.knee]) {
      v.mat.uniforms.uTime.value = t;
      v.mat.uniforms.uAlpha.value = alpha;
      // o uCharge engorda a coluna inteira ao mesmo tempo (os bicos do rig
      // antigo inchando carregando o jato) e a morte vaza tudo de uma vez
      v.mat.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.8);
    }

    // halo de gotas orbitando o corpo (as gotas ferventes da nuvem antiga; o
    // turbilhão DOBRA na carga do jato)
    droplets.mat.uniforms.uTime.value = t;
    droplets.mat.uniforms.uAlpha.value = alpha;
    droplets.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // estalos-pop do peito (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    pops.mat.uniforms.uTime.value = t;
    pops.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    pops.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: o PESO da panela de ferro (o agachar do rig antigo: as
    // pernas de ferro dobram o peso no crouch), torção do jato, empurrão para
    // frente no disparo, treme-treme da fervura e afundar na morte ----
    const sway = Math.sin(t * 0.4 + seed) * 0.012 + Math.sin(t * 0.9 + 1.7) * 0.005;
    const crouchY = 1 - pose.crouch * 0.05;
    g.scale.set(1 + pose.crouch * 0.035 + pose.flare * 0.015, crouchY, 1 + pose.crouch * 0.035);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.33 + seed * 0.6) * 0.007;
    g.rotation.x = pose.crouch * 0.045 - pose.twist * 0.08;
    // o treme-treme da caldeira fervendo (curto, rápido, some com a morte) —
    // o robô NÃO treme inteiro: treme a fervura dentro dele
    g.position.x = Math.sin(t * 23 + seed) * 0.006 * (0.4 + pose.charge * 1.2) * alpha;
    g.position.y = Math.sin(t * 0.75 + seed) * 0.008 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- clarão do PORTAL aceso no peito (o clarão aditivo do vão do aro do
    // rig antigo — plantado na FRENTE do portal do GLB, SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.3, 1.5 + fireBreath * 0.1 + pose.charge * 0.5 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 2.4 + seed) + pose.charge * 0.07) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.7 + 0.1 * s));
    const flashS = flash > 0 ? 0.8 + 1.2 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.22 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para
    // o envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.3;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    // o robô é mais FUNDO-fino que o vulcão/golens: auréola um dedo mais
    // contida p/ os estilhaços nunca parecerem uma estrela cravada no peito
    aura.scale.setScalar(s * 0.5 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.12));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const peachShard = starburstRefs.current[0];
    const whiteShard = starburstRefs.current[1];
    if (peachShard) {
      (peachShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.05) * auraPulse * alpha;
    }
    if (whiteShard) {
      (whiteShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.08) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.387 * s + 0.12)); // rente ao portal
    coreGlow.scale.setScalar(0.45 + pose.charge * 0.18 + flash * 0.16);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.1 + pose.charge * 0.12 + flash * 0.1) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={VAPOR_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* véu de vapor: a MESMA malha vestida com a nuvem do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* VAPOR SAINDO DOS CANOS DO GLB (o pedido do usuário): chaminés dos
          ombros + pilha da cabeça + cotovelos + joelhos — cada fiapo plantado
          no próprio encaixe escalado (o enxame sobe do y 0 local) */}
      <points geometry={vents.stack.geo} material={vents.stack.mat} position={fit.vents.stack} frustumCulled={false} />
      {fit.vents.shoulder.map((v, i) => (
        <points
          key={`vent-shoulder${i}`}
          geometry={vents.shoulder[i].geo}
          material={vents.shoulder[i].mat}
          position={v}
          frustumCulled={false}
        />
      ))}
      {fit.vents.elbow.map((v, i) => (
        <points
          key={`vent-elbow${i}`}
          geometry={vents.elbow[i].geo}
          material={vents.elbow[i].mat}
          position={v}
          frustumCulled={false}
        />
      ))}
      {fit.vents.knee.map((v, i) => (
        <points
          key={`vent-knee${i}`}
          geometry={vents.knee[i].geo}
          material={vents.knee[i].mat}
          position={v}
          frustumCulled={false}
        />
      ))}
      {/* halo de gotas escaldantes orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={droplets.geo} material={droplets.mat} frustumCulled={false} />
      {/* estalos-pop: gotas que saltam do portal e morrem esfriando em voo */}
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
      {/* SEM anéis de chão: a caldeira do rig antigo nunca os teve (a lição do
          Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.45} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffbe55"
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.6}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffd9ae"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#fff2e0"
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
