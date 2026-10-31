import { useState } from 'react';
import type { Difficulty } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { CoinIcon } from './icons';
import { DIFFICULTY_LABEL } from './labels';

const DIFF_DESC: Record<Difficulty, string> = {
  easy: 'Inimigo com ~60% do valor do seu time: só Nv.1–2, sem híbridos, sem contra-escolha.',
  normal: 'Inimigo com o mesmo valor do seu time: até Nv.3, híbridos ocasionais e contra-escolhas.',
  hard: 'Inimigo com ~140% do valor do seu time: até Nv.4, híbridos frequentes e contra-escolhas cirúrgicas.',
};

type TabId = 'match' | 'economy' | 'progress';

const TABS: { id: TabId; label: string }[] = [
  { id: 'match', label: '⚔ Partida' },
  { id: 'economy', label: '🪙 Economia' },
  { id: 'progress', label: '📊 Progresso' },
];

/**
 * Menu de configurações em painel mestre-detalhe: grupos na sidebar
 * esquerda e o conteúdo do grupo selecionado à direita.
 */
export function SettingsMenu() {
  const open = useGameStore((s) => s.showSettings);
  const setOpen = useGameStore((s) => s.setSettings);
  const difficulty = useGameStore((s) => s.difficulty);
  const setDifficulty = useGameStore((s) => s.setDifficulty);
  const startingCoinsCfg = useGameStore((s) => s.startingCoinsCfg);
  const setStartingCoins = useGameStore((s) => s.setStartingCoins);
  const resetProgress = useGameStore((s) => s.resetProgress);
  const stats = useGameStore((s) => s.stats);
  const coins = useGameStore((s) => s.coins);
  const retainedCount = useGameStore((s) => s.retainedCount);

  const [tab, setTab] = useState<TabId>('match');
  const [confirmReset, setConfirmReset] = useState(false);

  if (!open) return null;

  return (
    <div className="overlay settings-overlay" data-testid="settings-menu">
      <div className="settings-panel panel">
        <div className="settings-top">
          <h2>Configurações</h2>
          <button
            className="btn ghost small"
            data-testid="close-settings"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-sidebar" role="tablist" aria-label="Grupos de configuração">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                data-testid={`settings-tab-${t.id}`}
                className={`settings-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="settings-content" role="tabpanel">
            {tab === 'match' && (
              <section>
                <h3>Partida</h3>
                <p className="hint">
                  Define como o exército inimigo é calculado no início do combate
                  (orçamento, nível máximo e híbridos). Vale já para a preparação
                  em andamento.
                </p>
                <div
                  className="difficulty-row left"
                  role="radiogroup"
                  aria-label="Dificuldade"
                >
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      role="radio"
                      aria-checked={difficulty === d}
                      data-testid={`diff-${d}`}
                      className={`diff-btn ${difficulty === d ? 'active' : ''}`}
                      onClick={() => setDifficulty(d)}
                    >
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
                <ul className="diff-list">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                    <li key={d} className={difficulty === d ? 'active' : ''}>
                      <b>{DIFFICULTY_LABEL[d]}</b> — {DIFF_DESC[d]}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tab === 'economy' && (
              <section>
                <h3>Economia</h3>
                <p className="hint">
                  Regras fixas: cada invocação custa <b>100</b>, fusões são
                  grátis; vitória <b>+100</b>, derrota/empate <b>+50</b>, uma
                  recompensa por partida. Saldo atual <CoinIcon size={13} />{' '}
                  {coins}.
                </p>
                <label>
                  Moedas iniciais (novo progresso)
                  <div className="coin-stepper">
                    <button onClick={() => setStartingCoins(startingCoinsCfg - 100)}>−</button>
                    <span>{startingCoinsCfg}</span>
                    <button onClick={() => setStartingCoins(startingCoinsCfg + 100)}>+</button>
                  </div>
                </label>
                <p className="hint">Aplicado ao reiniciar o progresso.</p>
              </section>
            )}

            {tab === 'progress' && (
              <section>
                <h3>Progresso</h3>
                <p className="hint">
                  Campanha: {stats.matchesPlayed} partidas · {stats.wins}{' '}
                  vitórias · {stats.losses} derrotas · {stats.draws} empates.
                  {retainedCount > 0 && <> Time guardado: {retainedCount} criatura(s).</>}
                </p>
                {confirmReset ? (
                  <div className="confirm">
                    Apagar moedas, criaturas guardadas, descobertas e estatísticas?
                    <button
                      className="btn danger small"
                      onClick={() => {
                        resetProgress();
                        setConfirmReset(false);
                      }}
                    >
                      Apagar
                    </button>
                    <button className="btn ghost small" onClick={() => setConfirmReset(false)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className="btn danger" onClick={() => setConfirmReset(true)}>
                    Reiniciar progresso
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
