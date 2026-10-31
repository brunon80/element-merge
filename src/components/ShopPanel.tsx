import { ELEMENTS } from '../data/elements';
import { getSpecies, PURE_SPECIES_IDS } from '../data/monsters';
import { sellValue } from '../game/economy/economy';
import { useGameStore } from '../store/gameStore';
import type { SpeciesId } from '../game/types';
import { SUMMON_COST, TILES_PER_SIDE } from '../game/types';
import { CoinIcon, ElementIcon } from './icons';

/**
 * Lixeira — arrastar uma criatura da arena até aqui a vende e devolve à
 * carteira exatamente a soma do que ela custou para existir (Nv.2 = 2×Nv.1,
 * Nv.3 = 4×Nv.1 ...; híbridos valem o dobro do nível).
 */
function SellBin() {
  const sellHover = useGameStore((s) => s.sellHover);
  const held = useGameStore((s) =>
    s.dragId === null ? undefined : s.units.find((u) => u.id === s.dragId),
  );
  const refund =
    held && held.side === 'player' && !held.dying ? sellValue(held.species, held.level) : 0;
  const armed = refund > 0;

  return (
    <div
      data-testid="sell-bin"
      data-sell-target=""
      className={`sell-bin ${armed ? 'armed' : ''} ${sellHover && armed ? 'hot' : ''}`}
      title="Arraste uma criatura até aqui para vendê-la e receber as moedas de volta"
    >
      <span className="sell-bin-icon" aria-hidden="true">
        🗑
      </span>
      <span className="sell-bin-text">
        {armed ? (sellHover ? 'solte para vender' : 'lixeira — arraste até aqui') : 'lixeira · venda'}
      </span>
      {armed && (
        <span className="sell-bin-value" data-testid="sell-bin-value">
          <CoinIcon size={13} /> +{refund}
        </span>
      )}
    </div>
  );
}

/** Loja de invocação — sempre Nv.1 puro, custo fixo de 100 moedas. */
export function ShopPanel() {
  const coins = useGameStore((s) => s.coins);
  const phase = useGameStore((s) => s.phase);
  const units = useGameStore((s) => s.units);
  const summon = useGameStore((s) => s.summon);

  const alivePlayer = units.filter((u) => u.side === 'player' && !u.dying).length;
  const boardFull = alivePlayer >= TILES_PER_SIDE;
  const active = phase === 'preparation' || phase === 'combat';

  return (
    <div className="shop panel" data-testid="shop">
      <div className="shop-title">Invocar · Nível 1 · custo fixo {SUMMON_COST}</div>
      <SellBin />
      <div className="shop-cards">
        {PURE_SPECIES_IDS.map((id: SpeciesId) => {
          const def = getSpecies(id);
          const el = def.elements[0];
          const disabled = !active || coins < SUMMON_COST || boardFull;
          return (
            <button
              key={id}
              data-testid={`shop-${id}`}
              className={`shop-card el-${el} ${disabled ? 'disabled' : ''}`}
              disabled={disabled}
              onClick={() => summon(id)}
              title={
                coins < SUMMON_COST
                  ? 'Moedas insuficientes'
                  : boardFull
                    ? 'Arena cheia (12 slots)'
                    : `Invocar ${def.name}`
              }
            >
              <span className="shop-icon" style={{ color: ELEMENTS[el].glow }}>
                <ElementIcon el={el} size={30} />
              </span>
              <span className="shop-name">{def.name}</span>
              <span className="shop-cost">
                <CoinIcon size={13} /> {SUMMON_COST}
              </span>
              <span className={`shop-state ${disabled ? 'off' : 'on'}`}>
                {disabled
                  ? coins < SUMMON_COST
                    ? 'sem saldo'
                    : boardFull
                      ? 'arena cheia'
                      : ''
                  : active
                    ? 'invocar'
                    : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="shop-note">
        {phase === 'combat'
          ? 'Reforços no combate custam 100 — só volta para a próxima partida quem sobreviver.'
          : 'O exército inimigo será gerado no início do combate.'}
      </p>
    </div>
  );
}
