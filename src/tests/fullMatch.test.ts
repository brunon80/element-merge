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

describe('Time que volta para a próxima partida (regra da vitória)', () => {
  test('quem morreu em combate volta; fundidos e vendidos não', () => {
    const eng = makeEngine({ playerCoins: 1000, aiCoins: 500, seed: 71 });
    const a = mustSummon(eng, 'ignis', 'player', 0);
    const b = mustSummon(eng, 'ignis', 'player', 1);
    const sold = mustSummon(eng, 'nereia', 'player', 2);
    const kid = mustMerge(eng, a, b)[0]; // a e b foram CONSUMIDOS pela fusão
    expect(eng.sellUnit(sold).ok).toBe(true); // o valor dela virou moeda

    // um zephyr vai ao tabuleiro para ser abatido durante o combate
    const victim = mustSummon(eng, 'zephyr', 'player', 3);
    const algoz = mustSummon(eng, 'golem', 'ai', 0);
    eng.getUnit(algoz)!.damage = 999_999; // mata em um acerto
    eng.startBattle();
    for (let i = 0; i < 60 * 25 && eng.getUnit(victim)?.alive; i++) eng.update(1 / 60);
    expect(eng.getUnit(victim)!.alive).toBe(false);

    const roster = eng.restoredRoster('player');
    // O zephyr caiu e mesmo assim volta: vencer paga o time inteiro, e evoluir
    // deixa de ser uma aposta com a morte da unidade na partida vencida.
    // Cada entrada carrega o buraco que a criatura ocupava no começo do combate
    // (o zephyr estava no 3 e o filho da fusão, no 1 — o do alvo).
    expect(roster).toContainEqual({ species: 'zephyr', level: 1, tile: 3 });
    expect(roster).toContainEqual({ species: 'ignis', level: 2, tile: 1 }); // o filho do par fundido
    expect(roster).not.toContainEqual({ species: 'nereia', level: 1 }); // vendida
    // os dois ignis Nv.1 não reaparecem: quem carrega o valor deles é o Nv.2
    expect(roster.filter((r) => r.species === 'ignis')).toHaveLength(1);
    void kid;
  });

  test('nível mais alto primeiro (o teto de retorno são os 12 buracos do tabuleiro)', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 0, seed: 72 });
    const l1: number[] = [];
    for (let t = 0; t < 6; t++) l1.push(mustSummon(eng, 'golem', 'player', t));
    const n2a = mustMerge(eng, l1[0], l1[1])[0];
    const n2b = mustMerge(eng, l1[2], l1[3])[0];
    const n3 = mustMerge(eng, n2a, n2b)[0]; // Nv.3: 4 Nv.1 consumidos em cadeia
    void n3;
    mustSummon(eng, 'zephyr', 'player', 6);

    const roster = eng.restoredRoster('player');
    // sobram o Nv.3 da cadeia, os dois Nv.1 que não entraram nela e o zephyr
    expect(roster).toHaveLength(4);
    const levels = roster.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((x, y) => y - x)); // decrescente por nível
    expect(levels[0]).toBe(3);
  });
});
