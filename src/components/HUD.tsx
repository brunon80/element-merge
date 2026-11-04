import { ELEMENTS } from '../data/elements';
import { useFullscreen } from '../hooks/useFullscreen';
import { useGameStore } from '../store/gameStore';
import type { ElementId } from '../game/types';
import { SUMMON_COST } from '../game/types';
import { CoinIcon, ElementIcon, HouseIcon } from './icons';
import { DIFFICULTY_LABEL, fmtTime } from './labels';

export function ElementTag({ el }: { el: ElementId }) {
  const info = ELEMENTS[el];
  return (
    <span className="element-tag" style={{ borderColor: info.color, color: info.color }}>
      <ElementIcon el={el} size={14} /> {info.name}
    </span>
  );
}

/**
 * Barra superior enxuta: o que o jogador precisa numa partida é o SALDO (o
 * número que decide cada decisão de loja) e as saídas — tela cheia,
 * configurações, Início. As frases que saíram (logo "Elemental Battle",
 * "Preparação — monte seu esquadrão" e "Inimigo: N criaturas") eram rótulos do
 * que já está na tela: a loja explica a preparação, e o exército inimigo nasce
 * na hora do combate — nada muda consultando a barra.
 */
export function HUD() {
  const phase = useGameStore((s) => s.phase);
  const coins = useGameStore((s) => s.coins);
  const battleTime = useGameStore((s) => s.battleTime);
  const difficulty = useGameStore((s) => s.difficulty);
  const setSettings = useGameStore((s) => s.setSettings);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const fullscreen = useFullscreen();

  const timer = phase === 'combat' ? fmtTime(battleTime) : '—';

  return (
    <header className="hud panel" data-testid="hud">
      <div className="hud-left">
        <span className="hud-logo" aria-hidden>
          ◈
        </span>
        <span className="hud-diff">{DIFFICULTY_LABEL[difficulty]}</span>
      </div>

      <div className="hud-center">
        {phase === 'combat' && (
          <span className="hud-timer combat" data-testid="timer-battle">
            Combate <b>{timer}</b>
          </span>
        )}
        {(phase === 'victory' || phase === 'defeat' || phase === 'draw') && (
          <span className="hud-phase">Fim de combate</span>
        )}
      </div>

      <div className="hud-right">
        <span
          className="hud-coins"
          data-testid="coins"
          title={`Cada invocação custa ${SUMMON_COST}`}
        >
          <CoinIcon size={20} /> <b>{coins}</b>
        </span>
        {fullscreen.supported && (
          <button
            className="btn hud-btn"
            data-testid="fullscreen-toggle"
            title={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={fullscreen.toggle}
          >
            <span className="hud-btn-glyph" aria-hidden>
              {fullscreen.active ? '🗗' : '⛶'}
            </span>{' '}
            <span className="hud-btn-text">Tela cheia</span>
          </button>
        )}
        <button
          className="btn hud-btn"
          data-testid="open-settings"
          title="Configurações"
          onClick={() => setSettings(true)}
        >
          <span className="hud-btn-glyph" aria-hidden>
            ⚙
          </span>{' '}
          <span className="hud-btn-text">Configurações</span>
        </button>
        <button
          className="btn hud-btn"
          data-testid="quit"
          onClick={returnToMenu}
          aria-label="Início"
          title="Voltar ao início"
        >
          <HouseIcon size={17} /> <span className="hud-btn-text">Início</span>
        </button>
      </div>
    </header>
  );
}
