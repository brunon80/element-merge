import { ELEMENTS } from '../data/elements';
import {
  TERRAIN_BONUS,
  TERRAIN_ELEMENT,
  TERRAIN_LABEL,
} from '../data/terrainBonuses';
import { useFullscreen } from '../hooks/useFullscreen';
import { useGameStore } from '../store/gameStore';
import type { ElementId } from '../game/types';
import { SUMMON_COST } from '../game/types';
import { CoinIcon, ElementIcon, HeartIcon, HouseIcon, SwordsIcon } from './icons';
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
 * Tinta legível sobre o fill do chip de cenário: o fill é a cor do elemento
 * (viva demais para texto escuro em fogo/água, clara demais em terra/ar), então
 * a luminância ponderada decide entre branco e tinta escura.
 */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff);
  return lum > 165 ? '#141826' : '#ffffff';
}

/**
 * Barra superior enxuta: o que o jogador precisa numa partida é o SALDO (o
 * número que decide cada decisão de loja) e as saídas — tela cheia,
 * configurações, Início. As frases que saíram (logo "Elemental Battle",
 * "Preparação — monte seu esquadrão" e "Inimigo: N criaturas") eram rótulos do
 * que já está na tela: a loja explica a preparação, e o exército inimigo nasce
 * na hora do combate — nada muda consultando a barra.
 *
 * O chip de bônus de cenário NÃO disputa largura dentro do header: ele é um
 * filho absoluto do <header>, pendurado logo ABAIXO do painel e alinhado à
 * borda esquerda dele — dentro do header ele estourava o lado direito no
 * iPad retrato (768) e no celular. Filled na cor do elemento para destacar.
 */
export function HUD() {
  const phase = useGameStore((s) => s.phase);
  const coins = useGameStore((s) => s.coins);
  const battleTime = useGameStore((s) => s.battleTime);
  const difficulty = useGameStore((s) => s.difficulty);
  const activeArenaScene = useGameStore((s) => s.activeArenaScene);
  const setSettings = useGameStore((s) => s.setSettings);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const fullscreen = useFullscreen();

  const timer = phase === 'combat' ? fmtTime(battleTime) : '—';
  const terrainEl = TERRAIN_ELEMENT[activeArenaScene];
  const live = phase === 'combat' || phase === 'victory' || phase === 'defeat' || phase === 'draw';

  return (
    <header className={`hud panel${live ? ' hud--live' : ''}`} data-testid="hud">
      <div className="hud-left">
        <span className="hud-logo" aria-hidden>
          ◈
        </span>
        <span className="hud-diff">{DIFFICULTY_LABEL[difficulty]}</span>
      </div>

      <div className="hud-center">
        {phase === 'combat' && (
          <span className="hud-timer combat" data-testid="timer-battle">
            <span className="hud-timer-label">Combate </span>
            <b>{timer}</b>
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

      {terrainEl && (
        <span
          className="hud-terrain"
          data-testid="terrain-hint"
          style={{
            background: ELEMENTS[terrainEl].color,
            color: inkOn(ELEMENTS[terrainEl].color),
          }}
          title={`${TERRAIN_LABEL[activeArenaScene]}: criaturas com ${ELEMENTS[
            terrainEl
          ].name.toLowerCase()} na linhagem ganham +${Math.round(
            TERRAIN_BONUS * 100,
          )}% de dano e vida`}
        >
          <ElementIcon el={terrainEl} size={13} /> +{Math.round(TERRAIN_BONUS * 100)}%{' '}
          <HeartIcon size={12} />
          /<SwordsIcon size={12} />
        </span>
      )}
    </header>
  );
}
