import { hybridRecipeFor } from '../../data/fusionRecipes';
import { getSpecies } from '../../data/monsters';
import type {
  FusionCheck,
  FusionOutcome,
  MonsterLevel,
  SpeciesId,
} from '../types';

/**
 * Regras de fusão — ÚNICA fonte de verdade (motor e IA usam exatamente esta função).
 *
 * Tabela obrigatória (mesma espécie, mesmo nível):
 *   L1 + L1 → exatamente 1 unidade L2
 *   L2 + L2 → exatamente 1 unidade L3
 *   L3 + L3 → exatamente 1 unidade L4
 *   L4 + L4 → exatamente 1 unidade L5
 *   L5 + L5 → bloqueado (MAX_LEVEL)
 *
 * Descoberta híbrida (determinística):
 *   puro L1 + puro L1 de elementos diferentes → 1 híbrido L1 (receita fixa)
 *
 * Nunca permite: fusão tripla implícita (a checagem é sempre par-a-par),
 * níveis diferentes, espécies incompatíveis ou acima do nível 5.
 */
export function checkFusion(
  speciesA: SpeciesId,
  levelA: MonsterLevel,
  speciesB: SpeciesId,
  levelB: MonsterLevel,
): FusionCheck {
  if (speciesA === speciesB) {
    if (levelA !== levelB) return { ok: false, reason: 'DIFFERENT_LEVEL' };
    if (levelA >= 5) return { ok: false, reason: 'MAX_LEVEL' };
    const outcome: FusionOutcome = {
      kind: 'vertical',
      species: speciesA,
      level: (levelA + 1) as MonsterLevel,
      outputCount: 1,
    };
    return { ok: true, outcome };
  }

  // Espécies diferentes: única combinação válida são dois puros nível 1
  // de elementos diferentes (receita determinística de híbrido).
  if (levelA !== levelB) return { ok: false, reason: 'DIFFERENT_LEVEL' };
  if (levelA !== 1) return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };

  const defA = getSpecies(speciesA);
  const defB = getSpecies(speciesB);
  if (defA.elements.length !== 1 || defB.elements.length !== 1) {
    return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };
  }
  const result = hybridRecipeFor(defA.elements[0], defB.elements[0]);
  if (!result) return { ok: false, reason: 'INCOMPATIBLE_SPECIES' };

  const outcome: FusionOutcome = {
    kind: 'hybrid',
    species: result,
    level: 1,
    outputCount: 1,
  };
  return { ok: true, outcome };
}

/** Texto da regra de evolução de uma espécie (enciclopédia). */
export function evolutionRecipeText(species: SpeciesId): string {
  const name = getSpecies(species).name;
  const lines: string[] = [];
  for (let lvl = 1; lvl <= 4; lvl++) {
    lines.push(`${name} Nv.${lvl} + ${name} Nv.${lvl} → 1 unidade Nv.${lvl + 1}`);
  }
  lines.push(`${name} Nv.5 + ${name} Nv.5 → fusão bloqueada`);
  return lines.join(' · ');
}
