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

import { App } from '../app/App';
import { getEngine, useGameStore } from '../store/gameStore';

beforeEach(() => {
  cleanup();
  const st = useGameStore.getState();
  st.returnToMenu();
  st.resetProgress();
  localStorage.clear();
  useGameStore.setState({ toast: null });
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

  test('menu de configurações: grupos na sidebar, conteúdo à direita', () => {
    render(<App />);
    // a tela inicial não expõe mais as configs diretamente (nada de radio ali)
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();

    // três grupos na sidebar
    expect(screen.getByTestId('settings-tab-match')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-economy')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-progress')).toBeInTheDocument();

    // economia: moedas iniciais configuráveis
    fireEvent.click(screen.getByTestId('settings-tab-economy'));
    expect(screen.getByText(/Moedas iniciais/i)).toBeInTheDocument();

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

  test('sem cronômetro: botão exige criaturas, inimigo nasce no início do combate', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('play'));
    expect(screen.getByTestId('prep-status')).toBeInTheDocument();

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
    expect(screen.getByTestId('enemy-count').textContent).toContain('criaturas');
    expect(useGameStore.getState().units.some((u) => u.side === 'ai')).toBe(true);
  });
});
