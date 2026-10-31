import { useGameStore } from '../store/gameStore';

/** Controles de partida: iniciar combate + dicas. */
export function BattleControls() {
  const phase = useGameStore((s) => s.phase);
  const startBattle = useGameStore((s) => s.startBattle);
  const myUnits = useGameStore(
    (s) => s.units.filter((u) => u.side === 'player' && !u.dying).length,
  );
  if (phase !== 'preparation' && phase !== 'combat') return null;

  return (
    <div className="battle-controls" data-testid="battle-controls">
      {phase === 'preparation' ? (
        <>
          <button
            className="btn primary big"
            data-testid="start-battle"
            onClick={startBattle}
            disabled={myUnits === 0}
            title={
              myUnits === 0
                ? 'Você precisa de ao menos uma criatura na arena'
                : 'O exército inimigo será calculado pelo tamanho e nível do seu time × dificuldade'
            }
          >
            ⚔ Iniciar Combate
          </button>
          <div className="combat-hint">
            O inimigo nasce no início do combate, dimensionado pelo valor do seu
            esquadrão.
          </div>
        </>
      ) : (
        <div className="combat-hint">
          Arraste criaturas na arena para mover ou fundir · fusões grátis ·
          reforços custam 100 · sobreviventes voltam para a próxima partida
        </div>
      )}
    </div>
  );
}
