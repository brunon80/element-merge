/**
 * 🎓 Tutorial da luvinha. Cobre o que foi pedido e não pode regredir:
 *  1. os CINCO passos acontecem na ordem, jogados pelo canal normal de ponteiro
 *     (as mesmas ações que um dedo usaria — não há caminho paralelo);
 *  2. durante o tutorial NENHUMA outra jogada entra: outra espécie, inspetor
 *     fora da hora, arraste, mover buraco, vender antes da hora, criatura do
 *     modo debug, iniciar o combate;
 *  3. o tutorial SEMPRE começa com a arena vazia SEM tocar no cofre: moedas e
 *     time guardado continuam no save e voltam no fim — inclusive se a aba
 *     fechar no meio dos 5 passos;
 *  4. a luvinha é MÍMICA: ela aponta e percorre o gesto, mas nunca joga pelo
 *     jogador (nada é arrastado, fundido ou vendido sozinho).
 * Também: o `tutorialDone` no localStorage (o tutorial não volta sozinho), a
 * pergunta quando já existe jogo salvo e o "Repetir tutorial" das configurações.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ShopPanel } from '../components/ShopPanel';
import { ToastLayer } from '../components/ToastLayer';
import { TutorialHand } from '../components/TutorialHand';
import { TutorialPrompt } from '../components/TutorialPrompt';
import { tileGroundPosition } from '../game/board';
import type { Side } from '../game/types';
import { TUTORIAL_COINS, TUTORIAL_FAREWELL_DELAY_MS, type TutorialStepId } from '../game/tutorial';
import { loadSave, persistSave, type RetainedUnit } from '../persistence/saveGame';
import { registerWorldBridge, type WorldBridge } from '../scene/worldToScreen';
import { getEngine, getSave, useGameStore } from '../store/gameStore';

// ───────────────────────── helpers ─────────────────────────

function tileXZ(side: Side, tile: number): [number, number] {
  const p = tileGroundPosition(side, tile);
  return [p[0], p[2]];
}

/** criaturas vivas do jogador (fonte da verdade: o motor) */
function myUnits() {
  return getEngine()!.world.units.filter((u) => u.side === 'player' && u.alive);
}

function myLevels(): number[] {
  return myUnits()
    .map((u) => u.level)
    .sort((a, b) => a - b);
}

function myTiles(): number[] {
  return myUnits()
    .map((u) => u.tile)
    .sort((a, b) => a - b);
}

function idEmSlot(tile: number): number {
  const u = useGameStore
    .getState()
    .units.find((x) => x.side === 'player' && x.tile === tile && !x.dying);
  return u ? u.id : -1;
}

/** arraste real: segurar, mover o ponteiro até o chão do destino, soltar */
function arrastar(id: number, dst: { side: Side; tile: number }): void {
  act(() => {
    const st = useGameStore.getState();
    st.beginDragCandidate(id, 20, 20);
    st.tryPromoteDrag(140, 130); // andou o bastante: virou arraste
    useGameStore.getState().hoverWorld(...tileXZ(dst.side, dst.tile));
    useGameStore.getState().endDrag();
  });
}

/** arraste até o botão flutuante de venda */
function arrastarParaVenda(id: number): void {
  act(() => {
    const st = useGameStore.getState();
    st.beginDragCandidate(id, 20, 20);
    st.tryPromoteDrag(140, 130);
    st.setSellHover(true);
    st.endDrag();
  });
}

function ultimoToast(): string {
  return useGameStore.getState().toast?.msg ?? '';
}

function passo(): TutorialStepId | null {
  return useGameStore.getState().tutorialStep;
}

/** do zero: sem save, sem tutorial assistido (instalação nova do jogo) */
function jogoNovo(): void {
  cleanup();
  localStorage.clear();
  const st = useGameStore.getState();
  st.returnToMenu();
  st.resetProgress();
  st.setDebugMode(false);
  useGameStore.setState({ toast: null, tutorialDone: false });
}

/** aparelho com jogo salvo: time no cofre, moedas e campanhas jogadas */
function cofreCheio(p: { coins: number; roster: RetainedUnit[] }): void {
  const s = loadSave();
  s.tutorialDone = false;
  s.coins = p.coins;
  s.retainedRoster = p.roster;
  s.stats.matchesPlayed = 3;
  persistSave(s);
  act(() => useGameStore.getState().initFromSave());
}

/** "Jogar" na primeira vez → passo 1 */
function abrirTutorial(): void {
  act(() => useGameStore.getState().play());
  expect(passo()).toBe('escolher');
}

/**
 * Passos 1 a 4 pelo canal normal: chama, inspeciona, compra de novo e funde.
 * Termina no passo 5 (vender) com uma única criatura Nv.2 no slot 0. Pressupõe
 * o tutorial já aberto no passo 1.
 */
function passosAteVender(): void {
  act(() => useGameStore.getState().summon('ignis')); // 1 · escolher
  expect(passo()).toBe('inpecionar');
  const id = idEmSlot(0);
  act(() => {
    useGameStore.getState().beginTapCandidate(id, 10, 10);
    useGameStore.getState().commitTap(10, 10); // 2 · inpecionar
  });
  expect(useGameStore.getState().selectedId).toBe(id);
  expect(passo()).toBe('comprar');
  act(() => useGameStore.getState().summon('ignis')); // 3 · comprar
  expect(passo()).toBe('arrastar');
  arrastar(idEmSlot(1), { side: 'player', tile: 0 }); // 4 · arrastar → fusão
  expect(myLevels()).toEqual([2]);
  expect(passo()).toBe('vender');
}

/** os 5 passos inteiros a partir do passo 1 já aberto */
function tutorialInteiro(): void {
  passosAteVender();
  arrastarParaVenda(idEmSlot(0)); // 5 · vender
  expect(passo()).toBeNull();
}

beforeEach(() => {
  jogoNovo();
});

// ───────────────────────── primeira vez ─────────────────────────

describe('Abrir o jogo pela primeira vez', () => {
  test('"Jogar" dispara a luvinha com a arena vazia e saldo garantido para os passos', () => {
    abrirTutorial();
    const st = useGameStore.getState();
    expect(st.screen).toBe('game');
    expect(st.phase).toBe('preparation');
    expect(st.units).toHaveLength(0); // SEMPRE uma sessão vazia
    expect(st.coins).toBeGreaterThanOrEqual(TUTORIAL_COINS);
    // e o combate fica barrado enquanto a luvinha ensina
    act(() => useGameStore.getState().startBattle());
    expect(useGameStore.getState().phase).toBe('preparation');
    expect(ultimoToast()).toContain('O combate vem depois do tutorial');
  });

  test('o tutorial fica marcado como assistido e não volta sozinho na próxima abertura', () => {
    abrirTutorial();
    expect(loadSave().tutorialDone).toBe(true);
    // reabrir com o mesmo save → "Jogar" entra na partida direto
    act(() => useGameStore.getState().returnToMenu());
    act(() => useGameStore.getState().initFromSave());
    act(() => useGameStore.getState().play());
    expect(passo()).toBeNull();
    expect(useGameStore.getState().screen).toBe('game');
  });

  test('save antigo, sem o campo, é tratado como "nunca assistiu"', () => {
    const semCampo = { ...loadSave() } as Record<string, unknown>;
    delete semCampo.tutorialDone;
    localStorage.setItem('elemental-merge-save-v1', JSON.stringify(semCampo));
    act(() => useGameStore.getState().initFromSave());
    expect(useGameStore.getState().tutorialDone).toBe(false);
    abrirTutorial();
  });
});

// ───────────────────────── a régua ─────────────────────────

describe('A régua do tutorial: nenhuma outra jogada entra', () => {
  test('no passo 1 só o monstro do passo pode ser invocado', () => {
    abrirTutorial();
    const moedas = useGameStore.getState().coins;
    act(() => useGameStore.getState().summon('golem'));
    expect(myUnits()).toHaveLength(0);
    expect(useGameStore.getState().coins).toBe(moedas);
    expect(ultimoToast()).toContain('invoke apenas');
    expect(passo()).toBe('escolher'); // nada avançou
    act(() => useGameStore.getState().summon('ignis'));
    expect(passo()).toBe('inpecionar');
  });

  test('arraste e modo debug são recusados; o toque entra só no passo dele', () => {
    abrirTutorial();
    act(() => useGameStore.getState().summon('ignis')); // passo 2
    expect(passo()).toBe('inpecionar');
    // arraste: ainda não é o passo
    act(() => useGameStore.getState().beginDragCandidate(idEmSlot(0), 10, 10));
    expect(useGameStore.getState().pendingDrag).toBeNull();
    expect(ultimoToast()).toContain('Nada de arraste ainda');
    // criatura do modo debug: barrada no tutorial inteiro
    act(() => useGameStore.getState().setDebugMode(true));
    let criado = true;
    act(() => {
      criado = useGameStore.getState().spawnDebugUnit('golem', 3);
    });
    expect(criado).toBe(false);
    expect(myLevels()).toEqual([1]);
    expect(ultimoToast()).toContain('depuração');
    act(() => useGameStore.getState().setDebugMode(false));
    // toque: liberado aqui, é exatamente o passo 2
    act(() => useGameStore.getState().beginTapCandidate(idEmSlot(0), 10, 10));
    expect(useGameStore.getState().tapCandidate).not.toBeNull();
  });

  test('uma pressionada de dedo barrada dá UM recado (o do toque, que diz o passo)', () => {
    abrirTutorial();
    act(() => useGameStore.getState().summon('ignis'));
    act(() => {
      const id = idEmSlot(0);
      useGameStore.getState().beginTapCandidate(id, 10, 10);
      useGameStore.getState().commitTap(10, 10);
    }); // passo 3
    expect(passo()).toBe('comprar');
    // é assim que `UnitView` chama: toque + arraste candidato na mesma teclada.
    // Como a UI tem um único slot de toast, as duas barreiras juntas mostrariam
    // SÓ a segunda ('Nada de arraste ainda') e o jogador perderia o recado bom.
    act(() => {
      const id = idEmSlot(0);
      useGameStore.getState().beginTapCandidate(id, 10, 10);
      useGameStore.getState().beginDragCandidate(id, 10, 10);
    });
    const st = useGameStore.getState();
    expect(st.tapCandidate).toBeNull();
    expect(st.pendingDrag).toBeNull();
    expect(ultimoToast()).toContain('Nada de inspetor agora');
    // pressionada seguinte: o recado volta a aparecer (não é silêncio eterno)
    act(() => {
      const id = idEmSlot(0);
      useGameStore.getState().beginTapCandidate(id, 30, 30);
      useGameStore.getState().beginDragCandidate(id, 30, 30);
    });
    expect(ultimoToast()).toContain('Nada de inspetor agora');
  });

  test('no passo 4 mover buraco ou soltar fora não vale — e o recado é o do passo', () => {
    abrirTutorial();
    act(() => useGameStore.getState().summon('ignis'));
    act(() => {
      const id = idEmSlot(0);
      useGameStore.getState().beginTapCandidate(id, 10, 10);
      useGameStore.getState().commitTap(10, 10);
    });
    act(() => useGameStore.getState().summon('ignis'));
    expect(passo()).toBe('arrastar');
    expect(myLevels()).toEqual([1, 1]);
    // solta em buraco livre: mover não é o passo
    arrastar(idEmSlot(1), { side: 'player', tile: 5 });
    expect(myTiles()).toEqual([0, 1]);
    expect(ultimoToast()).toContain('Solte em cima da outra criatura');
    expect(passo()).toBe('arrastar');
    // solta sobre o botão de venda: a venda é do passo 5
    arrastarParaVenda(idEmSlot(1));
    expect(myLevels()).toEqual([1, 1]);
    expect(ultimoToast()).toContain('A venda vem no passo 5');
    expect(passo()).toBe('arrastar');
  });

  test('no passo 5 só a venda vale: soltar em buraco não move a criatura', () => {
    abrirTutorial();
    passosAteVender();
    arrastar(idEmSlot(0), { side: 'player', tile: 4 });
    expect(myLevels()).toEqual([2]);
    expect(myTiles()).toEqual([0]);
    expect(ultimoToast()).toContain('Solte sobre o botão dourado');
    expect(passo()).toBe('vender');
  });
});

// ───────────────────────── os 5 passos ─────────────────────────

describe('Os cinco passos, na ordem', () => {
  test('vender encerra a luvinha e abre a partida de verdade', async () => {
    abrirTutorial();
    tutorialInteiro(); // os 5 passos, com a venda no fim
    const st = useGameStore.getState();
    expect(passo()).toBeNull();
    expect(st.tutorialDone).toBe(true);
    expect(st.screen).toBe('game');
    expect(st.phase).toBe('preparation');
    // o recado da VENDA é o que fica na tela: a despedida chega depois para não
    // apagar a recompensa do passo (a UI tem um slot de toast só)
    expect(ultimoToast()).toContain('vendido');
    await new Promise((r) => setTimeout(r, TUTORIAL_FAREWELL_DELAY_MS + 150));
    expect(ultimoToast()).toContain('Tutorial concluído');
    // o saldo do tutorial era virtual: o cofre nunca saiu do lugar
    expect(getSave().coins).toBe(TUTORIAL_COINS);
  });

  test('o cofre não é tocado enquanto a luvinha gasta moeda virtual', () => {
    cofreCheio({ coins: 1200, roster: [{ species: 'golem', level: 2, tile: 3 }] });
    act(() => useGameStore.getState().play());
    expect(useGameStore.getState().tutorialPrompt).toBe(true);
    act(() => useGameStore.getState().answerTutorialPrompt(true));
    expect(useGameStore.getState().coins).toBe(1200);
    passosAteVender(); // passos 1-4: duas compras de 100 moedas VIRTUAIS
    expect(useGameStore.getState().coins).toBe(1000);
    expect(getSave().coins).toBe(1200);
    act(() => useGameStore.getState().skipTutorial());
    expect(getSave().coins).toBe(1200);
  });

  test('no fim dos 5 passos o time guardado volta nos mesmos buracos', () => {
    cofreCheio({
      coins: 900,
      roster: [
        { species: 'golem', level: 2, tile: 3 },
        { species: 'zephyr', level: 1, tile: 0 },
      ],
    });
    act(() => useGameStore.getState().play());
    act(() => useGameStore.getState().answerTutorialPrompt(true));
    expect(myUnits()).toHaveLength(0);
    tutorialInteiro();
    expect(myTiles()).toEqual([0, 3]);
    expect(myUnits().some((u) => u.species === 'golem' && u.level === 2)).toBe(true);
  });
});

// ───────────────────────── jogo salvo ─────────────────────────

describe('Quem já tem jogo salvo é perguntado', () => {
  test('"Jogar sem tutorial" abre a partida e não pergunta de novo', () => {
    cofreCheio({ coins: 700, roster: [{ species: 'nereia', level: 3, tile: 1 }] });
    act(() => useGameStore.getState().play());
    expect(useGameStore.getState().tutorialPrompt).toBe(true);
    expect(useGameStore.getState().screen).toBe('menu');
    expect(passo()).toBeNull();
    act(() => useGameStore.getState().answerTutorialPrompt(false));
    expect(useGameStore.getState().tutorialPrompt).toBe(false);
    expect(passo()).toBeNull();
    expect(myLevels()).toEqual([3]);
    // recusou: a pergunta não persegue o jogador a cada abertura
    act(() => useGameStore.getState().returnToMenu());
    act(() => useGameStore.getState().play());
    expect(useGameStore.getState().tutorialPrompt).toBe(false);
    expect(myLevels()).toEqual([3]);
  });

  test('"Repetir tutorial" esvazia a arena e devolve o time no fim', () => {
    cofreCheio({ coins: 800, roster: [{ species: 'golem', level: 4, tile: 2 }] });
    act(() => useGameStore.getState().play());
    act(() => useGameStore.getState().answerTutorialPrompt(false));
    expect(myLevels()).toEqual([4]);
    act(() => useGameStore.getState().requestTutorialReplay());
    expect(passo()).toBe('escolher');
    expect(myUnits()).toHaveLength(0);
    expect(useGameStore.getState().tutorialReplay).toBe(true);
    act(() => useGameStore.getState().skipTutorial());
    expect(passo()).toBeNull();
    expect(myLevels()).toEqual([4]);
    expect(myUnits()[0].tile).toBe(2);
  });

  test('fechar a aba no meio do tutorial não destrói moeda nem time', () => {
    cofreCheio({ coins: 1100, roster: [{ species: 'ignis', level: 5, tile: 6 }] });
    act(() => useGameStore.getState().play());
    act(() => useGameStore.getState().answerTutorialPrompt(true));
    act(() => useGameStore.getState().summon('ignis'));
    // reabre o app no mesmo save: tutorial não reabre, saldo e time inteiros
    act(() => useGameStore.getState().returnToMenu());
    act(() => useGameStore.getState().initFromSave());
    act(() => useGameStore.getState().play());
    expect(passo()).toBeNull();
    expect(getSave().coins).toBe(1100);
    expect(myLevels()).toEqual([5]);
  });

  test('"Reiniciar progresso" devolve o tutorial para a primeira vez', () => {
    cofreCheio({ coins: 900, roster: [{ species: 'golem', level: 1, tile: 0 }] });
    act(() => useGameStore.getState().play());
    act(() => useGameStore.getState().answerTutorialPrompt(true));
    act(() => useGameStore.getState().skipTutorial());
    expect(loadSave().tutorialDone).toBe(true);
    act(() => useGameStore.getState().resetProgress());
    expect(useGameStore.getState().tutorialDone).toBe(false);
    expect(loadSave().tutorialDone).toBe(false);
  });
});

// ───────────────────────── a luvinha na tela ─────────────────────────

describe('A luvinha na tela', () => {
  function renderTutorial(): void {
    render(
      <>
        <TutorialPrompt />
        <ShopPanel />
        <ToastLayer />
        <TutorialHand />
      </>,
    );
  }

  test('a faixa mostra o passo e a loja destaca o card ensinado, travando o resto', () => {
    renderTutorial();
    abrirTutorial();
    expect(screen.getByTestId('tutorial-caption').textContent).toContain('primeiro monstro');
    expect(screen.getByTestId('tutorial-passos').querySelectorAll('i[data-active="true"]')).toHaveLength(1);
    const ignis = screen.getByTestId('shop-ignis');
    expect(ignis).not.toBeDisabled();
    expect(ignis.getAttribute('data-tutorial-do-passo')).toBe('true');
    const golem = screen.getByTestId('shop-golem');
    expect(golem).toBeDisabled();
    expect(golem.getAttribute('data-tutorial-do-passo')).toBe('false');
    expect(golem.textContent).toContain('fora do passo');
  });

  test('a luvinha existe enquanto o tutorial vive e desaparece no fim', () => {
    cofreCheio({ coins: 600, roster: [{ species: 'golem', level: 2, tile: 4 }] });
    renderTutorial();
    act(() => useGameStore.getState().play());
    act(() => useGameStore.getState().answerTutorialPrompt(true));
    expect(screen.getByTestId('tutorial-luva')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tutorial-skip'));
    expect(passo()).toBeNull();
    expect(screen.queryByTestId('tutorial-luva')).toBeNull();
    expect(myLevels()).toEqual([2]);
  });

  test('a pergunta aparece antes de qualquer coisa no tabuleiro', () => {
    cofreCheio({ coins: 500, roster: [{ species: 'zephyr', level: 1, tile: 0 }] });
    renderTutorial();
    act(() => useGameStore.getState().play());
    expect(screen.getByTestId('tutorial-prompt')).toBeInTheDocument();
    expect(passo()).toBeNull();
    fireEvent.click(screen.getByTestId('tutorial-prompt-go'));
    expect(screen.queryByTestId('tutorial-prompt')).toBeNull();
    expect(passo()).toBe('escolher');
  });
});

// ─────────────────── a luva ilustra, o jogador joga ───────────────────

describe('A luva ilustra, quem joga é o jogador', () => {
  // a cena 3D é quem publica a ponte mundo→tela na vida real; aqui entra uma
  // projeção falsa e estável para a mímica ter para onde ir em jsdom
  const ponte: WorldBridge = {
    toScreen: (x, _y, z) => ({ x: 400 + x * 20, y: 320 - z * 20 }),
    toGround: () => null,
  };

  beforeEach(() => {
    registerWorldBridge(ponte);
  });
  afterEach(() => {
    registerWorldBridge(null);
  });

  const caixa = (x: number, y: number, lado: number): DOMRect =>
    ({
      x,
      y,
      width: lado,
      height: lado,
      top: y,
      left: x,
      right: x + lado,
      bottom: y + lado,
      toJSON: () => ({}),
    }) as DOMRect;

  /**
   * Deixa a mímica rodar em frames de verdade (o relógio da animação é o
   * carimbo do próprio rAF) e devolve as fases que a mão mostrou — `data-fase` é
   * exatamente o que o CSS usa para desenhar o gesto.
   */
  async function assistirMímica(maxFrames = 220): Promise<Set<string>> {
    const fases = new Set<string>();
    const mao = screen.getByTestId('tutorial-luva');
    for (let i = 0; i < maxFrames; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const f = mao.dataset.fase;
      if (f) fases.add(f);
      if (fases.has('soltar')) break;
    }
    return fases;
  }

  test('no passo 4 a mão percorre o trajeto e nada é arrastado nem fundido', async () => {
    render(<TutorialHand />);
    abrirTutorial();
    act(() => useGameStore.getState().summon('ignis'));
    act(() => {
      const id = idEmSlot(0);
      useGameStore.getState().beginTapCandidate(id, 10, 10);
      useGameStore.getState().commitTap(10, 10);
    });
    act(() => useGameStore.getState().summon('ignis'));
    expect(passo()).toBe('arrastar');

    const fases = await assistirMímica();
    // a mão fez o gesto de mentira: saiu da criatura e chegou na outra
    expect(fases.has('carregar')).toBe(true);
    expect(fases.has('soltar')).toBe(true);
    // …e a partida não se mexeu NEM UM MILÍMETRO: o arraste é do jogador
    expect(passo()).toBe('arrastar');
    expect(myLevels()).toEqual([1, 1]);
    expect(myTiles()).toEqual([0, 1]);
    const st = useGameStore.getState();
    expect(st.dragId).toBeNull();
    expect(st.pendingDrag).toBeNull();
    expect(st.sellHover).toBe(false);
    // o aro pontilhado marca o buraco de destino (e é surdo ao ponteiro)
    const aro = screen.getByTestId('tutorial-aro');
    expect(aro.style.transform).toContain('translate3d');

    // o jogador então faz o gesto de verdade — e só agora o passo fecha
    arrastar(idEmSlot(1), { side: 'player', tile: 0 });
    expect(passo()).toBe('vender');
    expect(myLevels()).toEqual([2]);
  });

  test('no passo 5 a mão mostra o fantasma do botão dourado sem vender nada', async () => {
    render(<TutorialHand />);
    abrirTutorial();
    passosAteVender();
    expect(passo()).toBe('vender');

    // o fantasma é DOM: em jsdom ele não tem caixa medida, então emprestamos uma
    const fab = screen.getByTestId('tutorial-fab-alvo');
    vi.spyOn(fab, 'getBoundingClientRect').mockReturnValue(caixa(900, 300, 72));

    const fases = await assistirMímica();
    expect(fases.has('carregar')).toBe(true);
    expect(fases.has('soltar')).toBe(true);
    // nada foi vendido nem levantado do tabuleiro
    expect(passo()).toBe('vender');
    expect(myLevels()).toEqual([2]);
    expect(myTiles()).toEqual([0]);
    const st = useGameStore.getState();
    expect(st.dragId).toBeNull();
    expect(st.pendingDrag).toBeNull();
    expect(st.sellHover).toBe(false);
  });
});
