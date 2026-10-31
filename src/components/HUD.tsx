import { ELEMENTS } from '../data/elements';
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

  const timer = phase === 'combat' ? fmtTime(battleTime) : '—';
  const enemyCount = units.filter((u) => u.side === 'ai' && !u.dying).length;

  return (
    <header className="hud panel" data-testid="hud">
      <div className="hud-left">
        <span className="hud-logo">◈ Elemental Battle</span>
        <span className="hud-diff">{DIFFICULTY_LABEL[difficulty]}</span>
      </div>

      <div className="hud-center">
        {phase === 'preparation' && (
          <span className="hud-timer prep" data-testid="prep-status">
            Preparação — monte seu esquadrão
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
          Inimigo: {enemyCount > 0 ? `${enemyCount} criaturas` : 'aguardando combate'}
        </span>
        <button className="btn ghost small" onClick={() => setBestiary(true)}>
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
