import { describe, expect, test } from 'vitest';
import { ALL_SPECIES_IDS, PURE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { checkFusion, mergeOptionsFor, type MergeOption } from '../game/fusion/fusionRules';
import { MAX_LEVEL, type MonsterLevel, type SpeciesId } from '../game/types';

/**
 * `mergeOptionsFor` — a lista que a prévia de arraste mostra: TODAS as fusões
 * que a criatura segurada pode executar no nível dela. A checagem é exatamente
 * `checkFusion` (nenhum caminho paralelo de regra), só consultada par a par;
 * por isso o teste central é a equivalência de conjunto com a regra do motor.
 */

const LEVELS: MonsterLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** "par@nível = resultado@nível" — comparação legível e sem depender da ordem */
const shape = (o: MergeOption): string => `${o.partner}@${o.level}=${o.result}@${o.resultLevel}`;

/** o que a regra do motor aceita para (espécie, nível) — a verdade da fusão */
function acceptedPartners(species: SpeciesId, level: MonsterLevel): string[] {
  const out: string[] = [];
  for (const partner of ALL_SPECIES_IDS) {
    const check = checkFusion(species, level, partner, level);
    if (check.ok) out.push(`${partner}@${level}=${check.outcome.species}@${check.outcome.level}`);
  }
  return out;
}

describe('mergeOptionsFor — todas as fusões possíveis da criatura arrastada', () => {
  test('puras Nv.1 a Nv.4: exatamente a vertical (espécie + ela mesma → Nv+1)', () => {
    for (const species of PURE_SPECIES_IDS) {
      for (let lvl = 1; lvl <= 4; lvl++) {
        const level = lvl as MonsterLevel;
        expect(mergeOptionsFor(species, level), `${species} Nv.${lvl}`).toEqual([
          {
            species,
            level,
            partner: species,
            result: species,
            resultLevel: (lvl + 1) as MonsterLevel,
            vertical: true,
          },
        ]);
      }
    }
  });

  test('puras Nv.5: vertical bloqueada (teto das puras), sobem só os híbridos', () => {
    // Ignis Nv.5 → fogo+ar, terra+fogo, fogo+água (na ordem das receitas)
    expect(mergeOptionsFor('ignis', 5)).toEqual([
      { species: 'ignis', level: 5, partner: 'zephyr', result: 'raio', resultLevel: 6, vertical: false },
      { species: 'ignis', level: 5, partner: 'golem', result: 'magma', resultLevel: 6, vertical: false },
      { species: 'ignis', level: 5, partner: 'nereia', result: 'vapor', resultLevel: 6, vertical: false },
    ]);
  });

  test('as opções seguem a ordem das receitas em EVOLUTION_RECIPES', () => {
    // Gólem Nv.5: madeira (terra+água) antes de magma (terra+fogo) antes de areia (terra+ar)
    expect(mergeOptionsFor('golem', 5).map((o) => `${o.partner}→${o.result}`)).toEqual([
      'nereia→madeira',
      'ignis→magma',
      'zephyr→areia',
    ]);
  });

  test('espécie da árvore entra em cada receita sua, no nível fixo dela', () => {
    // Gelo Nv.6: raio+gelo → Tempestade, gelo+vapor → Névoa (ordem das receitas)
    expect(mergeOptionsFor('gelo', 6)).toEqual([
      { species: 'gelo', level: 6, partner: 'raio', result: 'tempestade', resultLevel: 7, vertical: false },
      { species: 'gelo', level: 6, partner: 'vapor', result: 'nevoa', resultLevel: 7, vertical: false },
    ]);
    // Coroa: Astral + Colosso
    expect(mergeOptionsFor('astral', 9)).toEqual([
      { species: 'astral', level: 9, partner: 'colosso', result: 'primordial', resultLevel: 10, vertical: false },
    ]);
  });

  test('receita pede o nível exato da linha de ingredientes', () => {
    // Gelo só existe no Nv.6; nos outros níveis nada funde (regra não confia no chamador)
    expect(mergeOptionsFor('gelo', 5)).toEqual([]);
    expect(mergeOptionsFor('gelo', 7)).toEqual([]);
    // híbrido no Nv.6 não repete a fusão que o gerou no Nv.5
    expect(mergeOptionsFor('raio', 5)).toEqual([]);
  });

  test('Primordial Nv.10 é o ápice: nenhuma fusão acima dele', () => {
    expect(mergeOptionsFor('primordial', MAX_LEVEL)).toEqual([]);
  });

  test('espécie fora do seu intervalo de nível nunca tem opção', () => {
    for (const species of ALL_SPECIES_IDS) {
      const def = getSpecies(species);
      for (const level of LEVELS) {
        if (level >= def.levelMin && level <= def.levelMax) continue;
        expect(mergeOptionsFor(species, level), `${species} Nv.${level}`).toEqual([]);
      }
    }
  });

  test('fonte única de verdade: o conjunto é exatamente o que checkFusion aceita', () => {
    for (const species of ALL_SPECIES_IDS) {
      for (const level of LEVELS) {
        const got = mergeOptionsFor(species, level).map(shape);
        const truth = acceptedPartners(species, level);
        expect(got, `${species} Nv.${level}`).toHaveLength(truth.length);
        expect(new Set(got)).toEqual(new Set(truth));
      }
    }
  });

  test('par é simétrico: o que a criatura pode fazer, o parceiro também pode', () => {
    for (const species of ALL_SPECIES_IDS) {
      for (const level of LEVELS) {
        for (const o of mergeOptionsFor(species, level)) {
          const back = mergeOptionsFor(o.partner, o.level).some(
            (p) => p.partner === species && p.result === o.result,
          );
          expect(back, `${o.partner} Nv.${o.level} + ${species}`).toBe(true);
        }
      }
    }
  });

  test('toda opção produz exatamente uma criatura do próximo nível (regra 2→1)', () => {
    for (const species of ALL_SPECIES_IDS) {
      for (const level of LEVELS) {
        for (const o of mergeOptionsFor(species, level)) {
          expect(o.level).toBe(level);
          expect(o.resultLevel).toBe(level + 1);
          expect(o.vertical).toBe(o.partner === species);
          expect(o.result === species).toBe(o.vertical);
        }
      }
    }
  });
});
