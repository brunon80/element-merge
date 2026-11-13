/**
 * 🎓 TUTORIAL — a luvinha de luva que ensina os primeiros cinco gestos.
 *
 * Máquina de passos PURA (sem React, sem three, sem localStorage): é aqui que
 * mora a definição dos passos e a régua do que é permitido em cada um. O
 * `gameStore` é quem aplica (`gateTutorial` em cada ação que muda a partida) e
 * quem avança; o `TutorialHand` é quem desenha a mão. A luva NUNCA joga pelo
 * jogador: nos passos de arraste ela faz o trajeto de MENTIRA, em loop, sem
 * chamar ação nenhuma do store. Todo passo só fecha com a jogada real de quem
 * está jogando.
 */
import { tileGroundPosition } from './board';
import type { SpeciesId, TileIndex } from './types';

/** A estrela do tutorial: Ignis é a primeira criatura da loja e funde na vertical. */
export const TUTORIAL_SPECIES: SpeciesId = 'ignis';
/** O arraste ensinado: pegamos a segunda criatura (slot 1) e a soltamos sobre a primeira (slot 0). */
export const TUTORIAL_SRC_TILE: TileIndex = 1;
export const TUTORIAL_DST_TILE: TileIndex = 0;

export type TutorialStepId =
  | 'escolher'
  | 'inpecionar'
  | 'comprar'
  | 'arrastar'
  | 'vender';

/** Ordem fixa: o último passo concluído encerra o tutorial. */
export const TUTORIAL_STEPS: readonly TutorialStepId[] = [
  'escolher',
  'inpecionar',
  'comprar',
  'arrastar',
  'vender',
] as const;

export function nextTutorialStep(step: TutorialStepId): TutorialStepId | null {
  const i = TUTORIAL_STEPS.indexOf(step);
  return i >= 0 && i < TUTORIAL_STEPS.length - 1 ? TUTORIAL_STEPS[i + 1] : null;
}

export function tutorialStepIndex(step: TutorialStepId): number {
  return TUTORIAL_STEPS.indexOf(step);
}

/** O que o JOGADOR tem que fazer no passo (a luva só aponta/illustra). */
export type TutorialAction = 'press' | 'tap' | 'drag' | 'sell';

/**
 * Alvo da mão: `dom` é um seletor de um elemento da interface (a loja é DOM);
 * `mundo` é um ponto do tabuleiro 3D — quem projeta é a cena (só ela tem a
 * câmera), ver `src/scene/worldToScreen.ts`.
 */
export type TutorialTarget =
  | { kind: 'dom'; selector: string; aim?: 'ne' | 'nw' | 'se' | 'sw' }
  | {
      kind: 'mundo';
      x: number;
      y: number;
      z: number;
      aim?: 'ne' | 'nw' | 'se' | 'sw';
    };

/** Chão + centro do corpo de um slot (o corpo é o que a mão "pega"). */
export function tutorialSlotTarget(
  tile: TileIndex,
  aim: 'ne' | 'nw' | 'se' | 'sw' = 'ne',
): TutorialTarget {
  const [x, y, z] = tileGroundPosition('player', tile);
  return { kind: 'mundo', x, y: y + 0.6, z, aim };
}

/**
 * O fantasma do botão de venda: um aro pontilhado no MESMO lugar onde o FAB
 * dourado nasce quando o jogador pega uma criatura (ver `SellFab` + o bloco
 * `.sell-fab` do styles.css, que o componente reaproveita). É o alvo da mímica
 * do passo 5 — sem ele a mão apontaria para o nada, porque o botão real só
 * existe durante o arraste. `pointer-events: none`: não engole ponteiro nenhum.
 */
export const TUTORIAL_FAB_ALVO_ID = 'tutorial-fab-alvo';
export const TUTORIAL_FAB_ALVO = `[data-testid="${TUTORIAL_FAB_ALVO_ID}"]`;

/**
 * Régua do passo: o que o jogador PODE fazer. Fora disso a jogada é recusada —
 * o tutorial é a única fase do jogo que barra o resto (mover, fundir, vender,
 * invocar outra espécie, começar o combate).
 */
export interface TutorialRules {
  /** espécies que podem ser invocadas neste passo (as outras são recusadas) */
  summonAllow: SpeciesId[];
  drag: boolean;
  vender: boolean;
  iniciarCombate: boolean;
  /** tocar em criatura para abrir o inspetor */
  tocar: boolean;
  /** recado dado quando a jogada não é a do passo */
  blockMsg: string;
}

/**
 * O gesto que a luvinha APENAS ILUSTRA: a mão vai de `de` até `ate` em loop,
 * sem tocar no store. Em passo nenhum a luva joga pelo jogador — o trajeto é
 * mímica, o gesto de verdade é sempre de quem segura o telefone.
 */
export interface TutorialMime {
  de: TutorialTarget;
  ate: TutorialTarget;
}

export interface TutorialStep {
  id: TutorialStepId;
  /** frase que aparece na faixa do tutorial */
  caption: string;
  action: TutorialAction;
  /** para onde a mão aponta (nos passos de arraste, é o destino do gesto) */
  target: TutorialTarget;
  /** presente nos passos de arraste: a mímica em loop (mão, não o jogador) */
  mime?: TutorialMime;
  rules: TutorialRules;
  /** ms que a mão espera parada sobre a origem antes de começar o trajeto */
  delayMs: number;
}

export const TUTORIAL_STEP_DEF: Record<TutorialStepId, TutorialStep> = {
  escolher: {
    id: 'escolher',
    caption: 'Toque no card destacado para chamar o seu primeiro monstro.',
    action: 'press',
    target: { kind: 'dom', selector: '[data-testid="shop-ignis"]', aim: 'ne' },
    rules: {
      summonAllow: [TUTORIAL_SPECIES],
      drag: false,
      vender: false,
      iniciarCombate: false,
      tocar: false,
      blockMsg: 'Primeiro chame o monstro destacado na loja.',
    },
    delayMs: 700,
  },
  inpecionar: {
    id: 'inpecionar',
    caption: 'Toque no monstro em cena para ver os status dele.',
    action: 'tap',
    // a luva resolve em tempo de execução qual unidade acabou de nascer (ver
    // `alvoDoPasso` no TutorialHand); aqui o slot 0 é o plano de fundo
    target: tutorialSlotTarget(TUTORIAL_DST_TILE, 'ne'),
    rules: {
      summonAllow: [],
      drag: false,
      vender: false,
      iniciarCombate: false,
      tocar: true,
      blockMsg: 'Toque na criatura que está no tabuleiro para ver os status.',
    },
    delayMs: 500,
  },
  comprar: {
    id: 'comprar',
    caption: 'Compre OUTRO IgNIS: iguais se fundem (Nv.1 + Nv.1 = Nv.2).',
    action: 'press',
    target: { kind: 'dom', selector: '[data-testid="shop-ignis"]', aim: 'ne' },
    rules: {
      summonAllow: [TUTORIAL_SPECIES],
      drag: false,
      vender: false,
      iniciarCombate: false,
      tocar: false,
      blockMsg: 'Neste passo, compre outro IgNIS na loja.',
    },
    delayMs: 450,
  },
  arrastar: {
    id: 'arrastar',
    caption: 'Arraste uma criatura SOBRE a outra para fundi-las.',
    action: 'drag',
    target: tutorialSlotTarget(TUTORIAL_DST_TILE, 'ne'),
    // a mímica: a mão faz o trajeto de mentira, em loop, e para no destino. O
    // arraste de verdade é do jogador (só ele fecha o passo).
    mime: {
      de: tutorialSlotTarget(TUTORIAL_SRC_TILE, 'ne'),
      ate: tutorialSlotTarget(TUTORIAL_DST_TILE, 'ne'),
    },
    rules: {
      summonAllow: [],
      drag: true,
      vender: false,
      iniciarCombate: false,
      tocar: true,
      blockMsg: 'Solte a criatura em cima da outra — é assim que se funde.',
    },
    delayMs: 600,
  },
  vender: {
    id: 'vender',
    caption: 'Arraste a criatura até o botão dourado para vender.',
    action: 'sell',
    target: { kind: 'dom', selector: TUTORIAL_FAB_ALVO, aim: 'sw' },
    mime: {
      // `de` vem da criatura mais forte viva (o Nv.2 que acabou de nascer);
      // `ate` é o aro pontilhado onde o FAB vai aparecer
      de: tutorialSlotTarget(TUTORIAL_DST_TILE, 'ne'),
      ate: { kind: 'dom', selector: TUTORIAL_FAB_ALVO, aim: 'sw' },
    },
    rules: {
      summonAllow: [],
      drag: true,
      vender: true,
      iniciarCombate: false,
      tocar: true,
      blockMsg: 'Neste passo, arraste a criatura até o botão de venda.',
    },
    delayMs: 600,
  },
};

/** recado por tipo de jogada recusada (mais útil que um "não" genérico) */
export function tutorialBlockMsg(
  step: TutorialStepId,
  kind: 'summon' | 'drag' | 'sell' | 'tap' | 'battle' | 'debug' | 'drop',
): string {
  const def = TUTORIAL_STEP_DEF[step];
  switch (kind) {
    case 'summon':
      return def.rules.summonAllow.length > 0
        ? `Neste passo, invoke apenas ${def.rules.summonAllow
            .map((s) => s.toUpperCase())
            .join('/')}.`
        : `Neste passo não há compra: ${def.caption}`;
    case 'drag':
      return `Nada de arraste ainda: ${def.caption}`;
    case 'sell':
      return 'A venda vem no passo 5 — arraste a criatura até o botão dourado.';
    case 'tap':
      return `Nada de inspetor agora: ${def.caption}`;
    case 'battle':
      return 'O combate vem depois do tutorial — termine os 5 passos (ou pule).';
    case 'debug':
      return 'No tutorial a arena é só os 5 passos: nada de criatura da depuração.';
    case 'drop':
      return def.rules.vender
        ? 'Solte sobre o botão dourado de venda.'
        : def.rules.drag
          ? 'Solte em cima da outra criatura — é assim que se funde.'
          : def.rules.blockMsg;
    default:
      return def.rules.blockMsg;
  }
}

/** tipos de jogada que o `gateTutorial` sabe avaliar */
export type TutorialGateKind = 'summon' | 'drag' | 'sell' | 'tap' | 'battle' | 'debug' | 'drop';

/**
 * Moedas da partida do tutorial. É um saldo VIRTUAL: enquanto o tutorial anda,
 * o `gameStore` não grava o saldo do motor no save (ver `tutorialAtivo` lá),
 * então fechar a aba no meio dos 5 passos não come as moedas de verdade.
 */
export const TUTORIAL_COINS = 500;

/**
 * Tempo que a despedida do tutorial espera para aparecer (ms). O passo 5 é uma
 * venda: o recado do ganho é a recompensa do passo e a UI tem um slot de toast
 * só, então a despedida chega depois para não apagá-lo.
 */
export const TUTORIAL_FAREWELL_DELAY_MS = 1500;

export interface TutorialGate {
  ok: boolean;
  /** recado para o toast; null quando a jogada é exatamente a do passo */
  msg: string | null;
}

/**
 * A régua, aplicada pelo store antes de cada jogada. `species` entra no caso das
 * invocações. Fora do tutorial (`step === null`) tudo passa: a régua só existe
 * enquanto a luvinha está na tela.
 */
export function gateTutorial(
  step: TutorialStepId,
  kind: TutorialGateKind,
  opts: { species?: SpeciesId } = {},
): TutorialGate {
  const rules = TUTORIAL_STEP_DEF[step].rules;
  switch (kind) {
    case 'summon':
      return rules.summonAllow.includes(opts.species as SpeciesId)
        ? { ok: true, msg: null }
        : { ok: false, msg: tutorialBlockMsg(step, 'summon') };
    case 'drag':
      return rules.drag ? { ok: true, msg: null } : { ok: false, msg: tutorialBlockMsg(step, 'drag') };
    case 'tap':
      return rules.tocar ? { ok: true, msg: null } : { ok: false, msg: tutorialBlockMsg(step, 'tap') };
    case 'sell':
      return rules.vender ? { ok: true, msg: null } : { ok: false, msg: tutorialBlockMsg(step, 'sell') };
    case 'battle':
      return rules.iniciarCombate
        ? { ok: true, msg: null }
        : { ok: false, msg: tutorialBlockMsg(step, 'battle') };
    case 'debug':
      return { ok: false, msg: tutorialBlockMsg(step, 'debug') };
    case 'drop':
      // no tutorial só existe UM destino certo por passo: fundir (passo 4) ou
      // vender (passo 5). Mover de buraco não é ensinado aqui.
      return { ok: false, msg: tutorialBlockMsg(step, 'drop') };
    default:
      return { ok: false, msg: rules.blockMsg };
  }
}
