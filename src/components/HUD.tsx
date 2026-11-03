import { ELEMENTS } from '../data/elements';
import { useFullscreen } from '../hooks/useFullscreen';
import { useGameStore } from '../store/gameStore';
import type { ElementId } from '../game/types';
import { SUMMON_COST } from '../game/types';
import { CoinIcon, ElementIcon } from './icons';
import { DIFFICULTY_LABEL, fmtTime } from './labels';

export function ElementTag({ el }: { el: ElementId }) {
  const info = ELEMENTS[el];
  return (
    <span className="element-tag" style={{ borderColor: info.color, color: info.color }}>
      <ElementIcon el={el} size={14} /> {info.name}
    </span>
  );
}

/** Barra superior: saldo, fase, cronômetro de combate e navegação. */
export function HUD() {
  const phase = useGameStore((s) => s.phase);
  const coins = useGameStore((s) => s.coins);
  const battleTime = useGameStore((s) => s.battleTime);
  const difficulty = useGameStore((s) => s.difficulty);
  const units = useGameStore((s) => s.units);
  const setBestiary = useGameStore((s) => s.setBestiary);
  const setSettings = useGameStore((s) => s.setSettings);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const fullscreen = useFullscreen();

  const timer = phase === 'combat' ? fmtTime(battleTime) : '—';
  const enemyCount = units.filter((u) => u.side === 'ai' && !u.dying).length;

  return (
    <header className="hud panel" data-testid="hud">
      <div className="hud-left">
        <span className="hud-logo">
          ◈<span className="hud-logo-name"> Elemental Battle</span>
        </span>
        <span className="hud-diff">{DIFFICULTY_LABEL[difficulty]}</span>
      </div>

      <div className="hud-center">
        {phase === 'preparation' && (
          <span className="hud-timer prep" data-testid="prep-status">
            Preparação<span className="prep-sub"> — monte seu esquadrão</span>
          </span>
        )}
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
        <span className="hud-coins" data-testid="coins" title={`Cada invocação custa ${SUMMON_COST}`}>
          <CoinIcon size={16} /> <b>{coins}</b>
        </span>
        <span
          className="hud-ai-coins"
          data-testid="enemy-count"
          title="O exército inimigo é calculado e convocado quando o combate começa"
        >
          <span className="enemy-label">Inimigo: </span>
          {enemyCount > 0 ? `${enemyCount} criaturas` : 'aguardando combate'}
        </span>
        {fullscreen.supported && (
          <button
            className="btn ghost small hud-fullscreen"
            data-testid="fullscreen-toggle"
            title={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
            onClick={fullscreen.toggle}
          >
            {fullscreen.active ? '🗗' : '⛶'}
          </button>
        )}
        <button
          className="btn ghost small"
          data-testid="open-bestiary"
          title="Bestiário"
          onClick={() => setBestiary(true)}
        >
          📖
        </button>
        <button
          className="btn ghost small"
          data-testid="open-settings"
          title="Configurações"
          onClick={() => setSettings(true)}
        >
          ⚙
        </button>
        <button className="btn ghost small" data-testid="quit" onClick={returnToMenu}>
          Menu
        </button>
      </div>
    </header>
  );
}
