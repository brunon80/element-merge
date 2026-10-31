/**
 * Tipos centrais do jogo. Camada independente de React/Three.js:
 * todo o gameplay vive aqui e é verificável por testes unitários.
 */

// ---------------------------------------------------------------------------
// Elementos e espécies
// ---------------------------------------------------------------------------

export type ElementId = 'fire' | 'water' | 'earth' | 'air';

export type SpeciesId =
  // Puros
  | 'ignis' // fogo
  | 'nereia' // água
  | 'golem' // terra
  | 'zephyr' // ar
  // Híbridos
  | 'vulcane' // fogo + terra
  | 'tempest' // água + ar
  | 'verdan' // água + terra
  | 'solaris' // fogo + ar
  | 'vaporis' // fogo + água
  | 'duna'; // terra + ar

/** Nível de evolução: exatamente 1..5 (fusões acima de 5 são bloqueadas). */
export type MonsterLevel = 1 | 2 | 3 | 4 | 5;

export const MONSTER_LEVELS: readonly MonsterLevel[] = [1, 2, 3, 4, 5];
export const MAX_LEVEL = 5 as const;

// ---------------------------------------------------------------------------
// Atributos e habilidades
// ---------------------------------------------------------------------------

export type TargetingRule = 'closest' | 'lowestHp' | 'farthest' | 'backmost';

export type StatusType = 'burn' | 'slow';

export type AbilityKind =
  | 'burn' // aplica queimadura com chance
  | 'slow' // aplica lentidão com chance
  | 'splash' // dano em área no impacto
  | 'pierce' // projétil atravessa alvos
  | 'chain' // respinga para um segundo alvo
  | 'doubleShot' // dois projéteis por disparo
  | 'swift' // projéteis velozes e cadência maior (passivo)
  | 'heavy'; // dano alto e cadência baixa (passivo)

export interface AbilityDef {
  kind: AbilityKind;
  /** Chance 0..1 de aplicar (para burn/slow) ou de efeito extra. */
  chance?: number;
  /** Raio do splash / parâmetro de pierce / multiplicador. */
  radius?: number;
  factor?: number;
  /** Duração do efeito aplicado (segundos). */
  duration?: number;
  /** DPS da queimadura como fração do dano do atacante. */
  dpsFraction?: number;
  /** Fator de redução de cadência da lentidão (intervalo × (1+factor)). */
  slowFactor?: number;
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
  /** Componentes elementais; puros têm 1, híbridos têm 2 (ordem canônica). */
  elements: readonly ElementId[];
  base: BaseStats;
  blurb: string;
  /** Chave de modelo procedural (usado pela camada de renderização). */
  modelKey: string;
  /**
   * Altura do topo da criatura em cada forma (índice 0 = Nv1). Quando existe,
   * a criatura muda de silhueta a cada fusão do mesmo elemento e o motor usa
   * esses valores para calcular a altura do disparo e do acerto.
   */
  formTops?: number[];
  /** Nome da forma em cada nível (mesmo índice de `formTops`). */
  formNames?: string[];
}

// ---------------------------------------------------------------------------
// Receitas de fusão
// ---------------------------------------------------------------------------

export type FusionKind = 'vertical' | 'hybrid';

export interface FusionOutcome {
  kind: FusionKind;
  species: SpeciesId;
  level: MonsterLevel;
  /** Quantidade exata de unidades produzidas (regra obrigatória). */
  outputCount: 1 | 2;
}

export type FusionRejectReason =
  | 'SAME_UNIT'
  | 'DIFFERENT_SIDE'
  | 'UNIT_GONE'
  | 'MAX_LEVEL'
  | 'DIFFERENT_LEVEL'
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
  /** DPS para burn. */
  dps?: number;
  /** Intervalo multiplicado por (1 + slowFactor) para slow. */
  slowFactor?: number;
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
    | 'sell';
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
