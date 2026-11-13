import { create } from 'zustand';
import { setMusicVolume as applyMusicVolume } from '../audio/music';
import { setSfxVolume as applySfxVolume } from '../audio/sfx';
import { MAX_BATTLE_TIME, DEFAULT_STARTING_COINS } from '../data/balance';
import { getSpecies, speciesAllowsLevel } from '../data/monsters';
import { GameEngine } from '../game/engine/engine';
import { grantMatchReward } from '../game/economy/economy';
import { ecoFor, handheldNow, PERF_MODE_CHOICES, type PerfModeChoice } from '../game/perf';
import { checkFusion } from '../game/fusion/fusionRules';
import { tileFromWorld } from '../game/board';
import {
  MAX_BLOOM_INTENSITY,
  MAX_SFX_VOLUME,
  loadSave,
  persistSave,
  defaultSave,
  type SaveData,
} from '../persistence/saveGame';
import type {
  Difficulty,
  ArenaScene,
  ElementId,
  EngineEvent,
  FusionRejectReason,
  MatchPhase,
  MatchRewardMode,
  MatchSummary,
  MonsterLevel,
  ScenarioChoice,
  Side,
  SpeciesId,
  StatusType,
  TileIndex,
} from '../game/types';
import {
  MAX_LEVEL,
  MAX_MATCH_REWARD,
  MIN_MATCH_REWARD,
  SUMMON_COST,
  TILES_PER_SIDE,
} from '../game/types';
import {
  gateTutorial,
  nextTutorialStep,
  tutorialBlockMsg,
  TUTORIAL_COINS,
  TUTORIAL_FAREWELL_DELAY_MS,
  TUTORIAL_SPECIES,
  TUTORIAL_STEP_DEF,
  type TutorialGateKind,
  type TutorialStepId,
} from '../game/tutorial';

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
  /** Elemento do cenário que deu bônus a esta unidade (indício p/ o Inspetor). */
  terrainBoost?: ElementId;
}

export interface DragHover {
  side: Side;
  tile: TileIndex;
  kind: 'move' | 'merge' | 'invalid';
  targetId?: number;
  /** Resultado da fusão mostrada no slot — sempre revelado: quem carrega tem o
   *  direito de ver o filho ANTES de soltar (é a recompensa do arraste; a
   *  árvore continua selada na enciclopédia e nas etiquetas 3D). */
  fusion?: { species: SpeciesId; label: string; level: MonsterLevel; known: boolean };
  /** por que a fusão naquele slot está bloqueada (só quando kind === 'invalid') */
  reason?: FusionRejectReason;
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
  /**
   * Imprensa num card para abrir o inspetor: a seleção só se confirma no
   * soltar, e morre no meio do caminho se o gesto virar arraste (mover/fundir)
   * ou órbita de câmera — nada de abrir o menu de estatísticas ao arrastar.
   */
  tapCandidate: { id: number; x: number; y: number } | null;
  dragId: number | null;
  dragHover: DragHover | null;
  /** posição do ponteiro no chão enquanto arrasta (para o destaque de destino) */
  dragPointer: { x: number; z: number } | null;
  /** posição de TELA do ponteiro durante o arraste — é o que a prévia de
   *  fusões persegue (o chão 3D não serve: o painel é DOM, cravado na janela) */
  dragScreen: { x: number; y: number } | null;
  /** para onde a célula que estamos mirando vai na tela — a prévia também foge
   *  dela, para nunca tapar o monstro que vamos fundir (é DOM, o alvo é 3D) */
  dragTargetScreen: { x: number; y: number } | null;
  /** tela do corpo da criatura que está NA MÃO durante o arraste (o ponteiro
   *  passa perto, mas o corpo fica alguns px acima dele na tela) */
  dragCarriedScreen: { x: number; y: number } | null;
  /** ponteiro do arraste está sobre o botão flutuante de venda (vender a
   *  criatura segurada). Ver `SellFab` + `BattleScene.isOverSellFab`. */
  sellHover: boolean;
  toast: Toast | null;
  discovered: SpeciesId[];
  /** Espécie revelada pela primeira vez nesta sessão (overlay de descoberta). */
  discoveryReveal: { species: SpeciesId; level: MonsterLevel; level10: boolean } | null;
  stats: SaveData['stats'];
  difficulty: Difficulty;
  scenario: ScenarioChoice;
  bloomIntensity: number;
  sceneryBloomIntensity: number;
  /** 🔋 Modo de desempenho pedido (persistido: auto/cheio/econômico). */
  perfMode: PerfModeChoice;
  /** O que o modo resolveu NESTE aparelho (true = render econômico). */
  ecoActive: boolean;
  sfxVolume: number;
  musicVolume: number;
  activeArenaScene: ArenaScene;
  lastMatchArenaScene: ArenaScene | null;
  startingCoinsCfg: number;
  /** Modo da recompensa de fim de partida (configurável no Progresso). */
  rewardModeCfg: MatchRewardMode;
  /** Valor do modo 'fixed' (50–400): vitória ganha isto; derrota/empate a metade. */
  matchRewardCfg: number;
  /** Depuração ativável nas configurações: criar qualquer espécie no campo. */
  debugMode: boolean;
  /** ⏩ Aceleração da cadência de combate: 1 = normal, 3 e 5 = dreno de
   *  cooldown acelerado. Vale só na partida atual: cada nova partida volta a 1×. */
  turbo: TurboScale;
  lastSummary: MatchSummary | null;
  showBestiary: boolean;
  showSettings: boolean;
  uiTick: number;

  // ── 🎓 tutorial da luvinha ─────────────────────────────────────────────────
  /** Passo atual (null = fora do tutorial). A régua mora em src/game/tutorial.ts. */
  tutorialStep: TutorialStepId | null;
  /** Já assistido (espelho do save): sem isto o tutorial volta a cada abertura. */
  tutorialDone: boolean;
  /** O tutorial que está rolando foi pedido nas configurações (muda o recado final). */
  tutorialReplay: boolean;
  /** Time salvo no cofre: a pergunta "começar o tutorial com a arena vazia?". */
  tutorialPrompt: boolean;
}

interface GameStoreActions {
  initFromSave: () => void;
  /** Botão "Jogar" do menu: dispara o tutorial na primeira vez, senão partida normal. */
  play: () => void;
  /** Resposta da pergunta "o tutorial começa vazio e seu time volta no fim?". */
  answerTutorialPrompt: (go: boolean) => void;
  /** Começa a partida-do-tutorial (arena vazia, saldo virtual) no passo 1. */
  startTutorial: (replay?: boolean) => void;
  /** "Pular tutorial": fecha o tutorial e entra na partida de verdade com o time. */
  skipTutorial: () => void;
  /** Repetir tutorial pedido nas configurações (o confirm é da própria UI). */
  requestTutorialReplay: () => void;
  startNewMatch: () => void;
  returnToMenu: () => void;
  summon: (species: SpeciesId) => void;
  tryMergeIds: (aId: number, bId: number) => void;
  startBattle: () => void;
  selectUnit: (id: number | null) => void;
  beginDragCandidate: (id: number, x: number, y: number) => void;
  tryPromoteDrag: (x: number, y: number) => boolean;
  beginTapCandidate: (id: number, x: number, y: number) => void;
  trackTap: (x: number, y: number) => void;
  commitTap: (x: number, y: number) => void;
  hoverWorld: (
    x: number,
    z: number,
    screenX?: number,
    screenY?: number,
    /** o que mais está na tela durante o arraste, em px da janela (projetado
     *  pela cena, que tem a câmera): o slot mirada e o corpo que vai na mão */
    tela?: { alvo?: { x: number; y: number } | null; corpo?: { x: number; y: number } | null },
  ) => void;
  endDrag: () => void;
  clearPointerState: () => void;
  setSellHover: (on: boolean) => void;
  pushToast: (kind: Toast['kind'], msg: string) => void;
  dismissToast: (id: number) => void;
  dismissDiscovery: () => void;
  setBestiary: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  setDifficulty: (d: Difficulty) => void;
  setScenario: (scenario: ScenarioChoice) => void;
  setBloomIntensity: (intensity: number) => void;
  setSceneryBloomIntensity: (intensity: number) => void;
  setPerfMode: (mode: PerfModeChoice) => void;
  setSfxVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setStartingCoins: (n: number) => void;
  setRewardMode: (mode: MatchRewardMode) => void;
  setMatchReward: (n: number) => void;
  setDebugMode: (on: boolean) => void;
  /** ⏩ escolhe a aceleração da cadência (1/3/5; só na partida atual). */
  setTurbo: (scale: TurboScale) => void;
  /** Depuração: coloca a espécie no slot livre mais à esquerda (só na preparação). */
  spawnDebugUnit: (species: SpeciesId, level: MonsterLevel) => boolean;
  resetProgress: () => void;
  syncUi: () => void;
}

export type GameStore = GameStoreState & GameStoreActions;

/** Degraus do ⏩ turbo de combate: o FAB cicla 1× → 3× → 5× → 1×. */
export type TurboScale = 1 | 3 | 5;

// ---------------------------------------------------------------------------
// Instância do motor fora do estado React (mutação estável p/ a cena 3D).
// ---------------------------------------------------------------------------
let engine: GameEngine | null = null;
let save: SaveData = loadSave();
/** 🔋 Uma pergunta por sessão: este aparelho é de bolso? (ver src/game/perf.ts) */
const ECO_HANDHELD = handheldNow();
let toastSeq = 1;

/** mínimo de movimento (px de tela) para a imprensa virar arraste; o toque que
 *  abre o inspetor usa a MESMA régua — ou vira drag junto com a câmera */
const DRAG_PROMOTE_PX = 9;

export function getEngine(): GameEngine | null {
  return engine;
}

export function getSave(): SaveData {
  return save;
}

function persistSoon(): void {
  persistSave(save);
}

function resolveArenaScene(
  scenario: ScenarioChoice,
  previousScene?: ArenaScene | null,
): ArenaScene {
  if (scenario !== 'random') return scenario;
  const choices: ArenaScene[] = [
    'arcane',
    'forest',
    'ice',
    'volcanic',
    'underwater',
    'universe-end',
  ];
  const available = previousScene
    ? choices.filter((scene) => scene !== previousScene)
    : choices;
  return available[Math.floor(Math.random() * available.length)];
}

/** Motivo de fusão bloqueada → texto legível (usado no toast E na prévia de arraste). */
export const FUSION_MSG: Record<string, string> = {
  SAME_UNIT: 'Escolha duas criaturas diferentes.',
  DIFFERENT_SIDE: 'Só é possível fundir criaturas aliadas.',
  UNIT_GONE: 'A criatura já saiu da arena.',
  MAX_LEVEL: 'Nível 10 é o máximo — não existe fusão acima do Primordial.',
  DIFFERENT_LEVEL: 'Só monstros do mesmo nível podem ser fundidos.',
  MIN_LEVEL: 'Fusões de espécies diferentes só a partir do Nível 5.',
  INCOMPATIBLE_SPECIES: 'Essa combinação não está na árvore elemental — veja a enciclopédia.',
  BOARD_FULL: 'Arena cheia.',
  NO_COINS: `Invocação custa ${SUMMON_COST} moedas.`,
  COMBAT_STARTED:
    'O combate começou: todo o exército é montado na preparação. Mova e funda, mas não invoke.',
};

export const useGameStore = create<GameStore>((set, get) => {
  function handleEngineEvent(e: EngineEvent): void {
    const st = get();
    switch (e.type) {
      case 'summonBlocked':
        if (e.side === 'player') {
          get().pushToast(
            'error',
            FUSION_MSG[e.reason] ?? `Invocação bloqueada (${e.reason}).`,
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
    // Recompensa idempotente por matchId (recarregar não duplica). O VALOR
    // vem do motor — que já aplicou o modo configurado (fixo/bounty) — e não
    // mais da tabela fixa clássica.
    const ledger = save as unknown as { processedMatchIds: string[]; coins: number };
    const applied = grantMatchReward(ledger, summary.matchId, summary.result, summary.reward);
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
      // Persistência entre partidas.
      //  • VITÓRIA: volta TODO o time que o jogador plantou na rodada — vivas e
      //    mortas em combate. É o prêmio por ganhar: evoluir um monstro deixa de
      //    ser uma aposta arriscada, porque a morte dele na partida vencida não o
      //    apaga da coleção. Só não voltam os que foram FUNDIDOS (o filho de
      //    nível seguinte já é eles) e os VENDIDOS no botão de venda (o valor deles já
      //    virou moeda).
      //  • DERROTA (regra anti-softlock): se o jogador quiser continuar jogando,
      //    o time inteiro daquela rodada também volta — mas o prejuízo financeiro
      //    fica: nenhuma moeda gasta na rodada é devolvida além da recompensa
      //    padrão de derrota (+50). Sem isso, comprar 5 monstros na 1ª rodada e
      //    perdê-los todos deixaria o jogador com 50 moedas — sem time e sem
      //    nem poder invocar (custo 100): sem-fim de partida. Com o time de
      //    volta, ele pode trocar de dificuldade, vender criaturas no botão de venda
      //    (o valor delas vira moeda) e remontar a estratégia sem ser
      //    severamente penalizado.
      //  • EMPATE com sobreviventes: só sobreviventes, como sempre — perder
      //    unidades no empate faz parte do acordo do empate. O empate com o
      //    tabuleiro zerado cai na regra anti-softlock (time inteiro de volta).
      // O `tile` de cada entrada é o buraco que a criatura ocupava quando o
      // combate começou (retrato tirado pelo motor no startBattle): na próxima
      // partida o time volta montado exatamente como o jogador deixou, sem
      // precisar reorganizar o tabuleiro.
      const survivors = engine.aliveUnits('player');
      const roster =
        summary.result === 'draw' && survivors.length > 0
          ? engine.restoredRoster('player', true)
          : engine.restoredRoster('player');
      save.retainedRoster = roster;
      persistSoon();
    }
    const activeArenaScene = resolveArenaScene(
      save.settings.scenario,
      get().activeArenaScene,
    );
    set({
      lastSummary: save.lastSummary ?? summary,
      coins: save.coins,
      // a campanha também é lida pela tela de resultado e pelo menu: sem isso,
      // a partida terminada só aparece nas contas depois de recarregar a página
      stats: { ...save.stats },
      phase: summary.result,
      retainedCount: save.retainedRoster.length,
      activeArenaScene,
    });
  }

  function newEngine(scene: ArenaScene, coinsOverride?: number): void {
    engine = new GameEngine({
      playerCoins: coinsOverride ?? save.coins,
      aiCoins: 0,
      maxBattleTime: MAX_BATTLE_TIME,
      difficulty: save.settings.difficulty,
      generateEnemyTeam: true,
      rewardMode: save.settings.rewardMode,
      matchReward: save.settings.matchReward,
      scene,
    });
    engine.setEventCallback(handleEngineEvent);
  }

  // ── 🎓 TUTORIAL: régua, avanço e saída ─────────────────────────────────────
  // A definição dos passos e a régua do que é permitido moram em
  // src/game/tutorial.ts (máquina pura). Aqui só aplica a régua nas ações que
  // mudam a partida e faz o avanço quando a jogada certa acontece.

  /** dentro do tutorial o saldo do motor é virtual (não contamina o cofre) */
  function inTutorial(): boolean {
    return get().tutorialStep !== null;
  }

  /**
   * 🎓 UMA pressionada de dedo, UM recado. Tocar em uma criatura dispara o
   * candidato de toque E o de arraste na mesma teclada (ver `UnitView`), então
   * as duas barreiras reclamar juntas — e como a UI tem um slot de toast só, a
   * segunda mensagem atropela a primeira (que é justamente a que diz o passo).
   * Então: um contador de pressionadas e o recado que aquela já deu; a segunda
   * reclamação do mesmo gesto é engolido (a jogada continua barrada).
   */
  let pressaoSeq = 0;
  let recadoDestaPressao = -1;
  /** o toque aberto nesta pressionada (é ele que o arraste candidato reaproveita) */
  let toqueDestaPressao: { seq: number; id: number } | null = null;

  /** Barreira: devolve false (e avisa o porquê) quando a jogada não é a do passo. */
  function allowTutorial(
    kind: TutorialGateKind,
    opts: { species?: SpeciesId } = {},
  ): boolean {
    const step = get().tutorialStep;
    if (step === null) return true;
    const gate = gateTutorial(step, kind, { species: opts.species });
    if (!gate.ok && gate.msg) {
      const nasceuDaPressionada = kind === 'tap' || kind === 'drag';
      if (!nasceuDaPressionada || recadoDestaPressao !== pressaoSeq) {
        if (nasceuDaPressionada) recadoDestaPressao = pressaoSeq;
        get().pushToast('error', gate.msg);
      }
    }
    return gate.ok;
  }

  /** A jogada certa acabou de acontecer: avança o passo (ou fecha o tutorial). */
  function tutorialPlayDone(kind: 'summon' | 'tap' | 'merge' | 'sell'): void {
    const step = get().tutorialStep;
    if (!step) return;
    const action = TUTORIAL_STEP_DEF[step].action;
    const esperado =
      (kind === 'summon' && action === 'press') ||
      (kind === 'tap' && action === 'tap') ||
      (kind === 'merge' && step === 'arrastar') ||
      (kind === 'sell' && step === 'vender');
    if (!esperado) return;
    const next = nextTutorialStep(step);
    if (!next) {
      closeTutorial('done');
      return;
    }
    // 🎓 na entrada do passo de ARRASTE, o card de status fecha. No layout
    // compacto (≤900px) o inspetor é uma folha centralizada SOBRE a arena (na
    // lateral ele brigaria com a loja — regra do styles.css), então deixá-lo
    // aberto engoliria o ponteiro dos 24 buracos e o gesto que o passo pede no
    // celular. O jogador leu os status no passo 2 e pode reabrir quando quiser;
    // só não pode ficar com a mão em cima do tabuleiro sem ver o tabuleiro.
    set(next === 'arrastar' ? { tutorialStep: next, selectedId: null } : { tutorialStep: next });
  }

  /**
   * Fim do tutorial. Nada foi destruído no caminho: o cofre (moedas + time)
   * nunca foi tocado, então `startNewMatch` devolve o time guardado exatamente
   * nos buracos em que estava.
   */
  function closeTutorial(why: 'done' | 'skip'): void {
    const replay = get().tutorialReplay;
    set({ tutorialStep: null, tutorialReplay: false, selectedId: null });
    get().startNewMatch();
    if (why !== 'done') return;
    // ⏱ a despedida ESPERA: o último passo é uma venda, e o recado do ganho
    // ('… vendido — +N moedas') é a recompensa do passo — se vier por cima dele,
    // a UI (um slot só) apaga exatamente a informação que o jogador acabou de
    // conquistar. Depois do tempo, só fala se o tutorial continua fechado.
    const guardado = save.retainedRoster.length > 0;
    const texto = replay
      ? guardado
        ? 'Tutorial repetido — seu time está de volta ao tabuleiro.'
        : 'Tutorial repetido — agora é só jogar.'
      : guardado
        ? 'Tutorial concluído! Seu time está de volta e o combate é livre.'
        : 'Tutorial concluído! Loja e combate liberados — bom jogo.';
    globalThis.setTimeout(() => {
      if (get().tutorialStep !== null) return; // alguém já recomeçou: silêncio
      get().pushToast('success', texto);
    }, TUTORIAL_FAREWELL_DELAY_MS);
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
    tapCandidate: null,
    dragId: null,
    dragHover: null,
    dragPointer: null,
    dragScreen: null,
    dragTargetScreen: null,
    dragCarriedScreen: null,
    sellHover: false,
    toast: null,
    discovered: [...save.discovered],
    discoveryReveal: null,
    stats: { ...save.stats },
    difficulty: save.settings.difficulty,
    scenario: save.settings.scenario,
    bloomIntensity: save.settings.bloomIntensity,
    sceneryBloomIntensity: save.settings.sceneryBloomIntensity,
    sfxVolume: save.settings.sfxVolume,
    musicVolume: save.settings.musicVolume,
    activeArenaScene: resolveArenaScene(save.settings.scenario, save.lastArenaScene),
    lastMatchArenaScene: save.lastArenaScene,
    startingCoinsCfg: save.settings.startingCoins,
    rewardModeCfg: save.settings.rewardMode,
    matchRewardCfg: save.settings.matchReward,
    debugMode: save.settings.debugMode,
    perfMode: save.settings.perfMode,
    ecoActive: ecoFor(save.settings.perfMode, ECO_HANDHELD),
    turbo: 1,
    lastSummary: save.lastSummary,
    showBestiary: false,
    showSettings: false,
    uiTick: 0,
    tutorialStep: null,
    tutorialDone: save.tutorialDone,
    tutorialReplay: false,
    tutorialPrompt: false,

    initFromSave(): void {
      save = loadSave();
      // o volume salvo acende a camada de áudio antes do primeiro frame
      applySfxVolume(save.settings.sfxVolume);
      applyMusicVolume(save.settings.musicVolume);
      set({
        coins: save.coins,
        aiCoins: 0,
        discovered: [...save.discovered],
        retainedCount: save.retainedRoster.length,
        stats: { ...save.stats },
        difficulty: save.settings.difficulty,
        scenario: save.settings.scenario,
        bloomIntensity: save.settings.bloomIntensity,
        sceneryBloomIntensity: save.settings.sceneryBloomIntensity,
        perfMode: save.settings.perfMode,
        ecoActive: ecoFor(save.settings.perfMode, ECO_HANDHELD),
        sfxVolume: save.settings.sfxVolume,
        musicVolume: save.settings.musicVolume,
        activeArenaScene: resolveArenaScene(save.settings.scenario, save.lastArenaScene),
        lastMatchArenaScene: save.lastArenaScene,
        startingCoinsCfg: save.settings.startingCoins,
        rewardModeCfg: save.settings.rewardMode,
        matchRewardCfg: save.settings.matchReward,
        debugMode: save.settings.debugMode,
        lastSummary: save.lastSummary,
        tutorialDone: save.tutorialDone,
      });
    },

    // ── 🎓 fluxo do tutorial ─────────────────────────────────────────────────
    play(): void {
      if (get().tutorialDone) {
        get().startNewMatch();
        return;
      }
      // Primeira vez: o tutorial SEMPRE começa com a arena vazia. Se já existe
      // jogo salvo (time no cofre ou partidas jogadas), avisamos antes — as
      // moedas e o time guardados não são tocados, só voltam no fim.
      const temJogoSalvo = save.retainedRoster.length > 0 || save.stats.matchesPlayed > 0;
      if (temJogoSalvo) {
        set({ tutorialPrompt: true });
        return;
      }
      get().startTutorial(false);
    },

    answerTutorialPrompt(go: boolean): void {
      set({ tutorialPrompt: false });
      if (go) {
        get().startTutorial(false);
        return;
      }
      // recusou: não enchemos o menu de pergunta a cada abertura. Quem quiser o
      // tutorial de novo acha em Configurações ▸ Progresso ▸ "Repetir tutorial".
      save.tutorialDone = true;
      persistSoon();
      set({ tutorialDone: true });
      get().startNewMatch();
    },

    startTutorial(replay: boolean = false): void {
      const activeArenaScene = get().activeArenaScene;
      // marca antes de começar: fechar a aba no meio dos 5 passos não faz o
      // tutorial voltar sozinho na próxima abertura
      save.tutorialDone = true;
      save.lastArenaScene = activeArenaScene;
      persistSoon();
      // arena vazia de propósito (nenhum `addRetainedUnit`) e saldo virtual, o
      // bastante para os dois IgNIS do tutorial custarem o que custariam
      newEngine(activeArenaScene, Math.max(save.coins, TUTORIAL_COINS));
      set({
        screen: 'game',
        phase: 'preparation',
        activeArenaScene,
        lastMatchArenaScene: activeArenaScene,
        matchId: engine!.world.matchId,
        coins: engine!.world.playerCoins,
        aiCoins: 0,
        retainedCount: save.retainedRoster.length,
        battleTime: 0,
        selectedId: null,
        pendingDrag: null,
        tapCandidate: null,
        dragId: null,
        dragHover: null,
        dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
        lastSummary: null,
        units: [],
        turbo: 1,
        tutorialStep: 'escolher',
        tutorialDone: true,
        tutorialReplay: replay,
        tutorialPrompt: false,
        discoveryReveal: null,
      });
      get().syncUi();
      get().pushToast('info', 'Tutorial da luvinha: 5 passos. Se preferir, pule quando quiser.');
    },

    skipTutorial(): void {
      if (get().tutorialStep === null) return;
      closeTutorial('skip');
    },

    requestTutorialReplay(): void {
      if (get().tutorialStep !== null) return;
      // o tutorial é sempre uma sessão vazia: se havia partida em curso, ela é
      // encerrada como em "sair da partida" (o cofre continua intacto)
      if (get().screen === 'game') get().returnToMenu();
      get().startTutorial(true);
    },

    startNewMatch(): void {
      const activeArenaScene = get().activeArenaScene;
      save.lastArenaScene = activeArenaScene;
      persistSoon();
      newEngine(activeArenaScene);
      // Time persistido volta automaticamente, sem custo e NO MESMO BURACO
      // que ocupava quando o combate anterior começou (se o buraco estiver
      // ocupado por outra criatura do time, entra no primeiro livre).
      for (const r of save.retainedRoster) {
        engine!.addRetainedUnit(r.species, r.level, r.tile);
      }
      set({
        screen: 'game',
        phase: 'preparation',
        activeArenaScene,
        lastMatchArenaScene: activeArenaScene,
        matchId: engine!.world.matchId,
        coins: engine!.world.playerCoins,
        aiCoins: 0,
        retainedCount: save.retainedRoster.length,
        battleTime: 0,
        selectedId: null,
        pendingDrag: null,
        tapCandidate: null,
        dragId: null,
        dragHover: null,
        dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
        lastSummary: null,
        units: [],
        turbo: 1, // cada partida começa em 1×; o turbo é alívio da partida atual
        tutorialStep: null,
        tutorialReplay: false,
        tutorialPrompt: false,
      });
      get().syncUi();
    },

    returnToMenu(): void {
      // Abandonar partida em andamento não gera nem devolve moedas.
      // Partida encerrada: o saldo já inclui a recompensa (finishMatch) — não regrava.
      const currentEngine = engine;
      const abandoningMatch = currentEngine !== null && !currentEngine.world.summary;
      // no tutorial o saldo do motor é virtual: abandoná-lo não grava moeda alguma
      if (abandoningMatch && currentEngine && !inTutorial()) {
        save.coins = currentEngine.world.playerCoins;
        persistSoon();
      }
      const activeArenaScene = abandoningMatch
        ? resolveArenaScene(save.settings.scenario, get().activeArenaScene)
        : get().activeArenaScene;
      engine = null;
      set({
        screen: 'menu',
        phase: 'menu',
        activeArenaScene,
        units: [],
        selectedId: null,
        pendingDrag: null,
        tapCandidate: null,
        dragId: null,
        dragHover: null,
        dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
        coins: save.coins,
        retainedCount: save.retainedRoster.length,
        tutorialStep: null,
        tutorialReplay: false,
        tutorialPrompt: false,
      });
    },

    summon(species: SpeciesId): void {
      if (!allowTutorial('summon', { species })) return;
      const eng = engine;
      if (!eng) return;
      const res = eng.summon('player', species);
      if (res.ok) {
        // dentro do tutorial o saldo é virtual: o cofre não é tocado
        if (!inTutorial()) {
          save.coins = eng.world.playerCoins;
          persistSoon();
        }
        set({ coins: eng.world.playerCoins });
        get().syncUi();
        tutorialPlayDone('summon');
      }
    },

    tryMergeIds(aId: number, bId: number): void {
      const eng = engine;
      if (!eng) return;
      const res = eng.tryMerge(aId, bId);
      set({ dragId: null, dragHover: null, dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
      });
      if (!res.ok) {
        get().pushToast('error', FUSION_MSG[res.reason ?? ''] ?? 'Fusão inválida.');
      } else {
        get().syncUi();
        tutorialPlayDone('merge');
      }
    },

    startBattle(): void {
      if (!allowTutorial('battle')) return;
      engine?.startBattle();
    },

    selectUnit(id: number | null): void {
      set({ selectedId: id });
    },

    beginDragCandidate(id: number, x: number, y: number): void {
      // mesma pressionada do toque? então não abre uma nova "seq" — é o segundo
      // pedido do MESMO gesto (ver a trava de recado em `allowTutorial`)
      if (!toqueDestaPressao || toqueDestaPressao.seq !== pressaoSeq || toqueDestaPressao.id !== id) {
        pressaoSeq++;
        toqueDestaPressao = null;
      }
      if (!allowTutorial('drag')) return;
      set({ pendingDrag: { id, x, y } });
    },

    tryPromoteDrag(x: number, y: number): boolean {
      const pd = get().pendingDrag;
      if (!pd) return false;
      const d = Math.hypot(x - pd.x, y - pd.y);
      if (d < DRAG_PROMOTE_PX) return false;
      set({ dragId: pd.id, pendingDrag: null, dragScreen: { x, y } });
      return true;
    },

    beginTapCandidate(id: number, x: number, y: number): void {
      // novo toque = nova pressionada de dedo
      pressaoSeq++;
      toqueDestaPressao = { seq: pressaoSeq, id };
      if (!allowTutorial('tap')) return;
      set({ tapCandidate: { id, x, y } });
    },

    trackTap(x: number, y: number): void {
      // o dedo andou: era arraste/órbita, não toque — o inspetor não abre
      const tc = get().tapCandidate;
      if (tc && Math.hypot(x - tc.x, y - tc.y) >= DRAG_PROMOTE_PX) {
        set({ tapCandidate: null });
      }
    },

    commitTap(x: number, y: number): void {
      const tc = get().tapCandidate;
      set({ tapCandidate: null });
      if (!tc) return;
      if (Math.hypot(x - tc.x, y - tc.y) >= DRAG_PROMOTE_PX) return;
      set({ selectedId: tc.id });
      // passo 2 do tutorial: o toque CERTO é no monstro que a loja acabou de
      // chamar — é isso que abre o card de status e encerra o passo
      const step = get().tutorialStep;
      if (step === 'inpecionar') {
        const u = engine?.getUnit(tc.id);
        if (u && u.side === 'player' && u.species === TUTORIAL_SPECIES) {
          tutorialPlayDone('tap');
        }
      }
    },

    clearPointerState(): void {
      set({ pendingDrag: null, dragId: null, dragHover: null, dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
      });
    },

    setSellHover(on: boolean): void {
      // só tem sentido enquanto algo está sendo arrastado
      if (get().sellHover === on) return;
      set({ sellHover: on });
    },

    hoverWorld(
      x: number,
      z: number,
      screenX?: number,
      screenY?: number,
      // para onde a célula mirada e o corpo que vai na mão vão NA TELA (quem
      // projeta é a cena, que tem a câmera); o painel de prévia usa isso para
      // não cobrir nenhum dos dois monstros do arraste
      tela?: { alvo?: { x: number; y: number } | null; corpo?: { x: number; y: number } | null },
    ): void {
      const eng = engine;
      const dragId = get().dragId;
      if (!eng || dragId === null) return;
      const dragUnit = eng.getUnit(dragId);
      if (!dragUnit) return;
      const ptr = { x, z };
      // tela do ponteiro: é em px da janela que a prévia de fusões persegue o
      // dedo/mouse; o chão 3D (dragPointer) continua sendo o dado do destino
      const screen =
        screenX !== undefined && screenY !== undefined ? { x: screenX, y: screenY } : null;
      // o corpo que vai na mão segue o ponteiro pelo chão 3D, então mora um
      // pouco ACIMA dele na tela; sem essa tela o painel o taparia na beirada
      const naMao = tela?.corpo ?? null;
      const semAlvo = screen
        ? { dragScreen: screen, dragTargetScreen: null, dragCarriedScreen: naMao }
        : {};
      const spot = tileFromWorld(x, z);
      if (!spot || spot.side !== dragUnit.side) {
        set({ dragHover: null, dragPointer: ptr, ...semAlvo });
        return;
      }
      const occupant = eng.unitAt(spot.side, spot.tile);
      if (!occupant) {
        set({
          dragHover: { side: spot.side, tile: spot.tile, kind: 'move' },
          dragPointer: ptr,
          ...semAlvo,
        });
        return;
      }
      if (occupant.id === dragUnit.id) {
        set({ dragHover: null, dragPointer: ptr, ...semAlvo });
        return;
      }
      const check = checkFusion(dragUnit.species, dragUnit.level, occupant.species, occupant.level);
      let fusion: DragHover['fusion'];
      let reason: FusionRejectReason | undefined;
      if (check.ok) {
        const known = save.discovered.includes(check.outcome.species);
        fusion = {
          species: check.outcome.species,
          label: getSpecies(check.outcome.species).name,
          level: check.outcome.level,
          known,
        };
      } else {
        reason = check.reason;
      }
      set({
        dragHover: {
          side: spot.side,
          tile: spot.tile,
          kind: check.ok ? 'merge' : 'invalid',
          targetId: occupant.id,
          ...(fusion ? { fusion } : {}),
          ...(reason !== undefined ? { reason } : {}),
        },
        dragPointer: ptr,
        // a prévia foge dos dois corpos: o que está na mão e o do slot mirada
        ...(screen
          ? {
              dragScreen: screen,
              dragTargetScreen: tela?.alvo ?? null,
              dragCarriedScreen: naMao,
            }
          : {}),
      });
    },

    endDrag(): void {
      const eng = engine;
      const { dragId, dragHover, sellHover } = get();
      set({ dragId: null, dragHover: null, dragPointer: null,
        dragScreen: null,
        dragTargetScreen: null,
        dragCarriedScreen: null,
        sellHover: false,
      });
      if (!eng || dragId === null) return;
      // solto sobre o botão de venda: vende a criatura e devolve o custo acumulado
      if (sellHover) {
        // no tutorial a venda só é jogada no passo 5
        if (!allowTutorial('sell')) return;
        const unit = eng.getUnit(dragId);
        const res = eng.sellUnit(dragId);
        if (res.ok && unit) {
          get().pushToast(
            'success',
            `${getSpecies(unit.species).name} (Nv.${unit.level}) vendido — +${res.refund} moedas.`,
          );
          get().syncUi();
          tutorialPlayDone('sell');
        }
        return;
      }
      // no tutorial existe UM destino certo por passo: fundir (passo 4) ou
      // vender (passo 5). Mover de buraco ou soltar no vazio é recusada com o
      // recado do próprio passo.
      const step = get().tutorialStep;
      if (step !== null) {
        const mergeDoPasso = step === 'arrastar' && dragHover?.kind === 'merge';
        if (!mergeDoPasso) {
          get().pushToast('error', tutorialBlockMsg(step, 'drop'));
          return;
        }
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

    setScenario(scenario: ScenarioChoice): void {
      const current = get();
      const previousScene =
        current.screen === 'game'
          ? current.activeArenaScene
          : current.lastMatchArenaScene ?? current.activeArenaScene;
      const activeArenaScene = resolveArenaScene(scenario, previousScene);
      save.settings.scenario = scenario;
      if (current.screen === 'game') save.lastArenaScene = activeArenaScene;
      // o bônus de terreno mora no mundo (como a dificuldade): trocar de cenário
      // no meio da partida vale para as unidades que NASCEREM depois; quem já
      // está em campo mantém o bônus que embutiu no nascimento.
      if (engine) engine.world.scene = activeArenaScene;
      persistSoon();
      set({
        scenario,
        activeArenaScene,
        ...(current.screen === 'game'
          ? { lastMatchArenaScene: activeArenaScene }
          : {}),
      });
    },

    setBloomIntensity(intensity: number): void {
      const value = Number.isFinite(intensity)
        ? Math.min(MAX_BLOOM_INTENSITY, Math.max(0, Math.round(intensity)))
        : 0;
      save.settings.bloomIntensity = value;
      persistSoon();
      set({ bloomIntensity: value });
    },

    setSceneryBloomIntensity(intensity: number): void {
      const value = Number.isFinite(intensity)
        ? Math.min(MAX_BLOOM_INTENSITY, Math.max(0, Math.round(intensity)))
        : 0;
      save.settings.sceneryBloomIntensity = value;
      persistSoon();
      set({ sceneryBloomIntensity: value });
    },

    setPerfMode(mode: PerfModeChoice): void {
      const value = PERF_MODE_CHOICES.includes(mode) ? mode : 'auto';
      save.settings.perfMode = value;
      persistSoon();
      set({ perfMode: value, ecoActive: ecoFor(value, ECO_HANDHELD) });
    },

    setSfxVolume(volume: number): void {
      const value = Number.isFinite(volume)
        ? Math.min(MAX_SFX_VOLUME, Math.max(0, Math.round(volume)))
        : 0;
      save.settings.sfxVolume = value;
      applySfxVolume(value);
      persistSoon();
      set({ sfxVolume: value });
    },

    setMusicVolume(volume: number): void {
      const value = Number.isFinite(volume)
        ? Math.min(MAX_SFX_VOLUME, Math.max(0, Math.round(volume)))
        : 0;
      save.settings.musicVolume = value;
      applyMusicVolume(value);
      persistSoon();
      set({ musicVolume: value });
    },

    setStartingCoins(n: number): void {
      const value = Math.max(0, Math.floor(n / 100) * 100);
      save.settings.startingCoins = value;
      persistSoon();
      set({ startingCoinsCfg: value });
    },

    setRewardMode(mode: MatchRewardMode): void {
      const value = mode === 'bounty' ? 'bounty' : 'fixed';
      save.settings.rewardMode = value;
      // como a dificuldade: mexer aqui no meio de uma partida vale para o
      // próximo fim de combate
      if (engine) engine.world.rewardMode = value;
      persistSoon();
      set({ rewardModeCfg: value });
    },

    setMatchReward(n: number): void {
      const value = Number.isFinite(n)
        ? Math.min(MAX_MATCH_REWARD, Math.max(MIN_MATCH_REWARD, Math.round(n)))
        : save.settings.matchReward;
      save.settings.matchReward = value;
      if (engine) engine.world.matchRewardFixed = value;
      persistSoon();
      set({ matchRewardCfg: value });
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

    setTurbo(scale: TurboScale): void {
      // não persiste: turbo é alívio da partida em curso, não preferência salva
      set({ turbo: scale });
      engine?.setTurbo(scale);
    },

    spawnDebugUnit(species: SpeciesId, level: MonsterLevel): boolean {
      if (!allowTutorial('debug')) return false;
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
        lastMatchArenaScene: null,
        discovered: [...save.discovered],
        retainedCount: 0,
        stats: { ...save.stats },
        lastSummary: null,
        // zerar o progresso também devolve o tutorial: na próxima vez que apertar
        // "Jogar", a luvinha aparece de novo
        tutorialDone: save.tutorialDone,
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
          terrainBoost: u.terrainBoost,
        });
      }
      const prev = get();
      // Quando a partida terminou, o saldo do motor está congelado no valor
      // pré-recompensa; quem manda no saldo é o finishMatch (via save/store).
      const finished = !!w.summary;
      // dentro do tutorial o saldo do motor é virtual (passos 1/3/5 mexem nele):
      // não gravamos no cofre — o tutorial inteiro não custa uma moeda salva
      const coinsChanged = !finished && !inTutorial() && save.coins !== w.playerCoins;
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
