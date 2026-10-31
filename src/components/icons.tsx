import type { ElementId } from '../game/types';

/** Glifo SVG por elemento (sem assets externos). */
const PATHS: Record<ElementId, string> = {
  fire: 'M12 2c1.2 3.6-2.6 5.2-2.6 8.4 0 1.5 1 2.7 2.6 2.7s2.6-1.2 2.6-2.7c0-1-.4-1.8-.9-2.6 2.3 1 4.9 3.6 4.9 7.1 0 4.3-3.3 7.1-6.6 7.1S5 16.2 5 12c0-4.6 4.3-6.5 7-10z',
  water: 'M12 2.5c3.4 4.2 6.5 7.8 6.5 11.4 0 3.9-2.9 6.6-6.5 6.6s-6.5-2.7-6.5-6.6c0-3.6 3.1-7.2 6.5-11.4z',
  earth: 'M4 9l4-5h8l4 5-8 13L4 9zm3.4 0h9.2L14 5.6h-4L7.4 9z M9.5 11.5h5l-2.5 5.6-2.5-5.6z',
  air: 'M3 8h10.5a2.5 2.5 0 1 0-2.4-3.2M3 12h13.5a2.5 2.5 0 1 1-2.4 3.2M3 16h7.5a2 2 0 1 1-1.9 2.6',
};

const FILLED: Record<ElementId, boolean> = {
  fire: true,
  water: true,
  earth: true,
  air: false,
};

export function ElementIcon({ el, size = 18 }: { el: ElementId; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`el-glyph el-${el}`}
      fill={FILLED[el] ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={FILLED[el] ? 0 : 2}
      strokeLinecap="round"
      aria-hidden
    >
      <path d={PATHS[el]} />
    </svg>
  );
}

export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="coin-glyph" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.25" />
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 6.5v11M9 9.5h4.2a2 2 0 0 1 0 4H8.5M9.5 14.5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
