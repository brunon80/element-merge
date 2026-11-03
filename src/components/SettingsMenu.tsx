import { useState } from 'react';
import { testSfx } from '../audio/sfx';
import type { Difficulty, ScenarioChoice } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { CoinIcon } from './icons';
import { DIFFICULTY_LABEL } from './labels';

const DIFF_DESC: Record<Difficulty, string> = {
  easy: 'Inimigo com ~60% do valor do seu time: só criaturas puras Nv.1–2, sem árvore elemental, sem contra-escolha.',
  normal: 'Inimigo com o mesmo valor do seu time: puras até Nv.3 e criaturas da árvore elemental até Nv.6–7.',
  hard: 'Inimigo com ~140% do valor do seu time: puras até Nv.4, árvore elemental até o Nv.10 e contra-escolhas cirúrgicas.',
};

const SCENARIOS: { id: ScenarioChoice; label: string }[] = [
  { id: 'arcane', label: 'Ilha arcana' },
  { id: 'forest', label: 'Floresta' },
  { id: 'ice', label: 'Gélido' },
  { id: 'volcanic', label: 'Inferno Vulcânico' },
  { id: 'underwater', label: 'Subaquático' },
  { id: 'universe-end', label: 'Fim do universo' },
  { id: 'random', label: 'Aleatório' },
];

type TabId = 'match' | 'scenario' | 'graphics' | 'audio' | 'economy' | 'progress' | 'regras' | 'debug';

const TABS: { id: TabId; label: string }[] = [
  { id: 'match', label: '⚔ Partida' },
  { id: 'scenario', label: '🌄 Cenário' },
  { id: 'graphics', label: '✨ Gráficos' },
  { id: 'audio', label: '🔊 Som' },
  { id: 'economy', label: '🪙 Economia' },
  { id: 'progress', label: '📊 Progresso' },
  { id: 'regras', label: '📜 Regras' },
  { id: 'debug', label: '🐞 Depuração' },
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
  const scenario = useGameStore((s) => s.scenario);
  const setScenario = useGameStore((s) => s.setScenario);
  const bloomIntensity = useGameStore((s) => s.bloomIntensity);
  const setBloomIntensity = useGameStore((s) => s.setBloomIntensity);
  const sceneryBloomIntensity = useGameStore((s) => s.sceneryBloomIntensity);
  const setSceneryBloomIntensity = useGameStore((s) => s.setSceneryBloomIntensity);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const setSfxVolume = useGameStore((s) => s.setSfxVolume);
  const musicVolume = useGameStore((s) => s.musicVolume);
  const setMusicVolume = useGameStore((s) => s.setMusicVolume);
  const startingCoinsCfg = useGameStore((s) => s.startingCoinsCfg);
  const setStartingCoins = useGameStore((s) => s.setStartingCoins);
  const debugMode = useGameStore((s) => s.debugMode);
  const setDebugMode = useGameStore((s) => s.setDebugMode);
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
                  Define como o exército inimigo é calculado no início do
                  combate. Vale já para a preparação em andamento; o detalhe de
                  cada dificuldade está na aba <b>Regras</b>.
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
              </section>
            )}

            {tab === 'scenario' && (
              <section>
                <h3>Cenário</h3>
                <p className="hint">
                  Escolha o ambiente da arena. A seleção é aplicada imediatamente.
                  Aleatório sorteia novamente a cada nova partida.
                </p>
                <div
                  className="scenario-list"
                  role="radiogroup"
                  aria-label="Cenário da arena"
                >
                  {SCENARIOS.map((option) => (
                    <button
                      key={option.id}
                      role="radio"
                      aria-checked={scenario === option.id}
                      data-testid={`scenario-${option.id}`}
                      className={`scenario-option ${scenario === option.id ? 'active' : ''}`}
                      onClick={() => setScenario(option.id)}
                    >
                      <span
                        className={`scenario-preview scenario-preview-${option.id}`}
                        aria-hidden="true"
                      >
                        <span className="scenario-preview-court" />
                      </span>
                      <span className="scenario-option-name">{option.label}</span>
                      <span className="scenario-option-indicator" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {tab === 'graphics' && (
              <section>
                <h3>Gráficos</h3>
                <p className="hint">
                  Ajuste o bloom geral e o bloom adicional da paisagem. Reduzir
                  ou desligar os efeitos pode aliviar a GPU em dispositivos mais lentos.
                </p>
                <label className="bloom-control" htmlFor="bloom-intensity">
                  <span className="bloom-control-heading">
                    Intensidade do bloom
                    <output data-testid="bloom-value">
                      {bloomIntensity === 0 ? 'Desligado' : `${bloomIntensity}%`}
                    </output>
                  </span>
                  <input
                    id="bloom-intensity"
                    data-testid="bloom-intensity"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={bloomIntensity}
                    aria-label="Intensidade do bloom"
                    aria-valuetext={bloomIntensity === 0 ? 'Desligado' : `${bloomIntensity}%`}
                    onChange={(event) => setBloomIntensity(Number(event.currentTarget.value))}
                  />
                  <span className="hint">
                    0% desliga o bloom geral. O bloom do cenário é controlado separadamente.
                  </span>
                </label>
                <label className="bloom-control" htmlFor="scenery-bloom-intensity">
                  <span className="bloom-control-heading">
                    Bloom do cenário
                    <output data-testid="scenery-bloom-value">
                      {sceneryBloomIntensity === 0 ? 'Desligado' : `${sceneryBloomIntensity}%`}
                    </output>
                  </span>
                  <input
                    id="scenery-bloom-intensity"
                    data-testid="scenery-bloom-intensity"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={sceneryBloomIntensity}
                    aria-label="Bloom do cenário"
                    aria-valuetext={
                      sceneryBloomIntensity === 0 ? 'Desligado' : `${sceneryBloomIntensity}%`
                    }
                    onChange={(event) =>
                      setSceneryBloomIntensity(Number(event.currentTarget.value))
                    }
                  />
                  <span className="hint">
                    Realça a paisagem e a quadra sem adicionar bloom às criaturas.
                  </span>
                </label>
              </section>
            )}

            {tab === 'audio' && (
              <section>
                <h3>Som</h3>
                <p className="hint">
                  Tudo é sintetizado no navegador (sem arquivos): os efeitos
                  mudam de timbre com o elemento e crescem com o nível, e cada
                  cenário — e o menu, a vitória e a derrota — tem sua própria
                  trilha. Volume 0% desliga cada camada.
                </p>
                <label className="bloom-control" htmlFor="sfx-volume">
                  <span className="bloom-control-heading">
                    Volume dos efeitos
                    <output data-testid="sfx-volume-value">
                      {sfxVolume === 0 ? 'Desligado' : `${sfxVolume}%`}
                    </output>
                  </span>
                  <input
                    id="sfx-volume"
                    data-testid="sfx-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={sfxVolume}
                    aria-label="Volume dos efeitos sonoros"
                    aria-valuetext={sfxVolume === 0 ? 'Desligado' : `${sfxVolume}%`}
                    onChange={(event) => setSfxVolume(Number(event.currentTarget.value))}
                  />
                  <span className="hint">
                    O som é direcional: tiros à esquerda soam à esquerda. Em
                    celulares, use também o volume do aparelho.
                  </span>
                </label>
                <label className="bloom-control" htmlFor="music-volume">
                  <span className="bloom-control-heading">
                    Volume da trilha
                    <output data-testid="music-volume-value">
                      {musicVolume === 0 ? 'Desligado' : `${musicVolume}%`}
                    </output>
                  </span>
                  <input
                    id="music-volume"
                    data-testid="music-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={musicVolume}
                    aria-label="Volume da trilha sonora"
                    aria-valuetext={musicVolume === 0 ? 'Desligado' : `${musicVolume}%`}
                    onChange={(event) => setMusicVolume(Number(event.currentTarget.value))}
                  />
                  <span className="hint">
                    Menu, cada cenário da arena, vitória e derrota têm faixas
                    próprias que trocam com crossfade. No empate, toca a
                    vitória.
                  </span>
                </label>
                <button className="btn ghost small" data-testid="sfx-test" onClick={testSfx}>
                  ▶ Testar som
                </button>
                <p className="hint">
                  Toque em testar para ouvir a sequência: invocação, bola de
                  fogo detonando, raio estalando e uma fusão.
                </p>
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

            {tab === 'regras' && (
              <section>
                <h3>Regras</h3>
                <div className="rules-book">
                  <div>
                    <h4>Fusão</h4>
                    <p>
                      Arraste uma criatura sobre a outra na arena para movê-la
                      ou fundi-las. Toda fusão consome <b>duas criaturas do
                      mesmo nível</b> e produz 1 do nível seguinte: 2×Nv.1 →
                      1×Nv.2 → … até Nv.5 (Nv.5 não funde). Fusões são{' '}
                      <b>grátis</b>. Espécies diferentes só fundem a partir do
                      Nv.5, e apenas quando existe receita na árvore elemental
                      — a Enciclopédia mostra as receitas descobertas.
                    </p>
                  </div>
                  <div>
                    <h4>Preparação e loja</h4>
                    <p>
                      Monte o exército na fase de preparação: a loja só
                      funciona aí e fecha quando o combate começa. Ela vende
                      apenas puros Nv.1 por <b>100 moedas</b>, e a sua arena
                      tem 12 slots.
                    </p>
                  </div>
                  <div>
                    <h4>Lixeira (venda)</h4>
                    <p>
                      Arraste uma criatura sua até a lixeira para vendê-la:
                      você recebe de volta exatamente o que ela custou para
                      existir (Nv.2 devolve 200, Nv.3 devolve 400…; espécies
                      da árvore valem o dobro do nível).
                    </p>
                  </div>
                  <div>
                    <h4>Inimigo e dificuldade</h4>
                    <p>
                      O exército inimigo é calculado e convocado{' '}
                      <b>na hora em que o combate começa</b>, escalado pelo
                      valor do seu time × a dificuldade escolhida:
                    </p>
                    <ul className="diff-list">
                      {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                        <li key={d} className={difficulty === d ? 'active' : ''}>
                          <b>{DIFFICULTY_LABEL[d]}</b> — {DIFF_DESC[d]}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Recompensa e time persistente</h4>
                    <p>
                      Vitória <b>+100</b>, derrota/empate <b>+50</b>, uma
                      recompensa por partida — e o saldo persiste entre
                      partidas. Na vitória, todo o seu time volta para a
                      próxima partida, inclusive quem caiu em combate. Na
                      derrota, o time inteiro também volta (as moedas gastas,
                      não). No empate, só voltam os sobreviventes; se o time
                      zerou, vale a regra da derrota. Ficam de fora os
                      fundidos (o filho carrega o valor deles) e os vendidos.
                    </p>
                    <p>
                      O time guardado volta <b>nos mesmos buracos</b> em que
                      estava quando o combate começou: a luta espalha as
                      criaturas pelo campo, mas a formação que você montou na
                      preparação é o que é salvo — na partida seguinte o
                      tabuleiro já vem pronto.
                    </p>
                  </div>
                  <div>
                    <h4>Enciclopédia</h4>
                    <p>
                      Espécies da árvore elemental aparecem seladas (???) até
                      você descobri-las numa fusão; aí a receita e os
                      atributos da espécie são revelados.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {tab === 'debug' && (
              <section>
                <h3>Depuração</h3>
                <p className="hint">
                  Modo desenvolvedor: mostra o botão <b>Criar no campo</b> em
                  todo card do bestiário (inclusive nas espécies seladas) e
                  coloca a criatura no primeiro slot livre da sua arena, sem
                  custo. Puros podem ser criados em qualquer forma (Nv.1–5);
                  espécies da árvore nascem no nível fixo delas. Só funciona
                  durante a <b>preparação</b> e não conta como descoberta.
                </p>
                <button
                  className={`btn debug-toggle ${debugMode ? 'active' : ''}`}
                  data-testid="debug-toggle"
                  aria-pressed={debugMode}
                  onClick={() => setDebugMode(!debugMode)}
                >
                  {debugMode ? 'Modo debug: LIGADO' : 'Modo debug: desligado'}
                </button>
                <p className="hint">
                  Ajuste também em Configurações → Depuração. A escolha fica
                  salva. Criaturas criadas assim entram no time persistido e
                  voltam com ele (vitória e derrota: todo o time; empate com
                  vivos: só os vivos).
                </p>
              </section>
            )}

            {tab === 'progress' && (
              <section>
                <h3>Progresso</h3>
                <p className="hint">
                  Campanha: {stats.matchesPlayed} partidas · {stats.wins}{' '}
                  vitórias · {stats.losses} derrotas · {stats.draws} empates.
                  {retainedCount > 0 && (
                    <> Time guardado: {retainedCount} criatura(s), nos mesmos buracos.</>
                  )}
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
