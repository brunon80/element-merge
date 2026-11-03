import { useGameStore } from '../store/gameStore';

/** Controles de partida: botão de iniciar combate (tudo o mais virou regra nas configurações). */
export function BattleControls() {
  const phase = useGameStore((s) => s.phase);
  const startBattle = useGameStore((s) => s.startBattle);
  const myUnits = useGameStore(
    (s) => s.units.filter((u) => u.side === 'player' && !u.dying).length,
  );
  if (phase !== 'preparation') return null;

  return (
    <div className="battle-controls" data-testid="battle-controls">
      {phase === 'preparation' && (
        <button
          className="btn primary big"
          data-testid="start-battle"
          onClick={startBattle}
          disabled={myUnits === 0}
          title={
            myUnits === 0
              ? 'Você precisa de ao menos uma criatura na arena'
              : 'O exército inimigo será calculado pelo tamanho e nível do seu time × dificuldade. Regras completas em Configurações → Regras'
          }
        >
          ⚔ Iniciar Combate
        </button>
      )}
    </div>
  );
}
