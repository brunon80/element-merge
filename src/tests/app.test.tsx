/**
 * Smoke test do App: renderiza com Canvas mockado (sem WebGL em jsdom),
 * confere o fluxo menu → jogo → enciclopédia e a presença dos painéis.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
}));

vi.mock('../scene/BattleScene', () => ({
  BattleScene: ({ menuMode }: { menuMode: boolean }) => (
    <div data-testid={menuMode ? 'scene-menu' : 'scene-game'} />
  ),
}));

// O compositor bloom precisa de WebGL; no smoke jsdom o App só precisa do
// ARENA_BG (o fog).
vi.mock('../scene/BloomGate', () => ({
  ARENA_BG: '#0b1020',
  BloomGate: () => null,
}));

import { App } from '../app/App';
import { getEngine, useGameStore } from '../store/gameStore';

beforeEach(() => {
  cleanup();
  const st = useGameStore.getState();
  st.returnToMenu();
  st.resetProgress();
  localStorage.clear();
  // o smoke test do App percorre o caminho de quem já viu o tutorial: "Jogar"
  // abre a partida direto (os 5 passos ficam em src/tests/tutorial.test.tsx)
  useGameStore.setState({ tutorialDone: true, toast: null });
});

describe('App (smoke)', () => {
  test('menu inicial mostra jogar, cenário em modo menu e saldo inicial', () => {
    render(<App />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('scene-menu')).toBeInTheDocument();
    expect(screen.getByTestId('play')).toBeInTheDocument();
    expect(screen.getByTestId('play').textContent).toContain('500');
  });

  test('clicar em Jogar abre HUD, loja e liga o cenário de jogo (sem painel DOM de esquadrão)', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('play'));
    expect(screen.getByTestId('hud')).toBeInTheDocument();
    expect(screen.getByTestId('shop')).toBeInTheDocument();
    // o esquadrão vive no tabuleiro 3D — não há mais bloco de cartões em DOM
    expect(screen.queryByTestId('squad')).toBeNull();
    expect(screen.getByTestId('scene-game')).toBeInTheDocument();
    expect(screen.getByTestId('coins').textContent).toContain('500');
    expect(screen.getByTestId('start-battle')).toBeInTheDocument();
  });

  test('enciclopédia abre pelo menu e fecha pelo botão próprio', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('open-bestiary'));
    expect(screen.getByTestId('bestiary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-bestiary'));
    expect(screen.queryByTestId('bestiary')).toBeNull();
  });

  test('a enciclopédia aparece também dentro da partida (e pelas configurações)', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('play'));
    // o livro flutuante mora no menu E na partida — como sempre morou
    expect(screen.getByTestId('open-bestiary')).toBeInTheDocument();
    // entrada alternativa: configurações → regras (testid próprio, sem duplicar)
    fireEvent.click(screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByTestId('settings-tab-regras'));
    fireEvent.click(screen.getByTestId('open-bestiary-settings'));
    expect(screen.queryByTestId('settings-menu')).toBeNull(); // cede o palco ao bestiário
    expect(screen.getByTestId('bestiary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('close-bestiary'));
    expect(screen.queryByTestId('bestiary')).toBeNull();
  });

  test('a barra do jogo não repete rótulos: só saldo, cronômetro e botões', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('play'));
    expect(screen.getByTestId('coins')).toBeInTheDocument();
    expect(screen.queryByTestId('prep-status')).toBeNull();
    expect(screen.queryByTestId('enemy-count')).toBeNull();
    expect(screen.getByTestId('hud').textContent).not.toContain('Elemental');
    expect(screen.getByTestId('hud').textContent).not.toContain('Inimigo');
    // "Menu" virou "Início" (o testid continua quit — contrato das sondas);
    // a casinha em SVG não gera texto, mas o espaço JSX antes do rótulo gera
    expect(screen.getByTestId('quit').textContent?.trim()).toBe('Início');
  });

  test('menu de configurações: grupos na sidebar, conteúdo à direita', () => {
    render(<App />);
    // a tela inicial não expõe mais as configs diretamente (nada de radio ali)
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();

    // grupos na sidebar
    expect(screen.getByTestId('settings-tab-match')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-graphics')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-progress')).toBeInTheDocument();
    // "Economia" deixou de ser aba própria — virou seção dentro de Progresso
    expect(screen.queryByTestId('settings-tab-economy')).toBeNull();
    expect(screen.getByTestId('settings-tab-match').textContent).toContain('Dificuldade');

    // progresso: moedas iniciais (herança da economia) + recompensa configurável
    fireEvent.click(screen.getByTestId('settings-tab-progress'));
    expect(screen.getByText(/Moedas iniciais/i)).toBeInTheDocument();
    expect(screen.getByTestId('reward-mode-fixed')).toBeInTheDocument();
    expect(screen.getByTestId('reward-mode-bounty')).toBeInTheDocument();

    // partida: dificuldade muda o store e a engine da partida em andamento
    fireEvent.click(screen.getByTestId('settings-tab-match'));
    fireEvent.click(screen.getByTestId('diff-hard'));
    expect(useGameStore.getState().difficulty).toBe('hard');

    // em jogo: a engrenagem do HUD abre o mesmo menu e reflete na engine ativa
    fireEvent.click(screen.getByTestId('close-settings'));
    fireEvent.click(screen.getByTestId('play'));
    fireEvent.click(screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByTestId('diff-easy'));
    expect(getEngine()!.world.difficulty).toBe('easy');
    fireEvent.click(screen.getByTestId('close-settings'));
    expect(screen.queryByTestId('settings-menu')).toBeNull();

    useGameStore.getState().setDifficulty('normal');
  });

  test('recompensa configurável: fixo até 400, caça-recompensa, default 100', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByTestId('settings-tab-progress'));

    // default: modo fixo com 100 — a regra clássica (+100 vitória, +50 derrota)
    expect(useGameStore.getState().rewardModeCfg).toBe('fixed');
    expect(useGameStore.getState().matchRewardCfg).toBe(100);
    expect(screen.getByTestId('reward-value').textContent).toBe('100');

    // stepper sobe de 50 em 50 e para no teto de 400
    fireEvent.click(screen.getByTestId('reward-inc'));
    expect(useGameStore.getState().matchRewardCfg).toBe(150);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('reward-inc'));
    expect(useGameStore.getState().matchRewardCfg).toBe(400);
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByTestId('reward-dec'));
    expect(useGameStore.getState().matchRewardCfg).toBe(50);

    // caça-recompensa: esconde o stepper de valor (a recompensa vem dos abates)
    fireEvent.click(screen.getByTestId('reward-mode-bounty'));
    expect(useGameStore.getState().rewardModeCfg).toBe('bounty');
    expect(screen.queryByTestId('reward-value')).toBeNull();

    // volta ao default para não contaminar os próximos testes
    fireEvent.click(screen.getByTestId('reward-mode-fixed'));
    useGameStore.getState().setMatchReward(100);
  });

  test('sem cronômetro: botão exige criaturas, inimigo nasce no início do combate', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('play'));

    const startBtn = screen.getByTestId('start-battle') as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true); // ainda sem criaturas na arena
    fireEvent.click(startBtn);
    expect(useGameStore.getState().phase).toBe('preparation');

    fireEvent.click(screen.getByTestId('shop-ignis'));
    expect((screen.getByTestId('start-battle') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('start-battle'));
    // o driver sincroniza em rAF; no teste sincronizamos manualmente
    act(() => useGameStore.getState().syncUi());

    expect(screen.queryByTestId('start-battle')).toBeNull();
    expect(screen.getByTestId('timer-battle')).toBeInTheDocument();
    // o exército inimigo nasce no início do combate (antes da barra mostrar
    // qualquer coisa — a frase "Inimigo: N criaturas" saiu da tela)
    expect(useGameStore.getState().units.some((u) => u.side === 'ai')).toBe(true);
  });
});
