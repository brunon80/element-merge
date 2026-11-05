import { useEffect } from 'react';
import { getEngine, useGameStore } from '../store/gameStore';

/**
 * Loop de simulação desacoplado do React: avança o motor em passo
 * variável limitado e sincroniza o espelho da UI ~8x/s (dados discretos;
 * posições/projéteis vivem no mundo do motor lido pela cena).
 *
 * 🔋 No modo econômico o passo vira um setInterval de 30 Hz: o rAF de 60 Hz
 * acordava a CPU o tempo todo mesmo quando a cena já roda a 30 fps; o dt
 * continua medido no relógio real e o teto de 0,05 s protege o passo.
 */
export function useGameDriver(): void {
  const ecoActive = useGameStore((s) => s.ecoActive);

  useEffect(() => {
    let last = performance.now();
    let syncAcc = 0;
    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const eng = getEngine();
      if (eng) {
        eng.update(dt);
        syncAcc += dt;
        if (syncAcc >= 0.14) {
          syncAcc = 0;
          useGameStore.getState().syncUi();
        }
      }
    };

    if (ecoActive) {
      const id = window.setInterval(() => step(performance.now()), 1000 / 30);
      return () => window.clearInterval(id);
    }

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      step(now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ecoActive]);
}
