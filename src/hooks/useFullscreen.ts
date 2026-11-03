import { useCallback, useEffect, useState } from 'react';

/**
 * Tela cheia via Fullscreen API. O botão só aparece onde o navegador suporta
 * (iOS iPhone não tem fullscreen de elemento — lá o jogo roda normal na aba).
 * Safari antigo usa os nomes com prefixo webkit; jsdom não tem nada disso e o
 * hook vira um no-op seguro nos testes.
 */
type WebkitDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitNode = Node & { webkitExitFullscreen?: () => void };

function supported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDoc;
  return (
    document.fullscreenEnabled === true ||
    doc.webkitFullscreenEnabled === true ||
    'webkitRequestFullscreen' in document.documentElement
  );
}

function activeElement(): Element | null {
  const doc = document as WebkitDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function useFullscreen(): {
  supported: boolean;
  active: boolean;
  toggle: () => void;
} {
  const ok = supported();
  const [active, setActive] = useState(() => (ok ? activeElement() !== null : false));

  useEffect(() => {
    if (!ok) return;
    const sync = () => setActive(activeElement() !== null);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [ok]);

  const toggle = useCallback(() => {
    if (!ok) return;
    if (activeElement() !== null) {
      const exit = (document as unknown as WebkitNode).webkitExitFullscreen;
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
      else exit?.call(document);
      return;
    }
    // a requisição PRECISA nascer do gesto do usuário (clique); sem catch, um
    // navegador que nega o fullscreen derrubaria o resto do clique
    const el = document.documentElement as WebkitEl;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  }, [ok]);

  return { supported: ok, active, toggle };
}
