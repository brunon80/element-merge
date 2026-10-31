import { MUZZLE_HEIGHT } from './balance';
import type { SpeciesDef } from '../game/types';

/**
 * Formas por nível — dados de evolução VISUAL que o motor também usa.
 *
 * Cada fusão de duas unidades iguais do mesmo elemento cresce a criatura:
 * a espécie declara a altura do topo (`formTops`) e o nome (`formNames`) de
 * cada forma. A camada 3D usa as mesmas alturas para enquadrar a criatura e
 * o motor usa para calcular de onde ela cospe o projétil e em que altura do
 * alvo ele acerta — assim um dragão Nv5 dispara do pescoço e não do joelho.
 */

/** Topo das criaturas que ainda não têm formas por nível (rig padrão de peças). */
export const BASE_FORM_TOP = 1.93;

/** Centro do corpo das criaturas sem formas por nível (valor histórico do motor). */
export const AIM_FALLBACK_Y = 0.6;

/** índice da forma no catálogo (níveis fora de 1..5 são nivelados) */
const idx = (level: number): number => Math.min(4, Math.max(0, Math.round(level) - 1));

/** A espécie muda de silhueta ao fundir unidades do mesmo elemento? */
export function hasForms(def: SpeciesDef): boolean {
  return Boolean(def.formTops && def.formTops.length > 1);
}

/** Altura do topo da criatura no nível dado (unidades de mundo). */
export function formTop(def: SpeciesDef, level: number): number {
  return def.formTops?.[idx(level)] ?? BASE_FORM_TOP;
}

/** Nome da forma no nível dado (bestiário/inspetor). */
export function formName(def: SpeciesDef, level: number): string | undefined {
  return def.formNames?.[idx(level)];
}

/**
 * Altura, acima da base da unidade, de onde ela dispara. Cresce com a forma
 * (espécies sem progressão ficam exatamente em MUZZLE_HEIGHT como antes).
 */
export function formMuzzleY(def: SpeciesDef, level: number): number {
  return MUZZLE_HEIGHT + (formTop(def, level) - BASE_FORM_TOP) * 0.45;
}

/**
 * Altura, acima da base, do centro do corpo da forma atual — o ponto visado
 * pelos projéteis (Nv1 ≈ o valor histórico de 0,6; dragão Nv5 ≈ 1,6).
 */
export function formAimY(def: SpeciesDef, level: number): number {
  return AIM_FALLBACK_Y + (formTop(def, level) - BASE_FORM_TOP) * 0.4;
}
