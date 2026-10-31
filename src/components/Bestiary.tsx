import { ELEMENTS } from '../data/elements';
import { scaledStats } from '../data/balance';
import { evolutionRecipeText } from '../game/fusion/fusionRules';
import {
  ALL_SPECIES_IDS,
  PURE_SPECIES_IDS,
  TREE_SPECIES_IDS,
  getSpecies,
} from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { MonsterViewer } from '../scene/MonsterViewer';
import { ElementIcon } from './icons';
import { TARGETING_LABEL, abilityText } from './labels';

const PURE_LEVELS: MonsterLevel[] = [1, 2, 3, 4, 5];

function StatTable({ species }: { species: SpeciesId }) {
  const def = getSpecies(species);
  // criaturas da árvore existem num único nível; puros mostram a tabela 1..5
  const levels: MonsterLevel[] =
    def.levelMin === def.levelMax
      ? [def.levelMin as MonsterLevel]
      : PURE_LEVELS;
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
        {levels.map((lv) => {
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
    // Regra de descoberta: espécie inédita é apenas uma silhueta + nível.
    // Nada de nome, elementos, atributos ou receita.
    return (
      <div className="beast-card locked">
        <div className="beast-head">
          <b className="beast-name">???</b>
          <span className="beast-el beast-level-tag">Nv.{def.levelMin}</span>
        </div>
        <MonsterViewer species={species} locked />
        <p className="beast-blurb">
          Espécie selada. Fuze duas criaturas do <b>Nível {def.levelMin - 1}</b>{' '}
          ligadas na árvore elemental para descobri-la.
        </p>
      </div>
    );
  }
  return (
    <div className="beast-card">
      <div className="beast-head">
        <b className="beast-name">{def.name}</b>
        <span className="beast-el beast-level-tag">Nv.{def.levelMin}</span>
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
      <div className="beast-recipe" data-testid={`recipe-${species}`}>
        {evolutionRecipeText(species)}
      </div>
      <StatTable species={species} />
    </div>
  );
}

/** seções da árvore por nível da espécie resultante */
const SECTIONS: { title: string; levels: number[] }[] = [
  { title: 'Nv.6 — Elementos híbridos (dois puros Nv.5)', levels: [6] },
  { title: 'Nv.7 — Elementos compostos', levels: [7] },
  { title: 'Nv.8 — Elementos avançados', levels: [8] },
  { title: 'Nv.9 — Elementos lendários', levels: [9] },
  { title: 'Nv.10 — Criatura primordial', levels: [10] },
];

export function Bestiary() {
  const open = useGameStore((s) => s.showBestiary);
  const setOpen = useGameStore((s) => s.setBestiary);
  const discovered = useGameStore((s) => s.discovered);
  if (!open) return null;

  const isUnlocked = (id: SpeciesId) =>
    PURE_SPECIES_IDS.includes(id) || discovered.includes(id);
  const foundTree = TREE_SPECIES_IDS.filter((id) => discovered.includes(id)).length;

  return (
    <div className="overlay bestiary-overlay" data-testid="bestiary">
      <div className="bestiary panel">
        <div className="beast-top">
          <h2>Enciclopédia Elemental</h2>
          <span className="beast-progress" data-testid="bestiary-progress">
            Árvore elemental: {foundTree}/{TREE_SPECIES_IDS.length}
          </span>
          <button className="btn ghost small" data-testid="close-bestiary" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <h3 className="beast-section">Elementos puros (Nv.1–5)</h3>
        <div className="beast-grid">
          {PURE_SPECIES_IDS.map((id) => (
            <SpeciesCard key={id} species={id} unlocked />
          ))}
        </div>

        {SECTIONS.map((sec) => {
          const ids = ALL_SPECIES_IDS.filter(
            (id) => !PURE_SPECIES_IDS.includes(id) && sec.levels.includes(getSpecies(id).levelMin),
          );
          if (ids.length === 0) return null;
          return (
            <section key={sec.title}>
              <h3 className="beast-section">{sec.title}</h3>
              <div className="beast-grid">
                {ids.map((id) => (
                  <SpeciesCard key={id} species={id} unlocked={isUnlocked(id)} />
                ))}
              </div>
            </section>
          );
        })}

        <p className="beast-recipes">
          Regra da árvore: toda fusão consome <b>duas criaturas do mesmo nível</b> e produz{' '}
          <b>exatamente uma</b> do nível seguinte — de graça; o custo real são as invocações
          (100 moedas cada). Fusões entre espécies diferentes só acontecem a partir do{' '}
          <b>Nível 5</b>. Receitas aparecem aqui depois que a espécie é descoberta.
        </p>
      </div>
    </div>
  );
}
