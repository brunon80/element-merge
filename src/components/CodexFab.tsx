import { TREE_SPECIES_IDS } from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import { BookIcon } from './icons';

/**
 * A enciclopédia é o painel de progresso do jogador (a árvore elemental é o
 * que ele coleciona), então a entrada dela não é um botãozinho escondido na
 * barra: é um botão flutuante fixo, sempre à mão, com o contador de espécies
 * da árvore descobertas — o mesmo número que o bestiário mostra no topo.
 *
 * Vive num `data-testid="open-bestiary"` ÚNICO por tela: o App monta este
 * FAB ou no card do menu (MenuScreen) ou na partida (junto com o HUD), nunca
 * nos dois ao mesmo tempo — os botões antigos (📖 da barra e 📖 do menu)
 * saíram de cena para o testid não se duplicar.
 */
export function CodexFab() {
  const setBestiary = useGameStore((s) => s.setBestiary);
  const discovered = useGameStore((s) => s.discovered);
  const foundTree = TREE_SPECIES_IDS.filter((id) => discovered.includes(id)).length;

  return (
    <button
      className="codex-fab"
      data-testid="open-bestiary"
      title="Enciclopédia elemental"
      aria-label={`Abrir enciclopédia — ${foundTree} de ${TREE_SPECIES_IDS.length} espécies da árvore elemental descobertas`}
      onClick={() => setBestiary(true)}
    >
      <BookIcon size={26} />
      <span className="codex-fab-count">
        {foundTree}/{TREE_SPECIES_IDS.length}
      </span>
    </button>
  );
}
