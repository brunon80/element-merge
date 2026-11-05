/**
 * MODO DE DESEMPENHO (novidade 05/nov/2026 — cobrança do usuário: "em
 * dispositivos com bateria a drenagem está muito rápida").
 *
 * Diagnóstico medido no pipeline (ver HANDOFF): o jogo inteiro roda a 60 fps
 * o tempo todo com dpr 2 (4× os pixels), shadow map 2048² recalculada em todo
 * frame até no menu, bloom via compositor (RT HalfFloat MSAA + ~6 passes
 * fullscreen) e dezenas de loops useFrame — tudo isso acorda GPU e CPU sem
 * pausa. O modo econômico corta cada um desses freios pela metade nos
 * aparelhos de bolso; no desktop (modo cheio) o jogo continua idêntico.
 *
 * Este módulo é a ÚNICA fonte da detecção: funções puras (UA + toque +
 * pointer) para poderem ser testadas sem navegador.
 */

export type PerfModeChoice = 'auto' | 'full' | 'eco';

export const PERF_MODE_CHOICES: PerfModeChoice[] = ['auto', 'full', 'eco'];

/** Celular/tablet de bolso? UA de bolso entrega na hora; iPadOS 13+ se passa
 *  por "Mac" no Safari — mas não esconde os múltiplos pontos de toque nem o
 *  pointer grosseiro. Desktop com mouse: touchPoints 0 → modo cheio. */
export function isBatteryHandheld(
  ua: string,
  touchPoints: number,
  coarsePointer: boolean,
): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  return touchPoints > 1 && coarsePointer;
}

export function handheldNow(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  return isBatteryHandheld(navigator.userAgent, navigator.maxTouchPoints ?? 0, coarse);
}

/** O que o modo escolhido significa AQUI (no aparelho atual). */
export function ecoFor(mode: PerfModeChoice, handheld: boolean): boolean {
  if (mode === 'eco') return true;
  if (mode === 'full') return false;
  return handheld; // 'auto'
}
