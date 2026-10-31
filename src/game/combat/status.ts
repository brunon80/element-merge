import type {
  CombatUnit,
  ElementId,
  StatusEffect,
  StatusType,
} from '../types';

/** Efeitos de status com duração correta e atualização por refresh (não empilham). */

export interface StatusTickDamage {
  element: ElementId;
  amount: number;
}

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
  extra: Partial<Pick<StatusEffect, 'dps' | 'slowFactor' | 'element'>>,
): void {
  const existing = unit.statuses.find((s) => s.type === type);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, remaining);
    if (type === 'burn' || type === 'poison')
      existing.dps = Math.max(existing.dps ?? 0, extra.dps ?? 0);
    if (type === 'slow')
      existing.slowFactor = Math.max(existing.slowFactor ?? 0, extra.slowFactor ?? 0);
  } else {
    unit.statuses.push({ type, remaining, ...extra });
  }
}

/**
 * Avança os status; retorna o dano de queimadura/veneno causado no frame,
 * agrupado por elemento (para passar pelas resistências certas).
 */
export function tickStatuses(unit: CombatUnit, dt: number): StatusTickDamage[] {
  const out = new Map<ElementId, number>();
  for (const s of unit.statuses) {
    if ((s.type === 'burn' || s.type === 'poison') && s.remaining > 0) {
      const element = s.element ?? (s.type === 'burn' ? 'fire' : 'earth');
      out.set(element, (out.get(element) ?? 0) + (s.dps ?? 0) * Math.min(dt, s.remaining));
    }
    s.remaining -= dt;
  }
  if (unit.statuses.length > 0) {
    unit.statuses = unit.statuses.filter((s) => s.remaining > 0);
  }
  return [...out.entries()].map(([element, amount]) => ({ element, amount }));
}
