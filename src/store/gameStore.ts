import { create } from 'zustand';
import { MAX_BATTLE_TIME, DEFAULT_STARTING_COINS } from '../data/balance';
import { getSpecies, speciesAllowsLevel } from '../data/monsters';
import { GameEngine } from '../game/engine/engine';
import { grantMatchReward } from '../game/economy/economy';
import { checkFusion } from '../game/fusion/fusionRules';
import { tileFromWorld } from '../game/board';
import {
  loadSave,
  persistSave,
  defaultSave,
  type RetainedUnit,
  type SaveData,
} from '../persistence/saveGame';
import type {
  Difficulty,
  EngineEvent,
  MatchPhase,
  MatchSummary,
  MonsterLevel,
  Side,
  SpeciesId,
  StatusType,
  TileIndex,
} from '../game/types';
import { MAX_LEVEL, SUMMON_COST, TILES_PER_SIDE } from '../game/types';

/** Unidade espelhada para a UI (dado discreto; posições vivem no motor). */
export interface UiUnit {
  id: number;
  side: Side;
  species: SpeciesId;
  level: MonsterLevel;
  tile: TileIndex;
  hp: number;
  maxHp: number;
  statuses: StatusType[];
  dying: boolean;
}

export interface DragHover {
  side: Side;
  tile: TileIndex;
  kind: 'move' | 'merge' | 'invalid';
  targetId?: number;
  /** Resultado da fusão mostrada no slot (nome oculto se a espécie ainda não foi descoberta). */
  fusion?: { label: string; level: MonsterLevel; known: boolean };
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success' | 'reward';
  msg: string;
}

interface GameStoreState {
  screen: 'menu' | 'game';
  phase: MatchPhase | 'menu';
  matchId: string | null;
  coins: number;
  aiCoins: number;
  /** Criaturas do time persistido que voltarão à próxima partida. */
  retainedCount: number;
  battleTime: number;
  units: UiUnit[];
  selectedId: number | null;
  pendingDrag: { id: number; x: number; y: number } | null;
  dragId: number | null;
  dragHover: DragHover | null;
  /** posição do ponteiro no chão enquanto arrasta (para o destaque de destino) */
  dragPointer: { x: number; z: number } | null;
  /** ponteiro do arraste está sobre a lixeira (vender a criatura segurada) */
  sellHover: boolean;
  toast: Toast | null;
  discovered: SpeciesId[];
  /** Espécie revelada pela primeira vez nesta sessão (overlay de descoberta). */
  discoveryReveal: { species: SpeciesId; level: MonsterLevel; level10: boolean } | null;
  stats: SaveData['stats'];
  difficulty: Difficulty;
  startingCoinsCfg: number;
  /** Depuração ativável nas configurações: criar qualquer espécie no campo. */
  debugMode: boolean;
  lastSummary: MatchSummary | null;
  showBestiary: boolean;
  showSettings: boolean;
  uiTick: number;
}

interface GameStoreActions {
  initFromSave: () => void;
  startNewMatch: () => void;
  returnToMenu: () => void;
  summon: (species: SpeciesId) => void;
  tryMergeIds: (aId: number, bId: number) => void;
  startBattle: () => void;
  selectUnit: (id: number | null) => void;
  beginDragCandidate: (id: number, x: number, y: number) => void;
  tryPromoteDrag: (x: number, y: number) => boolean;
  hoverWorld: (x: number, z: number) => void;
  endDrag: () => void;
  clearPointerState: () => void;
  setSellHover: (on: boolean) => void;
  pushToast: (kind: Toast['kind'], msg: string) => void;
  dismissToast: (id: number) => void;
  dismissDiscovery: () => void;
  setBestiary: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  setDifficulty: (d: Difficulty) => void;
  setStartingCoins: (n: number) => void;
  setDebugMode: (on: boolean) => void;
  /** Depuração: coloca a espécie no slot livre mais à esquerda (só na preparação). */
  spawnDebugUnit: (species: SpeciesId, level: MonsterLevel) => boolean;
  resetProgress: () => void;
  syncUi: () => void;
}

export type GameStore = GameStoreState & GameStoreActions;

// ---------------------------------------------------------------------------
// Instância do motor fora do estado React (mutação estável p/ a cena 3D).
// ---------------------------------------------------------------------------
let engine: GameEngine | null = null;
let save: SaveData = loadSave();
let toastSeq = 1;

export function getEngine(): GameEngine | null {
  return engine;
}

export function getSave(): SaveData {
  return save;
}

function persistSoon(): void {
  persistSave(save);
}

const FUSION_MSG: Record<string, string> = {
  SAME_UNIT: 'Escolha duas criaturas diferentes.',
  DIFFERENT_SIDE: 'Só é possível fundir criaturas aliadas.',
  UNIT_GONE: 'A criatura já saiu da arena.',
  MAX_LEVEL: 'Nível 10 é o máximo — não existe fusão acima do Primordial.',
  DIFFERENT_LEVEL: 'Só monstros do mesmo nível podem ser fundidos.',
  MIN_LEVEL: 'Fusões de espécies diferentes só a partir do Nível 5.',
  INCOMPATIBLE_SPECIES: 'Essa combinação não está na árvore elemental — veja a enciclopédia.',
  BOARD_FULL: 'Arena cheia.',
  NO_COINS: `Invocação custa ${SUMMON_COST} moedas.`,
};

export const useGameStore = create<GameStore>((set, get) => {
  function handleEngineEvent(e: EngineEvent): void {
    const st = get();
    switch (e.type) {
      case 'summonBlocked':
        if (e.side === 'player') {
          get().pushToast(
            'error',
            e.reason === 'NO_COINS' ? FUSION_MSG.NO_COINS : FUSION_MSG.BOARD_FULL,
          );
        }
        break;
      case 'mergeDone': {
        const species = e.outcome.species;
        if (!save.discovered.includes(species)) {
          save.discovered.push(species);
          persistSoon();
          set({
            discovered: [...save.discovered],
            // Overlay de descoberta só para fusões do jogador (a IA funde
            // nos bastidores e não revela nada ao jogador).
            ...(e.side === 'player'
              ? {
                  discoveryReveal: {
                    species,
                    level: e.outcome.level,
                    level10: e.outcome.level >= MAX_LEVEL,
                  },
                }
              : {}),
          });
          if (e.side === 'player') {
            get().pushToast(
              'success',
              `Nova espécie descoberta: ${getSpecies(species).name}!`,
            );
            // Apresentação especial no local da fusão (camada visual: Effects).
            if (engine) {
              const created = engine.getUnit(e.createdIds[0]);
              if (created) {
                engine.world.fx.push({
                  type: 'discovery',
                  pos: [...created.pos] as [number, number, number],
                  element: getSpecies(species).base.damageElement,
                  species,
                  level: e.outcome.level,
                });
              }
            }
          }
        }
        get().syncUi();
        break;
      }
      case 'unitDied':
        get().syncUi();
        break;
      case 'matchEnd': {
        finishMatch(e.summary);
        break;
      }
      case 'aiCoins':
        set({ aiCoins: e.coins });
        break;
      default:
        void st;
    }
  }

  function finishMatch(summary: MatchSummary): void {
    // Recompensa idempotente por matchId (recarregar não duplica).
    const ledger = save as unknown as { processedMatchIds: string[]; coins: number };
    const applied = grantMatchReward(ledger, summary.matchId, summary.result);
    if (applied) {
      save.coins = summary.balanceAfter;
      save.stats.matchesPlayed += 1;
      if (summary.result === 'victory') save.stats.wins += 1;
      else if (summary.result === 'defeat') save.stats.losses += 1;
      else save.stats.draws += 1;
      save.lastSummary = summary;
      persistSoon();
    }
    if (engine) {
      // Time persistido: as criaturas vivas ao fim do combate voltam, vivas e
      // no mesmo nível, para a próxima partida — sem custo algum.
      const survivors: RetainedUnit[] = engine
        .aliveUnits('player')
        .map((u) => ({ species: u.species, level: u.level }))
        .slice(0, 12);
      save.retainedRoster = survivors;
      persistSoon();
    }
    set({
      lastSummary: save.lastSummary ?? summary,
      coins: save.coins,
      phase: summary.result,
      retainedCount: save.retainedRoster.length,
    });
  }

  function newEngine(): void {
    engine = new GameEngine({
      playerCoins: save.coins,
      aiCoins: 0,
      maxBattleTime: MAX_BATTLE_TIME,
      difficulty: save.settings.difficulty,
      generateEnemyTeam: true,
    });
    engine.setEventCallback(handleEngineEvent);
  }

  return {
    screen: 'menu',
    phase: 'menu',
    matchId: null,
    coins: save.coins,
    aiCoins: 0,
    retainedCount: save.retainedRoster.length,
    battleTime: 0,
    units: [],
    selectedId: null,
    pendingDrag: null,
    dragId: null,
    dragHover: null,
    dragPointer: null,
    sellHover: false,
    toast: null,
    discovered: [...save.discovered],
    discoveryReveal: null,
    stats: { ...save.stats },
    difficulty: save.settings.difficulty,
    startingCoinsCfg: save.settings.startingCoins,
    debugMode: save.settings.debugMode,
    lastSummary: save.lastSummary,
    showBestiary: false,
    showSettings: false,
    uiTick: 0,

    initFromSave(): void {
      save = loadSave();
      set({
        coins: save.coins,
        aiCoins: 0,
        discovered: [...save.discovered],
        retainedCount: save.retainedRoster.length,
        stats: { ...save.stats },
        difficulty: save.settings.difficulty,
        startingCoinsCfg: save.settings.startingCoins,
        debugMode: save.settings.debugMode,
        lastSummary: save.lastSummary,
      });
    },

    startNewMatch(): void {
      newEngine();
      // Time persistido volta automaticamente, sem custo.
      for (const r of save.retainedRoster) {
        engine!.addRetainedUnit(r.species, r.level);
      }
      set({
        screen: 'game',
        phase: 'preparation',
        matchId: engine!.world.matchId,
        coins: engine!.world.playerCoins,
        aiCoins: 0,
        retainedCount: save.retainedRoster.length,
        battleTime: 0,
        selectedId: null,
        pendingDrag: null,
        dragId: null,
        dragHover: null,
        dragPointer: null,
        sellHover: false,
        lastSummary: null,
        units: [],
      });
      get().syncUi();
    },

    returnToMenu(): void {
      // Abandonar partida em andamento não gera nem devolve moedas.
      // Partida encerrada: o saldo já inclui a recompensa (finishMatch) — não regrava.
      if (engine && !engine.world.summary) {
        save.coins = engine.world.playerCoins;
        persistSoon();
      }
      engine = null;
      set({
        screen: 'menu',
        phase: 'menu',
        units: [],
        selectedId: null,
        pendingDrag: null,
        dragId: null,
        dragHover: null,
        dragPointer: null,
        sellHover: false,
        coins: save.coins,
        retainedCount: save.retainedRoster.length,
      });
    },

    summon(species: SpeciesId): void {
      const eng = engine;
      if (!eng) return;
      const res = eng.summon('player', species);
      if (res.ok) {
        save.coins = eng.world.playerCoins;
        persistSoon();
        set({ coins: save.coins });
        get().syncUi();
      }
    },

    tryMergeIds(aId: number, bId: number): void {
      const eng = engine;
      if (!eng) return;
      const res = eng.tryMerge(aId, bId);
      set({ dragId: null, dragHover: null, dragPointer: null, sellHover: false });
      if (!res.ok) {
        get().pushToast('error', FUSION_MSG[res.reason ?? ''] ?? 'Fusão inválida.');
      } else {
        get().syncUi();
      }
    },

    startBattle(): void {
      engine?.startBattle();
    },

    selectUnit(id: number | null): void {
      set({ selectedId: id });
    },

    beginDragCandidate(id: number, x: number, y: number): void {
      set({ pendingDrag: { id, x, y } });
    },

    tryPromoteDrag(x: number, y: number): boolean {
      const pd = get().pendingDrag;
      if (!pd) return false;
      const d = Math.hypot(x - pd.x, y - pd.y);
      if (d < 9) return false;
      set({ dragId: pd.id, pendingDrag: null });
      return true;
    },

    clearPointerState(): void {
      set({ pendingDrag: null, dragId: null, dragHover: null, dragPointer: null, sellHover: false });
    },

    setSellHover(on: boolean): void {
      // só tem sentido enquanto algo está sendo arrastado
      if (get().sellHover === on) return;
      set({ sellHover: on });
    },

    hoverWorld(x: number, z: number): void {
      const eng = engine;
      const dragId = get().dragId;
      if (!eng || dragId === null) return;
      const dragUnit = eng.getUnit(dragId);
      if (!dragUnit) return;
      const ptr = { x, z };
      const spot = tileFromWorld(x, z);
      if (!spot || spot.side !== dragUnit.side) {
        set({ dragHover: null, dragPointer: ptr });
        return;
      }
      const occupant = eng.unitAt(spot.side, spot.tile);
      if (!occupant) {
        set({ dragHover: { side: spot.side, tile: spot.tile, kind: 'move' }, dragPointer: ptr });
        return;
      }
      if (occupant.id === dragUnit.id) {
        set({ dragHover: null, dragPointer: ptr });
        return;
      }
      const check = checkFusion(dragUnit.species, dragUnit.level, occupant.species, occupant.level);
      let fusion: DragHover['fusion'];
      if (check.ok) {
        const known = save.discovered.includes(check.outcome.species);
        fusion = {
          label: known ? getSpecies(check.outcome.species).name : '???',
          level: check.outcome.level,
          known,
        };
      }
      set({
        dragHover: {
          side: spot.side,
          tile: spot.tile,
          kind: check.ok ? 'merge' : 'invalid',
          targetId: occupant.id,
          fusion,
        },
        dragPointer: ptr,
      });
    },

    endDrag(): void {
      const eng = engine;
      const { dragId, dragHover, sellHover } = get();
      set({ dragId: null, dragHover: null, dragPointer: null, sellHover: false });
      if (!eng || dragId === null) return;
      // sobre a lixeira: vende a criatura e devolve o custo acumulado
      if (sellHover) {
        const unit = eng.getUnit(dragId);
        const res = eng.sellUnit(dragId);
        if (res.ok && unit) {
          get().pushToast(
            'success',
            `${getSpecies(unit.species).name} (Nv.${unit.level}) vendido — +${res.refund} moedas.`,
          );
          get().syncUi();
        }
        return;
      }
      if (!dragHover) return; // soltou fora: sem efeito
      if (dragHover.kind === 'move') {
        const res = eng.moveUnit('player', dragId, dragHover.tile);
        if (!res.ok && res.reason === 'TILE_OCCUPIED') {
          get().pushToast('error', 'Slot ocupado.');
        }
        get().syncUi();
      } else if (dragHover.kind === 'merge' && dragHover.targetId !== undefined) {
        get().tryMergeIds(dragId, dragHover.targetId);
      } else {
        const dragUnit = eng.getUnit(dragId);
        const occupant = eng.unitAt(dragHover.side, dragHover.tile);
        if (dragUnit && occupant) {
          const check = checkFusion(
            dragUnit.species,
            dragUnit.level,
            occupant.species,
            occupant.level,
          );
          const reason = !check.ok ? check.reason : 'INCOMPATIBLE_SPECIES';
          get().pushToast('error', FUSION_MSG[reason] ?? 'Fusão inválida.');
        }
      }
    },

    pushToast(kind, msg): void {
      toastSeq += 1;
      set({ toast: { id: toastSeq, kind, msg } });
    },

    dismissToast(id: number): void {
      if (get().toast?.id === id) set({ toast: null });
    },

    dismissDiscovery(): void {
      if (get().discoveryReveal) set({ discoveryReveal: null });
    },

    setBestiary(open: boolean): void {
      set({ showBestiary: open });
    },

    setSettings(open: boolean): void {
      set({ showSettings: open });
    },

    setDifficulty(d: Difficulty): void {
      save.settings.difficulty = d;
      // Afeta também a partida em andamento: o exército é calculado em
      // startBattle usando world.difficulty.
      if (engine) engine.world.difficulty = d;
      persistSoon();
      set({ difficulty: d });
    },

    setStartingCoins(n: number): void {
      const value = Math.max(0, Math.floor(n / 100) * 100);
      save.settings.startingCoins = value;
      persistSoon();
      set({ startingCoinsCfg: value });
    },

    setDebugMode(on: boolean): void {
      save.settings.debugMode = on;
      persistSoon();
      set({ debugMode: on });
      get().pushToast(
        'info',
        on
          ? 'Modo debug ligado: no bestiário, use "Criar no campo" para ver qualquer criatura na arena.'
          : 'Modo debug desligado.',
      );
    },

    spawnDebugUnit(species: SpeciesId, level: MonsterLevel): boolean {
      if (!get().debugMode) return false;
      const eng = engine;
      if (!eng) {
        get().pushToast('error', 'Abra uma partida para usar o modo debug.');
        return false;
      }
      if (eng.world.summary || eng.world.phase !== 'preparation') {
        get().pushToast('error', 'Só é possível criar criaturas durante a preparação.');
        return false;
      }
      if (!speciesAllowsLevel(species, level)) return false;
      const res = eng.addRetainedUnit(species, level); // grátis, sem descoberta
      if (!res.ok) {
        get().pushToast(
          'error',
          res.reason === 'BOARD_FULL' ? FUSION_MSG.BOARD_FULL : 'Não foi possível criar a criatura.',
        );
        return false;
      }
      get().pushToast(
        'success',
        `Debug: ${getSpecies(species).name} Nv.${level} criado na arena — feche o bestiário para ver.`,
      );
      get().syncUi();
      return true;
    },

    resetProgress(): void {
      const starting = save.settings.startingCoins;
      save = { ...defaultSave(), settings: { ...save.settings } };
      save.coins = starting;
      save.retainedRoster = [];
      persistSoon();
      set({
        coins: save.coins,
        aiCoins: 0,
        discovered: [...save.discovered],
        retainedCount: 0,
        stats: { ...save.stats },
        lastSummary: null,
      });
      get().pushToast('info', 'Progresso reiniciado.');
    },

    syncUi(): void {
      const eng = engine;
      if (!eng) return;
      const w = eng.world;
      const units: UiUnit[] = [];
      for (const u of w.units) {
        units.push({
          id: u.id,
          side: u.side,
          species: u.species,
          level: u.level,
          tile: u.tile,
          hp: Math.max(0, Math.round(u.hp)),
          maxHp: u.maxHp,
          statuses: u.statuses.map((s) => s.type),
          dying: !u.alive,
        });
      }
      const prev = get();
      // Quando a partida terminou, o saldo do motor está congelado no valor
      // pré-recompensa; quem manda no saldo é o finishMatch (via save/store).
      const finished = !!w.summary;
      const coinsChanged = !finished && save.coins !== w.playerCoins;
      const next: Partial<GameStoreState> = { units };
      if (
        !finished &&
        (coinsChanged || prev.coins !== w.playerCoins || prev.aiCoins !== w.aiCoins)
      ) {
        if (coinsChanged) {
          save.coins = w.playerCoins;
          persistSoon();
        }
        next.coins = w.playerCoins;
        next.aiCoins = w.aiCoins;
      }
      next.battleTime = Math.floor(w.battleTime);
      // Sincroniza a fase real do motor (vitória/derrota/empate confirmados).
      if (
        w.summary &&
        (w.phase === 'victory' || w.phase === 'defeat' || w.phase === 'draw')
      ) {
        next.phase = w.phase;
      } else if (prev.screen === 'game' && w.phase === 'combat') {
        next.phase = 'combat';
      } else if (prev.screen === 'game' && w.phase === 'preparation') {
        next.phase = 'preparation';
      }
      next.uiTick = prev.uiTick + 1;
      set(next as Partial<GameStore>);
    },
  };
});

export const DEFAULT_COINS = DEFAULT_STARTING_COINS;
export const TOTAL_TILES = TILES_PER_SIDE;
