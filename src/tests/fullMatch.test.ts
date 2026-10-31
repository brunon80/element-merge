import { grantMatchReward, rewardFor } from '../game/economy/economy';
import type { Difficulty } from '../game/types';
import { collectEvents, makeEngine, mustMerge, mustSummon } from './helpers';

/**
 * Partida completa (seção 16): motor roda uma partida inteira contra a IA,
 * do início à condição terminal, com economia íntegra e recompensa única.
 * Equivalente lógico de "uma partida completa validada" sem depender de browser.
 */

function playFullMatch(difficulty: Difficulty, seed: number) {
  const eng = makeEngine({
    playerCoins: 500,
    seed,
    difficulty,
    generateTeam: true, // comportamento real: inimigo gerado no início do combate
  });
  const events = collectEvents(eng);

  // --- jogador "scriptado" nas mesmas regras: convoca (100/un) e funde ---
  const a = mustSummon(eng, 'ignis');
  const b = mustSummon(eng, 'ignis');
  const c = mustSummon(eng, 'ignis');
  const d = mustSummon(eng, 'ignis');
  mustSummon(eng, 'nereia');
  const [c1] = mustMerge(eng, a, b); // 2 Nv.1 → 2 Nv.2
  const [d1] = mustMerge(eng, c, d);
  mustMerge(eng, c1, d1); // Nv.2+2 → 1 Nv.3
  expect(eng.world.playerCoins).toBe(0);

  // --- sem cronômetro: o combate começa por decisão do jogador ---
  eng.startBattle();
  const aiUnits = eng.aliveUnits('ai');
  expect(aiUnits.length).toBeGreaterThan(0); // inimigo foi gerado na hora

  // --- roda a partida completa em tempo simulado ---
  let guard = 0;
  while (!eng.world.summary && guard++ < 20000) {
    eng.update(1 / 30);
  }

  expect(eng.world.summary).not.toBeNull();
  const endEvents = events.filter((ev) => ev.type === 'matchEnd');
  expect(endEvents).toHaveLength(1); // exatamente uma vez

  const summary = eng.world.summary!;
  expect(['victory', 'defeat', 'draw']).toContain(summary.result);
  expect(summary.reward).toBe(rewardFor(summary.result));
  expect(summary.balanceAfter).toBe(summary.balanceBefore + summary.reward);

  // economia íntegra: saldo nunca negativo; recompensa não aplicada pelo motor
  expect(eng.world.playerCoins).toBeGreaterThanOrEqual(0);
  expect(eng.world.aiCoins).toBeGreaterThanOrEqual(0);
  expect(eng.world.playerCoins).toBe(summary.balanceBefore);

  // recompensa idempotente na camada de persistência
  const ledger = { processedMatchIds: [], coins: summary.balanceBefore };
  expect(grantMatchReward(ledger, summary.matchId, summary.result)).toBe(true);
  expect(grantMatchReward(ledger, summary.matchId, summary.result)).toBe(false);
  expect(ledger.coins).toBe(summary.balanceAfter);

  // integridade final do mundo: sem unidades duplicadas
  const ids = eng.world.units.map((u) => u.id);
  expect(new Set(ids).size).toBe(ids.length);

  return summary;
}

describe('Partida completa contra a IA', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
    test(`partida inteira termina com resultado válido e recompensa única (${difficulty})`, () => {
      const summary = playFullMatch(difficulty, 4242 + difficulty.length);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
      expect(summary.difficulty).toBe(difficulty);
    });
  }

  test('duas partidas em sequência não confundem recompensas (matchIds distintos)', () => {
    const eng1 = makeEngine({ playerCoins: 300, aiCoins: 300, seed: 7 });
    mustSummon(eng1, 'golem');
    eng1.startBattle();
    let guard = 0;
    while (!eng1.world.summary && guard++ < 20000) eng1.update(1 / 30);
    const eng2 = makeEngine({ playerCoins: eng1.world.summary!.balanceAfter, aiCoins: 300, seed: 8 });
    expect(eng2.world.matchId).not.toBe(eng1.world.matchId);

    const s1 = eng1.world.summary!;
    // A recompensa da 1ª partida já foi aplicada e registrada
    // (o saldo já a contém). Repetir a operação não pode voltar a creditar.
    const ledger = {
      processedMatchIds: [s1.matchId],
      coins: s1.balanceAfter,
    };
    eng2.startBattle();
    guard = 0;
    while (!eng2.world.summary && guard++ < 20000) eng2.update(1 / 30);
    const s2 = eng2.world.summary!;
    grantMatchReward(ledger, s2.matchId, s2.result);
    grantMatchReward(ledger, s1.matchId, s1.result); // duplicar a 1ª não faz nada
    expect(ledger.coins).toBe(s2.balanceAfter);
  });
});
