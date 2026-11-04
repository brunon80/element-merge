import type { ArenaScene, ElementId, SpeciesId } from '../game/types';
import { getSpecies } from './monsters';

/**
 * BÔNUS DE TERRENO — cada cenário da arena favorece UM elemento. Unidades cuja
 * LINHAGEM elemental contém esse elemento (a lista `elements` da espécie já é o
 * fecho da linhagem: híbridos e compostos carregam os elementos de todos os
 * pais) ganham +TERRAIN_BONUS de vida MÁXIMA e de dano no nascimento.
 *
 * O Primordial lista os quatro elementos, então recebe o bônus em TODO cenário
 * com vantagem (exceto a Ilha arcana, que é neutra de propósito: a partida de
 * referência sem distorção de terreno).
 *
 * A marcação vive na unidade (`CombatUnit.terrainBoost`): o Inspetor mostra o
 * bônus exatamente como ele foi aplicado — trocar de cenário no meio da partida
 * vale para quem NASCER depois (invocações novas e filhos de fusão), e as
 * unidades antigas continuam mostrando o bônus que embutiram nos números.
 */

/** Fração de vida e dano extras (+12%). Aplicada em createUnit no motor. */
export const TERRAIN_BONUS = 0.12;

/** Elemento favorecido por cada cenário (null = terreno neutro, sem bônus). */
export const TERRAIN_ELEMENT: Record<ArenaScene, ElementId | null> = {
  arcane: null, // ilha arcana: o terreno de referência, ninguém leva vantagem
  forest: 'earth', // raízes e rocha: madeira, areia, cristal, golem...
  ice: 'water', // frio e mar: nereia, gelo, vapor, névoa, abissal...
  volcanic: 'fire', // lava: fogo puro e toda fusão que envolve fogo
  underwater: 'water', // mesmo elemento do gelo: água domina o mar
  'universe-end': 'air', // o vácuo estrelado é do ar (e do que tem ar na linhagem)
};

/** Nomes em PT-BR dos cenários (HUD/inspetor; mesma régua da aba Cenário). */
export const TERRAIN_LABEL: Record<ArenaScene, string> = {
  arcane: 'Ilha arcana',
  forest: 'Floresta',
  ice: 'Gélido',
  volcanic: 'Inferno Vulcânico',
  underwater: 'Subaquático',
  'universe-end': 'Fim do universo',
};

/** Elemento favorecido pelo cenário (null quando o terreno é neutro). */
export function terrainElementFor(scene: ArenaScene): ElementId | null {
  return TERRAIN_ELEMENT[scene] ?? null;
}

/**
 * Elemento do bônus que ESTA espécie recebe neste cenário (undefined = sem
 * bônus). A elegibilidade usa a linhagem completa da espécie — fusões que
 * "envolvem fogo" têm fogo em `elements` e ganham no vulcânico.
 */
export function terrainBonusFor(
  scene: ArenaScene,
  species: SpeciesId,
): ElementId | undefined {
  const el = TERRAIN_ELEMENT[scene];
  if (!el) return undefined;
  return getSpecies(species).elements.includes(el) ? el : undefined;
}
