import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ICE_URL } from './modelUrls';
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
  FLAKE_FRAG,
  FLAKE_VERT,
  ICE_ATTACK_WINDOW,
  ICE_WINDUP,
  makeFlakeGeo,
  type IceRigProps,
} from './IceRig';
import { BURST_CAP, makeSparkGeo, makeStarburstGeo, SPARK_FRAG } from './LightningRig';
import { readModel } from './modelPreload';
import { SummonReveal, SummonSigil } from './SummonFX';

/**
 * GELO DE MALHA 3D IMPORTADA — O CUBO DE GELO (Nv.6): a forma da espécie vira
 * um mesh texturizado criado fora do jogo (`src/models/ice/ice.glb` — 23.578
 * vértices NÃO-indexados, UMA malha com UMA textura 2048²; PLY re-empacotado,
 * SEM ossos e SEM animação no arquivo): o cubo de gelo de dois andares com
 * carepa de neve por cima, icicles azuis na coroa e a CARA IRADA de olhos
 * glaciares pintada na frente. Enquanto a malha desce (demanda), o SELO DE
 * INVOCÇÃO (`SummonFX`) segura o buraco — o golem de cristal do `IceRig`
 * nunca mais pipoca no campo (ficou só doador de efeitos e coreografia) — e
 * TODOS os efeitos do gelo continuam vivos por cima da malha, no mesmo
 * idioma dos seis figurinos da linha "modelos 3D":
 *
 *  1. VIDA DA CASCA no material da malha: `onBeforeCompile` com o ruído de
 *     `flameShaders.ts` — a GEADA rastejando devagar pelo relevo (na normal
 *     SOLDADA, `aDispNrm`, lição das rachaduras do golé) e a CROSTA DE GELO
 *     que engrossa quando ele carrega a estaca; no emissivo, o ANÁLOGO das
 *     trincas internas do cristal: veios de fratura que ACENDEM na carga
 *     (o coldPulse do rig antigo, vestido na pintura do GLB);
 *  2. INVOLTÓRIO DE GEADA (o antigo abraçando o novo): uma casca da MESMA
 *     malha, inflada pelo `SHELL_HUG`, vestida com as TRINCAS DE FRATURA e os
 *     BRILHOS DE FROST da receita `iceShaders` (veio dobrado claro escorrendo
 *     + clareios de geada em patamar), aditiva e translúcida por cima da
 *     textura. LIÇÃO DA CASA (o print da câmera rasa do glaciar): o halo de
 *     geada NUNCA sai na cor da equipe — geada é azul-branco, sempre; sem
 *     aro tintado aqui;
 *  3. os efeitos do gelo religados no CORE da malha (o coração do cubo, no
 *     meio da cara): a chuva de FLOCOS DE SEIS BRAÇOS do rig antigo (os
 *     mesmos shaders, do topo da carepa escalada até o chão), o enxame de
 *     faíscas-de-gelo ORBITANDO o corpo (não acima dele — lição da trovoada),
 *     as LASCAS-POP de cristal que estalam do core e somem, o pool de lufadas
 *     frias exalando do peito, a aura de estilhaços glaciares, os anéis de
 *     geada no chão e a NÉVOA FRIA nos pés no instante do arremesso (heat 0,
 *     a MESMA assinatura do rig procedural).
 *
 * A coreografia é a MESMA timeline do motor (janela 0,5 s: agacha-e-torce com
 * o braço da estaca recuando → tranco para frente) lida de `lastAttackAt`, e
 * o `demoAttackSeq` do bestiário dispara o mesmo show. Sem ossos aqui: o gelo
 * nunca teve esqueleto procedural (o rig animava o GRUPO raiz — balanço de
 * glaciar, torção, agachamento) e a malha herda esse grupo exatamente como as
 * parts herdavam.
 *
 * ENCAIXE: o topo autoral da forma (3,9) daria escala 2,01 na caixa da malha
 * (y −1,002..+0,936) e o cubo encostaria no teto de altura — o TETO da linha
 * de `data/footprints.ts` manda (mesmo precedente do Raio/Ancient Tree): a
 * malha encosta em `MEDIDO.gelo` com o abraço do invólucro, e os efeitos
 * (flocos, anéis de chão, aura) moram dentro dessa mesma linha. O GLB encara
 * o inimigo no +Z (rumo 0 — a cara irada de olhos glaciares conferida na
 * primeira vista do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`, painel
 * "frente (+Z)"); o `slotFit` da família (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const GELO_DEF = getSpecies('gelo');

/** topo autoral da forma Nv.6 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(GELO_DEF, GELO_DEF.levelMin);


/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas
 * do GLB puro (`qa/mesh-viewer-shot.mjs`, 17/nov — painel superior esquerdo =
 * frente +Z, leia a receita do viewer antes de desconfiar) mostrou a CARA
 * IRADA DE OLHOS GLACIARES no +Z — como as seis malhas da linha. Se um GLB
 * substituto vier virado, vire aqui.
 */
export const ICE_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): o deslocamento da casca
 * de geada para fora. MESMO 0,13 dos invólucros de chama/trovoada/raízes — e
 * a sonda de footprint lê a caixa CPU e NÃO vê essa infla, então ela mora na
 * linha da tabela.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do cubo em PORCENTAGEM da altura da malha: o core dos efeitos fica
 * no meio da caixa (o cubo é pesado de base e a cara irada mora entre os dois
 * andares, ~10% ACIMA do meio). É a régua de CORE_Y: clarões, lufadas,
 * lascas-pop e aura nascem dessa altura; flocos e anéis descem do topo.
 */
const CORE_FRAC = 0.55;

/** brasa base do emissivo (o azul glaciar dos olhos/veios pintados) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#5fa8d8');
const EMISSIVE_FLASH = new THREE.Color('#f0fbff');

/**
 * VERTEX da LASCA-POP DE CRISTAL: cada partícula (posição = direção unitária
 * do estalo, `aRand` = sorteios por partícula) roda num ciclo próprio e só
 * vive a janela do pop — abre num estalo, salta do cubo para fora e morre
 * desbotando; o resto do tempo vA=0 (o fragmento descarta). `uCharge` acelera
 * e engorda o estalo na hora de carregar a estaca. A janela ~0,15 s e o
 * flicker de hash são a receita do "aparece e some" (o MESMO mecanismo das
 * faíscas da trovoada, vestido de cristal glaciar: azul-frio + branco).
 */
const FRACK_VERT = /* glsl */ `
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
  float cyc = uTime * (1.3 + 2.6 * aRand.z) * (1.0 + uCharge * 0.9) + aRand.x * 7.71;
  float k = fract(cyc);
  float w = 0.24 + 0.14 * aRand.y; // janela do pop (quanto do ciclo a lasca vive)
  float off = step(w, k); // fora da janela: apagada
  float life = clamp(k / w, 0.0, 1.0);
  float env = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.38, 1.0, life));
  float flick = 0.35 + 0.65 * step(0.3, fract(sin(floor(cyc * (26.0 + 24.0 * aRand.z)) + life * 9.7) * 43758.5453));
  float r = mix(uR0, uR1, 0.1 + 0.9 * life) * (0.9 + 0.2 * fract(aRand.y * 5.3));
  vec3 p = position * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.2 + 3.0 * aRand.z) * (0.5 + 0.8 * env) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - off) * env * flick * uAlpha;
  // cristal glaciar: azul-frio com farpas brancas de geada (a paleta do rig antigo)
  vec3 tint = mix(vec3(0.55, 0.8, 1.0), vec3(0.94, 0.98, 1.0), step(0.5, aRand.y));
  vC = mix(tint, vec3(1.0, 1.0, 1.0), env * 0.55);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * VERTEX do ENXAME DE FAÍSCAS-DE-GELO orbitando o cubo (o MESMO esqueleto das
 * faíscas da trovoada/esporos do ancião, re-ancorado no cristal): cada
 * partícula orbita numa faixa própria do corpo (nada de anel flutuando acima
 * da carepa de neve — lição da trovoada), com raio e altura tremendo em
 * senóides desencontradas (caos) e um estalo de hash em alta frequência (o
 * "aparece e some"). `uSpin` é mais LENTO que o do ancião (o gelo ao redor
 * respira devagar — a cadência do glaciar) e dobra na carga do arremesso.
 */
const ISPARK_VERT = /* glsl */ `
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
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 2.8 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // farpa de gelo ESTALA: quadrado de alta frequência com aleatoriedade por partícula
  float flick = step(0.58, fract(sin(floor(uTime * (13.0 + 14.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (3.0 + 2.6 * aRand.z) * (0.7 + 0.5 * flick) * uSizeMul * (1.0 + uCharge * 0.6);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = flick * uAlpha * (0.5 + 0.25 * uCharge);
  // glaciar azul + branco de geada; a que ESTALA vai para o azul-leite
  vec3 tint = mix(vec3(0.5, 0.78, 1.0), vec3(0.93, 0.97, 1.0), step(0.62, fract(aRand.y * 7.13)));
  vC = mix(tint, vec3(0.9, 0.97, 1.0), flick * 0.7) * 0.85;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * INVOLTÓRIO DE GEADA (o antigo abraçando o novo): a casca de cristal do
 * rig procedural, deslocada para fora com o `uHug` + fervura em PATAMAR
 * (ruído de 2 níveis — o gelo risca em trinca, não derrete em onda — a
 * lição dos veios por porte do `iceShaders`) por cima da textura. Renderizada
 * aditiva e translúcida: só as TRINCAS DE FRATURA, os BRILHOS DE FROST e o
 * halo de geada acendem; o resto do corpo lê pela pintura do GLB. A CROSTA
 * DE GELO engrossa na carga do arremesso (o análogo do espinho de casca do
 * ancião). SEM aro na cor da equipe — lição do glaciar: geada é azul-branco,
 * sempre (de raspão o fresnel puxa o tint da equipe e o print mostrou o
 * anel verde-jade onde tinha que haver geada).
 */
const FROST_SHELL_VERT = /* glsl */ `
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
  // trinca dura em patamar: o cubo racha em placas (veio FINO — gelo racha em
  // trinca, não derrete em onda larga de mármore, a lição do porte)
  float k = step(0.5, fnoise(vLocal * 6.0));
  float amp = uAmp * (1.0 + uHurt * 0.2 + uCrumble * 2.4) * (1.0 + uCharge * 0.5);
  pos += nrm * (uHug + ((n1 - 0.5) * 1.1 + (k - 0.5) * 0.8) * amp);
  // crosta de gelo: farpas duras em patamar que engrossam quando ele carrega a estaca
  float rime = step(0.5, fnoise(vLocal * 3.2 + vec3(0.0, uTime * 0.3, 0.0) + uSeed));
  pos += nrm * rime * (0.004 + uCharge * 0.014);
  vN1 = n1;
  vNrm = normalMatrix * nrm;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FROST_SHELL_FRAG = /* glsl */ `
uniform vec3 uVein;
uniform vec3 uCool;
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
  // trincas de fratura: veio claro DOBRADO (o gelo racha em linha quebrada —
  // a mesma trinca dobrada+segmentada do rig antigo, lida como nervura)
  float vein = fnoise(vLocal * 4.4 + vec3(uTime * 0.18, uTime * -0.32, 0.0) + uSeed);
  float veinMask = smoothstep(0.50, 0.545, vein) * (1.0 - smoothstep(0.56, 0.61, vein));
  float seg = 0.6 + 0.4 * step(0.5, fnoise(vLocal * 11.0 + uSeed)); // traço segmentado
  vec3 col = uVein * veinMask * seg * (0.35 + uCharge * 0.9);
  // brilhos de frost: ilhas duras que acendem e apagam (o análogo cristalino
  // do snap elétrico — e o oposto do musgo: geada PISCA fria, não mana)
  float glowOn = step(0.5, fnoise(vLocal * 3.6 + vec3(uTime * 1.2) + uSeed));
  float glowGate = step(0.8, fnoise(vLocal * 1.8 - vec3(uTime * 0.9) + uSeed));
  col += uCool * glowOn * glowGate * (0.12 + uCharge * 0.4) * 0.7;
  // halo de geada (azul-branco, NUNCA tint de equipe — a lição da câmera rasa)
  // + o veio claro no aro + o núcleo frio do meio do cubo
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 2.2); // clamp p/ pow (lição WebKit)
  col += uCool * rim * 0.24;
  col += uVein * rim * (0.08 + uCharge * 0.22);
  col += uCore * rim * (0.05 + uCharge * 0.16);
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
 * Dispatcher do Gelo: Nv.6 = a malha importada do cubo de gelo; enquanto ela
 * desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO segura o
 * buraco — o figurino do glaciar antigo nunca mais aparece no campo (a lição
 * da troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `IceRig` antigo ficou só doador de efeitos).
 */
export function IceRig(props: IceRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="gelo" url={ICE_URL} seed={props.seed} />}>
      <SummonReveal species="gelo" seed={props.seed}>
        <IceMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function IceMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq, smoke }: IceRigProps) {
  const { scene } = readModel(ICE_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/charge não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${ICE_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    weldDispNormals(geo); // solda p/ o relevo de geada não rasgar nas arestas (72 soldas duras >60° — qa/probe-cracks.mjs)
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do cubo, no meio da cara irada: a origem de todos os efeitos
      coreY: CORE_FRAC * spanY, // local na base do rig (base no y 0 local antes do fit)
    };
  }, [scene]);

  // encaixe autoral: o TETO da linha de `MEDIDO` manda (o topo autoral 3,9
  // inflaria o cubo quase até o teto da altura — ver o doc no topo); plantado
  // com a base no y 0 local, centro do corpo no eixo do rig; o offset
  // compensa a rotação de rumo (matriz T·R·S) e a AABB é a EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('gelo', GELO_DEF.levelMin as MonsterLevel);
    const yaw = ICE_MODEL_YAW;
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

  // altura local do coração do cubo (o núcleo dos efeitos): a base da malha já
  // fica plantada no y 0 do rig (o `pos` do fit levanta a base crua até o
  // chão), então o core mora na própria porcentagem da caixa escalada — SEM
  // somar `pos[1]` de novo (a lição do Raio: somar de novo deixava o enxame
  // flutuando acima da carepa de neve)
  const coreY = src.coreY * fit.s;

  // material por instância: textura do GLB + brasa glaciar + a geada rastejando
  // no relevo e as trincas acendendo na carga via onBeforeCompile (o MESMO
  // ruído de flameShaders.ts; a pintura do GLB já traz a cara e as fraturas)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.45,
      metalness: 0.02,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.28,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.016 };
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFCharge = { value: 0 };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nuniform float uFCharge;\nvarying float vFlick;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // a GEADA rastejando devagar pela casca INTEIRA: é isso que faz a
          // tinta do GLB parecer gelo vivo, não argila pintada (rasteja para
          // baixo, mais lento e raso que a seiva do ancião)
          float fn = fbm(transformed * 3.0 + vec3(0.0, -uFT * 0.9, 0.0) + uFSeed);
          // o grão sai pela NORMAL SOLDADA (aDispNrm, solda por POSIÇÃO em
          // weldDispNormals): na aresta dura do GLB cada cópia do mesmo ponto
          // sairia para o lado da sua normal própria e abriria as "rachaduras"
          // (qa/probe-cracks.mjs)
          transformed += aDispNrm * (fn - 0.5) * uFA * 2.0;
          // CROSTA DE GELO do rig antigo: farpas duras em patamar que
          // engrossam na carga da estaca (o cubo se arreia de geada antes do tranco)
          float rime = step(0.5, fnoise(transformed * 3.2 + vec3(0.0, uFT * 0.3, 0.0) + uFSeed));
          transformed += aDispNrm * rime * (0.003 + uFCharge * 0.011);
          vFlick = fbm(transformed * 5.0 + vec3(uFT * 1.6) + uFSeed);`,
        );
      sh.fragmentShader =
        'uniform float uFCharge;\nvarying float vFlick;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          // as TRINCAS INTERNAS DO CRISTAL acendem na carga (o coldPulse do
          // rig antigo lido na pintura do GLB): veio claro estreito em banda
          float crk = smoothstep(0.46, 0.52, vFlick) * (1.0 - smoothstep(0.54, 0.62, vFlick));
          totalEmissiveRadiance *= 1.0 + uFCharge * 1.2 + crk * uFCharge * 2.2 + 0.3 * max(0.0, vFlick - 0.55);`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // INVOLTÓRIO: a casca de geada (shader próprio acima) por cima da textura —
  // um material por unidade. SEM tint de equipe (geada é azul-branco, sempre)
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FROST_SHELL_VERT,
        fragmentShader: FROST_SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.036 },
          uHug: { value: SHELL_HUG },
          uSeed: { value: seed },
          uCharge: { value: 0 },
          uHurt: { value: 0 },
          uCrumble: { value: 0 },
          uAlpha: { value: 0.45 },
          uVein: { value: new THREE.Color('#bfe8ff') },
          uCool: { value: new THREE.Color('#7fb0cf') },
          uCore: { value: new THREE.Color('#e8fbff') },
        },
      }),
    [seed],
  );

  // ---- os efeitos do gelo, religados no coração da malha ----
  const s = fit.s;

  // CHUVA DE FLOCOS DE SEIS BRAÇOS do rig antigo (os MESMOS shaders
  // exportados), caindo do TOPO DA CAREPA escalada (não do topo autoral 3,9 —
  // a carepa da malha é mais baixa) e varrendo na régua do encaixe `s` (nada
  // de floco atravessando a linha do buraco — lição da trovoada)
  const flakeCount = embers ?? 16;
  const flakes = useMemo(
    () => ({
      geo: makeFlakeGeo(flakeCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: FLAKE_VERT,
        fragmentShader: FLAKE_FRAG,
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
    [flakeCount, emberScale, src.spanY, s],
  );

  // faíscas-de-gelo ORBITANDO o cubo: faixas do corpo (da base à carepa),
  // nunca acima da malha; giro mais LENTO que o do ancião (o gelo respira
  // devagar) e metade do enxame para o lado oposto (caos da lição)
  const sparks = useMemo(
    () => ({
      geo: makeSparkGeo(30),
      mat: new THREE.ShaderMaterial({
        vertexShader: ISPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: coreY - 0.5 * s },
          uY1: { value: src.spanY * s - 0.15 * s },
          uR1: { value: s * 0.62 },
          uR2: { value: s * 0.88 },
          uSpin: { value: 2.0 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, coreY, s],
  );

  // LASCAS-POP do coração: cada partícula é um estalo de cristal que some —
  // num ciclo próprio ela vive ~30% do tempo, saltando do cubo para fora num
  // abrir-e-fechar (janela de ~0,15 s), o resto do tempo fica apagada. O
  // timing é tudo no shader (nada de bookkeeping por partícula no CPU); a
  // régua do voo mora entre a casca (s×0,4) e por baixo do anel externo
  // (s×0,9), então o pop nunca encosta na linha do buraco.
  const fracks = useMemo(() => {
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
      pos[i * 3] = Math.cos(az) * rr * 1.05; // o cubo é um pouco mais largo que alto
      pos[i * 3 + 1] = z * 1.0;
      pos[i * 3 + 2] = Math.sin(az) * rr * 1.05;
      rnd[i * 3] = rand();
      rnd[i * 3 + 1] = rand();
      rnd[i * 3 + 2] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    return {
      geo,
      mat: new THREE.ShaderMaterial({
        vertexShader: FRACK_VERT,
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

  // lufadas do coração: mini-cuspes de ar congelante aditivos exalando do
  // meio do cubo para fora (o bafo frio que desacelera o mundo do glaciar)
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#cfeeff',
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

  // aura de estilhaços (glaciar + branco de geada) no coração
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 24, '#5fc0ea'),
      makeStarburstGeo(seed + 7.4, 16, '#d9f4ff'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      for (const m of bursts.mats) m.dispose();
      flakes.geo.dispose();
      flakes.mat.dispose();
      sparks.geo.dispose();
      sparks.mat.dispose();
      fracks.geo.dispose();
      fracks.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, shellMat, bursts, flakes, sparks, fracks, starburstGeos]);

  /** dispara uma lufada do coração (volley = salvas do arremesso, mais compridas) */
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
      if (demoT.current > ICE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const windupEnd = ICE_WINDUP * ICE_ATTACK_WINDOW;
    const releasing = sinceAttack >= windupEnd && sinceAttack <= ICE_ATTACK_WINDOW;
    // o clarão do tranco nasce no release e some em ~0,3 s (o rig antigo não
    // tinha flash; aqui ele alimenta clarão/lufadas do arremesso)
    const flash = releasing ? Math.max(0, 1 - (sinceAttack - windupEnd) / 0.3) : 0;

    // salva de lufadas no instante do disparo (uma por ataque do motor) + a
    // NÉVOA FRIA nos pés (heat 0 — a MESMA assinatura do rig procedural:
    // névoa, não fuligem; o gelo congela o chão de onde arremessa)
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
            .set((Math.random() - 0.5) * 1.2 * s, 0.07, (Math.random() - 0.5) * 0.9 * s + frontZ * 0.2 * s)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.08 + Math.random() * 0.05,
            heat: 0, // névoa fria (o oposto do magma)
            life: 0.9 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.2,
            rise: 0.35,
            drag: 3.4,
            vx: (Math.random() - 0.5) * 1.0,
            vz: (Math.random() - 0.5) * 1.0,
          });
        }
      }
    }

    // exalação contínua do coração: bafo curto e congelante para todos os
    // lados, dobrando de cadência quando ele carrega a estaca
    if (alpha > 0.25) {
      burstAcc.current += dt * (2.6 + pose.charge * 5.0) * (0.7 + 0.3 * hpFrac);
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

    // lufadas: crescem do meio do cubo para fora, piscam e apagam
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
        // nascem DENTRO do cubo e furam a casca: raio de saída na régua da
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
        mat.color.set(d.volley ? '#f0fbff' : i % 2 === 0 ? '#cfeeff' : '#eaffff');
      } else if (mat.opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms do invólucro (carga acende trincas/crosta; morte esvazia E
    // estilhaça: `uCrumble` engrossa a fervura — o cristal se desfaz, a
    // mesma leitura do `uAmp × (1 + crumble·3,2)` do rig antigo)
    const crumble = 1 - alpha;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uCharge.value = pose.charge + flash * 0.6;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uCrumble.value = crumble;
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.45 + pose.charge * 0.18 + flash * 0.3) * alpha);

    // uniforms do corpo (relevo de geada + crosta + carga no material da malha)
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number }; uFCharge: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      sh.uniforms.uFA.value = 0.016 * (0.8 + 0.2 * hpFrac) * (1 + flash * 0.6 + hurt * 0.5 + crumble * 3.2);
      sh.uniforms.uFCharge.value = pose.charge;
    }
    // o azul glaciar das trincas pulsa devagar (o coldPulse do rig antigo) e
    // ACRESCITA na carga da estaca (o MESMO pulso do rig procedural)
    const coldPulse = 0.4 + 0.18 * Math.sin(t * 1.2 + seed) + pose.charge * 1.4;
    body.emissiveIntensity = Math.max(
      0,
      (0.28 + coldPulse * 0.22 + flash * 0.8 + hurt * 1.0) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + flash * 0.3 + pose.charge * 0.25));

    // chuva de flocos (o relógio, a morte e a carga — a deriva e o giro são
    // todo do shader: neve com arrasto, nunca em linha)
    flakes.mat.uniforms.uTime.value = t;
    flakes.mat.uniforms.uAlpha.value = alpha;
    flakes.mat.uniforms.uCharge.value = pose.charge + flash * 0.5;

    // faíscas-de-gelo orbitando o corpo
    sparks.mat.uniforms.uTime.value = t;
    sparks.mat.uniforms.uAlpha.value = alpha;
    sparks.mat.uniforms.uCharge.value = pose.charge + flash;

    // lascas-pop do coração (o timing do abre-e-some vive no shader; aqui só
    // o relógio, a morte e a carga)
    fracks.mat.uniforms.uTime.value = t;
    fracks.mat.uniforms.uAlpha.value = Math.max(0, alpha * (0.85 + pose.charge * 0.3));
    fracks.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: balanço de glaciar, torção do tranco, agachamento (o grupo
    // que o rig antigo animava; a malha + o invólucro herdam tudo junto) ----
    const sway = Math.sin(t * 0.42 + seed) * 0.018 + Math.sin(t * 0.95 + 1.7) * 0.007;
    const crouchY = 1 - pose.crouch * 0.06;
    const wilt = crumble * 0.6; // morrendo: o cristal estilhaça e afunda
    g.scale.set(
      (1 + pose.crouch * 0.04 + pose.flare * 0.02) * (1 + wilt * 0.3),
      crouchY - wilt * 0.45,
      (1 + pose.crouch * 0.04) * (1 + wilt * 0.3),
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.35 + seed * 0.6) * 0.01;
    g.rotation.x = pose.crouch * 0.05 - pose.twist * 0.1 + wilt * 0.18;
    g.position.y = Math.sin(t * 0.85 + seed) * 0.012 + pose.crouch * -0.02 - wilt * 0.3;
    g.position.z = pose.stepZ;

    // ---- clarão glaciar do coração + clarão do tranco (sóbrio: legibilidade
    // do gelo manda — o rig antigo nunca usou aditivo forte no corpo) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.3, 1.5 + coldPulse * 0.1 + pose.charge * 0.45 + hurt * 0.25));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + 0.015 * Math.sin(t * 1.2 + seed) + pose.charge * 0.06) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.7 + 0.18 * s));
    const flashS = flash > 0 ? 0.8 + 1.2 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.2 * alpha;

    const aura = burstAuraRef.current;
    // a aura gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para
    // o envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.35;
    aura.rotation.z = Math.sin(t * 0.8 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.1 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.6 * (1 + Math.sin(t * 3.6 + seed) * 0.05 + pose.charge * 0.08));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const coldShard = starburstRefs.current[0];
    const paleShard = starburstRefs.current[1];
    if (coldShard) {
      (coldShard.material as THREE.MeshBasicMaterial).opacity = (0.1 + pose.charge * 0.06) * auraPulse * alpha;
    }
    if (paleShard) {
      (paleShard.material as THREE.MeshBasicMaterial).opacity = (0.07 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -0.75);
    coreGlow.scale.setScalar(0.5 + pose.charge * 0.16 + flash * 0.18);
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.1 + pose.charge * 0.09 + flash * 0.1) * alpha;

    // anéis de geada no chão do cubo (a placa de frost do rig antigo, vestida
    // de assinatura da linha — e sempre azul-branco, nunca cor de equipe).
    // DIFERENTE dos anéis do ancião/trovoada, eles NÃO giram nem tortam: além
    // da quietude do glaciar combinar com a placa parada do rig procedural,
    // a sonda de footprint mede a AABB da geometria por 8 cantos — um torus
    // rodando no próprio plano é lido inflado (até √2× a circunferência), e o
    // anel externo "estourava" o anel 2,5 só de fase (medido na sonda de
    // malhas: 2,56 lidos para um círculo real de 2,24). Paradinhos, a leitura
    // sai a circunferência exata (1,05×s×1,15 = 2,26 de mundo).
    for (const ring of refsGroundRings.current) {
      if (!ring) continue;
      ring.mat.opacity = ring.base * (0.68 + 0.32 * Math.sin(t * 5.4 + ring.phase * 2.2)) * alpha;
    }
  });

  const refsGroundRings = useRef<
    { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number; phase: number }[]
  >([]);

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={ICE_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
        {/* invólucro de geada: a MESMA malha vestida com as trincas do antigo */}
        <mesh geometry={src.geo} material={shellMat} frustumCulled={false} />
      </group>
      {/* chuva de flocos de seis braços caindo da carepa (os mesmos shaders do rig antigo) */}
      <points geometry={flakes.geo} material={flakes.mat} frustumCulled={false} />
      {/* faíscas-de-gelo orbitando o corpo (metade gira para o lado oposto) */}
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
      {/* lascas-pop: estalos de cristal que saltam do coração e morrem em ~0,15 s */}
      <points geometry={fracks.geo} material={fracks.mat} position={[0, coreY, 0]} frustumCulled={false} />
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
      {([0, 1] as const).map((i) => (
        <mesh
          key={`ground-ring${i}`}
          ref={(mesh) => {
            if (mesh && refsGroundRings.current[i] === undefined) {
              refsGroundRings.current[i] = {
                mesh,
                mat: mesh.material as THREE.MeshBasicMaterial,
                base: i === 0 ? 0.5 : 0.3,
                phase: i,
              };
            }
          }}
          position={[0, 0.055 + i * 0.025, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
          frustumCulled={false}
        >
          <torusGeometry args={[i === 0 ? s * 0.78 : s * 1.05, i === 0 ? 0.024 : 0.015, 8, 96]} />
          <meshBasicMaterial
            color={i === 0 ? '#7fc8e8' : '#cfeeff'}
            transparent
            opacity={i === 0 ? 0.5 : 0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <sprite ref={coreGlowRef} position={[0, coreY, -0.75]} scale={0.5} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color="#bfe4ff"
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.7}>
        <spriteMaterial
          map={circleTexture()}
          color="#cfe8ff"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} position={[0, coreY, -1.3]} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#f0fbff"
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
