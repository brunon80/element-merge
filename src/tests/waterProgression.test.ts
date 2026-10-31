import { MODELS, hasLevelVariants, partsForLevel } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formName, formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { autoGrow, makeEngine, mustSummon, partsEnvelope } from './helpers';

/**
 * Progressão visual da água (fusões do mesmo elemento): cada fusão muda a
 * silhueta, começando numa GOTINHA e terminando num TSUNAMI no Nv5. Os dados
 * do modelo são puros, então o invólucro de cada forma é medido aqui (a mesma
 * Box3 que a cena usa).
 */

const LEVELS = [1, 2, 3, 4, 5] as const;
const NEREIA = getSpecies('nereia');

const tagCount = (level: number, tag: string): number =>
  partsForLevel(MODELS.nereia, level).filter((p) => p.tag === tag).length;

const geomCount = (level: number, g: string): number =>
  partsForLevel(MODELS.nereia, level).filter((p) => p.g === g).length;

describe('Evolução visual da água por fusão', () => {
  test('todo nível tem uma silhueta própria e progressivamente maior', () => {
    const sizes = LEVELS.map((l) => partsForLevel(MODELS.nereia, l).length);
    const tops = LEVELS.map((l) => formTop(NEREIA, l));

    for (let i = 1; i < LEVELS.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
    // Nv1 é uma gotinha; Nv5 é uma muralha com quase o triplo da altura
    expect(tops[0]).toBeLessThan(1.7);
    expect(tops[4]).toBeGreaterThan(4);
    expect(tops[4] / tops[0]).toBeGreaterThan(2.5);
  });

  test('a maré ganha barbatanas, cristas e funis de sucção aos poucos', () => {
    // Nv1 é só a gota com cara: sem barbatanas, sem funis, sem crista
    expect(tagCount(1, 'arm')).toBe(0);
    expect(tagCount(1, 'wing')).toBe(0);
    expect(geomCount(1, 'vortex')).toBe(0);
    expect(tagCount(1, 'crest')).toBe(0);
    // Nv2 (gota viva) já tem barbatanas e barbatanas de cima
    expect(tagCount(2, 'arm')).toBeGreaterThanOrEqual(2);
    expect(tagCount(2, 'wing')).toBeGreaterThanOrEqual(2);
    // Nv3 (ondina) afunila nas laterais com funis de sucção
    expect(geomCount(3, 'vortex')).toBeGreaterThanOrEqual(2);
    // a crista quebrando só aparece no cavalo de onda (Nv4) e no tsunami (Nv5)
    expect(tagCount(3, 'crest')).toBe(0);
    expect(tagCount(4, 'crest')).toBeGreaterThanOrEqual(1);
    expect(tagCount(5, 'crest')).toBeGreaterThanOrEqual(1);
    // a boca existe em todos os níveis (até a gotinha tem boquinha)
    for (const l of LEVELS) expect(tagCount(l, 'jaw')).toBeGreaterThanOrEqual(1);
    // o tsunami tem fragmentos orbitando e esporões de corrente atrás
    expect(geomCount(5, 'dodeca')).toBeGreaterThanOrEqual(4);
    expect(tagCount(5, 'spike')).toBeGreaterThanOrEqual(2);
    expect(geomCount(5, 'vortex')).toBeGreaterThanOrEqual(2);
  });

  test('a forma final é um tsunami: muralha larga com crista quebrando à frente', () => {
    expect(formName(NEREIA, 5)).toMatch(/tsunami/i);
    for (const l of LEVELS) expect(formName(NEREIA, l)).toBeTruthy();

    const parts = partsForLevel(MODELS.nereia, 5);
    const e = partsEnvelope(parts);
    // muralha larga de propósito: base do muro com mais de uma coluna de raio
    expect(e.maxX).toBeGreaterThanOrEqual(1.6);
    // a crista principal é um anel enorme inclinado para frente (a onda quebra)
    const crest = parts.filter((p) => p.tag === 'crest' && p.g === 'torus');
    expect(crest.length).toBeGreaterThanOrEqual(1);
    expect(crest[0].a[0]).toBeGreaterThanOrEqual(0.8);
    // jato/cume no topo do muro: uma gota grande bem alta
    expect(parts.some((p) => p.g === 'drop' && p.p[1] >= 3)).toBe(true);
    // o muro toca o chão
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.minY).toBeLessThan(0.15);
  });

  test('nenhuma forma da água invade o slot vizinho em nenhum nível', () => {
    let halfXPrev = 0;
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.nereia, l));
      const halfX = Math.max(e.maxX, -e.minX);
      // o tsunami é largo, mas ainda cabe folgado no vão entre colunas (2,3)
      expect(halfX).toBeLessThan(1.85);
      expect(halfX).toBeLessThan(TILE_SPACING_X);
      // e alarga a cada fusão — é isso que o jogador vê no tabuleiro
      expect(halfX).toBeGreaterThan(halfXPrev);
      halfXPrev = halfX;
      // nem afunda na plataforma nem passa da linha de trás
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      // o topo medido casa com a altura declarada no catálogo
      expect(e.maxY).toBeLessThanOrEqual(formTop(NEREIA, l) + 0.4);
      expect(e.maxY).toBeGreaterThanOrEqual(formTop(NEREIA, l) - 0.35);
    }
  });

  test('a nereia tem rig próprio de água e o catálogo de dados concorda', () => {
    expect(hasLevelVariants(MODELS.nereia)).toBe(true);
    expect(hasForms(NEREIA)).toBe(true);
    expect(SPECIES_RIGS.nereia).toBeTruthy();
    // os funis laterais são 'counter' (a CPU os gira em sentidos opostos)
    expect(partsForLevel(MODELS.nereia, 5).some((p) => p.tag === 'counter')).toBe(true);
  });
});

describe('Projétil acompanha o nível da maré', () => {
  test("lança d'água de um Nv5 sai de mais alto que a de um Nv1", () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 77 });
    const byLevel = autoGrow(eng, 'nereia', 16, 'player');
    const tsunami = (byLevel.get(5) ?? [])[0];
    expect(tsunami).toBeDefined();
    expect(eng.getUnit(tsunami)?.level).toBe(5);
    mustSummon(eng, 'golem', 'ai', 1);

    eng.startBattle();
    let shot = null as null | { y: number; level: number };
    for (let i = 0; i < 60 * 16 && !shot; i++) {
      eng.update(1 / 60);
      const pr = eng.world.projectiles.find((p) => p.ownerId === tsunami);
      if (pr) shot = { y: pr.pos[1], level: pr.ownerLevel };
    }
    expect(shot).not.toBeNull();
    expect(shot!.level).toBe(5);

    const base = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 77 });
    const dropUnit = mustSummon(base, 'nereia', 'player');
    mustSummon(base, 'golem', 'ai', 1);
    base.startBattle();
    let small = null as null | { y: number; level: number };
    for (let i = 0; i < 60 * 16 && !small; i++) {
      base.update(1 / 60);
      const pr = base.world.projectiles.find((p) => p.ownerId === dropUnit);
      if (pr) small = { y: pr.pos[1], level: pr.ownerLevel };
    }
    expect(small).not.toBeNull();
    expect(small!.level).toBe(1);
    // o tsunami cospe do alto do muro, bem acima da gotinha
    expect(shot!.y - small!.y).toBeGreaterThan(1);
  });
});
