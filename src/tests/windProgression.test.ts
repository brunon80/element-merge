import { MODELS, hasLevelVariants, partsForLevel } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formName, formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { autoGrow, makeEngine, mustSummon, partsEnvelope } from './helpers';

/**
 * Progressão visual do vento (fusões do mesmo elemento): cada fusão muda a
 * silhueta, terminando num TORNADO no Nv5. Os dados do modelo são puros, então
 * o invólucro de cada forma é medido aqui (a mesma Box3 que a cena usa).
 */

const LEVELS = [1, 2, 3, 4, 5] as const;
const ZEPHYR = getSpecies('zephyr');

const tagCount = (level: number, tag: string): number =>
  partsForLevel(MODELS.zephyr, level).filter((p) => p.tag === tag).length;

const shellCount = (level: number): number =>
  partsForLevel(MODELS.zephyr, level).filter((p) => p.g === 'vortex').length;

describe('Evolução visual do vento por fusão', () => {
  test('todo nível tem uma silhueta própria e progressivamente maior', () => {
    const sizes = LEVELS.map((l) => partsForLevel(MODELS.zephyr, l).length);
    const tops = LEVELS.map((l) => formTop(ZEPHYR, l));

    for (let i = 1; i < LEVELS.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
    // Nv1 (sopro) é pequeno; Nv5 (tornado) tem mais do que o dobro da altura
    expect(tops[0]).toBeLessThan(2.3);
    expect(tops[4]).toBeGreaterThan(4);
    expect(tops[4] / tops[0]).toBeGreaterThan(2);
  });

  test('o vento ganha funis, pás e mandíbula de sucção aos poucos', () => {
    // Nv1 é uma bola de vento sem casca de funil; Nv2 já começa a afunilar
    expect(shellCount(1)).toBe(0);
    expect(shellCount(2)).toBeGreaterThanOrEqual(1);
    expect(tagCount(1, 'wing')).toBe(0);
    // Nv3 (funil vivo) é uma coluna de vento com casca translúcida por fora
    expect(shellCount(3)).toBeGreaterThanOrEqual(2);
    expect(tagCount(2, 'wing')).toBeGreaterThanOrEqual(2);
    expect(tagCount(3, 'wing')).toBeGreaterThanOrEqual(4);
    // mandíbula de sucção só no ciclone (Nv4) e no tornado (Nv5)
    expect(tagCount(3, 'jaw')).toBe(0);
    expect(tagCount(4, 'jaw')).toBe(1);
    expect(tagCount(5, 'jaw')).toBe(1);
    expect(tagCount(5, 'wing')).toBeGreaterThanOrEqual(6);
    // sempre há lâmina/pá da frente para a coreografia da rajada
    for (const l of LEVELS) expect(tagCount(l, 'arm')).toBeGreaterThanOrEqual(2);
    // o vendaval maior é mais instrumentado (mais anéis, mais lufadas)
    expect(partsForLevel(MODELS.zephyr, 5).filter((p) => p.g === 'torus').length).toBeGreaterThan(
      partsForLevel(MODELS.zephyr, 1).filter((p) => p.g === 'torus').length,
    );
  });

  test('a forma final é um tornado: coluna alta, estreita na base e larga no topo', () => {
    expect(formName(ZEPHYR, 5)).toMatch(/torn/i);
    for (const l of LEVELS) expect(formName(ZEPHYR, l)).toBeTruthy();

    const e = partsEnvelope(partsForLevel(MODELS.zephyr, 5));
    const half = Math.max(e.maxX, -e.minX);
    // coluna esbelta (não uma bola): altura bem maior que a metade da largura
    expect(e.maxY / half).toBeGreaterThan(3.4);
    // funil de verdade: cascas de revolução largas em cima e estreitas embaixo
    const shells = partsForLevel(MODELS.zephyr, 5).filter((p) => p.g === 'vortex');
    expect(shells.length).toBeGreaterThanOrEqual(3);
    for (const s of shells) {
      const [rBase, rTop] = s.a;
      expect(rTop).toBeGreaterThan(rBase); // todas as cascas abrem para o topo
    }
    // o funil principal fecha no gargalo da base e escancara perto da bigorna
    expect(Math.min(...shells.map((s) => s.a[0]))).toBeLessThanOrEqual(0.2);
    expect(Math.max(...shells.map((s) => s.a[1]))).toBeGreaterThanOrEqual(0.95);
    // e o funil toca o chão: a peça mais baixa do Nv5 começa quase no solo
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.minY).toBeLessThan(0.1);
  });

  test('nenhuma forma do vento invade o slot vizinho em nenhum nível', () => {
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.zephyr, l));
      const half = Math.max(e.maxX, -e.minX);
      // o vendaval é redondo: cabe folgado no vão entre colunas
      expect(half).toBeLessThan(1.15);
      expect(half).toBeLessThan(TILE_SPACING_X);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      // nada afunda na plataforma e o topo medido casa com a altura declarada
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      expect(e.maxY).toBeLessThanOrEqual(formTop(ZEPHYR, l) + 0.4);
      expect(e.maxY).toBeGreaterThanOrEqual(formTop(ZEPHYR, l) - 0.35);
    }
  });

  test('o zéfiro tem rig próprio de vento e o catálogo de dados concorda', () => {
    expect(hasLevelVariants(MODELS.zephyr)).toBe(true);
    expect(hasForms(ZEPHYR)).toBe(true);
    expect(SPECIES_RIGS.zephyr).toBeTruthy();
    // as cascas 'counter' giram no sentido contrário (dois funis entrelaçados)
    expect(partsForLevel(MODELS.zephyr, 5).some((p) => p.tag === 'counter')).toBe(true);
    // as criaturas da árvore têm uma única forma (rig de peças fixo)
    expect(hasLevelVariants(MODELS.magma)).toBe(false);
    expect(hasForms(getSpecies('magma'))).toBe(false);
    expect(partsForLevel(MODELS.magma, 6).length).toBe(MODELS.magma.parts.length);
  });
});

describe('Projétil acompanha o nível do vendaval', () => {
  test('rajada de um Nv5 sai de mais alto que a de um Nv1', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 91 });
    const byLevel = autoGrow(eng, 'zephyr', 16, 'player');
    const tornado = (byLevel.get(5) ?? [])[0];
    expect(tornado).toBeDefined();
    expect(eng.getUnit(tornado)?.level).toBe(5);
    mustSummon(eng, 'golem', 'ai', 1);

    eng.startBattle();
    let shot = null as null | { y: number; level: number; aimY: number };
    for (let i = 0; i < 60 * 14 && !shot; i++) {
      eng.update(1 / 60);
      const pr = eng.world.projectiles.find((p) => p.ownerId === tornado);
      if (pr) shot = { y: pr.pos[1], level: pr.ownerLevel, aimY: pr.aimY };
    }
    expect(shot).not.toBeNull();
    expect(shot!.level).toBe(5);

    const base = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 91 });
    const wisp = mustSummon(base, 'zephyr', 'player');
    mustSummon(base, 'golem', 'ai', 1);
    base.startBattle();
    let small = null as null | { y: number; level: number };
    for (let i = 0; i < 60 * 14 && !small; i++) {
      base.update(1 / 60);
      const pr = base.world.projectiles.find((p) => p.ownerId === wisp);
      if (pr) small = { y: pr.pos[1], level: pr.ownerLevel };
    }
    expect(small).not.toBeNull();
    expect(small!.level).toBe(1);
    // o tornado cospe do alto da coluna (~1,2 acima do sopro)
    expect(shot!.y - small!.y).toBeGreaterThan(1);
  });
});
