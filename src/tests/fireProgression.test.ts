import { MODELS, hasLevelVariants, partsForLevel, type Part } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formAimY, formName, formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { autoGrow, makeEngine, mustSummon, runSeconds } from './helpers';

/**
 * Progressão visual do fogo (fusões do mesmo elemento): cada nível precisa de
 * uma silhueta própria e crescente, terminando num dragão de fogo no Nv5.
 * Os dados de modelo são puros (sem React/Three), então dá para testar aqui.
 */

const LEVELS = [1, 2, 3, 4, 5] as const;
const IGNIS = getSpecies('ignis');

const tagCount = (level: number, tag: string): number =>
  partsForLevel(MODELS.ignis, level).filter((p) => p.tag === tag).length;

describe('Evolução visual do fogo por fusão', () => {
  test('todo nível tem uma silhueta própria e progressivamente maior', () => {
    const sizes = LEVELS.map((l) => partsForLevel(MODELS.ignis, l).length);
    const tops = LEVELS.map((l) => formTop(IGNIS, l));

    // nenhuma forma igual à anterior
    for (let i = 1; i < LEVELS.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    }
    // Nv1 (faísca) tem ~1,9 de altura; Nv5 (dragão) mais que o dobro
    expect(tops[0]).toBeLessThan(2.3);
    expect(tops[4]).toBeGreaterThan(4);
    expect(tops[4] / tops[0]).toBeGreaterThan(2);
  });

  test('as formas intermediárias ganham patas, asas e crina gradualmente', () => {
    // Nv1/Nv2: sem asas nem mandíbula; Nv3 (salamandra) começa com tocos de asa
    expect(tagCount(1, 'wing')).toBe(0);
    expect(tagCount(2, 'wing')).toBe(0);
    expect(tagCount(3, 'wing')).toBeGreaterThanOrEqual(2);
    // Nv4 ganha mandíbula (rugido) e asas maiores; Nv5 é o dragão completo
    expect(tagCount(3, 'jaw')).toBe(0);
    expect(tagCount(4, 'jaw')).toBe(1);
    expect(tagCount(5, 'jaw')).toBe(1);
    expect(tagCount(5, 'wing')).toBeGreaterThanOrEqual(6);
    // sempre existe pata/braço da frente usado na animação de arremesso
    for (const l of LEVELS) expect(tagCount(l, 'arm')).toBeGreaterThanOrEqual(2);
  });

  test('nomes das formas existem para os cinco níveis', () => {
    for (const l of LEVELS) expect(formName(IGNIS, l)).toBeTruthy();
    expect(formName(IGNIS, 5)).toMatch(/drag/i);
  });

  test('nenhuma parte sai do corpo esperado em nenhum nível', () => {
    // três rotações intrínsecas XYZ = extrínsecas Z→Y→X; aplica-se ao eixo
    // local +y da peça para achar onde a ponta (chama/garra/asinha) termina
    const axis = (r: [number, number, number]): [number, number, number] => {
      const [x, y, z] = r;
      // XYZ intrínseco (ordem do THREE.Euler) = extrínseco Z → Y → X
      let vx = -Math.sin(z);
      let vy = Math.cos(z);
      let vz = 0;
      const nx = vx * Math.cos(y) + vz * Math.sin(y);
      const nz = -vx * Math.sin(y) + vz * Math.cos(y);
      vx = nx;
      vz = nz;
      const ny = vy * Math.cos(x) - vz * Math.sin(x);
      vz = vy * Math.sin(x) + vz * Math.cos(x);
      vy = ny;
      return [vx, vy, vz];
    };

    const spanOf = (part: Part): { from: number; to: number } => {
      switch (part.g) {
        case 'drop':
          return { from: 0, to: part.a[1] ?? 1 };
        case 'cone':
          return { from: -(part.a[1] ?? 1) / 2, to: (part.a[1] ?? 1) / 2 };
        case 'cyl':
          return { from: -(part.a[2] ?? 1) / 2, to: (part.a[2] ?? 1) / 2 };
        case 'sphere':
        case 'ico':
        case 'dodeca':
        case 'octa': {
          const r = part.a[0] ?? 0.5;
          return { from: -r, to: r };
        }
        case 'box':
          return { from: -(part.a[1] ?? 1) / 2, to: (part.a[1] ?? 1) / 2 };
        default:
          return { from: 0, to: 0 };
      }
    };
    const latOf = (part: Part): number => {
      const r = part.g === 'drop' ? (part.a[0] ?? 0) * 0.8 : (part.a[0] ?? 0);
      const s = part.s ? Math.max(1, part.s[0] ?? 1) : 1;
      return r * s;
    };

    const spanByLevel: number[] = [];
    for (const l of LEVELS) {
      const parts = partsForLevel(MODELS.ignis, l);
      let minX = 0;
      let maxX = 0;
      let minY = 0;
      let maxY = 0;
      let minZ = 0;
      let maxZ = 0;
      for (const part of parts) {
        const { from, to } = spanOf(part);
        const dir = axis(part.r ?? [0, 0, 0]);
        const sy = part.s ? part.s[1] ?? 1 : 1;
        const lat = latOf(part);
        for (const t of [from, to]) {
          const px = part.p[0] + dir[0] * t * sy;
          const py = part.p[1] + dir[1] * t * sy;
          const pz = part.p[2] + dir[2] * t * sy;
          minX = Math.min(minX, px - lat);
          maxX = Math.max(maxX, px + lat);
          minY = Math.min(minY, py - lat * 0.4);
          maxY = Math.max(maxY, py + lat * 0.4);
          minZ = Math.min(minZ, pz - lat);
          maxZ = Math.max(maxZ, pz + lat);
        }
      }
      // nada afunda na plataforma nem flutua muito acima do topo declarado
      expect(minY).toBeGreaterThanOrEqual(-0.25);
      expect(maxY).toBeLessThanOrEqual(formTop(IGNIS, l) + 0.35);
      // a criatura cabe no próprio vão horizontal: a envergadura máxima fica
      // abaixo do espaçamento entre colunas (o dragão Nv5 é o mais largo)
      expect(maxX).toBeLessThan(TILE_SPACING_X);
      expect(minX).toBeGreaterThan(-TILE_SPACING_X);
      spanByLevel.push(maxX);
      // profundidade: focinho sem atravessar a linha central e cauda sem
      // avançar mais de uma linha para trás do slot
      expect(maxZ).toBeLessThan(2.9);
      expect(minZ).toBeGreaterThan(-2 * ROW_DEPTH);
    }
    // o dragão Nv5 é a forma mais larga de todas
    expect(spanByLevel[4]).toBeGreaterThan(spanByLevel[3]);
  });

  test('as quatro puras evoluem por nível; híbridos ainda não', () => {
    expect(hasLevelVariants(MODELS.ignis)).toBe(true);
    expect(hasLevelVariants(MODELS.zephyr)).toBe(true);
    expect(hasLevelVariants(MODELS.golem)).toBe(true);
    expect(hasLevelVariants(MODELS.nereia)).toBe(true);
    // o catálogo de dados concorda com o modelo 3D (mesmas espécies evoluem)
    expect(hasForms(IGNIS)).toBe(true);
    expect(hasForms(getSpecies('zephyr'))).toBe(true);
    expect(hasForms(getSpecies('golem'))).toBe(true);
    expect(hasForms(getSpecies('nereia'))).toBe(true);
    // híbridos seguem no rig padrão: todas as partes aparecem em qualquer nível
    expect(hasLevelVariants(MODELS.vulcane)).toBe(false);
    expect(hasForms(getSpecies('vulcane'))).toBe(false);
    expect(partsForLevel(MODELS.vulcane, 3).length).toBe(MODELS.vulcane.parts.length);
  });
});

describe('Projétil acompanha o nível do atirador', () => {
  test('bola de fogo de um Nv5 carrega o nível e sai de mais alto', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 500, seed: 77 });
    const byLevel = autoGrow(eng, 'ignis', 16, 'player');
    const dragon = (byLevel.get(5) ?? [])[0];
    expect(dragon).toBeDefined();
    expect(eng.getUnit(dragon)?.level).toBe(5);
    mustSummon(eng, 'nereia', 'ai', 1);

    eng.startBattle();
    let shot = null as null | { y: number; level: number; aimY: number };
    for (let i = 0; i < 60 * 12 && !shot; i++) {
      eng.update(1 / 60);
      const pr = eng.world.projectiles.find((p) => p.ownerId === dragon);
      if (pr) shot = { y: pr.pos[1], level: pr.ownerLevel, aimY: pr.aimY };
    }
    expect(shot).not.toBeNull();
    expect(shot!.level).toBe(5);

    // comparação com um Nv1 no mesmo slot: a boca de canhão sobe com a forma
    const base = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 77 });
    const imp = mustSummon(base, 'ignis', 'player');
    mustSummon(base, 'nereia', 'ai', 1);
    base.startBattle();
    let small = null as null | { y: number; level: number; aimY: number };
    for (let i = 0; i < 60 * 12 && !small; i++) {
      base.update(1 / 60);
      const pr = base.world.projectiles.find((p) => p.ownerId === imp);
      if (pr) small = { y: pr.pos[1], level: pr.ownerLevel, aimY: pr.aimY };
    }
    expect(small).not.toBeNull();
    expect(small!.level).toBe(1);
    // Nv5 cospe do pescoço (~1,1 acima) e mira no meio do corpo do alvo
    expect(shot!.y - small!.y).toBeGreaterThan(1);
    expect(shot!.aimY).toBeCloseTo(formAimY(getSpecies('nereia'), 1), 5);
  });

  test('fusão de fogo emite evento de impacto com o novo nível (fuligem)', () => {
    const eng = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 5 });
    const a = mustSummon(eng, 'ignis', 'player', 0);
    const b = mustSummon(eng, 'ignis', 'player', 1);
    eng.startBattle();
    runSeconds(eng, 0.1);
    const [merged] = eng.tryMerge(a, b).createdIds ?? [];
    const fx = eng.drainFx().filter((e) => e.type === 'mergeDone');
    expect(fx).toHaveLength(1);
    expect(fx[0].species).toBe('ignis');
    expect(fx[0].level).toBe(2);
    expect(merged).toBeDefined();
  });
});
