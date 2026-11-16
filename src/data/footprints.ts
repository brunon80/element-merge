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
    // Encaixe autoral da SILHUETA: caixa CPU da malha + o abraço estático do
    // invólucro de chama (`SHELL_HUG`, proporcional ao tamanho — a sonda lê a
    // caixa CPU e NÃO vê o deslocamento do vertex shader; o hug é a sobra que
    // a casca ganha para fora, e o FOOT_MARGIN cobre a fervura). A rig amarra
    // o encaixe da malha a estes números (`footprintOf` no IgnisMeshRig): o
    // formTop manda na altura ATÉ a largura deixar — o Nv.5 abre as asas
    // (3,41 de meia-envergadura: ele puxa o `familyRadius` 2,88 → 3,49 e o
    // `slotFit` da família 0,87 → 0,72; o dragão é LARGO, não alto — mesmo
    // padrão do primordial escalado para o buraco de 2,5)
    { x: 0.82, z: 0.68 }, // faísca Nv.1: malha mais compacta que a bolota procedural antiga
    { x: 0.87, z: 0.68 },
    { x: 1.86, z: 1.12 },
    { x: 2.17, z: 1.96 },
    { x: 3.41, z: 2.2 }, // envergadura das asas — o pior caso da família
  ],
  nereia: [
    // A ÁRVORE INTEIRA na MALHA 3D importada (water_model_lvl1..5.glb, Nv.1..5).
    // Encaixe autoral da SILHUETA: caixa CPU da malha + a sobra da vida da água
    // (`WAVE_HUG`, proporcional ao tamanho — a sonda lê a caixa CPU e NÃO vê o
    // deslocamento do vertex shader; o hug é a folga que a ondulação da casca e
    // o achatado da carga ganham para fora, e o FOOT_MARGIN cobre o resto). A
    // rig amarra o encaixe da malha a estes números (`footprintOf` no
    // NereiaMeshRig): `MEDIDO = s_a·(half + abraço)` com `s_a = formTop/spanY`
    // (a mesma regra da tabela do vento). ⚠️ Os GLBs chegaram da esteira em
    // ordem INVERTIDA às artes 2D (o "lvl2" era o dragão da arte `water_lvl5_1`
    // e o "lvl5" o axolotl da `water_lvl2_1`); os arquivos foram RENOMEADOS
    // para a escada da referência: gotinha → axolotl → hippocampão → draco →
    // dragão alado. O axolotl abre as brânquias (1,00 de meia-envergadura crua),
    // o draco Nv.4 deita a cauda no FUNDO do buraco (1,00 de profundidade) e o
    // dragão Nv.5 é o pior caso da família (2,39) — puxa o `familyRadius`
    // 2,21 → 2,47 e o `slotFit` 1,13 → 1,01 (a família quase não encolhe: a
    // escada autoral sobrevive quase inteira).
    { x: 0.58, z: 0.58 }, // gotinha Nv.1: malha + sobra (a gota procedural media 0,51 × 0,50)
    { x: 1.2, z: 1.2 }, // axolotl Nv.2: brânquias em leque para os dois lados
    { x: 1.48, z: 1.39 }, // hippocampão Nv.3: cauda enrolando para o lado
    { x: 1.05, z: 2.12 }, // draco Nv.4: corpo estreito, cauda longa no eixo profundo
    { x: 2.39, z: 2.32 }, // dragão alado Nv.5: barbatanas-alas abertas — o pior caso da família
  ],
  golem: [
    // A ÁRVORE INTEIRA agora é MALHA 3D (linha "modelos 3D"): `golem_model_lvl1.glb`
    // é SÓ A CABEÇA do Nv.2 (esfera com olhos verdes e musgo), o
    // `golem_model_lvl2.glb` é o corpo completo que antes vestia o Nv.1 (byte a
    // byte o arquivo antigo — as calibrações de rig do corpo valem intactas) e
    // Nv.3-5 são FÉRES QUADRÚPENDES (`golem_model_lvl3/4/5.glb`: bicho-gorila
    // cabisbaixo, dragão de pedra alado, dragão de asas abertas com cauda-martelo
    // — baixos e fundos, caixa y ~1,5-2,0 e z ±1,0). Encaixe no contrato `MEDIDO
    // = s_a·(half + abraço)` (abraço 0,10 do relevo de erosão + respiração, na
    // régua do zéfiro, proporcional à caixa de cada malha): a cabeça Nv.1 é uma
    // esfera (s_a = 1,5/1,60 = 0,93 → 1,05 × 1,05), o corpo Nv.2 é largo e raso
    // (s_a = 2,1/1,99 = 1,06 → 0,98 × 0,62), a fera Nv.3 abre as quatro patas
    // (s_a = 2,45/1,98 = 1,24), o colosso Nv.4 deita as asas e a cauda (s_a =
    // 3,05/1,58 = 1,93) e o dragão Nv.5 é o pior caso da família (3,09 nos dois
    // eixos) — puxa o `familyRadius` 1,77 → 3,17 e o `slotFit` 1,15 → 0,79: a
    // família INTEIRA encolhe para o buraco, o mesmo padrão aceito do dragão de
    // fogo (0,72) e do tornado (0,82). O Nv.5 world top fica 4,15 × 0,79 ≈ 3,27.
    { x: 1.05, z: 1.05 }, // cabeça Nv.1: esfera com olhos verdes (meia-envergadura = meia-profundidade)
    { x: 0.98, z: 0.62 }, // rocha viva Nv.2: corpo completo na malha (ombros largos, raso em Z)
    { x: 1.33, z: 1.08 }, // golem de pedra Nv.3: fera gorila — patas abrem para os lados, fundo encolhe
    { x: 2.0, z: 2.19 }, // colosso de pedra Nv.4: asas abertas + cauda comprida no eixo profundo
    { x: 3.09, z: 3.09 }, // montanha muscular Nv.5: dragão de asas espalhadas — o pior caso da família
  ],
  zephyr: [
    // A ÁRVORE INTEIRA na MALHA 3D importada (wind_model_lvl1..5.glb, Nv.1..5).
    // Encaixe autoral da SILHUETA: caixa CPU da malha + o abraço estático do
    // invólucro de vento (`SHELL_HUG`, proporcional ao tamanho — a sonda lê a
    // caixa CPU e NÃO vê o deslocamento do vertex shader; o hug é a sobra que
    // a casca ganha para fora, e o FOOT_MARGIN cobre a fervura). A rig amarra
    // o encaixe da malha a estes números (`footprintOf` no ZephyrMeshRig): o
    // formTop manda na altura e a largura fica dentro do contrato — as asas da
    // coruja Nv.4/ do dragão Nv.5 (1,00 de meia-envergadura crua) puxam o
    // `familyRadius` da família 1,45 → 3,04 e o `slotFit` 1,15 → 0,82 (a
    // família inteira encolhe para o buraco — mesmo padrão do dragão de fogo).
    // O giro do invólucro nas formas 2..5 é VARREDURA com teto de ângulo
    // (`SHELL_SPIN`) medido para o varrimento morrer dentro do footprint.
    { x: 0.84, z: 0.73 }, // sopro Nv.1: malha + abraço (a bolota procedural media 0,9 × 0,88)
    { x: 1.49, z: 0.86 }, // redemoinho Nv.2: os braços de vento abrem para os lados
    { x: 1.97, z: 0.83 }, // funil vivo Nv.3: asas de pena largas, corpo fundo-curto
    { x: 2.65, z: 2.02 }, // ciclone Nv.4: a coruja abre as asas (caixa baixa e larga)
    { x: 2.96, z: 2.34 }, // tornado Nv.5: dragão dos ventos — o pior caso da família
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
