import { defaultSave, loadSave, persistSave, SAVE_KEY } from '../persistence/saveGame';

describe('Preferência de cenário', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('mantém o cenário atual como padrão em saves novos e antigos', () => {
    expect(defaultSave().settings.scenario).toBe('arcane');
    expect(defaultSave().lastArenaScene).toBeNull();

    const oldSave = defaultSave();
    const { scenario: _scenario, ...legacySettings } = oldSave.settings;
    const { lastArenaScene: _lastArenaScene, ...legacySave } = oldSave;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...legacySave, settings: legacySettings }),
    );
    expect(loadSave().settings.scenario).toBe('arcane');
    expect(loadSave().lastArenaScene).toBeNull();
  });

  test.each(['forest', 'random'] as const)('persiste a escolha %s', (scenario) => {
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
    expect(loadSave().settings.scenario).toBe('arcane');
  });

  test('mantém o último cenário de partida para evitar repetição no modo aleatório', () => {
    const save = defaultSave();
    save.lastArenaScene = 'forest';
    persistSave(save);
    expect(loadSave().lastArenaScene).toBe('forest');
  });
});
