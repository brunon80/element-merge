import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import waterLvl1Url from '../models/water/water_model_lvl1.glb?url';
import waterLvl2Url from '../models/water/water_model_lvl2.glb?url';
import waterLvl3Url from '../models/water/water_model_lvl3.glb?url';
import waterLvl4Url from '../models/water/water_model_lvl4.glb?url';
import waterLvl5Url from '../models/water/water_model_lvl5.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, setSeedAttribute } from './assets';
import { NOISE_GLSL } from './flameShaders';
import { TEAM_TINT } from './stoneShaders';
import {
  attackPose,
  makeSprayGeo,
  SPRAY_FRAG,
  SPRAY_VERT,
  WATER_ATTACK_WINDOW,
  WATER_ROLE_LOOK,
  WATER_WINDUP,
  WaterRig,
  type WaterRigProps,
} from './WaterRig';

/**
 * NEREIA DE MALHA 3D IMPORTADA — A ÁRVORE INTEIRA (Nv.1..5): cada forma da
 * evolução da água é um mesh texturizado criado fora do jogo
 * (`src/models/water/water_model_lvl1..5.glb` — 21-29 mil vértices, UMA malha
 * com UMA textura cada; SEM ossos e SEM animação no arquivo). O figurino
 * procedural de maré (`WaterRig`) só aparece como fallback enquanto a malha da
 * forma carrega.
 *
 * ⚠️ A ESCADA DOS ARQUIVOS: os GLBs chegaram da esteira de exportação em ordem
 * INVERTIDA em relação às artes 2D de referência (o arquivo "lvl2" trazia o
 * DRAGÃO ALADO da arte `water_lvl5_1.png`, e o "lvl5" trazia o AXOLOTL da arte
 * `water_lvl2_1.png`). Os arquivos foram RENOMEADOS para casar com a numeração
 * das artes — a escada evolutiva (axolotl → hippocampão → draco quadrúpede →
 * dragão alado) segue a referência do usuário, não o ordem de exportação.
 *
 * Os GLBs não trazem esqueleto, então vale o mesmo esquema da árvore do fogo e
 * do vento: esqueleto de código + pesos por FAIXA de Y (`ensureSkin`, uma vez
 * por geometria, compartilhados entre instâncias), coreografia do figurino lida
 * no relógio do motor (`attackPose` exportado do WaterRig), follow-through
 * amostrado NO PASSADO e a VIDA DA ÁGUA em camadas, idêntica ao Nv.1 aprovado
 * ("onda descendo pelo corpo") em TODOS os níveis:
 *  1. o corpo texturizado com `onBeforeCompile`: correntes subindo pela
 *     superfície (o WATER_VERT literal nas MESMAS escalas, deslocando pela
 *     NORMAL — as malhas são OPACAS de face única, a lição do golém) + o ROLAR
 *     da maré e o empurrão do arremesso pelo EIXO (`uSwell`/`uSurge` crescentes
 *     com o nível) + as ONDAS BRANCAS descendo de cima para baixo do WATER_FRAG
 *     (fórmula literal, dosadas para não brigar com a espuma PINTADA) + o aro da
 *     equipe no fresnel — tudo em MARCOS PORCENTUAIS da bbox de cada malha, e a
 *     FERA DA CARA (a janela onde moram olhos/boca) desenhada por nível: a vida
 *     some dela, senão os olhos tremem e a boca derrete;
 *  2. as MESMAS gotas em arco do figurino (`makeSprayGeo`/`SPRAY_VERT`/
 *     `SPRAY_FRAG`) e a rajada de névoa fria no instante em que o jato sai —
 *     mais gotas e rajada mais larga quanto mais alto o nível (como no
 *     WaterRig, e o projétil/impacto no motor engordam junto: ver
 *     `ProjectileField`/`Effects`).
 *
 * ⚠️ A ÁGUA FLUI — é o CONTRÁRIO da regra do golém. Na rocha, osso girando ABRE
 * a superfície; aqui o corpo é macio e o figurino original já achata/estica o
 * corpo inteiro (`g.scale` no WaterRig), então a volumetria do arremesso é
 * ESCALA no osso da BARRIGA e as FAIXAS DE PESO são SUAVES — cisalhar devagar é
 * exatamente o que água faz. O que a lição do golém deixa de pé: rosto e olhos
 * FIRMES e nenhum ângulo grande em osso nenhum.
 *
 * ENCAIXE: cada modelo é escalado para o topo autoral da forma (`formTops` da
 * Nereia: 1,54 → 4,58, a escada mundo comum dos puros) e FLUTUA baixinho como a
 * gotinha sempre flutuou. TETO DE LARGURA: o invólucro autoral da FORMA
 * (`footprintOf`, tabela assinada em `data/footprints.ts` pela regra `MEDIDO =
 * s·(half + abraço)`) é o contrato: encaixo (mesh + sobra das ondas) ≤ entrada,
 * nos dois eixos — o axolotl Nv.2 abre as brânquias, o draco Nv.4 deita a cauda
 * no fundo do buraco e o dragão Nv.5 abre as barbatanas-alas: é ELE que assina o
 * `familyRadius` da família (2,54 → `slotFit` ≈0,95, o maior encaixe entre os
 * puros, porque o abraço da água é o mais apertado dos quatro).
 */

/** dados da espécie (a altura autoral de cada forma vem do catálogo, não do modelo) */
const NEREIA_DEF = getSpecies('nereia');

/** topo autoral por forma (Nv.1..5) — a mesma escada que o motor usa p/ o canhão */
const TOP_BY_LEVEL = [1, 2, 3, 4, 5].map((l) => formTop(NEREIA_DEF, l));

/**
 * A maré sempre FOI flutuante (a gotinha Nv.1 flutuava a 0,042 e o WaterRig
 * flutua `0,03 + 0,012·nível`): aqui a base da malha também boia baixinho. O
 * axolotl (Nv.2) e o draco (Nv.4) têm patas e quase tocam o deck; o
 * hippocampão (Nv.3) e o dragão (Nv.5, que na arte nem pisa) boiam mais.
 */
const FLOAT_Y = [0.042, 0.05, 0.06, 0.04, 0.08];

/** URL da malha da forma (índice = nível-1). O encaixe por bbox torna o resto automático */
const WATER_URLS = [waterLvl1Url, waterLvl2Url, waterLvl3Url, waterLvl4Url, waterLvl5Url];
const waterUrlFor = (level: number): string => WATER_URLS[level - 1];

/**
 * Rumo da malha POR NÍVEL (índice = nível-1): o rig encara o INIMIGO no +Z
 * local (o mesmo +Z do jato). Confirmado no viewer offline (`mesh-viewer.html`
 * + `qa/mesh-viewer-shot.mjs`): os DOIS OLHOS e a boca de todas as cinco estão
 * na fatia +Z. Se algum print mostrar a criatura DE COSTAS, vire aqui (Math.PI
 * para meia-volta; π/2 e −π/2 para os lados).
 *
 * ROUND 7 (normalização dos puros): o draco Nv.4 — corpo fino com a cauda
 * comprida no eixo do rumo — ganhou rumo 3/4 (−35°): a frente continua para o
 * +Z (o jato não muda), mas a cauda entra na DIAGONAL e a largura dele na
 * fileira casa com a dos vizinhos do mesmo nível sem estourar o anel.
 */
export const NEREIA_MODEL_YAWS = [0, 0, 0, -0.611, 0];
const yawFor = (level: number): number => NEREIA_MODEL_YAWS[level - 1];

/** altura de caixa da gotinha Nv.1 — a régua que calibra a fervura das ondas */
const SPAN_NV1 = 1.9762;

/**
 * Sobra da vida da água PARA FORA da caixa CPU da malha (em metros do MODELO
 * Nv.1): ondulação da casca (`RIPPLE_AMP` deslocando pela normal) + o achatado
 * da carga na barriga. A sonda lê a caixa CPU e NÃO vê o deslocamento do vertex
 * shader; esta folga, mais o `FOOT_MARGIN` da tabela, é o que a onda ganha para
 * fora sem vazar do buraco (é o análogo do `SHELL_HUG` do fogo/vento — aqui não
 * há casca, a onda mora no próprio corpo).
 */
const WAVE_HUG = 0.02;

/** paleta do figurino (WATER_ROLE_LOOK.body): azure saturado + espuma branca */
const LOOK = WATER_ROLE_LOOK.body!;
/** ondas brancas do WATER_FRAG sobre a malha: no DIFUSO (mix do albedo, a
 *  receita literal `col = mix(col, uFoam, waves·foamAmt)` do figurino opaco).
 *  Na malha texturizada 0,55 é o meio-termo: a faixa branca lê de longe sem
 *  apagar a pintura (calibrado nos prints do Nv.1) */
const WAVE_AMT = 0.55;
/** reforço EMISSIVO da onda (apagada em repouso; o grosso é o difuso) */
const GLOW_REST = 0.15;
const GLOW_CHARGE = 1.1;
/** amplitude da ondulação da casca em MOVIMENTO (o `uAmp` do figurino no Nv.1
 *  é ≈ 0,07 de peça local) — na malha fica 0,05 NA MEDIDA DO MUNDO (proporcional
 *  a SPAN_NV1/spanY: o corpo de qualquer nível ondula com a mesma mão) */
const RIPPLE_AMP = 0.05;
/** ARO DA EQUIPE no fresnel (as duas lições do print do Nv.1 valem para a
 *  árvore inteira): expoente APERTADO na silhueta (4,2 — o largo 2,2 lavava
 *  metade da barriga) e matiz puxado para o azul-claro da paleta (0,78 — o
 *  dourado da equipe sobre azure viria cáqui sobre a textura clara). */
const RIM_POW = 4.2;
const RIM_COOL = 0.78;
const RIM_DOSE = 0.34;

/**
 * Marcos do corpo em PORCENTAGEM da altura da malha — a régua que a gotinha
 * Nv.1 consagrou (bbox y −1,0015..+0,9747, caixa 1,9762): raiz plantada,
 * BARRIGA que achata e estica, CARA/ombro, e a PONTEIRA que atrasa e açoita no
 * arremesso (a gota é a ponta fina; nos níveis novos é o topo da cabeça/
 * barbatana dorsal — o análogo da barbatana do vento e da crina do fogo). Cada
 * modelo tem a própria caixa, então esqueleto, pesos de pele e o gradiente das
 * ondas NASCEM DA BBOX de cada malha nesta mesma régua.
 */
const BODY_FRAC = {
  /** juntas: raiz, barriga, cara/ombro, ombro → ponta (metades das cadeias) */
  joints: [0.0008, 0.193, 0.5313, 0.7851, 0.9014],
  /** faixas dos pesos de pele (centros das rampas de `ensureSkin`) */
  transitions: [0.1728, 0.4309, 0.5827, 0.8205],
  /** meia-largura das rampas SUAVES (água flui; a máscara dura do golém NÃO vale) */
  rampHalf: 0.0658,
};

/**
 * FERA DA CARA por nível — a janela (altura × frente +Z) onde a VIDA DA ÁGUA
 * no shader DESAPARECE: corrente, onda e swelling só fora dela, senão os olhos
 * tremem e a boca "derrete" (a reclamação da rodada do golém, mesma causa). A
 * caixa é em PORCENTAGEM da bbox + frente relativa à meia-profundidade crua.
 * Nv.1 é a janela EXATA aprovada nos prints da gotinha (olhos em y ≈ −0,1..+0,1,
 * boca em y ≈ −0,35, tudo na frente +Z). Nos níveis novos a cara migra para
 * cima (axolotl: cabeça alta e gordinha; hippocampão/dragão: cara no topo) e os
 * ornamentos (barbatanas, chifres, cristas, brânquias laterais) ficam FORA da
 * janela — na frente não, no topo acima dela, ou longe do +Z — e seguem vivos.
 */
const FACE_BANDS: { y0: number; y1: number; zFrac: number }[] = [
  { y0: 0.294, y1: 0.617, zFrac: 0.376 }, // Nv.1 gotinha (como foi aprovado)
  { y0: 0.52, y1: 0.9, zFrac: 0.42 }, // Nv.2 axolotl: cara grande e alta, brânquias de lado (z pequeno) seguem vivas
  { y0: 0.58, y1: 0.96, zFrac: 0.4 }, // Nv.3 hippocampão: cara no topo; cauda enrolando embaixo açoita
  { y0: 0.62, y1: 0.95, zFrac: 0.55 }, // Nv.4 draco: focinho fundo no +Z; cristas do topo respiram
  { y0: 0.55, y1: 0.9, zFrac: 0.45 }, // Nv.5 dragão: cara com bigodes no topo; coroa/cristal acima livre
];

const tmpWorld = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));
const ramp = (v: number, a: number, b: number) => THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
/** trava de Euler (a regra do golém vale para a água também: nenhum osso gira
 *  ângulo grande — o que faz volume aqui é ESCALA na barriga e ATRASO na ponta) */
const cap = (v: number, m: number) => THREE.MathUtils.clamp(v, -m, m);

/**
 * Pesos de pele POR FAIXA DE Y (2 influências, rampas SUAVES — ao contrário da
 * máscara dura do golém; ver o cabeçalho). Abaixo da base, a casca fica na
 * RAIZ: a barriga achata e a base não levanta. A cara fica no osso da CARA.
 * As faixas vêm da bbox da malha (`BODY_FRAC.transitions`). Carimba o `aSeed`
 * que os shaders da casa exigem (lição WebKit do zéfiro: shader da casa LÊ
 * geometria — sem `aSeed` no WebKit o monstro some).
 */
function ensureSkin(
  geo: THREE.BufferGeometry,
  seed: number,
  bands: readonly number[],
  rampHalf: number,
): void {
  if (!geo.userData.waterSeed) {
    setSeedAttribute(geo, seed);
    geo.userData.waterSeed = true;
  }
  if (geo.userData.nereiaSkin) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    // cadeia de transições (o padrão do zéfiro): abaixo da 1ª altura a casca é
    // o osso 0; acima da última, o osso 4; entre elas, rampa suave entre os
    // dois adjacentes — cisalhar devagar é o que água faz
    let j = 0;
    while (j < bands.length && y >= bands[j]) j++;
    let a = j;
    let b = j;
    let w = 0;
    if (j > 0 && y < bands[j - 1] + rampHalf) {
      a = j - 1;
      b = j;
      w = ramp(y, bands[j - 1] - rampHalf, bands[j - 1] + rampHalf);
    } else if (j < bands.length && y > bands[j] - rampHalf) {
      a = j;
      b = j + 1;
      w = ramp(y, bands[j] - rampHalf, bands[j] + rampHalf);
    }
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    idx[i * 4 + 2] = a;
    idx[i * 4 + 3] = b;
    wgt[i * 4] = 1 - w;
    wgt[i * 4 + 1] = w;
    wgt[i * 4 + 2] = 0;
    wgt[i * 4 + 3] = 0;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.nereiaSkin = true;
}

/**
 * Dispatcher da Nereia: Nv.1..5 = a malha importada da forma (gotinha →
 * axolotl → hippocampão → draco → dragão alado, uma por nível); enquanto a
 * malha carrega, o figurino procedural de maré do MESMO nível segura o palco.
 */
export function NereiaRig(props: WaterRigProps) {
  const level = clampLevel(props.level);
  // enquanto o GLB (3,4-5,3 MB) carrega, o figurino do nível segura o palco
  return (
    <Suspense fallback={<WaterRig {...props} level={level} />}>
      <WaterMeshRig {...props} level={level} />
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function WaterMeshRig({
  seed,
  unitId,
  level: levelProp = 1,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WaterRigProps) {
  const level = clampLevel(levelProp);
  const url = waterUrlFor(level);
  useGLTF.preload(url);
  const { scene } = useGLTF(url);

  // a malha + a textura da fonte (geometry COMPARTILHADO entre instâncias;
  // material e esqueleto são por unidade)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${url} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    const at = (f: number) => bb.min.y + f * spanY; // fração da caixa → metro do modelo
    return {
      geo,
      bb,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      jointY: BODY_FRAC.joints.map(at),
      bands: BODY_FRAC.transitions.map(at),
      yMin: bb.min.y,
      spanY,
      // frente +Z e meia-profundidade da CARA nesta malha (a JANELA da cara é
      // em % da altura; o corte de frente é relativo à meia-profundidade crua)
      halfZ: Math.max(-bb.min.z, bb.max.z),
      face: FACE_BANDS[level - 1],
    };
  }, [scene, level]);

  // encaixe autoral: altura = formTop da forma, corpo centralizado no eixo e a
  // BASE flutuando à altura do figurino do nível (a gotinha sempre boiou); o
  // offset compensa a rotação de rumo (matriz T·R·S). TETO DE LARGURA: a malha
  // também respeita o buraco — o invólucro autoral da FORMA (`footprintOf`,
  // assinado na tabela de `data/footprints.ts` pela regra `s_a·(half + abraço)`)
  // é o contrato: encaixo (mesh + sobra das ondas) ≤ entrada, nos dois eixos.
  // O axolotl abre as brânquias, o draco deita a cauda e o dragão abre as
  // barbatanas-alas — é o pior caso da família que manda no enquadramento, não
  // o contrário (o mesmo compromisso do tornado dos ventos).
  const fit = useMemo(() => {
    const bb = src.bb;
    const foot = footprintOf('nereia', level as MonsterLevel);
    const hug = WAVE_HUG * (SPAN_NV1 / src.spanY); // abraço proporcional ao tamanho
    // meias-extensões NA ORDEM DO RUMO — AABB EXATA da caixa girada (round 7):
    // half = hx·|cos| + hz·|sin| nos eixos do mundo. Com o rumo 3/4 do draco
    // Nv.4 (−35°) a heurística "lado a lado" caía no meio do caminho e
    // assinava a largura que a diagonal pega na fileira no eixo errado
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

  // tint da equipe (o mesmo canal do WaterRig): pinta o ARO da criatura na cor
  // de quem é o dono — o fresnel do WATER_FRAG literal do figurino
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  // material por instância: textura do GLB + a VIDA DA ÁGUA no vértice (o
  // WATER_VERT do figurino nas mesmas escalas) e as ONDAS BRANCAS no fragment
  // (o WATER_FRAG dosado) — o figurino dentro do modelo novo, em todo nível.
  // Os marcos (base da caixa, altura, janela da cara) vêm da bbox de CADA
  // malha via uniforms: a MESMA onda percorre a gotinha e o dragão.
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.42, // molhado: a criatura reflete a arena (metalness baixo,
      metalness: 0.06, // o brilho é o fresnel da receita, não metal falseado)
    });
    const face = src.face;
    const faceY0 = src.bb.min.y + face.y0 * src.spanY;
    const faceY1 = src.bb.min.y + face.y1 * src.spanY;
    const faceZ = src.halfZ * face.zFrac;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: RIPPLE_AMP }; // ondulação da casca (na MESMA medida de mundo: uFA entra escalado por SPAN_NV1/spanY no useFrame)
      sh.uniforms.uFSwell = { value: 0.03 + level * 0.006 }; // o `uSwell` do figurino
      sh.uniforms.uFBend = { value: 0.02 + level * 0.008 }; // balanço lateral
      sh.uniforms.uFSurge = { value: 0 }; // arremesso: puxando/soltando
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFPhase = { value: seed };
      sh.uniforms.uFHurt = { value: 0 };
      sh.uniforms.uFCharge = { value: 0 };
      sh.uniforms.uFGlow = { value: GLOW_REST };
      sh.uniforms.uFGlowCharge = { value: GLOW_CHARGE };
      sh.uniforms.uFFoam = { value: new THREE.Color(LOOK.foam) };
      sh.uniforms.uFFoamAmt = { value: WAVE_AMT };
      sh.uniforms.uFTeam = { value: new THREE.Color(team) };
      // gfrac é fração da ALTURA LOCAL desta malha (a lição do 2º print da
      // gotinha: usar formTop do MUNDO comprimia a fração e a onda congelava na
      // metade de cima)
      sh.uniforms.uFModelH = { value: src.spanY };
      sh.uniforms.uFBase = { value: -src.yMin }; // chão da caixa → origem do gfrac
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSwell;\nuniform float uFBend;\nuniform float uFSurge;\nuniform float uFSeed;\nuniform float uFPhase;\nuniform float uFHurt;\nuniform float uFCharge;\nuniform float uFModelH;\nuniform float uFBase;\nvarying float vGNer;\nvarying float vNNer;\nvarying float vANer;\nvarying float vFaceMask;\nattribute float aSeed;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // VIDA DA ÁGUA na malha — o WATER_VERT do figurino (mesmos ruídos,
          // mesmas escalas, correntes SUBINDO pela casca: água tem peso, é mais
          // lento que o vento). O deslocamento é pela NORMAL: as malhas são
          // OPACAS de face única, então a lição do golém vale.
          vFaceMask = step(${faceY0.toFixed(3)}, transformed.y) *
                      step(transformed.y, ${faceY1.toFixed(3)}) *
                      step(${faceZ.toFixed(3)}, transformed.z);
          float life = 1.0 - vFaceMask; // a cara fica FIRME (olhos/boca não tremem)
          float gh = transformed.y + uFBase;
          float gfrac = clamp(gh / max(0.001, uFModelH), 0.0, 1.0);
          vGNer = gfrac;
          vANer = atan(transformed.z, transformed.x); // o vAng do figurino: a onda quebra EM TORNO do corpo, não em listras retas
          vec3 q = vec3(transformed.x * 2.2, transformed.y * 1.7 - uFT * 1.35, transformed.z * 2.2) + uFSeed + aSeed;
          float n1 = fbm(q);
          float n2 = fnoise(q * 2.4 + vec3(2.2, -uFT * 2.7, 1.1) + 7.0);
          vNNer = mix(n1, n2, 0.35);
          float amp = uFA * (1.0 + uFHurt * 0.4) * (1.0 + uFCharge * 0.5);
          transformed += objectNormal * ((n1 - 0.5) * 1.8 + (n2 - 0.5) * 1.0) * amp * life;
          // o corpo ROLA com a maré e embica no arremesso (as duas fórmulas
          // literais do WATER_VERT: uSwell/uSurge/uBend crescem com a altura)
          float roll = uFSwell * gfrac * (1.0 + uFCharge * 0.9);
          transformed.z += (roll * sin(uFT * 1.3 + uFPhase * 1.4 + gh * 1.1) + uFBend * gfrac * cos(uFT * 0.8 + uFPhase + gh * 0.9) + uFSurge * 0.34 * gfrac) * life;
          transformed.y += 0.12 * uFSwell * gfrac * sin(uFT * 1.1 + uFPhase * 2.1) * life;`,
        );
      sh.fragmentShader =
        `varying float vGNer;\nvarying float vNNer;\nvarying float vANer;\nvarying float vFaceMask;\nuniform float uFT;\nuniform float uFSeed;\nuniform float uFPhase;\nuniform float uFHurt;\nuniform float uFCharge;\nuniform float uFGlow;\nuniform float uFGlowCharge;\nuniform float uFFoamAmt;\nuniform vec3 uFFoam;\nuniform vec3 uFTeam;\n${NOISE_GLSL}\n` +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            /* glsl */ `#include <map_fragment>
            // ONDAS BRANCAS descendo de cima para baixo — a fórmula LITERAL do
            // WATER_FRAG (frente entra suave, traseira corta seco). O figurino
            // é um shader OPACO e faz a onda SUBSTITUIR o albedo ("col =
            // mix(col, uFoam, waves·foamAmt)") — só emissivo NÃO se vê sobre a
            // textura clara; o mix no DIFUSO é o que faz a faixa branca
            // PERCORRER o corpo do topo ao chão (o "glow de água em movimento"
            // aprovado no Nv.1, agora em toda a árvore). NULA na cara.
            float off = fnoise(vec3(vANer * 1.5, vGNer * 0.9, uFPhase + uFSeed)) * 0.55;
            float fall = fract(vGNer * 2.3 + uFT * 0.5 + off);
            // a crista é MAIS LARGA que no figurino (0,18/0,42 em vez de
            // 0,13/0,30): miúda na tela vira listrinha de código de barras
            float band = smoothstep(0.0, 0.18, fall) * (1.0 - smoothstep(0.18, 0.42, fall));
            band *= smoothstep(0.32, 0.62, fnoise(vec3(vANer * 3.1, vGNer * 4.2 - uFT * 0.45, uFPhase)));
            float rib = fract(vGNer * 5.4 + uFT * 1.15 + off * 1.7 + 0.37);
            float ribMask = smoothstep(0.0, 0.08, rib) * (1.0 - smoothstep(0.08, 0.2, rib));
            // ondinhas finas: 0,18 (no figurino 0,35) — somadas à crista viram
            // riscas e apagam a leitura da onda na malha texturizada
            float nerWaves = clamp(band + ribMask * 0.18, 0.0, 1.0) * (1.0 - vFaceMask);
            // espuma só no topo das cristas (o cume da onda)
            float nerCrest = smoothstep(0.68, 0.95, vNNer) * smoothstep(0.8, 0.98, vGNer) * (1.0 - vFaceMask);
            diffuseColor.rgb = mix(diffuseColor.rgb, uFFoam, nerWaves * uFFoamAmt);
            diffuseColor.rgb = mix(diffuseColor.rgb, uFFoam, nerCrest * uFFoamAmt * 0.6);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `#include <emissivemap_fragment>
            // reforço EMISSIVO da onda: apagada em repouso, ACENDE carregando
            // a maré. O grosso é o mix difuso acima — isto só faz a faixa
            // brilhar carregada/no escuro
            totalEmissiveRadiance += uFFoam * (nerWaves + nerCrest * 0.6) * (uFGlow + uFCharge * uFGlowCharge);
            // ARO DA EQUIPE no fresnel (as duas lições do print da gotinha):
            // expoente ALTO (aro apertado na silhueta — o largo banhava metade
            // da barriga e dourado sobre azure virava cáqui) e matiz puxado
            // para o azul-claro da paleta (água Fresnel-reflete o céu da arena,
            // não a lanterna da equipe; jogador segue menta, IA segue lavanda)
            float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
            vec3 nerTeam = mix(uFTeam, vec3(0.70, 0.90, 1.0), ${RIM_COOL});
            totalEmissiveRadiance += nerTeam * pow(1.0 - ndv, ${RIM_POW}) * ${RIM_DOSE};
            // flash de dano (o mix branco do figurino)
            totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * uFHurt * 0.5;`,
          );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed, team, level]);

  // ESQUELETO POR INSTÂNCIA: geometria (com pesos) compartilhada, ossos e
  // animação privados de cada unidade — duas Nereias nunca atacam juntas.
  const rig = useMemo(() => {
    ensureSkin(src.geo, seed, src.bands, BODY_FRAC.rampHalf * src.spanY);
    const mk = (name: string, y: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, y, 0);
      return b;
    };
    const jy = src.jointY;
    const root = mk('root', jy[0]);
    const belly = mk('belly', jy[1] - jy[0]);
    const face = mk('face', jy[2] - jy[1]);
    const shoulder = mk('shoulder', jy[3] - jy[2]);
    const tip = mk('tip', jy[4] - jy[3]);
    root.add(belly);
    belly.add(face);
    face.add(shoulder);
    shoulder.add(tip);
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, belly, face, shoulder, tip]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // o relevo do shader viaja além da esfera
    return { skinned, bones: { root, belly, face, shoulder, tip } };
  }, [src, body, seed]);

  // gotas em arco + clarão de maré: o MESMO idioma do WaterRig — maré maior,
  // mais gotas e arco mais largo (a escada do procedural)
  const spray = useMemo(
    () => ({
      geo: makeSprayGeo(embers ?? 10 + level * 8),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPRAY_VERT,
        fragmentShader: SPRAY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: TOP_BY_LEVEL[level - 1] },
          uSpread: { value: 0.5 + level * 0.22 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [embers, level, emberScale],
  );

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      rig.skinned.skeleton?.dispose();
      spray.geo.dispose();
      spray.mat.dispose();
    },
    [body, rig, spray],
  );

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sprayDone = useRef(true);

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

    // estado da unidade no motor — os mesmos canais do WaterRig
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > WATER_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    // instante em que o jato SAI (fim da carga) — o mesmo beat do figurino
    const releasing =
      sinceAttack >= WATER_WINDUP * WATER_ATTACK_WINDOW && sinceAttack <= WATER_ATTACK_WINDOW;
    const crumble = 1 - alpha; // morrendo a água se desfaz
    const wilt = crumble * 0.9;

    // ---- rajada de névoa fria no instante em que o jato dispara (o bloco
    // literal do WaterRig, no pool compartilhado; maré maior: mais gotas,
    // rajada mais larga e saindo da boca no lugar certo de cada malha) ----
    if (releasing && !sprayDone.current) {
      sprayDone.current = true;
      if (smoke) {
        g.updateWorldMatrix(true, false);
        const mouthZ = fit.s * src.halfZ; // boca na frente crua escalada (Nv.1 ≈ os 0,6 aprovados)
        for (let i = 0; i < 4 + level * 2; i++) {
          tmpWorld
            .set(
              (Math.random() - 0.5) * (0.8 + level * 0.18),
              top * (0.35 + Math.random() * 0.55),
              mouthZ + Math.random() * 0.5,
            )
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.06 + 0.016 * level + Math.random() * 0.03,
            heat: 0.02, // névoa fria
            life: 0.55 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.1,
            vz: 1.2 + Math.random() * 1.4,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > WATER_ATTACK_WINDOW) sprayDone.current = false;

    // ---- DANÇA DA MARÉ: o corpo ACHATA na carga e ESTICA na liberação — é a
    // fórmula LITERAL do figurino (`g.scale` com o `squash`), e mora no osso da
    // BARRIGA porque a base (raiz) tem que continuar plantada no chão enquanto a
    // barriga alarga. O avanço do arremesso (`surge`) é TRANSLAÇÃO do grupo,
    // rígida. follow-through: a ponta é amostrada NO PASSADO (o atraso que a
    // massa da água tem — na gota é a ponteira; nos níveis novos, o topo da
    // cabeça/barbatana dorsal e a cauda que herdam das faixas de cima)
    const pulse = Math.sin(t * 1.35 + seed) * 0.6 + Math.sin(t * 2.7 + 2.2 + seed * 0.4) * 0.4;
    const sq = pose.squash; // −1 achatada .. +0,9 esticada
    const sway = Math.sin(t * 0.55 + seed) * 0.02 + Math.sin(t * 1.2 + 2.1) * 0.008;
    g.rotation.y = sway;
    g.rotation.z = Math.sin(t * 0.4 + seed * 0.6) * 0.015 + wilt * 0.1;
    g.rotation.x = cap(-pose.surge * 0.1 + wilt * 0.16, 0.18);
    g.position.z = pose.surge * 0.12;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.05 * (0.5 + 0.5 * hpFrac) - wilt * 0.05;

    const lagA = attackPose(sinceAttack - 0.07);
    const lagB = attackPose(sinceAttack - 0.14);
    const b = rig.bones;
    // BARRIGA: o squash&stretch do figurino + a respiração da maré (o pulso do
    // WaterRig) + o afundar na morte (a poça)
    const flat = 1 + wilt * 0.5; // morrendo: desaba e alarga feito poça
    b.belly.scale.set(
      (1 - sq * 0.16) * flat,
      (1 + sq * 0.2) * (1 - wilt * 0.55) * (0.78 + 0.22 * hpFrac) * (1 + pulse * 0.02),
      (1 - sq * 0.16) * flat,
    );
    b.belly.rotation.x = cap(pose.surge * 0.05 + Math.sin(t * 0.5 + seed) * 0.01, 0.06);
    // CARA: firme de propósito (o rosto não herda o achata-estica), só atrasa o
    // embicar do arremesso — e a boca `roar` do figurino vira um tope de foco
    b.face.rotation.x = cap(-pose.surge * 0.06 + lagA.surge * 0.04 + pose.roar * 0.05, 0.09);
    b.face.rotation.z = Math.sin(t * 0.6 + seed * 0.5) * 0.012;
    // PONTA: o açoite atrasado (a gota: a ponteira fina; os níveis novos: o
    // topo da cabeça e as barbatanas que herdam das faixas altas)
    const lagTip = lagB.surge - pose.surge;
    const lagTip2 = lagA.surge - pose.surge;
    b.shoulder.rotation.x = cap(-lagTip2 * 0.1 + Math.sin(t * 1.6 + seed) * 0.02, 0.12);
    b.shoulder.rotation.z = Math.sin(t * 1.1 + seed * 0.7) * 0.02;
    b.tip.rotation.x = cap(-lagTip * 0.16 + Math.sin(t * 2.2 + seed * 1.3) * 0.03 - wilt * 0.5, 0.28);
    b.tip.rotation.z = Math.sin(t * 1.8 + seed * 0.9) * 0.03 * (1 - wilt);

    // ---- vida no material: ondulação, maré, ondas brancas e o aro da equipe
    // (a fervura na MESMA medida de mundo em qualquer malha: SPAN_NV1/spanY) ----
    const sh = body.userData.shader as
      | {
          uniforms: {
            uFT: { value: number };
            uFA: { value: number };
            uFSwell: { value: number };
            uFBend: { value: number };
            uFSurge: { value: number };
            uFHurt: { value: number };
            uFCharge: { value: number };
            uFGlow: { value: number };
            uFFoamAmt: { value: number };
          };
        }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      // morrendo a água agita demais e se desfaz (o mesmo multiplicador do figurino)
      sh.uniforms.uFA.value =
        RIPPLE_AMP * (SPAN_NV1 / src.spanY) * (1 + hurt * 0.4 + crumble * 2.4);
      sh.uniforms.uFHurt.value = hurt;
      sh.uniforms.uFCharge.value = pose.charge;
      sh.uniforms.uFSurge.value = pose.surge;
      // a onda branca brilha SEMPRE (o figurino pinta no difuso; aqui é o
      // emissivo dosado) — o glow da carga é reforço por cima, no shader
      sh.uniforms.uFGlow.value = GLOW_REST * (0.8 + 0.2 * hpFrac) * alpha;
      sh.uniforms.uFFoamAmt.value = WAVE_AMT * alpha;
    }

    spray.mat.uniforms.uTime.value = t;
    spray.mat.uniforms.uAlpha.value = alpha;
    spray.mat.uniforms.uCharge.value = pose.charge;

    // ---- clarão de maré (o mesmo halo discreto do figurino: grande demais
    // lava a criatura de azul-branco; forma maior, clarão maior) ----
    const baseGlow = 1.0 + level * 0.18;
    glow.scale.setScalar(Math.max(0.7, baseGlow + pose.flare * 0.6 + hurt * 0.3));
    glow.position.y = top * 0.55;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + level * 0.012 + pose.charge * 0.14 + pose.flare * 0.18) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={yawFor(level)} scale={fit.s}>
        <primitive object={rig.skinned} />
      </group>
      <points geometry={spray.geo} material={spray.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.18}>
        <spriteMaterial
          map={circleTexture()}
          color="#3f9fd8"
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}
