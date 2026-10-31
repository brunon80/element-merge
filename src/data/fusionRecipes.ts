import type { SpeciesId } from '../game/types';
import { getSpecies } from './monsters';

/**
 * ÁRVORE DE EVOLUÇÃO ELEMENTAL — única fonte de verdade das receitas.
 *
 * Camadas (nível da criatura resultante):
 *  - Nv.6 híbridos: dois Puros Nv.5 de elementos diferentes.
 *  - Nv.7 compostos: dois Nv.6 ligados por receita.
 *  - Nv.8 avançados, Nv.9 lendários, Nv.10 primordial.
 *
 * Regras fixas:
 *  - Toda receita consome exatamente duas criaturas do MESMO nível e produz
 *    exatamente uma do próximo nível (regra 2→1 em toda a árvore).
 *  - A ordem dos ingredientes não altera o resultado (chave de par canônica).
 *  - Não existe receita acima do Nv.10.
 *
 * As fusões verticais (mesma espécie, puros Nv.1→5) são regra de nível, não
 * receita; vivem em `game/fusion/fusionRules.ts`.
 */

export interface EvolutionRecipe {
  /** ingrediente A (ordem canônica por id) */
  a: SpeciesId;
  /** ingrediente B */
  b: SpeciesId;
  /** espécie produzida (nível = nível dos ingredientes + 1) */
  result: SpeciesId;
}

/** Chave canônica de par de ESPÉCIES (a ordem dos ingredientes nunca muda o resultado). */
export function speciesPairKey(a: SpeciesId, b: SpeciesId): string {
  return a <= b ? `${a}+${b}` : `${b}+${a}`;
}

export const EVOLUTION_RECIPES: EvolutionRecipe[] = [
  // --- Nv.6 híbridos: todos os 6 pares de puros (dois puros Nv.5) ----------
  { a: 'ignis', b: 'zephyr', result: 'raio' }, // fogo + ar
  { a: 'golem', b: 'nereia', result: 'madeira' }, // terra + água
  { a: 'golem', b: 'ignis', result: 'magma' }, // terra + fogo
  { a: 'nereia', b: 'zephyr', result: 'gelo' }, // água + ar
  { a: 'ignis', b: 'nereia', result: 'vapor' }, // fogo + água
  { a: 'golem', b: 'zephyr', result: 'areia' }, // terra + ar

  // --- Nv.7 compostos: pares de Nv.6 ---------------------------------------
  { a: 'gelo', b: 'raio', result: 'tempestade' }, // raio + gelo
  { a: 'areia', b: 'magma', result: 'obsidiana' }, // magma + areia
  { a: 'madeira', b: 'vapor', result: 'pantano' }, // madeira + vapor
  { a: 'magma', b: 'raio', result: 'plasma' }, // raio + magma
  { a: 'gelo', b: 'vapor', result: 'nevoa' }, // gelo + vapor
  { a: 'areia', b: 'madeira', result: 'cristal' }, // madeira + areia

  // --- Nv.8 avançados: pares de Nv.7 ---------------------------------------
  { a: 'plasma', b: 'tempestade', result: 'cosmico' }, // tempestade + plasma
  { a: 'cristal', b: 'obsidiana', result: 'geodo' }, // obsidiana + cristal
  { a: 'nevoa', b: 'pantano', result: 'abissal' }, // pântano + névoa
  { a: 'obsidiana', b: 'plasma', result: 'vulcanico' }, // plasma + obsidiana

  // --- Nv.9 lendários: pares de Nv.8 ---------------------------------------
  { a: 'abissal', b: 'cosmico', result: 'astral' }, // cósmico + abissal
  { a: 'geodo', b: 'vulcanico', result: 'colosso' }, // geodo + vulcânico

  // --- Nv.10 primordial: a coroa da árvore ----------------------------------
  { a: 'astral', b: 'colosso', result: 'primordial' }, // astral + colosso
];

const RECIPE_BY_PAIR = new Map<string, EvolutionRecipe>(
  EVOLUTION_RECIPES.map((r) => [speciesPairKey(r.a, r.b), r]),
);

/** Receita para o par de espécies (ordem irrelevante); null se não há receita. */
export function evolutionRecipeFor(a: SpeciesId, b: SpeciesId): EvolutionRecipe | null {
  if (a === b) return null;
  return RECIPE_BY_PAIR.get(speciesPairKey(a, b)) ?? null;
}

/** A receita que produz esta espécie (null para os puros, que não têm receita). */
export function recipeOf(result: SpeciesId): EvolutionRecipe | null {
  return EVOLUTION_RECIPES.find((r) => r.result === result) ?? null;
}

/** O nível exato em que os ingredientes desta receita devem estar. */
export function recipeIngredientLevel(recipe: EvolutionRecipe): number {
  return getSpecies(recipe.result).levelMin - 1;
}
