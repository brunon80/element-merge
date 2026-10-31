import { composeEnemyTeam, teamValue, unitCoinCost } from '../game/ai/teamComposer';
import { mulberry32 } from '../game/engine/rng';
import { collectEvents, makeEngine, mustSummon } from './helpers';
import { getSpecies } from '../data/monsters';
import { TEAM_RULES } from '../data/balance';
import type { Difficulty, MonsterLevel, SpeciesId } from '../game/types';

/**
 * Testes da composição do exército inimigo (novo fluxo): o time é calculado
 * no início do combate, escalado pelo valor do time do jogador × dificuldade,
 * usando apenas custos/legalidade derivados das regras de fusão.
 */

const PLAYERS: { species: SpeciesId; level: MonsterLevel }[] = [
  { species: 'ignis', level: 2 },
  { species: 'golem', level: 1 },
  { species: 'nereia', level: 3 },
]; // valor = 200 + 100 + 400 = 700

function plan(difficulty: Difficulty, seed: number, players = PLAYERS) {
  return composeEnemyTeam({
    playerUnits: players,
    difficulty,
    freeTiles: Array.from({ length: 12 }, (_, i) => i),
    rand: mulberry32(seed),
  });
}

describe('Custo de reposição derivado das regras de fusão', () => {
  test('puros: Nv.1–5 custam 100/200/400/800/1600 (regra 2→1 em todo nível)', () => {
    expect(unitCoinCost('ignis', 1)).toBe(100);
    expect(unitCoinCost('ignis', 2)).toBe(200);
    expect(unitCoinCost('golem', 3)).toBe(400);
    expect(unitCoinCost('nereia', 4)).toBe(800);
    expect(unitCoinCost('zephyr', 5)).toBe(1600);
  });

  test('espécies da árvore custam as sementes que consomem (nível fixo 6–10)', () => {
    // 2→1 em toda a árvore: Nv.6 = 32 sementes, Nv.7 = 64, Nv.10 = 512
    expect(unitCoinCost('magma', 6)).toBe(3200);
    expect(unitCoinCost('tempestade', 7)).toBe(6400);
    expect(unitCoinCost('primordial', 10)).toBe(51200);
  });

  test('teamValue soma os custos', () => {
    expect(teamValue(PLAYERS)).toBe(700);
  });
});

describe('Orçamento e legalidade da composição', () => {
  test('orçamento = coeff × valor do time, arredondado a 100', () => {
    expect(plan('easy', 1).budget).toBe(400); // 0.6×700 = 420 → 400
    expect(plan('normal', 1).budget).toBe(700); // 1.0×700
    expect(plan('hard', 1).budget).toBe(1000); // 1.4×700 = 980 → 1000
  });

  test('gasto nunca ultrapassa o orçamento (100 seeds por dificuldade)', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (let seed = 1; seed <= 100; seed++) {
        const p = plan(d, seed);
        const cost = p.units.reduce((s, u) => s + unitCoinCost(u.species, u.level), 0);
        expect(cost).toBeLessThanOrEqual(p.budget);
        expect(cost).toBe(p.spent);
        expect(p.units.length).toBeGreaterThanOrEqual(1);
        expect(p.units.length).toBeLessThanOrEqual(12);
      }
    }
  });

  test('tiles nunca se repetem', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = plan('hard', seed);
      const tiles = p.units.map((u) => u.tile);
      expect(new Set(tiles).size).toBe(tiles.length);
      for (const t of tiles) expect(t).toBeGreaterThanOrEqual(0);
      expect(Math.max(...tiles)).toBeLessThan(12);
    }
  });

  test('time do jogador vazio → nenhum inimigo, orçamento zero', () => {
    const p = composeEnemyTeam({
      playerUnits: [],
      difficulty: 'hard',
      freeTiles: Array.from({ length: 12 }, (_, i) => i),
      rand: mulberry32(5),
    });
    expect(p.units).toHaveLength(0);
    expect(p.budget).toBe(0);
  });
});

describe('Dificuldade escala tamanho, nível e árvore elemental', () => {
  test('nível máximo respeitado: puras ≤ maxLevel; árvore ≤ treeMaxLevel (no nível fixo)', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const max = TEAM_RULES[d].maxLevel;
      const treeMax = TEAM_RULES[d].treeMaxLevel;
      for (let seed = 1; seed <= 60; seed++) {
        for (const u of plan(d, seed).units) {
          const def = getSpecies(u.species);
          if (def.levelMin === def.levelMax) {
            expect(u.level).toBe(def.levelMin); // árvore: nível fixo, jamais inventado
            expect(u.level).toBeLessThanOrEqual(treeMax);
          } else {
            expect(u.level).toBeLessThanOrEqual(max);
            expect(u.level).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  test('fácil jamais entra na árvore; difícil entra mais que o normal quando o orçamento paga', () => {
    // times ricos (5 puros Nv.5 = 8000) dão orçamento para criaturas Nv.6+
    const big: { species: SpeciesId; level: MonsterLevel }[] = [
      { species: 'ignis', level: 5 },
      { species: 'golem', level: 5 },
      { species: 'nereia', level: 5 },
      { species: 'zephyr', level: 5 },
      { species: 'ignis', level: 5 },
    ];
    for (let seed = 1; seed <= 40; seed++) {
      for (const u of plan('easy', seed, big).units) {
        const def = getSpecies(u.species);
        expect(def.levelMin === def.levelMax).toBe(false); // fácil: só puras (treeMaxLevel 0)
        expect(def.elements.length).toBe(1);
      }
    }
    let treeHard = 0;
    let treeNormal = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const u of plan('hard', seed, big).units) {
        if (getSpecies(u.species).levelMin === getSpecies(u.species).levelMax) treeHard++;
      }
      for (const u of plan('normal', seed, big).units) {
        if (getSpecies(u.species).levelMin === getSpecies(u.species).levelMax) treeNormal++;
      }
    }
    expect(treeNormal).toBeGreaterThan(0); // normal alcança Nv.6–7
    expect(treeHard).toBeGreaterThan(treeNormal); // difícil (hybridChance 0.6 / Nv.10) usa mais
  });

  test('orçamento e gasto crescem com a dificuldade (mesmo time, mesmos seeds)', () => {
    let spendEasy = 0;
    let spendNormal = 0;
    let spendHard = 0;
    for (let seed = 1; seed <= 40; seed++) {
      spendEasy += plan('easy', seed).spent;
      spendNormal += plan('normal', seed).spent;
      spendHard += plan('hard', seed).spent;
    }
    expect(spendEasy).toBeLessThan(spendNormal);
    expect(spendNormal).toBeLessThan(spendHard);
  });

  test('escala com o poder do time do jogador: time forte → inimigo maior', () => {
    const small: { species: SpeciesId; level: MonsterLevel }[] = [
      { species: 'ignis', level: 1 },
    ]; // valor 100
    const big: { species: SpeciesId; level: MonsterLevel }[] = [
      { species: 'ignis', level: 4 },
      { species: 'golem', level: 4 },
      { species: 'nereia', level: 4 },
    ]; // valor 1200
    let unitsSmall = 0;
    let unitsBig = 0;
    let levelBig = 0;
    for (let seed = 1; seed <= 30; seed++) {
      unitsSmall += plan('normal', seed, small).units.length;
      const pb = plan('normal', seed, big);
      unitsBig += pb.units.length;
      for (const u of pb.units) levelBig = Math.max(levelBig, u.level);
    }
    expect(unitsBig).toBeGreaterThan(unitsSmall);
    expect(levelBig).toBeGreaterThanOrEqual(3);
  });
});

describe('Contra-escolha e posicionamento', () => {
  test('difícil contra-escolhe fraquezas: time de Gólem (terra) atrai dano de fogo', () => {
    const players: { species: SpeciesId; level: MonsterLevel }[] = [
      { species: 'golem', level: 2 },
      { species: 'golem', level: 2 },
      { species: 'golem', level: 2 },
    ]; // fraqueza de terra: fogo (-15%)
    let fireUnits = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const p = composeEnemyTeam({
        playerUnits: players,
        difficulty: 'hard',
        freeTiles: Array.from({ length: 12 }, (_, i) => i),
        rand: mulberry32(seed),
      });
      for (const u of p.units) {
        total++;
        if (getSpecies(u.species).base.damageElement === 'fire') fireUnits++;
      }
    }
    expect(fireUnits / total).toBeGreaterThan(0.5);
  });

  test('posicionamento inteligente (normal/difícil): tanques na frente, frágeis atrás', () => {
    const players: { species: SpeciesId; level: MonsterLevel }[] = [
      { species: 'nereia', level: 3 },
      { species: 'zephyr', level: 3 },
      { species: 'golem', level: 3 },
      { species: 'ignis', level: 3 },
      { species: 'nereia', level: 3 },
    ]; // valor 2000 → orçamento difícil 2800
    const tanky = new Set(['golem', 'madeira', 'magma', 'obsidiana', 'pantano', 'geodo', 'colosso']);
    let ok = 0;
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const p = plan('hard', seed, players);
      const tankRows = p.units.filter((u) => tanky.has(u.species)).map((u) => Math.floor(u.tile / 4));
      const fragileRows = p.units.filter((u) => !tanky.has(u.species)).map((u) => Math.floor(u.tile / 4));
      if (tankRows.length === 0 || fragileRows.length === 0) continue;
      checked++;
      const avgTank = tankRows.reduce((s, r) => s + r, 0) / tankRows.length;
      const avgFragile = fragileRows.reduce((s, r) => s + r, 0) / fragileRows.length;
      if (avgTank <= avgFragile) ok++;
    }
    expect(checked).toBeGreaterThan(10);
    expect(ok / checked).toBeGreaterThan(0.75);
  });
});

describe('Motor: inimigos montados no startBattle', () => {
  test('prep não gera inimigo nem auto-inicia combate', () => {
    const eng = makeEngine({ generateTeam: true, seed: 31 });
    mustSummon(eng, 'golem');
    for (let i = 0; i < 600; i++) eng.update(1 / 30); // 20s de preparação
    expect(eng.aliveUnits('ai')).toHaveLength(0);
    expect(eng.world.phase).toBe('preparation');
    expect(eng.world.summary).toBeNull();
  });

  test('startBattle monta o exército com eventos de summon e níveis válidos', () => {
    const eng = makeEngine({ generateTeam: true, difficulty: 'hard', seed: 77 });
    for (let i = 0; i < 4; i++) mustSummon(eng, 'golem'); // valor 400 → orçamento 600
    const events = collectEvents(eng);
    eng.startBattle();
    const aiUnits = eng.aliveUnits('ai');
    expect(aiUnits.length).toBeGreaterThanOrEqual(2);
    for (const u of aiUnits) expect(u.level).toBeLessThanOrEqual(4);
    const summonEvents = events.filter((e) => e.type === 'summon' && e.side === 'ai');
    expect(summonEvents.length).toBe(aiUnits.length);
    // orçamento conferido e gasto legal (nunca negativo)
    expect(eng.world.aiCoins).toBeGreaterThanOrEqual(0);
    const spent = aiUnits.reduce((s, u) => s + unitCoinCost(u.species, u.level), 0);
    expect(spent).toBeLessThanOrEqual(600);
  });
});
