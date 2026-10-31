import { BOARD_COLS, type Side, type TileIndex } from './types';

/** Layout determinístico do tabuleiro em coordenadas de mundo. Os vãos entre
 *  slots são generosos porque as criaturas CRESCEM a cada fusão do mesmo
 *  elemento (o tsunami Nv5 tem ~1,7 de envergadura para cada lado e ~2,1 de
 *  massa para frente). O vão horizontal (3,2) comporta dois monstros grandes
 *  lado a lado e a profundidade de linha (2,3) dá folga para caudas/focinhos;
 *  o vão entre times (2 × FRONT_ROW_Z = 5,0) é o corredor de projéteis — ele
 *  não pode passar de 5,0 senão as armas de alcance mínimo (8) perdem a
 *  linha frontal inimiga (ver board.test). */

export const TILE_SPACING_X = 3.2;
export const ROW_DEPTH = 2.3;
/** Distância (|z|) da linha frontal de cada lado até o centro da arena. */
export const FRONT_ROW_Z = 2.5;
/** Altura da base das criaturas sobre a plataforma. */
export const UNIT_BASE_Y = 0.28;

/** Meia-largura útil do tabuleiro (usada pela arena e pelo enquadramento). */
export const BOARD_HALF_X = ((BOARD_COLS - 1) / 2) * TILE_SPACING_X + TILE_SPACING_X * 0.45;

/** Geometria da plataforma de cada equipe, derivada do layout dos slots. */
export const PLATFORM = {
  halfX: BOARD_HALF_X + TILE_SPACING_X * 0.2,
  frontZ: FRONT_ROW_Z - ROW_DEPTH * 0.75,
  backZ: FRONT_ROW_Z + 2 * ROW_DEPTH + ROW_DEPTH * 1.2,
  depth: 3.95 * ROW_DEPTH,
  centerZ: FRONT_ROW_Z + ROW_DEPTH * 0.625 + ROW_DEPTH * 0.6,
};

export function rowOf(tile: TileIndex): number {
  return Math.floor(tile / BOARD_COLS);
}

export function colOf(tile: TileIndex): number {
  return tile % BOARD_COLS;
}

export function tileIndex(col: number, row: number): TileIndex {
  return row * BOARD_COLS + col;
}

export function isTileInBounds(tile: TileIndex): boolean {
  return tile >= 0 && tile < BOARD_COLS * 3;
}

/** Posição no chão do slot (y = superfície da plataforma). */
export function tileGroundPosition(side: Side, tile: TileIndex): [number, number, number] {
  const col = colOf(tile);
  const row = rowOf(tile);
  const x = (col - (BOARD_COLS - 1) / 2) * TILE_SPACING_X;
  const zSign = side === 'player' ? 1 : -1;
  const z = zSign * (FRONT_ROW_Z + row * ROW_DEPTH);
  return [x, UNIT_BASE_Y, z];
}

export function sideOfZ(z: number): Side {
  return z >= 0 ? 'player' : 'ai';
}

export interface SlotPos {
  side: Side;
  tile: TileIndex;
  pos: [number, number, number];
}

/** Posição de todos os slots — a arena e o destaque de arraste desenham a
 *  partir daqui, então mudar o espaçamento reorganiza tudo junto. */
export function boardSlotPositions(): SlotPos[] {
  const out: SlotPos[] = [];
  for (const side of ['player', 'ai'] as Side[]) {
    for (let tile = 0; tile < BOARD_COLS * 3; tile++) {
      out.push({ side, tile, pos: tileGroundPosition(side, tile) });
    }
  }
  return out;
}

/** Converte uma posição mundial para o slot mais próximo (ou null fora do tabuleiro). */
export function tileFromWorld(
  x: number,
  z: number,
): { side: Side; tile: TileIndex } | null {
  const side = sideOfZ(z);
  const az = Math.abs(z);
  if (az < FRONT_ROW_Z - ROW_DEPTH * 0.6) return null;
  const maxZ = FRONT_ROW_Z + 2 * ROW_DEPTH + ROW_DEPTH * 0.7;
  if (az > maxZ) return null;
  const row = Math.round((az - FRONT_ROW_Z) / ROW_DEPTH);
  if (row < 0 || row > 2) return null;
  const halfWidth = ((BOARD_COLS - 1) / 2) * TILE_SPACING_X + TILE_SPACING_X * 0.45;
  if (Math.abs(x) > halfWidth) return null;
  const col = Math.round(x / TILE_SPACING_X + (BOARD_COLS - 1) / 2);
  if (col < 0 || col > BOARD_COLS - 1) return null;
  return { side, tile: tileIndex(col, row) };
}
