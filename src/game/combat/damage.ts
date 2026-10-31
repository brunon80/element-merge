import type { ElementId, ResistTable } from '../types';

/** Cálculo de dano com resistências elementais (fraquezas = resistência negativa). */
export function resistanceFor(resist: ResistTable, element: ElementId): number {
  return resist[element] ?? 0;
}

/** Multiplicador resultante: 1 - resistência (pode superar 1 em fraquezas). */
export function damageMultiplier(resist: ResistTable, element: ElementId): number {
  return Math.max(0.05, 1 - resistanceFor(resist, element));
}

export function computeDamage(
  attackerDamage: number,
  targetResist: ResistTable,
  damageElement: ElementId,
): number {
  return attackerDamage * damageMultiplier(targetResist, damageElement);
}
