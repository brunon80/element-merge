/**
 * Tipos centrais do jogo. Camada independente de React/Three.js:
 * todo o gameplay vive aqui e é verificável por testes unitários.
 */

// ---------------------------------------------------------------------------
// Elementos e espécies
// ---------------------------------------------------------------------------

export type ElementId = 'fire' | 'water' | 'earth' | 'air';

export type SpeciesId =
  // Puros (evoluem sozinhos até o Nv.5)
  | 'ignis' // fogo
  | 'nereia' // água
  | 'golem' // terra
  | 'zephyr' // ar
  // Nv.6 — híbridos (nascem da fusão de dois puros Nv.5)
  | 'raio' // fogo + ar
  | 'madeira' // água + terra
  | 'magma' // fogo + terra
  | 'gelo' // água + ar
  | 'vapor' // fogo + água
  | 'areia' // terra + ar
  // Nv.7 — compostos
  | 'tempestade' // raio + gelo
  | 'obsidiana' // magma + areia
  | 'pantano' // madeira + vapor
  | 'plasma' // raio + magma
  | 'nevoa' // gelo + vapor
  | 'cristal' // madeira + areia
  // Nv.8 — avançados
  | 'cosmico' // tempestade + plasma
  | 'geodo' // obsidiana + cristal
  | 'abissal' // pântano + névoa
  | 'vulcanico' // plasma + obsidiana
  // Nv.9 — lendários
  | 'astral' // cósmico + abissal
  | 'colosso' // geodo + vulcânico
  // Nv.10 — primordial
  | 'primordial'; // astral + colosso

/**
 * Nível de evolução: 1..10. Puros existem em 1..5 (fusão vertical 2→1);
 * criaturas da árvore elemental existem exatamente no seu nível (6..10),
 * alcançado apenas pelas receitas da árvore (ver data/fusionRecipes.ts).
 */
export type MonsterLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const MONSTER_LEVELS: readonly MonsterLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const MAX_LEVEL = 10 as const;
/** Puros param de subir de nível aqui; acima disso só a árvore elemental. */
export const PURE_MAX_LEVEL = 5 as const;
/** Fusões entre espécies diferentes só acontecem a partir deste nível. */
export const CROSS_FUSION_MIN_LEVEL = 5 as const;

/** Categoria de progressão da espécie na árvore elemental. */
export type SpeciesCategory = 'pure' | 'hybrid' | 'advanced' | 'primordial';

// ---------------------------------------------------------------------------
// Atributos e habilidades
// ---------------------------------------------------------------------------

export type TargetingRule = 'closest' | 'lowestHp' | 'farthest' | 'backmost';

export type StatusType = 'burn' | 'slow' | 'poison';

export type AbilityKind =
  | 'burn' // aplica queimadura com chance
  | 'slow' // aplica lentidão com chance
  | 'poison' // aplica envenenamento (dano contínuo) com chance
  | 'splash' // dano em área no impacto
  | 'pierce' // projétil atravessa alvos
  | 'chain' // respinga para outros alvos (jumps = quicadas)
  | 'doubleShot' // dois projéteis por disparo
  | 'swift' // projéteis velozes e cadência maior (passivo)
  | 'heavy' // dano alto e cadência baixa (passivo)
  | 'regen' // regenera fração do HP máximo por segundo (passivo)
  | 'drain'; // drena vida do alvo ao acertar (fração do dano)

export interface AbilityDef {
  kind: AbilityKind;
  /** Chance 0..1 de aplicar (para burn/slow/poison) ou de efeito extra. */
  chance?: number;
  /** Raio do splash / parâmetro de pierce / multiplicador. */
  radius?: number;
  factor?: number;
  /** Duração do efeito aplicado (segundos). */
  duration?: number;
  /** DPS da queimadura/veneno como fração do dano do atacante. */
  dpsFraction?: number;
  /** Fator de redução de cadência da lentidão (intervalo × (1+factor)). */
  slowFactor?: number;
  /** Alvos extras do chain (1 = respinga uma vez; usado por quicadas). */
  jumps?: number;
}

/** Resistências elementais (0..1 reduzem dano; negativas = fraqueza). */
export type ResistTable = Partial<Record<ElementId, number>>;

export interface BaseStats {
  hp: number;
  damage: number;
  /** Alcance em unidades de mundo. */
  range: number;
  /** Intervalo entre ataques (segundos). */
  interval: number;
  /** Velocidade do projétil (unidades/segundo). */
  projectileSpeed: number;
  /** Recarga inicial antes do primeiro ataque (segundos). */
  reload: number;
  /** Velocidade de movimento (0 = unidades fixas por padrão). */
  moveSpeed: number;
  /** Cadência de recarga de reposição após perder unidade (informativo). */
  attackCount?: number;
  targeting: TargetingRule;
  resist: ResistTable;
  abilities: AbilityDef[];
  /** Elemento do projétil para fins de resistência (híbridos usam o primário). */
  damageElement: ElementId;
  /** Cor do projétil/efeito (hex). Derivada do dano elemental; sobrescrevível. */
  projectileColor?: string;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /**
   * Componentes elementais (linhagem): puros têm 1; criaturas da árvore têm a
   * união ordenada dos elementos dos pais (Nv.6 têm 2, Nv.7+ até 4).
   */
  elements: readonly ElementId[];
  /**
   * Intervalo de níveis em que a espécie pode existir. Puros: 1..5 (fusão
   * vertical 2→1). Criaturas da árvore: levelMin === levelMax === nível da
   * árvore — só nascem pela receita e não fundem verticalmente.
   */
  levelMin: number;
  levelMax: number;
  base: BaseStats;
  blurb: string;
  /** Chave de modelo procedural (usado pela camada de renderização). */
  modelKey: string;
  /**
    * Altura do topo da criatura em cada forma. O índice 0 corresponde ao nível
    * `formStartLevel` (padrão 1). Puros declaram 5 formas; criaturas da árvore
    * declaram 1 forma (existem num único nível). Quando existe, o motor usa
    * esses valores para calcular a altura do disparo e do acerto.
    */
  formTops?: number[];
  /** Nome da forma em cada nível (mesmo índice de `formTops`). */
  formNames?: string[];
  /** Nível do índice 0 de `formTops`/`formNames` (espécies da árvore ≠ 1). */
  formStartLevel?: number;
}

/** Categoria de progressão derivada do nível da espécie. */
export function speciesCategory(def: SpeciesDef): SpeciesCategory {
  if (def.elements.length === 1) return 'pure';
  if (def.levelMin >= 10) return 'primordial';
  if (def.levelMin >= 8) return 'advanced';
  return 'hybrid';
}

// ---------------------------------------------------------------------------
// Receitas de fusão
// ---------------------------------------------------------------------------

export type FusionKind = 'vertical' | 'hybrid';

export interface FusionOutcome {
  kind: FusionKind;
  species: SpeciesId;
  level: MonsterLevel;
  /** Quantidade exata de unidades produzidas: sempre 1 (regra 2→1 em todo nível). */
  outputCount: 1;
}

export type FusionRejectReason =
  | 'SAME_UNIT'
  | 'DIFFERENT_SIDE'
  | 'UNIT_GONE'
  | 'MAX_LEVEL'
  | 'DIFFERENT_LEVEL'
  | 'MIN_LEVEL'
  | 'INCOMPATIBLE_SPECIES'
  | 'BOARD_FULL';

export type FusionCheck =
  | { ok: true; outcome: FusionOutcome }
  | { ok: false; reason: FusionRejectReason };

// ---------------------------------------------------------------------------
// Lados, tabuleiro e unidades
// ---------------------------------------------------------------------------

export type Side = 'player' | 'ai';

export const BOARD_COLS = 4;
export const BOARD_ROWS = 3;
export const TILES_PER_SIDE = BOARD_COLS * BOARD_ROWS; // 12 slots por lado

/** Índice do slot = row * BOARD_COLS + col, relativo ao lado da unidade. */
export type TileIndex = number;

export interface StatusEffect {
  type: StatusType;
  remaining: number;
  /** DPS para burn/poison. */
  dps?: number;
  /** Intervalo multiplicado por (1 + slowFactor) para slow. */
  slowFactor?: number;
  /** Elemento usado no cálculo do dano de status (burn/poison). */
  element?: ElementId;
}

export interface CombatUnit {
  id: number;
  side: Side;
  species: SpeciesId;
  level: MonsterLevel;
  tile: TileIndex;
  /** Posição em mundo (x,y,z); mantida pelo motor. */
  pos: [number, number, number];
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  interval: number;
  projectileSpeed: number;
  reload: number;
  moveSpeed: number;
  targeting: TargetingRule;
  resist: ResistTable;
  abilities: AbilityDef[];
  damageElement: ElementId;
  cooldown: number;
  statuses: StatusEffect[];
  alive: boolean;
  /** Carimbo de tempo para animações (motor: tempo de spawn/último ataque/último dano). */
  spawnedAt: number;
  lastAttackAt: number;
  lastHurtAt: number;
  /** Tempo em que morreu; removido após ANIMATION_WINDOW. */
  diedAt: number | null;
  name: string;
}

// ---------------------------------------------------------------------------
// Projéteis e efeitos
// ---------------------------------------------------------------------------

export interface Projectile {
  id: number;
  ownerId: number;
  ownerSide: Side;
  targetId: number;
  /** Última posição conhecida do alvo (usado se o alvo morrer). */
  lastTargetPos: [number, number, number];
  pos: [number, number, number];
  vel: [number, number, number];
  speed: number;
  damage: number;
  damageElement: ElementId;
  species: SpeciesId;
  /** nível do atirador no momento do disparo (tamanho do projétil na tela) */
  ownerLevel: number;
  /** altura do ponto de mira no alvo (centro do corpo da forma atual) */
  aimY: number;
  abilities: AbilityDef[];
  pierceLeft: number;
  hitIds: number[];
  chainLeft: number;
  alive: boolean;
  /** Travessia: tempo mínimo entre novos acertos. */
  rehitTimer: number;
  age: number;
}

/** Evento efêmero consumido pela camada visual (partículas, números de dano). */
export interface FxEvent {
  type:
    | 'hit'
    | 'impact'
    | 'kill'
    | 'summon'
    | 'mergeStart'
    | 'mergeDone'
    | 'status'
    | 'chain'
    | 'sell'
    /** descoberta inédita de espécie (camada visual: apresentação especial) */
    | 'discovery'
    /** criação de uma criatura Nv.10 (apresentação do primordial) */
    | 'primordial';
  pos: [number, number, number];
  pos2?: [number, number, number];
  element?: ElementId;
  species?: SpeciesId;
  /** nível relevante para o efeito (forma gerada na fusão / nível do atirador) */
  level?: number;
  amount?: number;
  status?: StatusType;
}

// ---------------------------------------------------------------------------
// Partida, fases e resultados
// ---------------------------------------------------------------------------

export type MatchPhase = 'preparation' | 'combat' | 'victory' | 'defeat' | 'draw';

export const TERMINAL_PHASES: readonly MatchPhase[] = ['victory', 'defeat', 'draw'];

export type MatchResult = 'victory' | 'defeat' | 'draw';

export interface MatchConfig {
  matchId: string;
  seed: number;
  playerCoins: number;
  aiCoins: number;
  maxBattleTime: number;
  difficulty: Difficulty;
  /** O exército da IA é calculado e montado no início do combate. */
  generateEnemyTeam: boolean;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MatchSummary {
  matchId: string;
  result: MatchResult;
  reward: number;
  balanceBefore: number;
  balanceAfter: number;
  duration: number;
  difficulty: Difficulty;
}

// ---------------------------------------------------------------------------
// Economia (regras fixas do documento de design)
// ---------------------------------------------------------------------------

/** Custo fixo de cada monstro invocado, qualquer elemento/nível. */
export const SUMMON_COST = 100;
/** Recompensa fixa por vitória. */
export const VICTORY_REWARD = 100;
/** Recompensa fixa por derrota (e por empate, ver regra de empate). */
export const DEFEAT_REWARD = 50;
export const DRAW_REWARD = DEFEAT_REWARD;

export interface EconomyState {
  /** Saldo persistente do jogador (mesmo saldo entre partidas). */
  playerCoins: number;
  /** Orçamento da IA na partida corrente (mesma regra de custo 100). */
  aiCoins: number;
}

// (Removido: a IA não decide mais em tempo real — o exército inimigo é
// calculado pela composição de times em ai/teamComposer.ts.)

// ---------------------------------------------------------------------------
// Eventos discretos do motor (consumidos pelo store)
// ---------------------------------------------------------------------------

export type EngineEvent =
  | { type: 'matchStart'; matchId: string }
  | { type: 'phaseChange'; phase: MatchPhase }
  | { type: 'battleStart' }
  | {
      type: 'summon';
      side: Side;
      unitId: number;
      species: SpeciesId;
      level: MonsterLevel;
    }
  | {
      type: 'summonBlocked';
      side: Side;
      species: SpeciesId;
      reason: 'NO_COINS' | 'BOARD_FULL';
    }
  | {
      type: 'mergeStart';
      side: Side;
      aId: number;
      bId: number;
      outcome: FusionOutcome;
    }
  | {
      type: 'mergeDone';
      side: Side;
      createdIds: number[];
      outcome: FusionOutcome;
    }
  | { type: 'move'; unitId: number; tile: TileIndex }
  | { type: 'unitDied'; unitId: number; side: Side; species: SpeciesId }
  | { type: 'matchEnd'; summary: MatchSummary }
  | { type: 'aiCoins'; coins: number };
