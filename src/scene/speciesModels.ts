import { MAX_LEVEL } from '../game/types';
import type { SpeciesId } from '../game/types';
import type { GeoKind } from './assets';

/**
 * Modelos procedurais por espécie — silhuetas e materiais distintos para
 * cada criatura (sem dependência de arquivos/URLs externas).
 * Novos modelos são adicionados aqui sem tocar no motor.
 */

export type MatRole =
  | 'body'
  | 'dark'
  | 'glow'
  | 'white'
  | 'black'
  | 'accent'
  | 'trans'
  | 'steam';

export interface Part {
  g: GeoKind;
  a: number[];
  p: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
  m: MatRole;
  /** rotação própria contínua (rad/s nos eixos) */
  spin?: [number, number, number];
  /** amplitude de tremor tipo chama */
  flick?: number;
  /** bucle ascendente [velocidade, alcance] (vapor/chuva) */
  rise?: [number, number];
  /** grupo orbital (rotacionado em Y no useFrame) */
  group?: number;
  /** amplitude de deslocamento por ruído (usado por rigs de shader, ex.: chama) */
  amp?: number;
  /** rótulo semântico para rigs ("arm" = braço/pata da frente do arremesso,
   *  "wing" = asa animada, "jaw" = mandíbula que abre no rugido) */
  tag?: string;
  /** faixa de nível em que a parte existe (fusões do mesmo elemento crescem) */
  minLvl?: number;
  maxLvl?: number;
}

export interface SpeciesModel {
  parts: Part[];
  /** id do grupo → velocidade de rotação em Y */
  groups?: Record<number, number>;
  /** deslocamento base de flutuação */
  floatY?: number;
  /** balanço idle (amplo p/ flutuantes) */
  bob?: number;
}

/** partes visíveis em um nível (todas quando não há variações por nível) */
export function partsForLevel(def: SpeciesModel, level: number): Part[] {
  return def.parts.filter(
    (p) => (p.minLvl ?? 1) <= level && (p.maxLvl ?? MAX_LEVEL) >= level,
  );
}

/** True quando o modelo muda de silhueta com o nível (tem partes com faixa) */
export function hasLevelVariants(def: SpeciesModel): boolean {
  return def.parts.some((p) => p.minLvl !== undefined || p.maxLvl !== undefined);
}

export interface SpeciesVisual {
  body: string;
  dark: string;
  glow: string;
  accent: string;
  bodyOpacity?: number;
  metalness?: number;
  roughness?: number;
}

export const VISUALS: Record<SpeciesId, SpeciesVisual> = {
  ignis: { body: '#ff7134', dark: '#7e2a10', glow: '#ff4b0f', accent: '#ffd23f', roughness: 0.55 },
  nereia: { body: '#4db4ff', dark: '#173e6e', glow: '#7ad4ff', accent: '#e6f7ff', bodyOpacity: 0.9, roughness: 0.15 },
  golem: { body: '#b5956a', dark: '#5c4630', glow: '#ffd27a', accent: '#7ba05b', roughness: 0.85 },
  zephyr: { body: '#cfeaff', dark: '#5d87a8', glow: '#7fd4ff', accent: '#ffffff', roughness: 0.4 },
  // Nv.6 — híbridos da árvore elemental
  raio: { body: '#ffe14d', dark: '#6b5310', glow: '#fff6b0', accent: '#9fd7ff', roughness: 0.35 },
  madeira: { body: '#7fae5f', dark: '#4d3a22', glow: '#d8f0a8', accent: '#a9d67e', roughness: 0.85 },
  magma: { body: '#5a4038', dark: '#281e1c', glow: '#ff5a1f', accent: '#ff8a2a', roughness: 0.9 },
  gelo: { body: '#eaf6ff', dark: '#5f7f96', glow: '#ffffff', accent: '#bfe4ff', bodyOpacity: 0.88, roughness: 0.1, metalness: 0.15 },
  vapor: { body: '#a87f4f', dark: '#54422a', glow: '#ffb37a', accent: '#5fa8a0', roughness: 0.35, metalness: 0.65 },
  areia: { body: '#d9b87a', dark: '#9c7c42', glow: '#ffe9a8', accent: '#bfe9ff', roughness: 0.75 },
  // Nv.7 — compostos
  tempestade: { body: '#7186a8', dark: '#333f58', glow: '#ffe066', accent: '#cfe9ff', roughness: 0.65 },
  obsidiana: { body: '#241d33', dark: '#120e1b', glow: '#8f5cff', accent: '#b9a6d9', roughness: 0.2, metalness: 0.55 },
  pantano: { body: '#66784a', dark: '#39422a', glow: '#b7e05a', accent: '#8fae5d', roughness: 0.9 },
  plasma: { body: '#ff8ae0', dark: '#7c2d63', glow: '#ffd0f2', accent: '#ffe14d', roughness: 0.3 },
  nevoa: { body: '#cfe2ea', dark: '#5f7683', glow: '#eef7fb', accent: '#a8e6ff', bodyOpacity: 0.75, roughness: 0.4 },
  cristal: { body: '#b7a6ff', dark: '#5d4a9c', glow: '#e6dcff', accent: '#8fd0ff', bodyOpacity: 0.9, roughness: 0.15, metalness: 0.3 },
  // Nv.8 — avançados
  cosmico: { body: '#2b3560', dark: '#141a33', glow: '#9ad0ff', accent: '#ffe9a8', roughness: 0.4 },
  geodo: { body: '#8a7fae', dark: '#453c63', glow: '#e0b3ff', accent: '#c77dff', roughness: 0.5, metalness: 0.2 },
  abissal: { body: '#2e5f78', dark: '#142b38', glow: '#5fe0c8', accent: '#bfe9ff', roughness: 0.35 },
  vulcanico: { body: '#4a3f3a', dark: '#221b18', glow: '#ff3d10', accent: '#ff9d3d', roughness: 0.85 },
  // Nv.9 — lendários
  astral: { body: '#39406e', dark: '#1a1f3a', glow: '#8fd6ff', accent: '#ffe9a8', roughness: 0.35 },
  colosso: { body: '#6e5c50', dark: '#372c26', glow: '#ff7a3d', accent: '#c77dff', roughness: 0.8 },
  // Nv.10 — primordial
  primordial: { body: '#d8e4f2', dark: '#5c6c85', glow: '#fff3c4', accent: '#9ad0ff', roughness: 0.3, metalness: 0.25 },
};

const EYE = (x: number, y: number, z: number, group?: number): Part => ({
  g: 'sphere',
  a: [0.095, 10, 8],
  p: [x, y, z],
  m: 'accent',
  group,
});
const PUPIL = (x: number, y: number, z: number, group?: number): Part => ({
  g: 'sphere',
  a: [0.05, 8, 6],
  p: [x, y, z + 0.05],
  m: 'black',
  group,
});

/** olho grande (vento: o rosto precisa ser lido através do funil translúcido) */
const WEYE = (x: number, y: number, z: number): Part => ({
  g: 'sphere',
  a: [0.13, 12, 10],
  p: [x, y, z],
  m: 'white',
});
const WPUPIL = (x: number, y: number, z: number): Part => ({
  g: 'sphere',
  a: [0.075, 8, 6],
  p: [x, y, z + 0.055],
  m: 'black',
});

/** olho de pedra (StoneRig desenha 'white' como brasa laranja e 'black' como órbita) */
const SEYE = (x: number, y: number, z: number): Part => ({
  g: 'sphere',
  a: [0.11, 12, 10],
  p: [x, y, z],
  m: 'white',
});
const SPUPIL = (x: number, y: number, z: number): Part => ({
  g: 'sphere',
  a: [0.06, 8, 6],
  p: [x, y, z + 0.05],
  m: 'black',
});

/** restringe uma parte aos níveis [from..to] (progressão de fusão) */
const lv = (p: Part, from: number, to = 5): Part => ({ ...p, minLvl: from, maxLvl: to });

/** espelha uma parte no eixo X (par esquerdo/direito simétrico) */
const mm = (p: Part): Part[] => [
  p,
  {
    ...p,
    p: [-p.p[0], p.p[1], p.p[2]],
    r: p.r ? [p.r[0], -p.r[1], -p.r[2]] : undefined,
  },
];

export const MODELS: Record<SpeciesId, SpeciesModel> = {
  // Fogo — progressão viva da chama. Nv1 é o imps de fogo (a gota que já
  // existe); a cada fusão do mesmo elemento o fogo CRESCE e ganha chamas
  // novas: Nv2 fica mais comprido e caudaloso, Nv3 vira salamandra de quatro
  // patas com espinhos e tocos de asa, Nv4 é a serpente alada com crina e
  // mandíbula, e Nv5 é o DRAGÃO DE FOGO completo (pescoço em S, quatro asas
  // de fogo, crina, chifres, cauda segmentada). Cada parte declara a faixa
  // de níveis em que existe (minLvl/maxLvl) — o rig mostra só as do nível da
  // unidade, então a silhueta muda de verdade (e não é só escala).
  ignis: {
    bob: 0, // a "dança da chama" é feita pelo próprio FlameRig
    floatY: 0,
    parts: [
      // ================= Nv1 — imps de fogo =================
      lv({ g: 'drop', a: [0.66, 1.5, 30, 24], p: [0, 0.18, 0], m: 'body', amp: 0.16 }, 1, 1),
      lv({ g: 'drop', a: [0.24, 0.7, 18, 16], p: [0, 1.42, -0.05], r: [0, 0, -0.16], m: 'glow', flick: 0.3, amp: 0.09 }, 1, 1),
      ...mm(lv({ g: 'drop', a: [0.16, 0.5, 14, 14], p: [0.27, 1.2, 0], r: [0, 0, -0.5], m: 'glow', flick: 0.26, amp: 0.07 }, 1, 1)),
      lv({ g: 'drop', a: [0.18, 0.8, 16, 14], p: [0, 0.6, -0.55], r: [-1.05, 0, 0], m: 'glow', flick: 0.32, amp: 0.08 }, 1, 1),
      lv({ g: 'drop', a: [0.11, 0.3, 12, 12], p: [0, 0.92, -1.1], r: [-1.35, 0, 0], m: 'glow', flick: 0.45, amp: 0.06 }, 1, 1),
      ...mm(lv({ g: 'drop', a: [0.11, 0.38, 12, 12], p: [0.54, 0.66, 0.02], r: [0, 0, -2.15], m: 'glow', flick: 0.22, amp: 0.05, tag: 'arm' }, 1, 1)),
      ...mm(lv({ g: 'drop', a: [0.15, 0.5, 14, 12], p: [0.25, 0.5, 0], r: [Math.PI, 0, 0], m: 'dark', flick: 0.16, amp: 0.05 }, 1, 1)),
      ...mm(lv(EYE(0.19, 0.95, 0.5), 1, 1)),
      ...mm(lv(PUPIL(0.19, 0.95, 0.5), 1, 1)),

      // núcleo incandescente: serve nos dois primeiros níveis
      lv({ g: 'drop', a: [0.42, 1.15, 24, 20], p: [0, 0.24, 0], m: 'glow', flick: 0.12, amp: 0.07 }, 1, 2),

      // ============ Nv2 — imps comprido (chamas maiores) ============
      lv({ g: 'drop', a: [0.64, 1.95, 30, 24], p: [0, 0.16, 0], m: 'body', amp: 0.17 }, 2, 2),
      lv({ g: 'drop', a: [0.26, 0.8, 20, 16], p: [0, 1.72, -0.06], r: [0, 0, -0.18], m: 'glow', flick: 0.3, amp: 0.1 }, 2, 2),
      ...mm(lv({ g: 'drop', a: [0.18, 0.62, 14, 14], p: [0.3, 1.5, 0], r: [0, 0, -0.55], m: 'glow', flick: 0.26, amp: 0.08 }, 2, 2)),
      ...mm(lv({ g: 'drop', a: [0.13, 0.42, 12, 12], p: [0.18, 1.98, 0], r: [0, 0, -0.32], m: 'glow', flick: 0.3, amp: 0.06 }, 2, 2)),
      lv({ g: 'drop', a: [0.2, 1.0, 16, 14], p: [0, 0.6, -0.62], r: [-1.0, 0, 0], m: 'glow', flick: 0.32, amp: 0.09 }, 2, 2),
      lv({ g: 'drop', a: [0.12, 0.4, 12, 12], p: [0, 0.98, -1.42], r: [-1.3, 0, 0], m: 'glow', flick: 0.45, amp: 0.06 }, 2, 2),
      // segunda e terceira caudas de fogo (mais chamas por todo corpo)
      ...mm(lv({ g: 'drop', a: [0.12, 0.62, 12, 12], p: [0.26, 0.5, -0.5], r: [-1.0, 0, -0.18], m: 'glow', flick: 0.35, amp: 0.06 }, 2, 2)),
      ...mm(lv({ g: 'drop', a: [0.13, 0.55, 14, 12], p: [0.6, 0.8, 0.02], r: [0, 0, -2.1], m: 'glow', flick: 0.22, amp: 0.06, tag: 'arm' }, 2, 2)),
      ...mm(lv({ g: 'drop', a: [0.17, 0.62, 14, 12], p: [0.28, 0.62, 0], r: [Math.PI, 0, 0], m: 'dark', flick: 0.16, amp: 0.05 }, 2, 2)),
      ...mm(lv(EYE(0.2, 1.28, 0.5), 2, 2)),
      ...mm(lv(PUPIL(0.2, 1.28, 0.5), 2, 2)),

      // ========= Nv3 — salamandra de fogo (patas, espinhos, pescoço) =========
      lv({ g: 'drop', a: [0.5, 1.05, 24, 20], p: [0, 0.22, -0.3], m: 'body', amp: 0.14 }, 3, 3),
      lv({ g: 'drop', a: [0.66, 1.75, 28, 22], p: [0, 0.16, 0.3], m: 'body', amp: 0.17 }, 3, 3),
      lv({ g: 'drop', a: [0.36, 1.15, 20, 18], p: [0, 0.3, 0.3], m: 'glow', flick: 0.12, amp: 0.07 }, 3, 3),
      lv({ g: 'drop', a: [0.3, 0.9, 18, 16], p: [0, 1.55, 0.62], r: [-0.5, 0, 0], m: 'body', amp: 0.12 }, 3, 3),
      lv({ g: 'drop', a: [0.38, 0.78, 20, 18], p: [0, 2.12, 0.95], r: [-0.28, 0, 0], m: 'body', amp: 0.1 }, 3, 3),
      lv({ g: 'cone', a: [0.15, 0.42, 8], p: [0, 1.98, 1.32], r: [1.4, 0, 0], m: 'dark' }, 3, 3),
      lv({ g: 'drop', a: [0.16, 0.55, 14, 14], p: [0, 2.62, 0.72], r: [-0.4, 0, 0], m: 'glow', flick: 0.3, amp: 0.08 }, 3, 3),
      ...mm(lv({ g: 'cone', a: [0.07, 0.5, 6], p: [0.2, 2.45, 0.72], r: [-0.5, 0, 0.42], m: 'glow', flick: 0.2, amp: 0.05 }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.07, 0.42, 5], p: [0.3, 1.32, -0.1], r: [-0.3, 0, 0.5], m: 'dark' }, 3, 3)),
      lv({ g: 'cone', a: [0.06, 0.5, 5], p: [0, 1.4, -0.45], r: [-0.3, 0, 0], m: 'dark' }, 3, 3),
      // patas da frente = 'arm' (usadas no arremesso da bola de fogo)
      ...mm(lv({ g: 'drop', a: [0.17, 0.72, 14, 12], p: [0.42, 0.72, 0.42], r: [Math.PI, 0, 0], m: 'dark', flick: 0.16, amp: 0.06, tag: 'arm' }, 3, 3)),
      ...mm(lv({ g: 'drop', a: [0.2, 0.78, 14, 12], p: [0.44, 0.78, -0.42], r: [Math.PI, 0, 0], m: 'dark', flick: 0.16, amp: 0.06 }, 3, 3)),
      // cauda de fogo em três segmentos que sobe em curva: ocupa pouco vão
      // atrás do slot e passa por cima da linha de trás
      lv({ g: 'drop', a: [0.22, 1.05, 18, 14], p: [0, 0.62, -0.85], r: [-0.9, 0, 0], m: 'glow', flick: 0.3, amp: 0.09 }, 3, 3),
      lv({ g: 'drop', a: [0.15, 0.6, 14, 12], p: [0, 1.25, -1.6], r: [-0.42, 0, 0], m: 'glow', flick: 0.4, amp: 0.07 }, 3, 3),
      lv({ g: 'drop', a: [0.1, 0.34, 12, 10], p: [0, 1.82, -1.85], r: [-0.05, 0, 0], m: 'glow', flick: 0.5, amp: 0.05 }, 3, 3),
      // tocos de asa (a estrutura vem nos níveis seguintes)
      ...mm(lv({ g: 'drop', a: [0.22, 0.55, 14, 12], p: [0.4, 1.5, -0.05], r: [0, 0, -1.95], s: [1, 1, 0.3], m: 'glow', flick: 0.28, amp: 0.09, tag: 'wing' }, 3, 3)),
      ...mm(lv(EYE(0.19, 2.2, 1.14), 3, 3)),
      ...mm(lv(PUPIL(0.19, 2.2, 1.14), 3, 3)),

      // ====== Nv4 — serpente alada (cabeça com mandíbula, crina, asas) ======
      lv({ g: 'drop', a: [0.56, 1.15, 24, 20], p: [0, 0.22, -0.5], m: 'body', amp: 0.15 }, 4, 4),
      lv({ g: 'drop', a: [0.72, 1.95, 30, 24], p: [0, 0.16, 0.35], m: 'body', amp: 0.18 }, 4, 4),
      lv({ g: 'drop', a: [0.4, 1.25, 20, 18], p: [0, 0.3, 0.35], m: 'glow', flick: 0.12, amp: 0.07 }, 4, 4),
      lv({ g: 'drop', a: [0.34, 0.95, 20, 16], p: [0, 1.65, 0.62], r: [-0.45, 0, 0], m: 'body', amp: 0.12 }, 4, 4),
      lv({ g: 'drop', a: [0.3, 0.8, 18, 16], p: [0, 2.3, 0.92], r: [-0.28, 0, 0], m: 'body', amp: 0.11 }, 4, 4),
      lv({ g: 'drop', a: [0.42, 0.82, 22, 18], p: [0, 2.85, 1.15], r: [-0.2, 0, 0], m: 'body', amp: 0.1 }, 4, 4),
      lv({ g: 'cone', a: [0.17, 0.5, 8], p: [0, 2.68, 1.6], r: [1.42, 0, 0], m: 'dark' }, 4, 4),
      lv({ g: 'cone', a: [0.12, 0.36, 6], p: [0, 2.5, 1.5], r: [2.6, 0, 0], m: 'dark', tag: 'jaw' }, 4, 4),
      lv({ g: 'drop', a: [0.15, 0.6, 14, 14], p: [0, 3.3, 0.82], r: [-0.55, 0, 0], m: 'glow', flick: 0.3, amp: 0.09 }, 4, 4),
      ...mm(lv({ g: 'cone', a: [0.05, 0.28, 5], p: [0.19, 3.15, 1.42], r: [-1.0, 0, 0.35], m: 'glow' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.08, 0.62, 6], p: [0.24, 3.2, 1.0], r: [-0.55, 0, 0.4], m: 'glow', flick: 0.2, amp: 0.05 }, 4, 4)),
      ...mm(lv({ g: 'drop', a: [0.16, 0.6, 14, 12], p: [0.34, 2.7, 0.72], r: [-0.3, 0, 0.62], m: 'glow', flick: 0.28, amp: 0.08 }, 4, 4)),
      ...mm(lv({ g: 'drop', a: [0.17, 0.68, 14, 12], p: [0.36, 2.1, 0.45], r: [-0.3, 0, 0.6], m: 'glow', flick: 0.26, amp: 0.08 }, 4, 4)),
      // asas de fogo: uma vela grande + dedo de chama + leque menor
      ...mm(lv({ g: 'drop', a: [0.4, 1.35, 18, 14], p: [0.5, 1.95, -0.05], r: [0, 0, -0.98], s: [1, 1, 0.28], m: 'glow', flick: 0.18, amp: 0.13, tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'drop', a: [0.13, 0.8, 12, 10], p: [0.82, 2.35, -0.35], r: [0, 0.25, -0.75], s: [1, 1, 0.3], m: 'glow', flick: 0.25, amp: 0.1, tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'drop', a: [0.28, 0.9, 16, 12], p: [0.62, 1.7, -0.5], r: [0, 0.3, -1.5], s: [1, 1, 0.3], m: 'glow', flick: 0.2, amp: 0.11, tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.08, 0.5, 5], p: [0.34, 1.55, -0.25], r: [-0.3, 0, 0.5], m: 'dark' }, 4, 4)),
      lv({ g: 'cone', a: [0.07, 0.6, 5], p: [0, 1.62, -0.55], r: [-0.3, 0, 0], m: 'dark' }, 4, 4),
      ...mm(lv({ g: 'drop', a: [0.21, 0.85, 16, 12], p: [0.46, 0.85, 0.45], r: [Math.PI, 0, 0], m: 'dark', flick: 0.14, amp: 0.06, tag: 'arm' }, 4, 4)),
      ...mm(lv({ g: 'drop', a: [0.24, 0.9, 16, 12], p: [0.5, 0.9, -0.55], r: [Math.PI, 0, 0], m: 'dark', flick: 0.14, amp: 0.06 }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.05, 0.24, 5], p: [0.5, 0.06, 0.72], r: [1.35, 0, 0], m: 'dark' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.055, 0.26, 5], p: [0.55, 0.06, -0.3], r: [1.35, 0, 0], m: 'dark' }, 4, 4)),
      lv({ g: 'drop', a: [0.26, 1.25, 18, 14], p: [0, 0.62, -1.1], r: [-0.95, 0, 0], m: 'glow', flick: 0.3, amp: 0.1 }, 4, 4),
      lv({ g: 'drop', a: [0.18, 0.8, 16, 12], p: [0, 1.28, -1.95], r: [-0.5, 0, 0], m: 'glow', flick: 0.35, amp: 0.08 }, 4, 4),
      lv({ g: 'drop', a: [0.11, 0.45, 12, 10], p: [0, 1.95, -2.3], r: [-0.12, 0, 0], m: 'glow', flick: 0.45, amp: 0.06 }, 4, 4),
      ...mm(lv({ g: 'cone', a: [0.1, 0.4, 4], p: [0.14, 2.2, -2.2], r: [-0.35, 0, -0.6], s: [1, 1, 0.3], m: 'glow', flick: 0.4, amp: 0.06 }, 4, 4)),
      ...mm(lv(EYE(0.2, 2.95, 1.42), 4, 4)),
      ...mm(lv(PUPIL(0.2, 2.95, 1.42), 4, 4)),

      // ================ Nv5 — DRAGÃO DE FOGO completo ================
      lv({ g: 'drop', a: [0.62, 1.3, 26, 20], p: [0, 0.24, -0.72], m: 'body', amp: 0.16 }, 5, 5),
      lv({ g: 'drop', a: [0.82, 2.2, 32, 26], p: [0, 0.18, 0.45], m: 'body', amp: 0.2 }, 5, 5),
      lv({ g: 'drop', a: [0.46, 1.45, 22, 18], p: [0, 0.34, 0.5], m: 'glow', flick: 0.12, amp: 0.08 }, 5, 5),
      // pescoço em dois segmentos (curva em S) + cabeça de dragão
      lv({ g: 'drop', a: [0.38, 1.05, 20, 16], p: [0, 1.85, 0.8], r: [-0.5, 0, 0], m: 'body', amp: 0.13 }, 5, 5),
      lv({ g: 'drop', a: [0.34, 0.9, 20, 16], p: [0, 2.6, 1.15], r: [-0.3, 0, 0], m: 'body', amp: 0.12 }, 5, 5),
      lv({ g: 'drop', a: [0.46, 0.9, 22, 20], p: [0, 3.25, 1.42], r: [-0.18, 0, 0], m: 'body', amp: 0.11 }, 5, 5),
      lv({ g: 'cone', a: [0.2, 0.6, 8], p: [0, 3.05, 1.95], r: [1.45, 0, 0], m: 'dark' }, 5, 5),
      lv({ g: 'cone', a: [0.14, 0.42, 6], p: [0, 2.86, 1.85], r: [2.55, 0, 0], m: 'dark', tag: 'jaw' }, 5, 5),
      lv({ g: 'drop', a: [0.17, 0.7, 16, 14], p: [0, 3.75, 1.05], r: [-0.6, 0, 0], m: 'glow', flick: 0.3, amp: 0.1 }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.06, 0.3, 5], p: [0.21, 3.6, 1.72], r: [-1.0, 0, 0.35], m: 'glow' }, 5, 5)),
      // coroa de chifres de fogo (par maior + par interno)
      ...mm(lv({ g: 'cone', a: [0.09, 0.75, 6], p: [0.27, 3.62, 1.25], r: [-0.6, 0, 0.42], m: 'glow', flick: 0.2, amp: 0.06 }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.06, 0.45, 6], p: [0.15, 3.66, 1.55], r: [-0.55, 0, 0.3], m: 'glow', flick: 0.24 }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.18, 0.6, 14, 12], p: [0.34, 3.35, 1.1], r: [-0.25, 0, 0.95], m: 'glow', flick: 0.28, amp: 0.09 }, 5, 5)),
      // crina: três pares de línguas de fogo descendo pelo pescoço
      ...mm(lv({ g: 'drop', a: [0.18, 0.7, 14, 12], p: [0.36, 3.05, 0.9], r: [-0.3, 0, 0.65], m: 'glow', flick: 0.26, amp: 0.09 }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.2, 0.8, 16, 12], p: [0.4, 2.45, 0.62], r: [-0.3, 0, 0.62], m: 'glow', flick: 0.24, amp: 0.09 }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.22, 0.85, 16, 12], p: [0.44, 1.85, 0.3], r: [-0.3, 0, 0.6], m: 'glow', flick: 0.22, amp: 0.1 }, 5, 5)),
      // quatro asas: osso de brasa + vela de chama + dedo + leque traseiro
      ...mm(lv({ g: 'cone', a: [0.07, 1.5, 6], p: [0.5, 2.5, 0.0], r: [0.3, 0, -0.78], m: 'dark', tag: 'wing', flick: 0.1 }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.5, 1.55, 20, 16], p: [0.5, 2.4, -0.1], r: [0, 0.15, -0.78], s: [1, 1, 0.3], m: 'glow', amp: 0.15, flick: 0.16, tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.15, 0.95, 14, 12], p: [0.82, 2.95, -0.5], r: [0, 0.3, -0.85], s: [1, 1, 0.3], m: 'glow', amp: 0.12, flick: 0.22, tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.36, 1.15, 18, 14], p: [0.62, 2.1, -0.65], r: [0, 0.4, -1.25], s: [1, 1, 0.3], m: 'glow', amp: 0.13, flick: 0.18, tag: 'wing' }, 5, 5)),
      // vela dorsal ao longo da espinha
      lv({ g: 'cone', a: [0.09, 0.7, 5], p: [0, 2.05, -0.35], r: [-0.35, 0, 0], m: 'dark' }, 5, 5),
      lv({ g: 'cone', a: [0.08, 0.6, 5], p: [0, 1.75, -0.95], r: [-0.3, 0, 0], m: 'dark' }, 5, 5),
      lv({ g: 'cone', a: [0.06, 0.45, 5], p: [0, 1.5, -1.5], r: [-0.3, 0, 0], m: 'dark' }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.07, 0.5, 5], p: [0.36, 1.75, -0.5], r: [-0.3, 0, 0.5], m: 'dark' }, 5, 5)),
      // patas com garras de brasa (frente = 'arm' do arremesso)
      ...mm(lv({ g: 'drop', a: [0.26, 0.95, 16, 12], p: [0.52, 0.95, 0.55], r: [Math.PI, 0, 0], m: 'dark', flick: 0.13, amp: 0.07, tag: 'arm' }, 5, 5)),
      ...mm(lv({ g: 'drop', a: [0.3, 1.05, 16, 14], p: [0.56, 1.05, -0.7], r: [Math.PI, 0, 0], m: 'dark', flick: 0.13, amp: 0.07 }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.06, 0.28, 5], p: [0.56, 0.06, 0.85], r: [1.35, 0, 0], m: 'dark' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.05, 0.24, 5], p: [0.4, 0.06, 0.72], r: [1.35, 0, 0], m: 'dark' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.065, 0.3, 5], p: [0.62, 0.06, -0.45], r: [1.35, 0, 0], m: 'dark' }, 5, 5)),
      // cauda de dragão: quatro segmentos que sobem em chama atrás do corpo
      // (curta o bastante para não sair do próprio slot nem passar da linha de trás)
      lv({ g: 'drop', a: [0.3, 1.3, 20, 16], p: [0, 0.62, -1.25], r: [-0.95, 0, 0], m: 'glow', flick: 0.3, amp: 0.11 }, 5, 5),
      lv({ g: 'drop', a: [0.22, 0.85, 18, 14], p: [0, 1.35, -2.1], r: [-0.5, 0, 0], m: 'glow', flick: 0.34, amp: 0.09 }, 5, 5),
      lv({ g: 'drop', a: [0.14, 0.55, 14, 12], p: [0, 2.15, -2.5], r: [-0.15, 0, 0], m: 'glow', flick: 0.4, amp: 0.07 }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.12, 0.5, 4], p: [0.17, 2.45, -2.45], r: [-0.35, 0, -0.6], s: [1, 1, 0.3], m: 'glow', flick: 0.4, amp: 0.07 }, 5, 5)),
      // olhos de dragão (maiores)
      ...mm(lv({ g: 'sphere', a: [0.115, 10, 8], p: [0.22, 3.38, 1.72], m: 'accent' }, 5, 5)),
      ...mm(lv({ g: 'sphere', a: [0.06, 8, 6], p: [0.22, 3.38, 1.79], m: 'black' }, 5, 5)),
    ],
  },

  // Água — progressão da maré. Nv1 é a gota que já existe (agora com cara e
  // bolhas), Nv2 é a gota viva com barbatanas, Nv3 é a ondina (corpo de pie com
  // funis de sucção nas laterais), Nv4 é o cavalo de onda com crista quebrando
  // à frente, e Nv5 é o TSUNAMI: muralha larga de água (meia-largura de quase
  // 1,7) com a crista de espuma quebrando na frente, funis de sucção nas
  // laterais, muralha de cristas atrás, jato no cume e fragmentos orbitando.
  // Tudo no material de água (waterShaders): massa translúcida com correntes e
  // espuma no topo das ondas.
  nereia: {
    bob: 0.04, // a flutuação por nível é do WaterRig
    groups: { 0: 0.62, 1: -0.5 },
    parts: [
      // ==================== Nv1 — gotinha (uma gota com cara) ====================
      lv({ g: 'drop', a: [0.42, 1.05, 20, 18], p: [0, 0.14, 0], m: 'body', amp: 0.1 }, 1, 1),
      lv({ g: 'ico', a: [0.24, 0], p: [0, 0.62, 0], m: 'glow', amp: 0.05 }, 1, 1),
      lv({ g: 'torus', a: [0.34, 0.05, 8, 22], p: [0, 0.22, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 2.2, 0] }, 1, 1),
      lv({ g: 'sphere', a: [0.08, 10, 8], p: [0.42, 0.9, 0.18], m: 'accent', group: 0, flick: 0.3 }, 1, 1),
      lv({ g: 'sphere', a: [0.06, 8, 6], p: [-0.34, 1.15, -0.16], m: 'accent', group: 0, flick: 0.26 }, 1, 1),
      ...mm(lv(WEYE(0.17, 0.62, 0.34), 1, 1)),
      ...mm(lv(WPUPIL(0.17, 0.62, 0.34), 1, 1)),
      lv({ g: 'ico', a: [0.07, 0], p: [0, 0.42, 0.44], m: 'glow', tag: 'jaw', amp: 0.03 }, 1, 1),

      // ================ Nv2 — gota viva (barbatanas + colar de bolhas) ================
      lv({ g: 'drop', a: [0.5, 1.62, 24, 20], p: [0, 0.1, 0], m: 'body', amp: 0.11 }, 2, 2),
      lv({ g: 'drop', a: [0.58, 1.8, 20, 16], p: [0, 0.06, 0], m: 'trans', amp: 0.08 }, 2, 2),
      lv({ g: 'sphere', a: [0.3, 16, 14], p: [0, 1.84, 0], m: 'body', amp: 0.14 }, 2, 2),
      lv({ g: 'ico', a: [0.26, 0], p: [0, 0.95, 0], m: 'glow', amp: 0.05 }, 2, 2),
      lv({ g: 'torus', a: [0.5, 0.06, 8, 24], p: [0, 0.55, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 2.4, 0] }, 2, 2),
      lv({ g: 'torus', a: [0.6, 0.045, 8, 26], p: [0, 1.15, 0], r: [1.4, 0.3, 0], m: 'accent', spin: [0, -1.6, 0] }, 2, 2),
      ...mm(lv({ g: 'cone', a: [0.14, 0.44, 5], p: [0.5, 0.95, 0.06], r: [0, 0, -1.32], s: [1, 1, 0.4], m: 'glow', tag: 'arm' }, 2, 2)),
      ...mm(lv({ g: 'cone', a: [0.12, 0.38, 5], p: [0.34, 1.62, -0.28], r: [0.4, 0, -0.9], m: 'dark', tag: 'wing' }, 2, 2)),
      lv({ g: 'sphere', a: [0.09, 10, 8], p: [0.55, 1.5, 0.3], m: 'accent', group: 0, flick: 0.3 }, 2, 2),
      lv({ g: 'sphere', a: [0.07, 8, 6], p: [-0.48, 1.9, -0.1], m: 'accent', group: 0, flick: 0.26 }, 2, 2),
      lv({ g: 'sphere', a: [0.05, 8, 6], p: [0.2, 2.12, -0.3], m: 'accent', group: 0, flick: 0.22 }, 2, 2),
      ...mm(lv(WEYE(0.18, 1.15, 0.32), 2, 2)),
      ...mm(lv(WPUPIL(0.18, 1.15, 0.32), 2, 2)),
      lv({ g: 'ico', a: [0.11, 0], p: [0, 0.86, 0.52], m: 'glow', tag: 'jaw', amp: 0.04 }, 2, 2),

      // ===================== Nv3 — ondina (corpo de pé + funis laterais) =====================
      lv({ g: 'cyl', a: [0.5, 0.62, 0.5, 14, 3], p: [0, 0.26, 0], m: 'dark', amp: 0.08 }, 3, 3),
      lv({ g: 'sphere', a: [0.55, 20, 16], p: [0, 0.98, 0], m: 'body', amp: 0.13 }, 3, 3),
      lv({ g: 'sphere', a: [0.42, 18, 14], p: [0, 1.62, 0.02], m: 'body', amp: 0.12 }, 3, 3),
      lv({ g: 'drop', a: [0.3, 0.72, 16, 14], p: [0, 1.94, 0], m: 'body', amp: 0.12 }, 3, 3),
      lv({ g: 'ico', a: [0.22, 0], p: [0, 1.05, 0], m: 'glow', amp: 0.05 }, 3, 3),
      ...mm(lv({ g: 'vortex', a: [0.12, 0.34, 1.15, 16, 20, 1.6, 0.06], p: [0.46, 0.3, 0], r: [0, 0, -0.26], m: 'trans', amp: 0.1, tag: 'counter' }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.16, 0.5, 5], p: [0.62, 1.35, 0.08], r: [0, 0, -1.25], s: [1, 1, 0.4], m: 'glow', tag: 'arm' }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.13, 0.42, 5], p: [0.32, 1.9, -0.4], r: [0.55, 0, -0.6], m: 'dark', tag: 'wing' }, 3, 3)),
      ...mm(lv({ g: 'sphere', a: [0.1, 10, 8], p: [0.46, 1.28, 0.32], m: 'accent' }, 3, 3)),
      lv({ g: 'sphere', a: [0.09, 10, 8], p: [0.55, 2.1, 0.35], m: 'accent', group: 0, flick: 0.3 }, 3, 3),
      lv({ g: 'sphere', a: [0.07, 8, 6], p: [-0.5, 2.5, -0.15], m: 'accent', group: 0, flick: 0.26 }, 3, 3),
      lv({ g: 'sphere', a: [0.055, 8, 6], p: [0.24, 2.7, 0.2], m: 'accent', group: 0, flick: 0.22 }, 3, 3),
      ...mm(lv(WEYE(0.24, 1.72, 0.32), 3, 3)),
      ...mm(lv(WPUPIL(0.24, 1.72, 0.32), 3, 3)),
      ...mm(lv({ g: 'box', a: [0.11, 0.08, 0.08], p: [0.11, 1.48, 0.4], m: 'dark', tag: 'jaw' }, 3, 3)),

      // ================== Nv4 — cavalo de onda (crista quebrando à frente) ==================
      lv({ g: 'sphere', a: [0.8, 24, 18], p: [0, 1.0, -0.05], s: [1.15, 1.15, 0.9], m: 'body', amp: 0.15 }, 4, 4),
      lv({ g: 'sphere', a: [0.5, 20, 16], p: [0, 0.62, -0.85], s: [1.2, 0.9, 1], m: 'dark', amp: 0.13 }, 4, 4),
      lv({ g: 'sphere', a: [0.42, 20, 16], p: [0, 2.42, -0.12], m: 'body', amp: 0.12 }, 4, 4),
      lv({ g: 'drop', a: [0.22, 0.6, 16, 14], p: [0, 2.76, -0.05], m: 'glow', amp: 0.12, flick: 0.35 }, 4, 4),
      lv({ g: 'torus', a: [0.6, 0.24, 10, 26], p: [0, 2.1, 0.5], r: [1.15, 0, 0], s: [1.3, 1.3, 0.75], m: 'body', amp: 0.13, tag: 'crest' }, 4, 4),
      lv({ g: 'sphere', a: [0.16, 12, 10], p: [0, 2.62, 0.85], m: 'accent' }, 4, 4),
      ...mm(lv({ g: 'sphere', a: [0.13, 10, 8], p: [0.52, 2.5, 0.62], m: 'accent' }, 4, 4)),
      ...mm(lv({ g: 'vortex', a: [0.14, 0.42, 1.6, 16, 22, 1.7, 0.07], p: [0.6, 0.25, -0.15], r: [0, 0, -0.22], m: 'trans', amp: 0.12, tag: 'counter' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.2, 0.6, 5], p: [0.85, 1.9, 0.05], r: [0, 0, -1.2], s: [1, 1, 0.45], m: 'glow', tag: 'arm' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.15, 0.5, 5], p: [0.45, 2.55, -0.5], r: [0.5, 0, -0.7], m: 'dark', tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'box', a: [0.34, 0.1, 0.24], p: [0.35, 1.5, 0.58], m: 'accent' }, 4, 4)),
      ...mm(lv(WEYE(0.27, 2.5, 0.26), 4, 4)),
      ...mm(lv(WPUPIL(0.27, 2.5, 0.26), 4, 4)),
      ...mm(lv({ g: 'box', a: [0.13, 0.1, 0.1], p: [0.13, 2.26, 0.38], m: 'dark', tag: 'jaw' }, 4, 4)),
      lv({ g: 'sphere', a: [0.1, 10, 8], p: [0.6, 3.1, 0.35], m: 'accent', group: 0, flick: 0.3 }, 4, 4),
      lv({ g: 'sphere', a: [0.08, 10, 8], p: [-0.55, 3.3, -0.4], m: 'accent', group: 0, flick: 0.26 }, 4, 4),
      lv({ g: 'dodeca', a: [0.09], p: [0.75, 1.4, -0.9], m: 'dark', group: 1, flick: 0.24 }, 4, 4),

      // ========================= Nv5 — TSUNAMI (muralha de água) =========================
      // o fundo largo (meia-largura 1,5) ainda cabe no vão entre colunas (2,3)
      lv({ g: 'cyl', a: [1.3, 1.5, 0.7, 20, 3], p: [0, 0.36, 0], m: 'dark', amp: 0.1 }, 5, 5),
      ...mm(lv({ g: 'sphere', a: [0.62, 20, 16], p: [-0.78, 1.15, 0], s: [1.15, 1.25, 0.85], m: 'body', amp: 0.15 }, 5, 5)),
      lv({ g: 'sphere', a: [0.7, 22, 18], p: [0, 1.35, 0], s: [1.2, 1.3, 0.9], m: 'body', amp: 0.16 }, 5, 5),
      // a crista quebrando: um anel enorme inclinado para frente (com o buraco
      // no meio, é por onde o rosto aparece)
      lv({ g: 'torus', a: [0.85, 0.3, 12, 30], p: [0, 2.5, 0.55], r: [1.2, 0, 0], s: [1.5, 1.4, 0.75], m: 'body', amp: 0.16, tag: 'crest' }, 5, 5),
      lv({ g: 'sphere', a: [0.5, 20, 16], p: [0, 2.62, -0.3], m: 'body', amp: 0.12 }, 5, 5),
      lv({ g: 'drop', a: [0.3, 0.95, 18, 16], p: [0, 3.3, -0.25], m: 'glow', amp: 0.13, flick: 0.4 }, 5, 5),
      lv({ g: 'sphere', a: [0.18, 12, 10], p: [0, 2.95, 0.95], m: 'accent' }, 5, 5),
      ...mm(lv({ g: 'sphere', a: [0.15, 12, 10], p: [0.6, 2.82, 0.75], m: 'accent' }, 5, 5)),
      ...mm(lv({ g: 'sphere', a: [0.12, 10, 8], p: [1.15, 2.6, 0.45], m: 'accent' }, 5, 5)),
      ...mm(lv({ g: 'vortex', a: [0.18, 0.42, 2.2, 18, 22, 1.7, 0.07], p: [0.88, 0.15, -0.35], r: [0, 0, -0.16], m: 'trans', amp: 0.12, tag: 'counter' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.22, 0.66, 5], p: [1.16, 2.3, 0.1], r: [0, 0, -1.15], s: [1, 1, 0.45], m: 'glow', tag: 'arm' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.17, 0.55, 5], p: [0.55, 3.0, -0.6], r: [0.55, 0, -0.65], m: 'dark', tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.4, 1.0, 5], p: [0.85, 1.15, -0.95], r: [0.15, 0, -0.28], m: 'dark', amp: 0.1, tag: 'spike' }, 5, 5)),
      lv({ g: 'cone', a: [0.5, 1.25, 6], p: [0, 1.4, -1.25], r: [0.12, 0, 0], m: 'dark', amp: 0.11, tag: 'spike' }, 5, 5),
      ...mm(lv({ g: 'box', a: [0.42, 0.12, 0.3], p: [0.4, 1.75, 0.6], m: 'accent' }, 5, 5)),
      ...mm(lv(WEYE(0.3, 2.62, 0.1), 5, 5)),
      ...mm(lv(WPUPIL(0.3, 2.62, 0.1), 5, 5)),
      ...mm(lv({ g: 'box', a: [0.16, 0.12, 0.12], p: [0.16, 2.38, 0.32], m: 'dark', tag: 'jaw' }, 5, 5)),
      // fragmentos de água/espuma orbitando o cume (0) e o fundo (1)
      lv({ g: 'dodeca', a: [0.15], p: [1.4, 3.5, 0.3], m: 'accent', group: 0, flick: 0.3 }, 5, 5),
      lv({ g: 'dodeca', a: [0.11], p: [-0.75, 3.95, -0.45], m: 'accent', group: 0, flick: 0.26 }, 5, 5),
      lv({ g: 'dodeca', a: [0.12], p: [1.08, 1.6, -1.1], m: 'dark', group: 1, flick: 0.24 }, 5, 5),
      lv({ g: 'dodeca', a: [0.09], p: [-0.9, 0.9, 1.02], m: 'dark', group: 1, flick: 0.2 }, 5, 5),
    ],
  },
  // Terra — progressão da rocha. Nv1 é um penedo (dodecaedro irregular com
  // seixos), Nv2 ganha cara e tocos de braço (rocha viva), Nv3 é o golem com
  // tronco, braços e mandíbula, Nv4 é o colosso com peito largo e ombros de
  // pico, e Nv5 é a MONTANHA MUSCULAR: traps de pedra como dois picos, placas
  // de peitoral/abdômen, bíceps em cápsula, cumeeira de montanha nas costas,
  // pedras orbitando o cume e musgo nas costelas. Tudo opaco (StoneRig): a
  // silhueta é esculpida pelo relevo procedural do shader (amp).
  golem: {
    bob: 0.02,
    groups: { 0: 0.5, 1: -0.34 },
    parts: [
      // ==================== Nv1 — penedo (só uma rocha) ====================
      lv({ g: 'dodeca', a: [0.62, 1], p: [0, 0.62, 0], m: 'body', amp: 0.1 }, 1, 1),
      lv({ g: 'dodeca', a: [0.24, 1], p: [0.5, 0.24, 0.22], m: 'dark', amp: 0.09, flick: 0.2 }, 1, 1),
      lv({ g: 'dodeca', a: [0.2, 1], p: [-0.44, 0.2, -0.24], m: 'dark', amp: 0.09, flick: 0.16 }, 1, 1),
      lv({ g: 'cone', a: [0.16, 0.34, 5], p: [-0.14, 1.2, 0.02], r: [0.2, 0, 0.35], m: 'dark', amp: 0.07 }, 1, 1),
      ...mm(lv({ g: 'cone', a: [0.12, 0.26, 5], p: [0.3, 1.12, -0.16], r: [0.1, 0, -0.7], m: 'dark', amp: 0.06 }, 1, 1)),
      ...mm(lv(SEYE(0.22, 0.74, 0.52), 1, 1)),
      ...mm(lv(SPUPIL(0.22, 0.74, 0.52), 1, 1)),
      lv({ g: 'ico', a: [0.1, 0], p: [0, 0.9, 0.5], m: 'glow', tag: 'jaw', amp: 0.03 }, 1, 1),

      // ================ Nv2 — rocha viva (cara + tocos) ==================
      lv({ g: 'dodeca', a: [0.6, 1], p: [0, 0.78, 0], m: 'body', amp: 0.1 }, 2, 2),
      lv({ g: 'dodeca', a: [0.36, 1], p: [0, 1.46, 0.02], m: 'body', amp: 0.09 }, 2, 2),
      ...mm(lv({ g: 'dodeca', a: [0.22, 1], p: [0.62, 0.98, 0], m: 'body', amp: 0.09, tag: 'arm' }, 2, 2)),
      ...mm(lv({ g: 'dodeca', a: [0.3, 1], p: [0.44, 0.3, 0], m: 'dark', amp: 0.1 }, 2, 2)),
      lv({ g: 'cone', a: [0.2, 0.42, 5], p: [-0.16, 1.74, -0.08], r: [0.2, 0, 0.4], m: 'dark', amp: 0.08 }, 2, 2),
      ...mm(lv({ g: 'cone', a: [0.13, 0.28, 5], p: [0.34, 1.66, -0.2], r: [0.1, 0, -0.7], m: 'dark', amp: 0.06 }, 2, 2)),
      ...mm(lv(SEYE(0.26, 1.5, 0.3), 2, 2)),
      ...mm(lv(SPUPIL(0.26, 1.5, 0.3), 2, 2)),
      lv({ g: 'ico', a: [0.16, 0], p: [0, 1.26, 0.5], m: 'glow', tag: 'jaw', amp: 0.04 }, 2, 2),
      lv({ g: 'sphere', a: [0.11, 10, 8], p: [0.52, 1.9, 0.34], m: 'accent', group: 0, flick: 0.3 }, 2, 2),

      // =================== Nv3 — golem de pedra ==========================
      lv({ g: 'cyl', a: [0.44, 0.5, 0.6, 12, 3], p: [0, 0.3, 0], m: 'dark', amp: 0.08 }, 3, 3),
      lv({ g: 'box', a: [0.94, 0.86, 0.74], p: [0, 1.02, 0], m: 'body', amp: 0.07 }, 3, 3),
      lv({ g: 'dodeca', a: [0.38, 1], p: [0, 1.7, 0.02], m: 'body', amp: 0.08 }, 3, 3),
      ...mm(lv({ g: 'dodeca', a: [0.3, 1], p: [0.66, 1.42, 0], m: 'dark', amp: 0.09 }, 3, 3)),
      ...mm(lv({ g: 'cyl', a: [0.19, 0.16, 0.62, 10, 4], p: [0.72, 1.02, 0.02], m: 'body', amp: 0.06, tag: 'arm' }, 3, 3)),
      ...mm(lv({ g: 'dodeca', a: [0.24, 1], p: [0.76, 0.62, 0.06], m: 'dark', amp: 0.08, tag: 'arm' }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.22, 0.5, 5], p: [0.56, 2.0, -0.14], r: [0.1, 0, -0.62], m: 'dark', amp: 0.08, tag: 'spike' }, 3, 3)),
      ...mm(lv(SEYE(0.28, 1.76, 0.3), 3, 3)),
      ...mm(lv(SPUPIL(0.28, 1.76, 0.3), 3, 3)),
      ...mm(lv({ g: 'box', a: [0.22, 0.16, 0.16], p: [0.17, 1.5, 0.36], m: 'dark', amp: 0.04, tag: 'jaw' }, 3, 3)),
      ...mm(lv({ g: 'ico', a: [0.08, 0], p: [0.52, 2.14, 0.28], m: 'accent', group: 0, flick: 0.3 }, 3, 3)),

      // ================== Nv4 — colosso de pedra =========================
      lv({ g: 'cyl', a: [0.52, 0.6, 0.82, 14, 3], p: [0, 0.4, 0], m: 'dark', amp: 0.09 }, 4, 4),
      lv({ g: 'box', a: [1.16, 1.0, 0.82], p: [0, 1.32, 0], m: 'body', amp: 0.07 }, 4, 4),
      ...mm(lv({ g: 'box', a: [0.5, 0.44, 0.3], p: [0.33, 1.6, 0.32], m: 'body', amp: 0.06 }, 4, 4)),
      lv({ g: 'box', a: [0.66, 0.6, 0.46], p: [0, 1.9, -0.34], m: 'dark', amp: 0.07 }, 4, 4),
      lv({ g: 'dodeca', a: [0.36, 1], p: [0, 2.14, 0.04], m: 'body', amp: 0.08 }, 4, 4),
      ...mm(lv({ g: 'dodeca', a: [0.34, 1], p: [0.8, 2.0, 0], m: 'dark', amp: 0.09, tag: 'spike' }, 4, 4)),
      ...mm(lv({ g: 'cyl', a: [0.22, 0.18, 0.8, 10, 4], p: [0.84, 1.42, 0.02], m: 'body', amp: 0.06, tag: 'arm' }, 4, 4)),
      ...mm(lv({ g: 'dodeca', a: [0.28, 1], p: [0.9, 0.86, 0.06], m: 'dark', amp: 0.08, tag: 'arm' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.26, 0.62, 5], p: [0.62, 2.52, -0.18], r: [0.1, 0, -0.6], m: 'dark', amp: 0.09, tag: 'spike' }, 4, 4)),
      ...mm(lv({ g: 'box', a: [0.3, 0.24, 0.2], p: [0.2, 1.76, 0.42], m: 'body', amp: 0.05 }, 4, 4)),
      ...mm(lv(SEYE(0.3, 2.2, 0.3), 4, 4)),
      ...mm(lv(SPUPIL(0.3, 2.2, 0.3), 4, 4)),
      ...mm(lv({ g: 'box', a: [0.26, 0.2, 0.18], p: [0.19, 1.94, 0.4], m: 'dark', amp: 0.04, tag: 'jaw' }, 4, 4)),
      ...mm(lv({ g: 'ico', a: [0.1, 0], p: [0.6, 2.72, 0.3], m: 'accent', group: 0, flick: 0.3 }, 4, 4)),
      lv({ g: 'ico', a: [0.14, 0], p: [0, 2.62, -0.62], m: 'accent', group: 1, flick: 0.24 }, 4, 4),

      // ============= Nv5 — MONTANHA MUSCULAR (forma final) ==============
      // base larga + quadris
      lv({ g: 'cyl', a: [0.7, 0.84, 0.9, 16, 4], p: [0, 0.44, 0], m: 'dark', amp: 0.11 }, 5, 5),
      ...mm(lv({ g: 'dodeca', a: [0.36, 1], p: [0.46, 0.5, 0], m: 'dark', amp: 0.1 }, 5, 5)),
      // coxas e canelas (grossas, de montanha)
      ...mm(lv({ g: 'capsule', a: [0.27, 0.6, 8, 12], p: [0.46, 1.16, 0.02], m: 'body', amp: 0.07 }, 5, 5)),
      ...mm(lv({ g: 'dodeca', a: [0.26, 1], p: [0.46, 1.66, 0.04], m: 'dark', amp: 0.08 }, 5, 5)),
      // tronco em pirâmide + peitorais largos (os "músculos")
      lv({ g: 'cone', a: [1.2, 1.9, 8], p: [0, 1.6, 0], s: [1, 1, 0.8], m: 'body', amp: 0.075 }, 5, 5),
      ...mm(lv({ g: 'box', a: [0.74, 0.44, 0.36], p: [0.42, 2.44, 0.44], m: 'body', amp: 0.06 }, 5, 5)),
      ...mm(lv({ g: 'box', a: [0.6, 0.52, 0.34], p: [0.72, 2.34, -0.12], m: 'body', amp: 0.06, tag: 'spike' }, 5, 5)),
      // abdômen em placas + costelas de musgo
      ...mm(lv({ g: 'box', a: [0.42, 0.22, 0.22], p: [0.22, 1.9, 0.72], m: 'body', amp: 0.05 }, 5, 5)),
      ...mm(lv({ g: 'box', a: [0.38, 0.2, 0.2], p: [0.2, 1.62, 0.7], m: 'body', amp: 0.05 }, 5, 5)),
      ...mm(lv({ g: 'box', a: [0.56, 0.14, 0.26], p: [0.5, 1.74, 0.5], m: 'accent', amp: 0.03 }, 5, 5)),
      // braços: ombro-pico, bíceps em cápsula, punho de rocha
      ...mm(lv({ g: 'dodeca', a: [0.4, 1], p: [1.02, 2.62, 0], m: 'dark', amp: 0.1, tag: 'spike' }, 5, 5)),
      ...mm(lv({ g: 'capsule', a: [0.23, 0.66, 8, 12], p: [1.14, 2.0, 0.02], m: 'body', amp: 0.06, tag: 'arm' }, 5, 5)),
      ...mm(lv({ g: 'dodeca', a: [0.32, 1], p: [1.24, 1.3, 0.06], m: 'body', amp: 0.09, tag: 'arm' }, 5, 5)),
      // cabeça encaixada no trapézio + coroa de picos
      lv({ g: 'dodeca', a: [0.36, 1], p: [0, 3.0, 0.02], m: 'body', amp: 0.08 }, 5, 5),
      lv({ g: 'cone', a: [0.26, 0.56, 5], p: [0, 3.42, -0.06], r: [0.12, 0, 0.22], m: 'dark', amp: 0.08, tag: 'spike' }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.14, 0.32, 5], p: [0.3, 3.3, -0.16], r: [0.1, 0, -0.62], m: 'dark', amp: 0.06 }, 5, 5)),
      ...mm(lv(SEYE(0.3, 3.06, 0.3), 5, 5)),
      ...mm(lv(SPUPIL(0.3, 3.06, 0.3), 5, 5)),
      ...mm(lv({ g: 'box', a: [0.3, 0.22, 0.2], p: [0.22, 2.78, 0.42], m: 'dark', amp: 0.04, tag: 'jaw' }, 5, 5)),
      // cumeeira de montanha nas costas + cristas laterais
      lv({ g: 'cone', a: [0.72, 1.6, 6], p: [0, 2.1, -0.96], m: 'dark', amp: 0.12, tag: 'spike' }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.36, 0.9, 5], p: [0.56, 1.9, -0.86], r: [0, 0, -0.3], m: 'dark', amp: 0.1, tag: 'spike' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.24, 0.6, 5], p: [0.94, 1.66, -0.62], r: [0, 0, -0.5], m: 'dark', amp: 0.09, tag: 'spike' }, 5, 5)),
      // pedras soltas orbitando o cume (group 0) e a base (group 1)
      ...mm(lv({ g: 'dodeca', a: [0.16, 1], p: [1.28, 3.5, 0.5], m: 'accent', group: 0, amp: 0.05, flick: 0.3 }, 5, 5)),
      ...mm(lv({ g: 'dodeca', a: [0.12, 1], p: [0.66, 3.9, -0.7], m: 'accent', group: 0, amp: 0.05, flick: 0.26 }, 5, 5)),
      ...mm(lv({ g: 'dodeca', a: [0.1, 1], p: [0.92, 2.2, 1.12], m: 'accent', group: 1, amp: 0.05, flick: 0.22 }, 5, 5)),
      ...mm(lv({ g: 'dodeca', a: [0.1, 1], p: [0.72, 1.08, -1.06], m: 'accent', group: 1, amp: 0.05, flick: 0.2 }, 5, 5)),
    ],
  },
  // Ar — progressão do vendaval. Nv1 é o sopro (wisp redondo com anéis), Nv2
  // ganha corpo de funil, Nv3 vira um funil vivo de verdade (casca translúcida
  // + coluna de vento), Nv4 é o ciclone com mandíbula de sucção, e Nv5 é o
  // TORNADO: coluna que estreita na base e abre no topo, funis cruzados girando
  // em sentidos opostos, bigorna de nuvem e anéis de sucção no chão. As peças
  // usam 'vortex' (casca de revolução) e o WindRig torce/rotaciona tudo nos
  // shaders — o funil cisalha (a base gira mais rápido que o topo).
  zephyr: {
    floatY: 0, // quem decide a flutuação é o próprio WindRig (por nível)
    bob: 0,
    groups: { 0: 1.9 },
    parts: [
      // ================== Nv1 — sopro (wisp redondo) ==================
      lv({ g: 'sphere', a: [0.52, 20, 16], p: [0, 0.88, 0], m: 'body', amp: 0.15 }, 1, 1),
      lv({ g: 'ico', a: [0.36], p: [0, 0.9, 0], m: 'glow', amp: 0.06 }, 1, 1),
      lv({ g: 'cyl', a: [0.42, 0.2, 0.55, 16, 3, 1], p: [0, 0.36, 0], m: 'accent', amp: 0.1 }, 1, 1),
      lv({ g: 'torus', a: [0.6, 0.055, 10, 26], p: [0, 0.9, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 0, 2.4] }, 1, 1),
      lv({ g: 'torus', a: [0.72, 0.042, 10, 26], p: [0, 0.94, 0], r: [1.2, 0.5, 0], m: 'accent', spin: [0.8, 0, 0] }, 1, 1),
      ...mm(lv({ g: 'cone', a: [0.13, 0.42, 5], p: [0.5, 0.96, 0.06], r: [0, 0, -1.32], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 1, 1)),
      lv({ g: 'sphere', a: [0.13, 10, 8], p: [0.78, 0.66, 0.14], m: 'accent', group: 0, amp: 0.05 }, 1, 1),
      lv({ g: 'sphere', a: [0.1, 10, 8], p: [-0.66, 1.14, 0.3], m: 'accent', group: 0, amp: 0.05 }, 1, 1),
      lv({ g: 'sphere', a: [0.08, 8, 6], p: [0.2, 1.34, -0.62], m: 'accent', group: 0, amp: 0.04 }, 1, 1),
      lv({ g: 'drop', a: [0.18, 0.5, 16, 14], p: [0, 1.25, -0.02], m: 'glow', flick: 0.3, amp: 0.08 }, 1, 1),
      ...mm(lv(WEYE(0.2, 0.95, 0.42), 1, 1)),
      ...mm(lv(WPUPIL(0.2, 0.95, 0.42), 1, 1)),

      // =============== Nv2 — redemoinho (corpo de funil) ===============
      lv({ g: 'vortex', a: [0.24, 0.58, 0.9, 18, 24, 1.5, 0.06], p: [0, 0.06, 0], m: 'body', amp: 0.13 }, 2, 2),
      lv({ g: 'vortex', a: [0.5, 0.7, 0.85, 18, 24, 1.2, 0.08], p: [0, 0.82, 0], m: 'body', amp: 0.14 }, 2, 2),
      lv({ g: 'cyl', a: [0.2, 0.12, 1.6, 14, 6], p: [0, 0.86, 0], m: 'glow', amp: 0.07 }, 2, 2),
      lv({ g: 'sphere', a: [0.58, 22, 18], p: [0, 1.9, 0], m: 'body', amp: 0.15 }, 2, 2),
      lv({ g: 'ico', a: [0.38], p: [0, 1.92, 0], m: 'glow', amp: 0.05 }, 2, 2),
      lv({ g: 'torus', a: [0.7, 0.055, 10, 28], p: [0, 1.05, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 0, 2.6] }, 2, 2),
      lv({ g: 'torus', a: [0.78, 0.045, 10, 28], p: [0, 1.55, 0], r: [1.35, 0.3, 0], m: 'accent', spin: [0, 0, -1.8] }, 2, 2),
      lv({ g: 'torus', a: [0.58, 0.05, 10, 26], p: [0, 0.44, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 3.4] }, 2, 2),
      ...mm(lv({ g: 'cone', a: [0.15, 0.46, 5], p: [0.58, 1.4, 0.06], r: [0, 0, -1.3], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 2, 2)),
      ...mm(lv({ g: 'cone', a: [0.15, 0.44, 5], p: [0.58, 1.95, 0], r: [0, 0.3, -1.15], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 2, 2)),
      ...mm(lv({ g: 'cone', a: [0.16, 0.45, 6], p: [0.36, 0.32, 0], r: [0, 0, -2.4], m: 'accent' }, 2, 2)),
      lv({ g: 'sphere', a: [0.12, 10, 8], p: [0.86, 0.9, 0.18], m: 'accent', group: 0, amp: 0.05 }, 2, 2),
      lv({ g: 'sphere', a: [0.1, 10, 8], p: [-0.8, 1.5, 0.32], m: 'accent', group: 0, amp: 0.05 }, 2, 2),
      lv({ g: 'sphere', a: [0.08, 8, 6], p: [0.26, 1.7, -0.74], m: 'accent', group: 0, amp: 0.04 }, 2, 2),
      lv({ g: 'sphere', a: [0.07, 8, 6], p: [-0.34, 0.56, -0.68], m: 'accent', group: 0, amp: 0.04 }, 2, 2),
      lv({ g: 'drop', a: [0.18, 0.52, 18, 16], p: [0, 1.98, 0], m: 'glow', flick: 0.3, amp: 0.1 }, 2, 2),
      lv({ g: 'drop', a: [0.12, 0.34, 12, 10], p: [0.22, 2.12, -0.12], m: 'glow', flick: 0.34, amp: 0.07 }, 2, 2),
      ...mm(lv(WEYE(0.24, 1.95, 0.48), 2, 2)),
      ...mm(lv(WPUPIL(0.24, 1.95, 0.48), 2, 2)),

      // ================ Nv3 — funil vivo (casca + coluna) ================
      lv({ g: 'vortex', a: [0.16, 0.78, 2.1, 24, 28, 1.9, 0.07], p: [0, 0.06, 0], m: 'body', amp: 0.16 }, 3, 3),
      lv({ g: 'vortex', a: [0.28, 0.86, 2.0, 20, 26, 1.7, 0.05], p: [0, 0.05, 0], m: 'trans', amp: 0.12, tag: 'counter' }, 3, 3),
      lv({ g: 'cyl', a: [0.2, 0.1, 2.0, 16, 8], p: [0, 1.0, 0], m: 'glow', amp: 0.08 }, 3, 3),
      lv({ g: 'sphere', a: [0.55, 22, 18], p: [0, 2.45, 0], m: 'body', amp: 0.16 }, 3, 3),
      lv({ g: 'ico', a: [0.34], p: [0, 2.5, 0], m: 'glow', amp: 0.06 }, 3, 3),
      lv({ g: 'torus', a: [0.8, 0.05, 10, 26], p: [0, 1.1, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 0, 2.8] }, 3, 3),
      lv({ g: 'torus', a: [0.88, 0.042, 10, 26], p: [0, 1.8, 0], r: [1.45, 0.25, 0], m: 'accent', spin: [0, 0, -2.0] }, 3, 3),
      lv({ g: 'torus', a: [0.55, 0.05, 10, 24], p: [0, 0.35, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 3.6] }, 3, 3),
      ...mm(lv({ g: 'cone', a: [0.15, 0.42, 5], p: [0.55, 1.45, 0.08], r: [0, 0, -1.32], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.15, 0.42, 5], p: [0.6, 2.2, 0], r: [0, 0.3, -1.2], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 3, 3)),
      ...mm(lv({ g: 'cone', a: [0.1, 0.35, 5], p: [0.42, 2.65, 0.1], r: [0, 0.3, -1.5], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 3, 3)),
      lv({ g: 'torus', a: [0.45, 0.06, 10, 24], p: [0, 0.06, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 3.8] }, 3, 3),
      lv({ g: 'ring', a: [0.2, 0.7, 32], p: [0, 0.02, 0], r: [-1.57, 0, 0], m: 'trans' }, 3, 3),
      lv({ g: 'sphere', a: [0.12, 10, 8], p: [0.85, 1.0, 0.2], m: 'accent', group: 0, amp: 0.05 }, 3, 3),
      lv({ g: 'sphere', a: [0.1, 10, 8], p: [-0.8, 1.7, 0.34], m: 'accent', group: 0, amp: 0.05 }, 3, 3),
      lv({ g: 'sphere', a: [0.085, 8, 6], p: [0.28, 2.2, -0.78], m: 'accent', group: 0, amp: 0.04 }, 3, 3),
      lv({ g: 'sphere', a: [0.07, 8, 6], p: [-0.34, 0.62, -0.74], m: 'accent', group: 0, amp: 0.04 }, 3, 3),
      lv({ g: 'sphere', a: [0.06, 8, 6], p: [0.6, 0.45, -0.55], m: 'accent', group: 0, amp: 0.04 }, 3, 3),
      lv({ g: 'drop', a: [0.18, 0.55, 16, 14], p: [0, 2.62, 0], m: 'glow', flick: 0.32, amp: 0.11 }, 3, 3),
      lv({ g: 'drop', a: [0.1, 0.32, 12, 10], p: [0.2, 2.75, -0.08], m: 'glow', flick: 0.36, amp: 0.08 }, 3, 3),
      ...mm(lv(WEYE(0.26, 2.5, 0.5), 3, 3)),
      ...mm(lv(WPUPIL(0.26, 2.5, 0.5), 3, 3)),

      // ==================== Nv4 — ciclone (mandíbula) ====================
      lv({ g: 'vortex', a: [0.2, 0.95, 2.9, 28, 30, 2.0, 0.06], p: [0, 0.05, 0], m: 'body', amp: 0.17 }, 4, 4),
      lv({ g: 'vortex', a: [0.36, 0.95, 2.7, 22, 28, 1.8, 0.05], p: [0, 0.04, 0], m: 'trans', amp: 0.12, tag: 'counter' }, 4, 4),
      lv({ g: 'cyl', a: [0.22, 0.12, 2.6, 16, 10], p: [0, 1.3, 0], m: 'glow', amp: 0.09 }, 4, 4),
      lv({ g: 'sphere', a: [0.62, 22, 18], p: [0, 3.2, 0], m: 'body', amp: 0.16 }, 4, 4),
      lv({ g: 'ico', a: [0.38], p: [0, 3.25, 0], m: 'glow', amp: 0.06 }, 4, 4),
      lv({ g: 'cone', a: [0.24, 0.45, 10, 3, 1], p: [0, 3.05, 0.55], r: [1.45, 0, 0], m: 'glow', tag: 'jaw' }, 4, 4),
      lv({ g: 'torus', a: [0.95, 0.05, 10, 28], p: [0, 1.3, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 0, 3.0] }, 4, 4),
      lv({ g: 'torus', a: [0.95, 0.045, 10, 28], p: [0, 2.15, 0], r: [1.4, 0.3, 0], m: 'accent', spin: [0, 0, -2.2] }, 4, 4),
      lv({ g: 'torus', a: [0.75, 0.04, 10, 26], p: [0, 2.7, 0], r: [1.5, 0.2, 0], m: 'glow', spin: [0, 0, 2.4] }, 4, 4),
      lv({ g: 'torus', a: [0.6, 0.055, 10, 26], p: [0, 0.4, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 3.8] }, 4, 4),
      ...mm(lv({ g: 'cone', a: [0.16, 0.45, 5], p: [0.52, 1.7, 0.1], r: [0, 0, -1.3], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.16, 0.42, 5], p: [0.62, 2.6, 0], r: [0, 0.35, -1.2], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.12, 0.4, 5], p: [0.48, 3.15, 0.1], r: [0, 0.35, -1.45], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 4, 4)),
      ...mm(lv({ g: 'cone', a: [0.13, 0.4, 6], p: [0.4, 0.3, 0.1], r: [0, 0, -2.5], m: 'accent' }, 4, 4)),
      lv({ g: 'torus', a: [0.55, 0.07, 10, 26], p: [0, 0.06, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 4.0] }, 4, 4),
      lv({ g: 'ring', a: [0.25, 0.85, 32], p: [0, 0.02, 0], r: [-1.57, 0, 0], m: 'trans' }, 4, 4),
      lv({ g: 'sphere', a: [0.13, 10, 8], p: [0.9, 1.2, 0.22], m: 'accent', group: 0, amp: 0.05 }, 4, 4),
      lv({ g: 'sphere', a: [0.11, 10, 8], p: [-0.85, 2.0, 0.36], m: 'accent', group: 0, amp: 0.05 }, 4, 4),
      lv({ g: 'sphere', a: [0.095, 10, 8], p: [0.3, 2.8, -0.82], m: 'accent', group: 0, amp: 0.04 }, 4, 4),
      lv({ g: 'sphere', a: [0.08, 8, 6], p: [-0.4, 0.7, -0.8], m: 'accent', group: 0, amp: 0.04 }, 4, 4),
      lv({ g: 'sphere', a: [0.07, 8, 6], p: [0.66, 0.55, -0.62], m: 'accent', group: 0, amp: 0.04 }, 4, 4),
      lv({ g: 'sphere', a: [0.06, 8, 6], p: [-0.62, 2.55, -0.5], m: 'accent', group: 0, amp: 0.04 }, 4, 4),
      lv({ g: 'drop', a: [0.2, 0.6, 18, 16], p: [0, 3.25, 0], m: 'glow', flick: 0.32, amp: 0.12 }, 4, 4),
      lv({ g: 'drop', a: [0.11, 0.35, 12, 10], p: [0.22, 3.4, -0.1], m: 'glow', flick: 0.36, amp: 0.08 }, 4, 4),
      ...mm(lv(WEYE(0.28, 3.22, 0.55), 4, 4)),
      ...mm(lv(WPUPIL(0.28, 3.22, 0.55), 4, 4)),

      // ====================== Nv5 — TORNADO completo ======================
      // coluna que estreita muito na base e abre no topo (funil de verdade)
      lv({ g: 'vortex', a: [0.16, 1.0, 3.6, 32, 32, 2.2, 0.05], p: [0, 0.05, 0], m: 'body', amp: 0.18 }, 5, 5),
      // dois funis transilúcidos extras: um acompanha, outro gira ao contrário
      lv({ g: 'vortex', a: [0.4, 1.0, 3.3, 24, 30, 1.9, 0.04], p: [0, 0.04, 0], m: 'trans', amp: 0.13 }, 5, 5),
      lv({ g: 'vortex', a: [0.55, 0.95, 3.1, 20, 28, 1.4, 0.06], p: [0, 0.06, 0], m: 'trans', amp: 0.15, tag: 'counter' }, 5, 5),
      lv({ g: 'cyl', a: [0.26, 0.12, 3.1, 18, 12], p: [0, 1.6, 0], m: 'glow', amp: 0.1 }, 5, 5),
      // bigorna de nuvem no topo do funil
      lv({ g: 'sphere', a: [0.7, 24, 18], p: [0, 3.75, 0], m: 'body', amp: 0.17 }, 5, 5),
      lv({ g: 'ico', a: [0.45], p: [0, 3.8, 0], m: 'glow', amp: 0.06 }, 5, 5),
      lv({ g: 'cone', a: [0.3, 0.5, 12, 3, 1], p: [0, 3.55, 0.62], r: [1.42, 0, 0], m: 'glow', tag: 'jaw' }, 5, 5),
      lv({ g: 'torus', a: [1.0, 0.055, 10, 30], p: [0, 1.6, 0], r: [1.57, 0, 0], m: 'glow', spin: [0, 0, 3.2] }, 5, 5),
      lv({ g: 'torus', a: [0.95, 0.05, 10, 30], p: [0, 2.5, 0], r: [1.42, 0.3, 0], m: 'accent', spin: [0, 0, -2.4] }, 5, 5),
      lv({ g: 'torus', a: [0.85, 0.045, 10, 28], p: [0, 3.1, 0], r: [1.5, 0.25, 0], m: 'glow', spin: [0, 0, 2.6] }, 5, 5),
      lv({ g: 'torus', a: [0.65, 0.06, 10, 26], p: [0, 0.42, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 4.2] }, 5, 5),
      lv({ g: 'torus', a: [0.4, 0.05, 10, 24], p: [0, 0.15, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 4.8] }, 5, 5),
      ...mm(lv({ g: 'cone', a: [0.17, 0.45, 5], p: [0.5, 1.9, 0.1], r: [0, 0, -1.28], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.13, 0.4, 5], p: [0.5, 2.7, 0.15], r: [0, 0, -1.35], s: [1, 1, 0.35], m: 'glow', tag: 'arm' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.17, 0.4, 5], p: [0.6, 3.2, 0], r: [0, 0.4, -1.2], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.13, 0.35, 5], p: [0.5, 3.55, 0.12], r: [0, 0.4, -1.4], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.12, 0.4, 5], p: [0.45, 1.15, 0.25], r: [0, -0.3, -1.5], s: [1, 1, 0.3], m: 'glow', tag: 'wing' }, 5, 5)),
      ...mm(lv({ g: 'cone', a: [0.15, 0.45, 6], p: [0.42, 0.3, 0.12], r: [0, 0, -2.5], m: 'accent' }, 5, 5)),
      // sucção no chão: anel + dois anéis de poeira rasos
      lv({ g: 'torus', a: [0.62, 0.08, 10, 28], p: [0, 0.06, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 5.0] }, 5, 5),
      lv({ g: 'ring', a: [0.3, 0.95, 36], p: [0, 0.02, 0], r: [-1.57, 0, 0], m: 'trans' }, 5, 5),
      lv({ g: 'ring', a: [0.5, 1.0, 36], p: [0, 0.015, 0], r: [-1.57, 0, 0], m: 'trans' }, 5, 5),
      lv({ g: 'sphere', a: [0.14, 10, 8], p: [0.9, 1.4, 0.24], m: 'accent', group: 0, amp: 0.05 }, 5, 5),
      lv({ g: 'sphere', a: [0.12, 10, 8], p: [-0.85, 2.3, 0.38], m: 'accent', group: 0, amp: 0.05 }, 5, 5),
      lv({ g: 'sphere', a: [0.1, 10, 8], p: [0.32, 3.0, -0.86], m: 'accent', group: 0, amp: 0.05 }, 5, 5),
      lv({ g: 'sphere', a: [0.085, 8, 6], p: [-0.44, 0.8, -0.84], m: 'accent', group: 0, amp: 0.04 }, 5, 5),
      lv({ g: 'sphere', a: [0.075, 8, 6], p: [0.7, 0.6, -0.66], m: 'accent', group: 0, amp: 0.04 }, 5, 5),
      lv({ g: 'sphere', a: [0.065, 8, 6], p: [-0.66, 2.9, -0.55], m: 'accent', group: 0, amp: 0.04 }, 5, 5),
      lv({ g: 'sphere', a: [0.055, 8, 6], p: [0.58, 3.4, 0.5], m: 'accent', group: 0, amp: 0.04 }, 5, 5),
      lv({ g: 'drop', a: [0.22, 0.55, 18, 16], p: [0, 3.95, 0], m: 'glow', flick: 0.32, amp: 0.13 }, 5, 5),
      lv({ g: 'drop', a: [0.12, 0.35, 12, 10], p: [0.25, 4.05, -0.15], m: 'glow', flick: 0.36, amp: 0.09 }, 5, 5),
      // olhos do espírito da tempestade (mais fundos na bigorna)
      ...mm(lv({ g: 'sphere', a: [0.15, 12, 10], p: [0.28, 3.76, 0.56], m: 'white' }, 5, 5)),
      ...mm(lv({ g: 'sphere', a: [0.08, 8, 6], p: [0.28, 3.76, 0.66], m: 'black' }, 5, 5)),
    ],
  },

  // Fogo+Terra — colosso de lava com fissuras incandescentes (Nv.6) ------
  // corpo de VULCÃO em três socalcos (base larga → cone → borda de cratera),
  // cabeça pequena na beirada para vender o tamanho da montanha. MALHA DENSA
  // em todas as peças grandes (regra do golem Nv.5: deslocamento de vértice
  // num corpo do porte de montanha rasga/distorce a textura com malha rara):
  // cyl com 5-6 segmentos verticais, tampo bem segmentado, blocos subdivide 1
  magma: {
    bob: 0.03,
    parts: [
      // socalco de base (o pé largo da montanha; r 1.42 ≈ 45cm de folga pro tile)
      { g: 'cyl', a: [1.0, 1.42, 0.55, 24, 5], p: [0, 0.275, 0], m: 'dark', amp: 0.07 },
      // cone principal (largo embaixo, afunilando até a cratera)
      { g: 'cyl', a: [0.62, 1.04, 1.7, 24, 6], p: [0, 1.4, 0], m: 'body', amp: 0.075 },
      // socalco do topo ao redor da cratera
      { g: 'cyl', a: [0.5, 0.68, 0.55, 20, 4], p: [0, 2.52, 0], m: 'dark', amp: 0.06 },
      // borda da cratera — o núcleo de lava do rig fica dentro (CRATER_Y)
      { g: 'torus', a: [0.52, 0.12, 12, 32], p: [0, 2.82, 0], r: [1.57, 0, 0], m: 'body', amp: 0.05 },
      // pedras-pés (subdivide para o relevo de basalto não rasgar)
      ...mm({ g: 'dodeca', a: [0.32, 1], p: [0.68, 0.3, 0.18], m: 'dark', amp: 0.07 }),
      { g: 'dodeca', a: [0.26, 1], p: [0, 0.27, -0.55], m: 'dark', amp: 0.07 },
      // braços de bloco rochoso (o rig arremessa o matacão de lava)
      ...mm({ g: 'dodeca', a: [0.3, 1], p: [0.95, 1.35, 0], m: 'dark', amp: 0.07, tag: 'arm' }),
      // ombros espigados (estufam na carga, como no golem)
      ...mm({ g: 'cone', a: [0.17, 0.5, 9], p: [0.66, 2.05, 0], r: [0, 0, -0.62], m: 'body', amp: 0.05, tag: 'spike' }),
      // cone de lava escorrida nas costas
      { g: 'cone', a: [0.3, 0.6, 12], p: [0, 2.2, -0.62], r: [-0.7, 0, 0], m: 'body', amp: 0.05 },
      // tampões de respiro acesos na encosta (lasca de obsidiana com lava)
      { g: 'octa', a: [0.09, 1], p: [0.55, 1.0, 0.75], s: [1, 1.6, 1], m: 'glow', flick: 0.12 },
      { g: 'octa', a: [0.08, 1], p: [-0.32, 1.9, 0.62], s: [1, 1.5, 1], m: 'glow', flick: 0.15 },
      // cabeça pequena na beirada da cratera (o olho único encara o campo)
      { g: 'dodeca', a: [0.28, 1], p: [0, 3.1, 0.2], m: 'dark', amp: 0.05 },
      { g: 'sphere', a: [0.08, 12, 10], p: [0, 3.14, 0.44], m: 'glow', flick: 0.05 },
    ],
  },

  // Fogo+Ar — espírito da trovoada: núcleo elétrico com arcos orbitais ----
  raio: {
    floatY: 0.35,
    bob: 0.12,
    parts: [
      { g: 'dodeca', a: [0.42], p: [0, 1.15, 0], m: 'body' },
      { g: 'ico', a: [0.24], p: [0, 1.15, 0], m: 'glow', flick: 0.15 },
      { g: 'torus', a: [0.62, 0.04, 6, 26], p: [0, 1.15, 0], r: [1.2, 0.3, 0], m: 'glow', group: 0 },
      { g: 'torus', a: [0.55, 0.035, 6, 24], p: [0, 1.15, 0], r: [1.57, 0, 0.9], m: 'accent', group: 1 },
      ...mm(EYE(0.17, 1.2, 0.36)),
      ...mm(PUPIL(0.17, 1.2, 0.36)),
      ...mm({ g: 'cone', a: [0.09, 0.42, 4], p: [0.3, 1.62, 0], r: [0, 0, -0.7], m: 'glow', flick: 0.4 }),
      { g: 'cone', a: [0.11, 0.5, 4], p: [-0.08, 0.55, 0.1], r: [0, 0, 2.7], m: 'glow', flick: 0.35 },
      { g: 'box', a: [0.05, 0.3, 0.05], p: [0.5, 0.85, 0.25], r: [0, 0, 0.6], m: 'accent', flick: 0.3, group: 1 },
      { g: 'box', a: [0.045, 0.26, 0.045], p: [-0.45, 1.5, -0.2], r: [0, 0, -0.9], m: 'accent', flick: 0.3, group: 0 },
    ],
    groups: { 0: 2.2, 1: -1.7 },
  },

  // Água+Terra — ancião das raízes: titã de tronco vivo que se regenera --
  // referência: gávea de tronco com ASAS DE CRISTAL esmeralda, uma esmeralda
  // grande na barriga, esmeraldas nos ombros/testa e cacho de olhinhos
  madeira: {
    bob: 0.04,
    parts: [
      { g: 'sphere', a: [0.72, 12, 10], p: [0, 0.72, 0], s: [1.1, 0.92, 1.05], m: 'body' },
      // esmeralda-mãe embutida na barriga (o peito da referência)
      { g: 'octa', a: [0.3], p: [0, 0.95, 0.58], s: [0.6, 1.5, 0.62], m: 'glow', flick: 0.05 },
      { g: 'cyl', a: [0.3, 0.42, 1.5, 9], p: [0, 1.55, 0], m: 'body' },
      { g: 'sphere', a: [0.36, 10, 8], p: [0, 2.4, 0], m: 'dark' },
      // raízes-pés (a ponta mergulha no piso: raised de 0.24 para o casco
      // rotacionado não atravessar o chão — invólucro amarrado nos testes)
      ...mm({ g: 'cone', a: [0.16, 0.5, 5], p: [0.42, 0.29, 0.28], r: [0.7, 0, 0.55], m: 'dark' }),
      { g: 'cone', a: [0.16, 0.5, 5], p: [0, 0.29, -0.5], r: [-2.5, 0, 0], m: 'dark' },
      // braços de galho (o rig anima no arremesso da semente)
      ...mm({ g: 'cone', a: [0.13, 0.62, 5], p: [0.52, 1.5, -0.05], r: [0, 0, -1.35], m: 'body', tag: 'arm' }),
      ...mm({ g: 'sphere', a: [0.14, 8, 6], p: [0.66, 1.1, 0.05], m: 'dark' }),
      // esmeraldas nos ombros (as joias redondas da referência)
      ...mm({ g: 'octa', a: [0.11], p: [0.6, 1.2, 0.08], s: [1, 1.3, 1], m: 'glow', flick: 0.06 }),
      ...mm(SEYE(0.14, 2.44, 0.3)),
      ...mm(SPUPIL(0.14, 2.44, 0.3)),
      // chifres de galho na copa
      ...mm({ g: 'cone', a: [0.07, 0.4, 5], p: [0.12, 2.78, 0], r: [0, 0, -0.35], m: 'accent' }),
      { g: 'cone', a: [0.06, 0.32, 5], p: [-0.14, 2.72, 0.05], r: [0, 0, 0.5], m: 'accent' },
      // joia da testa (a gema roxa da referência, na nossa leitura) + o
      // cacho de olhinhos de esmeralda ao redor
      { g: 'octa', a: [0.09], p: [0, 2.62, 0.26], r: [0.35, 0, 0], m: 'glow', flick: 0.08 },
      { g: 'sphere', a: [0.1, 8, 6], p: [-0.3, 2.5, 0.25], m: 'glow' },
      { g: 'sphere', a: [0.09, 8, 6], p: [0.34, 2.44, -0.22], m: 'glow' },
      // ASAS leque de cristal esmeralda nas costas (as da referência): dois
      // frouxos por lado, dobrados para cima/back
      ...mm({ g: 'octa', a: [0.5], p: [0.5, 1.98, -0.34], r: [0.12, 0.35, 1.02], s: [0.1, 1.5, 0.82], m: 'glow', tag: 'wing' }),
      ...mm({ g: 'octa', a: [0.34], p: [0.78, 1.62, -0.3], r: [0.12, 0.6, 1.25], s: [0.08, 1.35, 0.66], m: 'glow', tag: 'wing' }),
      // colar de raiz no pescoço
      { g: 'torus', a: [0.55, 0.06, 6, 22], p: [0, 0.5, 0], r: [1.57, 0, 0], m: 'accent' },
    ],
  },

  // Fogo+Ar+Terra — estrela de bolso: plasma contido em anéis -------------
  plasma: {
    floatY: 0.5,
    bob: 0.14,
    parts: [
      { g: 'ico', a: [0.38], p: [0, 1.15, 0], m: 'glow', flick: 0.1 },
      { g: 'dodeca', a: [0.5], p: [0, 1.15, 0], m: 'body' },
      { g: 'torus', a: [0.7, 0.05, 8, 28], p: [0, 1.15, 0], r: [1.25, 0.3, 0], m: 'body', spin: [0.4, 0, 0.5] },
      { g: 'torus', a: [0.58, 0.04, 8, 26], p: [0, 1.15, 0], r: [1.57, 0, 1.1], m: 'accent', spin: [-0.6, 0, 0.3] },
      { g: 'sphere', a: [0.11, 8, 6], p: [0.74, 1.3, 0.1], m: 'glow', group: 0, flick: 0.25 },
      { g: 'sphere', a: [0.085, 8, 6], p: [-0.55, 0.95, 0.5], m: 'glow', group: 0, flick: 0.25 },
      { g: 'sphere', a: [0.07, 8, 6], p: [-0.3, 1.5, -0.7], m: 'accent', group: 0, flick: 0.3 },
      ...mm(WEYE(0.15, 1.24, 0.34)),
      ...mm(WPUPIL(0.15, 1.24, 0.34)),
      { g: 'cone', a: [0.05, 0.3, 5], p: [0, 1.75, 0], m: 'accent', flick: 0.2 },
    ],
    groups: { 0: 1.6 },
  },

  // Água+Ar — golem de CRISTAL de gelo (Nv.6): o gelo cresce em PRISMAS
  // hexagonais EMPILHADOS em terraços (o padrão consagrado do Magma: base
  // larga plantada que afunila em pináculo, mas em facetado de quartzo).
  // Round 1 virou "boneco de neve": o manto esférico engolia a cabeça e as
  // pernas somiam sob o tronco — aqui cada peça lê no perfil.
  gelo: {
    bob: 0.05,
    parts: [
      // TERRAÇO 1 (a base plantada — empurra o piso): malha DENSE (regra do
      // golem/Magma: deslocamento de vértice exige subdivisão; malha rala
      // vira chunk low-poly de isopor)
      { g: 'cyl', a: [1.05, 1.2, 0.92, 12, 6], p: [0, 0.47, 0], m: 'dark', amp: 0.04 },
      // TERRAÇO 2 (o abdômen de gelo; rodado p/ as facetas NÃO alinharem —
      // a pilha cresce torta, como gelo de verdade)
      { g: 'cyl', a: [0.88, 1.02, 0.95, 12, 6], p: [0, 1.35, 0], r: [0, 0.26, 0], m: 'body', amp: 0.045 },
      // TERRAÇO 3 (o peito)
      { g: 'cyl', a: [0.62, 0.82, 0.85, 12, 5], p: [0, 2.17, 0], r: [0, 0.52, 0], m: 'body', amp: 0.04 },
      // CABEÇA: octa de quartzo de FACETAS NÍTIDAS (sub 1 — sub 2 +
      // deslocamento arredondou tudo e virou bola de neve; olhos na face)
      { g: 'octa', a: [0.5, 1], p: [0, 3.0, 0.05], s: [1, 1.14, 1], m: 'body', amp: 0.018 },
      ...mm(SEYE(0.18, 3.04, 0.3)),
      ...mm(SPUPIL(0.18, 3.04, 0.3)),
      // COROA de espinhos (o rig eleva na carga) — o print cobrou thimble:
      // icicles MAIORES e mais grossos, legíveis de longe (8 radiais × 4
      // anéis p/ entortar suave em vez de prisma de isopor)
      ...mm({ g: 'cone', a: [0.12, 0.8, 8, 4], p: [0.13, 3.7, 0.05], r: [0, 0, -0.18], m: 'glow', amp: 0.025, tag: 'spike' }),
      ...mm({ g: 'cone', a: [0.09, 0.55, 8, 4], p: [0.36, 3.46, 0.05], r: [0, 0, -0.5], m: 'glow', amp: 0.025, tag: 'spike' }),
      ...mm({ g: 'cone', a: [0.1, 0.62, 8, 4], p: [0.7, 2.72, 0.02], r: [0, 0, -0.45], m: 'body', amp: 0.03, tag: 'spike' }),
      // corcunda de cristal NAS COSTAS (encostada no corpo e deitada p/ trás
      // — antes bojava como antena; a silhueta é lida de trás também)
      ...mm({ g: 'cone', a: [0.13, 0.72, 8, 4], p: [0.36, 2.05, -0.62], r: [-1.25, 0, 0.25], m: 'body', amp: 0.03, tag: 'spike' }),
      // BRACOS de icicle PENDURADOS nos ombros (o print cobrou funil
      // flutuante: agora cada lasca nasce do corpo) + ombreiras e garras de
      // punho — nada de "bola de beisebol" (octa/dodeca sub 2 + normal plana
      // = esfera; lasca de cristal é sub 0/1 bem achatada no eixo)
      ...mm({ g: 'dodeca', a: [0.3, 1], p: [0.66, 2.5, 0.04], s: [1.15, 0.85, 1.15], m: 'dark', amp: 0.03 }),
      ...mm({ g: 'cone', a: [0.2, 1.15, 10, 6], p: [0.82, 2.2, 0.05], r: [0, 0, 3.18], m: 'body', amp: 0.035, tag: 'arm' }),
      ...mm({ g: 'octa', a: [0.16, 0], p: [0.88, 1.56, 0.06], s: [0.8, 1.9, 0.8], m: 'dark', amp: 0.02 }),
      // lasca de gelo flutuando ao redor (orbita — o gelo ao redor respira):
      // sub 0 + alongada = FARPA de cristal (sub 2 virava bolinha)
      { g: 'octa', a: [0.13, 0], p: [1.05, 2.7, 0.55], s: [0.65, 1.8, 0.65], m: 'accent', group: 0, flick: 0.1 },
      { g: 'octa', a: [0.11, 0], p: [-1.0, 1.85, -0.5], s: [0.65, 1.7, 0.65], m: 'accent', group: 0, flick: 0.12 },
      // placa de geada no chão ao redor da base (halo congelado)
      { g: 'ring', a: [0.6, 1.7, 48], p: [0, 0.03, 0], r: [-1.57, 0, 0], m: 'trans' },
    ],
    groups: { 0: 0.6 },
  },

  // Raio+Gelo — muralha de raios: o muro de nuvem que vira frente de tempestade
  tempestade: {
    floatY: 0.25,
    bob: 0.1,
    parts: [
      { g: 'sphere', a: [0.5, 10, 8], p: [0, 1.5, 0], m: 'body' },
      { g: 'sphere', a: [0.4, 10, 8], p: [0.62, 1.32, 0.16], m: 'body' },
      { g: 'sphere', a: [0.38, 10, 8], p: [-0.58, 1.38, -0.12], m: 'body' },
      { g: 'sphere', a: [0.32, 10, 8], p: [0.18, 1.7, -0.34], m: 'body' },
      { g: 'sphere', a: [0.26, 10, 8], p: [-0.16, 1.82, 0.28], m: 'body' },
      { g: 'sphere', a: [0.62, 10, 8], p: [0, 1.16, 0], s: [1.5, 0.5, 1.2], m: 'dark' },
      ...mm(EYE(0.2, 1.52, 0.44)),
      ...mm(PUPIL(0.2, 1.52, 0.44)),
      { g: 'cone', a: [0.18, 0.7, 4], p: [-0.08, 0.5, 0.14], m: 'glow', flick: 0.35 },
      { g: 'cone', a: [0.12, 0.42, 4], p: [0.18, 0.16, 0.2], r: [0, 0, 2.4], m: 'glow', flick: 0.45 },
      { g: 'cone', a: [0.09, 0.34, 4], p: [-0.42, 0.4, -0.1], r: [0, 0, -0.5], m: 'glow', flick: 0.4 },
      { g: 'torus', a: [0.92, 0.035, 6, 30], p: [0, 1.42, 0], r: [1.57, 0, 0], m: 'accent', group: 0 },
      { g: 'torus', a: [0.78, 0.03, 6, 28], p: [0, 1.05, 0], r: [1.4, 0.3, 0], m: 'glow', group: 1 },
      ...mm({ g: 'octa', a: [0.1, 0], p: [0.66, 0.85, 0.3], s: [0.7, 1.5, 0.7], r: [0, 0, -0.4], m: 'accent' }),
      { g: 'capsule', a: [0.03, 0.16], p: [0.36, 0.8, 0.24], m: 'trans', rise: [1.6, 0.6] },
      { g: 'capsule', a: [0.03, 0.16], p: [-0.38, 0.75, 0.06], m: 'trans', rise: [1.3, 0.6] },
      { g: 'capsule', a: [0.03, 0.16], p: [-0.02, 0.86, 0.4], m: 'trans', rise: [1.8, 0.6] },
    ],
    groups: { 0: 1.3, 1: -1.9 },
  },

  // Fogo+Água — caldeiro vivo (Nv.6): jatos de vapor escaldante ----------
  vapor: {
    bob: 0.05,
    parts: [
      { g: 'capsule', a: [0.44, 0.5], p: [0, 0.72, 0], m: 'body' },
      { g: 'torus', a: [0.45, 0.045, 8, 24], p: [0, 0.5, 0], r: [1.57, 0, 0], m: 'dark' },
      { g: 'torus', a: [0.43, 0.045, 8, 24], p: [0, 0.96, 0], r: [1.57, 0, 0], m: 'dark' },
      { g: 'cone', a: [0.16, 0.36, 8], p: [0, 1.34, 0], m: 'dark' },
      { g: 'cyl', a: [0.055, 0.055, 0.5, 6], p: [0.36, 1.0, 0], r: [0, 0, -0.65], m: 'dark' },
      { g: 'sphere', a: [0.1, 10, 8], p: [0, 0.78, 0.45], m: 'glow', flick: 0.12 },
      { g: 'cyl', a: [0.1, 0.12, 0.22, 8], p: [-0.26, 0.12, 0.2], m: 'dark' },
      { g: 'cyl', a: [0.1, 0.12, 0.22, 8], p: [0.26, 0.12, 0.2], m: 'dark' },
      { g: 'cyl', a: [0.1, 0.12, 0.22, 8], p: [0, 0.12, -0.3], m: 'dark' },
      { g: 'sphere', a: [0.12, 8, 6], p: [0.02, 1.55, 0.02], m: 'steam', rise: [0.75, 1.0] },
      { g: 'sphere', a: [0.1, 8, 6], p: [-0.08, 1.55, 0.08], m: 'steam', rise: [0.95, 1.0] },
      { g: 'sphere', a: [0.085, 8, 6], p: [0.34, 1.2, -0.06], m: 'steam', rise: [0.85, 0.8] },
    ],
  },

  // Pântano+Névoa — senhor das marés mortas: drena a vida alheia (Nv.8) --
  abissal: {
    floatY: 0.2,
    bob: 0.08,
    parts: [
      { g: 'sphere', a: [0.68, 12, 10], p: [0, 1.05, 0], s: [1.1, 1.0, 1.05], m: 'body' },
      { g: 'sphere', a: [0.5, 10, 8], p: [0, 0.75, 0], s: [1.3, 0.55, 1.2], m: 'dark' },
      { g: 'sphere', a: [0.28, 10, 8], p: [0, 1.72, 0], m: 'body' },
      ...mm(WEYE(0.14, 1.76, 0.22)),
      ...mm(WPUPIL(0.14, 1.76, 0.22)),
      ...mm({ g: 'capsule', a: [0.07, 0.55], p: [0.55, 0.85, 0.15], r: [0, 0, -0.7], m: 'body', group: 0, tag: 'arm' }),
      ...mm({ g: 'capsule', a: [0.06, 0.45], p: [-0.5, 0.7, -0.25], r: [0, 0, 0.8], m: 'body', group: 1, tag: 'arm' }),
      ...mm({ g: 'capsule', a: [0.05, 0.35], p: [0.3, 0.55, -0.5], r: [0, 0, -1.1], m: 'body', group: 0 }),
      ...mm({ g: 'cone', a: [0.05, 0.16, 4], p: [0.12, 1.5, 0.28], r: [Math.PI, 0, 0], m: 'accent' }),
      { g: 'cone', a: [0.05, 0.16, 4], p: [-0.12, 1.5, 0.28], r: [Math.PI, 0, 0], m: 'accent' },
      { g: 'sphere', a: [0.09, 8, 6], p: [0.4, 2.1, -0.1], m: 'glow', rise: [0.5, 0.8] },
      { g: 'sphere', a: [0.075, 8, 6], p: [-0.35, 2.0, 0.2], m: 'glow', rise: [0.65, 0.8] },
      { g: 'sphere', a: [0.06, 8, 6], p: [0.05, 2.25, 0.35], m: 'glow', rise: [0.8, 0.8] },
    ],
    groups: { 0: 0.9, 1: -1.2 },
  },

  // Terra+Ar — gênio do deserto (Nv.6): rajadas de grãos em disparo duplo
  areia: {
    bob: 0.07,
    parts: [
      { g: 'cone', a: [0.58, 1.25, 9], p: [0, 0.62, 0], m: 'body' },
      { g: 'sphere', a: [0.4, 12, 10], p: [0, 1.32, 0], m: 'body' },
      { g: 'sphere', a: [0.29, 12, 10], p: [0, 1.74, 0], m: 'body' },
      { g: 'torus', a: [0.31, 0.07, 8, 20], p: [0, 1.86, 0], r: [1.57, 0, 0.12], m: 'accent' },
      { g: 'cone', a: [0.05, 0.22, 5], p: [0.1, 2.08, 0], r: [0, 0, -0.4], m: 'glow' },
      { g: 'box', a: [0.3, 0.14, 0.12], p: [0, 1.63, 0.24], m: 'dark' },
      ...mm(EYE(0.1, 1.8, 0.26)),
      ...mm(PUPIL(0.1, 1.8, 0.26)),
      { g: 'torus', a: [0.42, 0.05, 6, 22], p: [0, 1.12, 0], r: [1.4, 0.25, 0], m: 'accent' },
      { g: 'torus', a: [0.5, 0.045, 6, 24], p: [0, 0.12, 0], r: [1.57, 0, 0], m: 'accent', group: 0 },
      ...mm({ g: 'box', a: [0.06, 0.06, 0.06], p: [0.72, 0.5, 0.1], m: 'glow', group: 1 }),
      { g: 'box', a: [0.05, 0.05, 0.05], p: [-0.66, 0.9, -0.3], m: 'glow', group: 1 },
      { g: 'box', a: [0.045, 0.045, 0.045], p: [0.4, 1.4, 0.6], m: 'glow', group: 1 },
    ],
    groups: { 0: 2.0, 1: -2.6 },
  },

  // Magma+Areia — fortaleza de vidro negro, quase impenetrável -----------
  obsidiana: {
    bob: 0.02,
    parts: [
      { g: 'octa', a: [0.75, 0], p: [0, 0.95, 0], s: [1.05, 1.15, 1.0], m: 'body' },
      { g: 'octa', a: [0.4, 0], p: [0, 1.9, 0], s: [1.0, 1.2, 0.9], m: 'body' },
      ...mm({ g: 'box', a: [0.36, 0.5, 0.42], p: [-0.66, 0.45, 0], m: 'dark' }),
      ...mm({ g: 'octa', a: [0.2, 0], p: [0.55, 1.5, 0.2], s: [0.8, 1.4, 0.8], r: [0, 0, -0.5], m: 'body' }),
      ...mm({ g: 'box', a: [0.05, 0.5, 0.02], p: [0.12, 1.0, 0.68], r: [0, 0, -0.25], m: 'glow', flick: 0.08 }),
      ...mm({ g: 'box', a: [0.04, 0.35, 0.02], p: [-0.3, 0.72, 0.66], m: 'glow', flick: 0.1 }),
      ...mm(SEYE(0.16, 1.92, 0.34)),
      ...mm(SPUPIL(0.16, 1.92, 0.34)),
      { g: 'cone', a: [0.3, 0.6, 4], p: [0, 2.5, 0], m: 'dark' },
      { g: 'cone', a: [0.09, 0.3, 4], p: [0, 2.72, 0], m: 'glow', flick: 0.12 },
      { g: 'ring', a: [0.4, 0.95, 6], p: [0, 0.04, 0], r: [-1.57, 0, 0], m: 'trans' },
    ],
  },

  // Madeira+Vapor — hidra do lodo: veneno contínuo e carne que volta -----
  pantano: {
    bob: 0.05,
    parts: [
      { g: 'sphere', a: [0.75, 12, 10], p: [0, 0.7, 0], s: [1.2, 0.9, 1.1], m: 'body' },
      ...mm({ g: 'capsule', a: [0.13, 0.5], p: [0.4, 1.35, 0.05], r: [0, 0, -0.35], m: 'body' }),
      { g: 'capsule', a: [0.12, 0.45], p: [-0.25, 1.3, -0.25], r: [0.4, 0, 0.3], m: 'body' },
      ...mm({ g: 'sphere', a: [0.19, 10, 8], p: [0.5, 1.78, 0.08], m: 'body' }),
      { g: 'sphere', a: [0.17, 10, 8], p: [-0.33, 1.72, -0.38], m: 'body' },
      ...mm(EYE(0.54, 1.82, 0.24)),
      ...mm(PUPIL(0.54, 1.82, 0.24)),
      EYE(-0.36, 1.76, -0.22),
      PUPIL(-0.36, 1.76, -0.22),
      ...mm({ g: 'sphere', a: [0.1, 8, 6], p: [0.62, 2.02, 0.05], m: 'glow', flick: 0.1, rise: [0.5, 0.5] }),
      { g: 'sphere', a: [0.085, 8, 6], p: [-0.4, 2.0, -0.4], m: 'glow', flick: 0.12, rise: [0.55, 0.5] },
      { g: 'sphere', a: [0.08, 8, 6], p: [0.05, 1.95, 0.3], m: 'glow', flick: 0.1, rise: [0.6, 0.5] },
      ...mm({ g: 'cone', a: [0.18, 0.4, 5], p: [0.5, 0.2, 0.4], r: [0.6, 0, 0.6], m: 'dark' }),
      { g: 'cone', a: [0.18, 0.4, 5], p: [-0.1, 0.2, -0.55], r: [-2.6, 0, 0.2], m: 'dark' },
      { g: 'torus', a: [0.62, 0.06, 6, 22], p: [0, 0.42, 0], r: [1.57, 0, 0], m: 'accent' },
    ],
  },

  // Gelo+Vapor — espectro da bruma: ninguém acerta o que não enxerga -----
  nevoa: {
    floatY: 0.3,
    bob: 0.12,
    parts: [
      { g: 'vortex', a: [0.7, 0.16, 2.6, 20, 24, 1.5, 0.08], p: [0, 0.15, 0], m: 'body' },
      { g: 'sphere', a: [0.3, 10, 8], p: [0, 2.55, 0], m: 'body' },
      ...mm(WEYE(0.12, 2.6, 0.24)),
      ...mm(WPUPIL(0.12, 2.6, 0.24)),
      ...mm({ g: 'sphere', a: [0.16, 8, 6], p: [0.55, 1.2, 0.2], m: 'steam', rise: [0.6, 1.2] }),
      ...mm({ g: 'sphere', a: [0.13, 8, 6], p: [-0.5, 0.8, -0.25], m: 'steam', rise: [0.8, 1.2] }),
      { g: 'sphere', a: [0.11, 8, 6], p: [0.1, 1.6, -0.5], m: 'steam', rise: [0.7, 1.1] },
      { g: 'ring', a: [0.5, 1.1, 36], p: [0, 0.02, 0], r: [-1.57, 0, 0], m: 'trans' },
    ],
  },

  // Madeira+Areia — prisma vivo: estilhaços que ricocheteiam -------------
  cristal: {
    bob: 0.05,
    parts: [
      { g: 'octa', a: [0.55, 0], p: [0, 0.95, 0], s: [0.9, 1.3, 0.9], m: 'body' },
      { g: 'octa', a: [0.26, 0], p: [0, 1.85, 0], s: [0.9, 1.4, 0.9], m: 'glow', flick: 0.06 },
      ...mm({ g: 'octa', a: [0.18, 0], p: [0.5, 0.6, 0.25], s: [0.7, 1.8, 0.7], r: [0.2, 0, -0.6], m: 'body' }),
      ...mm({ g: 'octa', a: [0.15, 0], p: [-0.45, 0.9, -0.2], s: [0.7, 1.7, 0.7], r: [-0.2, 0, 0.7], m: 'body' }),
      ...mm({ g: 'octa', a: [0.12, 0], p: [0.3, 1.5, -0.4], s: [0.7, 1.6, 0.7], r: [0.4, 0, -0.3], m: 'body' }),
      ...mm(WEYE(0.13, 1.6, 0.42)),
      ...mm(WPUPIL(0.13, 1.6, 0.42)),
      { g: 'sphere', a: [0.07, 8, 6], p: [0.7, 1.5, 0.1], m: 'glow', group: 0, flick: 0.3 },
      { g: 'sphere', a: [0.06, 8, 6], p: [-0.6, 1.7, -0.2], m: 'glow', group: 0, flick: 0.3 },
      { g: 'torus', a: [0.6, 0.04, 6, 26], p: [0, 1.2, 0], r: [1.4, 0.3, 0], m: 'accent', group: 1 },
    ],
    groups: { 0: 1.8, 1: -1.1 },
  },

  // Tempestade+Plasma — entidade estelar: constelação viva a Nv.8 --------
  cosmico: {
    floatY: 0.5,
    bob: 0.14,
    parts: [
      { g: 'ico', a: [0.42], p: [0, 1.55, 0], m: 'glow', flick: 0.12 },
      { g: 'dodeca', a: [0.56], p: [0, 1.55, 0], m: 'body' },
      { g: 'torus', a: [0.85, 0.05, 8, 30], p: [0, 1.55, 0], r: [1.25, 0.3, 0], m: 'accent', group: 0 },
      { g: 'torus', a: [0.72, 0.04, 8, 28], p: [0, 1.55, 0], r: [1.57, 0, 1.0], m: 'glow', group: 1 },
      ...mm(WEYE(0.17, 1.66, 0.42)),
      ...mm(WPUPIL(0.17, 1.66, 0.42)),
      ...mm({ g: 'cone', a: [0.06, 0.4, 5], p: [0.3, 2.2, 0], r: [0, 0, -0.5], m: 'accent', flick: 0.2 }),
      { g: 'drop', a: [0.2, 0.6, 16, 14], p: [0, 2.9, 0], m: 'glow', flick: 0.3, amp: 0.1 },
      { g: 'sphere', a: [0.11, 8, 6], p: [0.95, 1.7, 0.15], m: 'glow', group: 0, flick: 0.25 },
      { g: 'sphere', a: [0.09, 8, 6], p: [-0.7, 1.35, 0.55], m: 'accent', group: 0, flick: 0.25 },
      { g: 'sphere', a: [0.08, 8, 6], p: [-0.4, 2.0, -0.75], m: 'glow', group: 1, flick: 0.3 },
    ],
    groups: { 0: 1.4, 1: -1.9 },
  },

  // Obsidiana+Cristal — catedral de geodo: o mais duro dos tanques -------
  geodo: {
    bob: 0.02,
    parts: [
      { g: 'dodeca', a: [0.85], p: [0, 1.0, 0], s: [1.1, 1.0, 1.05], m: 'body' },
      { g: 'sphere', a: [0.4, 10, 8], p: [0, 1.2, 0.45], s: [0.9, 0.8, 0.6], m: 'glow', flick: 0.05 },
      { g: 'octa', a: [0.3, 0], p: [0, 2.1, 0], s: [1.0, 1.3, 1.0], m: 'body' },
      ...mm({ g: 'cone', a: [0.16, 0.7, 6], p: [0.62, 1.9, 0.1], r: [0, 0, -0.4], m: 'accent' }),
      ...mm({ g: 'cone', a: [0.13, 0.55, 6], p: [-0.5, 2.15, -0.15], r: [0, 0, 0.5], m: 'accent' }),
      ...mm({ g: 'cone', a: [0.1, 0.45, 6], p: [0.3, 2.45, -0.35], r: [0.3, 0, -0.25], m: 'accent' }),
      ...mm({ g: 'box', a: [0.4, 0.5, 0.46], p: [-0.72, 0.42, 0.05], m: 'dark' }),
      ...mm(SEYE(0.18, 2.14, 0.36)),
      ...mm(SPUPIL(0.18, 2.14, 0.36)),
      { g: 'torus', a: [0.7, 0.06, 8, 24], p: [0, 0.16, 0], r: [1.57, 0, 0], m: 'accent' },
      { g: 'octa', a: [0.09, 0], p: [0.75, 0.6, 0.4], s: [0.7, 1.5, 0.7], m: 'glow', group: 0 },
      { g: 'octa', a: [0.08, 0], p: [-0.7, 0.8, -0.35], s: [0.7, 1.4, 0.7], m: 'glow', group: 0 },
    ],
    groups: { 0: 0.8 },
  },

  // Plasma+Obsidiana — catástrofe andante: o vulcão primordial a Nv.8 ----
  vulcanico: {
    bob: 0.02,
    parts: [
      ...mm({ g: 'box', a: [0.42, 0.5, 0.48], p: [-0.38, 0.25, 0], m: 'dark' }),
      { g: 'box', a: [1.2, 1.0, 0.95], p: [0, 1.0, 0], m: 'body' },
      ...mm({ g: 'dodeca', a: [0.3], p: [0.78, 1.45, 0], m: 'dark' }),
      { g: 'box', a: [0.09, 0.62, 0.03], p: [-0.3, 1.05, 0.49], m: 'glow', flick: 0.08 },
      { g: 'box', a: [0.07, 0.45, 0.03], p: [0.22, 0.9, 0.49], r: [0, 0, 0.4], m: 'glow', flick: 0.1 },
      { g: 'box', a: [0.06, 0.35, 0.03], p: [0.05, 1.2, -0.48], m: 'glow', flick: 0.12 },
      { g: 'dodeca', a: [0.42], p: [0, 1.72, 0], m: 'dark' },
      { g: 'cone', a: [0.22, 0.4, 7], p: [0, 2.15, 0], m: 'dark' },
      { g: 'drop', a: [0.24, 0.7, 18, 16], p: [0, 2.35, 0], m: 'glow', flick: 0.35, amp: 0.12 },
      { g: 'sphere', a: [0.1, 10, 8], p: [0, 1.78, 0.36], m: 'glow', flick: 0.06 },
      ...mm(SEYE(0.18, 1.74, 0.34)),
      ...mm(SPUPIL(0.18, 1.74, 0.34)),
      ...mm({ g: 'cone', a: [0.24, 0.6, 6], p: [-0.78, 0.9, -0.2], r: [0, 0, 0.4], m: 'body' }),
      { g: 'sphere', a: [0.13, 8, 6], p: [0.3, 2.9, -0.1], m: 'steam', rise: [0.7, 0.9] },
      { g: 'sphere', a: [0.11, 8, 6], p: [-0.25, 2.75, 0.15], m: 'steam', rise: [0.9, 0.9] },
    ],
  },

  // Cósmico+Abissal — titão celestial que dobra céu e mar (Nv.9) ---------
  astral: {
    floatY: 0.45,
    bob: 0.12,
    parts: [
      { g: 'sphere', a: [0.5, 12, 10], p: [0, 1.7, 0], m: 'body' },
      { g: 'sphere', a: [0.3, 10, 8], p: [0, 2.45, 0], m: 'body' },
      { g: 'ico', a: [0.2], p: [0, 1.7, 0], m: 'glow', flick: 0.12 },
      ...mm(WEYE(0.13, 2.5, 0.26)),
      ...mm(WPUPIL(0.13, 2.5, 0.26)),
      { g: 'torus', a: [0.85, 0.04, 8, 32], p: [0, 1.7, 0], r: [1.2, 0.3, 0], m: 'accent', group: 0 },
      { g: 'torus', a: [0.7, 0.035, 8, 30], p: [0, 1.7, 0], r: [1.57, 0, 0.9], m: 'glow', group: 1 },
      { g: 'torus', a: [0.55, 0.03, 8, 28], p: [0, 1.7, 0], r: [1.35, -0.4, 0], m: 'accent', group: 2 },
      ...mm({ g: 'sphere', a: [0.08, 8, 6], p: [0.9, 1.85, 0.1], m: 'glow', group: 0, flick: 0.3 }),
      { g: 'sphere', a: [0.07, 8, 6], p: [-0.75, 1.5, 0.45], m: 'accent', group: 1, flick: 0.3 },
      { g: 'sphere', a: [0.06, 8, 6], p: [0.4, 2.3, -0.6], m: 'glow', group: 2, flick: 0.3 },
      { g: 'drop', a: [0.3, 0.9, 18, 16], p: [0, 3.1, 0], m: 'glow', flick: 0.3, amp: 0.12 },
      { g: 'drop', a: [0.14, 0.45, 14, 12], p: [0.2, 3.5, -0.1], m: 'accent', flick: 0.35, amp: 0.08 },
      ...mm({ g: 'capsule', a: [0.06, 0.5], p: [0.45, 0.7, 0], r: [0, 0, -0.5], m: 'body' }),
    ],
    groups: { 0: 1.1, 1: -1.5, 2: 1.9 },
  },

  // Geodo+Vulcânico — a montanha que anda (Nv.9) -------------------------
  colosso: {
    bob: 0.02,
    parts: [
      ...mm({ g: 'box', a: [0.5, 0.55, 0.56], p: [-0.45, 0.28, 0], m: 'dark' }),
      { g: 'box', a: [1.4, 1.1, 1.1], p: [0, 1.1, 0], m: 'body' },
      { g: 'cone', a: [0.85, 1.0, 7], p: [0, 2.1, 0], m: 'body' },
      { g: 'cone', a: [0.5, 0.7, 7], p: [0, 2.75, 0], m: 'dark' },
      ...mm({ g: 'dodeca', a: [0.34], p: [0.9, 1.6, 0], m: 'dark' }),
      { g: 'octa', a: [0.2, 0], p: [0.3, 3.1, 0.1], s: [0.8, 1.4, 0.8], m: 'accent' },
      { g: 'octa', a: [0.15, 0], p: [-0.35, 2.9, -0.15], s: [0.8, 1.3, 0.8], m: 'accent' },
      { g: 'box', a: [0.1, 0.7, 0.03], p: [-0.35, 1.15, 0.56], m: 'glow', flick: 0.08 },
      { g: 'box', a: [0.07, 0.5, 0.03], p: [0.3, 1.0, 0.56], r: [0, 0, 0.35], m: 'glow', flick: 0.1 },
      { g: 'sphere', a: [0.12, 10, 8], p: [0, 1.6, 0.5], m: 'glow', flick: 0.06 },
      ...mm(SEYE(0.18, 1.55, 0.52)),
      ...mm(SPUPIL(0.18, 1.55, 0.52)),
      { g: 'drop', a: [0.2, 0.6, 16, 14], p: [0, 3.3, 0], m: 'glow', flick: 0.3, amp: 0.1 },
    ],
  },

  // Astral+Colosso — a entidade que precede os quatro elementos (Nv.10) --
  primordial: {
    floatY: 0.35,
    bob: 0.1,
    parts: [
      { g: 'sphere', a: [0.8, 14, 12], p: [0, 1.7, 0], m: 'body' },
      { g: 'ico', a: [0.42], p: [0, 1.7, 0], m: 'glow', flick: 0.12 },
      ...mm(WEYE(0.22, 2.0, 0.62)),
      ...mm(WPUPIL(0.22, 2.0, 0.62)),
      { g: 'torus', a: [1.15, 0.05, 8, 36], p: [0, 1.7, 0], r: [1.2, 0.25, 0], m: 'accent', group: 0 },
      { g: 'torus', a: [1.0, 0.04, 8, 34], p: [0, 1.7, 0], r: [1.57, 0, 0.8], m: 'glow', group: 1 },
      { g: 'torus', a: [1.3, 0.045, 8, 36], p: [0, 0.1, 0], r: [1.57, 0, 0], m: 'accent', spin: [0, 0, 2.2] },
      // satélites elementais: fogo, água, terra, ar — os quatro dentro do um
      { g: 'drop', a: [0.16, 0.45, 14, 12], p: [1.05, 2.2, 0], m: 'glow', group: 0, flick: 0.4, amp: 0.08 },
      { g: 'sphere', a: [0.13, 10, 8], p: [-1.0, 2.3, 0.2], m: 'glow', group: 0, rise: [0.8, 0.4] },
      ...mm({ g: 'octa', a: [0.12, 0], p: [0.55, 2.7, -0.6], s: [0.8, 1.4, 0.8], m: 'accent', group: 1 }),
      { g: 'vortex', a: [0.14, 0.05, 0.5, 12, 16, 1.6], p: [-0.6, 2.6, 0.5], m: 'trans', group: 1 },
      // coroa da criação: anéis ascendentes + chama primordial no topo
      { g: 'cone', a: [0.09, 0.4, 5], p: [-0.3, 2.95, 0.1], r: [0, 0, 0.35], m: 'accent', flick: 0.2 },
      { g: 'cone', a: [0.09, 0.4, 5], p: [0.3, 2.95, -0.1], r: [0, 0, -0.35], m: 'accent', flick: 0.2 },
      { g: 'cone', a: [0.07, 0.32, 5], p: [0, 3.15, 0.25], r: [0.3, 0, 0], m: 'accent', flick: 0.25 },
      { g: 'drop', a: [0.34, 1.0, 20, 18], p: [0, 3.3, 0], m: 'glow', flick: 0.35, amp: 0.14 },
      { g: 'drop', a: [0.16, 0.5, 14, 12], p: [0.28, 3.6, -0.12], m: 'glow', flick: 0.4, amp: 0.1 },
      ...mm({ g: 'capsule', a: [0.11, 0.7], p: [0.75, 0.7, 0.1], r: [0, 0, -0.6], m: 'body' }),
      { g: 'ring', a: [0.6, 1.4, 40], p: [0, 0.03, 0], r: [-1.57, 0, 0], m: 'trans' },
    ],
    groups: { 0: 1.2, 1: -1.6 },
  },
};
