import { BOARD_COLS, BOARD_ROWS, TILES_PER_SIDE, MAX_LEVEL, type MonsterLevel } from '../game/types';
import {
  FRONT_ROW_Z,
  MONSTER_FOOT_R,
  PLATFORM,
  ROW_DEPTH,
  TILE_SPACING_X,
  UNIT_BASE_Y,
  boardSlotPositions,
  tileFromWorld,
} from '../game/board';
import { footprintRadius, slotFit, worldFootprintRadius } from '../data/footprints';
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

  test('o vão fundo-a-fundo passa de qualquer alcance — por isso não há porteira', () => {
    // o pior par do tabuleiro: as duas linhas de fundo, frente a frente
    const backGap = 2 * (FRONT_ROW_Z + (BOARD_ROWS - 1) * ROW_DEPTH);
    const maxRange = Math.max(
      ...ALL_SPECIES_IDS.map((id) => scaledStats(getSpecies(id).base, MAX_LEVEL).range),
    );
    // se o alcance voltasse a ser porteira de engajamento, este par travaria a
    // partida (ninguém atira e o relógio decide) — é justamente o que
    // `pickTarget` evita ao ignorar o alcance na escolha de alvo
    expect(backGap).toBeGreaterThan(maxRange);
    // a linha frontal continua se batendo de perto: até o menor alcance do jogo
    // cobre o corredor entre as duas linhas frontais
    const minRange = Math.min(
      ...ALL_SPECIES_IDS.map((id) => scaledStats(getSpecies(id).base, 1).range),
    );
    expect(2 * FRONT_ROW_Z).toBeLessThan(minRange);
  });

  test('todo figurino cabe no próprio buraco — e nunca encosta no vizinho', () => {
    // A regra do tabuleiro: o invólucro em mundo real (maior eixo, já com o
    // encaixe aplicado) fica dentro de MONSTER_FOOT_R. Como o vão entre buracos
    // é maior que 2 × MONSTER_FOOT_R, dois monstros vizinhos jamais se tocam —
    // era isso que o Colosso Nv.10 violava (7,3 × 7,0 de mundo num buraco de 3,2).
    for (const id of ALL_SPECIES_IDS) {
      const def = getSpecies(id);
      for (let l = def.levelMin; l <= def.levelMax; l++) {
        const level = l as MonsterLevel;
        expect(worldFootprintRadius(id, level)).toBeLessThanOrEqual(MONSTER_FOOT_R + 1e-9);
      }
      // nenhum figurino é esmagado até virar um brinquedo no meio do buraco
      expect(slotFit(id)).toBeGreaterThanOrEqual(0.55);
    }
    // folga entre buracos vizinhos: horizontal, profundidade e diagonal
    expect(2 * MONSTER_FOOT_R).toBeLessThan(TILE_SPACING_X);
    expect(2 * MONSTER_FOOT_R).toBeLessThan(ROW_DEPTH);
  });

  test('o encaixe não inverte a escada 2→1 (o filho sempre é maior que os pais)', () => {
    // Tolerância de 0,1: as medições autorais têm vaivéns de ~2cm entre formas
    // vizinhas (o Nv.2 do fogo espreguiça mais para frente que o Nv.3, o Nv.3 do
    // vento é mais largo que o Nv.4) — invisível em jogo. O que este pino pega é
    // inversão DE GRAU, como o antigo `1 + 0,07 × nível`, que encolhia um Nv.6 em
    // relação ao Nv.5 meio de mundo.
    for (const id of ['ignis', 'nereia', 'golem', 'zephyr'] as const) {
      for (let l = 2; l <= 5; l++) {
        expect(worldFootprintRadius(id, l as MonsterLevel)).toBeGreaterThanOrEqual(
          worldFootprintRadius(id, (l - 1) as MonsterLevel) - 0.1,
        );
      }
    }
  });

  test('a tabela de invólucros não envelheceu: casa com o invólucro analítico', () => {
    // tripé grosseiro: se alguém mexer num rig/parts e esquecer `MEDIDO`, os dois
    // números se afastam. O analítico (AABB das parts) é mais conservador que a
    // medição ao vivo, então a tolerância é larga de propósito.
    for (const id of ALL_SPECIES_IDS) {
      const parts = MODELS[id];
      if (!parts) continue; // rig autoral: sem parts para comparar
      for (let l = 1; l <= 5; l++) {
        const level = l as MonsterLevel;
        const e = partsEnvelope(partsForLevel(parts, level));
        const analytic = Math.max(e.maxX, -e.minX, e.maxZ, -e.minZ);
        expect(Math.abs(footprintRadius(id, level) - analytic)).toBeLessThan(1.2);
      }
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
