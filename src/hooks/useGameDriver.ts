import { useEffect } from 'react';
import { getEngine, useGameStore } from '../store/gameStore';

/**
 * Loop de simulação desacoplado do React: avança o motor em passo
 * variável limitado e sincroniza o espelho da UI ~8x/s (dados discretos;
 * posições/projéteis vivem no mundo do motor lido pela cena).
 */
export function useGameDriver(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let syncAcc = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
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
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
}
