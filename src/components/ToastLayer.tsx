import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

export function ToastLayer() {
  const toast = useGameStore((s) => s.toast);
  const dismissToast = useGameStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissToast(toast.id), 2800);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} data-testid="toast" role="status">
      {toast.msg}
    </div>
  );
}
