import { ELEMENTS } from '../data/elements';
import { scaledStats } from '../data/balance';
import { TERRAIN_BONUS } from '../data/terrainBonuses';
import { getSpecies } from '../data/monsters';
import { useGameStore } from '../store/gameStore';
import { ElementTag } from './HUD';
import { TARGETING_LABEL, abilityText } from './labels';

/** Inspetor de atributos da criatura selecionada (jogador ou IA). */
export function InspectorPanel() {
  const selectedId = useGameStore((s) => s.selectedId);
  const units = useGameStore((s) => s.units);
  const selectUnit = useGameStore((s) => s.selectUnit);
  if (selectedId === null) return null;
  const u = units.find((x) => x.id === selectedId);
  if (!u) return null;

  const def = getSpecies(u.species);
  const stats = scaledStats(def.base, u.level);
  const resEntries = Object.entries(def.base.resist) as [keyof typeof ELEMENTS, number][];
  // Bônus de terreno: o motor embute o multiplicador no nascimento; o espelho
  // UiUnit traz o marcador e a vida REAL (u.maxHp) — dano vem da mesma fórmula.
  const terrainMult = u.terrainBoost ? 1 + TERRAIN_BONUS : 1;
  const shownHp = Math.round(u.maxHp);
  const shownDamage = Math.round(stats.damage * terrainMult);

  return (
    <div className="inspector panel" data-testid="inspector">
      <div className="insp-head">
        <div>
          <b>{def.name}</b> <span className="insp-level">Nv.{u.level}</span>
          <span className={`insp-side ${u.side}`}>{u.side === 'player' ? 'Sua' : 'Inimiga'}</span>
        </div>
        <button className="btn ghost small" onClick={() => selectUnit(null)}>
          ✕
        </button>
      </div>
      <div className="insp-elements">
        {def.elements.map((el) => (
          <ElementTag key={el} el={el} />
        ))}
      </div>
      <p className="insp-blurb">{def.blurb}</p>
      <div className="insp-stats">
        <div>
          <span>Vida</span>
          <b>
            {u.hp}/{shownHp}
          </b>
        </div>
        <div>
          <span>Dano</span>
          <b>{shownDamage}</b>
        </div>
        <div>
          <span>Alcance</span>
          <b>{stats.range.toFixed(1)}</b>
        </div>
        <div>
          <span>Cadência</span>
          <b>{stats.interval.toFixed(2)}s</b>
        </div>
        <div>
          <span>Projétil</span>
          <b>{stats.projectileSpeed.toFixed(0)} u/s</b>
        </div>
        <div>
          <span>Recarga</span>
          <b>{stats.reload.toFixed(2)}s</b>
        </div>
      </div>
      <div className="insp-line">
        <span className="insp-label">Comportamento</span> {TARGETING_LABEL[stats.targeting]}
      </div>
      {resEntries.length > 0 && (
        <div className="insp-line">
          <span className="insp-label">Resistências</span>{' '}
          {resEntries.map(([el, v]) => (
            <span key={el} className={`res-chip ${v > 0 ? 'good' : 'bad'}`}>
              {ELEMENTS[el].name} {v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`}
            </span>
          ))}
        </div>
      )}
      {u.terrainBoost && (
        <div className="insp-line" data-testid="terrain-bonus-row">
          <span className="insp-label">Bônus do cenário</span>{' '}
          <span
            className="terrain-chip"
            style={{ borderColor: ELEMENTS[u.terrainBoost].color, color: ELEMENTS[u.terrainBoost].color }}
          >
            ▲ {ELEMENTS[u.terrainBoost].name}: +{Math.round(TERRAIN_BONUS * 100)}% de dano e vida
          </span>
        </div>
      )}
      <div className="insp-abilities">
        {stats.abilities.map((a, i) => (
          <div key={i} className="ability">
            ◆ {abilityText(a)}
          </div>
        ))}
      </div>
    </div>
  );
}
