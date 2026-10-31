import { TEAM_RULES, type TeamDifficultyParams } from '../../data/balance';
import {
  PURE_SPECIES_IDS,
  TREE_SPECIES_IDS,
  getSpecies,
} from '../../data/monsters';
import { damageMultiplier } from '../combat/damage';
import { sellValue } from '../economy/economy';
import { isComposable } from '../fusion/fusionPlan';
import { BOARD_COLS, SUMMON_COST, TILES_PER_SIDE } from '../types';
import type { Difficulty, MonsterLevel, SpeciesId, TileIndex } from '../types';

/**
 * Composição do exército inimigo — módulo puro e determinístico (rng semeado).
 * O exército é calculado no momento do "Iniciar Combate": o orçamento do
 * inimigo é `coeff × valor do time do jogador`, e o valor de cada unidade é
 * exatamente o custo de reposição pelas regras 2→1 em toda a árvore:
 *   Nv.1=100, Nv.2=200, ..., Nv.10=51200.
 * A IA NÃO ganha moedas nem unidades de graça: uma criatura da árvore custa,
 * no orçamento, as sementes que ela consome para existir (plan honesto).
 * A dificuldade define tamanho, nível máximo das puras, acesso à árvore
 * elemental (treeMaxLevel) e contra-escolha — qualidade de decisão, não recursos.
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

/** Espécies duras de roer: vão para a linha de frente. */
export const TANKY_SPECIES = new Set<SpeciesId>([
  'golem',
  'madeira',
  'magma',
  'obsidiana',
  'pantano',
  'geodo',
  'colosso',
]);

/** Custo de reposição de uma unidade pelas regras 2→1 (moedas).
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

/** Distribuição de níveis preferida por dificuldade (pesos) — apenas puras. */
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

/** Escolhe a melhor espécie dentro do pool (contra-escolha opcional). */
function pickFromPool(
  pool: readonly SpeciesId[],
  players: readonly UnitSpec[],
  rules: TeamDifficultyParams,
  difficulty: Difficulty,
  rand: () => number,
  countsSeen: Map<SpeciesId, number>,
): SpeciesId {
  if (pool.length === 0) return PURE_SPECIES_IDS[0];
  if (!rules.counterPick) {
    return pool[Math.floor(rand() * pool.length)] ?? pool[0];
  }
  let best = pool[0];
  let bestScore = -Infinity;
  for (const s of pool) {
    let score = 1.5 * offenseScore(s, players);
    const seen = countsSeen.get(s) ?? 0;
    // Puras ímpares na mesa permitem fusões verticais depois; árvore não empilha.
    if (getSpecies(s).levelMin !== getSpecies(s).levelMax && seen % 2 === 1) score += 0.4;
    score += (rand() - 0.5) * (difficulty === 'hard' ? 0.08 : 0.35);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Criaturas da árvore elegíveis para o orçamento restante nesta dificuldade. */
function treeCandidates(rules: TeamDifficultyParams, remaining: number): SpeciesId[] {
  if (rules.treeMaxLevel <= 0 || rules.hybridChance <= 0) return [];
  const out: SpeciesId[] = [];
  for (const id of TREE_SPECIES_IDS) {
    const def = getSpecies(id);
    if (def.levelMin > rules.treeMaxLevel) continue;
    // A IA só entra na árvore por caminhos que a própria árvore permite
    // (prova de composabilidade 2→1 desde sementes).
    if (!isComposable(id)) continue;
    if (unitCoinCost(id, def.levelMin as MonsterLevel) > remaining) continue;
    out.push(id);
  }
  return out;
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
      species: SpeciesId;
      level: MonsterLevel;
      weight: number;
    }
    const candidates: Candidate[] = [];

    // 1) Árvore elemental: chance por slot de montar uma criatura Nv.6+
    //    (o orçamento paga as sementes; nunca acima de treeMaxLevel).
    const tree = treeCandidates(rules, remaining);
    if (tree.length > 0) {
      for (const id of tree) {
        const level = getSpecies(id).levelMin as MonsterLevel;
        candidates.push({
          species: id,
          level,
          weight: rules.hybridChance * 0.35 * (1 + offenseScore(id, input.playerUnits)),
        });
      }
    }

    // 2) Puras com a distribuição de níveis da dificuldade.
    for (const [lv, w] of LEVEL_WEIGHTS[input.difficulty]) {
      if (lv > rules.maxLevel) continue;
      const level = lv as MonsterLevel;
      const cost = unitCoinCost(PURE_SPECIES_IDS[0], level);
      if (cost > remaining) continue;
      const pool = PURE_SPECIES_IDS;
      const rep = pool[Math.floor(rand() * pool.length)] ?? pool[0];
      candidates.push({ species: rep, level, weight: w * (1 - rules.hybridChance) });
    }

    if (candidates.length === 0) {
      // Piso: se ainda nenhum inimigo foi montado e há saldo, ao menos
      // uma criatura Nv.1 (garante combate real mesmo com times pequenos).
      if (units.length === 0 && remaining >= SUMMON_COST) {
        candidates.push({ species: PURE_SPECIES_IDS[0], level: 1, weight: 1 });
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

    // Contra-escolha: troca pela melhor espécie do mesmo tipo (pura ↔ pura,
    // árvore ↔ árvore) quando a dificuldade sabe ler o time do jogador.
    let species = chosen.species;
    let level = chosen.level;
    const chosenIsTree =
      getSpecies(species).levelMin === getSpecies(species).levelMax;
    if (rules.counterPick) {
      const pool = chosenIsTree
        ? treeCandidates(rules, remaining)
        : [...PURE_SPECIES_IDS];
      const swap = pickFromPool(pool, input.playerUnits, rules, input.difficulty, rand, countsSeen);
      const swapDef = getSpecies(swap);
      const swapLevel = (
        swapDef.levelMin === swapDef.levelMax
          ? swapDef.levelMin
          : Math.min(level, swapDef.levelMax)
      ) as MonsterLevel;
      if (
        (swapDef.levelMin === swapDef.levelMax) === chosenIsTree &&
        unitCoinCost(swap, swapLevel) <= remaining
      ) {
        species = swap;
        level = swapLevel;
      }
    }

    const tile = pickTile(species, tiles, rules.smartPlacement, rand);
    if (tile === null) break;

    const cost = unitCoinCost(species, level);
    if (cost > remaining) break;

    units.push({ species, level, tile });
    countsSeen.set(species, (countsSeen.get(species) ?? 0) + 1);
    tiles.splice(tiles.indexOf(tile), 1);
    remaining -= cost;
  }

  return { units, budget, spent: budget - remaining };
}
