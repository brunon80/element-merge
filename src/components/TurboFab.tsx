import { useGameStore } from '../store/gameStore';
import { ClockIcon } from './icons';

/**
 * ⏩ Turbo de combate: com o campo lotado a partida vira uma fila de ataques
 * indo e vindo por minutos. Este FAB alterna a cadência da troca de tiros
 * entre 1× e 3×: os cooldowns drenam 3× mais rápido no motor, e a cadência
 * própria de cada monstro é preservada proporcionalmente (intervalo 2 s vira
 * 0,6 s; 3 s vira 1 s). Dano, projéteis e status seguem no tempo real — só a
 * frequência dos tiros acelera.
 *
 * Vive só no combate: preparação não tem tiro, e resultado não tem partida.
 * É a segunda peça da rail esquerda do codex (ver `.codex-fab`/`.turbo-fab`
 * no styles.css — as zonas livres medidas). O estado 3× brinca no ouro do
 * tema; 1× é acesa discreta. Não persiste: cada partida começa em 1×.
 */
export function TurboFab() {
  const phase = useGameStore((s) => s.phase);
  const turbo = useGameStore((s) => s.turbo);
  const setTurbo = useGameStore((s) => s.setTurbo);
  if (phase !== 'combat') return null;

  return (
    <button
      className="turbo-fab"
      data-testid="turbo-fab"
      data-on={turbo ? 'true' : 'false'}
      aria-pressed={turbo}
      title="Turbo de combate: a troca de ataques roda 3× mais rápido, mantendo a cadência de cada monstro"
      aria-label={
        turbo
          ? 'Turbo de combate ligado (3×) — clique para voltar a 1×'
          : 'Turbo de combate desligado (1×) — clique para acelerar a troca de ataques para 3×'
      }
      onClick={() => setTurbo(!turbo)}
    >
      <ClockIcon size={26} />
      <span className="turbo-fab-count">{turbo ? '3×' : '1×'}</span>
    </button>
  );
}
