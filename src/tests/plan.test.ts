import { ALL_SPECIES_IDS, PURE_SPECIES_IDS, TREE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { sellValue } from '../game/economy/economy';
import { fusionPlanFor, isComposable, isHonestPlan } from '../game/fusion/fusionPlan';
import { checkFusion } from '../game/fusion/fusionRules';
import { MAX_LEVEL, SUMMON_COST, type MonsterLevel } from '../game/types';

/**
 * Prova de composabilidade: TODA criatura da árvore (Nv.6–10) pode ser montada
 * apenas com fusões legais (2→1) a partir de sementes invocáveis — e o plano
 * paga exatamente 2^(nível-1) invocações de 100 moedas. A IA usa este mesmo
 * módulo; nenhum exército inimigo cria nada de graça.
 */

describe('Planos de fusão honestos (Nv.6–10)', () => {
  test('toda espécie da árvore é composável e o plano é honesto', () => {
    for (const id of TREE_SPECIES_IDS) {
      const plan = fusionPlanFor(id);
      expect(plan, `${id} tem plano`).not.toBeNull();
      if (!plan) continue;
      expect(plan.ok, `${id} ok`).toBe(true);
      expect(isHonestPlan(plan), `${id} honesto`).toBe(true);
      expect(isComposable(id), `${id} composável`).toBe(true);
      expect(plan.targetLevel).toBe(getSpecies(id).levelMin);
      // preço: exatamente as sementes que a regra 2→1 exige
      expect(plan.seeds).toBe(2 ** (getSpecies(id).levelMin - 1));
      expect(plan.seedCost).toBe(plan.seeds * SUMMON_COST);
      expect(plan.seedCost).toBe(sellValue(id, getSpecies(id).levelMin as MonsterLevel));
    }
  });

  test('cada operação do plano é uma fusão válida pelas regras, no nível exato', () => {
    for (const id of TREE_SPECIES_IDS) {
      const plan = fusionPlanFor(id)!;
      for (const op of plan.ops) {
        const check = checkFusion(op.a, op.inLevel, op.b, op.inLevel);
        expect(check.ok, `${op.a}+${op.b}@${op.inLevel} (${id})`).toBe(true);
        if (check.ok) {
          expect(check.outcome.species).toBe(op.result);
          expect(check.outcome.level).toBe(op.resultLevel);
          expect(check.outcome.outputCount).toBe(1);
        }
      }
    }
  });

  test('o Primordial custa 512 sementes (51.200 moedas) — nada acima do Nv.10', () => {
    const crown = fusionPlanFor('primordial')!;
    expect(MAX_LEVEL).toBe(10);
    expect(crown.seeds).toBe(512);
    expect(crown.seedCost).toBe(51200);
    // nenhuma operação sobe acima do nível máximo
    for (const op of crown.ops) {
      expect(op.resultLevel).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  test('puras não têm "plano de árvore" (crescem por fusão vertical) e são composáveis', () => {
    for (const id of PURE_SPECIES_IDS) {
      expect(fusionPlanFor(id)).toBeNull();
      expect(isComposable(id)).toBe(true);
    }
  });

  test('toda espécie do catálogo é alcançável pelas regras', () => {
    for (const id of ALL_SPECIES_IDS) {
      expect(isComposable(id), id).toBe(true);
    }
  });

  test('planos recusam exigências impossíveis (plano inventado não passa no validador)', () => {
    // um "plano" forjado: gelo no Nv.8 (a espécie só existe no Nv.6)
    const plan = fusionPlanFor('magma')!;
    const forged = { ...plan, seeds: 1 };
    expect(isHonestPlan(forged)).toBe(false); // preço errado → rejeitado
    const forged2 = { ...plan, ok: true, ops: plan.ops.slice(0, 1) };
    expect(isHonestPlan(forged2)).toBe(false); // faltam operações → rejeitado
  });
});
