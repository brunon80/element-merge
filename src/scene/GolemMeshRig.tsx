import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import golemLvl1Url from '../models/golem/golem_model_lvl1.glb?url';
import golemLvl2Url from '../models/golem/golem_model_lvl2.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import type { MonsterLevel } from '../game/types';
import { getEngine } from '../store/gameStore';
import { circleTexture, setSeedAttribute } from './assets';
import { NOISE_GLSL } from './flameShaders';
import {
  CHIP_FRAG,
  CHIP_VERT,
  makeChipGeo,
  STONE_ATTACK_WINDOW,
  STONE_ROLE_LOOK,
  STONE_WINDUP,
  StoneRig,
  type StoneRigProps,
} from './StoneRig';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';

/**
 * GOLEM DE MALHA 3D IMPORTADA (linha "modelos 3d", molde do Ignis/Zéfiro/Nereia):
 * Nv.1 e Nv.2 ("penedo" → "rocha viva") trocaram o figurino procedural de rocha
 * por meshes texturizados criados fora do jogo. A ESCADA É A CABEÇA: o Nv.1 é
 * SÓ A CABEÇA (`src/models/golem/golem_model_lvl1.glb` — 24.633 vértices, ~40
 * mil triângulos, UMA malha com UMA textura; esfera com olhos verdes e musgo no
 * topo, SEM ossos e SEM animação no arquivo) e o Nv.2 é o corpo completo que
 * antes vestia o Nv.1 (`golem_model_lvl2.glb` — 24.992 vértices, idêntico byte
 * a byte ao arquivo antigo, e por isso TODAS as calibrações de rig abaixo, feitas
 * no corpo, valem para ele sem mexer em nada). Nv.3+ continua o StoneRig (golem
 * → colosso → MONTANHA MUSCULAR, com as placas e pedras orbitando que só o rig
 * da casa tem), e enquanto a malha carrega o fallback também é o StoneRig.
 * Nv.1 CABEÇA: sem braços nem pernas — a malha é uma bola, então a máscara de
 * braço e as juntas de placa do corpo NÃO se aplicam (girar osso nas laterais
 * cisalharia a face); a cabeça inteira é UMA placa rígida no osso da cabeça com
 * o capuz de musgo atrasando na coroa, e o taco de rocha se solta da frente da
 * cara (telecinese da montanha), não do punho.
 *
 * ⚠️ RODADA 2 (print 1): o INVOLÚCRO DE ROCHA saiu — o modelo segura o palco
 * sozinho e a casca por cima dava um "embrulho". Saíram as ESCALAS (de osso e do
 * grupo): escalar osso num chibi de cabeça enorme incha e derrete o modelo.
 * ⚠️ RODADA 3 (print 2): as DEFORMAÇÕES que sobraram eram ESFREGAÇÃO DE PELE,
 * não escala. Dois erros meus: (a) rampas de pele LARGAS (a faixa
 * quadril→barriga tinha 0,45 de largura = o osso mandava em metade do corpo) e
 * (b) TRÊS ossos de braço (ombro→cotovelo→punho) com transição suave num lobo
 * FUNDIDO — girar 1,4 rad assim estica o lobo até virar uma "palma/prancha".
 * Conferido no `golem-arms.mjs`: os dois braços da malha são SIMÉTRICOS
 * (espessura z 0,37 × 0,35, ambos y −0,71..+0,30), então a prancha do print não
 * é defeito do modelo — é o rig. A correção é o IDIOMA DO FIGURINO: o penedo da
 * rocha viva é feito de PLACAS RÍGIDAS (o punho do StoneRig é uma peça rígida
 * girando na base, `rotation.x = -pose.swing`). Então aqui:
 *  · CORPO = slabs quase rígidos, virando em juntas ESTREITAS (`BAND_W` 0,14).
 *    Isso é o que a própria TEXTURA pede: ela já separa o corpo em placas de
 *    pedra com linhas de rachadura — a dobra cai em cima da linha de rachadura;
 *  · BRAÇO = um lobo RÍGIDO num osso só por lado, com máscara dura. Zero
 *    cisalhamento dentro do braço: o braço inteiro gira como bloco, igual ao
 *    figurino. O "chicote" deixa de vir de três ossos e passa a vir do atraso
 *    dos ossos do CORPO (cabeça/coroa) e do resto da coreografia.
 * ⚠️ RODADA 4 (prints 3–5: "ficou muito pior, nem aparecem mais braços"): o
 * simulador offline `golem-sim4.mjs` (replica o skinning EXATO do three.js na
 * malha real, frame a frame da coreografia) achou os dois defeitos da rodada 3:
 *  (a) o braço FUNDIDO tem a traseira do punho COLADA na nádega/coxa (não há
 *    vale entre eles) — girar ±0,55–0,85 rad ABRE a superfície 0,39–0,57
 *    (30–45 cm!) nessa junção = o "leque escuro" perto da saia; e na carga o
 *    braço ia PARA TRÁS DO CORPO: medido 6% dos vértices do braço visíveis da
 *    câmera (58% no repouso) = "sumiram os braços";
 *  (b) sem CAP, o atraso (trail) da torção chegava a 0,68 rad na GARGANTA —
 *    smear da cabeça (que não tem pescoço) na própria base.
 * A correção (tudo medido no simulador, variantes rejeitadas inclusas):
 *  · o arremesso passa a ser movido pela TORÇÃO DO CORPO via GRUPO (rotação
 *    RÍGIDA = zero deformação; `twist` −0,34 → +1,05, o grupo carrega 72%): o
 *    punho varre ~1 unidade (≈80 cm) — é o maior deslocamento do modelo, mas
 *    vem de girar o bloco inteiro, não de cisalhar pele;
 *  · o osso do braço inclina no MÁXIMO ±0,14 rad de TOMBO lateral (`shZ`, teto
 *    físico da malha fundida; acima disso o rasgo passa de 0,15) e na CARGA ele
 *    ABRE para fora em vez de ir para trás — assim fica 32% visível da câmera na
 *    carga contra 6% antes; na liberação FECHA na frente do corpo (`shZ` −0,10).
 *    O X do ombro (`offX`, traduzido pelo próprio tombo) e o `shX` minúsculo
 *    (+0,10 → −0,06) só pontuam o gesto — o deslocamento todo vem do grupo;
 *  · osso do braço filho da COLUNA (`ARM_PARENT` 2) em vez do peito: divide a
 *    tração da junção fundida entre a banda do quadril e a do peito;
 *  · CAPs nos Euler de coluna/peito/cabeça/coroa (0,10/0,08/0,14/0,12 rad).
 * Resultado medido: rasgo ≤0,13, dobra global ≤0,13 (antes 0,39–0,57) e braço
 * 32–96% visível em todo o ciclo.
 *
 * O GLB não traz esqueleto, então vale o MESMO esquema dos outros dois:
 * esqueleto gerado em código (`ensureSkin`) e a VIDA DA ROCHA em duas camadas:
 *  1. o corpo texturizado com `onBeforeCompile`: o RELEVO de erosão do
 *     `STONE_VERT` (mesmo ruído, deslocando ao longo da normal — a malha
 *     exportada é "limpa" demais e parece usinada sem isso) + a respiração
 *     lenta do monólito; e no FRAGMENT as FISSURAS DE MAGMA do `STONE_FRAG`
 *     (fórmula literal) por DENTRO das rachaduras da textura: quase apagadas
 *     parado, ACENDENDO quando o golem carrega o arremesso (`VEIN_CHARGE`). As
 *     manchas verdes da textura (musgo e os olhos) também ganham uma
 *     bioluminescência de fundo (`uFGreen`, zero para desligar);
 *  2. as MESMAS lascas caindo do corpo (`makeChipGeo`/`CHIP_VERT`/`CHIP_FRAG`
 *     exportados do StoneRig), a poeira dos pés no instante do arremesso, o
 *     TACO DE ROCHA que sai da mão (material do figurino, `makeStoneMaterial`)
 *     e o fio contínuo de poeira de fundo, tudo no pool compartilhado.
 *
 * ATAQUE = ARREMESSO DE ROCHA puxado pelo BRAÇO DIREITO (`throwPose`): a mola é o
 * CORPO — na carga o torso torce para trás e o braço ABRE para fora; na liberação
 * o corpo desenrosca 1,4 rad quase de imediato (o GRUPO, rígido), levando o punho
 * numa varredura de ~1 unidade até a frente do corpo, e o taco de rocha sai da
 * mão — tudo rotação/translação rígidas: nenhum ângulo serve de escala e o
 * `crouch` no máximo abaixa o corpo 0,03.
 *
 * ENCAIXE (molde do zéfiro): cada malha é escalada para o topo autoral da forma
 * (`formTop` Nv.1 = 1,5 / Nv.2 = 2,1) COM TETO DE LARGURA: o invólucro autoral
 * da forma (`footprintOf`, tabela assinada em `data/footprints.ts`) é o contrato
 * — encaixo (mesh + abraço do relevo/respiração) ≤ entrada nos dois eixos. A
 * cabeça Nv.1 é uma esfera e hoje é ela que segura o encaixe pelo teto (a
 * régua antiga do penedo era estreito e raso); o corpo Nv.2 cabe justo no
 * próprio invólucro novo. O corpo é PLANTADO no chão (o penedo não flutua); a
 * cabeça sozinha BOIA um dedo do chão (é uma pedra levitando, não um calhau).
 * A frente das duas malhas (os olhos verdes) está no +Z local: confirmado no
 * viewer offline (`mesh-viewer.html`, prints em 15/nov), o mesmo rumo do
 * fogo/vento/água — por isso `GOLEM_MODEL_YAW = 0`.
 */

/** dados da espécie (a altura autoral de cada forma vem do catálogo, não do modelo) */
const GOLEM_DEF = getSpecies('golem');
/** topo autoral das formas de malha (Nv.1 = 1,5 / Nv.2 = 2,1) */
const TOP_BY_LEVEL = [1, 2].map((l) => formTop(GOLEM_DEF, l));
const LEVEL_1 = 1;
/** Nv.1-2 = malha importada; Nv.3+ = StoneRig (o dispatcher decide por aqui) */
const MESH_MAX_LEVEL = 2;

/** URL da malha da forma (índice = nível-1) */
const GOLEM_MESH_URLS = [golemLvl1Url, golemLvl2Url];
const golemMeshUrlFor = (level: number): string => GOLEM_MESH_URLS[level - 1];

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local (o mesmo +Z do arremesso).
 * Se o print mostrar o bicho DE COSTAS, vire aqui (Math.PI = meia volta; π/2 e
 * -π/2 para os lados).
 */
export const GOLEM_MODEL_YAW = 0;

/**
 * Qual braço arremessa. A criatura encara o +Z, então o braço DIREITO dela é o
 * lado -X local (e é o que aparece à direita na tela quando vemos as costas do
 * nosso bicho). Se o print apontar o braço errado, vire esta constante.
 */
export const THROW_SIDE: 1 | -1 = -1;

/** paleta do figurino (STONE_ROLE_LOOK.body): rocha cinza-azulada + veios de magma */
const LOOK = STONE_ROLE_LOOK.body!;
/** o glowMul do figurino por nível (0,55 + 0,24·nível) — a fissura acende mais alto */
const crackGlowFor = (level: number): number => (LOOK.crackGlow ?? 0.5) * (0.55 + level * 0.24);
/**
 * VEIOS DE MAGMA: o print da rodada 2 reclamou do "embrulho" — os veios ficaram
 * MAIORES e MAIS RAROS (uma ou duas rachaduras de luz no corpo, não renda por
 * tudo) e o brilho em repouso caiu muito: o penedo só acende quando CARREGA.
 */
const CRACK_SCALE = 1.5;
const CRACK_WIDTH = 0.022;
/** reproduz o feedback: quase nada parado, fogo dentro da pedra carregando */
const VEIN_REST = 0.22;
const VEIN_CHARGE = 2.4;

/**
 * ABRAÇO do invólucro (modelo): relevo de erosão do `uFA` (0,075 × ~1,2 do ruído
 * ≈ 0,09 ao longo da normal) + a respiração do monólito (~1,4% da escala). A
 * sonda de footprint lê a caixa CPU e NÃO vê o deslocamento do vertex shader —
 * este abraço é a folga que a pedra ganha para fora (molde do `SHELL_HUG` do
 * vento; o corpo Nv.2 é a malha de referência, caixa y 1,9861).
 */
const HUG = 0.1;
const SPAN_REF = 1.9861;
/** a cabeça sozinha (Nv.1) boia um dedo do chão; o corpo é plantado */
const FLOAT_HEAD_Y = 0.05;

/**
 * Juntas do esqueleto de código (o GLB não traz nenhuma), LIDAS NA MALHA (bbox
 * y −1,00..+0,98) e na TEXTURA: ela já quebra o corpo em PLACAS de pedra com
 * linhas de rachadura em y ≈ −0,62 (culote/saia→pernas), −0,2 (ventre→cintura),
 * +0,12 (peito), +0,34 (a GARGANTA — o penedo NÃO tem pescoço: a cabeça é uma
 * pedra da mesma largura do corpo sentada ali) e +0,76 (topo da cabeça, o musgo).
 * A junta da cabeça em +0,62 (rodada 2) ficava DENTRO da própria cabeça: virar
 * ali amassava a pedra da cabeça — exatamente a reclamação do print.
 */
const JOINT_Y = [-1.0, -0.62, -0.2, 0.12, 0.34, 0.76];
/** junta da tampa de musgo da CABEÇA sozinha (Nv.1): a rampa de pele 4→5 (osso da
 *  cabeça → coroa) atravessa estes y da malha (bbox y −0,82..+0,79); o musgo mora
 * no topo e a cara inteira fica na placa da cabeça, RÍGIDA — sem máscara de braço
 * (a bola não tem braço; girar osso na lateral cisalharia a face) */
const HEAD_BAND_LO = 0.46;
const HEAD_BAND_HI = 0.58;
/**
 * LARGURA da faixa de virada de cada junta (unidade da malha), na ordem das
 * juntas acima da raiz: culote (y −0,62), cintura (−0,2), peito (+0,12),
 * garganta (+0,34), musgo (+0,76). ESTREITA de propósito: com rampa larga o osso
 * manda em metade do corpo e a pedra AMASSA quando o osso gira (foi a causa nº 1
 * do print 2). Estreita = a placa gira como bloco e a dobra cai em cima da linha
 * de rachadura que a textura já desenha. Na garganta é um pouco mais larga
 * (0,20) porque a cabeça é larga feito o corpo: dobra estreita ali abriria uma
 * FENDA em vez de virar.
 */
const BAND_W = [0.14, 0.14, 0.14, 0.2, 0.1];

/**
 * BRAÇO (medido no `golem-cut.mjs`/`glab3.mjs`, coordenadas da malha): a coluna
 * lateral |x| ≥ 0,55 SÓ existe entre y +0,30 e y −0,71 — é o braço pendurado
 * (ombro em y ≈ +0,10, punho de pedra em y ≈ −0,47, chegando a |x| 0,83). A
 * malha é FUNDIDA (braço e corpo são a mesma superfície, sem vão), então a
 * fronteira é um vinco: as portas abaixo são INCLINADAS porque a silhueta é
 * torta — a barriga do punho SOBE conforme |x| cresce (coluna |x| 0,55 vai a
 * y −0,69, coluna |x| 0,80 só a −0,55) e o topo do ombro DESCE (coluna 0,55
 * sobe a +0,22, coluna 0,70 a −0,10). As pernas sobem até |x| ~0,6 embaixo, e a
 * cabeça enorme mora ACIMA de y +0,24 — osso de braço puxando a cabeça é o tal
 * "modelo derretido".
 * UM osso por braço (o lobo é RÍGIDO): as posições de punho abaixo são só a
 * MEDIÇÃO da silhueta (máscara + de onde nasce o taco), não viram osso.
 */
const ARM_SHOULDER_X = 0.47;
const ARM_SHOULDER_Y = 0.1;
const ARM_WRIST_X = 0.76;
const ARM_WRIST_Y = -0.47;
/** rampa da máscara em |x| atravessando o vinco (DURA: o lobo gira inteiro) */
const ARM_X_IN = 0.46;
const ARM_X_OUT = 0.51;
/** teto do braço: yTop = 0,30 − 0,8·(|x| − 0,55), nunca acima de 0,24 (cabeça) */
const ARM_TOP_Y = 0.3;
const ARM_TOP_CAP = 0.24;
const ARM_TOP_SLOPE = 0.8;
const ARM_TOP_FADE = 0.06;
/** chão do braço: yBot = −0,70 + 0,5·(|x| − 0,58) (a barriga do punho subindo) */
const ARM_BOT_Y = -0.7;
const ARM_BOT_SLOPE = 0.5;
const ARM_BOT_FADE = 0.06;
/** cápsula da linha ombro→punho: o que passa de 0,34 de distância dela perde o
 *  peso do braço (seguro extra pra saia/perna não subirem com o arremesso) */
const ARM_CAP_NEAR = 0.28;
const ARM_CAP_FAR = 0.34;
/** o punho na malha, no espaço LOCAL do osso do ombro (x com o sinal do lado) */
const ARM_FIST_X = 0.29;
const ARM_FIST_Y = -0.57;
const ARM_FIST_Z = -0.02;
/** o "punho" da CABEÇA sozinha (Nv.1) na malha local: na FRENTE da cara, abaixo
 *  dos olhos — sem braços, o taco se solta por telecinese da própria rocha
 *  (o z 1,12 já nasce fora da superfície, meia-envergadura z da esfera ≈ 1,0) */
const HEAD_FIST_X = 0.0;
const HEAD_FIST_Y = 0.02;
const HEAD_FIST_Z = 1.12;
/**
 * Pai do osso do braço no esqueleto: COLUNA (índice 2, junta em y −0,2) em vez
 * do peito. RODADA 4, medido no simulador: com o osso no peito, o tombo do braço
 * puxava a junção fundida punho↔quadril INTEIRA contra a banda do culote — o
 * rasgo na carga era o dobro. Filho da coluna, a tração se divide entre a banda
 * quadril→coluna e a coluna→peito e o rasgo cai para ≤0,13. Ombro continua em y
 * +0,10 no mundo (só o elo do esqueleto mudou), então a origem local do taco de
 * rocha segue correta.
 */
const ARM_PARENT = 2;

const tmpWorld = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));
const ramp = (v: number, a: number, b: number) => THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
/** trava de segurança: todo Euler de osso que a coreografia monta passa por aqui
 * (o simulador mediu o teto de cada junta — acima disso a placa cisalha a pele) */
const cap = (v: number, m: number) => THREE.MathUtils.clamp(v, -m, m);

/**
 * COREOGRAFIA DO ARREMESSO DE ROCHA (`throwPose`), no mesmo relógio do motor e na
 * MESMA janela do soco do figurino (`STONE_ATTACK_WINDOW` 0,52 s, carga até
 * `STONE_WINDUP` 0,44 da janela = instante da liberação).
 *
 * Tudo aqui é ROTAÇÃO de PLACA (radianos) e TRANSLAÇÃO: nenhum ângulo serve de
 * escala, o `crouch` no máximo abaixa o corpo 0,03 e as rotações dos ossos do
 * corpo são PEQUENAS — a volumetria grande (torção, passo, joelho) mora no
 * grupo, que transforma o modelo INTEIRO rígido (logo, não deforma nada).
 * Sinais (braço direito = -X, `THROW_SIDE` = -1):
 *  · `shX` é o pêndulo ombro→punho no plano X-Z (positivo = punho para TRÁS).
 *    Na malha fundida ele é MINÚSCULO (±0,14: o braço vai de 0,55 atrás a 0,85
 *    na rodada 3 e rasgou 0,39–0,57 — ver o cabeçalho); o castigo de "ir para
 *    trás" é pago pelo `twist` do corpo, não pelo braço;
 *  · `shZ` é multiplicado pelo lado: positivo = o lobo ABRE para FORA (o
 *    tombo seguro da malha), negativo = FECHA na frente do corpo;
 *  · `offX` (braço livre) e o `shX` pequeno são o pontinho da coreografia —
 *    medido no simulador, nada de relevante se move sem o `twist`;
 *  · `twist` negativo na carga traz o ombro do arremesso para trás e positivo
 *    no arremesso o joga para frente (derivado na malha: girar +Y leva o ombro
 *    -X para o +Z). O GRUPO carrega 72% disso = rotação rígida, zero rasgo.
 */
export interface ThrowPose {
  twist: number; // corpo gira (a mola do arremesso: −0,34 na carga → +1,05 no taco)
  lean: number; // corpo inclina (carga: para trás; arremesso: para frente)
  crouch: number; // 0..1 dobra os joelhos (SÓ desce o corpo, sem escala)
  stepZ: number; // empurra o corpo para frente no arremesso
  charge: number; // músculos/fissuras acendendo (0..1)
  look: number; // cabeça acompanha o arco da pedra
  shX: number; // pêndulo do braço que arremessa (pequeno: ±0,14)
  shZ: number; // tombo lateral do braço: + abre para fora, − fecha à frente
  offX: number; // braço livre ABRE na carga (equilíbrio; deslocamento local)
}

/** fração da janela em que o golem está carregando o arremesso (libera em seguida) */
const THROW_LOAD = STONE_WINDUP;

export function throwPose(since: number): ThrowPose {
  const P: ThrowPose = {
    twist: 0,
    lean: 0,
    crouch: 0,
    stepZ: 0,
    charge: 0,
    look: 0,
    shX: 0,
    shZ: 0,
    offX: 0,
  };
  if (since < 0 || since > STONE_ATTACK_WINDOW) return P;
  const p = since / STONE_ATTACK_WINDOW;
  if (p < THROW_LOAD) {
    // CARGA: o CORPO carrega a mola — torce para trás (o ombro do arremesso
    // recua com o grupo, RÍGIDO), o peso recua e os joelhos dobram. O braço
    // quase não se mexe: ABRE para fora (`shZ`) para o lobo não afundar atrás
    // do quadril (o rasgo/sumiço da rodada 3) e dá um puxão de ±0,10 para trás
    const k = (p / THROW_LOAD) ** 1.5;
    P.twist = -0.34 * k;
    P.lean = -0.06 * k;
    P.crouch = 0.85 * k;
    P.stepZ = -0.06 * k;
    P.charge = k;
    P.look = -0.06 * k;
    P.shX = 0.1 * k; // pontinho do pêndulo para trás (o teto da malha é ±0,14)
    P.shZ = 0.14 * k; // e o braço ABRE para fora
    P.offX = 0.4 * P.shX; // braço livre acompanha o tombo (equilíbrio)
    return P;
  }
  // ARREMESSO: o CORPO desenrosca a mola quase de imediato (curta `a`: satura em
  // r = 0,20) — é o grupo girando 1,39 rad, a rotação rígida que o simulador
  // provou não abrir NENHUMA pele; o braço fecha na frente do corpo e o corpo
  // dá o passo. Depois relaxa até o fim da janela
  const r = (p - THROW_LOAD) / (1 - THROW_LOAD);
  const a = 1 - (1 - Math.min(1, r / 0.2)) ** 2;
  const fade = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (-0.34 + 1.39 * a) * fade; // −0,34 (carga) → +1,05 (punho à frente)
  P.lean = (-0.06 + 0.2 * a) * fade;
  P.crouch = Math.max(0, 0.85 - 0.9 * a) * fade; // pernas estendem, peso na frente
  P.stepZ = (-0.06 + 0.24 * a) * fade;
  P.charge = Math.max(0, 1 - 1.4 * r) * fade;
  P.look = (-0.06 + 0.3 * a) * fade; // cabeça segue a pedra (tope cap 0,14 rad)
  P.shX = (0.1 - 0.16 * a) * fade; // +0,10 atrás → −0,06 à frente (fechando)
  P.shZ = (0.14 - 0.24 * a) * fade; // abre na carga → fecha −0,10 na liberação
  P.offX = 0.4 * P.shX; // braço livre fecha junto
  return P;
}

/** distância de (ax, y) ao segmento (ax0,y0)→(ax1,y1) no plano |x|-Y */
function segDist(ax: number, y: number, ax0: number, y0: number, ax1: number, y1: number): number {
  const wx = ax1 - ax0;
  const wy = y1 - y0;
  const t = THREE.MathUtils.clamp(((ax - ax0) * wx + (y - y0) * wy) / (wx * wx + wy * wy), 0, 1);
  return Math.hypot(ax - (ax0 + wx * t), y - (y0 + wy * t));
}

/**
 * MÁSCARA DE BRAÇO (0 = corpo puro, 1 = lobo do braço puro) num vértice (|x|, y).
 * Quatro condições multiplicadas, todas LIDAS NA SILHUETA da malha:
 *  1. rampa CURTA em |x| atravessando o vinco corpo↔lobo (0,46 → 0,51 — dura de
 *     propósito: o lobo tem que girar INTEIRO, e rampa larga foi o que virou o
 *     braço em "palma" no print 2);
 *  2. TETO inclinado: o topo do ombro desce conforme |x| cresce e nunca passa de
 *     y +0,24 — acima é a CABEÇA (metade do modelo);
 *  3. CHÃO inclinado: a barriga do punho sobe conforme |x| (a perna/saia sobem
 *     até |x| ~0,6 em y −0,7 e não podem colar no braço);
 *  4. CÁPSULA da linha ombro→punho: o que fica a mais de 0,34 de distância dos
 *     ossos do braço perde o peso do braço (a saia não sobe com o arremesso).
 */
function armBlend(ax: number, y: number): number {
  const side = ramp(ax, ARM_X_IN, ARM_X_OUT);
  if (side <= 0) return 0;
  const yTop = Math.min(ARM_TOP_CAP, ARM_TOP_Y - ARM_TOP_SLOPE * (ax - 0.55));
  const top = 1 - ramp(y, yTop - ARM_TOP_FADE, yTop);
  if (top <= 0) return 0;
  const yBot = ARM_BOT_Y + ARM_BOT_SLOPE * (ax - 0.58);
  const bot = ramp(y, yBot - ARM_BOT_FADE, yBot + 0.03);
  if (bot <= 0) return 0;
  const d = segDist(ax, y, ARM_SHOULDER_X, ARM_SHOULDER_Y, ARM_WRIST_X, ARM_WRIST_Y);
  return side * top * bot * (1 - ramp(d, ARM_CAP_NEAR, ARM_CAP_FAR));
}

/** índices dos ossos no `Skeleton` (a ordem do array do `rig` é o que vale):
 *  0..5 = corpo (raiz→quadril→coluna→peito→cabeça→coroa), 6 = braço do lado -X,
 *  7 = braço do lado +X (a máscara de pele em `ensureSkin` usa os mesmos) */
const ARM_NEG = 6;
const ARM_POS = 7;

/**
 * Pesos de pele. CORPO (Nv.2): cada PLACA é um osso, virando numa faixa ESTREITA
 * (`BAND_W`) em volta da junta — a dobra cai na linha de rachadura que a textura
 * já desenha; BRAÇO: um osso só por lado com a máscara dura (`armBlend`), e o
 * pouco de peso de corpo que sobra na borda do ombro mantém o lobo colado ao
 * torso. Nos 4 slots de influência: 2 do corpo, 2 do braço (do mesmo osso).
 * CABEÇA (Nv.1): placa única na cabeça + capuz de musgo na coroa (ver acima).
 * Uma vez por geometria; as instâncias compartilham os atributos, cada uma
 * anima o PRÓPRIO esqueleto.
 */
function ensureSkin(geo: THREE.BufferGeometry, head: boolean): void {
  if (geo.userData.golemSkin) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (head) {
      // CABEÇA SOZINHA (Nv.1): uma placa RÍGIDA na cara (osso 4) com o capuz de
      // musgo atrasando na coroa (osso 5) — os ossos do meio da cadeia não têm
      // um vértice sequer de propósito. A cabeça não tem pescoço nem braço: a
      // volumetria do arremesso é o GRUPO girando a bola inteira, e a máscara
      // de braço do corpo aqui só cisalharia a face.
      const t = ramp(y, HEAD_BAND_LO, HEAD_BAND_HI);
      idx[i * 4] = 4;
      idx[i * 4 + 1] = 5;
      idx[i * 4 + 2] = 4;
      idx[i * 4 + 3] = 5;
      wgt[i * 4] = 1 - t;
      wgt[i * 4 + 1] = t;
      wgt[i * 4 + 2] = 0;
      wgt[i * 4 + 3] = 0;
      continue;
    }
    // ---- corpo: placa pura + virada na junta (pés plantados = raiz)
    let a = 0;
    let b = 0;
    let w = 0;
    for (let j = 0; j < 5; j++) {
      const half = BAND_W[j] / 2;
      const lo = JOINT_Y[j + 1] - half;
      const hi = JOINT_Y[j + 1] + half;
      if (y < lo) {
        a = j;
        b = j;
        w = 0; // dentro da placa j
        break;
      }
      if (y <= hi) {
        a = j;
        b = j + 1;
        w = ramp(y, lo, hi); // virando entre a placa j e a j+1
        break;
      }
      a = j + 1;
      b = j + 1;
      w = 0;
    }
    // ---- braço: lobo rígido num osso só (par = o mesmo osso duas vezes)
    const armW = armBlend(Math.abs(x), y);
    const base = x < 0 ? ARM_NEG : ARM_POS;
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    idx[i * 4 + 2] = base;
    idx[i * 4 + 3] = base;
    wgt[i * 4] = (1 - armW) * (1 - w);
    wgt[i * 4 + 1] = (1 - armW) * w;
    wgt[i * 4 + 2] = armW;
    wgt[i * 4 + 3] = 0;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.golemSkin = true;
}

/**
 * Dispatcher do Golem: Nv.1-2 = malha importada (a cabeça do penedo → o corpo
 * completo que antes vestia o Nv.1); Nv.3..5 = StoneRig (golem → colosso →
 * MONTANHA MUSCULAR continua procedural, com as placas, trapézios de ombro e
 * pedras orbitando que só o rig da casa tem). Enquanto a malha carrega, o
 * figurino procedural do MESMO nível segura o palco.
 */
export function GolemRig(props: StoneRigProps) {
  const level = clampLevel(props.level);
  if (level <= MESH_MAX_LEVEL) {
    // enquanto o GLB (5,5-5,7 MB) carrega, o penedo antigo segura o palco
    return (
      <Suspense fallback={<StoneRig {...props} level={level} />}>
        <GolemMeshRig {...props} level={level} />
      </Suspense>
    );
  }
  return <StoneRig {...props} level={level} />;
}

/** malha pura da forma (Nv.1-2) — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function GolemMeshRig({
  seed,
  unitId,
  level: levelProp = LEVEL_1,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: StoneRigProps) {
  const level = clampLevel(levelProp);
  const headOnly = level === 1; // Nv.1 = SÓ A CABEÇA; Nv.2 = o corpo completo
  const topY = TOP_BY_LEVEL[level - 1];
  const url = golemMeshUrlFor(level);
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
    const tex = (meshes[0].material as THREE.MeshStandardMaterial).map;
    return { geo, tex };
  }, [scene, url]);

  // encaixe autoral: altura = formTop da forma, corpo centralizado e a BASE no
  // chão (o penedo de corpo é PLANTADO; a cabeça sozinha boia um dedo). TETO DE
  // LARGURA (molde do zéfiro): o invólucro autoral da forma (`footprintOf`,
  // tabela assinada em `data/footprints.ts`) é o contrato — encaixo (mesh +
  // abraço do relevo/respiração) ≤ entrada nos dois eixos. A cabeça Nv.1 é uma
  // esfera e é hoje quem segura o encaixe pelo teto; o corpo Nv.2 (meia-
  // envergadura escalada ~0,87 × 0,51) cabe no invólucro novo da forma.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    const foot = footprintOf('golem', level as MonsterLevel);
    const hug = HUG * (SPAN_REF / spanY); // abraço proporcional ao tamanho
    const halfWide = Math.max(-bb.min.x, bb.max.x);
    const halfAlong = Math.max(-bb.min.z, bb.max.z);
    const sW = Math.min(foot.x / (halfWide + hug), foot.z / (halfAlong + hug));
    const s = Math.min(topY / spanY, sW);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(GOLEM_MODEL_YAW) + cz * Math.sin(GOLEM_MODEL_YAW));
    const pz = cx * Math.sin(GOLEM_MODEL_YAW) - cz * Math.cos(GOLEM_MODEL_YAW);
    return {
      s,
      pos: [px, (headOnly ? FLOAT_HEAD_Y : 0) - bb.min.y * s, pz] as [number, number, number],
    };
  }, [src, level, headOnly, topY]);

  // tint da equipe (o mesmo canal do StoneRig): pinta o aro do TACO DE ROCHA
  // que sai da mão na cor de quem é o dono
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  // material por instância: textura do GLB + vida de rocha no vértice e as
  // fissuras de magma acesas no fragment (o figurino dentro do modelo novo)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.93,
      metalness: 0.04,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: LOOK.amp }; // relevo/erosão base do figurino (0,075)
      sh.uniforms.uFBreath = { value: 0 };
      sh.uniforms.uFHurt = { value: 0 };
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFCharge = { value: 0 };
      sh.uniforms.uFGlow = { value: crackGlowFor(level) * VEIN_REST };
      sh.uniforms.uFCrackCol = { value: new THREE.Color(LOOK.crack) };
      sh.uniforms.uFWidth = { value: CRACK_WIDTH };
      sh.uniforms.uFGreen = { value: 0.24 };
      sh.vertexShader =
        `uniform float uFA;\nuniform float uFBreath;\nuniform float uFSeed;\nuniform float uFHurt;\nvarying vec3 vLPos;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // VIDA DA ROCHA na malha — o RELEVO de erosão do STONE_VERT (mesmo
          // ruído, mesmas escalas, deslocando ao longo da normal): a malha
          // exportada é lisa demais e sem isso a pedra parece usinada. Aqui a
          // normal é segura: a malha é OPACA de face única (doubleSided=false),
          // a lição das "rachaduras" valia para uma CASCA com as duas faces.
          vLPos = position + uFSeed;
          float rn1 = fbm(vLPos * 1.7);
          float rn2 = fnoise(vLPos * 4.4 + 7.0);
          transformed += objectNormal * ((rn1 - 0.5) * 1.6 + (rn2 - 0.5) * 0.8) * uFA * (1.0 + uFHurt * 0.3);
          // respiração lenta do monólito (o fator literal do figurino: a
          // montanha respira, nunca vira bolha)
          transformed *= 1.0 + uFBreath * 0.014 * (0.55 + 0.45 * rn1);`,
        );
      sh.fragmentShader =
        `varying vec3 vLPos;\nuniform float uFT;\nuniform float uFSeed;\nuniform float uFCharge;\nuniform float uFHurt;\nuniform float uFGlow;\nuniform float uFWidth;\nuniform vec3 uFCrackCol;\nuniform float uFGreen;\n${NOISE_GLSL}\n` +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          // FISSURAS DE MAGMA do STONE_FRAG (fórmula literal) por DENTRO das
          // rachaduras que a própria textura já desenha: uma ou duas veias de
          // luz (escala grande), quase apagadas em repouso, ACENDENDO quando o
          // golem carrega o arremesso. Renda de lava por tudo era o "embrulho"
          // que o print reclamou — o modelo é a estrela aqui.
          float vein = fnoise(vLPos * 3.1 * ${CRACK_SCALE.toFixed(2)} + vec3(0.0, uFT * 0.06, 0.0));
          float w = uFWidth;
          float crack = smoothstep(0.5 - w, 0.5 - w * 0.25, vein) * (1.0 - smoothstep(0.5 + w * 0.25, 0.5 + w, vein));
          float pulse = 0.7 + 0.3 * sin(uFT * 1.5 + uFSeed) + uFCharge * ${VEIN_CHARGE.toFixed(2)};
          totalEmissiveRadiance += uFCrackCol * crack * uFGlow * pulse * 1.7;
          #ifdef USE_MAP
            // bioluminescência do musgo e dos OLHOS verdes do modelo (pixels
            // verde-dominantes): 0 desliga, subir acende o musgo inteiro
            vec3 tcol = texture2D(map, vMapUv).rgb;
            float green = smoothstep(0.16, 0.45, tcol.g - max(tcol.r, tcol.b));
            totalEmissiveRadiance += vec3(0.28, 0.85, 0.42) * green * uFGreen;
          #endif
          // flash de dano (o mix branco do figurino)
          totalEmissiveRadiance += vec3(0.85, 0.88, 0.92) * uFHurt * 0.55;`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed, level]);

  // ESQUELETO POR INSTÂNCIA: geometria (com pesos) compartilhada, ossos e
  // animação privados de cada unidade — dois penedos Nv.1 nunca atacam juntos.
  // PLACAS do corpo (raiz→coroa) + UM osso de braço por lado nascido na COLUNA
  // (`ARM_PARENT` — divide a tração da junção fundida, ver cabeçalho RODADA 4).
  const rig = useMemo(() => {
    ensureSkin(src.geo, headOnly);
    const mk = (name: string, x: number, y: number, z = 0) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      return b;
    };
    const root = mk('root', 0, JOINT_Y[0]);
    const hips = mk('hips', 0, JOINT_Y[1] - JOINT_Y[0]);
    const spine = mk('spine', 0, JOINT_Y[2] - JOINT_Y[1]);
    const chest = mk('chest', 0, JOINT_Y[3] - JOINT_Y[2]);
    const head = mk('head', 0, JOINT_Y[4] - JOINT_Y[3]);
    const crown = mk('crown', 0, JOINT_Y[5] - JOINT_Y[4]);
    root.add(hips);
    hips.add(spine);
    spine.add(chest);
    chest.add(head);
    head.add(crown);
    // osso do braço na base do lobo (o pai é a COLUNA, `ARM_PARENT` — junta em
    // JOINT_Y[2]; daí o Y negativo relativo: o ombro fica ACIMA da coluna)
    const armBone = (sign: 1 | -1, tag: string) => {
      const sh = mk(
        `arm${tag}`,
        sign * ARM_SHOULDER_X,
        ARM_SHOULDER_Y - JOINT_Y[ARM_PARENT],
        0.02,
      );
      [root, hips, spine, chest, head, crown][ARM_PARENT].add(sh);
      return sh;
    };
    const armNeg = armBone(-1, 'N');
    const armPos = armBone(1, 'P');
    // braço que arremessa / braço que equilibra (convenção `THROW_SIDE`)
    const [thr, off] = THROW_SIDE < 0 ? [armNeg, armPos] : [armPos, armNeg];
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, hips, spine, chest, head, crown, armNeg, armPos]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // o relevo do shader viaja além da esfera
    return { skinned, bones: { root, hips, spine, chest, head, crown, thr, off } };
  }, [src, body, headOnly]);

  // TACO DE ROCHA que o penedo arremessa: a PEDRA DO FIGURINO (mesmo material
  // de rocha com luz da arena, veios e aro da equipe) numa pedra bruta angular
  // — é o que "vende" o arremesso. Vive no espaço do grupo de animação
  // (unidades da arena), nunca na malha.
  const rock = useMemo(() => {
    // o taco engorda com o nível (0,085 → 0,10 no Nv.2) — a mesma régua do
    // figurino, onde o punho do arremesso é maior a cada fusão
    const geo = new THREE.IcosahedronGeometry(0.085 * (1 + 0.18 * (level - 1)), 0);
    setSeedAttribute(geo, seed); // o STONE_VERT lê aSeed em todo vértice
    const mat = makeStoneMaterial({
      rockA: LOOK.rockA,
      rockB: LOOK.rockB,
      crack: LOOK.crack,
      amp: 0.022, // pedra pequena: o relevo do figurino (0,075) a deformaria
      crackGlow: 0.45,
      crackScale: 2.2,
      crackWidth: 0.06,
      speck: 0.7,
      seed,
      breath: 0, // pedra voando não respira
      teamColor: team,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(1.15, 0.85, 1);
    mesh.visible = false;
    mesh.castShadow = true;
    return { mesh, geo, mat };
  }, [seed, team, level]);

  // lascas caindo do corpo + poeira: o MESMO idioma do StoneRig (Nv.1 penedo)
  const chips = useMemo(
    () => ({
      geo: makeChipGeo(embers ?? 6 + level * 6),
      mat: new THREE.ShaderMaterial({
        vertexShader: CHIP_VERT,
        fragmentShader: CHIP_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uSpread: { value: 0.55 + level * 0.2 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [embers, level, emberScale],
  );

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      rock.geo.dispose();
      rock.mat.dispose();
      rig.skinned.skeleton?.dispose();
      chips.geo.dispose();
      chips.mat.dispose();
    },
    [body, rock, rig, chips],
  );

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const dustAcc = useRef(0);
  const strikeDone = useRef(true);
  /** voo do taco: -1 = dormindo; senão, segundos desde a liberação */
  const fly = useRef({ t: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 });

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

    // estado da unidade no motor — os mesmos canais do StoneRig
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
      if (demoT.current > STONE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = throwPose(sinceAttack);
    // instante em que a pedra SAI da mão (fim da carga) — o mesmo beat do soco
    const loaded =
      sinceAttack >= THROW_LOAD * STONE_ATTACK_WINDOW && sinceAttack <= STONE_ATTACK_WINDOW;
    const crumble = 1 - alpha; // morrendo: a rocha se desfaz
    const wilt = crumble * 0.9; // morte: o penedo desaba

    // ---- DANÇA DO PENEDO: a volumetria do arremesso mora TODA no GRUPO — que
    // transforma o modelo inteiro como um bloco rígido (logo NÃO deforma nada:
    // a torção de 1,4 rad, a inclinação, o passo à frente e o joelho dobrando
    // SÓ como TRANSLAÇÃO, 0,03 no máximo). SEM ESCALA em grupo ou osso: escalar
    // osso num chibi de cabeça enorme derrete o modelo (print 1). Morte: o
    // penedo desaba RÍGIDO (afunda e inclina), sem torcer placa nenhuma.
    const sway = Math.sin(t * 0.5 + seed) * 0.022 + Math.sin(t * 1.1 + 1.7) * 0.008;
    g.rotation.y = sway + pose.twist * 0.72;
    g.rotation.z = Math.sin(t * 0.42 + seed * 0.6) * 0.012 + THROW_SIDE * pose.twist * 0.06;
    g.rotation.x = cap(pose.lean, 0.15) + Math.sin(t * 0.55 + seed * 0.4) * 0.006 + wilt * 0.18;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.014 - pose.crouch * 0.03 - wilt * 0.06;
    g.position.z = pose.stepZ;

    // ---- ATRASO DE MASSA: o topo chega DEPOIS do corpo (amostrado 70/140 ms no
    // passado). Nas PLACAS do corpo o atraso entra com ângulo PEQUENO e CAPADO
    // (o simulador provou: sem cap, o trail da torção chegava a 0,68 rad na
    // GARGANTA e a cabeça — que não tem pescoço — amassava na própria base); a
    // CABEÇA e a COROA de musgo é que levam o atraso de verdade — e é o bastante,
    // porque é onde o olho do jogador está
    const lagA = throwPose(sinceAttack - 0.07);
    const lagB = throwPose(sinceAttack - 0.14);
    const trailA = lagA.twist - pose.twist;
    const trailB = lagB.twist - pose.twist;
    const b = rig.bones;
    // ANGULOS CAPADOS nas placas do corpo: a dobra é estreita, então cada grau
    // de diferença entre placas vira um degrau na linha de rachadura. A torção do
    // arremesso é o GRUPO que carrega (rígido); as placas só dão o atraso
    // segmentar — e o cap é o teto que o simulador mediu por junta.
    b.spine.rotation.y =
      cap(pose.twist * 0.06 + trailA * 0.1, 0.1) + Math.sin(t * 0.5 + seed) * 0.004;
    b.spine.rotation.x = cap(pose.lean * 0.25, 0.05);
    b.chest.rotation.y =
      cap(pose.twist * 0.04 + trailA * 0.07, 0.08) + Math.sin(t * 0.6 + seed) * 0.005;
    b.chest.rotation.x = cap(pose.lean * 0.2, 0.04);
    // a cabeça NÃO desencaça do alvo de propósito (contra-giro grande cisalharia
    // a garganta, que é larga feito o corpo): ela é arrastada pelo torso e
    // atrasa — peso de montanha — sempre dentro do cap de 0,14 rad
    b.head.rotation.y =
      cap(-pose.twist * 0.06 + trailB * 0.16, 0.14) + Math.sin(t * 0.6 + seed * 0.5) * 0.014;
    b.head.rotation.x = cap(
      Math.sin(t * 0.7 + seed * 0.8) * 0.012 + pose.look - pose.lean * 0.4 - hurt * 0.12 + wilt * 0.5,
      0.28,
    );
    b.crown.rotation.y = cap(trailB * 0.12, 0.12);
    b.crown.rotation.x = Math.sin(t * 0.8 + seed) * 0.01 + wilt * 0.4;

    // ---- BRAÇO QUE ARREMESSA: o lobo INTEIRO num osso só, girando no ombro —
    // mas com ângulos PEQUENOS: a malha é fundida e o teto medido do pêndulo é
    // ±0,14 rad (a rodada 3 levou 0,55–0,85 e abriu a superfície em 30–45 cm no
    // "leque escuro"). Quem joga a pedra é o GRUPO torcendo; o braço só fecha o
    // gesto: ABRE na carga (senão afunda atrás do quadril e some da câmera) e
    // FECHA na liberação. O braço livre acompanha com o deslocamento local
    // `offX` (traduz o próprio tombo, `off` filho da coluna = x local = mundo).
    b.thr.rotation.x = pose.shX + wilt * 0.1;
    b.thr.rotation.z = THROW_SIDE * (pose.shZ + wilt * 0.08);
    b.off.rotation.x = pose.offX - wilt * 0.08;
    b.off.rotation.z = -THROW_SIDE * (pose.shZ * 0.3 + wilt * 0.1);

    // ---- vida no material do corpo: relevo, respiração e as VEIAS DE MAGMA ----
    const sh = body.userData.shader as
      | {
          uniforms: {
            uFT: { value: number };
            uFA: { value: number };
            uFBreath: { value: number };
            uFHurt: { value: number };
            uFCharge: { value: number };
            uFGlow: { value: number };
            uFGreen: { value: number };
          };
        }
      | undefined;
    const breath = Math.sin(t * 0.62 + seed) * 0.6 + Math.sin(t * 1.3 + seed * 0.7) * 0.4;
    if (sh) {
      sh.uniforms.uFT.value = t;
      // morrendo a rocha se desfaz (o mesmo multiplicador do figurino)
      sh.uniforms.uFA.value = LOOK.amp * (1 + hurt * 0.2 + crumble * 2.6);
      sh.uniforms.uFBreath.value = breath * (0.6 + 0.4 * hpFrac);
      sh.uniforms.uFHurt.value = hurt;
      sh.uniforms.uFCharge.value = pose.charge;
      // quase nada em repouso, e a pedra ACENDE por dentro carregando o taco
      sh.uniforms.uFGlow.value =
        crackGlowFor(level) * (VEIN_REST + pose.charge * VEIN_CHARGE) * (0.7 + 0.3 * hpFrac) * alpha;
      sh.uniforms.uFGreen.value = 0.24 * alpha;
    }

    chips.mat.uniforms.uTime.value = t;
    chips.mat.uniforms.uAlpha.value = alpha;
    chips.mat.uniforms.uCharge.value = pose.charge;

    // ---- o TACO: solta a pedra no beat da liberação, na MÃO (não no ar) ----
    const f = fly.current;
    if (loaded && !strikeDone.current) {
      strikeDone.current = true;
      // o punho é fixo no osso do ombro (o lobo é rígido): girar o osso leva o
      // punho junto, então a pedra nasce na mão em qualquer ângulo do arremesso.
      // Na CABEÇA sozinha não há braço: o taco se solta da frente da cara, à
      // altura da "boca" — o cálculo cai direto no espaço do grupo (T·R·S do
      // encaixe, yaw 0 hoje; a rotação genérica é só por robustez).
      if (headOnly) {
        const c = Math.cos(GOLEM_MODEL_YAW);
        const sN = Math.sin(GOLEM_MODEL_YAW);
        tmpWorld.set(
          fit.pos[0] + (HEAD_FIST_X * c + HEAD_FIST_Z * sN) * fit.s,
          fit.pos[1] + HEAD_FIST_Y * fit.s,
          fit.pos[2] + (-HEAD_FIST_X * sN + HEAD_FIST_Z * c) * fit.s,
        );
      } else {
        b.thr.updateWorldMatrix(true, false);
        tmpWorld.set(THROW_SIDE * ARM_FIST_X, ARM_FIST_Y, ARM_FIST_Z);
        b.thr.localToWorld(tmpWorld);
        g.worldToLocal(tmpWorld); // para o espaço do grupo (unidades da arena)
      }
      f.t = 0;
      f.x = tmpWorld.x;
      f.y = Math.max(0.22, tmpWorld.y);
      f.z = Math.min(headOnly ? 1.2 : 0.55, tmpWorld.z); // curto: a pedra cai no INIMIGO colado, não na câmera
      f.vx = (Math.random() - 0.5) * 0.4;
      f.vy = 2.6; // tapa para cima: arco curto e alto
      f.vz = 1.1; // +Z = em direção ao alvo (o mesmo rumo do rig)
      f.spin = 6 + Math.random() * 5;
      rock.mesh.visible = true;
      // poeira saindo da mão + a nuvem dos pés plantando o passo do arremesso
      if (smoke) {
        for (let i = 0; i < 3; i++) {
          smoke.spawn(
            tmpWorld.x + (Math.random() - 0.5) * 0.12,
            tmpWorld.y + (Math.random() - 0.5) * 0.12,
            tmpWorld.z + (Math.random() - 0.5) * 0.12,
            {
              size: 0.05 + Math.random() * 0.03,
              heat: 0.1,
              life: 0.45 + Math.random() * 0.3,
              lifeVar: 0.2,
              jitter: 0.12,
              rise: 0.2,
              drag: 3.2,
              vz: 0.7 + Math.random() * 0.7,
            },
          );
        }
        g.updateWorldMatrix(true, false);
        for (let i = 0; i < 4 + level; i++) {
          tmpLocal
            .set((Math.random() - 0.5) * (0.9 + level * 0.2), 0.06, (Math.random() - 0.5) * 0.8 + 0.2)
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpLocal.x, tmpLocal.y, tmpLocal.z, {
            size: 0.07 + 0.015 * level + Math.random() * 0.04,
            heat: 0.12,
            life: 0.6 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.22,
            rise: 0.3,
            drag: 3.4,
            vx: (Math.random() - 0.5) * 1.1,
            vz: 0.5 + Math.random() * 1.1,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > STONE_ATTACK_WINDOW) strikeDone.current = false;

    if (f.t >= 0) {
      f.t += dt;
      f.vy -= 9.8 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      rock.mesh.position.set(f.x, f.y, f.z);
      rock.mesh.rotation.x += f.spin * dt;
      rock.mesh.rotation.z += f.spin * 0.7 * dt;
      rock.mat.uniforms.uTime.value = t;
      const landed = f.y <= 0.08 || f.z > 2.4 || f.t > 1.1;
      if (landed) {
        f.t = -1;
        rock.mesh.visible = false;
        if (smoke) {
          // pedra no chão: a nuvenzinha de impacto (no mundo, na altura do chão
          // da arena — o grupo é a origem do penedo)
          g.updateWorldMatrix(true, false);
          for (let i = 0; i < 4; i++) {
            tmpLocal
              .set(f.x + (Math.random() - 0.5) * 0.2, Math.max(0.04, f.y), f.z)
              .applyMatrix4(g.matrixWorld);
            smoke.spawn(tmpLocal.x, tmpLocal.y, tmpLocal.z, {
              size: 0.06 + Math.random() * 0.03,
              heat: 0.1,
              life: 0.4 + Math.random() * 0.3,
              lifeVar: 0.25,
              jitter: 0.14,
              rise: 0.22,
              drag: 3.4,
              vx: (Math.random() - 0.5) * 1.4,
              vz: (Math.random() - 0.5) * 1.2,
            });
          }
        }
      }
    } else if (rock.mesh.visible) {
      rock.mesh.visible = false; // morreu no meio do voo: sem pedra fantasma
    }

    // ---- fio contínuo de poeira: a pedra se desfaz um pouco (os mesmos
    // números do figurino no Nv.1) ----
    if (smoke && alpha > 0.3) {
      dustAcc.current += dt * (0.35 + 0.75 * level) * (0.6 + 0.4 * hpFrac);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 3) {
        dustAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        tmpLocal
          .set(
            (Math.random() - 0.5) * (0.7 + level * 0.24),
            topY * (0.15 + Math.random() * 0.7),
            (Math.random() - 0.5) * (0.7 + level * 0.24),
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpLocal.x, tmpLocal.y, tmpLocal.z, {
          size: 0.05 + 0.012 * level,
          heat: 0.1,
          life: 0.7 + level * 0.06,
          lifeVar: 0.35,
          jitter: 0.14,
          rise: 0.18,
          drag: 3.0,
        });
      }
      if (dustAcc.current > 3) dustAcc.current = 3;
    }

    // ---- clarão quente das fissuras (apagado parado, aceso carregando) ----
    const s2 = Math.max(0.6, 0.9 + pose.charge * 0.7 + hurt * 0.3 + crumble * 0.6);
    glow.scale.setScalar(s2);
    glow.position.y = topY * 0.42;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.03 + pose.charge * 0.2 + hurt * 0.1) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={GOLEM_MODEL_YAW} scale={fit.s}>
        <primitive object={rig.skinned} />
      </group>
      {/* o taco de rocha voa no espaço da arena (o grupo de animação) */}
      <primitive object={rock.mesh} />
      <points geometry={chips.geo} material={chips.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.63, 0]} scale={1.0}>
        <spriteMaterial
          map={circleTexture()}
          color={LOOK.crack}
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}
