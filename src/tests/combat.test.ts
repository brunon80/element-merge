import { computeDamage } from '../game/combat/damage';
import { applyStatus, effectiveInterval, tickStatuses } from '../game/combat/status';
import {
  collectEvents,
  makeEngine,
  mustMerge,
  mustSummon,
  runSeconds,
} from './helpers';
import type { CombatUnit } from '../game/types';

/**
 * Testes obrigatórios de combate (documento de design, seção 14.3).
 */

function playerTile(row: number, col: number): number {
  return row * 4 + col;
}

describe('Projéteis e dano', () => {
  test('1) projéteis atingem os alvos corretos', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 21 });
    const p = mustSummon(eng, 'ignis', 'player', playerTile(0, 1));
    const a = mustSummon(eng, 'nereia', 'ai', playerTile(0, 1));
    eng.startBattle();

    let firstProjectile = true;
    let hitSeen = false;
    for (let i = 0; i < 60 * 10 && !hitSeen; i++) {
      eng.update(1 / 60);
      for (const pr of eng.world.projectiles) {
        if (pr.ownerId === p && firstProjectile) {
          firstProjectile = false;
          expect(pr.targetId).toBe(a); // mira o alvo certo
        }
      }
      const target = eng.getUnit(a);
      if (target && target.hp < target.maxHp) hitSeen = true;
    }
    expect(hitSeen).toBe(true);
    // dano de fogo em Nereia sem fraqueza específica: apenas queimadura eventual
    const ai = eng.getUnit(a)!;
    expect(ai.maxHp - ai.hp).toBeGreaterThan(0);
  });

  test('2) o dano é aplicado conforme os atributos da criatura', () => {
    // unidade de teste: Zéfiro (9 de dano, sem status) vs Gólem (220 de vida)
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 31 });
    mustSummon(eng, 'zephyr', 'player', playerTile(0, 0));
    const golem = mustSummon(eng, 'golem', 'ai', playerTile(0, 0));

    eng.startBattle();
    const target = eng.getUnit(golem)!;
    for (let i = 0; i < 60 * 10 && target.hp === target.maxHp; i++) eng.update(1 / 60);
    expect(target.hp).toBeLessThan(target.maxHp);
    // primeiro acerto: exatamente 9 de dano (sem resistência a ar; sem status no Zéfiro)
    expect(Math.abs(target.maxHp - target.hp - 9)).toBeLessThan(1e-9);

    // resistências elementais: fogo × Gólem = +15% de dano recebido (fraqueza)
    expect(computeDamage(14, { fire: -0.15 }, 'fire')).toBeCloseTo(16.1);
    // resistência própria reduz: água vs Nereia = 25% menos dano
    expect(computeDamage(20, { water: 0.25 }, 'water')).toBeCloseTo(15);
    // sem resistência: dano integral
    expect(computeDamage(17, {}, 'air')).toBeCloseTo(17);
  });

  test('3) efeitos de status respeitam suas durações', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 41 });
    const id = mustSummon(eng, 'golem', 'ai', playerTile(0, 0));
    const unit = eng.getUnit(id)!;

    // Queimadura: 3s a 20 DPS → exatamente 60 de dano, some após a duração.
    applyStatus(unit, 'burn', 3, { dps: 20 });
    let totalBurn = 0;
    for (let i = 0; i < 30; i++) totalBurn += tickStatuses(unit, 0.1);
    expect(totalBurn).toBeCloseTo(60, 6);
    expect(unit.statuses.filter((s) => s.type === 'burn')).toHaveLength(0);
    totalBurn = 0;
    for (let i = 0; i < 10; i++) totalBurn += tickStatuses(unit, 0.1);
    expect(totalBurn).toBe(0); // expirou → nenhum dano adicional

    // Lentidão: intervalo × (1 + fator) apenas enquanto ativa.
    const base = unit.interval;
    applyStatus(unit, 'slow', 2, { slowFactor: 0.6 });
    expect(effectiveInterval(unit)).toBeCloseTo(base * 1.6);
    for (let i = 0; i < 21; i++) tickStatuses(unit, 0.1);
    expect(effectiveInterval(unit)).toBeCloseTo(base);
  });

  test('4) criaturas derrotadas deixam de atacar', () => {
    // orçamento da IA cobre exatamente UMA invocação — a vítima manual
    const eng = makeEngine({ playerCoins: 500, aiCoins: 100, seed: 51 });
    mustSummon(eng, 'ignis', 'player', playerTile(0, 0));
    mustSummon(eng, 'ignis', 'player', playerTile(0, 1));
    mustSummon(eng, 'ignis', 'player', playerTile(0, 2));
    const victim = mustSummon(eng, 'nereia', 'ai', playerTile(0, 0));
    eng.startBattle();
    runSeconds(eng, 2);
    const v = eng.getUnit(victim)!;
    v.hp = 2; // quase morta: vai morrer ao próximo acerto

    for (let i = 0; i < 60 * 10 && v.alive; i++) eng.update(1 / 60);
    expect(v.alive).toBe(false);

    const aiOwnedAtDeath = new Set(
      eng.world.projectiles.filter((pr) => pr.ownerId === victim).map((pr) => pr.id),
    );
    runSeconds(eng, 3);
    const newAiShots = eng.world.projectiles.filter(
      (pr) => pr.ownerId === victim && !aiOwnedAtDeath.has(pr.id),
    );
    expect(newAiShots).toHaveLength(0); // nenhuma nova rajada de unidade morta
  });
});

describe('Seleção de alvos', () => {
  function setupTwoEnemies(targetingUnit: 'golem' | 'ignis') {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 61 });
    const me = mustSummon(eng, targetingUnit, 'player', playerTile(0, 0));
    const close = mustSummon(eng, 'zephyr', 'ai', playerTile(0, 1)); // linha frontal
    const back = mustSummon(eng, 'zephyr', 'ai', playerTile(1, 1)); // linha do meio
    // deixa o alvo traseiro bem mais ferido (para testar lowestHp)
    eng.getUnit(back)!.hp = 30;
    eng.startBattle();
    let targetId = -1;
    for (let i = 0; i < 60 * 10 && targetId < 0; i++) {
      eng.update(1 / 60);
      const shot = eng.world.projectiles.find((pr) => pr.ownerId === me);
      if (shot) targetId = shot.targetId;
    }
    return { eng, me, close, back, targetId };
  }

  test('5a) caçadores de unidade ferida priorizam menor vida (Gólem)', () => {
    const { close, back, targetId } = setupTwoEnemies('golem');
    expect(targetId).toBe(back); // mesmo com o alvo frontal mais próximo
    expect(close).not.toBe(back);
  });

  test('5b) atiradores padrão visam o inimigo mais próximo (Ignis)', () => {
    const { close, targetId } = setupTwoEnemies('ignis');
    expect(targetId).toBe(close);
  });

  test('5c) francotiradores visam o mais distante (Tempest)', () => {
    // Tempest só nasce de fusão híbrida: Nereia + Zéfiro Nv.1
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 62 });
    const n = mustSummon(eng, 'nereia', 'player', playerTile(0, 0));
    const z = mustSummon(eng, 'zephyr', 'player', playerTile(1, 3));
    const [tempest] = mustMerge(eng, n, z);
    const close = mustSummon(eng, 'zephyr', 'ai', playerTile(0, 1));
    const back = mustSummon(eng, 'zephyr', 'ai', playerTile(1, 1));
    void close;
    eng.startBattle();
    let targetId = -1;
    for (let i = 0; i < 60 * 10 && targetId < 0; i++) {
      eng.update(1 / 60);
      const shot = eng.world.projectiles.find((pr) => pr.ownerId === tempest);
      if (shot) targetId = shot.targetId;
    }
    expect(targetId).toBe(back);
    expect(eng.getUnit(tempest)!.species).toBe('tempest');
  });
});

describe('Condições terminais', () => {
  test('6a) batalha termina quando uma equipe inteira é derrotada (vitória)', () => {
    const eng = makeEngine({ playerCoins: 1000, aiCoins: 500, seed: 71 });
    mustSummon(eng, 'ignis', 'player', playerTile(0, 0));
    mustSummon(eng, 'golem', 'player', playerTile(1, 0));
    mustSummon(eng, 'nereia', 'ai', playerTile(0, 0));
    const events = collectEvents(eng);
    eng.startBattle();
    runSeconds(eng, 40);
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end?.type).toBe('matchEnd');
    if (end?.type === 'matchEnd') {
      expect(['victory', 'defeat']).toContain(end.summary.result);
    }
    expect(eng.world.summary).not.toBeNull();
    if (eng.aliveCount('ai') === 0) expect(eng.world.phase).toBe('victory');
  });

  test('6b) derrota quando a equipe do jogador é eliminada', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 1000, seed: 81 });
    mustSummon(eng, 'nereia', 'ai', playerTile(0, 0));
    mustSummon(eng, 'nereia', 'ai', playerTile(0, 1));
    mustSummon(eng, 'zephyr', 'ai', playerTile(1, 0));
    mustSummon(eng, 'zephyr', 'player', playerTile(0, 0));
    eng.startBattle();
    runSeconds(eng, 60);
    expect(eng.aliveCount('player')).toBe(0);
    expect(eng.world.phase).toBe('defeat');
    expect(eng.world.summary!.result).toBe('defeat');
  });

  test('6c) limite de duração resolve a partida sem travar (empate/vida restante)', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, maxBattleTime: 0.8, seed: 91 });
    mustSummon(eng, 'zephyr', 'player', playerTile(0, 0)); // Zéfiro dispara a 0.4s? recarga 0.8 → meio...
    mustSummon(eng, 'zephyr', 'ai', playerTile(0, 0));
    // vida do jogador bem menor → vence a IA pelo critério de vida restante
    const p = eng.getUnit(eng.world.units[0].id)! as CombatUnit;
    p.hp = 20;
    eng.startBattle();
    runSeconds(eng, 1.5);
    expect(eng.world.summary).not.toBeNull();
    expect(eng.world.summary!.result).toBe('defeat'); // jogador com menos vida relativa
    // congelou: nenhuma atualização posterior muda a partida
    const snap = eng.world.summary!;
    runSeconds(eng, 2);
    expect(eng.world.summary).toBe(snap);
    expect(eng.world.phase).toBe('defeat');
  });

  test('6d) empate quando nenhum dos lados tem vantagem ao expirar o tempo', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, maxBattleTime: 0.5, seed: 95 });
    mustSummon(eng, 'golem', 'player', playerTile(0, 0)); // recarga 1.4 → nenhum tiro em 0.25s pós-start
    mustSummon(eng, 'golem', 'ai', playerTile(0, 0));
    eng.startBattle(); // cooldown = 0.7 → primeiro tiro ≈ 0.7s > 0.5s de combate
    runSeconds(eng, 1);
    expect(eng.world.summary!.result).toBe('draw');
  });

  test('7) nenhuma recompensa é liberada antes do fim confirmado', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 300, seed: 101 });
    const events = collectEvents(eng);
    mustSummon(eng, 'ignis', 'player', playerTile(0, 0));
    mustSummon(eng, 'golem', 'ai', playerTile(0, 0));
    eng.startBattle();
    runSeconds(eng, 10); // meia-batalha
    const ended = events.some((e) => e.type === 'matchEnd');
    if (!ended) {
      expect(eng.world.summary).toBeNull();
      expect(eng.world.playerCoins).toBe(400); // somente custo de invocação
      runSeconds(eng, 100); // deixa terminar de fato
      const end = events.find((e) => e.type === 'matchEnd');
      expect(end?.type).toBe('matchEnd');
    }
  });
});
