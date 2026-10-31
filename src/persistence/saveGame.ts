import { DEFAULT_STARTING_COINS } from '../data/balance';
import { ALL_SPECIES_IDS } from '../data/monsters';
import type { Difficulty, MatchSummary, MonsterLevel, SpeciesId } from '../game/types';

export const SAVE_KEY = 'elemental-merge-save-v1';
/** v2: time do jogador persistido entre partidas (retainedRoster). */
export const SAVE_VERSION = 2;

/** Unidade sobrevivente que volta automaticamente para a próxima partida. */
export interface RetainedUnit {
  species: SpeciesId;
  level: MonsterLevel;
}

export interface SettingsData {
  difficulty: Difficulty;
  /** Parâmetro configurável do saldo inicial. */
  startingCoins: number;
}

export interface StatsData {
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
}

export interface SaveData {
  version: number;
  coins: number;
  discovered: SpeciesId[];
  /** Time do jogador que sobrevive e volta para a próxima partida. */
  retainedRoster: RetainedUnit[];
  settings: SettingsData;
  stats: StatsData;
  /** Partidas cuja recompensa já foi liberada (anti-duplicação). */
  processedMatchIds: string[];
  lastSummary: MatchSummary | null;
}

export const PURE_START: SpeciesId[] = ['ignis', 'nereia', 'golem', 'zephyr'];

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: DEFAULT_STARTING_COINS,
    discovered: [...PURE_START],
    retainedRoster: [],
    settings: { difficulty: 'normal', startingCoins: DEFAULT_STARTING_COINS },
    stats: { wins: 0, losses: 0, draws: 0, matchesPlayed: 0 },
    processedMatchIds: [],
    lastSummary: null,
  };
}

function safeLocalStorage(): Storage | null {
  try {
    const ls = globalThis.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** Lê o save; migra/corrige campos inválidos preservando o saldo. */
export function loadSave(): SaveData {
  const ls = safeLocalStorage();
  if (!ls) return defaultSave();
  const raw = ls.getItem(SAVE_KEY);
  if (!raw) return defaultSave();
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    const coins =
      typeof parsed.coins === 'number' &&
      Number.isFinite(parsed.coins) &&
      parsed.coins >= 0
        ? Math.floor(parsed.coins)
        : base.coins;
    const discovered = Array.isArray(parsed.discovered)
      ? [...new Set([...base.discovered, ...parsed.discovered])]
      : base.discovered;
    const difficulty: Difficulty =
      parsed.settings?.difficulty === 'easy' ||
      parsed.settings?.difficulty === 'normal' ||
      parsed.settings?.difficulty === 'hard'
        ? parsed.settings.difficulty
        : base.settings.difficulty;
    const startingCoins =
      typeof parsed.settings?.startingCoins === 'number' &&
      parsed.settings.startingCoins >= 0
        ? Math.floor(parsed.settings.startingCoins)
        : base.settings.startingCoins;
    const stats: StatsData = {
      wins: num(parsed.stats?.wins),
      losses: num(parsed.stats?.losses),
      draws: num(parsed.stats?.draws),
      matchesPlayed: num(parsed.stats?.matchesPlayed),
    };
    const processedMatchIds = Array.isArray(parsed.processedMatchIds)
      ? parsed.processedMatchIds.filter((x): x is string => typeof x === 'string').slice(-50)
      : [];
    const known = new Set<string>(ALL_SPECIES_IDS);
    const retainedRoster: RetainedUnit[] = Array.isArray(parsed.retainedRoster)
      ? parsed.retainedRoster
          .filter(
            (r): r is RetainedUnit =>
              !!r &&
              typeof r.species === 'string' &&
              known.has(r.species) &&
              Number.isInteger(r.level) &&
              r.level >= 1 &&
              r.level <= 5,
          )
          .map((r) => ({ species: r.species, level: r.level as MonsterLevel }))
          .slice(0, 12)
      : [];
    return {
      version: SAVE_VERSION,
      coins,
      discovered,
      retainedRoster,
      settings: { difficulty, startingCoins },
      stats,
      processedMatchIds,
      lastSummary: parsed.lastSummary ?? null,
    };
  } catch {
    return defaultSave();
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export function persistSave(data: SaveData): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* armazenamento indisponível: o jogo segue em memória */
  }
}

export function clearSave(): void {
  const ls = safeLocalStorage();
  ls?.removeItem(SAVE_KEY);
}
