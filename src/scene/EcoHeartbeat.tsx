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
    let id = 0;
    const start = () => {
      if (!id) id = window.setInterval(() => invalidate(), 1000 / hz);
    };
    const stop = () => {
      if (id) {
        window.clearInterval(id);
        id = 0;
      }
    };
    // 🔋 aba/app escondido: o batimento PARA. No modo cheio isso já acontece
    // sozinho — o rAF do navegador congela em segundo plano — mas aqui o canvas
    // é demand + setInterval, que segue acordando o aparelho (e a GPU) enquanto
    // ninguém olha: um dos maiores drenos quando o usuário troca de app com a
    // aba aberta. Ao voltar, o batimento retoma de onde parou.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [invalidate, hz]);

  return null;
}
