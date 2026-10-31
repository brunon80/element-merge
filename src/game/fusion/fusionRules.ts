import { evolutionRecipeFor, recipeIngredientLevel, recipeOf } from '../../data/fusionRecipes';
import { getSpecies, speciesAllowsLevel } from '../../data/monsters';
import {
  CROSS_FUSION_MIN_LEVEL,
  MAX_LEVEL,
  type FusionCheck,
  type FusionOutcome,
  type MonsterLevel,
  type SpeciesId,
} from '../types';

/**
 * Regras de fusão — ÚNICA fonte de verdade (motor, interface e IA usam
 * exatamente esta função; nenhum caminho paralelo de regra).
 *
 * 1) Fusão VERTICAL (mesma espécie, sempre 2→1 — só espécies puras):
 *      L1+L1 → 1×L2 · L2+L2 → 1×L3 · L3+L3 → 1×L4 · L4+L4 → 1×L5
 *      L5+L5 → bloqueada (as puras param no Nv.5; acima disso, só a árvore).
 *
 * 2) Fusão da ÁRVORE (espécies diferentes, sempre 2→1):
 *      - exige os dois monstros no MESMO nível, a partir do Nv.5;
 *      - a combinação precisa existir na árvore de receitas
 *        (data/fusionRecipes.ts) e os ingredientes devem estar exatamente no
 *        nível que a receita pede;
 *      - a ordem dos elementos não altera o resultado;
 *      - produz exatamente 1 criatura do próximo nível;
 *      - não existe fusão acima do Nv.10 (MAX_LEVEL).
 *
 * Nunca: fusão tripla implícita (a checagem é sempre par-a-par), fusões de
 * híbridos iguais entre si, níveis diferentes, pares sem receita ou espécies
 * num nível onde não existem.
 */
export function checkFusion(
  speciesA: SpeciesId,
  levelA: MonsterLevel,
  speciesB: SpeciesId,
  levelB: MonsterLevel,
): FusionCheck {
  if (levelA !== levelB) return { ok: false, reason: 'DIFFERENT_LEVEL' };
  const level = levelA;

  // Regra não confia no chamador: espécie que não existe neste nível jamais funde.
  if (!speciesAllowsLevel(speciesA, level) || !speciesAllowsLevel(speciesB, level)) {
    return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };
  }

  const defA = getSpecies(speciesA);

  if (speciesA === speciesB) {
    // Vertical: apenas espécies que crescem por nível (puras, levelMin<levelMax).
    if (defA.levelMin === defA.levelMax) {
      return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };
    }
    if (level >= defA.levelMax) return { ok: false, reason: 'MAX_LEVEL' };
    const outcome: FusionOutcome = {
      kind: 'vertical',
      species: speciesA,
      level: (level + 1) as MonsterLevel,
      outputCount: 1,
    };
    return { ok: true, outcome };
  }

  // Espécies diferentes: fusão da árvore elemental.
  if (level < CROSS_FUSION_MIN_LEVEL) return { ok: false, reason: 'MIN_LEVEL' };
  if (level >= MAX_LEVEL) return { ok: false, reason: 'MAX_LEVEL' };

  const recipe = evolutionRecipeFor(speciesA, speciesB);
  if (!recipe) return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };
  if (recipeIngredientLevel(recipe) !== level) {
    return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };
  }

  const outcome: FusionOutcome = {
    kind: 'hybrid',
    species: recipe.result,
    level: (level + 1) as MonsterLevel,
    outputCount: 1,
  };
  return { ok: true, outcome };
}

/**
 * Texto da receita/evolução de uma espécie (enciclopédia).
 * A camada de UI só mostra isto para espécies já DESCOBERTAS.
 */
export function evolutionRecipeText(species: SpeciesId): string {
  const def = getSpecies(species);
  if (def.levelMin === def.levelMax) {
    const recipe = recipeOf(species);
    if (!recipe) {
      return species === 'primordial'
        ? 'Não existe fusão acima do Nível 10 — o Primordial é o ápice da árvore.'
        : 'Sem receita conhecida.';
    }
    const a = getSpecies(recipe.a);
    const b = getSpecies(recipe.b);
    const inLevel = def.levelMin - 1;
    const line = `${a.name} Nv.${inLevel} + ${b.name} Nv.${inLevel} → 1 unidade de ${def.name} Nv.${def.levelMin}`;
    if (def.levelMin >= MAX_LEVEL) {
      return `${line} · não existe fusão acima do Nível 10`;
    }
    return `${line} · esta espécie não funde com a própria espécie (siga as receitas da árvore)`;
  }

  const lines: string[] = [];
  for (let lvl = def.levelMin; lvl < def.levelMax; lvl++) {
    lines.push(`${def.name} Nv.${lvl} + ${def.name} Nv.${lvl} → 1 unidade Nv.${lvl + 1}`);
  }
  lines.push(`${def.name} Nv.${def.levelMax} + ${def.name} Nv.${def.levelMax} → bloqueada`);
  return lines.join(' · ');
}
