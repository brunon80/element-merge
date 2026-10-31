import { useGameStore } from '../store/gameStore';
import { CoinIcon } from './icons';
import { DIFFICULTY_LABEL, RESULT_LABEL, fmtTime } from './labels';

/** Tela de fim de partida: resultado, recompensa, saldo antes/depois. */
export function ResultScreen() {
  const summary = useGameStore((s) => s.lastSummary);
  const phase = useGameStore((s) => s.phase);
  const stats = useGameStore((s) => s.stats);
  const startNewMatch = useGameStore((s) => s.startNewMatch);
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  if (!summary || (phase !== 'victory' && phase !== 'defeat' && phase !== 'draw')) {
    return null;
  }
  const cls = summary.result === 'victory' ? 'win' : summary.result === 'defeat' ? 'lose' : 'tie';

  return (
    <div className="overlay result-overlay" data-testid="result-screen">
      <div className={`result-card panel ${cls}`}>
        <h1 className="result-word">{RESULT_LABEL[summary.result]}</h1>
        <div className="reward-chip" data-testid="reward-chip">
          <CoinIcon size={22} /> +{summary.reward} moedas
        </div>
        <div className="balance-lines">
          <div>
            <span>Saldo anterior</span>
            <b>{summary.balanceBefore}</b>
          </div>
          <div className="arrow">↓</div>
          <div>
            <span>Saldo atual</span>
            <b className="after" data-testid="balance-after">{summary.balanceAfter}</b>
          </div>
        </div>
        <div className="result-meta">
          Dificuldade {DIFFICULTY_LABEL[summary.difficulty]} · batalha de {fmtTime(summary.duration)}
        </div>
        <div className="result-stats">
          Vitórias {stats.wins} · Derrotas {stats.losses} · Empates {stats.draws} · Partidas{' '}
          {stats.matchesPlayed}
        </div>
        <div className="result-actions">
          <button className="btn primary big" data-testid="new-match" onClick={startNewMatch}>
            ▶ Nova Partida
          </button>
          <button className="btn ghost" onClick={returnToMenu}>
            Menu principal
          </button>
        </div>
        <p className="result-note">
          A recompensa desta partida já foi creditada e não se repete. Suas
          criaturas vivas voltam para a próxima partida — o inimigo será
          recalculado pelo tamanho do seu time.
        </p>
      </div>
    </div>
  );
}
