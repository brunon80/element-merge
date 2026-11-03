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
          A recompensa desta partida já foi creditada e não se repete.{' '}
          {summary.result === 'victory'
            ? 'Vitória: todo o time que você plantou volta para a próxima partida, inclusive quem caiu em combate — evoluir um monstro não é uma aposta. Ficam de fora só os fundidos (o filho carrega o valor deles) e os vendidos.'
            : summary.result === 'defeat'
              ? 'Derrota: para você não ficar sem exército, o time inteiro da rodada também volta — mas o prejuízo financeiro fica (as moedas gastas não voltam). Troque a dificuldade, venda criaturas na lixeira e monte outra estratégia.'
              : 'No empate, só voltam para a próxima partida as criaturas que sobreviveram; se o tabuleiro zerou, vale a regra da derrota e o time inteiro volta.'}{' '}
          O inimigo será recalculado pelo tamanho do seu time.
        </p>
      </div>
    </div>
  );
}
