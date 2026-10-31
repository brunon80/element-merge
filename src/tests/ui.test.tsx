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
import { DiscoveryOverlay } from '../components/DiscoveryOverlay';
import { HUD } from '../components/HUD';
import { InspectorPanel } from '../components/InspectorPanel';
import { ResultScreen } from '../components/ResultScreen';
import { SettingsMenu } from '../components/SettingsMenu';
import { ShopPanel } from '../components/ShopPanel';
import { ToastLayer } from '../components/ToastLayer';
import { tileGroundPosition } from '../game/board';
import { TREE_SPECIES_IDS, getSpecies } from '../data/monsters';
import type { Side } from '../game/types';
import { getEngine, useGameStore } from '../store/gameStore';

function freshGame() {
  const st = useGameStore.getState();
  st.returnToMenu();
  st.resetProgress();
  st.setDebugMode(false); // o modo debug persiste no save: teste começa sem ele
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
      <SettingsMenu />
      <DiscoveryOverlay />
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

    // regra da árvore: espécies DIFERENTES só fundem a partir do Nv.5
    expect(screen.getByTestId('toast').textContent).toContain('a partir do Nível 5');
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
    // Regra da árvore: puras Nv.1 de elementos DIFERENTES NÃO fundem mais
    // (espécies diferentes só a partir do Nv.5); o par válido no Nv.1 é o
    // mesmo elemento. A etiqueta de resultado aparece só em fusão válida.
    const st = useGameStore.getState();
    st.summon('ignis'); // este será segurado
    st.summon('ignis'); // par de fusão válida (mesma espécie, Nv.1)
    st.summon('nereia'); // alvo inválido: pura diferente no Nv.1 (MIN_LEVEL)
    st.summon('ignis');
    st.summon('ignis'); // estes dois viram um Nv2 (caso de níveis diferentes)
    const eng = getEngine()!;
    const mine = eng.world.units.filter((u) => u.side === 'player' && u.alive);
    const dragged = mine[0];
    const partner = mine[1];
    const water = mine[2];

    st.tryMergeIds(mine[3].id, mine[4].id); // 2×Nv1 → 1×Nv2 (grátis)
    const grown = eng.world.units.find(
      (u) => u.side === 'player' && u.alive && u.level === 2,
    )!;
    expect(grown).toBeTruthy();
    expect(grown.id).not.toBe(dragged.id);

    expect(startDrag(dragged.id)).toBe(true);

    // fusão válida de pura: etiqueta com o resultado (espécie já descoberta)
    useGameStore.getState().hoverWorld(...tileXZ('player', partner.tile));
    let hv = useGameStore.getState().dragHover;
    expect(hv?.kind).toBe('merge');
    expect(hv?.targetId).toBe(partner.id);
    expect(hv?.fusion).toEqual({ label: 'Ignis', level: 2, known: true });

    // Nv.1 de fogo sobre Nv.1 de água: nada de híbrido no Nv.1 — invalid
    useGameStore.getState().hoverWorld(...tileXZ('player', water.tile));
    hv = useGameStore.getState().dragHover;
    expect(hv?.kind).toBe('invalid');
    expect(hv?.fusion).toBeUndefined();

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

describe('Modo debug (bestiário → criatura no campo)', () => {
  /** abre Configurações → Depuração e acende o interruptor */
  function enableDebugUi(): void {
    act(() => useGameStore.getState().setSettings(true));
    fireEvent.click(screen.getByTestId('settings-tab-debug'));
    fireEvent.click(screen.getByTestId('debug-toggle'));
    expect(useGameStore.getState().debugMode).toBe(true);
    fireEvent.click(screen.getByTestId('close-settings'));
  }

  test('desligado: nada de botão; tentativa de criar é recusada sem efeitos', () => {
    renderAll();
    act(() => useGameStore.getState().setBestiary(true));
    expect(document.querySelector('.debug-spawn-btn')).toBeNull();
    act(() => {
      expect(useGameStore.getState().spawnDebugUnit('magma', 6)).toBe(false);
    });
    expect(myUnits()).toHaveLength(0);
  });

  test('interruptor nas configurações; ligar persiste ao "recarregar" a página', () => {
    renderAll();
    enableDebugUi();
    expect(useGameStore.getState().debugMode).toBe(true);
    act(() => useGameStore.getState().initFromSave());
    expect(useGameStore.getState().debugMode).toBe(true); // salvo no localStorage
  });

  test('cria TODAS as espécies da árvore (inclusive seladas) sem fusão e sem custo', () => {
    renderAll();
    enableDebugUi();
    const eng = getEngine()!;
    const coinsBefore = useGameStore.getState().coins;
    const discoveredBefore = [...useGameStore.getState().discovered];

    // 19 espécies da árvore para 12 slots: as 12 primeiras entram, o resto ouve
    // "Arena cheia" — o debug não teletransporta nada nem esvazia o tabuleiro.
    act(() => useGameStore.getState().setBestiary(true));
    let spawnedOk = 0;
    for (const id of TREE_SPECIES_IDS) {
      // o card selado também tem o botão (é para isso que o debug existe)
      fireEvent.click(screen.getByTestId(`debug-spawn-${id}`));
      if (useGameStore.getState().showBestiary === false) {
        spawnedOk += 1;
        act(() => useGameStore.getState().setBestiary(true));
      }
    }
    act(() => useGameStore.getState().setBestiary(false));

    expect(spawnedOk).toBe(12);
    expect(myUnits()).toHaveLength(12);
    for (const u of myUnits()) {
      // entra no nível fixo oficial da espécie, nunca um nível inventado
      expect(u.level, u.species).toBe(getSpecies(u.species).levelMin);
      expect(TREE_SPECIES_IDS).toContain(u.species);
    }
    expect(screen.getByTestId('toast').textContent).toContain('Arena cheia');
    // debug não é fusão nem descoberta, e não mexe na economia
    expect(useGameStore.getState().coins).toBe(coinsBefore);
    expect(useGameStore.getState().discovered).toEqual(discoveredBefore);
    expect(eng.world.fx.filter((f) => f.type === 'discovery')).toHaveLength(0);
    expect(eng.world.fx.filter((f) => f.type === 'mergeDone')).toHaveLength(0);
  });

  test('puro entra na forma escolhida no bestiário; selado usa o nível fixo', () => {
    renderAll();
    enableDebugUi();
    act(() => useGameStore.getState().setBestiary(true));
    fireEvent.click(screen.getByTestId('debug-level-ignis-4'));
    fireEvent.click(screen.getByTestId('debug-spawn-ignis'));
    expect(useGameStore.getState().showBestiary).toBe(false);
    expect(myLevels()).toEqual([4]);
    expect(myUnits()[0].species).toBe('ignis');

    act(() => useGameStore.getState().setBestiary(true));
    fireEvent.click(screen.getByTestId('debug-spawn-primordial')); // card selado
    act(() => useGameStore.getState().setBestiary(false));
    const top = myUnits().find((u) => u.species === 'primordial');
    expect(top?.level).toBe(10);
  });

  test('só durante a preparação: em combate o debug recusa e avisa', () => {
    renderAll();
    act(() => useGameStore.getState().setDebugMode(true));
    act(() => {
      getEngine()!.startBattle();
      expect(useGameStore.getState().spawnDebugUnit('magma', 6)).toBe(false);
      useGameStore.getState().syncUi();
    });
    expect(screen.getByTestId('toast').textContent).toContain('preparação');
    expect(myUnits()).toHaveLength(0);
  });

  test('criatura do debug sobrevive e volta com o time persistido', () => {
    renderAll();
    useGameStore.getState().setDifficulty('easy'); // o Nv.10 não enfrenta espelho da árvore
    act(() => useGameStore.getState().setDebugMode(true));
    act(() => {
      expect(useGameStore.getState().spawnDebugUnit('primordial', 10)).toBe(true);
    });
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
    act(() => useGameStore.getState().startNewMatch());
    const top = myUnits().find((u) => u.species === 'primordial');
    expect(top?.level).toBe(10);
  });
});

describe('Enciclopédia (bestiário)', () => {
  test('toda espécie tem visualizador 3D; seladas mostram silhueta + nível só', () => {
    renderAll();
    act(() => useGameStore.getState().setBestiary(true));
    // 4 puros + 19 da árvore — as seladas aparecem como silhueta escura
    const models = screen.getAllByTestId('beast-model');
    expect(models).toHaveLength(23);
    const card = models[0].closest('.beast-card') as HTMLElement;
    expect(card.querySelector('.beast-head')).toBeInTheDocument();
    // o modelo vem antes da descrição e da tabela de estatísticas
    const all = Array.from(card.querySelectorAll('.beast-head, .beast-model, .beast-blurb, .beast-table'));
    expect(all.indexOf(models[0])).toBe(1);
    expect(card.textContent).toContain('Nv');

    // card selado: apenas "???" + nível — sem nome, stats, elementos ou receita
    const locked = document.querySelector('.beast-card.locked') as HTMLElement;
    expect(locked).toBeTruthy();
    expect(locked.textContent).toContain('???');
    expect(locked.textContent).toContain('Nv.6');
    expect(locked.querySelector('table')).toBeNull();
    expect(locked.querySelector('[data-testid^="recipe-"]')).toBeNull();
  });

  test('progresso da árvore e receitas reveladas apenas após descobrir', () => {
    renderAll();
    act(() => useGameStore.getState().setBestiary(true));
    const bestiary = screen.getByTestId('bestiary');
    expect(screen.getByTestId('bestiary-progress').textContent).toContain('0/19');
    expect(bestiary.textContent).toContain('Ignis');
    expect(bestiary.textContent).toContain('???');
    expect(bestiary.textContent).not.toContain('Magma');
    act(() => useGameStore.getState().setBestiary(false));

    // descobre Magma: arrastar Gólem Nv.5 sobre Ignis Nv.5 (unidades do time
    // persistido — a loja não invoca espécie da árvore em nenhum nível)
    const eng = getEngine()!;
    const earth = eng.addRetainedUnit('golem', 5);
    const fire = eng.addRetainedUnit('ignis', 5);
    expect(earth.ok && fire.ok).toBe(true);
    const fireUnit = eng.getUnit(fire.unitId!)!;

    // durante o arraste, o resultado inédito aparece como "??? Nv.6"
    act(() => {
      const st = useGameStore.getState();
      st.beginDragCandidate(earth.unitId!, 20, 20);
      st.tryPromoteDrag(140, 130);
      useGameStore.getState().hoverWorld(...tileXZ('player', fireUnit.tile));
    });
    expect(useGameStore.getState().dragHover?.fusion).toEqual({
      label: '???',
      level: 6,
      known: false,
    });
    act(() => useGameStore.getState().endDrag());
    act(() => useGameStore.getState().dismissDiscovery());

    expect(useGameStore.getState().discovered).toContain('magma');
    act(() => useGameStore.getState().setBestiary(true));
    const revealed = screen.getByTestId('bestiary');
    expect(revealed.textContent).toContain('Magma');
    expect(screen.getByTestId('bestiary-progress').textContent).toContain('1/19');
    // receita revelada só depois da descoberta
    expect(screen.getByTestId('recipe-magma').textContent).toContain(
      'Gólem Nv.5 + Ignis Nv.5 → 1 unidade de Magma Nv.6',
    );
  });

  test('primeira fusão inédita abre o overlay de descoberta; fechar é permanente', () => {
    renderAll();
    const eng = getEngine()!;
    const a = eng.addRetainedUnit('nereia', 5);
    const b = eng.addRetainedUnit('zephyr', 5);
    expect(a.ok && b.ok).toBe(true);
    dragOnto(a.unitId!, eng.getUnit(b.unitId!)!);

    // descoberta registrada na hora (independente de fechar o overlay)
    expect(useGameStore.getState().discovered).toContain('gelo');
    expect(useGameStore.getState().discoveryReveal?.species).toBe('gelo');
    expect(screen.getByTestId('discovery-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('discovery-name').textContent).toContain('Gelo');
    expect(screen.getByTestId('discovery-card').textContent).toContain('Nv.6');
    expect(useGameStore.getState().toast).toBeTruthy(); // toast avisou também

    fireEvent.click(screen.getByTestId('discovery-close'));
    expect(screen.queryByTestId('discovery-overlay')).toBeNull();
    expect(useGameStore.getState().discoveryReveal).toBeNull();
    expect(useGameStore.getState().discovered).toContain('gelo'); // permanente

    // fusão repetida de espécie já descoberta NÃO reabre o overlay
    const c = eng.addRetainedUnit('nereia', 5);
    const d = eng.addRetainedUnit('zephyr', 5);
    expect(c.ok && d.ok).toBe(true);
    dragOnto(c.unitId!, eng.getUnit(d.unitId!)!);
    expect(useGameStore.getState().discoveryReveal).toBeNull();
    expect(screen.queryByTestId('discovery-overlay')).toBeNull();
  });

  test('nascimento do Primordial ganha overlay especial (Nv.10)', () => {
    renderAll();
    const eng = getEngine()!;
    const a = eng.addRetainedUnit('astral', 9);
    const b = eng.addRetainedUnit('colosso', 9);
    expect(a.ok && b.ok).toBe(true);
    dragOnto(a.unitId!, eng.getUnit(b.unitId!)!);

    expect(useGameStore.getState().discoveryReveal).toEqual({
      species: 'primordial',
      level: 10,
      level10: true,
    });
    const card = screen.getByTestId('discovery-card');
    expect(card.className).toContain('primordial');
    expect(card.textContent).toContain('NASCIMENTO DO PRIMORDIAL');
    expect(screen.getByTestId('discovery-name').textContent).toContain('Primordial');
  });
});
