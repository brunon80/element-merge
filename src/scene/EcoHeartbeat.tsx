import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/**
 * Coração do modo econômico no `frameloop="demand"` (ver App.tsx): o canvas
 * só renderiza quando alguém pede `invalidate()`. Este batimento acorda a
 * cena a 30 Hz — METADE do custo de tudo (rasterização, shadow map, rigs,
 * partículas, bloom) com o jogo ainda vivo na tela. A órbita, o arraste e as
 * mudanças do store já invalidam sozinhos (r3f + drei); o batimento cobre as
 * animações contínuas que vivem em `useFrame`.
 */
export function EcoHeartbeat({ hz = 30 }: { hz?: number }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / hz);
    return () => window.clearInterval(id);
  }, [invalidate, hz]);

  return null;
}
