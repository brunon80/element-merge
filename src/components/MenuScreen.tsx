import { useFullscreen } from '../hooks/useFullscreen';
import { useGameStore } from '../store/gameStore';
import { CodexFab } from './CodexFab';
import { CoinIcon } from './icons';
import { RESULT_LABEL } from './labels';

/**
 * Tela inicial: só o essencial. As regras completas moram em
 * Configurações → Regras (o card do menu não vira manual).
 */
export function MenuScreen() {
  const play = useGameStore((s) => s.play);
  const setSettings = useGameStore((s) => s.setSettings);
  const stats = useGameStore((s) => s.stats);
  const lastSummary = useGameStore((s) => s.lastSummary);
  const coins = useGameStore((s) => s.coins);
  const fullscreen = useFullscreen();

  return (
    <div className="overlay menu-overlay">
      <div className="menu-card panel">
        <div className="logo">
          <span className="logo-el fire">Elemental</span>{' '}
          <span className="logo-el water">Battle</span>
          <div className="logo-sub">MERGE ARENA · 3D</div>
        </div>

        {lastSummary && (
          <div className="last-match">
            Última partida: <b>{RESULT_LABEL[lastSummary.result]}</b> (+{lastSummary.reward})
          </div>
        )}

        {/* "Jogar" é o portão do tutorial: na primeira vez ele dispara os 5
            passos (ou pergunta antes, se já existe jogo salvo) */}
        <button className="btn primary big" data-testid="play" onClick={play}>
          ⚔ Jogar — saldo <CoinIcon size={16} /> {coins}
        </button>

        <div className="menu-row">
          <button
            className="btn ghost"
            data-testid="open-settings"
            onClick={() => setSettings(true)}
          >
            ⚙ Configurações
          </button>
          {fullscreen.supported && (
            <button
              className="btn ghost"
              data-testid="menu-fullscreen"
              onClick={fullscreen.toggle}
              title={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {fullscreen.active ? '🗗 Sair da tela cheia' : '⛶ Tela cheia'}
            </button>
          )}
        </div>

        <div className="menu-stats">
          Campanha: {stats.matchesPlayed} partidas · {stats.wins} vitórias · {stats.losses}{' '}
          derrotas · {stats.draws} empates
        </div>
      </div>

      {/* a entrada da enciclopédia vive fora do card: é o destaque da tela,
          não mais um botãozinho da lista */}
      <CodexFab />
    </div>
  );
}
