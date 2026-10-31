import { TEAM_RULES, type TeamDifficultyParams } from '../../data/balance';
import { getSpecies, HYBRID_SPECIES_IDS, PURE_SPECIES_IDS } from '../../data/monsters';
import { damageMultiplier } from '../combat/damage';
import { sellValue } from '../economy/economy';
import { BOARD_COLS, SUMMON_COST, TILES_PER_SIDE } from '../types';
import type { Difficulty, MonsterLevel, SpeciesId, TileIndex } from '../types';

/**
 * Composição do exército inimigo — módulo puro e determinístico (rng semeado).
 * O exército é calculado no momento do "Iniciar Combate": o orçamento do
 * inimigo é `coeff × valor do time do jogador`, e o valor de cada unidade é
 * exatamente o custo de reposição pelas regras de fusão (2→1 em todo nível):
 *   Nv.1=100, Nv.2=200, Nv.3=400, Nv.4=800, Nv.5=1600.
 * Híbridos valem dois puros do mesmo nível (Nv.1 híbrido = 200).
 * A dificuldade define tamanho, nível máximo (inimigos já nascem evoluídos),
 * híbridos e contra-escolha.
 */

export interface UnitSpec {
  species: SpeciesId;
  level: MonsterLevel;
}

export interface PlannedUnit extends UnitSpec {
  tile: TileIndex;
}

export interface TeamPlan {
  units: PlannedUnit[];
  /** Orçamento concedido ao inimigo (arredondado a múltiplos de 100). */
  budget: number;
  /** Quanto do orçamento foi efetivamente gasto na composição. */
  spent: number;
}

export interface TeamPlanInput {
  playerUnits: readonly UnitSpec[];
  difficulty: Difficulty;
  /** Tiles livres do lado inimigo. */
  freeTiles: readonly TileIndex[];
  rand: () => number;
}

export const TANKY_SPECIES = new Set<SpeciesId>([
  'golem',
  'verdan',
  'vulcane',
  'duna',
  'vaporis',
]);

/** Custo de reposição de uma unidade pelas regras de fusão 2→1 (moedas).
 *  É o mesmo número que a lixeira devolve ao vender (economia.sellValue). */
export function unitCoinCost(species: SpeciesId, level: MonsterLevel): number {
  return sellValue(species, level);
}

/** Valor total de um time (soma dos custos de reposição). */
export function teamValue(units: readonly UnitSpec[]): number {
  let sum = 0;
  for (const u of units) sum += unitCoinCost(u.species, u.level);
  return sum;
}

/** Distribuição de níveis preferida por dificuldade (pesos). */
const LEVEL_WEIGHTS: Record<Difficulty, ReadonlyArray<readonly [number, number]>> = {
  easy: [
    [1, 0.7],
    [2, 0.3],
  ],
  normal: [
    [1, 0.25],
    [2, 0.4],
    [3, 0.35],
  ],
  hard: [
    [2, 0.3],
    [3, 0.45],
    [4, 0.25],
  ],
};

/** Eficácia média da espécie contra as fraquezas do time do jogador. */
function offenseScore(species: SpeciesId, players: readonly UnitSpec[]): number {
  if (players.length === 0) return 0;
  const dmgEl = getSpecies(species).base.damageElement;
  let sum = 0;
  for (const p of players) sum += damageMultiplier(getSpecies(p.species).base.resist, dmgEl);
  return sum / players.length;
}

function pickSpecies(
  hybrid: boolean,
  players: readonly UnitSpec[],
  rules: TeamDifficultyParams,
  difficulty: Difficulty,
  rand: () => number,
  countsSeen: Map<SpeciesId, number>,
): SpeciesId {
  const pool: readonly SpeciesId[] = hybrid ? HYBRID_SPECIES_IDS : PURE_SPECIES_IDS;
  if (!rules.counterPick) {
    return pool[Math.floor(rand() * pool.length)] ?? pool[0];
  }
  let best = pool[0];
  let bestScore = -Infinity;
  for (const s of pool) {
    let score = 1.5 * offenseScore(s, players);
    const seen = countsSeen.get(s) ?? 0;
    score += seen % 2 === 1 ? 0.4 : 0; // quantidades ímpares permitem fusões verticais
    score += (rand() - 0.5) * (difficulty === 'hard' ? 0.08 : 0.35);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Tanques nas fileiras da frente; frágeis no fundo; fácil escolhe aleatório. */
function pickTile(
  species: SpeciesId,
  freeTiles: TileIndex[],
  smartPlacement: boolean,
  rand: () => number,
): TileIndex | null {
  if (freeTiles.length === 0) return null;
  if (!smartPlacement) {
    return freeTiles[Math.floor(rand() * freeTiles.length)] ?? null;
  }
  const free = new Set(freeTiles);
  const rowOrder = TANKY_SPECIES.has(species) ? [0, 1, 2] : [2, 1, 0];
  for (const row of rowOrder) {
    const options: TileIndex[] = [];
    for (let col = 0; col < BOARD_COLS; col++) {
      const t = row * BOARD_COLS + col;
      if (free.has(t)) options.push(t);
    }
    if (options.length > 0) return options[Math.floor(rand() * options.length)] ?? null;
  }
  return null;
}

export function composeEnemyTeam(input: TeamPlanInput): TeamPlan {
  const rules = TEAM_RULES[input.difficulty];
  const rand = input.rand;
  if (input.playerUnits.length === 0 || input.freeTiles.length === 0) {
    return { units: [], budget: 0, spent: 0 };
  }
  const value = teamValue(input.playerUnits);
  const budget = Math.max(
    SUMMON_COST,
    Math.round((rules.coeff * value) / SUMMON_COST) * SUMMON_COST,
  );

  const tiles: TileIndex[] = [...input.freeTiles];
  const units: PlannedUnit[] = [];
  const countsSeen = new Map<SpeciesId, number>();
  const maxUnits = Math.min(TILES_PER_SIDE, input.freeTiles.length);
  let remaining = budget;

  while (units.length < maxUnits) {
    interface Candidate {
      level: MonsterLevel;
      hybrid: boolean;
      weight: number;
    }
    const candidates: Candidate[] = [];
    for (const [lv, w] of LEVEL_WEIGHTS[input.difficulty]) {
      if (lv > rules.maxLevel) continue;
      const level = lv as MonsterLevel;
      const pureCost = unitCoinCost(PURE_SPECIES_IDS[0], level);
      if (pureCost <= remaining) candidates.push({ level, hybrid: false, weight: w });
      const hybridCost = pureCost * 2;
      if (rules.hybridChance > 0 && hybridCost <= remaining) {
        candidates.push({ level, hybrid: true, weight: w * rules.hybridChance });
      }
    }
    if (candidates.length === 0) {
      // Piso: se ainda nenhum inimigo foi montado e há saldo, ao menos
      // uma criatura Nv.1 (garante combate real mesmo com times pequenos).
      if (units.length === 0 && remaining >= SUMMON_COST) {
        candidates.push({ level: 1, hybrid: false, weight: 1 });
      } else {
        break;
      }
    }

    const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
    let point = rand() * totalWeight;
    let chosen = candidates[0];
    for (const c of candidates) {
      point -= c.weight;
      if (point <= 0) {
        chosen = c;
        break;
      }
    }

    const species = pickSpecies(chosen.hybrid, input.playerUnits, rules, input.difficulty, rand, countsSeen);
    const tile = pickTile(species, tiles, rules.smartPlacement, rand);
    if (tile === null) break;

    units.push({ species, level: chosen.level, tile });
    countsSeen.set(species, (countsSeen.get(species) ?? 0) + 1);
    tiles.splice(tiles.indexOf(tile), 1);
    remaining -= unitCoinCost(species, chosen.level);
  }

  return { units, budget, spent: budget - remaining };
}
