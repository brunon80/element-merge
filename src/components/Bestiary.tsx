import { ELEMENTS } from '../data/elements';
import { HYBRID_RECIPES } from '../data/fusionRecipes';
import { scaledStats } from '../data/balance';
import { ALL_SPECIES_IDS, PURE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { MonsterViewer } from '../scene/MonsterViewer';
import { ElementIcon } from './icons';
import { TARGETING_LABEL, abilityText } from './labels';

const LEVELS: MonsterLevel[] = [1, 2, 3, 4, 5];

function StatTable({ species }: { species: SpeciesId }) {
  const def = getSpecies(species);
  return (
    <table className="beast-table">
      <thead>
        <tr>
          <th>Nv</th>
          <th>Vida</th>
          <th>Dano</th>
          <th>Alcance</th>
          <th>Cadência</th>
        </tr>
      </thead>
      <tbody>
        {LEVELS.map((lv) => {
          const s = scaledStats(def.base, lv);
          return (
            <tr key={lv}>
              <td>{lv}</td>
              <td>{s.hp}</td>
              <td>{s.damage}</td>
              <td>{s.range.toFixed(1)}</td>
              <td>{(1 / s.interval).toFixed(2)}/s</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SpeciesCard({ species, unlocked }: { species: SpeciesId; unlocked: boolean }) {
  const def = getSpecies(species);
  if (!unlocked) {
    const recipe = HYBRID_RECIPES.find((r) => r.species === species);
    return (
      <div className="beast-card locked">
        <div className="beast-head">
          <b className="beast-name">???</b>
          <span className="beast-el">
            {recipe &&
              [recipe.a, recipe.b].map((el) => (
                <span key={el} style={{ color: ELEMENTS[el].glow }}>
                  <ElementIcon el={el} size={16} />
                </span>
              ))}
          </span>
        </div>
        <p className="beast-blurb">
          Espécie selada. Fusione <b>Nível 1</b> de dois elementos puros diferentes para descobri-la.
        </p>
      </div>
    );
  }
  return (
    <div className="beast-card">
      <div className="beast-head">
        <b className="beast-name">{def.name}</b>
        <span className="beast-el">
          {def.elements.map((el) => (
            <span key={el} style={{ color: ELEMENTS[el].glow }} title={ELEMENTS[el].name}>
              <ElementIcon el={el} size={16} />
            </span>
          ))}
        </span>
      </div>
      <MonsterViewer species={species} />
      <p className="beast-blurb">{def.blurb}</p>
      <div className="beast-abilities">
        {def.base.abilities.map((a, i) => (
          <div key={i}>◆ {abilityText(a)}</div>
        ))}
      </div>
      <div className="beast-target">{TARGETING_LABEL[scaledStats(def.base, 1).targeting]}</div>
      <StatTable species={species} />
    </div>
  );
}

export function Bestiary() {
  const open = useGameStore((s) => s.showBestiary);
  const setOpen = useGameStore((s) => s.setBestiary);
  const discovered = useGameStore((s) => s.discovered);
  if (!open) return null;

  const isUnlocked = (id: SpeciesId) => PURE_SPECIES_IDS.includes(id) || discovered.includes(id);
  const foundHybrids = ALL_SPECIES_IDS.filter((id) => !PURE_SPECIES_IDS.includes(id) && discovered.includes(id)).length;
  const totalHybrids = ALL_SPECIES_IDS.length - PURE_SPECIES_IDS.length;

  return (
    <div className="overlay bestiary-overlay" data-testid="bestiary">
      <div className="bestiary panel">
        <div className="beast-top">
          <h2>Enciclopédia Elemental</h2>
          <span className="beast-progress">
            Híbridos: {foundHybrids}/{totalHybrids}
          </span>
          <button className="btn ghost small" data-testid="close-bestiary" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <h3 className="beast-section">Elementos puros</h3>
        <div className="beast-grid">
          {PURE_SPECIES_IDS.map((id) => (
            <SpeciesCard key={id} species={id} unlocked />
          ))}
        </div>

        <h3 className="beast-section">Híbridos descobertos por fusão</h3>
        <p className="beast-recipes">
          {HYBRID_RECIPES.map((r) => (
            <span key={r.species} className="recipe-chip">
              <span style={{ color: ELEMENTS[r.a].glow }}>
                <ElementIcon el={r.a} size={14} />
              </span>
              +
              <span style={{ color: ELEMENTS[r.b].glow }}>
                <ElementIcon el={r.b} size={14} />
              </span>
              {discovered.includes(r.species) ? `= ${getSpecies(r.species).name}` : '= ???'}
            </span>
          ))}
        </p>
        <div className="beast-grid">
          {ALL_SPECIES_IDS
            .filter((id) => !PURE_SPECIES_IDS.includes(id))
            .map((id) => (
              <SpeciesCard key={id} species={id} unlocked={isUnlocked(id)} />
            ))}
        </div>
      </div>
    </div>
  );
}
