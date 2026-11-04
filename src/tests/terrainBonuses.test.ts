import { EVOLUTION_RECIPES, recipeOf } from '../data/fusionRecipes';
import { ALL_SPECIES_IDS, getSpecies } from '../data/monsters';
import {
  TERRAIN_BONUS,
  TERRAIN_ELEMENT,
  terrainBonusFor,
} from '../data/terrainBonuses';
import { scaledStats } from '../data/balance';
import { makeEngine, mustMerge, mustSummon } from './helpers';
import type { ArenaScene, ElementId, SpeciesId } from '../game/types';

/**
 * BÔNUS DE TERRENO: cada cenário favorece um elemento; espécies com esse
 * elemento NA LINHAGEM ganham +12% de vida e dano no nascimento (motor) e o
 * bônus fica visível na UI (marcador `terrainBoost` no espelho e no inspetor).
 */

const SCENES: ArenaScene[] = ['arcane', 'forest', 'ice', 'volcanic', 'underwater', 'universe-end'];

describe('Mapa de terreno', () => {
  test('cenários favorecem exatamente o elemento planejado (arcane é neutro)', () => {
    expect(TERRAIN_ELEMENT).toEqual({
      arcane: null,
      forest: 'earth',
      ice: 'water',
      volcanic: 'fire',
      underwater: 'water',
      'universe-end': 'air',
    });
  });

  test('bônus aplicado é +12% de vida e dano', () => {
    expect(TERRAIN_BONUS).toBeCloseTo(0.12);
  });
});

describe('Linhagem: `elements` da espécie é o FECHO sobre as receitas', () => {
  function closureOf(species: SpeciesId): Set<ElementId> {
    const def = getSpecies(species);
    if (def.elements.length === 1) return new Set(def.elements);
    const recipe = recipeOf(species);
    if (!recipe) throw new Error(`${species} da árvore sem receita`);
    return new Set<ElementId>([...closureOf(recipe.a), ...closureOf(recipe.b)]);
  }

  test('para TODA espécie, elements === união dos elementos dos ingredientes (puros→raiz)', () => {
    for (const id of ALL_SPECIES_IDS) {
      const def = getSpecies(id);
      const closure = [...closureOf(id)].sort();
      const declared = [...def.elements].sort();
      expect(declared).toEqual(closure); // sem elemento "de fachada": a UI pode prometer a vantagem só pela lista
    }
  });

  test('receitas cobrem toda espécie não-pura (Nv.6+ nasce só de receita)', () => {
    for (const id of ALL_SPECIES_IDS) {
      const def = getSpecies(id);
      if (def.elements.length === 1) {
        expect(recipeOf(id)).toBeNull();
      } else {
        expect(recipeOf(id)).not.toBeNull();
      }
    }
    expect(EVOLUTION_RECIPES.length).toBe(19); // 6 híbridos + 6 compostos + 4 avançados + 2 lendários + 1 primordial
  });
});

describe('Elegibilidade por linhagem (terrainBonusFor)', () => {
  test('vulcânico: fogo puro e qualquer fusão COM fogo na linhagem; terra pura não', () => {
    expect(terrainBonusFor('volcanic', 'ignis')).toBe('fire');
    expect(terrainBonusFor('volcanic', 'magma')).toBe('fire'); // fogo+terra
    expect(terrainBonusFor('volcanic', 'vulcanico')).toBe('fire'); // 3 elementos, tem fogo
    expect(terrainBonusFor('volcanic', 'zephyr')).toBeUndefined();
    expect(terrainBonusFor('volcanic', 'golem')).toBeUndefined();
  });

  test('floresta favorece linhagens com terra; fim do universo, com ar', () => {
    expect(terrainBonusFor('forest', 'golem')).toBe('earth');
    expect(terrainBonusFor('forest', 'cristal')).toBe('earth'); // madeira+areia
    expect(terrainBonusFor('forest', 'ignis')).toBeUndefined();
    expect(terrainBonusFor('universe-end', 'zephyr')).toBe('air');
    expect(terrainBonusFor('universe-end', 'raio')).toBe('air'); // fogo+ar
    expect(terrainBonusFor('universe-end', 'magma')).toBeUndefined();
  });

  test('ilha arcana é neutra: ninguém recebe bônus', () => {
    for (const id of ALL_SPECIES_IDS) expect(terrainBonusFor('arcane', id)).toBeUndefined();
  });

  test('PRIMORDIAL (4 elementos) recebe o bônus em TODO cenário com vantagem', () => {
    expect(terrainBonusFor('volcanic', 'primordial')).toBe('fire');
    expect(terrainBonusFor('ice', 'primordial')).toBe('water');
    expect(terrainBonusFor('underwater', 'primordial')).toBe('water');
    expect(terrainBonusFor('forest', 'primordial')).toBe('earth');
    expect(terrainBonusFor('universe-end', 'primordial')).toBe('air');
    expect(terrainBonusFor('arcane', 'primordial')).toBeUndefined();
  });
});

describe('Motor aplica o bônus no createUnit (vida e dano)', () => {
  test('volcânico: Ignis nasce +12% vida e dano; Gólem segue intacto', () => {
    const eng = makeEngine({ scene: 'volcanic', playerCoins: 500 });
    const fireId = mustSummon(eng, 'ignis');
    const earthId = mustSummon(eng, 'golem');
    const base = scaledStats(getSpecies('ignis').base, 1);
    const fire = eng.getUnit(fireId)!;
    const earth = eng.getUnit(earthId)!;
    expect(fire.terrainBoost).toBe('fire');
    expect(fire.maxHp).toBe(Math.round(base.hp * 1.12));
    expect(fire.hp).toBe(fire.maxHp);
    expect(fire.damage).toBe(Math.round(base.damage * 1.12));
    expect(earth.terrainBoost).toBeUndefined();
    const gBase = scaledStats(getSpecies('golem').base, 1);
    expect(earth.maxHp).toBe(gBase.hp);
    expect(earth.damage).toBe(gBase.damage);
  });

  test('o bônus vale para os DOIS lados: IA também embute no exército', () => {
    const eng = makeEngine({ scene: 'volcanic', seed: 7, difficulty: 'normal', generateTeam: true });
    mustSummon(eng, 'golem');
    mustSummon(eng, 'golem');
    eng.startBattle();
    const ai = eng.aliveUnits('ai');
    expect(ai.length).toBeGreaterThan(0);
    for (const u of ai) {
      const raw = scaledStats(getSpecies(u.species).base, u.level);
      if (u.terrainBoost) {
        expect(u.terrainBoost).toBe('fire');
        expect(u.maxHp).toBe(Math.round(raw.hp * 1.12));
      } else {
        expect(u.maxHp).toBe(raw.hp);
      }
    }
  });

  test('filho de fusão HERDA a elegibilidade: 2 Ignis Nv.1 → Gólem? não — Ignis Nv.2 ainda é fogo', () => {
    const eng = makeEngine({ scene: 'volcanic', playerCoins: 300 });
    const a = mustSummon(eng, 'ignis');
    const b = mustSummon(eng, 'ignis');
    const [childId] = mustMerge(eng, a, b);
    const child = eng.getUnit(childId)!;
    expect(child.species).toBe('ignis');
    expect(child.level).toBe(2);
    expect(child.terrainBoost).toBe('fire');
    const stats2 = scaledStats(getSpecies('ignis').base, 2);
    expect(child.maxHp).toBe(Math.round(stats2.hp * 1.12));
    expect(child.damage).toBe(Math.round(stats2.damage * 1.12));
  });

  test('troca quente de cenário no meio da partida: vale para quem NASCER depois', () => {
    const eng = makeEngine({ scene: 'arcane', playerCoins: 500 });
    const before = mustSummon(eng, 'ignis');
    expect(eng.getUnit(before)!.terrainBoost).toBeUndefined();
    eng.world.scene = 'volcanic';
    const after = mustSummon(eng, 'ignis');
    const oldU = eng.getUnit(before)!;
    const newU = eng.getUnit(after)!;
    expect(newU.terrainBoost).toBe('fire');
    expect(newU.maxHp).toBeGreaterThan(oldU.maxHp); // mesmo Nv.1: o novo já embute os +12%
    expect(oldU.terrainBoost).toBeUndefined(); // o antigo mantém os números que tinha
  });

  test('primordial (via time persistido) recebe o bônus do cenário em cada arena', () => {
    for (const scene of SCENES) {
      const eng = makeEngine({ scene, playerCoins: 0 });
      const res = eng.addRetainedUnit('primordial', 10, 0);
      expect(res.ok).toBe(true);
      const u = eng.getUnit(res.unitId!)!;
      const el = TERRAIN_ELEMENT[scene];
      expect(u.terrainBoost).toBe(el ?? undefined);
      if (el) {
        const raw = scaledStats(getSpecies('primordial').base, 10);
        expect(u.maxHp).toBe(Math.round(raw.hp * 1.12));
      }
    }
  });
});

describe('Espelho da UI (store) carrega o marcador', () => {
  test('syncUi propaga terrainBoost para o Inspetor', async () => {
    const { useGameStore, getEngine } = await import('../store/gameStore');
    useGameStore.getState().setScenario('volcanic');
    useGameStore.getState().startNewMatch();
    useGameStore.getState().summon('ignis');
    useGameStore.getState().summon('golem');
    useGameStore.getState().syncUi();
    const units = useGameStore.getState().units;
    const fire = units.find((u) => u.species === 'ignis');
    const earth = units.find((u) => u.species === 'golem');
    expect(fire?.terrainBoost).toBe('fire');
    expect(earth?.terrainBoost).toBeUndefined();
    // o cenário também chegou ao motor da partida em andamento
    expect(getEngine()!.world.scene).toBe('volcanic');
    // trocar cenário no meio da partida atualiza o motor (hot-swap)
    useGameStore.getState().setScenario('forest');
    expect(getEngine()!.world.scene).toBe('forest');
    useGameStore.getState().returnToMenu();
  });
});
