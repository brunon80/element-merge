import {
  canAfford,
  grantMatchReward,
  rewardFor,
  trySpendSummonCost,
  type RewardLedger,
} from '../game/economy/economy';
import { DEFEAT_REWARD, SUMMON_COST, VICTORY_REWARD } from '../game/types';
import { defaultSave, loadSave, persistSave, SAVE_KEY } from '../persistence/saveGame';
import { collectEvents, makeEngine, mustMerge, mustSummon, runSeconds } from './helpers';

/**
 * Testes obrigatórios de economia (documento de design, seção 14.2).
 */

describe('Custos de invocação', () => {
  test('cada invocação válida desconta exatamente 100 moedas', () => {
    const eng = makeEngine({ playerCoins: 500 });
    expect(SUMMON_COST).toBe(100);
    mustSummon(eng, 'ignis');
    expect(eng.world.playerCoins).toBe(400);
    mustSummon(eng, 'golem', 'ai');
    expect(eng.world.aiCoins).toBe(400);
  });

  test('invocação com menos de 100 moedas é bloqueada (sem desconto)', () => {
    const eng = makeEngine({ playerCoins: 99 });
    const res = eng.summon('player', 'ignis');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('NO_COINS');
    expect(eng.world.playerCoins).toBe(99); // nada descontado
    expect(eng.aliveCount('player')).toBe(0);

    const res2 = eng.summon('player', 'zephyr');
    expect(res2.ok).toBe(false);
    expect(eng.world.playerCoins).toBe(99);
  });

  test('saldo nunca fica negativo nem na fronteira', () => {
    expect(trySpendSummonCost(99)).toEqual({ ok: false, reason: 'NO_COINS', coins: 99 });
    const r = trySpendSummonCost(100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coins).toBe(0);
    expect(canAfford(0)).toBe(false);
    expect(canAfford(100)).toBe(true);
  });
});

describe('Fusões não custam moedas', () => {
  test('fusão válida não desconta moedas (jogador e IA)', () => {
    const eng = makeEngine({ playerCoins: 300, aiCoins: 300 });
    const a = mustSummon(eng, 'ignis');
    const b = mustSummon(eng, 'ignis');
    const coinsBefore = eng.world.playerCoins;
    mustMerge(eng, a, b);
    expect(eng.world.playerCoins).toBe(coinsBefore);

    const c = mustSummon(eng, 'zephyr', 'ai');
    const d = mustSummon(eng, 'zephyr', 'ai');
    const aiCoinsBefore = eng.world.aiCoins;
    mustMerge(eng, c, d);
    expect(eng.world.aiCoins).toBe(aiCoinsBefore);
  });
});

describe('Recompensas por partida', () => {
  test('vitória concede exatamente 100 moedas', () => {
    const eng = makeEngine({ playerCoins: 350, aiCoins: 0, seed: 7 });
    const events = collectEvents(eng);
    mustSummon(eng, 'golem'); // custo de 100 → saldo 250 na batalha
    eng.startBattle();
    runSeconds(eng, 1);
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end).toBeDefined();
    if (end?.type === 'matchEnd') {
      expect(end.summary.result).toBe('victory');
      expect(end.summary.reward).toBe(VICTORY_REWARD);
      expect(end.summary.reward).toBe(100);
      expect(end.summary.balanceBefore).toBe(250);
      expect(end.summary.balanceAfter).toBe(350);
    }
    const ledger: RewardLedger = { processedMatchIds: [], coins: 250 };
    const applied = grantMatchReward(ledger, 'm-vit', 'victory');
    expect(applied).toBe(true);
    expect(ledger.coins).toBe(350);
    expect(rewardFor('victory')).toBe(100);
  });

  test('derrota concede exatamente 50 moedas', () => {
    const eng = makeEngine({
      playerCoins: 100,
      aiCoins: 500,
      seed: 11,
      difficulty: 'hard',
    });
    const events = collectEvents(eng);
    // A IA tem exército; o jogador não montou nada. Ao clicar em
    // "Iniciar Combate", o W.O. confirma a derrota na hora.
    mustSummon(eng, 'golem', 'ai');
    eng.startBattle();
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end?.type).toBe('matchEnd');
    if (end?.type === 'matchEnd') {
      expect(end.summary.result).toBe('defeat');
      expect(end.summary.reward).toBe(DEFEAT_REWARD);
      expect(end.summary.reward).toBe(50);
      expect(end.summary.balanceAfter).toBe(150);
    }
    const ledger: RewardLedger = { processedMatchIds: [], coins: 100 };
    grantMatchReward(ledger, 'm-der', 'defeat');
    expect(ledger.coins).toBe(150);
    expect(rewardFor('defeat')).toBe(50);
  });

  test('empate tem tratamento econômico pré-definido (50) e não altera vitória/derrota', () => {
    expect(rewardFor('draw')).toBe(50);
    expect(VICTORY_REWARD).toBe(100);
    expect(DEFEAT_REWARD).toBe(50);
  });

  test('uma mesma partida não concede recompensa mais de uma vez', () => {
    const ledger: RewardLedger = { processedMatchIds: [], coins: 200 };
    expect(grantMatchReward(ledger, 'match-42', 'victory')).toBe(true);
    expect(ledger.coins).toBe(300);
    // repetir a operação / recarregar a tela de resultado
    expect(grantMatchReward(ledger, 'match-42', 'victory')).toBe(false);
    expect(grantMatchReward(ledger, 'match-42', 'victory')).toBe(false);
    expect(ledger.coins).toBe(300);
    // outra partida pode ser recompensada
    expect(grantMatchReward(ledger, 'match-43', 'defeat')).toBe(true);
    expect(ledger.coins).toBe(350);
  });

  test('o motor não libera recompensa sem partida finalizada', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 3 });
    const events = collectEvents(eng);
    mustSummon(eng, 'ignis');
    mustSummon(eng, 'golem', 'ai');
    runSeconds(eng, 5); // nem preparação terminou
    expect(events.some((e) => e.type === 'matchEnd')).toBe(false);
    expect(eng.world.summary).toBeNull();
    expect(eng.world.playerCoins).toBe(400); // só o custo, nunca recompensa

    eng.startBattle();
    runSeconds(eng, 2); // combate em andamento, sem condição terminal
    expect(events.some((e) => e.type === 'matchEnd')).toBe(false);
    expect(eng.world.summary).toBeNull();
  });
});

describe('Reiniciar partida não gera moedas', () => {
  test('recomeço mantém o saldo e não credita nada', () => {
    // Primeira partida: gasta 300, termina com derrota (+50 idempotente).
    const eng1 = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 5 });
    mustSummon(eng1, 'ignis');
    mustSummon(eng1, 'ignis');
    mustSummon(eng1, 'ignis');
    const events = collectEvents(eng1);
    eng1.startBattle();
    runSeconds(eng1, 200); // estoura o tempo (empate/derrota/vitória — qualquer terminal)
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end?.type).toBe('matchEnd');

    const ledger: RewardLedger = { processedMatchIds: [], coins: eng1.world.playerCoins };
    if (end?.type === 'matchEnd') {
      grantMatchReward(ledger, end.summary.matchId, end.summary.result);
    }
    const coinsAfterMatch = ledger.coins;

    // "Reiniciar": nova partida com o MESMO saldo, sem bônus de reinício.
    const eng2 = makeEngine({ playerCoins: coinsAfterMatch, aiCoins: 500, seed: 6 });
    expect(eng2.world.playerCoins).toBe(coinsAfterMatch);
    runSeconds(eng2, 2);
    expect(eng2.world.playerCoins).toBe(coinsAfterMatch); // sem moedas grátis
    expect(eng2.world.summary).toBeNull();
  });
});

describe('Persistência', () => {
  test('recarregar a aplicação preserva o saldo', () => {
    const fresh = loadSave();
    fresh.coins = 777;
    fresh.discovered.push('magma');
    fresh.stats.wins = 3;
    persistSave(fresh);
    // simula F5: outro "runtime" lê o mesmo localStorage
    const reloaded = loadSave();
    expect(reloaded.coins).toBe(777);
    expect(reloaded.discovered).toContain('magma');
    expect(reloaded.stats.wins).toBe(3);
    globalThis.localStorage.removeItem(SAVE_KEY);
  });

  test('save padrão usa startingCoins configurável', () => {
    const base = defaultSave();
    expect(base.coins).toBe(base.settings.startingCoins);
    expect(base.settings.startingCoins).toBeGreaterThanOrEqual(400);
    expect(base.coins % SUMMON_COST).toBe(0);
  });
});

describe('Migração de save v2 → v3 (árvore elemental)', () => {
  test('híbridos antigos viram espécies equivalentes da árvore, com reembolso', () => {
    // save de antes da árvore: híbridos Nv.1 por par de elementos não existem mais
    const legacy = {
      version: 2,
      coins: 1000,
      discovered: ['ignis', 'vulcane', 'tempest', 'espécie_inexistente'],
      retainedRoster: [
        { species: 'vulcane', level: 3 }, // fogo+terra → magma (saem do time, com reembolso)
        { species: 'solaris', level: 1 }, // fogo+ar → raio (idem)
        { species: 'ignis', level: 2 }, // puro: fica
        { species: 'tempest', level: 4 }, // água+ar → gelo (idem)
      ],
      settings: { difficulty: 'normal', startingCoins: 500 },
      stats: { wins: 1, losses: 0, draws: 0, matchesPlayed: 1 },
      processedMatchIds: [],
      lastSummary: null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(legacy));

    const migrated = loadSave();
    expect(migrated.version).toBe(3);
    // descobertas migram para a espécie da árvore do mesmo par; lixo é descartado
    expect(migrated.discovered).toContain('ignis');
    expect(migrated.discovered).toContain('magma');
    expect(migrated.discovered).toContain('gelo');
    expect(migrated.discovered).not.toContain('vulcane');
    expect(migrated.discovered).not.toContain('espécie_inexistente');

    // unidades antigas saem do tabuleiro e o saldo recebe o valor antigo de volta
    // (híbrido Nv.k valia 100·2^(k-1)·2): 800 + 200 + 1600 = 2600
    expect(migrated.retainedRoster).toEqual([{ species: 'ignis', level: 2 }]);
    expect(migrated.coins).toBe(1000 + 800 + 200 + 1600);
    localStorage.removeItem(SAVE_KEY);
  });

  test('save v3 corrige níveis fora da janela das espécies (puro Nv.6 → Nv.5)', () => {
    const odd = {
      version: 3,
      coins: 500,
      discovered: ['magma'],
      retainedRoster: [
        { species: 'ignis', level: 6 }, // puro não passa do Nv.5
        { species: 'magma', level: 2 }, // árvore: volta para o nível fixo 6
      ],
      settings: { difficulty: 'hard', startingCoins: 500 },
      stats: { wins: 0, losses: 0, draws: 0, matchesPlayed: 0 },
      processedMatchIds: [],
      lastSummary: null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(odd));
    const fixed = loadSave();
    expect(fixed.retainedRoster).toEqual([
      { species: 'ignis', level: 5 },
      { species: 'magma', level: 6 },
    ]);
    expect(fixed.coins).toBe(500); // correção de nível não gera reembolso
    localStorage.removeItem(SAVE_KEY);
  });
});

describe('Economia da IA', () => {
  test('a IA não pode invocar sem possuir recursos suficientes', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 250, seed: 99, difficulty: 'hard' });
    const events = collectEvents(eng);
    // A IA só ganha unidades pelo saldo que possui: cada invocação custa 100.
    mustSummon(eng, 'ignis', 'ai');
    mustSummon(eng, 'zephyr', 'ai');
    // Terceira tentativa ultrapassaria o orçamento (250 − 200 = 50 < 100).
    const third = eng.summon('ai', 'golem');
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('NO_COINS');

    const aiSummons = events.filter((e) => e.type === 'summon' && e.side === 'ai');
    expect(aiSummons.length).toBe(2); // 250/100 = 2 no máximo
    const blocked = events.filter(
      (e) => e.type === 'summonBlocked' && e.side === 'ai',
    );
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    // invariantes: nunca negativa, e exatamente 100 por invocação
    expect(eng.world.aiCoins).toBe(250 - aiSummons.length * SUMMON_COST);
    expect(eng.world.aiCoins).toBe(50);
    expect(eng.world.aiCoins).toBeGreaterThanOrEqual(0);
    // tentativas ilegais não criam unidade nem debitam saldo
    expect(eng.aliveCount('ai')).toBe(2);
  });

  test('tentativa direta de invocação da IA sem saldo é bloqueada', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 90 });
    const res = eng.summon('ai', 'zephyr');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('NO_COINS');
    expect(eng.world.aiCoins).toBe(90);
    expect(eng.aliveCount('ai')).toBe(0);
  });
});
