import { useGameStore } from '../store/gameStore';
import { CoinIcon, GloveIcon } from './icons';

/**
 * A PERGUNTA antes do tutorial: "o tutorial SEMPRE começa com a arena vazia" —
 * então, se já existe jogo salvo, avisamos antes de apagar o tabuleiro da vista.
 * Nada é destruído no caminho: moedas e time guardado ficam no cofre e voltam
 * no fim dos 5 passos (ver `startTutorial`/`closeTutorial` no gameStore).
 */
export function TutorialPrompt() {
  const open = useGameStore((s) => s.tutorialPrompt);
  const answer = useGameStore((s) => s.answerTutorialPrompt);
  const coins = useGameStore((s) => s.coins);
  const retained = useGameStore((s) => s.retainedCount);
  if (!open) return null;

  return (
    <div className="overlay tutorial-pergunta" data-testid="tutorial-prompt">
      <div className="panel tutorial-pergunta-card">
        <div className="tutorial-pergunta-titulo">
          <GloveIcon size={34} />
          <b>Tutorial da luvinha</b>
        </div>
        <p>
          O tutorial <b>sempre</b> começa com a arena vazia: são 5 passos para
          chamar, inspecionar, comprar, fundir e vender. Durante eles nada mais
          pode ser feito.
        </p>
        <p className="tutorial-pergunta-cofre">
          Seu time guardado ({retained} {retained === 1 ? 'criatura' : 'criaturas'}) e o saldo{' '}
          <CoinIcon size={14} /> {coins} ficam no cofre e <b>voltam no fim</b> do tutorial.
        </p>
        <div className="tutorial-acoes">
          <button
            className="btn primary big"
            data-testid="tutorial-prompt-go"
            onClick={() => answer(true)}
          >
            Fazer o tutorial
          </button>
          <button
            className="btn ghost"
            data-testid="tutorial-prompt-no"
            onClick={() => answer(false)}
          >
            Jogar sem tutorial
          </button>
        </div>
        <p className="tutorial-pergunta-dica">
          Dá para repetir quando quiser em Configurações → Progresso.
        </p>
      </div>
    </div>
  );
}
