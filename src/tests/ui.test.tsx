/**
 * Testes de UI (React Testing Library) na camada de componentes.
 * Cobre: invocação via loja, fusão ARRASTANDO NA ARENA 3D (o único caminho de
 * fusão: segurar → arrastar → soltar, passando por hoverWorld/endDrag do store),
 * toast de fusão inválida, HUD sincronizado com o store, destaque do destino
 * sob o ponteiro, fluxo de resultado (recompensa única, saldo persistido) e
 * enciclopédia.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { Bestiary } from '../components/Bestiary';
import { HUD } from '../components/HUD';
import { InspectorPanel } from '../components/InspectorPanel';
import { ResultScreen } from '../components/ResultScreen';
import { ShopPanel } from '../components/ShopPanel';
import { ToastLayer } from '../components/ToastLayer';
import { tileGroundPosition } from '../game/board';
import type { Side } from '../game/types';
import { getEngine, useGameStore } from '../store/gameStore';

function freshGame() {
  const st = useGameStore.getState();
  st.returnToMenu();
  st.resetProgress();
  st.startNewMatch();
  useGameStore.setState({ toast: null }); // limpa o aviso "progresso reiniciado"
}

function renderAll() {
  render(
    <>
      <HUD />
      <ShopPanel />
      <InspectorPanel />
      <ToastLayer />
      <ResultScreen />
      <Bestiary />
    </>,
  );
}

function clickSummon(species: 'shop-ignis' | 'shop-nereia' | 'shop-golem' | 'shop-zephyr', times = 1) {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByTestId(species));
}

/** chão do slot como o ponteiro o vê (x, z) */
function tileXZ(side: Side, tile: number): [number, number] {
  const p = tileGroundPosition(side, tile);
  return [p[0], p[2]];
}

/** criaturas vivas do jogador no tabuleiro (fonte da verdade: o motor) */
function myUnits() {
  return getEngine()!.world.units.filter((u) => u.side === 'player' && u.alive);
}

function myLevels(): number[] {
  return myUnits()
    .map((u) => u.level)
    .sort((a, b) => a - b);
}

/**
 * O mesmo caminho de um arraste real na arena: segurar a criatura, mover o
 * ponteiro até o slot de destino (hoverWorld lê a posição no chão) e soltar.
 * Envolve em act() para que os componentes (toast, enciclopédia) vejam o
 * resultado — em jogo esses updates vêm do ponteiro, fora do React.
 */
function dragOnto(aId: number, b: { side: Side; tile: number }) {
  act(() => {
    const st = useGameStore.getState();
    st.beginDragCandidate(aId, 20, 20);
    st.tryPromoteDrag(140, 130); // moveu o bastante: virou arraste
    useGameStore.getState().hoverWorld(...tileXZ(b.side, b.tile));
    useGameStore.getState().endDrag();
  });
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  freshGame();
});

describe('Loja e invocação', () => {
  test('invocar Ignis custa 100 e a criatura entra na arena', () => {
    renderAll();
    clickSummon('shop-ignis');
    expect(useGameStore.getState().coins).toBe(400);
    expect(myUnits()).toHaveLength(1);
    expect(myUnits()[0].species).toBe('ignis');
    expect(screen.getByTestId('coins').textContent).toContain('400');
  });

  test('saldo abaixo de 100 desabilita a loja e nunca deixa o saldo negativo', () => {
    renderAll();
    clickSummon('shop-ignis', 5); // 500 → 0
    expect(useGameStore.getState().coins).toBe(0);
    const card = screen.getByTestId('shop-ignis') as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    fireEvent.click(card);
    expect(useGameStore.getState().coins).toBe(0);
  });
});

describe('Fusão arrastando na arena 3D (único caminho de fusão)', () => {
  test('2×Nv.1 iguais → exatamente 1 criatura Nv.2 (regra 2→1, fusão é grátis)', () => {
    renderAll();
    clickSummon('shop-ignis', 2);
    const [a, b] = myUnits();
    dragOnto(a.id, b);
    expect(myUnits()).toHaveLength(1);
    expect(myLevels()).toEqual([2]);
    expect(useGameStore.getState().coins).toBe(300); // fundir não custa nada
  });

  test('cadeia 2→1 em todos os níveis: 4×Nv.1 → 2×Nv.2 → 1×Nv.3', () => {
    renderAll();
    clickSummon('shop-ignis', 4);
    let l1 = myUnits().filter((u) => u.level === 1);
    dragOnto(l1[0].id, l1[1]); // primeiro par → Nv.2
    l1 = myUnits().filter((u) => u.level === 1);
    expect(l1).toHaveLength(2);
    dragOnto(l1[0].id, l1[1]); // segundo par → Nv.2
    expect(myLevels()).toEqual([2, 2]);
    const n2 = myUnits();
    dragOnto(n2[0].id, n2[1]); // 2 Nv.2 → 1 Nv.3
    expect(myUnits()).toHaveLength(1);
    expect(myLevels()).toEqual([3]);
  });

  test('espécies incompatíveis: toast de erro e esquadrão intacto (mutação atômica)', () => {
    renderAll();
    clickSummon('shop-ignis', 2);
    clickSummon('shop-golem', 2);
    // quem nasce da fusão entra no fim da lista do motor — reler e escolher
    // sempre por espécie/nível, nunca por índice fixo
    let par = myUnits().filter((u) => u.species === 'ignis');
    dragOnto(par[0].id, par[1]); // par ignis → 1×Nv.2
    par = myUnits().filter((u) => u.species === 'golem');
    dragOnto(par[0].id, par[1]); // par golem → 1×Nv.2
    expect(myUnits()).toHaveLength(2);
    expect(screen.queryByTestId('toast')).toBeNull();

    const us = myUnits();
    const ignisLv2 = us.find((u) => u.species === 'ignis')!;
    const golemLv2 = us.find((u) => u.species === 'golem')!;
    dragOnto(ignisLv2.id, golemLv2); // Nv.2 de fogo em cima de Nv.2 de terra

    expect(screen.getByTestId('toast').textContent).toContain('Espécies incompatíveis');
    expect(myUnits()).toHaveLength(2); // nada foi mutado
    expect(myLevels()).toEqual([2, 2]);
  });

  test('níveis diferentes não fundem (toast específico)', () => {
    renderAll();
    clickSummon('shop-ignis', 3);
    let us = myUnits();
    dragOnto(us[0].id, us[1]); // → 1×Nv.2 + 1×Nv.1
    us = myUnits();
    const lv2 = us.find((u) => u.level === 2)!;
    const lv1 = us.find((u) => u.level === 1)!;
    dragOnto(lv1.id, lv2);
    expect(screen.getByTestId('toast').textContent).toContain('mesmo nível');
    expect(myUnits()).toHaveLength(2);
    expect(myLevels()).toEqual([1, 2]);
  });
});

describe('Destaque do destino enquanto o monstro está segurado', () => {
  // Mouse segurado e toque segurado seguem o mesmo caminho de dados: a cena
  // converge o ponteiro para coordenadas do chão e chama hoverWorld; UnitView
  // faz a criatura PERSEGUIR o ponteiro e o DropSpot mostra o destino.
  function startDrag(draggedId: number) {
    const st = useGameStore.getState();
    st.beginDragCandidate(draggedId, 20, 20);
    st.tryPromoteDrag(140, 130);
    return useGameStore.getState().dragId !== null;
  }

  function threePlayers() {
    const st = useGameStore.getState();
    st.summon('ignis');
    st.summon('ignis');
    st.summon('nereia');
    const eng = getEngine()!;
    return {
      eng,
      mine: eng.world.units.filter((u) => u.side === 'player' && u.alive),
    };
  }

  test('slot livre marca "move" e registra a posição do ponteiro', () => {
    const { mine } = threePlayers();
    const dragged = mine[0];
    expect(startDrag(dragged.id)).toBe(true);

    const free = tileGroundPosition('player', 5);
    useGameStore.getState().hoverWorld(free[0], free[2]);

    expect(useGameStore.getState().dragHover).toEqual({
      side: 'player',
      tile: 5,
      kind: 'move',
    });
    // é essa posição que faz a criatura seguir o cursor
    expect(useGameStore.getState().dragPointer).toEqual({ x: free[0], z: free[2] });
  });

  test('mescla possível marca "merge" e o que não funde marca "invalid" (vermelho)', () => {
    // Regra do jogo: dois puros Nv1 de elementos DIFERENTES fundem em híbrido,
    // então o caso inválido precisa ser um par que a regra realmente recusa —
    // Nv1 do mesmo elemento sobre um Nv2 (fusão exige níveis iguais).
    const st = useGameStore.getState();
    st.summon('ignis'); // este será segurado
    st.summon('ignis'); // estes dois viram um Nv2
    st.summon('ignis');
    st.summon('nereia'); // puro Nv1 de outro elemento
    const eng = getEngine()!;
    const mine = eng.world.units.filter((u) => u.side === 'player' && u.alive);
    const dragged = mine[0];
    const water = mine[3];

    st.tryMergeIds(mine[1].id, mine[2].id); // 2×Nv1 → 1×Nv2 (grátis)
    const grown = eng.world.units.find(
      (u) => u.side === 'player' && u.alive && u.level === 2,
    )!;
    expect(grown).toBeTruthy();
    expect(grown.id).not.toBe(dragged.id);

    expect(startDrag(dragged.id)).toBe(true);

    // híbrido possível: Nv1 de fogo sobre Nv1 de água
    useGameStore.getState().hoverWorld(...tileXZ('player', water.tile));
    let hv = useGameStore.getState().dragHover;
    expect(hv?.kind).toBe('merge');
    expect(hv?.targetId).toBe(water.id);

    // Nv1 sobre Nv2 da mesma espécie: os níveis precisam ser iguais
    useGameStore.getState().hoverWorld(...tileXZ('player', grown.tile));
    hv = useGameStore.getState().dragHover;
    expect(hv?.kind).toBe('invalid');
    expect(hv?.targetId).toBe(grown.id);
  });

  test('fora do tabuleiro e sobre a própria criatura: sem destino, ponteiro vivo', () => {
    const { eng, mine } = threePlayers();
    const dragged = mine[0];
    startDrag(dragged.id);

    // encima da própria criatura: nenhum destino, mas o retículo acompanha
    useGameStore.getState().hoverWorld(...tileXZ('player', dragged.tile));
    expect(useGameStore.getState().dragHover).toBeNull();
    expect(useGameStore.getState().dragPointer).not.toBeNull();

    // centro da arena: não é lado do jogador -> sem destino, X vermelho no ponteiro
    useGameStore.getState().hoverWorld(0, 0);
    expect(useGameStore.getState().dragHover).toBeNull();
    expect(useGameStore.getState().dragPointer).toEqual({ x: 0, z: 0 });

    // soltar ali não move nada e apaga o destaque
    useGameStore.getState().endDrag();
    expect(useGameStore.getState().dragHover).toBeNull();
    expect(useGameStore.getState().dragPointer).toBeNull();
    expect(eng.getUnit(dragged.id)?.tile).toBe(0);
  });

  test('soltar num slot destacado "move" muda a criatura de slot', () => {
    const { eng, mine } = threePlayers();
    const dragged = mine[0];
    startDrag(dragged.id);
    useGameStore.getState().hoverWorld(...tileXZ('player', 5));
    useGameStore.getState().endDrag();
    expect(eng.getUnit(dragged.id)?.tile).toBe(5);
    expect(useGameStore.getState().dragHover).toBeNull();
  });
});

describe('Lixeira — vender criatura arrastada', () => {
  function holdUnit(id: number) {
    const st = useGameStore.getState();
    st.beginDragCandidate(id, 20, 20);
    st.tryPromoteDrag(140, 130);
  }

  function sellByDrag(id: number) {
    act(() => {
      const st = useGameStore.getState();
      st.beginDragCandidate(id, 20, 20);
      st.tryPromoteDrag(140, 130);
      st.setSellHover(true); // o dedo está sobre a lixeira (no jogo é o elementFromPoint)
      st.endDrag();
    });
  }

  test('a lixeira fica logo acima dos cards de invocação', () => {
    renderAll();
    const bin = screen.getByTestId('sell-bin');
    const card = screen.getByTestId('shop-ignis');
    // no painel, a lixeira vem antes dos cards (está acima deles)
    expect(bin.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('arrastar um Nv.2 mostra na lixeira o valor a devolver', () => {
    renderAll();
    clickSummon('shop-ignis', 2);
    const us = myUnits();
    dragOnto(us[0].id, us[1]); // → Nv.2 (custou 2×100)
    const grown = myUnits().find((u) => u.level === 2)!;
    act(() => holdUnit(grown.id));
    expect(screen.getByTestId('sell-bin-value').textContent).toContain('200');
    act(() => useGameStore.getState().endDrag());
  });

  test('soltar sobre a lixeira some com a criatura e devolve as moedas', () => {
    renderAll();
    clickSummon('shop-ignis', 3); // 500 → 200
    const us = myUnits();
    dragOnto(us[0].id, us[1]); // Nv.2 + Nv.1
    const grown = myUnits().find((u) => u.level === 2)!;
    sellByDrag(grown.id);
    expect(myUnits()).toHaveLength(1); // sobra só o Nv.1
    expect(useGameStore.getState().coins).toBe(400); // 200 + 200 de volta
    const toast = screen.getByTestId('toast');
    expect(toast.textContent).toContain('vendido');
    expect(toast.textContent).toContain('200');
    expect(useGameStore.getState().sellHover).toBe(false);
  });

  test('Nv.3 fundido devolve os 400 dos 4 Nv.1 que o formaram', () => {
    renderAll();
    clickSummon('shop-ignis', 4); // 500 → 100
    let l1 = myUnits().filter((u) => u.level === 1);
    dragOnto(l1[0].id, l1[1]);
    l1 = myUnits().filter((u) => u.level === 1);
    dragOnto(l1[0].id, l1[1]);
    const n2 = myUnits();
    dragOnto(n2[0].id, n2[1]); // sobra 1×Nv.3
    expect(myLevels()).toEqual([3]);
    sellByDrag(myUnits()[0].id);
    expect(myUnits()).toHaveLength(0);
    expect(useGameStore.getState().coins).toBe(500); // investiu 400, recebeu 400
  });

  test('se o ponteiro sair da lixeira, a venda não acontece', () => {
    renderAll();
    clickSummon('shop-ignis');
    const id = myUnits()[0].id;
    act(() => {
      const st = useGameStore.getState();
      st.beginDragCandidate(id, 20, 20);
      st.tryPromoteDrag(140, 130);
      st.setSellHover(true);
      st.setSellHover(false); // o dedo saiu da lixeira antes de soltar
      st.endDrag();
    });
    expect(myUnits()).toHaveLength(1);
    expect(useGameStore.getState().coins).toBe(400);
  });
});

describe('HUD e inspetor', () => {
  test('HUD espelha as moedas do store em tempo real', () => {
    renderAll();
    expect(screen.getByTestId('coins').textContent).toContain('500');
    clickSummon('shop-nereia');
    expect(screen.getByTestId('coins').textContent).toContain('400');
  });

  test('tocar numa criatura da arena abre o inspetor com nome e stats da espécie', () => {
    renderAll();
    clickSummon('shop-nereia');
    act(() => useGameStore.getState().selectUnit(myUnits()[0].id));
    const insp = screen.getByTestId('inspector');
    expect(insp).toBeInTheDocument();
    expect(insp.textContent).toContain('Nereia');
    expect(insp.textContent).toContain('Lentidão');
  });
});

describe('Fluxo de partida completa via UI', () => {
  test('simulação até o fim: tela de resultado com recompensa fixa e saldo correto; nova partida preserva o saldo', () => {
    renderAll();
    // força do jogador: 4×Ignis → 2×Nv.2 → fundidos de novo em 1×Nv.3
    clickSummon('shop-ignis', 4);
    let l1 = myUnits().filter((u) => u.level === 1);
    dragOnto(l1[0].id, l1[1]);
    l1 = myUnits().filter((u) => u.level === 1);
    dragOnto(l1[0].id, l1[1]);
    expect(myLevels()).toEqual([2, 2]);
    const n2 = myUnits();
    dragOnto(n2[0].id, n2[1]);
    expect(myUnits()).toHaveLength(1);

    act(() => {
      const eng = getEngine()!;
      eng.startBattle(); // exército inimigo é gerado aqui
      let guard = 0;
      while (!eng.world.summary && guard++ < 30000) eng.update(1 / 60);
      useGameStore.getState().syncUi();
    });

    const st = useGameStore.getState();
    expect(st.lastSummary).not.toBeNull();
    const summary = st.lastSummary!;
    expect(['victory', 'defeat', 'draw']).toContain(summary.result);
    const expectedReward = summary.result === 'victory' ? 100 : 50;
    expect(summary.reward).toBe(expectedReward);

    const result = screen.getByTestId('result-screen');
    expect(result).toBeInTheDocument();
    expect(screen.getByTestId('reward-chip').textContent).toContain(`+${expectedReward}`);
    const expectedBalance = 500 - 400 + expectedReward;
    expect(screen.getByTestId('balance-after').textContent).toBe(String(expectedBalance));
    expect(st.coins).toBe(expectedBalance);

    fireEvent.click(screen.getByTestId('new-match'));
    // recompensa não duplica: saldo do novo match é exatamente o anterior
    expect(useGameStore.getState().coins).toBe(expectedBalance);
    expect(screen.queryByTestId('result-screen')).toBeNull();
  });

  test('recompensa idempotente ao "recarregar": initFromSave mantém o mesmo saldo', () => {
    renderAll();
    const st = useGameStore.getState();
    act(() => {
      st.summon('golem');
      st.summon('golem');
    });
    act(() => {
      const eng = getEngine()!;
      eng.startBattle();
      let guard = 0;
      while (!eng.world.summary && guard++ < 30000) eng.update(1 / 60);
    });
    act(() => useGameStore.getState().syncUi());
    const coinsAfterMatch = useGameStore.getState().coins;
    expect(coinsAfterMatch).toBeGreaterThan(0);
    // simula F5: relê o mesmo localStorage
    act(() => useGameStore.getState().initFromSave());
    expect(useGameStore.getState().coins).toBe(coinsAfterMatch);
  });
});

describe('Tempo persistido entre partidas', () => {
  test('sobreviventes voltam de graça (mesma espécie/nível) para o próximo combate', () => {
    renderAll();
    useGameStore.getState().setDifficulty('easy');
    clickSummon('shop-golem', 4);
    let us = myUnits();
    dragOnto(us[0].id, us[1]); // → Nv.2
    us = myUnits().filter((u) => u.level === 1);
    dragOnto(us[0].id, us[1]); // os Nv.1 restantes → Nv.2
    expect(myLevels()).toEqual([2, 2]); // fácil: orçamento inimigo ~200

    act(() => {
      const eng = getEngine()!;
      eng.startBattle();
      let guard = 0;
      while (!eng.world.summary && guard++ < 30000) eng.update(1 / 60);
      useGameStore.getState().syncUi();
    });

    const st = useGameStore.getState();
    expect(st.lastSummary).not.toBeNull();
    expect(st.retainedCount).toBeGreaterThanOrEqual(1);

    const coinsBeforeNext = st.coins;
    fireEvent.click(screen.getByTestId('new-match'));
    const after = useGameStore.getState();
    expect(after.retainedCount).toBe(st.retainedCount);
    expect(after.coins).toBe(coinsBeforeNext); // voltar não custa nada
    const restored = myUnits();
    expect(restored).toHaveLength(st.retainedCount);
    for (const u of restored) expect(u.species).toBe('golem');
  });

  test('time persistido sobrevive ao "recarregar" a página (localStorage)', () => {
    renderAll();
    useGameStore.getState().setDifficulty('easy');
    clickSummon('shop-golem', 2);
    act(() => {
      const eng = getEngine()!;
      eng.startBattle();
      let guard = 0;
      while (!eng.world.summary && guard++ < 30000) eng.update(1 / 60);
      useGameStore.getState().syncUi();
    });
    const retained = useGameStore.getState().retainedCount;
    expect(retained).toBeGreaterThanOrEqual(1);

    // recarregar: relê o mesmo localStorage e reconstitui o time
    act(() => useGameStore.getState().initFromSave());
    expect(useGameStore.getState().retainedCount).toBe(retained);
    act(() => useGameStore.getState().startNewMatch());
    expect(myUnits()).toHaveLength(retained);
  });

  test('derrota total zera o time persistido (recomeçar com moedas)', () => {
    renderAll();
    useGameStore.getState().setDifficulty('hard');
    clickSummon('shop-zephyr'); // frágil contra um exército difícil
    act(() => {
      const eng = getEngine()!;
      eng.startBattle();
      let guard = 0;
      while (!eng.world.summary && guard++ < 30000) eng.update(1 / 60);
      useGameStore.getState().syncUi();
    });
    const st = useGameStore.getState();
    expect(st.lastSummary).not.toBeNull();
    if (st.lastSummary!.result === 'defeat') {
      expect(st.retainedCount).toBe(0);
      act(() => useGameStore.getState().startNewMatch());
      expect(myUnits()).toHaveLength(0);
    }
  });
});

describe('Enciclopédia (bestiário)', () => {
  test('cards de espécie exibem o visualizador 3D acima das informações; selados não', () => {
    renderAll();
    act(() => useGameStore.getState().setBestiary(true));
    // 4 puros destravados; híbridos todos selados → exatamente 4 visualizadores
    const models = screen.getAllByTestId('beast-model');
    expect(models).toHaveLength(4);
    const card = models[0].closest('.beast-card') as HTMLElement;
    expect(card.querySelector('.beast-head')).toBeInTheDocument();
    // o modelo vem antes da descrição e da tabela de estatísticas
    const all = Array.from(card.querySelectorAll('.beast-head, .beast-model, .beast-blurb, .beast-table'));
    expect(all.indexOf(models[0])).toBe(1);
    expect(card.textContent).toContain('Nv');
  });

  test('híbrido selado aparece como ???; descobrir em jogo o revela', () => {
    renderAll();
    act(() => useGameStore.getState().setBestiary(true));
    const bestiary = screen.getByTestId('bestiary');
    expect(bestiary.textContent).toContain('Ignis');
    expect(bestiary.textContent).toContain('???');
    expect(bestiary.textContent).not.toContain('Vulcane');

    // descobre Vulcane: arrastar Ignis(Nv.1) sobre Gólem(Nv.1)
    clickSummon('shop-ignis');
    clickSummon('shop-golem');
    const [fire, earth] = myUnits();
    dragOnto(fire.id, earth);

    expect(useGameStore.getState().discovered).toContain('vulcane');
    expect(bestiary.textContent).toContain('Vulcane');
    expect(bestiary.textContent).toContain('= Vulcane');
  });
});
