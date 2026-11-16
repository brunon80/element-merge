import { MONSTER_FOOT_R, SLOT_FIT_MAX } from '../game/board';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { formAimY, formIndex, formMuzzleY, formTop } from './forms';
import { getSpecies } from './monsters';

/**
 * INVÓLUCRO das criaturas — a ponte entre o figurino autoral e o tabuleiro.
 *
 * Cada entrada é a meia-envergadura (eixo X) e a meia-profundidade (eixo Z) da
 * silhueta REAL da forma, medidas na cena viva A PARTIR DO CENTRO DO SLOT (a
 * posição do motor), só com as malhas do figurino — HUD, anel de seleção e
 * área de captura ficam de fora. Foi assim que a sonda `qa/probe-footprint.mjs`
 * mediu; ela continua medindo e comparando com esta tabela a cada ajuste.
 *
 *   index do vetor = índice da forma (o mesmo de `formTops`, relativo a
 *   `formStartLevel`): puros têm 5 formas, criaturas da árvore têm uma só.
 *
 * Porque a tabela existe: o `scale = 1 + 0,07 × (nível-1)` antigo era um chute
 * CEGO — escalava por nível um figurino que já nasce autoral no tamanho final.
 * As árvores (Nv.6-10) renderizavam a 1,35-1,63× do tamanho autoral e o Colosso
 * (autoral 2,36 × 2,23) ocupava 7,3 × 7,0 de mundo num buraco de 3,2 × 2,3:
 * cobria três slots e derramava por cima da plataforma inimiga. Com esta tabela
 * o motor dimensiona CADA figurino para caber no próprio buraco (ver `slotFit`),
 * então nenhum invólucro encosta no vizinho.
 *
 * NORMALIZAÇÃO DOS PUROS (round 7). A régua é a SILHUETA QUE O OLHO VÊ na
 * fileira — largura (eixo X do mundo) × altura — e não o maior eixo do anel
 * (round 6): nas formas de corpo comprido no eixo do rumo, o max-axis cai na
 * PROFUNDIDADE, que a tela quase não mostra, e a disparidade continuava viva
 * (o fogo Nv.3 enchia 45% do anel e tinha METADE da área dos vizinhos). A
 * escada de área de silhueta, nível por nível:
 *
 *   Nv.1 = a LARGURA do sopro do vento (1,24 de mundo — o padrão aprovado);
 *   Nv.2 ≈ 4,4 · Nv.3 ≈ 6,2 · Nv.4 ≈ 8,5 (largura × altura, em mundo);
 *   Nv.5 = cada família sobe ao TETO do buraco (o anel r=2,5 com o abraço),
 *   sem cortar quem já o enche. Por isso a ÁREA residual do Nv.5 difere
 *   (fogo 10,4 × nereia 21,7): o dragão de fogo é um quadrúpede baixo e o
 *   abraço de chama come ~15% do anel — é estrutural da forma, não escala.
 *
 * Para as formas cujo corpo comprido aponta para o inimigo (fogo Nv.3/Nv.5,
 * água Nv.4) o rumo agora é 3/4 (`MODEL_YAWS`/`NEREIA_MODEL_YAWS` nos rigs):
 * o comprimento passa a aparecer na fileira sem estourar o anel nem esticar
 * a altura. A frente continua no +Z do slot — só o corpo fica de viés.
 *
 * É o `formTops` de cada espécie (em `data/monsters.ts`) que faz o trabalho:
 * o topo autoral de cada forma é o valor que leva a malha até o degrau da
 * escada, no encaixe da própria família. Cada entrada daqui é assinada no
 * PONTO FIXO da rig — `MEDIDO = s·(meia-caixa ROTACIONADA da malha + abraço)`
 * (AABB exata da caixa girada pelo rumo, não mais a heurística "lado a lado"),
 * com `s = min(formTop/spanY, degrau/(fit·(meia-caixa+abraço)))` — e `fit` é
 * o `slotFit` da família, que sai do pior caso (o Nv.5 encostado no anel):
 * `fit = MONSTER_FOOT_R/(MEDIDO_máx + FOOT_MARGIN)`. Nenhum invólucro passa
 * de 2,5 de mundo. Três degraus ficam um dedo abaixo da área-alvo por causa
 * do TETO da janela de topo que os testes pinam para as peças procedurais
 * (`formTop ≤ maxY_parts + 0,35`): nereia Nv.1, golem Nv.2 e golem Nv.3. A
 * altura do fogo recua em degraus (Nv.2 tocha alta → Nv.3; Nv.5 quadrúpede
 * baixo) — largura e área sobem sempre; a forma das malhas manda.
 */

/** meia-envergadura / meia-profundidade autorais, por forma */
export interface Footprint {
  x: number;
  z: number;
}

/**
 * Folga de animação: rig respira, parte treme (`flick`), motes sobem (`rise`) e
 * o invólucro oscila uns decímetros entre os frames. Somar a margem ao medir o
 * raio garante que o INVÓLUCRO EM MOVIMENTO continua dentro do buraco.
 */
export const FOOT_MARGIN = 0.08;

const MEDIDO: Record<SpeciesId, Footprint[]> = {
  // --------------------------- puros (5 formas) ---------------------------
  ignis: [
    // A ÁRVORE INTEIRA na MALHA 3D importada (fire_model_lvl1..5.glb, Nv.1..5).
    // Encaixe autoral da SILHUETA: caixa CPU da malha ROTACIONADA pelo rumo +
    // o abraço estático do invólucro de chama (`SHELL_HUG` 0,13 na régua da
    // caixa do Nv.1, proporcional ao tamanho — a sonda lê a caixa CPU e NÃO vê
    // o deslocamento do vertex shader; o hug é a sobra que a casca ganha para
    // fora, e o FOOT_MARGIN cobre a fervura). A rig amarra o encaixe da malha a
    // estes números (`footprintOf` no IgnisMeshRig), assinados nos eixos do
    // MUNDO que o buraco vê (AABB exata da caixa girada). Round 7: o corpo
    // comprido da salamandra Nv.3 (35°) e do dragão Nv.5 (45°) agora fica em
    // 3/4 com a frente no +Z — o comprimento aparece na fileira e a área de
    // silhueta casa com a dos vizinhos (2,48l × 2,49a no Nv.3). Encaixe da
    // família: o corpo do dragão Nv.5 (2,81 nos dois eixos) é o pior caso →
    // `slotFit` 0,87.
    { x: 0.78, z: 0.64 }, // faísca Nv.1: 1,21 de largura — o degrau do padrão do vento
    { x: 1.09, z: 0.84 }, // tocha viva Nv.2: malha estreita e em pé (1,59l × 2,75a, área 4,4)
    { x: 1.62, z: 1.78 }, // salamandra Nv.3 (3/4): corpo na diagonal — enche a fileira sem estourar o fundo
    { x: 1.83, z: 1.65 }, // serpente alada Nv.4: asas e crina abrem a caixa (de frente)
    { x: 2.81, z: 2.81 }, // dragão Nv.5 (3/4, 45°): pior caso da família nos dois eixos (2,43 de mundo)
  ],
  nereia: [
    // A ÁRVORE INTEIRA na MALHA 3D importada (water_model_lvl1..5.glb, Nv.1..5).
    // Encaixe autoral da SILHUETA: caixa CPU da malha ROTACIONADA pelo rumo + a
    // sobra da vida da água (`WAVE_HUG` 0,02 na régua da caixa do Nv.1,
    // proporcional ao tamanho — a sonda lê a caixa CPU e NÃO vê o deslocamento
    // do vertex shader; o hug é a folga que a ondulação da casca e o achatado
    // da carga ganham para fora, e o FOOT_MARGIN cobre o resto). A rig amarra o
    // encaixe da malha a estes números (`footprintOf` no NereiaMeshRig):
    // `MEDIDO = s·(half + abraço)` com `s = min(formTop/spanY,
    // degrau/(fit·(half+abraço)))` — a escada de área dos puros (ver o topo
    // deste arquivo) e `fit` = `slotFit` da família (0,96). ⚠️ Os GLBs chegaram
    // da esteira em ordem INVERTIDA às artes 2D (o "lvl2" era o dragão da arte
    // `water_lvl5_1` e o "lvl5" o axolotl da `water_lvl2_1`); os arquivos foram
    // RENOMEADOS para a escada da referência: gotinha → axolotl → hippocampão →
    // draco → dragão alado. Encaixe da família: o dragão alado Nv.5 (2,52) é o
    // pior caso → `slotFit` 0,96 (a água é a única quase 1:1 — a malha da
    // gotinha já nasce grande e o abraço dela é mínimo). Round 7: o draco Nv.4
    // (corpo fino e cauda comprida no rumo) foi para 3/4 (−35°) — a largura
    // dele na fileira era o buraco visível na escada (1,72 contra ~3,2 dos
    // vizinhos). A gotinha Nv.1 continua o degrau que não fecha o alvo: o topo
    // que a levaria à largura-padrão passa do TETO da janela de topo das peças
    // procedurais (maxY 1,21 + 0,35 = 1,56).
    { x: 0.63, z: 0.62 }, // gotinha Nv.1: malha + sobra (1,19l × 1,51a — teto da janela das parts)
    { x: 1.13, z: 1.13 }, // axolotl Nv.2: brânquias em leque para os dois lados (2,13l × 2,06a)
    { x: 1.34, z: 1.26 }, // hippocampão Nv.3: cauda enrolando para o lado (2,54l × 2,46a)
    { x: 1.66, z: 1.87 }, // draco Nv.4 (3/4): cauda na diagonal — 3,15l × 2,70a, casando com os vizinhos
    { x: 2.52, z: 2.45 }, // dragão alado Nv.5: barbatanas-alas abertas — o pior caso da família (2,42 de mundo)
  ],
  golem: [
    // A ÁRVORE INTEIRA é MALHA 3D (linha "modelos 3D"): `golem_model_lvl1.glb`
    // é SÓ A CABEÇA do Nv.2 (esfera com olhos verdes e musgo), o
    // `golem_model_lvl2.glb` é o corpo completo que antes vestia o Nv.1 (byte a
    // byte o arquivo antigo — as calibrações de rig do corpo valem intactas) e
    // Nv.3-5 são FÉRES QUADRÚPENDES (`golem_model_lvl3/4/5.glb`: bicho-gorila
    // cabisbaixo, dragão de pedra alado, dragão de asas abertas com cauda-martelo
    // — baixos e fundos, caixa y ~1,5-2,0 e z ±1,0). Encaixe no contrato `MEDIDO
    // = s·(half + abraço)` (abraço 0,10 do relevo de erosão + respiração, na
    // régua da caixa do corpo Nv.2, proporcional à caixa de cada malha — o molde
    // é o do zéfiro): a cabeça Nv.1 é uma esfera (caixa 1,97×1,60×1,97), o
    // corpo Nv.2 é largo e raso, as feras abrem patas/asas/cauda e o dragão
    // Nv.5 é o pior caso nos dois eixos (2,81) → `slotFit` da família 0,87, a
    // régua que põe as quatro espécies no mesmo degrau da escada de área. Round
    // 7: Nv.2 (1,09) e Nv.3 (1,42) ficam um dedo abaixo da área-alvo porque o
    // TETO da janela das peças procedurais amarra o formTop deles (maxY 2,03 +
    // 0,35 = 2,38 · maxY 2,34 + 0,35 = 2,69) — acima disso o teste da terra
    // reclama que o topo declarado passa do palco de carga.
    { x: 0.8, z: 0.8 }, // cabeça Nv.1: esfera com olhos verdes — 1,24 de largura, o padrão do vento
    { x: 1.09, z: 0.68 }, // rocha viva Nv.2: corpo completo na malha (ombros largos, raso em Z)
    { x: 1.42, z: 1.16 }, // golem de pedra Nv.3: fera gorila — patas abrem para os lados
    { x: 2.04, z: 2.23 }, // colosso de pedra Nv.4: asas abertas + cauda comprida no eixo profundo
    { x: 2.81, z: 2.8 }, // montanha muscular Nv.5: dragão de asas espalhadas — o pior caso da família (2,43 de mundo)
  ],
  zephyr: [
    // A ÁRVORE INTEIRA na MALHA 3D importada (wind_model_lvl1..5.glb, Nv.1..5).
    // Encaixe autoral da SILHUETA: caixa CPU da malha + o abraço estático do
    // invólucro de vento (`SHELL_HUG` 0,12 na régua da caixa do Nv.1, proporcional
    // ao tamanho — a sonda lê a caixa CPU e NÃO vê o deslocamento do vertex
    // shader; o hug é a sobra que a casca ganha para fora, e o FOOT_MARGIN cobre
    // a fervura). A rig amarra o encaixe da malha a estes números (`footprintOf`
    // no ZephyrMeshRig): o formTop manda na altura e a largura fica dentro do
    // contrato. ESTA É A RÉGUA DA ESCADA DOS PUROS: a largura do sopro Nv.1
    // (1,24 de mundo) é o padrão que as outras três famílias casam no Nv.1, e a
    // escada de área (4,4 / 6,2 / 8,5) foi calibrada pela fileira do vento —
    // que fica exatamente como estava. As asas da coruja Nv.4 e as do dragão
    // Nv.5 (1,00 de meia-envergadura crua) são o pior caso da família (2,81) e
    // puxam o `slotFit` para 0,87. O giro do invólucro nas formas 2..5 é
    // VARREDURA com teto de ângulo (`SHELL_SPIN`) medido para o varrimento
    // morrer dentro do footprint — em unidades do MODELO a folga do varrimento
    // é `meia-caixa + abraço`, que não muda com o degrau da escada.
    { x: 0.8, z: 0.7 }, // sopro Nv.1: malha + abraço — o PADRÃO (1,24 de largura)
    { x: 1.27, z: 0.73 }, // redemoinho Nv.2: os braços de vento abrem para os lados (2,09l × 2,09a)
    { x: 1.66, z: 0.7 }, // funil vivo Nv.3: asas de pena largas, corpo fundo-curto (2,58l × 2,39a)
    { x: 2.03, z: 1.55 }, // ciclone Nv.4: a coruja abre as asas (caixa baixa e larga)
    { x: 2.81, z: 2.21 }, // tornado Nv.5: dragão dos ventos — o pior caso da família (2,43 de mundo)
  ],
  // ------------------------ árvore (uma forma) ---------------------------
  raio: [{ x: 1.11, z: 1.14 }],
  madeira: [{ x: 1.28, z: 1.0 }],
  magma: [{ x: 1.44, z: 1.43 }],
  gelo: [{ x: 1.72, z: 1.72 }],
  vapor: [{ x: 2.06, z: 1.85 }],
  areia: [{ x: 1.9, z: 1.9 }],
  tempestade: [{ x: 2.47, z: 2.41 }],
  obsidiana: [{ x: 1.71, z: 1.3 }],
  pantano: [{ x: 1.97, z: 1.8 }],
  plasma: [{ x: 1.73, z: 1.73 }],
  nevoa: [{ x: 1.97, z: 1.94 }],
  cristal: [{ x: 2.06, z: 1.72 }],
  geodo: [{ x: 2.18, z: 2.08 }],
  abissal: [{ x: 1.58, z: 3.11 }], // tentáculos longos: um lado varre bem para frente
  cosmico: [{ x: 2.26, z: 2.26 }],
  vulcanico: [{ x: 2.5, z: 2.5 }],
  astral: [{ x: 2.56, z: 2.94 }],
  colosso: [{ x: 2.36, z: 2.23 }],
  // Nv.10 — o quasar PURO (rework 03/nov): o disco de acreção de ρ 3,0 inclinado
  // (o wrapper do rig tomba ~0,46) mede no mundo 3,01 × 2,74 autoral — os arcos
  // de lente e o anel de fótons ficam todos dentro dessa banda. É o maior
  // invólucro autoral da árvore em X; escalado pelo `slotFit` (~0,81) para o
  // buraco de 2,5 (3,01 × 0,81 ≈ 2,44 de mundo) e o topo caiu de 6,20 para 4,9
  // — o quasar é largo, não alto.
  primordial: [{ x: 3.01, z: 2.74 }],
};

/** invólucro autoral da forma que o nível mostra */
export function footprintOf(species: SpeciesId, level: MonsterLevel): Footprint {
  const forms = MEDIDO[species];
  return forms[formIndex(getSpecies(species), level)] ?? forms[0];
}

/** raio do invólucro (maior eixo + folga de animação) — o que precisa caber no buraco */
export function footprintRadius(species: SpeciesId, level: MonsterLevel): number {
  const f = footprintOf(species, level);
  return Math.max(f.x, f.z) + FOOT_MARGIN;
}

/**
 * Raio do PIOR invólucro da família (a maior forma que ela pode virar).
 * É dele que vem o enquadramento: a família inteira é escalada pelo pior caso,
 * então o degrau Nv1→Nv5 continua na proporção autoral — nenhum Nv4 fica
 * menor que o Nv3 por causa do teto.
 */
export function familyRadius(species: SpeciesId): number {
  return Math.max(...MEDIDO[species].map((f) => Math.max(f.x, f.z) + FOOT_MARGIN));
}

/**
 * ESCALA DE ENCAIXE da espécie (uniforme, ≤ SLOT_FIT_MAX): reduz o figurino
 * para que o invólucro caiba no buraco (`MONSTER_FOOT_R`) e não toque no
 * vizinho. Como é a MESMA para todas as formas da família, a progressão visual
 * 2→1 nunca inverte. `SLOT_FIT_MAX` é o teto de ampliação: sem ele, o Raio
 * (autoral 1,11) cresceria 2,2× e viraria uma bola de relâmpago do tamanho do
 * buraco — e mais alto que o Colosso.
 */
export function slotFit(species: SpeciesId): number {
  return Math.min(MONSTER_FOOT_R / familyRadius(species), SLOT_FIT_MAX);
}

/** altura do topo em mundo real (o autoral × encaixe) — HUD, ícones, hitbox */
export function worldTopY(species: SpeciesId, level: MonsterLevel): number {
  return formTop(getSpecies(species), level) * slotFit(species);
}

/** canhão em mundo real: de onde a forma atual cospe (motor/efeitos) */
export function worldMuzzleY(species: SpeciesId, level: MonsterLevel): number {
  return formMuzzleY(getSpecies(species), level) * slotFit(species);
}

/** centro do corpo em mundo real: o ponto visado pelos projéteis */
export function worldAimY(species: SpeciesId, level: MonsterLevel): number {
  return formAimY(getSpecies(species), level) * slotFit(species);
}

/** meio-eixo em mundo real (autoral × encaixe) — anel de seleção, hitbox, testes */
export function worldExtent(species: SpeciesId, level: MonsterLevel): Footprint {
  const f = footprintOf(species, level);
  const k = slotFit(species);
  return { x: f.x * k, z: f.z * k };
}

/** raio da bounding circle em mundo real — nunca passa de MONSTER_FOOT_R */
export function worldFootprintRadius(species: SpeciesId, level: MonsterLevel): number {
  const f = worldExtent(species, level);
  return Math.max(f.x, f.z);
}
