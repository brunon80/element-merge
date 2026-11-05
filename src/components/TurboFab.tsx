import { useGameStore, type TurboScale } from '../store/gameStore';
import { ClockIcon } from './icons';

/** Degraus do ciclo: cada toque avança 1× → 3× → 5× → 1× (o 5× é o atalho
 *  para campos muito lotados, onde a troca de tiros arrasta a partida). */
const TURBO_STEPS: readonly TurboScale[] = [1, 3, 5];

/**
 * ⏩ Turbo de combate: com o campo lotado a partida vira uma fila de ataques
 * indo e vindo por minutos. Este FAB cicla a cadência da troca de tiros entre
 * 1×, 3× e 5×: os cooldowns drenam proporcionalmente mais rápido no motor, e
 * a cadência própria de cada monstro é preservada (intervalo 2 s vira 0,67 s
 * no 3× e 0,4 s no 5×). Dano, projéteis e status seguem no tempo real — só a
 * frequência dos tiros acelera.
 *
 * Vive só no combate: preparação não tem tiro, e resultado não tem partida.
 * É a segunda peça da rail esquerda do codex (ver `.codex-fab`/`.turbo-fab`
 * no styles.css — as zonas livres medidas). O 3× brinca no ouro do tema; o 5×
 * esquenta para o vermelho do perigo; 1× é acesa discreta. Não persiste: cada
 * partida começa em 1×.
 */
export function TurboFab() {
  const phase = useGameStore((s) => s.phase);
  const turbo = useGameStore((s) => s.turbo);
  const setTurbo = useGameStore((s) => s.setTurbo);
  if (phase !== 'combat') return null;

  const next = TURBO_STEPS[(TURBO_STEPS.indexOf(turbo) + 1) % TURBO_STEPS.length];
  const label =
    turbo === 1
      ? 'Turbo de combate desligado (1×) — clique para acelerar a troca de ataques para 3×'
      : turbo === 3
        ? 'Turbo de combate em 3× — clique para acelerar para 5×'
        : 'Turbo de combate em 5× — clique para voltar a 1×';

  return (
    <button
      className="turbo-fab"
      data-testid="turbo-fab"
      data-on={turbo > 1 ? 'true' : 'false'}
      data-scale={turbo}
      aria-pressed={turbo > 1}
      title="Turbo de combate: a troca de ataques roda 3× ou 5× mais rápido, mantendo a cadência de cada monstro (o toque cicla 1× → 3× → 5×)"
      aria-label={label}
      onClick={() => setTurbo(next)}
    >
      <ClockIcon size={26} />
      <span className="turbo-fab-count">{turbo}×</span>
    </button>
  );
}
