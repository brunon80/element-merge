import {
  DEFEAT_REWARD,
  DRAW_REWARD,
  MAX_LEVEL,
  SUMMON_COST,
  VICTORY_REWARD,
  type MatchResult,
  type SpeciesId,
} from '../types';

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
 * Valor de VENDA (lixeira) — e a "moeda de valor" do jogo (orçamento da IA):
 * exatamente a soma do que a criatura custou para existir, seguindo a regra
 * 2→1 em TODOS os níveis da árvore (Nv.1=100, Nv.2=200, ..., Nv.10=51200).
 * Cada criatura da árvore vale duas do nível anterior — o prêmio do híbrido
 * antigo (Nv.1) sumiu porque os híbridos novos nascem no nível da árvore.
 * Vender devolve o investimento, nunca gera lucro.
 */
export function sellValue(species: SpeciesId, level: number): number {
  const safe = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  void species;
  return SUMMON_COST * 2 ** (safe - 1);
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
