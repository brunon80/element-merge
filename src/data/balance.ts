import type { BaseStats, Difficulty, MatchConfig, MonsterLevel } from '../game/types';

/**
 * Parâmetros globais de balanceamento. Fonte única de verdade:
 * motor, interface, enciclopédia e testes leem todos daqui.
 */

/** Custo fixo por invocação (regra fixa do design). */
export { SUMMON_COST, VICTORY_REWARD, DEFEAT_REWARD, DRAW_REWARD } from '../game/types';

/** Saldo inicial configurável (novo jogo). */
export const DEFAULT_STARTING_COINS = 500;

/** Limite de duração do combate; ao expirar, vence quem tiver mais vida relativa (empate se muito próximos). */
export const MAX_BATTLE_TIME = 160;

/** Janela de animação de morte antes da unidade ser removida do mundo (s). */
export const DEATH_ANIMATION_WINDOW = 0.9;

/** Duração da animação de fusão (aproximação/absorção) antes de criar as saídas (s). */
export const MERGE_ANIMATION_WINDOW = 0.5;

/** Multiplicador de HP/dano por nível de evolução. */
export const LEVEL_STAT_MULT = 2.15;
/** Bônus aditivo de alcance por nível acima do 1. */
export const LEVEL_RANGE_BONUS = 0.4;
/** Fator multiplicativo de intervalo por nível. */
export const LEVEL_INTERVAL_MULT = 0.94;
/** Fator multiplicativo de velocidade de projétil por nível. */
export const LEVEL_PROJECTILE_MULT = 1.12;
/** Fator de redução de recarga por nível. */
export const LEVEL_RELOAD_MULT = 0.9;
/** Recarga mínima (s). */
export const MIN_RELOAD = 0.2;

/** Raio de colisão dos projéteis com criaturas. */
export const HIT_RADIUS = 0.85;

/** Altura do cano de disparo em relação à base da criatura. */
export const MUZZLE_HEIGHT = 1.05;

/** Retardo do segundo tiro da habilidade doubleShot (s). */
export const DOUBLE_SHOT_DELAY = 0.3;

export function scaledStats(base: BaseStats, level: MonsterLevel): BaseStats {
  const p = level - 1;
  return {
    ...base,
    hp: Math.round(base.hp * Math.pow(LEVEL_STAT_MULT, p)),
    damage: Math.round(base.damage * Math.pow(LEVEL_STAT_MULT, p)),
    range: base.range + LEVEL_RANGE_BONUS * p,
    interval: base.interval * Math.pow(LEVEL_INTERVAL_MULT, p),
    projectileSpeed: base.projectileSpeed * Math.pow(LEVEL_PROJECTILE_MULT, p),
    reload: Math.max(MIN_RELOAD, base.reload * Math.pow(LEVEL_RELOAD_MULT, p)),
    moveSpeed: base.moveSpeed,
    attackCount: base.attackCount,
    targeting: base.targeting,
    resist: base.resist,
    abilities: base.abilities,
    damageElement: base.damageElement,
    projectileColor: base.projectileColor,
  };
}

/**
 * Regras de composição do exército inimigo (gerado no início do combate).
 * O orçamento do inimigo = coeff × valor do time do jogador, onde o valor de
 * cada unidade é o custo de reposição pelas regras de fusão 2→1 (Nv.1=100,
 * Nv.2=200, Nv.3=400, Nv.4=800, Nv.5=1600; híbridos custam o dobro do nível).
 */
export interface TeamDifficultyParams {
  /** Multiplicador do valor do time do jogador. */
  coeff: number;
  /** Nível máximo das criaturas inimigas já nascendo "evoluídas". */
  maxLevel: MonsterLevel;
  /** Chance relativa de unidades híbridas na composição. */
  hybridChance: number;
  /** Contra-escolhe espécies conforme as fraquezas do time do jogador. */
  counterPick: boolean;
  /** Tanques na linha de frente, frágeis no fundo. */
  smartPlacement: boolean;
}

export const TEAM_RULES: Record<Difficulty, TeamDifficultyParams> = {
  easy: {
    coeff: 0.6,
    maxLevel: 2,
    hybridChance: 0.0,
    counterPick: false,
    smartPlacement: false,
  },
  normal: {
    coeff: 1.0,
    maxLevel: 3,
    hybridChance: 0.35,
    counterPick: true,
    smartPlacement: true,
  },
  hard: {
    coeff: 1.4,
    maxLevel: 4,
    hybridChance: 0.65,
    counterPick: true,
    smartPlacement: true,
  },
};

export type MatchConfigInput = Omit<MatchConfig, 'matchId' | 'seed' | 'generateEnemyTeam'> & {
  matchId?: string;
  seed?: number;
  generateEnemyTeam?: boolean;
};

let matchCounter = 0;

export function buildMatchConfig(input: MatchConfigInput): MatchConfig {
  matchCounter += 1;
  return {
    matchId: input.matchId ?? `m${Date.now().toString(36)}-${matchCounter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    seed: input.seed ?? (Date.now() % 2147483647),
    maxBattleTime: input.maxBattleTime ?? MAX_BATTLE_TIME,
    playerCoins: input.playerCoins,
    aiCoins: input.aiCoins,
    difficulty: input.difficulty,
    generateEnemyTeam: input.generateEnemyTeam ?? true,
  };
}
