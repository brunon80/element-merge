import { useGameStore } from '../store/gameStore';

/** Controles de partida: botão de iniciar combate (tudo o mais virou regra nas configurações). */
export function BattleControls() {
  const phase = useGameStore((s) => s.phase);
  const startBattle = useGameStore((s) => s.startBattle);
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const myUnits = useGameStore(
    (s) => s.units.filter((u) => u.side === 'player' && !u.dying).length,
  );
  if (phase !== 'preparation') return null;
  // 🎓 o combate só vem depois dos 5 passos (a régua é do store; aqui o botão
  // já mostra por que está fora do jogo)
  const noTutorial = tutorialStep !== null;

  return (
    <div className="battle-controls" data-testid="battle-controls">
      {phase === 'preparation' && (
        <button
          className="btn primary big"
          data-testid="start-battle"
          onClick={startBattle}
          disabled={myUnits === 0 || noTutorial}
          data-tutorial-bloqueado={noTutorial ? 'true' : 'false'}
          title={
            noTutorial
              ? 'Termine os 5 passos do tutorial primeiro (ou pule na faixa dele)'
              : myUnits === 0
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
