import type { CombatUnit, StatusEffect, StatusType } from '../types';

/** Efeitos de status com duração correta e atualização por refresh (não empilham). */

export function maxSlowFactor(unit: CombatUnit): number {
  let f = 0;
  for (const s of unit.statuses) {
    if (s.type === 'slow' && s.remaining > 0) f = Math.max(f, s.slowFactor ?? 0);
  }
  return f;
}

export function effectiveInterval(unit: CombatUnit): number {
  return unit.interval * (1 + maxSlowFactor(unit));
}

export function applyStatus(
  unit: CombatUnit,
  type: StatusType,
  remaining: number,
  extra: Partial<Pick<StatusEffect, 'dps' | 'slowFactor'>>,
): void {
  const existing = unit.statuses.find((s) => s.type === type);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, remaining);
    if (type === 'burn') existing.dps = Math.max(existing.dps ?? 0, extra.dps ?? 0);
    if (type === 'slow')
      existing.slowFactor = Math.max(existing.slowFactor ?? 0, extra.slowFactor ?? 0);
  } else {
    unit.statuses.push({ type, remaining, ...extra });
  }
}

/** Avança os status; retorna dano de queimadura causado no frame. */
export function tickStatuses(unit: CombatUnit, dt: number): number {
  let burnDamage = 0;
  for (const s of unit.statuses) {
    if (s.type === 'burn' && s.remaining > 0) {
      burnDamage += (s.dps ?? 0) * Math.min(dt, s.remaining);
    }
    s.remaining -= dt;
  }
  if (unit.statuses.length > 0) {
    unit.statuses = unit.statuses.filter((s) => s.remaining > 0);
  }
  return burnDamage;
}
