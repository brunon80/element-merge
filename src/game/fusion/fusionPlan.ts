import { EVOLUTION_RECIPES, evolutionRecipeFor, recipeIngredientLevel } from '../../data/fusionRecipes';
import { getSpecies } from '../../data/monsters';
import { sellValue } from '../economy/economy';
import {
  MAX_LEVEL,
  PURE_MAX_LEVEL,
  SUMMON_COST,
  type MonsterLevel,
  type SpeciesId,
} from '../types';

/**
 * Prova de composabilidade — o caminho de fusões que produz uma criatura da
 * árvore a partir de sementes invocáveis (puros Nv.1), SEM burlar as regras:
 * cada operação do plano é uma fusão legal (2→1, mesmo nível, receita na
 * árvore ou vertical de puro). O "custo" do plano são as sementes:
 * 2^(nível-1) invocações de 100 moedas — o mesmo número que a economia usa
 * (sellValue), porque fusões não custam moedas e cada nível dobro consome
 * duas unidades do anterior.
 *
 * A IA usa este módulo para garantir exércitos honestos e os testes para
 * verificar que toda criatura da árvore é alcançável e paga o seu preço.
 */

export interface FusionPlanOp {
  a: SpeciesId;
  b: SpeciesId;
  /** nível (idêntico) em que A e B precisam estar */
  inLevel: MonsterLevel;
  result: SpeciesId;
  resultLevel: MonsterLevel;
  /** quantas vezes esta operação exata aparece no plano completo */
  count: number;
}

export interface FusionPlan {
  target: SpeciesId;
  targetLevel: number;
  /** operações distintas com contagem (árvore de requisitos expandida) */
  ops: FusionPlanOp[];
  /** invocações Nv.1 (100 moedas cada) que o plano consome */
  seeds: number;
  seedCost: number;
  ok: boolean;
  reason?: string;
}

interface UnitReq {
  species: SpeciesId;
  level: number;
}

/** Uma exigência (espécie no nível) expandida em operações + sementes. */
function expand(req: UnitReq): { ops: Map<string, FusionPlanOp>; seeds: number; error?: string } {
  const def = getSpecies(req.species);
  const out = new Map<string, FusionPlanOp>();
  if (req.level < def.levelMin || req.level > def.levelMax) {
    return { ops: out, seeds: 0, error: `${req.species} não existe no nível ${req.level}` };
  }
  if (def.levelMin === def.levelMax) {
    // criatura da árvore: precisa exatamente da sua receita no nível-1
    if (req.level > MAX_LEVEL) return { ops: out, seeds: 0, error: 'nível acima do máximo' };
    if (req.level === 1) return { ops: out, seeds: 0, error: 'espécie da árvore não pode existir no Nv.1' };
    const own = EVOLUTION_RECIPES.find((r) => r.result === req.species);
    if (!own) return { ops: out, seeds: 0, error: `${req.species} não tem receita na árvore` };
    const inLevel = recipeIngredientLevel(own);
    if (inLevel !== req.level - 1) {
      return { ops: out, seeds: 0, error: `receita de ${req.species} exige Nv.${inLevel}, não ${req.level - 1}` };
    }
    let totalSeeds = 0;
    for (const child of [own.a, own.b]) {
      const sub = expand({ species: child, level: inLevel });
      if (sub.error) return { ops: out, seeds: 0, error: sub.error };
      mergeOps(out, sub.ops);
      totalSeeds += sub.seeds;
    }
    addOp(out, { a: own.a, b: own.b, inLevel: inLevel as MonsterLevel, result: own.result, resultLevel: req.level as MonsterLevel, count: 1 });
    return { ops: out, seeds: totalSeeds };
  }

  // puro subindo de nível: cadeia vertical 2→1 (puros param no levelMax)
  if (req.level <= def.levelMin) return { ops: out, seeds: 1 };
  if (req.level > PURE_MAX_LEVEL) return { ops: out, seeds: 0, error: 'puro acima do Nv.5' };
  const left = expand({ species: req.species, level: req.level - 1 });
  const right = expand({ species: req.species, level: req.level - 1 });
  mergeOps(out, left.ops);
  mergeOps(out, right.ops);
  addOp(out, {
    a: req.species,
    b: req.species,
    inLevel: (req.level - 1) as MonsterLevel,
    result: req.species,
    resultLevel: req.level as MonsterLevel,
    count: 1,
  });
  return { ops: out, seeds: left.seeds + right.seeds };
}

function mergeOps(target: Map<string, FusionPlanOp>, from: Map<string, FusionPlanOp>): void {
  for (const op of from.values()) addOp(target, op);
}

function addOp(map: Map<string, FusionPlanOp>, op: FusionPlanOp): void {
  const key = `${op.a}+${op.b}@${op.inLevel}`;
  const prev = map.get(key);
  if (prev) prev.count += op.count;
  else map.set(key, { ...op });
}

/** Plano completo (com sementes e operações contadas) para produzir `target`. */
export function fusionPlanFor(target: SpeciesId): FusionPlan | null {
  const def = getSpecies(target);
  if (def.levelMin !== def.levelMax) return null; // puros não têm "plano de árvore"
  const res = expand({ species: target, level: def.levelMin });
  const plan: FusionPlan = {
    target,
    targetLevel: def.levelMin,
    ops: [...res.ops.values()],
    seeds: res.seeds,
    seedCost: res.seeds * SUMMON_COST,
    ok: !res.error,
    ...(res.error ? { reason: res.error } : {}),
  };
  return plan;
}

/**
 * Validador independente (usado em testes): confere que o plano é honesto —
 *  - toda operação é uma fusão válida pelas regras (receita na árvore ou
 *    vertical de puro no intervalo correto);
 *  - o alvo exige exatamente 2^(nível-1) sementes, e o custo bate com o
 *    sellValue da criatura final (IA não cria nada de graça).
 */
export function isHonestPlan(plan: FusionPlan): boolean {
  if (!plan.ok) return false;
  const targetDef = getSpecies(plan.target);
  if (plan.targetLevel !== targetDef.levelMin) return false;
  let sawTargetOp = false;
  for (const op of plan.ops) {
    if (op.resultLevel !== op.inLevel + 1) return false;
    if (op.count <= 0) return false;
    if (op.a === op.b) {
      const def = getSpecies(op.a);
      if (def.levelMin === def.levelMax) return false; // criatura da árvore não funde com a igual
      if (op.inLevel < def.levelMin || op.inLevel >= def.levelMax) return false;
    } else {
      const recipe = evolutionRecipeFor(op.a, op.b);
      if (!recipe || recipe.result !== op.result) return false;
      if (recipeIngredientLevel(recipe) !== op.inLevel) return false;
      if (op.inLevel >= MAX_LEVEL) return false;
    }
    if (op.result === plan.target) sawTargetOp = true;
  }
  if (!sawTargetOp) return false;
  if (plan.seeds !== 2 ** (plan.targetLevel - 1)) return false;
  return plan.seedCost === sellValue(plan.target, plan.targetLevel as MonsterLevel);
}

/** A espécie pode ser montada legalmente a partir de sementes (regra única da árvore)? */
export function isComposable(species: SpeciesId): boolean {
  const def = getSpecies(species);
  if (def.levelMin !== def.levelMax) return def.elements.length === 1;
  const plan = fusionPlanFor(species);
  return plan !== null && isHonestPlan(plan);
}
