import { defaultSave, loadSave, persistSave, SAVE_KEY } from '../persistence/saveGame';

describe('Preferência de cenário', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('usa o modo aleatório como padrão em saves novos e antigos', () => {
    expect(defaultSave().settings.scenario).toBe('random');
    expect(defaultSave().lastArenaScene).toBeNull();

    const oldSave = defaultSave();
    const { scenario: _scenario, ...legacySettings } = oldSave.settings;
    const { lastArenaScene: _lastArenaScene, ...legacySave } = oldSave;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...legacySave, settings: legacySettings }),
    );
    expect(loadSave().settings.scenario).toBe('random');
    expect(loadSave().lastArenaScene).toBeNull();
  });

  test.each([
    'arcane',
    'forest',
    'ice',
    'volcanic',
    'underwater',
    'universe-end',
    'random',
  ] as const)('persiste a escolha %s', (scenario) => {
    const save = defaultSave();
    save.settings.scenario = scenario;
    persistSave(save);
    expect(loadSave().settings.scenario).toBe(scenario);
  });

  test('corrige escolhas de cenário inválidas para o padrão', () => {
    const save = defaultSave();
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...save,
        settings: { ...save.settings, scenario: 'unknown' },
      }),
    );
    expect(loadSave().settings.scenario).toBe('random');
  });

  test('mantém o último cenário de partida para evitar repetição no modo aleatório', () => {
    const save = defaultSave();
    save.lastArenaScene = 'universe-end';
    persistSave(save);
    expect(loadSave().lastArenaScene).toBe('universe-end');
  });
});
