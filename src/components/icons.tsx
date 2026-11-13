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

/** Livro aberto: o glifo da enciclopédia (botão flutuante). */
export function BookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="book-glyph"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 6.4C10.2 4.9 7 4.3 4.2 4.9v13.4c2.8-.6 6 0 7.8 1.5 1.8-1.5 5-2.1 7.8-1.5V4.9C17 4.3 13.8 4.9 12 6.4z" />
      <path d="M12 6.4v13.4" />
    </svg>
  );
}

/** Casinha: botão "Início" da barra (voltar ao menu). */
export function HouseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="house-glyph"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8" />
      <path d="M9.8 20v-5.4h4.4V20" />
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

/** Coração cheio: o glifo de VIDA (chip do bônus de cenário no HUD). */
export function HeartIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="heart-glyph" aria-hidden>
      <path
        d="M12 20.7 3.9 12.6a5.2 5.2 0 1 1 7.4-7.3l.7.7.7-.7a5.2 5.2 0 1 1 7.4 7.3z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Espadas cruzadas CHEIAS: o glifo de ATAQUE/DANO (chip do bônus de cenário no
 *  HUD). Silhueta sólida igual aos demais glifos do chip — uma espada vertical
 *  (ponta em cima, guarda, empunhadura e pomo) repetida com giro de ±45°. */
export function SwordsIcon({ size = 12 }: { size?: number }) {
  const sword = (
    <>
      <path d="M12 1.4 13.7 4.1v9.3h-3.4V4.1z" />
      <rect x="7.2" y="13.7" width="9.6" height="1.9" rx="0.95" />
      <rect x="11" y="15.6" width="2.1" height="4.9" rx="1.05" />
      <circle cx="12" cy="21.6" r="1.55" />
    </>
  );
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="swords-glyph" fill="currentColor" aria-hidden>
      <g transform="rotate(45 12 12)">{sword}</g>
      <g transform="rotate(-45 12 12)">{sword}</g>
    </svg>
  );
}

/** Lixeira: o glifo do BOTÃO DE VENDA (aparece só durante o arraste). Tampa com
 *  alça, corpo com as costelas de sempre e a moeda caindo dentro — vender é
 *  devolver moeda, não jogar fora. Tudo em currentColor, como os outros. */
export function SellIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="sell-glyph" aria-hidden>
      {/* tampa + alça */}
      <path
        d="M4.2 7.5h15.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.6 7.5V5.6c0-.6.5-1.1 1.1-1.1h2.6c.6 0 1.1.5 1.1 1.1v1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* corpo da lixeira */}
      <path
        d="M6.1 7.9l.9 11.3c.07.9.8 1.6 1.7 1.6h6.6c.9 0 1.63-.7 1.7-1.6l.9-11.3"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M6.1 7.9l.9 11.3c.07.9.8 1.6 1.7 1.6h6.6c.9 0 1.63-.7 1.7-1.6l.9-11.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* moeda entrando na lixeira: o que a venda devolve */}
      <circle cx="12" cy="12.6" r="2.9" fill="currentColor" opacity="0.9" />
      <path d="M12 11.1v3M11 12.6h2" stroke="#1b1300" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Relógio: o glifo do TURBO DE COMBATE (botão flutuante). Aro com disco
 *  sombreado e ponteiros — o mesmo desenho de aro do CoinIcon, na tinta do
 *  FAB (currentColor). */
export function ClockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="clock-glyph" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity="0.25" />
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 6.2v5.1l3.5 2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Luva de cartomante apontando: o glifo da luvinha do tutorial.
 *
 * A ponta do indicador mora em (7,7) do viewBox de 52 — o `TutorialHand` usa
 * essa referência (TIP_U) para que a PONTA do dedo encoste no alvo, e não a
 * esquina do desenho. Traço escuro largo por baixo + traço claro por cima =
 * contorno de desenho animado, do mesmo modo dos outros glifos daqui.
 */
export function GloveIcon({ size = 56 }: { size?: number }) {
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} className="glove-glyph" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* punho da luva (faixa dourada), desenhado antes da mão para a luva
            parecer costurada por baixo dela */}
        <path d="M30 33 45 48" fill="none" stroke="#12100c" strokeWidth="16" />
        <path d="M30 33 45 48" fill="none" stroke="#e9b849" strokeWidth="10.5" />
        {/* indicador esticado: contorno + preenchimento */}
        <path d="M7 7 22 22" fill="none" stroke="#12100c" strokeWidth="12.5" />
        <path d="M7 7 22 22" fill="none" stroke="#fdf3dc" strokeWidth="8" />
        {/* mão fechada (punho) */}
        <path
          d="M17 17c8-7 22-4 25 7 2 9-4 18-14 18-10 0-17-7-17-15 0-4 2-8 6-10z"
          fill="#fdf3dc"
          stroke="#12100c"
          strokeWidth="3"
        />
        {/* polegar cruzando a frente da mão */}
        <path d="M19.5 27.5c6 5 13 6 18.5 3" fill="none" stroke="#12100c" strokeWidth="2.6" />
        {/* costura dos dedos, no miolo da luva */}
        <path d="M28 21c4 2 6.5 5 7.5 9" fill="none" stroke="#c9b58c" strokeWidth="2.2" />
      </g>
    </svg>
  );
}
