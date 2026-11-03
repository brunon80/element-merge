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
    { x: 1.01, z: 1.27 },
    { x: 1.25, z: 1.98 },
    { x: 1.04, z: 1.96 },
    { x: 1.76, z: 2.58 },
    { x: 2.03, z: 2.8 },
  ],
  nereia: [
    { x: 0.51, z: 0.5 },
    { x: 0.75, z: 0.74 },
    { x: 0.93, z: 0.62 },
    { x: 1.21, z: 1.59 },
    { x: 1.75, z: 2.13 },
  ],
  golem: [
    { x: 0.75, z: 0.63 },
    { x: 0.84, z: 0.71 },
    { x: 1.01, z: 0.62 },
    { x: 1.2, z: 0.78 },
    { x: 1.57, z: 1.69 },
  ],
  zephyr: [
    { x: 0.9, z: 0.88 },
    { x: 0.96, z: 0.88 },
    { x: 1.24, z: 1.23 },
    { x: 1.19, z: 1.22 },
    { x: 1.37, z: 1.35 },
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
