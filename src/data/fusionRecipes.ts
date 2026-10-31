import type { ElementId, SpeciesId } from '../game/types';
import { elementPairKey } from './elements';

/**
 * Receitas de fusão. As fusões verticais (mesma espécie) seguem a tabela
 * obrigatória de níveis implementada em game/fusion/fusionRules.ts.
 * Aqui ficam apenas as receitas de descoberta de espécies híbridas:
 * dois puros nível 1 de elementos diferentes → híbrido nível 1 (1 unidade).
 */

const HYBRID_BY_ELEMENT_PAIR: Record<string, SpeciesId> = {
  [elementPairKey('fire', 'earth')]: 'vulcane', // vulcânica
  [elementPairKey('water', 'air')]: 'tempest', // tempestade
  [elementPairKey('water', 'earth')]: 'verdan', // lama / natureza
  [elementPairKey('fire', 'air')]: 'solaris', // chamas celestiais
  [elementPairKey('fire', 'water')]: 'vaporis', // vapor / energia térmica
  [elementPairKey('earth', 'air')]: 'duna', // areia / deserto
};

export function hybridRecipeFor(a: ElementId, b: ElementId): SpeciesId | null {
  if (a === b) return null;
  return HYBRID_BY_ELEMENT_PAIR[elementPairKey(a, b)] ?? null;
}

export interface HybridRecipeInfo {
  a: ElementId;
  b: ElementId;
  species: SpeciesId;
}

export const HYBRID_RECIPES: HybridRecipeInfo[] = [
  { a: 'fire', b: 'earth', species: 'vulcane' },
  { a: 'water', b: 'air', species: 'tempest' },
  { a: 'water', b: 'earth', species: 'verdan' },
  { a: 'fire', b: 'air', species: 'solaris' },
  { a: 'fire', b: 'water', species: 'vaporis' },
  { a: 'earth', b: 'air', species: 'duna' },
];
