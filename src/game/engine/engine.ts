import {
  DEATH_ANIMATION_WINDOW,
  DOUBLE_SHOT_DELAY,
  HIT_RADIUS,
  TEAM_RULES,
  buildMatchConfig,
  scaledStats,
  type MatchConfigInput,
  type TeamDifficultyParams,
} from '../../data/balance';
import { formAimY, formMuzzleY } from '../../data/forms';
import { getSpecies } from '../../data/monsters';
import { computeDamage } from '../combat/damage';
import { pickTarget } from '../combat/targeting';
import { applyStatus, effectiveInterval, tickStatuses } from '../combat/status';
import { rewardFor, sellValue, trySpendSummonCost } from '../economy/economy';
import { checkFusion } from '../fusion/fusionRules';
import { TANKY_SPECIES, composeEnemyTeam } from '../ai/teamComposer';
import { tileGroundPosition } from '../board';
import { mulberry32 } from './rng';
import type {
  CombatUnit,
  Difficulty,
  ElementId,
  EngineEvent,
  FusionOutcome,
  FxEvent,
  MatchConfig,
  MatchPhase,
  MatchResult,
  MatchSummary,
  MonsterLevel,
  Projectile,
  Side,
  SpeciesId,
  TileIndex,
} from '../types';
import { BOARD_COLS, TILES_PER_SIDE } from '../types';

interface PendingShot {
  ownerId: number;
  targetId: number;
  at: number;
  damageFraction: number;
}

export interface World {
  matchId: string;
  phase: MatchPhase;
  time: number;
  battleTime: number;
  battleStarted: boolean;
  units: CombatUnit[];
  projectiles: Projectile[];
  fx: FxEvent[];
  playerCoins: number;
  aiCoins: number;
  occupancy: Record<Side, (number | null)[]>;
  difficulty: Difficulty;
  maxBattleTime: number;
  summary: MatchSummary | null;
}

export interface SummonResult {
  ok: boolean;
  reason?: 'NO_COINS' | 'BOARD_FULL' | 'NOT_SUMMONABLE' | 'MATCH_OVER';
  unitId?: number;
}

export interface MoveResult {
  ok: boolean;
  reason?: 'UNIT_GONE' | 'TILE_INVALID' | 'TILE_OCCUPIED' | 'WRONG_SIDE';
}

export interface MergeResult {
  ok: boolean;
  reason?: string;
  outcome?: FusionOutcome;
  createdIds?: number[];
}

export interface SellResult {
  ok: boolean;
  reason?: 'UNIT_GONE' | 'WRONG_SIDE' | 'MATCH_OVER';
  refund?: number;
}

/**
 * Motor de partidas — fonte única de verdade do gameplay.
 * Independente de React/Three.js: testa-se sem renderizar nada.
 */
export class GameEngine {
  readonly world: World;
  private readonly byId = new Map<number, CombatUnit>();
  private nextUnitId = 1;
  private nextProjectileId = 1;
  private readonly rng: () => number;
  private readonly teamRules: TeamDifficultyParams;
  private readonly generateTeamOnStart: boolean;
  private readonly pendingShots: PendingShot[] = [];
  private readonly everHadUnits: Record<Side, boolean> = {
    player: false,
    ai: false,
  };
  private onEvent: ((e: EngineEvent) => void) | null = null;

  constructor(input: MatchConfigInput) {
    const config: MatchConfig = buildMatchConfig(input);
    this.rng = mulberry32(config.seed);
    this.teamRules = TEAM_RULES[config.difficulty];
    this.generateTeamOnStart = config.generateEnemyTeam;
    this.world = {
      matchId: config.matchId,
      phase: 'preparation',
      time: 0,
      battleTime: 0,
      battleStarted: false,
      units: [],
      projectiles: [],
      fx: [],
      playerCoins: config.playerCoins,
      aiCoins: config.aiCoins,
      occupancy: {
        player: new Array(TILES_PER_SIDE).fill(null),
        ai: new Array(TILES_PER_SIDE).fill(null),
      },
      difficulty: config.difficulty,
      maxBattleTime: config.maxBattleTime,
      summary: null,
    };
    this.emit({ type: 'matchStart', matchId: config.matchId });
  }

  setEventCallback(cb: (e: EngineEvent) => void): void {
    this.onEvent = cb;
  }

  private emit(e: EngineEvent): void {
    this.onEvent?.(e);
  }

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  getUnit(id: number): CombatUnit | undefined {
    return this.byId.get(id);
  }

  aliveUnits(side?: Side): CombatUnit[] {
    return this.world.units.filter(
      (u) => u.alive && (side === undefined || u.side === side),
    );
  }

  aliveCount(side: Side): number {
    let n = 0;
    for (const u of this.world.units) if (u.alive && u.side === side) n++;
    return n;
  }

  freeTiles(side: Side): TileIndex[] {
    const occ = this.world.occupancy[side];
    const out: TileIndex[] = [];
    for (let i = 0; i < TILES_PER_SIDE; i++) if (occ[i] === null) out.push(i);
    return out;
  }

  boardFull(side: Side): boolean {
    return this.world.occupancy[side].every((t) => t !== null);
  }

  unitAt(side: Side, tile: TileIndex): CombatUnit | undefined {
    const id = this.world.occupancy[side][tile];
    if (id === null || id === undefined) return undefined;
    const u = this.byId.get(id);
    return u && u.alive ? u : undefined;
  }

  // -------------------------------------------------------------------------
  // Convocação (custo fixo de 100 moedas, mesmo caminho para jogador e IA)
  // -------------------------------------------------------------------------

  summon(side: Side, species: SpeciesId, tile?: TileIndex): SummonResult {
    if (this.world.summary) return { ok: false, reason: 'MATCH_OVER' };
    const def = getSpecies(species);
    // Somente espécies puras podem ser convocadas diretamente;
    // híbridos só nascem de fusões (progressão real).
    if (def.elements.length !== 1) {
      return { ok: false, reason: 'NOT_SUMMONABLE' };
    }
    const wallet = side === 'player' ? this.world.playerCoins : this.world.aiCoins;
    const spend = trySpendSummonCost(wallet);
    if (!spend.ok) {
      this.emit({ type: 'summonBlocked', side, species, reason: 'NO_COINS' });
      return { ok: false, reason: 'NO_COINS' };
    }
    let chosen: TileIndex | null = null;
    if (tile !== undefined) {
      if (
        tile < 0 ||
        tile >= TILES_PER_SIDE ||
        this.world.occupancy[side][tile] !== null
      ) {
        this.emit({ type: 'summonBlocked', side, species, reason: 'BOARD_FULL' });
        return { ok: false, reason: 'BOARD_FULL' };
      }
      chosen = tile;
    } else {
      chosen = this.pickPlacementTile(side, species);
    }
    if (chosen === null) {
      this.emit({ type: 'summonBlocked', side, species, reason: 'BOARD_FULL' });
      return { ok: false, reason: 'BOARD_FULL' };
    }

    if (side === 'player') this.world.playerCoins = spend.coins;
    else {
      this.world.aiCoins = spend.coins;
      this.emit({ type: 'aiCoins', coins: spend.coins });
    }
    const unit = this.createUnit(side, species, 1, chosen);
    if (this.world.battleStarted) this.everHadUnits[side] = true;
    this.emit({ type: 'summon', side, unitId: unit.id, species, level: 1 });
    this.world.fx.push({
      type: 'summon',
      pos: [...unit.pos] as [number, number, number],
      element: def.base.damageElement,
      species,
    });
    return { ok: true, unitId: unit.id };
  }

  private pickPlacementTile(side: Side, species: SpeciesId): TileIndex | null {
    const occ = this.world.occupancy[side];
    if (this.teamRules.smartPlacement && side === 'ai') {
      // Posicionamento tático: tanques na frente, frágeis no fundo.
      const rowOrder = TANKY_SPECIES.has(species) ? [0, 1, 2] : [2, 1, 0];
      for (const row of rowOrder) {
        for (let col = 0; col < BOARD_COLS; col++) {
          const t = row * BOARD_COLS + col;
          if (occ[t] === null) return t;
        }
      }
      return null;
    }
    for (let t = 0; t < TILES_PER_SIDE; t++) {
      if (occ[t] === null) return t;
    }
    return null;
  }

  private createUnit(
    side: Side,
    species: SpeciesId,
    level: MonsterLevel,
    tile: TileIndex,
  ): CombatUnit {
    const def = getSpecies(species);
    const stats = scaledStats(def.base, level);
    const pos = tileGroundPosition(side, tile);
    const unit: CombatUnit = {
      id: this.nextUnitId++,
      side,
      species,
      level,
      tile,
      pos: [pos[0], pos[1], pos[2] + 0],
      hp: stats.hp,
      maxHp: stats.hp,
      damage: stats.damage,
      range: stats.range,
      interval: stats.interval,
      projectileSpeed: stats.projectileSpeed,
      reload: stats.reload,
      moveSpeed: stats.moveSpeed,
      targeting: stats.targeting,
      resist: stats.resist,
      abilities: stats.abilities,
      damageElement: stats.damageElement,
      cooldown: stats.reload,
      statuses: [],
      alive: true,
      spawnedAt: this.world.time,
      lastAttackAt: -10,
      lastHurtAt: -10,
      diedAt: null,
      name: def.name,
    };
    this.world.units.push(unit);
    this.byId.set(unit.id, unit);
    this.world.occupancy[side][tile] = unit.id;
    return unit;
  }

  // -------------------------------------------------------------------------
  // Movimento e fusão
  // -------------------------------------------------------------------------

  moveUnit(side: Side, unitId: number, tile: TileIndex): MoveResult {
    const unit = this.byId.get(unitId);
    if (!unit || !unit.alive) return { ok: false, reason: 'UNIT_GONE' };
    if (unit.side !== side) return { ok: false, reason: 'WRONG_SIDE' };
    if (tile < 0 || tile >= TILES_PER_SIDE) return { ok: false, reason: 'TILE_INVALID' };
    if (this.world.occupancy[side][tile] !== null)
      return { ok: false, reason: 'TILE_OCCUPIED' };
    this.world.occupancy[side][unit.tile] = null;
    unit.tile = tile;
    unit.pos = tileGroundPosition(side, tile);
    this.world.occupancy[side][tile] = unit.id;
    this.emit({ type: 'move', unitId, tile });
    return { ok: true };
  }

  /**
   * Fusão atômica: valida TUDO antes de qualquer mutação. Em caso de
   * falha, nenhuma unidade é consumida e nenhum estado muda.
   */
  tryMerge(aId: number, bId: number): MergeResult {
    const a = this.byId.get(aId);
    const b = this.byId.get(bId);
    if (!a || !b || !a.alive || !b.alive) return { ok: false, reason: 'UNIT_GONE' };
    if (aId === bId) return { ok: false, reason: 'SAME_UNIT' };
    if (a.side !== b.side) return { ok: false, reason: 'DIFFERENT_SIDE' };

    const check = checkFusion(a.species, a.level, b.species, b.level);
    if (!check.ok) return { ok: false, reason: check.reason };
    const outcome = check.outcome;

    const side = a.side;
    const posA: [number, number, number] = [...a.pos];
    const posB: [number, number, number] = [...b.pos];
    const tileA = a.tile;
    const tileB = b.tile;

    // ---- Remoção atômica das duas entradas ----
    this.removeUnit(a);
    this.removeUnit(b);

    // ---- Criação atômica das saídas (quantidade exata da tabela) ----
    const createdIds: number[] = [];
    const createdA = this.createUnit(side, outcome.species, outcome.level, tileA);
    createdIds.push(createdA.id);
    if (outcome.outputCount === 2) {
      const createdB = this.createUnit(side, outcome.species, outcome.level, tileB);
      createdIds.push(createdB.id);
    }

    this.emit({ type: 'mergeStart', side, aId, bId, outcome });
    this.emit({ type: 'mergeDone', side, createdIds, outcome });
    const glow: FxEvent[] = [
      {
        type: 'mergeStart',
        pos: posA,
        pos2: posB,
        species: outcome.species,
        level: outcome.level,
      },
      {
        type: 'mergeDone',
        pos: tileGroundPosition(side, tileA),
        element: getSpecies(outcome.species).base.damageElement,
        species: outcome.species,
        level: outcome.level,
      },
    ];
    this.world.fx.push(...glow);
    return { ok: true, outcome, createdIds };
  }

  private removeUnit(unit: CombatUnit): void {
    const idx = this.world.units.indexOf(unit);
    if (idx >= 0) this.world.units.splice(idx, 1);
    this.byId.delete(unit.id);
    if (this.world.occupancy[unit.side][unit.tile] === unit.id) {
      this.world.occupancy[unit.side][unit.tile] = null;
    }
  }

  /**
   * Venda na lixeira: remove a criatura do tabuleiro e devolve à carteira
   * exatamente a soma do que ela custou para existir (regra 2→1): Nv.1=100,
   * Nv.2=200, Nv.3=400, Nv.4=800, Nv.5=1600; híbridos = dobro do nível.
   * Vale para criaturas combinadas — o reembolso acompanha o nível final.
   */
  sellUnit(unitId: number): SellResult {
    if (this.world.summary) return { ok: false, reason: 'MATCH_OVER' };
    const unit = this.byId.get(unitId);
    if (!unit || !unit.alive) return { ok: false, reason: 'UNIT_GONE' };
    if (unit.side !== 'player') return { ok: false, reason: 'WRONG_SIDE' };

    const refund = sellValue(unit.species, unit.level);
    const fxPos: [number, number, number] = [
      unit.pos[0],
      unit.pos[1] + formAimY(getSpecies(unit.species), unit.level),
      unit.pos[2],
    ];
    this.removeUnit(unit);
    this.world.playerCoins += refund;
    this.world.fx.push({
      type: 'sell',
      pos: fxPos,
      element: getSpecies(unit.species).base.damageElement,
      species: unit.species,
      level: unit.level,
      amount: refund,
    });
    return { ok: true, refund };
  }

  // -------------------------------------------------------------------------
  // Fluxo da partida
  // -------------------------------------------------------------------------

  startBattle(): void {
    if (this.world.phase !== 'preparation') return;
    this.world.phase = 'combat';
    this.world.battleStarted = true;
    this.world.battleTime = 0;
    // O exército inimigo é calculado e montado AQUI: orçamento =
    // dificuldade × valor do time do jogador, com níveis/híbridos da regra.
    if (this.generateTeamOnStart) this.generateEnemyTeam();
    const pHave = this.aliveCount('player') > 0;
    const aHave = this.aliveCount('ai') > 0;
    this.everHadUnits.player = pHave;
    this.everHadUnits.ai = aHave;
    if (pHave && aHave) {
      for (const u of this.world.units) if (u.alive) u.cooldown = u.reload * 0.5;
      this.emit({ type: 'battleStart' });
      this.emit({ type: 'phaseChange', phase: 'combat' });
      return;
    }
    // Começar o combate com um lado vazio resolve imediatamente
    // (w.o. de quem não tem exército; empate se ambos vazios).
    this.emit({ type: 'battleStart' });
    if (!pHave && !aHave) this.endMatch('draw');
    else if (!pHave) this.endMatch('defeat');
    else this.endMatch('victory');
  }

  update(dt: number): void {
    if (this.world.summary) return;
    const clamped = Math.min(0.05, Math.max(0, dt));
    this.world.time += clamped;
    const phase = this.world.phase;

    if (phase === 'preparation') {
      // Sem cronômetro: o jogador monta o time livremente e inicia quando quiser.
    } else if (phase === 'combat') {
      this.world.battleTime += clamped;
      this.combatTick(clamped);
      this.checkEndConditions();
    }

    this.purgeCorpses();
  }

  drainFx(): FxEvent[] {
    if (this.world.fx.length === 0) return [];
    const out = this.world.fx;
    this.world.fx = [];
    return out;
  }

  /**
   * Montagem do exército inimigo no início do combate: composição calculada
   * pela dificuldade e pelo valor do time do jogador (orçamento = coeficiente
   * × valor do time). Cada unidade nasce no seu nível e ganha spawn/animação.
   */
  private generateEnemyTeam(): void {
    const plan = composeEnemyTeam({
      playerUnits: this.aliveUnits('player').map((u) => ({
        species: u.species,
        level: u.level,
      })),
      difficulty: this.world.difficulty,
      freeTiles: this.freeTiles('ai'),
      rand: this.rng,
    });
    for (const pu of plan.units) {
      const unit = this.createUnit('ai', pu.species, pu.level, pu.tile);
      this.emit({
        type: 'summon',
        side: 'ai',
        unitId: unit.id,
        species: pu.species,
        level: pu.level,
      });
      this.world.fx.push({
        type: 'summon',
        pos: [...unit.pos] as [number, number, number],
        element: getSpecies(pu.species).base.damageElement,
        species: pu.species,
        level: pu.level,
      });
    }
    this.world.aiCoins = plan.budget - plan.spent;
    this.emit({ type: 'aiCoins', coins: this.world.aiCoins });
  }

  /**
   * Reintegra uma unidade do time persistido do jogador (sem custo), apenas
   * durante a preparação de uma nova partida. Híbridos também retornam.
   */
  addRetainedUnit(species: SpeciesId, level: MonsterLevel, tile?: TileIndex): SummonResult {
    if (this.world.summary || this.world.phase !== 'preparation') {
      return { ok: false, reason: 'MATCH_OVER' };
    }
    let chosen: TileIndex | null = null;
    if (
      tile !== undefined &&
      tile >= 0 &&
      tile < TILES_PER_SIDE &&
      this.world.occupancy.player[tile] === null
    ) {
      chosen = tile;
    } else {
      chosen = this.freeTiles('player')[0] ?? null;
    }
    if (chosen === null) return { ok: false, reason: 'BOARD_FULL' };
    const unit = this.createUnit('player', species, level, chosen);
    this.emit({ type: 'summon', side: 'player', unitId: unit.id, species, level });
    this.world.fx.push({
      type: 'summon',
      pos: [...unit.pos] as [number, number, number],
      element: getSpecies(species).base.damageElement,
      species,
      level,
    });
    return { ok: true, unitId: unit.id };
  }

  // -------------------------------------------------------------------------
  // Simulação de combate em tempo real
  // -------------------------------------------------------------------------

  private combatTick(dt: number): void {
    const world = this.world;
    const playerAlive = world.units.filter((u) => u.alive && u.side === 'player');
    const aiAlive = world.units.filter((u) => u.alive && u.side === 'ai');

    for (const unit of world.units) {
      if (!unit.alive) continue;
      const burnDamage = tickStatuses(unit, dt);
      if (burnDamage > 0) {
        this.applyDamage(unit, burnDamage, 'fire');
      }
      if (!unit.alive) continue;

      unit.cooldown -= dt;
      if (unit.cooldown <= 0) {
        const enemies = unit.side === 'player' ? aiAlive : playerAlive;
        const target = pickTarget(unit, enemies);
        if (target) {
          this.fireProjectile(unit, target, 1);
          unit.cooldown = effectiveInterval(unit);
          unit.lastAttackAt = world.time;
          const dbl = unit.abilities.find((a) => a.kind === 'doubleShot');
          if (dbl) {
            this.pendingShots.push({
              ownerId: unit.id,
              targetId: target.id,
              at: world.time + DOUBLE_SHOT_DELAY,
              damageFraction: dbl.factor ?? 0.6,
            });
          }
        } else {
          unit.cooldown = 0.3;
        }
      }
    }

    for (let i = this.pendingShots.length - 1; i >= 0; i--) {
      const shot = this.pendingShots[i];
      if (world.time < shot.at) continue;
      this.pendingShots.splice(i, 1);
      const owner = this.byId.get(shot.ownerId);
      const target = this.byId.get(shot.targetId);
      if (owner && owner.alive && target && target.alive) {
        this.fireProjectile(owner, target, shot.damageFraction);
      }
    }

    this.tickProjectiles(dt);
  }

  private fireProjectile(
    unit: CombatUnit,
    target: CombatUnit,
    damageFraction: number,
  ): void {
    const tdef = getSpecies(target.species);
    const adef = getSpecies(unit.species);
    // altura do canhão sobe com a forma (o dragão Nv5 cospe do pescoço)
    const aimY = formAimY(tdef, target.level);
    const pos: [number, number, number] = [
      unit.pos[0],
      unit.pos[1] + formMuzzleY(adef, unit.level),
      unit.pos[2],
    ];
    // direção inicial preenchida (dado informativo p/ camada visual:
    // orientação da bola de fogo, rastro etc.) — não afeta a física
    const dx0 = target.pos[0] - pos[0];
    const dy0 = target.pos[1] + aimY - pos[1];
    const dz0 = target.pos[2] - pos[2];
    const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0) || 1;
    const projectile: Projectile = {
      id: this.nextProjectileId++,
      ownerId: unit.id,
      ownerSide: unit.side,
      targetId: target.id,
      lastTargetPos: [...target.pos],
      pos,
      vel: [
        (dx0 / d0) * unit.projectileSpeed,
        (dy0 / d0) * unit.projectileSpeed,
        (dz0 / d0) * unit.projectileSpeed,
      ],
      speed: unit.projectileSpeed,
      damage: unit.damage * damageFraction,
      damageElement: unit.damageElement,
      species: unit.species,
      ownerLevel: unit.level,
      aimY,
      abilities: unit.abilities,
      pierceLeft: this.abilityFactor(unit, 'pierce') ?? 0,
      hitIds: [],
      chainLeft: unit.abilities.some((a) => a.kind === 'chain') ? 1 : 0,
      alive: true,
      rehitTimer: 0,
      age: 0,
    };
    this.world.projectiles.push(projectile);
  }

  private abilityFactor(unit: CombatUnit, kind: string): number | undefined {
    const a = unit.abilities.find((ab) => ab.kind === kind);
    return a?.factor;
  }

  private tickProjectiles(dt: number): void {
    const world = this.world;
    const projectiles = world.projectiles;
    for (const p of projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      p.rehitTimer -= dt;
      const target = this.byId.get(p.targetId);
      const aim: [number, number, number] =
        target && target.alive ? target.pos : p.lastTargetPos;
      if (target && target.alive) p.lastTargetPos = [...target.pos];

      const dx = aim[0] - p.pos[0];
      const dy = aim[1] + p.aimY - p.pos[1];
      const dz = aim[2] - p.pos[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const step = p.speed * dt;
      if (d <= Math.max(step, 0.0001) && d > 0.0001) {
        p.pos = [aim[0], aim[1] + p.aimY, aim[2]];
      } else if (d > 0.0001) {
        const inv = 1 / d;
        p.vel = [dx * inv * p.speed, dy * inv * p.speed, dz * inv * p.speed];
        p.pos = [p.pos[0] + dx * inv * step, p.pos[1] + dy * inv * step, p.pos[2] + dz * inv * step];
      }

      if (!target || !target.alive) {
        // Alvo já morreu: o projétil se desfaz ao alcançar a última posição.
        if (d < 0.5 || p.age > 8) p.alive = false;
        continue;
      }

      const hitDist =
        Math.hypot(target.pos[0] - p.pos[0], target.pos[2] - p.pos[2]);
      const near = hitDist < HIT_RADIUS && Math.abs(target.pos[1] + p.aimY - p.pos[1]) < 1.6;
      if (near && p.rehitTimer <= 0 && !p.hitIds.includes(target.id)) {
        this.resolveHit(p, target);
      }
      if (p.age > 8) p.alive = false;
    }
    world.projectiles = projectiles.filter((p) => p.alive);
  }

  private resolveHit(p: Projectile, target: CombatUnit): void {
    const world = this.world;
    const dmg = computeDamage(p.damage, target.resist, p.damageElement);
    this.applyDamage(target, dmg, p.damageElement);
    p.hitIds.push(target.id);

    // Impacto característico por espécie (bola de fogo do Ignis explode) —
    // camada visual decide o efeito; a física já foi aplicada acima.
    world.fx.push({
      type: 'impact',
      pos: [target.pos[0], target.pos[1] + p.aimY, target.pos[2]],
      element: p.damageElement,
      species: p.species,
      level: p.ownerLevel,
    });

    // Status (queimadura / lentidão) com base no dano-base do atacante.
    for (const ab of p.abilities) {
      if (ab.kind === 'burn' && this.rng() < (ab.chance ?? 0)) {
        applyStatus(target, 'burn', ab.duration ?? 3, {
          dps: p.damage * (ab.dpsFraction ?? 0.2),
        });
        world.fx.push({ type: 'status', pos: [...target.pos], status: 'burn', element: 'fire' });
      } else if (ab.kind === 'slow' && this.rng() < (ab.chance ?? 0)) {
        applyStatus(target, 'slow', ab.duration ?? 3, {
          slowFactor: ab.slowFactor ?? 0.5,
        });
        world.fx.push({ type: 'status', pos: [...target.pos], status: 'slow', element: 'water' });
      }
    }

    // Cadeia: respingo para um segundo alvo próximo.
    const chainAb = p.abilities.find((a) => a.kind === 'chain');
    if (chainAb && p.chainLeft > 0) {
      p.chainLeft -= 1;
      const others = this.aliveUnits(p.ownerSide === 'player' ? 'ai' : 'player').filter(
        (u) => u.id !== target.id && !p.hitIds.includes(u.id),
      );
      let best: CombatUnit | null = null;
      let bestD = Infinity;
      for (const u of others) {
        const dd = Math.hypot(u.pos[0] - target.pos[0], u.pos[2] - target.pos[2]);
        if (dd < 6 && dd < bestD) {
          bestD = dd;
          best = u;
        }
      }
      if (best) {
        const clone: Projectile = {
          ...p,
          id: this.nextProjectileId++,
          targetId: best.id,
          aimY: formAimY(getSpecies(best.species), best.level),
          lastTargetPos: [...best.pos],
          pos: [...p.pos],
          damage: p.damage * (chainAb.factor ?? 0.5),
          hitIds: [...p.hitIds, target.id],
          alive: true,
          age: 0,
          rehitTimer: 0,
        };
        this.world.projectiles.push(clone);
        world.fx.push({
          type: 'chain',
          pos: [...p.pos],
          pos2: [...best.pos],
          element: p.damageElement,
        });
      }
    }

    // Impacto em área.
    const splashAb = p.abilities.find((a) => a.kind === 'splash');
    if (splashAb) {
      const radius = splashAb.radius ?? 1.6;
      const factor = splashAb.factor ?? 0.5;
      const others = this.aliveUnits(p.ownerSide === 'player' ? 'ai' : 'player');
      for (const u of others) {
        if (u.id === target.id || p.hitIds.includes(u.id)) continue;
        const dd = Math.hypot(u.pos[0] - target.pos[0], u.pos[2] - target.pos[2]);
        if (dd <= radius) {
          const sub = computeDamage(p.damage * factor, u.resist, p.damageElement);
          this.applyDamage(u, sub, p.damageElement);
        }
      }
    }

    if (p.pierceLeft > 0) {
      p.pierceLeft -= 1;
      p.rehitTimer = 0.12;
    } else {
      p.alive = false;
    }
  }

  private applyDamage(
    unit: CombatUnit,
    rawDamage: number,
    fxElement: ElementId | undefined,
  ): void {
    if (!unit.alive) return;
    unit.hp -= rawDamage;
    unit.lastHurtAt = this.world.time;
    if (rawDamage > 0.5) {
      this.world.fx.push({
        type: 'hit',
        pos: [unit.pos[0], unit.pos[1] + 1.2, unit.pos[2]],
        amount: Math.round(rawDamage),
        element: fxElement,
      });
    }
    if (unit.hp <= 0) {
      unit.hp = 0;
      this.killUnit(unit);
    }
  }

  private killUnit(unit: CombatUnit): void {
    unit.alive = false;
    unit.diedAt = this.world.time;
    if (this.world.occupancy[unit.side][unit.tile] === unit.id) {
      this.world.occupancy[unit.side][unit.tile] = null;
    }
    this.world.fx.push({
      type: 'kill',
      pos: [unit.pos[0], unit.pos[1] + 0.8, unit.pos[2]],
      element: getSpecies(unit.species).base.damageElement,
      species: unit.species,
    });
    this.emit({
      type: 'unitDied',
      unitId: unit.id,
      side: unit.side,
      species: unit.species,
    });
  }

  private purgeCorpses(): void {
    const world = this.world;
    for (let i = world.units.length - 1; i >= 0; i--) {
      const u = world.units[i];
      if (!u.alive && u.diedAt !== null && world.time - u.diedAt >= DEATH_ANIMATION_WINDOW) {
        world.units.splice(i, 1);
        this.byId.delete(u.id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Condições terminais (vitória / derrota / empate)
  // -------------------------------------------------------------------------

  private checkEndConditions(): void {
    const world = this.world;
    if (!world.battleStarted || world.summary) return;
    const playerAlive = this.aliveCount('player');
    const aiAlive = this.aliveCount('ai');
    // Eliminação: zerou o tabuleiro TENDO tido unidades nesta batalha.
    const playerOut = playerAlive === 0 && this.everHadUnits.player;
    const aiOut = aiAlive === 0 && this.everHadUnits.ai;

    if (playerOut && aiOut) {
      this.endMatch('draw');
      return;
    }
    if (playerOut) {
      this.endMatch('defeat');
      return;
    }
    if (aiOut) {
      this.endMatch('victory');
      return;
    }
    if (world.battleTime >= world.maxBattleTime) {
      const pf = this.healthFraction('player');
      const af = this.healthFraction('ai');
      if (Math.abs(pf - af) < 0.05) this.endMatch('draw');
      else if (pf > af) this.endMatch('victory');
      else this.endMatch('defeat');
    }
  }

  private healthFraction(side: Side): number {
    let cur = 0;
    let max = 0;
    for (const u of this.world.units) {
      if (u.side === side && u.alive) {
        cur += u.hp;
        max += u.maxHp;
      }
    }
    if (max === 0) return 0;
    return cur / max;
  }

  /** A recompensa só existe quando a condição terminal é confirmada. */
  private endMatch(result: MatchResult): void {
    if (this.world.summary) return;
    const reward = rewardFor(result);
    const balanceBefore = this.world.playerCoins;
    const summary: MatchSummary = {
      matchId: this.world.matchId,
      result,
      reward,
      balanceBefore,
      balanceAfter: balanceBefore + reward,
      duration: Math.round(this.world.battleTime),
      difficulty: this.world.difficulty,
    };
    this.world.summary = summary;
    this.world.phase = result;
    // limpa projéteis em voo ao confirmar o fim
    this.world.projectiles = [];
    this.pendingShots.length = 0;
    // O motor NÃO credencia moedas: quem persiste é o store (idempotente).
    this.emit({ type: 'matchEnd', summary });
    this.emit({ type: 'phaseChange', phase: result });
  }
}
