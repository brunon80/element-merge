import { BOARD_COLS, type CombatUnit } from '../types';

/** Seleção automática de alvos conforme a regra de targeting da criatura. */

/** Distância (ao quadrado) entre duas unidades. */
function dist2(a: CombatUnit, b: CombatUnit): number {
  const dx = a.pos[0] - b.pos[0];
  const dy = a.pos[1] - b.pos[1];
  const dz = a.pos[2] - b.pos[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Profundidade do slot do inimigo (0 = linha frontal, 2 = linha de fundo). */
export function depthOf(unit: CombatUnit): number {
  return Math.floor(unit.tile / BOARD_COLS);
}

/**
 * Escolhe o alvo válido entre inimigos vivos.
 * Regras: closest (padrão), farthest (snipers), lowestHp (caçadores de
 * unidade ferida), backmost (prioriza linha de fundo inimiga).
 * Desempate sempre por menor distância → determinístico.
 *
 * NENHUMA RESTRIÇÃO DE ALCANCE NO ENGAJAMENTO. Todo mundo ataca todo mundo de
 * qualquer buraco do tabuleiro. O `range` do catálogo continua existindo como
 * estatística informativa (enciclopédia, inspetor) e decide o quão longe o
 * projétil é visto como "ao alcance" pelo jogador, mas não entra na escolha de
 * alvo nem bloqueia ataque nenhum. Dois motivos:
 *
 *  1. Softlock: com o tabuleiro fundo (linha de fundo × linha de fundo ≈ 27 de
 *     vão, enquanto os alcances vão de 8 a 13), duas unidades atrás ficariam
 *     paradas para sempre trocando desaforo e o relógio decidiria a partida.
 *  2. Justiceiça: a CPU planta no fundo. Se o alcance travasse o ataque, ela
 *     levaria uma vantagem de posicionamento que o jogador não tem como
 *     retribuir sem desmontar o próprio tabuleiro.
 *
 * Também não existe "preferência por alvo ao alcance": para um franco-atirador
 * (que caça o MAIS DISTANTE) essa preferência inverteria a regra — ele atiraria
 * no nariz do inimigo só porque o outro está a 20 de distância. A regra de
 * targeting da criatura manda sozinha.
 */
export function pickTarget(
  attacker: CombatUnit,
  enemies: CombatUnit[],
): CombatUnit | null {
  const candidates = enemies.filter((e) => e.alive && e !== attacker);
  if (candidates.length === 0) return null;

  let best: CombatUnit = candidates[0];
  let bestScore = scoreFor(attacker, best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const score = scoreFor(attacker, c);
    if (
      score > bestScore ||
      (score === bestScore && dist2(attacker, c) < dist2(attacker, best))
    ) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function scoreFor(attacker: CombatUnit, target: CombatUnit): number {
  switch (attacker.targeting) {
    case 'closest':
      return -dist2(attacker, target);
    case 'farthest':
      return dist2(attacker, target);
    case 'lowestHp':
      // Prioriza percentual de vida; peso grande para dominar distância.
      return -(target.hp / Math.max(1, target.maxHp)) * 1000 - dist2(attacker, target);
    case 'backmost':
      return depthOf(target) * 100 - dist2(attacker, target);
  }
}
