import { BOARD_COLS, TILES_PER_SIDE, type MonsterLevel } from '../game/types';
import {
  FRONT_ROW_Z,
  PLATFORM,
  ROW_DEPTH,
  TILE_SPACING_X,
  UNIT_BASE_Y,
  boardSlotPositions,
  tileFromWorld,
} from '../game/board';
import { MUZZLE_HEIGHT, scaledStats } from '../data/balance';
import { formAimY, formMuzzleY, formTop, hasForms } from '../data/forms';
import { ALL_SPECIES_IDS, TREE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { MODELS, partsForLevel } from '../scene/speciesModels';
import { partsEnvelope } from './helpers';

/**
 * O tabuleiro precisa comportar as criaturas que crescem a cada fusão do mesmo
 * elemento. Estes testes amarram as constantes de layout ao invólucro real das
 * formas e à arte da arena derivada dessas mesmas constantes.
 */

const LEVELS: MonsterLevel[] = [1, 2, 3, 4, 5];
const IGNIS = getSpecies('ignis');

describe('Tabuleiro dimensionado para as formas que crescem', () => {
  test('todo slot volta ao próprio índice a partir da posição no chão', () => {
    const slots = boardSlotPositions();
    expect(slots).toHaveLength(TILES_PER_SIDE * 2);
    expect(BOARD_COLS).toBe(4);
    for (const s of slots) {
      expect(tileFromWorld(s.pos[0], s.pos[2])).toEqual({ side: s.side, tile: s.tile });
      expect(s.pos[1]).toBe(UNIT_BASE_Y);
    }
  });

  test('a plataforma de cada equipe cobre os slots com folga', () => {
    for (const s of boardSlotPositions()) {
      const az = Math.abs(s.pos[2]);
      expect(Math.abs(s.pos[0])).toBeLessThanOrEqual(PLATFORM.halfX - 1);
      expect(az).toBeGreaterThanOrEqual(PLATFORM.frontZ + 0.5);
      expect(az).toBeLessThanOrEqual(PLATFORM.backZ - 1.4);
    }
    // a beirada frontal fica atrás da linha frontal (nenhuma criatura na beirada)
    expect(PLATFORM.frontZ).toBeLessThan(FRONT_ROW_Z);
    expect(PLATFORM.backZ).toBeGreaterThan(FRONT_ROW_Z + 2 * ROW_DEPTH);
  });

  test('nenhuma forma do fogo alcança o centro do slot vizinho', () => {
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.ignis, l));
      const half = Math.max(e.maxX, -e.minX);
      // a envergadura fica contida no vão entre colunas
      expect(half).toBeLessThan(TILE_SPACING_X);
      // cauda/focinho avançam no máximo o vão de uma linha para cada lado
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      // nenhuma parte afunda abaixo da base do slot
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      // o topo medido cabe na altura declarada da forma (folga p/ HUD)
      expect(e.maxY).toBeLessThanOrEqual(formTop(IGNIS, l) + 0.4);
    }
  });

  test('nenhuma forma do vento alcança o centro do slot vizinho', () => {
    const zephyr = getSpecies('zephyr');
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.zephyr, l));
      const half = Math.max(e.maxX, -e.minX);
      // o vendaval é redondo e cabe com folga no vão entre colunas
      expect(half).toBeLessThan(TILE_SPACING_X);
      expect(half).toBeLessThanOrEqual(1.15);
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      expect(e.maxY).toBeLessThanOrEqual(formTop(zephyr, l) + 0.4);
    }
  });

  test('nenhuma forma da terra alcança o centro do slot vizinho', () => {
    const golem = getSpecies('golem');
    for (const l of LEVELS) {
      const e = partsEnvelope(partsForLevel(MODELS.golem, l));
      const half = Math.max(e.maxX, -e.minX);
      // a montanha é larga, mas ainda cabe no vão entre colunas
      expect(half).toBeLessThan(TILE_SPACING_X);
      expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
      expect(e.minY).toBeGreaterThanOrEqual(-0.06);
      expect(e.maxY).toBeLessThanOrEqual(formTop(golem, l) + 0.4);
    }
  });

  test('crescer o tabuleiro mantém as linhas frontais ao alcance', () => {
    const gap = 2 * FRONT_ROW_Z;
    for (const id of ALL_SPECIES_IDS) {
      const stats = scaledStats(getSpecies(id).base, 1);
      expect(stats.range).toBeGreaterThanOrEqual(gap + 3);
    }
  });

  test('as alturas de disparo e de mira seguem a forma da criatura', () => {
    // fogo: o Nv5 cospe do pescoço e tem o centro do corpo bem mais alto
    expect(formMuzzleY(IGNIS, 5)).toBeGreaterThan(formMuzzleY(IGNIS, 1) + 1);
    expect(formAimY(IGNIS, 5)).toBeGreaterThan(formAimY(IGNIS, 1) + 0.7);
    for (let l = 2; l <= 5; l++) {
      expect(formMuzzleY(IGNIS, l)).toBeGreaterThan(formMuzzleY(IGNIS, l - 1));
      expect(formAimY(IGNIS, l)).toBeGreaterThan(formAimY(IGNIS, l - 1));
    }
    // espécies da árvore têm UMA forma só: o canhão/mira não mudam com o nível
    expect(hasForms(IGNIS)).toBe(true);
    const magma = getSpecies('magma');
    expect(hasForms(magma)).toBe(false);
    expect(formTop(magma, 6)).toBeCloseTo(3.9, 6);
    // qualquer consulta de nível cai na única forma declarada (índice limitado)
    for (const id of TREE_SPECIES_IDS) {
      const def = getSpecies(id);
      expect(formMuzzleY(def, def.levelMin)).toBe(formMuzzleY(def, 1));
      expect(formAimY(def, def.levelMin)).toBe(formAimY(def, 10));
    }
    // e o canhão acompanha o topo declarado (nem flutuando, nem enterrado)
    expect(formMuzzleY(magma, 6)).toBeCloseTo(
      MUZZLE_HEIGHT + (formTop(magma, 6) - 1.93) * 0.45,
      6,
    );
    expect(formAimY(magma, 6)).toBeCloseTo(0.6 + (formTop(magma, 6) - 1.93) * 0.4, 6);
  });
});
