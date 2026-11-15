import { beforeEach, describe, expect, test } from 'vitest';
import BloomGateSource from '../scene/BloomGate.tsx?raw';
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

  test('persiste o volume do som e aceita desligar ou limitar o valor', () => {
    expect(useGameStore.getState().sfxVolume).toBe(80);

    useGameStore.getState().setSfxVolume(0);
    expect(loadSave().settings.sfxVolume).toBe(0);

    useGameStore.getState().setSfxVolume(45);
    expect(loadSave().settings.sfxVolume).toBe(45);

    useGameStore.getState().setSfxVolume(150);
    expect(loadSave().settings.sfxVolume).toBe(100);
  });

  test('persiste o volume da trilha e aceita desligar ou limitar o valor', () => {
    expect(useGameStore.getState().musicVolume).toBe(60);

    useGameStore.getState().setMusicVolume(0);
    expect(loadSave().settings.musicVolume).toBe(0);

    useGameStore.getState().setMusicVolume(35);
    expect(loadSave().settings.musicVolume).toBe(35);

    useGameStore.getState().setMusicVolume(160);
    expect(loadSave().settings.musicVolume).toBe(100);
  });
});

// ─── O gate do bloom e o shader dos rigs de malha 3D (armadilha paga em 15/nov)
// O BloomGate patcheia os materiais EMBUTIDOS da arena para devolver a eles a
// codificação ACES+sRGB que o three pula ao desenhar num render target. Ele
// ANTIGAMENTE TROCAVA o onBeforeCompile do material pela função dele e fixava
// customProgramCacheKey = 'qtBloomEncode' — e o patch do three só roda no MISS
// do cache de programas. Resultado: os rigs de malha importada (Ignis, Zéfiro,
// Golém, Nereia: o corpo inteiro mora no onBeforeCompile do MATERIAL) ficavam
// MUDOS na arena e VIVOS no palco do bestiário (que não tem bloom) — o
// "no bestiário aparece certo, mas na batalha não" do usuário. Pior: o unpatch
// APAGAVA o patch do rig (delete p.onBeforeCompile), então ligar/desligar o
// bloom matava o monstro em definitivo. jsdom não tem WebGL: o contrato fica
// pinado no fonte; o efeito vivo é atestado nas sondas (qa/probe-front, qa/probe-tone).
describe('BloomGate: compõe o shader do rig, nunca amassa', () => {
  test('o gate guarda o patch anterior, roda ele primeiro e o devolve no unpatch', () => {
    expect(BloomGateSource).toContain("const PREV_KEY = 'qtBloomPrev';");
    expect(BloomGateSource).toContain('p.userData[PREV_KEY] = borrowed;');
    expect(BloomGateSource).toContain('if (prev) prev(shader, renderer);');
    expect(BloomGateSource).toContain('if (prev?.onBeforeCompile) p.onBeforeCompile = prev.onBeforeCompile;');
  });

  test('a chave de cache do programa é COMPOSTA (rigs diferentes não colam no mesmo shader)', () => {
    expect(BloomGateSource).toContain("(prevKey ? prevKey() : prev ? prev.toString() : '') + '|qtBloomEncode'");
  });
});
