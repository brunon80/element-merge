import { computeDamage } from '../game/combat/damage';
import { applyStatus, effectiveInterval, tickStatuses } from '../game/combat/status';
import {
  collectEvents,
  makeEngine,
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
    const tickDamage = (u: CombatUnit, dt: number): number =>
      tickStatuses(u, dt).reduce((s, d) => s + d.amount, 0);

    // Queimadura: 3s a 20 DPS → exatamente 60 de dano, some após a duração.
    applyStatus(unit, 'burn', 3, { dps: 20, element: 'fire' });
    let totalBurn = 0;
    for (let i = 0; i < 30; i++) totalBurn += tickDamage(unit, 0.1);
    expect(totalBurn).toBeCloseTo(60, 6);
    expect(unit.statuses.filter((s) => s.type === 'burn')).toHaveLength(0);
    totalBurn = 0;
    for (let i = 0; i < 10; i++) totalBurn += tickDamage(unit, 0.1);
    expect(totalBurn).toBe(0); // expirou → nenhum dano adicional

    // Veneno: mesmo comportamento de DoT, mas com o ELEMENTO próprio — o motor
    // usa isso para aplicar a resistência certa (veneno não é fogo).
    applyStatus(unit, 'poison', 4, { dps: 10, element: 'earth' });
    const dot = tickStatuses(unit, 1)[0];
    expect(dot.element).toBe('earth');
    expect(dot.amount).toBeCloseTo(10, 6);
    applyStatus(unit, 'burn', 2, { dps: 5, element: 'fire' });
    const two = tickStatuses(unit, 1); // queimadura + veneno no mesmo tick
    expect(two.map((d) => d.element).sort()).toEqual(['earth', 'fire']);
    expect(two.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(15, 6);

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

  test('5c) francotiradores visam o mais distante (Gelo Nv.6 da árvore)', () => {
    // espécie da árvore não é invocável: entra pela injeção de preparação no
    // nível oficial (Nv.6) — mesma legalidade do time persistido
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 62 });
    const geloRes = eng.addRetainedUnit('gelo', 6);
    expect(geloRes.ok).toBe(true);
    const gelo = geloRes.unitId!;
    const close = mustSummon(eng, 'zephyr', 'ai', playerTile(0, 1));
    const back = mustSummon(eng, 'zephyr', 'ai', playerTile(1, 1));
    void close;
    eng.startBattle();
    let targetId = -1;
    for (let i = 0; i < 60 * 10 && targetId < 0; i++) {
      eng.update(1 / 60);
      const shot = eng.world.projectiles.find((pr) => pr.ownerId === gelo);
      if (shot) targetId = shot.targetId;
    }
    expect(targetId).toBe(back); // mira o inimigo do fundo, não o da frente
    expect(eng.getUnit(gelo)!.species).toBe('gelo');
  });
});

describe('Habilidades da árvore elemental (veneno, regeneração, dreno, saltos)', () => {
  /** bomba de treino: alvo enorme que sobrevive ao teste inteiro */
  function dummy(eng: ReturnType<typeof makeEngine>, hp: number): number {
    const id = mustSummon(eng, 'golem', 'ai', playerTile(0, 0));
    const u = eng.getUnit(id)!;
    u.maxHp = hp;
    u.hp = hp;
    return id;
  }

  test('Pântano envenena alvos com seus ataques (status + DoT)', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 313 });
    const pan = eng.addRetainedUnit('pantano', 7);
    expect(pan.ok).toBe(true);
    const victim = dummy(eng, 300000);
    eng.startBattle();

    let sawPoison = false;
    for (let i = 0; i < 60 * 12 && !sawPoison; i++) {
      eng.update(1 / 60);
      const v = eng.getUnit(victim);
      if (v && v.statuses.some((s) => s.type === 'poison')) sawPoison = true;
    }
    expect(sawPoison).toBe(true);
    expect(eng.world.fx.some((f) => f.type === 'status' && f.status === 'poison')).toBe(true);
  });

  test('Regeneração: Madeira recupera a própria vida sozinha', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 411 });
    const md = eng.addRetainedUnit('madeira', 6);
    expect(md.ok).toBe(true);
    const unit = eng.getUnit(md.unitId!)!;
    const victim = mustSummon(eng, 'zephyr', 'ai', playerTile(0, 0));
    const v = eng.getUnit(victim)!;
    v.maxHp = 200000;
    v.hp = 200000; // não morre cedo demais: o combate continua

    unit.hp = unit.maxHp * 0.4;
    const hpStart = unit.hp;
    eng.startBattle();
    runSeconds(eng, 5);
    expect(unit.alive).toBe(true);
    // 4% do HP máximo por segundo supera o pouco dano recebido
    expect(unit.hp).toBeGreaterThan(hpStart + unit.maxHp * 0.05);
  });

  test('Dreno: Abissal recupera vida ao causar dano', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 519 });
    const ab = eng.addRetainedUnit('abissal', 8);
    expect(ab.ok).toBe(true);
    const unit = eng.getUnit(ab.unitId!)!;
    dummy(eng, 400000);

    unit.hp = unit.maxHp * 0.5; // precisa de cura para subir
    const hpStart = unit.hp;
    eng.startBattle();
    runSeconds(eng, 4);
    expect(unit.alive).toBe(true);
    expect(unit.hp).toBeGreaterThan(hpStart + unit.maxHp * 0.05);
  });

  test('Salto em cadeia: Tempestade atinge múltiplos alvos com um só tiro', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 623 });
    const t = eng.addRetainedUnit('tempestade', 7);
    expect(t.ok).toBe(true);
    const v1 = mustSummon(eng, 'golem', 'ai', playerTile(0, 0));
    const v2 = mustSummon(eng, 'golem', 'ai', playerTile(0, 1));
    const v3 = mustSummon(eng, 'golem', 'ai', playerTile(1, 1));
    for (const id of [v1, v2, v3]) {
      const u = eng.getUnit(id)!;
      u.maxHp = 500000;
      u.hp = 500000;
    }
    eng.startBattle();

    let chainArmed = false;
    for (let i = 0; i < 60 * 8; i++) {
      eng.update(1 / 60);
      if (!chainArmed) {
        const shot = eng.world.projectiles.find((p) => p.ownerId === t.unitId);
        if (shot) {
          expect(shot.chainLeft).toBeGreaterThanOrEqual(1); // jumps: 3
          chainArmed = true;
        }
      }
    }
    expect(chainArmed).toBe(true);
    const hurt = [v1, v2, v3].filter(
      (id) => eng.getUnit(id)!.hp < eng.getUnit(id)!.maxHp,
    );
    expect(hurt.length).toBeGreaterThanOrEqual(2); // respingo em cadeia atingiu mais de um
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
