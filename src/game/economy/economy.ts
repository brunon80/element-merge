import {
  DEFEAT_REWARD,
  DRAW_REWARD,
  SUMMON_COST,
  VICTORY_REWARD,
  type MatchResult,
  type SpeciesId,
} from '../types';
import { getSpecies } from '../../data/monsters';

/**
 * Sistema econômico — regras fixas do documento de design:
 *   - cada invocação custa exatamente 100 moedas (qualquer elemento/nível);
 *   - vitória concede +100, derrota +50, empate +50 (tratamento pré-definido);
 *   - fusões são gratuitas;
 *   - cada partida (matchId) concede recompensa no máximo uma vez;
 *   - saldo nunca fica negativo.
 */

export function canAfford(coins: number): boolean {
  return coins >= SUMMON_COST;
}

/**
 * Valor de VENDA (lixeira) de uma criatura: exatamente a soma do que ela
 * custou para existir, seguindo as fusões 2→1 — Nv.1 = 100, Nv.2 = 200,
 * Nv.3 = 400, Nv.4 = 800, Nv.5 = 1600; híbridos valem o dobro do nível.
 * Vender devolve o investimento, nunca gera lucro.
 */
export function sellValue(species: SpeciesId, level: number): number {
  const base = SUMMON_COST * 2 ** (Math.min(5, Math.max(1, level)) - 1);
  return getSpecies(species).elements.length > 1 ? base * 2 : base;
}

export function rewardFor(result: MatchResult): number {
  switch (result) {
    case 'victory':
      return VICTORY_REWARD;
    case 'defeat':
      return DEFEAT_REWARD;
    case 'draw':
      return DRAW_REWARD;
  }
}

/** Resultado de uma tentativa de pagamento. */
export type SpendResult =
  | { ok: true; coins: number }
  | { ok: false; reason: 'NO_COINS'; coins: number };

/**
 * Desconta o custo de invocação. Falha (sem desconto) se não houver saldo,
 * garantindo que o saldo nunca caia abaixo de zero e que invocações
 * bloqueadas não cobrem nada.
 */
export function trySpendSummonCost(coins: number): SpendResult {
  if (!canAfford(coins)) return { ok: false, reason: 'NO_COINS', coins };
  return { ok: true, coins: coins - SUMMON_COST };
}

/** Portador de IDs de partidas já recompensadas (proteção contra duplicação). */
export interface RewardLedger {
  processedMatchIds: string[];
  coins: number;
}

/**
 * Concede a recompensa de forma idempotente por matchId.
 * Retorna true se a recompensa foi aplicada; false se aquela partida
 * já foi recompensada anteriormente (recarregar a tela não duplica).
 */
export function grantMatchReward(
  ledger: RewardLedger,
  matchId: string,
  result: MatchResult,
): boolean {
  if (!matchId) return false;
  if (ledger.processedMatchIds.includes(matchId)) return false;
  ledger.processedMatchIds.push(matchId);
  // Mantém o histórico pequeno.
  if (ledger.processedMatchIds.length > 50) {
    ledger.processedMatchIds.splice(0, ledger.processedMatchIds.length - 50);
  }
  ledger.coins += rewardFor(result);
  return true;
}
