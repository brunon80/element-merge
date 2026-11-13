import { ELEMENTS } from '../data/elements';
import { getSpecies, PURE_SPECIES_IDS } from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import type { SpeciesId } from '../game/types';
import { SUMMON_COST, TILES_PER_SIDE } from '../game/types';
import { TUTORIAL_STEP_DEF } from '../game/tutorial';
import { CoinIcon, ElementIcon } from './icons';

/** Loja de invocação — sempre Nv.1 puro, custo fixo de 100 moedas.
 *  A venda por arraste NÃO mora mais aqui: a lixeira era um filete no canto do
 *  dock e virou o `SellFab`, botão flutuante que só existe durante o arraste. */
export function ShopPanel() {
  const coins = useGameStore((s) => s.coins);
  const phase = useGameStore((s) => s.phase);
  const units = useGameStore((s) => s.units);
  const summon = useGameStore((s) => s.summon);
  const tutorialStep = useGameStore((s) => s.tutorialStep);

  const alivePlayer = units.filter((u) => u.side === 'player' && !u.dying).length;
  const boardFull = alivePlayer >= TILES_PER_SIDE;
  // REGRA DE PREPARAÇÃO: a loja só funciona antes do combate. Quando a batalha
  // começa, o exército está fechado — nada de comprar reforço no calor da luta.
  const active = phase === 'preparation';
  // 🎓 no tutorial só o card do passo está liberado (a régua de verdade é o
  // store; aqui é a cortesia de já mostrar o que está fora do passo)
  const allow = tutorialStep ? TUTORIAL_STEP_DEF[tutorialStep].rules.summonAllow : null;

  return (
    <div className="shop panel" data-testid="shop">
      <div className="shop-title">Invocar · Nível 1 · custo fixo {SUMMON_COST}</div>
      <div className="shop-cards">
        {PURE_SPECIES_IDS.map((id: SpeciesId) => {
          const def = getSpecies(id);
          const el = def.elements[0];
          const doPasso = allow === null || allow.includes(id);
          const disabled = !active || coins < SUMMON_COST || boardFull || !doPasso;
          return (
            <button
              key={id}
              data-testid={`shop-${id}`}
              className={`shop-card el-${el} ${disabled ? 'disabled' : ''}`}
              data-tutorial-do-passo={doPasso ? 'true' : 'false'}
              disabled={disabled}
              onClick={() => summon(id)}
              title={
                !doPasso && active
                  ? 'No tutorial: só o monstro do passo pode ser invocado'
                  : coins < SUMMON_COST
                    ? 'Moedas insuficientes'
                    : boardFull
                      ? 'Arena cheia (12 slots)'
                      : active
                        ? `Invocar ${def.name}`
                        : 'O combate começou — o exército fecha na preparação'
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
                  ? !doPasso && active && coins >= SUMMON_COST && !boardFull
                    ? 'fora do passo'
                    : coins < SUMMON_COST
                      ? 'sem saldo'
                      : boardFull
                        ? 'arena cheia'
                        : 'em combate'
                  : active
                    ? 'invocar'
                    : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
