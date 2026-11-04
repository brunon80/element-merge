import { BOARD_COLS, BOARD_ROWS, type Side, type TileIndex } from './types';

/** Layout determinístico do tabuleiro em coordenadas de mundo.
 *
 *  O buraco é quadrado (5,2 × 5,2) porque o figurino é medido nos dois eixos e
 *  o monstro precisa CABER no próprio spot: o raio do invólucro em mundo real
 *  nunca passa de `MONSTER_FOOT_R` (2,5), e o vão entre buracos é maior que
 *  2 × 2,5. Consequência direta: dois invólucros vizinhos NUNCA se encostam —
 *  nem na horizontal, nem na profundidade, nem na diagonal.
 *
 *  Antes o vão era 3,2 × 2,3 e o Colosso (invólucro de ~7 × 7 de mundo, porque
 *  o `1 + 0,07 × nível` escalava um rig que já nasce autoral no tamanho final)
 *  cobria três buracos e derramava sobre a plataforma inimiga. As meias-medidas
 *  autorais de cada forma estão em `data/footprints.ts`, e `slotFit` reduz cada
 *  família para caber aqui.
 *
 *  O vão entre times (2 × FRONT_ROW_Z = 6,2) é o corredor de projéteis e a zona
 *  onde as linhas frontais se encaram. NÃO existe "porteira de alcance" no
 *  combate: `pickTarget` escolhe o alvo pela regra de targeting da criatura e o
 *  alcance não bloqueia ataque nenhum — assim unidade nenhuma fica inútil no
 *  fundo (ver game/combat/targeting.ts). Consequência do vão fundo-a-fundo ser
 *  ~27 e os alcances 8–13: quem fica atrás ATIRA mesmo assim; o alcance é só
 *  estatística de catálogo. */

/** Raio máximo do invólucro de um figurino em mundo real (maior eixo, já com a
 *  folga de animação). Todo bicho é escalado para respeitar este teto. */
export const MONSTER_FOOT_R = 2.5;
/** Teto de AMPLIAÇÃO do encaixe: figurinos pequenos não são inflados até encher
 *  o buraco (ver `slotFit`); o tamanho autoral manda, o teto só corta. */
export const SLOT_FIT_MAX = 1.15;

export const TILE_SPACING_X = 5.2;
export const ROW_DEPTH = 5.2;
/** Distância (|z|) da linha frontal de cada lado até o centro da arena. */
export const FRONT_ROW_Z = 3.1;
/** Altura da base das criaturas sobre a plataforma. */
export const UNIT_BASE_Y = 0.28;

/** Meia-largura útil do tabuleiro (usada pela arena e pelo enquadramento). */
export const BOARD_HALF_X = ((BOARD_COLS - 1) / 2) * TILE_SPACING_X + TILE_SPACING_X * 0.45;

/** Geometria da plataforma de cada equipe, derivada do layout dos slots.
 *  A borda frontal fica logo à frente do invólucro da linha frontal (nada de
 *  monstro pisando no abismo) e a borda de trás folga o invólucro da última. */
export const PLATFORM = {
  halfX: BOARD_HALF_X + TILE_SPACING_X * 0.2,
  frontZ: FRONT_ROW_Z - MONSTER_FOOT_R - 0.15,
  backZ: FRONT_ROW_Z + (BOARD_ROWS - 1) * ROW_DEPTH + MONSTER_FOOT_R + 0.7,
  depth: 0, // preenchido logo abaixo (assim a plataforma nunca sai torta)
  centerZ: 0,
};
PLATFORM.depth = PLATFORM.backZ - PLATFORM.frontZ;
PLATFORM.centerZ = (PLATFORM.frontZ + PLATFORM.backZ) / 2;

/** Raio da ilha flutuante (o chão visível da arena, do centro até a borda mais
 *  distante da plataforma). Arte, luz e câmera derivam daqui: quando o tabuleiro
 *  cresce, a ilha, o enquadramento e o fog acompanham sozinhos. */
export const ARENA_R = Math.hypot(PLATFORM.halfX, PLATFORM.backZ) + 2.3;
export const CAMERA_MAX_DISTANCE = ARENA_R * 2.76;
/** Teto de zoom da floresta. Ficava em ARENA_R×1.6 — MUITO mais fechado que os
 *  outros cenários (gelo 2.55, submarino 2.45, vulcânico 2.15) e ainda puxava
 *  o CAMERA_POS inicial (d=2.33×R) para dentro do clamp, quebrando o enquadro
 *  em janelas estreitas. Agora é o mesmo teto do gelo: o anel de árvores da
 *  FlorestaEnvironment é calculado a partir desta constante, então a parede de
 *  árvores se afasta junto e nunca entra na frente da câmera. */
export const SCENIC_CAMERA_MAX_DISTANCE = ARENA_R * 2.55;
export const ICE_CAMERA_MAX_DISTANCE = ARENA_R * 2.55;
export const VOLCANIC_CAMERA_MAX_DISTANCE = ARENA_R * 2.15;
export const UNDERWATER_CAMERA_MAX_DISTANCE = ARENA_R * 2.45;

/**
 * ENQUADRAMENTO DA CÂMERA — regra dura: o chão dos 24 buracos tem que ficar
 * alcançável pelo ponteiro. O dock da loja é DOM e engole o `pointerdown`, então
 * qualquer buraco projetado em cima do painel fica sem conserto (a criatura dele
 * não sai do lugar e não se funde). O alvo da órbita é deslocado para o lado do
 * jogador e a inclinação sobe ~43°, tirando a linha de fundo debaixo do dock.
 * Medido por sonda: `node qa/probe-framing.mjs` → "buracos alcançáveis 24/24".
 */
export const ORBIT_TARGET: [number, number, number] = [0, 1.4, PLATFORM.centerZ * 0.3];
export const CAMERA_POS: [number, number, number] = [
  0,
  ARENA_R * 1.6,
  ORBIT_TARGET[2] + ARENA_R * 1.7,
];

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

/** O quão fora do centro do buraco o ponteiro ainda conta como naquele buraco. */
const SLOT_SNAP = ROW_DEPTH * 0.5;

/** Converte uma posição mundial para o slot mais próximo (ou null fora do tabuleiro). */
export function tileFromWorld(
  x: number,
  z: number,
): { side: Side; tile: TileIndex } | null {
  const side = sideOfZ(z);
  const az = Math.abs(z);
  if (az < FRONT_ROW_Z - SLOT_SNAP) return null;
  const maxZ = FRONT_ROW_Z + (BOARD_ROWS - 1) * ROW_DEPTH + SLOT_SNAP;
  if (az > maxZ) return null;
  const row = Math.round((az - FRONT_ROW_Z) / ROW_DEPTH);
  if (row < 0 || row > BOARD_ROWS - 1) return null;
  const halfWidth = ((BOARD_COLS - 1) / 2) * TILE_SPACING_X + TILE_SPACING_X * 0.45;
  if (Math.abs(x) > halfWidth) return null;
  const col = Math.round(x / TILE_SPACING_X + (BOARD_COLS - 1) / 2);
  if (col < 0 || col > BOARD_COLS - 1) return null;
  return { side, tile: tileIndex(col, row) };
}
