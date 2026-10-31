import { MODELS, hasLevelVariants, partsForLevel } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formName, formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { autoGrow, makeEngine, mustSummon, partsEnvelope } from './helpers';

/**
 * Progressão visual da terra (fusões do mesmo elemento): o penedo do Nv1 vira
 * montanha MUSCULAR no Nv5. Os dados do modelo são puros, então o invólucro de
 * cada forma é medido aqui (a mesma Box3 que a cena usa).
 */

const LEVELS = [1, 2, 3, 4, 5] as const;
const GOLEM = getSpecies('golem');

const tagCount = (level: number, tag: string): number =>
  partsForLevel(MODELS.golem, level).filter((p) => p.tag === tag).length;

const geoCount = (level: number, g: string): number =>
  partsForLevel(MODELS.golem, level).filter((p) => p.g === g).length;

const roleCount = (level: number, m: string): number =>
  partsForLevel(MODELS.golem, level).filter((p) => p.m === m).length;

const orbitCount = (level: number): number =>
  partsForLevel(MODELS.golem, level).filter((p) => p.group !== undefined).length;

const halfOf = (e: { minX: number; maxX: number }): number => Math.max(e.maxX, -e.minX);

describe('Evolução visual da terra por fusão', () => {
  test('todo nível tem uma silhueta própria e progressivamente maior', () => {
    const sizes = LEVELS.map((l) => partsForLevel(MODELS.golem, l).length);
    const tops = LEVELS.map((l) => formTop(GOLEM, l));

    for (let i = 1; i < LEVELS.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
    // Nv1 (penedo) é baixo; Nv5 (montanha) tem quase o triplo da altura
    expect(tops[0]).toBeLessThan(2.3);
    expect(tops[4]).toBeGreaterThan(4);
    expect(tops[4] / tops[0]).toBeGreaterThan(2);
  });

  test('a rocha ganha cara, braços e ombros de pico aos poucos', () => {
    // Nv1 é só um penedo: sem braço, sem pico, sem pedra orbitando
    expect(tagCount(1, 'arm')).toBe(0);
    expect(tagCount(1, 'spike')).toBe(0);
    expect(orbitCount(1)).toBe(0);
    // Nv2 (rocha viva) já tem tocos de braço e uma pedra flutuando
    expect(tagCount(2, 'arm')).toBeGreaterThanOrEqual(2);
    expect(orbitCount(2)).toBeGreaterThanOrEqual(1);
    // Nv3 (golem de pedra) fica de pé: base, tronco e dentes de cascalho
    expect(geoCount(3, 'cyl')).toBeGreaterThanOrEqual(1);
    expect(geoCount(3, 'box')).toBeGreaterThanOrEqual(3);
    expect(tagCount(3, 'spike')).toBeGreaterThanOrEqual(2);
    // Nv4 (colosso) alarga ombros e peito
    expect(tagCount(4, 'arm')).toBeGreaterThanOrEqual(4);
    expect(geoCount(4, 'box')).toBeGreaterThanOrEqual(6);
    // Nv5: bíceps em cápsula e punhos do tamanho de matacões
    expect(geoCount(5, 'capsule')).toBeGreaterThanOrEqual(4);
    expect(tagCount(5, 'arm')).toBeGreaterThanOrEqual(4);
    // a fenda que brilha (mandíbula) existe desde o penedo
    for (const l of LEVELS) expect(tagCount(l, 'jaw')).toBeGreaterThanOrEqual(1);
    // musgo/adornos de pedra só aparecem depois que a criatura ganha corpo
    expect(roleCount(1, 'accent')).toBe(0);
    expect(roleCount(5, 'accent')).toBeGreaterThanOrEqual(6);
  });

  test('a forma final é uma montanha muscular', () => {
    expect(formName(GOLEM, 5)).toMatch(/montanha/i);
    expect(formName(GOLEM, 5)).toMatch(/muscul/);
    for (let l = 1; l <= 5; l++) expect(formName(GOLEM, l)).toBeTruthy();

    const e = partsEnvelope(partsForLevel(MODELS.golem, 5));
    const halfX = halfOf(e);
    // larga como uma montanha: os ombros de pico quase alcançam a própria altura
    expect(halfX).toBeGreaterThanOrEqual(1.4);
    expect(e.maxY).toBeGreaterThanOrEqual(3.9);
    // mas ainda é uma criatura de pé (proporção de montanha, não de coluna)
    expect(e.maxY / halfX).toBeGreaterThan(2);
    expect(e.maxY / halfX).toBeLessThan(3.4);
    // tronco em pirâmide: um cone largo e alto forma o corpo da montanha
    const trunk = partsForLevel(MODELS.golem, 5).find(
      (p) => p.g === 'cone' && p.a[0] >= 1 && p.a[1] >= 1.8,
    );
    expect(trunk).toBeDefined();
    // picos no alto (ombros + cumeeira + coroa)
    const tallSpikes = partsForLevel(MODELS.golem, 5).filter(
      (p) => p.tag === 'spike' && p.p[1] >= 2.3,
    );
    expect(tallSpikes.length).toBeGreaterThanOrEqual(4);
    // matacões orbitando o cume (a montanha tem seu próprio cinturão de detritos)
    expect(orbitCount(5)).toBeGreaterThanOrEqual(4);
    // o penedo do Nv1 mal chega na cintura da montanha
    const e1 = partsEnvelope(partsForLevel(MODELS.golem, 1));
    expect(e.maxY / e1.maxY).toBeGreaterThan(2.5);
    expect(halfX / halfOf(e1)).toBeGreaterThan(1.8);
  });

  test('nenhuma forma da terra invade o slot vizinho em nenhum nível', () => {
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.golem, l));
      // a montanha é larga, mas o vão entre colunas ainda é maior que ela
      expect(halfOf(e)).toBeLessThan(TILE_SPACING_X);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      // nada afunda na plataforma e o topo medido casa com a altura declarada
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      expect(e.maxY).toBeLessThanOrEqual(formTop(GOLEM, l) + 0.4);
      expect(e.maxY).toBeGreaterThanOrEqual(formTop(GOLEM, l) - 0.35);
    }
  });

  test('o golem tem rig próprio de pedra e o catálogo de dados concorda', () => {
    expect(hasLevelVariants(MODELS.golem)).toBe(true);
    expect(hasForms(GOLEM)).toBe(true);
    expect(SPECIES_RIGS.golem).toBeTruthy();
    // os matacões orbitam em grupos que o rig faz girar
    expect(MODELS.golem.groups).toBeTruthy();
    // híbridos continuam sem formas por nível (rig padrão de peças)
    expect(hasLevelVariants(MODELS.nereia)).toBe(true);
    expect(hasForms(getSpecies('nereia'))).toBe(true);
    expect(hasLevelVariants(MODELS.vulcane)).toBe(false);
    expect(hasForms(getSpecies('vulcane'))).toBe(false);
  });
});

describe('Projétil acompanha o nível da montanha', () => {
  test('pedra de um Nv5 sai de mais alto que a de um Nv1', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 93 });
    const byLevel = autoGrow(eng, 'golem', 16, 'player');
    const mountain = (byLevel.get(5) ?? [])[0];
    expect(mountain).toBeDefined();
    expect(eng.getUnit(mountain)?.level).toBe(5);
    mustSummon(eng, 'nereia', 'ai', 1);

    eng.startBattle();
    let shot = null as null | { y: number; level: number };
    for (let i = 0; i < 60 * 14 && !shot; i++) {
      eng.update(1 / 60);
      const pr = eng.world.projectiles.find((p) => p.ownerId === mountain);
      if (pr) shot = { y: pr.pos[1], level: pr.ownerLevel };
    }
    expect(shot).not.toBeNull();
    expect(shot!.level).toBe(5);

    const base = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 93 });
    const rock = mustSummon(base, 'golem', 'player');
    mustSummon(base, 'nereia', 'ai', 1);
    base.startBattle();
    let small = null as null | { y: number; level: number };
    for (let i = 0; i < 60 * 14 && !small; i++) {
      base.update(1 / 60);
      const pr = base.world.projectiles.find((p) => p.ownerId === rock);
      if (pr) small = { y: pr.pos[1], level: pr.ownerLevel };
    }
    expect(small).not.toBeNull();
    expect(small!.level).toBe(1);
    // a montanha cospe do peito (~1,2 acima do penedo)
    expect(shot!.y - small!.y).toBeGreaterThan(1);
  });
});
