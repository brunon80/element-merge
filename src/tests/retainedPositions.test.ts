import { SAVE_KEY, loadSave, SAVE_VERSION } from '../persistence/saveGame';
import { TILES_PER_SIDE } from '../game/types';
import type { GameEngine } from '../game/engine/engine';
import { getEngine, getSave, useGameStore } from '../store/gameStore';
import { makeEngine, mustMerge, mustSummon } from './helpers';

/**
 * Posições do time guardado (save v10).
 *
 * O motor tira um retrato do tabuleiro no instante em que o combate começa e é
 * esse retrato que volta na partida seguinte. Durante a luta as criaturas
 * andam pelo campo — devolver o time na posição bagunçada do final obrigaria o
 * jogador a reorganizar tudo de novo a cada partida, então o que é guardado é a
 * formação que ele mesmo montou na preparação.
 */

const sortedTiles = (list: { tile?: number }[]): number[] =>
  list.map((r) => r.tile ?? -1).sort((a, b) => a - b);

function freshMatch(): void {
  localStorage.clear();
  useGameStore.getState().initFromSave(); // default: 500 moedas, time vazio, normal
  useGameStore.getState().startNewMatch();
}

function runUntil(eng: GameEngine, maxTicks = 20_000): void {
  let guard = 0;
  while (!eng.world.summary && guard++ < maxTicks) eng.update(1 / 30);
  expect(eng.world.summary).not.toBeNull();
}

function runUntilSummary(maxTicks = 20_000): void {
  const eng = getEngine();
  if (!eng) throw new Error('sem engine: chame freshMatch primeiro');
  runUntil(eng, maxTicks);
}

describe('Posições do time guardado entre partidas', () => {
  test('o time volta nos mesmos buracos em que o jogador deixou', () => {
    freshMatch();
    const eng = getEngine()!;
    mustSummon(eng, 'golem', 'player', 0);
    mustSummon(eng, 'golem', 'player', 5);
    mustSummon(eng, 'golem', 'player', 11);
    const planted = eng.aliveUnits('player').map((u) => u.tile).sort((a, b) => a - b);
    expect(planted).toEqual([0, 5, 11]);

    eng.startBattle();
    eng.aliveUnits('ai').forEach((u) => (u.damage = 999_999));
    eng.aliveUnits('player').forEach((u) => (u.damage = 0)); // derrota: o time inteiro volta
    runUntilSummary();
    expect(eng.world.summary!.result).toBe('defeat');

    // o save guarda a formação do começo do combate, não a bagunça do final
    expect(sortedTiles(getSave().retainedRoster)).toEqual([0, 5, 11]);

    // a próxima partida já vem montada: cada buraco tem a criatura de antes
    useGameStore.getState().startNewMatch();
    const eng2 = getEngine()!;
    for (const tile of [0, 5, 11]) {
      const unit = eng2.unitAt('player', tile);
      expect(unit).toBeDefined();
      expect(unit!.species).toBe('golem');
    }
    expect(eng2.aliveUnits('player').map((u) => u.tile).sort((a, b) => a - b)).toEqual([0, 5, 11]);
  });

  test('quem se mexeu no combate volta para o buraco do começo da luta', () => {
    const eng = makeEngine({ playerCoins: 1000, aiCoins: 500, seed: 404 });
    const walker = mustSummon(eng, 'zephyr', 'player', 7); // o mais veloz: anda sozinho
    const rock = mustSummon(eng, 'golem', 'player', 2);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    // empurra as duas para buracos bem diferentes logo no primeiro tick
    const far = eng.freeTiles('player').filter((t) => t !== 7 && t !== 2);
    expect(eng.moveUnit('player', walker, far[0]).ok).toBe(true);
    expect(eng.moveUnit('player', rock, far[1]).ok).toBe(true);
    expect(eng.getUnit(walker)!.tile).toBe(far[0]); // tabuleiro bagunçado de fato

    eng.world.maxBattleTime = 0.2; // relógio fecha a partida na hora
    runUntil(eng, 30);
    const roster = eng.restoredRoster('player');
    expect(sortedTiles(roster)).toEqual([2, 7]);
  });

  test('filho de fusão feita no combate herda o buraco do par', () => {
    const eng = makeEngine({ playerCoins: 1000, aiCoins: 500, seed: 505 });
    const a = mustSummon(eng, 'golem', 'player', 1);
    const b = mustSummon(eng, 'golem', 'player', 8);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    const [kid] = mustMerge(eng, a, b); // fusão durante a luta
    expect(eng.getUnit(kid)!.tile).toBe(8); // nasce no buraco do alvo

    eng.world.maxBattleTime = 0.2;
    runUntil(eng, 30);
    const roster = eng.restoredRoster('player');
    expect(roster).toEqual([{ species: 'golem', level: 2, tile: 8 }]);
  });

  test('dois monstros reivindicando o mesmo buraco: o segundo pega o primeiro livre', () => {
    const eng = makeEngine({ playerCoins: 0, aiCoins: 0, seed: 606 });
    const first = eng.addRetainedUnit('golem', 1, 4);
    const second = eng.addRetainedUnit('ignis', 1, 4); // buraco já tomado
    const third = eng.addRetainedUnit('nereia', 1, 99); // buraco inexistente
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    expect(eng.getUnit(second.unitId!)!.tile).not.toBe(4);
    expect(eng.getUnit(third.unitId!)!.tile).toBeGreaterThanOrEqual(0);
    expect(eng.getUnit(third.unitId!)!.tile).toBeLessThan(TILES_PER_SIDE);
    const tiles = eng.aliveUnits('player').map((u) => u.tile);
    expect(new Set(tiles).size).toBe(3); // ninguém em cima de ninguém
  });

  test('save v10 preserva as posições e o save antigo (sem posição) continua voltando', () => {
    // save novo: cada criatura tem o seu buraco
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        coins: 300,
        discovered: ['ignis', 'nereia', 'golem', 'zephyr'],
        retainedRoster: [
          { species: 'golem', level: 1, tile: 0 },
          { species: 'ignis', level: 2, tile: 9 },
        ],
        settings: { difficulty: 'easy', startingCoins: 300 },
        stats: { wins: 1, losses: 0, draws: 0, matchesPlayed: 1 },
        processedMatchIds: [],
        lastSummary: null,
      }),
    );
    const kept = loadSave();
    expect(kept.retainedRoster).toEqual([
      { species: 'golem', level: 1, tile: 0 },
      { species: 'ignis', level: 2, tile: 9 },
    ]);

    useGameStore.getState().initFromSave();
    useGameStore.getState().startNewMatch();
    const eng = getEngine()!;
    expect(eng.unitAt('player', 0)?.species).toBe('golem');
    expect(eng.unitAt('player', 9)?.species).toBe('ignis');

    // save de antes da v10: sem o campo tile → entra no primeiro buraco livre
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 9,
        coins: 100,
        discovered: ['ignis', 'nereia', 'golem', 'zephyr'],
        retainedRoster: [{ species: 'zephyr', level: 1 }],
        settings: { difficulty: 'easy', startingCoins: 300 },
        stats: { wins: 0, losses: 1, draws: 0, matchesPlayed: 1 },
        processedMatchIds: [],
        lastSummary: null,
      }),
    );
    const legacy = loadSave();
    expect(legacy.version).toBe(SAVE_VERSION);
    expect(legacy.retainedRoster[0].tile).toBeUndefined();

    useGameStore.getState().initFromSave();
    useGameStore.getState().startNewMatch();
    const eng2 = getEngine()!;
    const back = eng2.aliveUnits('player');
    expect(back).toHaveLength(1);
    expect(back[0].species).toBe('zephyr');
    expect(back[0].tile).toBe(0); // primeiro buraco livre
    localStorage.removeItem(SAVE_KEY);
  });

  test('posição inválida no save é descartada (o jogo não quebra com JSON adulterado)', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        coins: 100,
        discovered: ['ignis', 'nereia', 'golem', 'zephyr'],
        retainedRoster: [
          { species: 'golem', level: 1, tile: 999 }, // fora do tabuleiro
          { species: 'ignis', level: 1, tile: -3 }, // buraco negativo
          { species: 'nereia', level: 1, tile: 'quatro' }, // nem número é
        ],
        settings: { difficulty: 'easy', startingCoins: 100 },
        stats: { wins: 0, losses: 0, draws: 0, matchesPlayed: 0 },
        processedMatchIds: [],
        lastSummary: null,
      }),
    );
    const fixed = loadSave();
    expect(fixed.retainedRoster.every((r) => r.tile === undefined)).toBe(true);
    localStorage.removeItem(SAVE_KEY);
  });
});
