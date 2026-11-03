import { beforeEach, describe, expect, test } from 'vitest';
import { loadSave } from '../persistence/saveGame';
import { useGameStore } from '../store/gameStore';

describe('Preferência de bloom', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().initFromSave();
  });

  test('persiste a intensidade e aceita desligar ou limitar o valor', () => {
    const store = useGameStore.getState();
    expect(store.bloomIntensity).toBe(20);

    store.setBloomIntensity(75);
    expect(loadSave().settings.bloomIntensity).toBe(75);

    useGameStore.getState().setBloomIntensity(0);
    expect(loadSave().settings.bloomIntensity).toBe(0);

    useGameStore.getState().setBloomIntensity(150);
    expect(loadSave().settings.bloomIntensity).toBe(100);
  });

  test('persiste separadamente o bloom do cenário', () => {
    expect(useGameStore.getState().sceneryBloomIntensity).toBe(30);

    useGameStore.getState().setSceneryBloomIntensity(65);
    expect(loadSave().settings.sceneryBloomIntensity).toBe(65);

    useGameStore.getState().setSceneryBloomIntensity(125);
    expect(loadSave().settings.sceneryBloomIntensity).toBe(100);
  });
});
