import { useGameStore } from '../store/gameStore';
import { CoinIcon } from './icons';
import { RESULT_LABEL } from './labels';

export function MenuScreen() {
  const startNewMatch = useGameStore((s) => s.startNewMatch);
  const setBestiary = useGameStore((s) => s.setBestiary);
  const setSettings = useGameStore((s) => s.setSettings);
  const stats = useGameStore((s) => s.stats);
  const lastSummary = useGameStore((s) => s.lastSummary);
  const coins = useGameStore((s) => s.coins);
  const retainedCount = useGameStore((s) => s.retainedCount);

  return (
    <div className="overlay menu-overlay">
      <div className="menu-card panel">
        <div className="logo">
          <span className="logo-el fire">Elemental</span>{' '}
          <span className="logo-el water">Battle</span>
          <div className="logo-sub">MERGE ARENA · 3D</div>
        </div>
        <p className="tagline">
          Invoque monstros elementais, <b>funda casais iguais</b> para evoluí-los até o Nível 5 e
          vença a IA em batalhas de projéteis em tempo real.
        </p>

        <div className="rules-brief">
          <div>
            <b>Fusão</b> 2×Nv.1 → 1×Nv.2 · 2×Nv.2 → 1×Nv.3 → … até Nv.5 (Nv.5 não
            funde). Puros Nv.1 de elementos diferentes viram <b>híbridos</b>.
          </div>
          <div>
            <b>Economia</b> cada invocação custa <b>100</b>, fusões são grátis;
            vitória <b>+100</b>, derrota <b>+50</b> — o saldo persiste entre partidas.
          </div>
          <div>
            <b>Time persistente</b> suas criaturas vivas voltam para a próxima
            partida. O <b>inimigo é calculado na hora do combate</b>: orçamento e
            nível de evolução escalados pelo seu time × dificuldade.
          </div>
        </div>

        {lastSummary && (
          <div className="last-match">
            Última partida: <b>{RESULT_LABEL[lastSummary.result]}</b> (+{lastSummary.reward}) · saldo{' '}
            <CoinIcon size={13} /> {coins}
          </div>
        )}

        <div className="last-match" data-testid="retained-info">
          {retainedCount > 0 ? (
            <>
              Time remanescente: <b>{retainedCount}</b> criatura(s) voltam de graça
              para o próximo combate.
            </>
          ) : (
            <>Nenhuma criatura guardada — seu primeiro esquadrão será comprado.</>
          )}
        </div>

        <button className="btn primary big" data-testid="play" onClick={startNewMatch}>
          ⚔ Jogar — saldo <CoinIcon size={16} /> {coins}
        </button>

        <div className="menu-row">
          <button className="btn ghost" data-testid="open-bestiary" onClick={() => setBestiary(true)}>
            📖 Enciclopédia
          </button>
          <button
            className="btn ghost"
            data-testid="open-settings"
            onClick={() => setSettings(true)}
          >
            ⚙ Configurações
          </button>
        </div>

        <div className="menu-stats">
          Campanha: {stats.matchesPlayed} partidas · {stats.wins} vitórias · {stats.losses}{' '}
          derrotas · {stats.draws} empates
        </div>
      </div>
    </div>
  );
}
