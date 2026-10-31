import { DEFAULT_STARTING_COINS } from '../data/balance';
import { ALL_SPECIES_IDS, getSpecies, speciesAllowsLevel } from '../data/monsters';
import type { Difficulty, MatchSummary, MonsterLevel, SpeciesId } from '../game/types';

export const SAVE_KEY = 'elemental-merge-save-v1';
/** v2: time do jogador persistido entre partidas (retainedRoster).
 *  v3: árvore elemental (Nv.6–10) — híbridos antigos viram espécies da árvore. */
export const SAVE_VERSION = 3;

/** Híbridos removidos (Nv.1 por par de puros) → espécie equivalente da nova árvore. */
const LEGACY_HYBRID_MAP: Record<string, SpeciesId> = {
  vulcane: 'magma', // fogo + terra
  tempest: 'gelo', // água + ar
  verdan: 'madeira', // água + terra
  solaris: 'raio', // fogo + ar
  vaporis: 'vapor', // fogo + água
  duna: 'areia', // terra + ar
};

/** Unidade sobrevivente que volta automaticamente para a próxima partida. */
export interface RetainedUnit {
  species: SpeciesId;
  level: MonsterLevel;
}

export interface SettingsData {
  difficulty: Difficulty;
  /** Parâmetro configurável do saldo inicial. */
  startingCoins: number;
  /** Depuração: permite criar qualquer criatura do bestiário direto na arena. */
  debugMode: boolean;
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
    settings: {
      difficulty: 'normal',
      startingCoins: DEFAULT_STARTING_COINS,
      debugMode: false,
    },
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
    const parsedVersion = num(parsed.version) || 1;
    const coins0 =
      typeof parsed.coins === 'number' &&
      Number.isFinite(parsed.coins) &&
      parsed.coins >= 0
        ? Math.floor(parsed.coins)
        : base.coins;
    let coins = coins0;

    // Filtro de espécies válidas na v3 (espécies antigas removidas).
    const known = new Set<string>(ALL_SPECIES_IDS);

    // Migração v2 → v3: híbridos Nv.1 por par de elementos não existem mais.
    // Descobertas viram a espécie equivalente da árvore (mesmo par de
    // elementos); unidades retidas antigas saem do tabuleiro e o saldo recebe
    // de volta o que valiam (sellValue antigo = 100·2^(Nv-1)·2).
    const migrateId = (id: string): SpeciesId | null =>
      LEGACY_HYBRID_MAP[id] ?? (known.has(id) ? (id as SpeciesId) : null);

    const rawDiscovered: string[] = Array.isArray(parsed.discovered)
      ? (parsed.discovered as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const migratedDiscovered: SpeciesId[] = [];
    for (const id of rawDiscovered) {
      const next = migrateId(id);
      if (next) migratedDiscovered.push(next);
    }
    const discovered = [...new Set([...base.discovered, ...migratedDiscovered])];

    const rawRoster: RetainedUnit[] = Array.isArray(parsed.retainedRoster)
      ? parsed.retainedRoster.filter(
          (r): r is RetainedUnit =>
            !!r && typeof r.species === 'string' && Number.isInteger(r.level),
        )
      : [];

    let refund = 0;
    const retainedRoster: RetainedUnit[] = [];
    for (const r of rawRoster.slice(0, 12)) {
      const next = migrateId(r.species);
      if (!next) continue; // espécie removida: some (o reembolso é dado só na migração v2→v3)
      const level = r.level as MonsterLevel;
      const legacy = LEGACY_HYBRID_MAP[r.species];
      if (parsedVersion < 3 && legacy) {
        // unidade híbrida antiga: sai do time e devolve o valor antigo
        // (híbrido Nv.k valia 2× o puro do nível: 100·2^(k-1)·2).
        refund += 100 * 2 ** (Math.min(5, Math.max(1, level)) - 1) * 2;
        continue;
      }
      // Níveis fora da janela da espécie (puro 1..5, árvore nível fixo) são corrigidos
      // para o nível válido mais próximo; se a espécie é da árvore, sempre o nível fixo.
      const def = getSpecies(next);
      if (!speciesAllowsLevel(next, level)) {
        if (def.levelMin === def.levelMax) {
          retainedRoster.push({ species: next, level: def.levelMin as MonsterLevel });
        } else {
          const fixed = Math.min(def.levelMax, Math.max(def.levelMin, level)) as MonsterLevel;
          retainedRoster.push({ species: next, level: fixed });
        }
      } else {
        retainedRoster.push({ species: next, level });
      }
    }
    coins = coins0 + refund;
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
    return {
      version: SAVE_VERSION,
      coins,
      discovered,
      retainedRoster,
      settings: { difficulty, startingCoins, debugMode: !!parsed.settings?.debugMode },
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
