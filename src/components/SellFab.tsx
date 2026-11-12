import { sellValue } from '../game/economy/economy';
import { useGameStore } from '../store/gameStore';
import { SellIcon } from './icons';

/**
 * 🗑 Botão flutuante de VENDA — a lixeira da loja era estreita demais para ser
 * um alvo confiável no arraste (um filete no canto do dock, do lado oposto ao
 * polegar). Ela virou este FAB, que só existe enquanto o jogador está segurando
 * uma criatura:
 *
 *  • **pulsa devagar** enquanto o arraste vive (o botão respira para dizer
 *    "estou aqui sem gritar");
 *  • **pulsa rápido** quando o arraste está em cima dele (estado `hot`), o
 *    mesmo sinal que a arena dá quando um buraco é o destino;
 *  • **soltar em cima dele vende** a criatura e devolve exatamente a soma do
 *    que ela custou para existir (Nv.2 = 2×Nv.1, Nv.3 = 4×Nv.1… híbridos valem
 *    o dobro do nível).
 *
 * Quem detecta "o dedo está em cima" é o `BattleScene`: durante o arraste o
 * canvas captura o ponteiro, então não há `pointerenter` — ele usa
 * `document.elementFromPoint` e procura `[data-sell-target]` (esta peça). O
 * glifo é o mesmo SVG customizado dos outros botões (ver `SellIcon`).
 *
 * Zona medida por sonda (`qa/probe-sell-fab.mjs`): no desktop largo ele mora na
 * borda direita, no meio da altura — fora dos 24 buracos; nas janelas compactas
 * (retrato/celular) o meio da borda direita É tabuleiro, então ele sobe para a
 * faixa livre abaixo do header. Cobrir um buraco venderia a criatura errada.
 */
export function SellFab() {
  const held = useGameStore((s) =>
    s.dragId === null ? undefined : s.units.find((u) => u.id === s.dragId),
  );
  const sellHover = useGameStore((s) => s.sellHover);

  const refund = held && held.side === 'player' && !held.dying ? sellValue(held.species, held.level) : 0;
  // sem criatura na mão (ou nada a vender) não há botão: ele é o alvo do
  // arraste, não um botão permanente da interface
  if (refund <= 0) return null;

  return (
    <button
      type="button"
      tabIndex={-1}
      data-testid="sell-fab"
      data-sell-target=""
      data-hot={sellHover ? 'true' : 'false'}
      className="sell-fab"
      aria-label={
        sellHover ? `Soltar aqui vende por ${refund} moedas` : `Arraste até aqui para vender por ${refund} moedas`
      }
      title="Solte a criatura em cima deste botão para vendê-la e receber as moedas de volta"
    >
      <SellIcon size={28} />
      <span className="sell-fab-count" data-testid="sell-fab-value">
        {sellHover ? 'solte' : `+${refund}`}
      </span>
    </button>
  );
}
