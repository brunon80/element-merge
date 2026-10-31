import type { Difficulty, MatchResult } from '../game/types';
import type { AbilityDef, TargetingRule } from '../game/types';

export const TARGETING_LABEL: Record<TargetingRule, string> = {
  closest: 'Ataca o inimigo mais próximo',
  lowestHp: 'Caça o inimigo mais ferido',
  farthest: 'Prioriza o inimigo mais distante',
  backmost: 'Foca as linhas de fundo inimigas',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil',
};

export const RESULT_LABEL: Record<MatchResult, string> = {
  victory: 'Vitória!',
  defeat: 'Derrota',
  draw: 'Empate',
};

export function fmtTime(seconds: number): string {
  const v = Math.max(0, Math.floor(seconds));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

export function abilityText(a: AbilityDef): string {
  switch (a.kind) {
    case 'burn':
      return `Queimadura — ${Math.round((a.chance ?? 0) * 100)}% de chance de incendiar por ${a.duration ?? 3}s`;
    case 'slow':
      return `Lentidão — ${Math.round((a.chance ?? 0) * 100)}% de chance de desacelerar ataques por ${a.duration ?? 3}s`;
    case 'splash':
      return `Explosão em área — raio ${a.radius ?? 1.5}, dano secundário ${Math.round((a.factor ?? 0.5) * 100)}%`;
    case 'pierce':
      return `Perfuração — o projétil atravessa até ${a.factor ?? 2} inimigos`;
    case 'chain':
      return `Relâmpago em cadeia — respinga para outro inimigo com ${Math.round((a.factor ?? 0.5) * 100)}% do dano`;
    case 'doubleShot':
      return `Tiro duplo — segunda rajada com ${Math.round((a.factor ?? 0.6) * 100)}% do dano`;
    case 'swift':
      return 'Cadência veloz — ataque rápido e projéteis velozes';
    case 'heavy':
      return 'Golpe pesado — dano alto, cadência baixa';
  }
}
