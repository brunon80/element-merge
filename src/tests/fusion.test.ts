import { autoGrow, makeEngine, mustMerge, mustSummon, snapshotUnits } from './helpers';
import { checkFusion } from '../game/fusion/fusionRules';
import { elementPairKey } from '../data/elements';
import { hybridRecipeFor } from '../data/fusionRecipes';

/**
 * Testes obrigatórios de fusão (documento de design, seção 14.1 — atualizada).
 * Regra: 2×Nv1 → exatamente 1×Nv2; 2×Nv2 → 1×Nv3; 2×Nv3 → 1×Nv4;
 * 2×Nv4 → 1×Nv5; Nv5 bloqueado; níveis diferentes bloqueados;
 * espécies incompatíveis bloqueadas; fusão inválida não altera estado;
 * sem consumo/duplicação acidental; tudo atômico.
 */

describe('Regras de fusão', () => {
  test('1) dois monstros Nv.1 geram exatamente um monstro Nv.2', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    const a = mustSummon(eng, 'ignis');
    const b = mustSummon(eng, 'ignis');
    expect(eng.aliveCount('player')).toBe(2);

    const res = eng.tryMerge(a, b);
    expect(res.ok).toBe(true);
    expect(res.outcome).toEqual({ kind: 'vertical', species: 'ignis', level: 2, outputCount: 1 });

    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1); // exatamente uma unidade
    expect(alive[0].level).toBe(2);
    expect(alive[0].species).toBe('ignis');
    // unidades consumidas saíram do mundo
    expect(eng.getUnit(a)).toBeUndefined();
    expect(eng.getUnit(b)).toBeUndefined();
  });

  test('2) dois monstros Nv.2 geram exatamente um monstro Nv.3', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    const [c] = mustMerge(eng, mustSummon(eng, 'nereia'), mustSummon(eng, 'nereia'));
    const [d] = mustMerge(eng, mustSummon(eng, 'nereia'), mustSummon(eng, 'nereia'));
    expect(eng.getUnit(c)!.level).toBe(2);
    expect(eng.getUnit(d)!.level).toBe(2);

    const res = eng.tryMerge(c, d);
    expect(res.ok).toBe(true);
    expect(res.outcome!.outputCount).toBe(1);
    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1);
    expect(alive[0].level).toBe(3);
    expect(alive[0].species).toBe('nereia');
  });

  test('3) dois monstros Nv.3 geram exatamente um monstro Nv.4', () => {
    const eng = makeEngine({ playerCoins: 5000 });
    // 8 Nv.1 → 4 Nv.2 → 2 Nv.3
    const l2: number[] = [];
    for (let i = 0; i < 4; i++) {
      l2.push(mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0]);
    }
    const l3a = mustMerge(eng, l2[0], l2[1])[0];
    const l3b = mustMerge(eng, l2[2], l2[3])[0];

    const res = eng.tryMerge(l3a, l3b);
    expect(res.ok).toBe(true);
    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1);
    expect(alive[0].level).toBe(4);
  });

  test('4) dois monstros Nv.4 geram exatamente um monstro Nv.5', () => {
    const eng = makeEngine({ playerCoins: 100000 });
    // 16 Nv.1 → 8 Nv.2 → 4 Nv.3 → 2 Nv.4 (fusão de Nv.4 ainda não executada)
    const byLevel = autoGrow(eng, 'golem', 16, 'player', 3);
    expect(byLevel.get(4)!.length).toBe(2);
    expect(byLevel.get(5)!.length).toBe(0);

    const res = eng.tryMerge(byLevel.get(4)![0], byLevel.get(4)![1]);
    expect(res.ok).toBe(true);
    const alive = eng.aliveUnits('player');
    const l5 = alive.filter((u) => u.level === 5);
    expect(l5).toHaveLength(1); // exatamente um
    expect(l5[0].species).toBe('golem');
  });

  test('5) monstros Nv.5 não podem ser fundidos (e nada é consumido)', () => {
    const eng = makeEngine({ playerCoins: 100000 });
    const byLevel = autoGrow(eng, 'ignis', 32);
    const l5a = byLevel.get(5)![0];
    const l5b = byLevel.get(5)![1];
    expect(l5a).toBeDefined();
    expect(l5b).toBeDefined();

    const before = snapshotUnits(eng);
    const res = eng.tryMerge(l5a, l5b);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('MAX_LEVEL');
    expect(snapshotUnits(eng)).toEqual(before);
  });

  test('6) monstros de níveis diferentes não podem ser fundidos', () => {
    const eng = makeEngine({ playerCoins: 2000 });
    const a = mustSummon(eng, 'ignis');
    const a2 = mustSummon(eng, 'ignis');
    const [c] = mustMerge(eng, a, a2); // Nv.2 vivo
    const d = mustSummon(eng, 'ignis'); // Nv.1 vivo

    const before = snapshotUnits(eng);
    const res = eng.tryMerge(c, d);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('DIFFERENT_LEVEL');
    expect(snapshotUnits(eng)).toEqual(before);

    // também para espécies diferentes com níveis diferentes
    const e = mustSummon(eng, 'golem');
    const res2 = eng.tryMerge(e, c);
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe('DIFFERENT_LEVEL');
  });

  test('7) espécies incompatíveis não podem ser fundidas', () => {
    const eng = makeEngine({ playerCoins: 2000 });
    // Nv.2 de espécies diferentes: incompatível (2×Nv.1 → 1×Nv.2)
    const fire2 = [
      mustMerge(eng, mustSummon(eng, 'ignis'), mustSummon(eng, 'ignis'))[0],
      mustMerge(eng, mustSummon(eng, 'ignis'), mustSummon(eng, 'ignis'))[0],
    ];
    const earth2 = [
      mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0],
      mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0],
    ];
    const before = snapshotUnits(eng);

    expect(eng.tryMerge(fire2[0], earth2[0]).reason).toBe('INCOMPATIBLE_SPECIES');
    expect(eng.tryMerge(fire2[1], earth2[1]).reason).toBe('INCOMPATIBLE_SPECIES');
    expect(snapshotUnits(eng)).toEqual(before);

    // híbrido Nv.1 + puro Nv.1: incompatível
    const steam = mustMerge(eng, mustSummon(eng, 'ignis'), mustSummon(eng, 'nereia'))[0];
    const pure = mustSummon(eng, 'zephyr');
    const before2 = snapshotUnits(eng);
    expect(eng.tryMerge(steam, pure).reason).toBe('INCOMPATIBLE_SPECIES');
    expect(snapshotUnits(eng)).toEqual(before2);

    // checagem pura da regra
    expect(checkFusion('ignis', 3, 'golem', 3)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
  });

  test('8) fusão inválida não altera o estado do jogo', () => {
    const eng = makeEngine({ playerCoins: 1500 });
    const a = mustSummon(eng, 'zephyr');
    const aiUnit = mustSummon(eng, 'zephyr', 'ai');
    mustSummon(eng, 'golem');
    const coinsBefore = eng.world.playerCoins;
    const aiCoinsBefore = eng.world.aiCoins;
    const before = snapshotUnits(eng);

    // mesma unidade
    const self = eng.tryMerge(a, a);
    expect(self.ok).toBe(false);
    expect(self.reason).toBe('SAME_UNIT');

    // lados diferentes (não pode fundir aliados do oponente)
    const cross = eng.tryMerge(a, aiUnit);
    expect(cross.ok).toBe(false);
    expect(cross.reason).toBe('DIFFERENT_SIDE');

    expect(snapshotUnits(eng)).toEqual(before);
    expect(eng.world.playerCoins).toBe(coinsBefore);
    expect(eng.world.aiCoins).toBe(aiCoinsBefore);
  });

  test('9) fusão não consome nem duplica unidades', () => {
    const eng = makeEngine({ playerCoins: 5000 });
    const ids = [
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
    ];
    const beforeTotal = eng.world.units.length; // 4

    const [out1] = mustMerge(eng, ids[0], ids[1]); // 2 Nv.1 → 1 Nv.2
    expect(eng.world.units.length).toBe(beforeTotal - 1); // -2 +1
    const [out2] = mustMerge(eng, ids[2], ids[3]);
    expect(eng.world.units.length).toBe(beforeTotal - 2);

    // tentar fundir novamente as mesmas entradas falha (unidades já saíram)
    const again = eng.tryMerge(ids[0], ids[1]);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('UNIT_GONE');
    expect(eng.world.units.length).toBe(beforeTotal - 2);

    // IDs sempre únicos: nenhuma duplicação
    const allIds = eng.world.units.map((u) => u.id);
    expect(new Set(allIds).size).toBe(allIds.length);

    // quantidade exata na evolução seguinte
    const l3 = mustMerge(eng, out1, out2); // 2 Nv.2 → 1 Nv.3
    expect(l3).toHaveLength(1);
    const unitsAfter = eng.aliveUnits('player');
    expect(unitsAfter).toHaveLength(1);
    expect(unitsAfter[0].level).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Receitas híbridas (determinísticas)
  // -------------------------------------------------------------------------

  test('receita híbrida é determinística e simétrica (ordem não importa)', () => {
    const r1 = checkFusion('ignis', 1, 'golem', 1);
    const r2 = checkFusion('golem', 1, 'ignis', 1);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.outcome).toEqual(r2.outcome);
      expect(r1.outcome.species).toBe('vulcane');
      expect(r1.outcome.level).toBe(1);
      expect(r1.outcome.outputCount).toBe(1);
    }
  });

  test('todas as 6 combinações de dois elementos puros produzem híbrido Nv.1', () => {
    const pure: Record<string, string> = {
      fire: 'ignis',
      water: 'nereia',
      earth: 'golem',
      air: 'zephyr',
    };
    for (const elA of ['fire', 'water', 'earth', 'air'] as const) {
      for (const elB of ['fire', 'water', 'earth', 'air'] as const) {
        if (elA === elB) continue;
        const hybrid = hybridRecipeFor(elA, elB);
        expect(hybrid, `par ${elementPairKey(elA, elB)}`).not.toBeNull();
        const res = checkFusion(pure[elA] as never, 1, pure[elB] as never, 1);
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.outcome.species).toBe(hybrid);
          expect(res.outcome.level).toBe(1);
        }
      }
    }
  });

  test('fusão híbrida consome exatamente 2 unidades e produz 1 híbrido', () => {
    const eng = makeEngine({ playerCoins: 500 });
    const a = mustSummon(eng, 'nereia');
    const b = mustSummon(eng, 'zephyr');
    const total = eng.world.units.length;
    const res = eng.tryMerge(a, b);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.outcome!.species).toBe('tempest');
      expect(res.createdIds).toHaveLength(1);
    }
    expect(eng.world.units.length).toBe(total - 1); // -2 +1
    const unit = eng.getUnit(res.createdIds![0]);
    expect(unit?.species).toBe('tempest');
    expect(unit?.level).toBe(1);
  });

  test('fusão em nível 5 entre híbridos também é bloqueada', () => {
    expect(checkFusion('tempest', 5, 'tempest', 5)).toEqual({ ok: false, reason: 'MAX_LEVEL' });
  });
});
