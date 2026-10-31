import { describe, expect, test } from 'vitest';
import { sellValue } from '../game/economy/economy';
import { makeEngine, mustMerge, mustSummon } from './helpers';

/**
 * Venda na lixeira: o reembolso é exatamente a soma do que a criatura custou
 * para existir — pelas fusões 2→1, Nv.1=100, Nv.2=200, Nv.3=400, Nv.4=800,
 * Nv.5=1600; híbridos valem o dobro do nível. Vender nunca gera lucro.
 */

describe('Valor de venda (custo acumulado)', () => {
  test('tabela por nível para puros', () => {
    expect([1, 2, 3, 4, 5].map((l) => sellValue('ignis', l))).toEqual([
      100, 200, 400, 800, 1600,
    ]);
    expect([1, 2, 3].map((l) => sellValue('golem', l))).toEqual([100, 200, 400]);
  });

  test('híbrido vale o dobro do nível (nasce de duas invocações)', () => {
    expect(sellValue('vulcane', 1)).toBe(200);
    expect(sellValue('vulcane', 2)).toBe(400);
    expect(sellValue('vulcane', 5)).toBe(3200);
  });

  test('vender e recomprar o mesmo nível é neutro em moedas', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const custoL1 = 100 * 2 ** (level - 1); // invocações necessárias p/ o nível
      expect(sellValue('nereia', level)).toBe(custoL1);
    }
  });
});

describe('Venda na lixeira (motor)', () => {
  test('vender Nv.1 devolve 100 e libera o slot', () => {
    const eng = makeEngine({ playerCoins: 500, seed: 5 });
    const id = mustSummon(eng, 'ignis'); // 500 → 400
    expect(eng.world.playerCoins).toBe(400);
    const res = eng.sellUnit(id);
    expect(res.ok).toBe(true);
    expect(res.refund).toBe(100);
    expect(eng.world.playerCoins).toBe(500);
    expect(eng.getUnit(id)).toBeUndefined();
    expect(eng.unitAt('player', 0)).toBeUndefined();
  });

  test('criatura fundida devolve a soma do custo (Nv.3 = 4 Nv.1 = 400)', () => {
    const eng = makeEngine({ playerCoins: 1000, seed: 6 });
    const ids = [
      mustSummon(eng, 'ignis'),
      mustSummon(eng, 'ignis'),
      mustSummon(eng, 'ignis'),
      mustSummon(eng, 'ignis'),
    ];
    expect(eng.world.playerCoins).toBe(600);
    const [n2a] = mustMerge(eng, ids[0], ids[1]);
    const [n2b] = mustMerge(eng, ids[2], ids[3]);
    const [n3] = mustMerge(eng, n2a, n2b);
    expect(eng.getUnit(n3)!.level).toBe(3);
    const res = eng.sellUnit(n3);
    expect(res.ok).toBe(true);
    expect(res.refund).toBe(400);
    // investiu 400 e recebeu 400 de volta: neutro, sem exploração
    expect(eng.world.playerCoins).toBe(1000);
  });

  test('híbrido Nv.1 vendido devolve 200', () => {
    const eng = makeEngine({ playerCoins: 500, seed: 7 });
    const a = mustSummon(eng, 'ignis');
    const b = mustSummon(eng, 'golem');
    const [hy] = mustMerge(eng, a, b);
    expect(eng.getUnit(hy)!.species).toBe('vulcane');
    const res = eng.sellUnit(hy);
    expect(res.refund).toBe(200);
  });

  test('não vende unidade do inimigo nem inexistente (sem muda saldo)', () => {
    const eng = makeEngine({ playerCoins: 300, aiCoins: 300, seed: 8 });
    const aiId = mustSummon(eng, 'golem', 'ai');
    const before = eng.world.playerCoins;
    expect(eng.sellUnit(aiId).reason).toBe('WRONG_SIDE');
    expect(eng.sellUnit(99999).reason).toBe('UNIT_GONE');
    expect(eng.world.playerCoins).toBe(before);
  });

  test('venda gera o FX dourado com o valor devolvido', () => {
    const eng = makeEngine({ playerCoins: 500, seed: 9 });
    const id = mustSummon(eng, 'nereia');
    eng.world.fx.length = 0;
    eng.sellUnit(id);
    const sellFx = eng.world.fx.filter((f) => f.type === 'sell');
    expect(sellFx).toHaveLength(1);
    expect(sellFx[0].amount).toBe(100);
    expect(sellFx[0].species).toBe('nereia');
  });

  test('vender durante o combate também devolve (reforço também é pago)', () => {
    const eng = makeEngine({ playerCoins: 500, seed: 10 });
    const mine = mustSummon(eng, 'ignis');
    mustSummon(eng, 'golem', 'ai');
    eng.startBattle();
    const res = eng.sellUnit(mine);
    expect(res.ok).toBe(true);
    expect(res.refund).toBe(100);
  });

  test('depois que a partida termina não se vende mais nada', () => {
    const eng = makeEngine({ playerCoins: 500, seed: 11 });
    mustSummon(eng, 'ignis');
    mustSummon(eng, 'golem', 'ai');
    eng.startBattle();
    let guard = 0;
    while (!eng.world.summary && guard++ < 20000) eng.update(1 / 60);
    expect(eng.world.summary).toBeTruthy();
    const survivor = eng.world.units.find((u) => u.side === 'player' && u.alive);
    if (survivor) {
      expect(eng.sellUnit(survivor.id).reason).toBe('MATCH_OVER');
    }
  });
});
