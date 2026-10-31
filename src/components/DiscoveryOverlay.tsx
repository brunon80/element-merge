import { ELEMENTS } from '../data/elements';
import { getSpecies } from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import { MonsterViewer } from '../scene/MonsterViewer';
import { ElementIcon } from './icons';

/**
 * Overlay de descoberta: dispara na primeira vez que uma espécie é criada por
 * fusão do jogador. Mostra a criatura em destaque (modelo 3D), o nome, o nível
 * e um destaque especial para o nascimento do Primordial (Nv.10).
 */
export function DiscoveryOverlay() {
  const reveal = useGameStore((s) => s.discoveryReveal);
  const dismiss = useGameStore((s) => s.dismissDiscovery);
  if (!reveal) return null;

  const def = getSpecies(reveal.species);
  return (
    <div
      className="overlay discovery-overlay"
      data-testid="discovery-overlay"
      onClick={dismiss}
    >
      <div
        className={`discovery-card panel${reveal.level10 ? ' primordial' : ''}`}
        data-testid="discovery-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="discovery-kicker">
          {reveal.level10 ? 'NASCIMENTO DO PRIMORDIAL' : 'ESPÉCIE DESCOBERTA'}
        </div>
        <div className="discovery-head">
          <b className="discovery-name" data-testid="discovery-name">
            {def.name}
          </b>
          <span className="discovery-level">Nv.{reveal.level}</span>
          <span className="discovery-els">
            {def.elements.map((el) => (
              <span key={el} style={{ color: ELEMENTS[el].glow }} title={ELEMENTS[el].name}>
                <ElementIcon el={el} size={18} />
              </span>
            ))}
          </span>
        </div>
        <MonsterViewer species={reveal.species} />
        <p className="discovery-blurb">{def.blurb}</p>
        <button
          className="btn primary"
          data-testid="discovery-close"
          onClick={dismiss}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
