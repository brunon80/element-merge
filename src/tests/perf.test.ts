// 🔋 Modo econômico (novidade 05/nov/2026 — drenagem de bateria no celular).
// jsdom não roda WebGL/câmera, então a densidade do render não é mensurável
// aqui: este arquivo cobre a LÓGICA de detecção (pura) e pinos estáticos da
// fiação em cada peça do pipeline. O efeito VIVO é conferido nas sondas.
import AppSource from '../app/App.tsx?raw';
import BattleSceneSource from '../scene/BattleScene.tsx?raw';
import BloomGateSource from '../scene/BloomGate.tsx?raw';
import CameraSource from '../scene/CameraController.tsx?raw';
import DriverSource from '../hooks/useGameDriver.ts?raw';
import EcoHeartbeatSource from '../scene/EcoHeartbeat.tsx?raw';
import ForestSource from '../scene/ForestEnvironment.tsx?raw';
import IceSource from '../scene/IceEnvironment.tsx?raw';
import LightingSource from '../scene/Lighting.tsx?raw';
import SettingsSource from '../components/SettingsMenu.tsx?raw';
import StoreSource from '../store/gameStore.ts?raw';
import UnderwaterSource from '../scene/UnderwaterEnvironment.tsx?raw';
import VolcanicSource from '../scene/VolcanicEnvironment.tsx?raw';
import SwSource from '../../public/sw.js?raw';
import SaveSource from '../persistence/saveGame.ts?raw';
import { ecoFor, isBatteryHandheld, PERF_MODE_CHOICES } from '../game/perf';

describe('detecção do aparelho (função pura, sem navegador)', () => {
  test('o modo completo existe: automático / cheio / econômico', () => {
    expect(PERF_MODE_CHOICES).toEqual(['auto', 'full', 'eco']);
  });

  test('iPhone e Android entregam na UA', () => {
    expect(
      isBatteryHandheld('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', 5, true),
    ).toBe(true);
    expect(
      isBatteryHandheld('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120', 5, true),
    ).toBe(true);
  });

  test('iPadOS moderno se passa por Mac, mas não esconde o toque', () => {
    expect(
      isBatteryHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 10, true),
    ).toBe(true);
  });

  test('desktop com mouse (ou tela de toque de UM ponto) não é bateria', () => {
    expect(isBatteryHandheld('Mozilla/5.0 (X11; Linux x86_64) Chrome/120', 0, false)).toBe(false);
    expect(isBatteryHandheld('Mozilla/5.0 (Windows NT 10.0)', 1, true)).toBe(false);
    expect(isBatteryHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, false)).toBe(false);
  });

  test('cheio/econômico ignoram o aparelho; automático segue o aparelho', () => {
    expect(ecoFor('eco', false)).toBe(true); // econômico também serve no desktop
    expect(ecoFor('full', true)).toBe(false); // cheio força até no iPhone
    expect(ecoFor('auto', true)).toBe(true);
    expect(ecoFor('auto', false)).toBe(false);
  });

  test('a escolha do usuário persiste e vira ecoActive no store', () => {
    expect(SaveSource).toContain("perfMode: 'auto',");
    expect(StoreSource).toContain('setPerfMode: (mode: PerfModeChoice) => void;');
    expect(StoreSource).toContain('ecoActive: ecoFor(value, ECO_HANDHELD)');
    expect(SettingsSource).toContain('data-testid={`perf-mode-${mode}`}');
  });
});

describe('App: a economia entra pelo Canvas', () => {
  test('dpr, frameloop e batimento de 30 Hz; o DOM declara o eco', () => {
    expect(AppSource).toContain('dpr={ecoActive ? [1, 1.25] : [1, 2]}');
    expect(AppSource).toContain("frameloop={ecoActive ? 'demand' : 'always'}");
    expect(AppSource).toContain('<EcoHeartbeat hz={30} />');
    expect(AppSource).toContain("data-eco={ecoActive ? 'on' : 'off'}");
    expect(EcoHeartbeatSource).toContain('window.setInterval(() => invalidate(), 1000 / hz)');
    // o showcase auto-rotate do menu derruba o teto de 30 Hz em demand (cada
    // giro dispara 'change' → invalidate); no eco ele dorme, no cheio continua
    expect(CameraSource).toContain('autoRotate={menuMode && !ecoActive}');
  });

  test('o loop de simulação do motor também cai para 30 Hz no eco', () => {
    expect(DriverSource).toContain('window.setInterval(() => step(performance.now()), 1000 / 30)');
    expect(DriverSource).toContain('requestAnimationFrame(loop)');
  });

  test('bloom: o compositor inteiro sai do caminho no eco', () => {
    expect(BloomGateSource).toContain(
      'const useComposer = !QA_NO_COMPOSER && !ecoActive && (bloomIntensity > 0 || sceneryBloomIntensity > 0);',
    );
  });
});

describe('sombras: orçamento e cache', () => {
  test('em menu econômico a shadow map é cacheada; no jogo volta o ciclo', () => {
    expect(BattleSceneSource).toContain('gl.shadowMap.autoUpdate = !(ecoActive && menuMode);');
    expect(BattleSceneSource).toContain('gl.shadowMap.needsUpdate = true;');
  });

  test('no eco a shadow map é 1024² e a Lighting renasce ao trocar de modo', () => {
    expect(LightingSource).toContain('shadow-mapSize-width={eco ? 1024 : 2048}');
    expect(BattleSceneSource).toContain("key={ecoActive ? 'lighting-eco' : 'lighting-full'}");
  });

  // A caixa de sombra cobre a ilha (ARENA_R×1,15 ≈ 26,6 de raio). Qualquer
  // vegetação do anel está FORA dela: castShadow ali só desenhava instância no
  // passe de profundidade sem nunca sombrear nada visível.
  const openingTag = (src: string, refName: string): string => {
    const at = src.indexOf(`ref={${refName}}`);
    if (at === -1) throw new Error(`ref {${refName}} sumiu do fonte`);
    const start = src.lastIndexOf('<instancedMesh', at);
    const end = src.indexOf('>', start);
    return src.slice(start, end + 1);
  };

  test('floresta: a muralha inteira (troncos/copas/raízes/galhos/distante) não projeta sombra; rochas sim', () => {
    for (const ref of ['trunkRef', 'crownRef', 'rootRef', 'branchRef', 'distantTrunkRef', 'distantCrownRef']) {
      expect(openingTag(ForestSource, ref)).not.toContain('castShadow');
    }
    expect(openingTag(ForestSource, 'rockRef')).toContain('castShadow');
  });

  test('gelo: anel de árvores e cumes do horizonte fora da caixa; rochas/agulhas do entorno dentro', () => {
    for (const ref of ['trunkRef', 'foliageRef', 'snowCapRef', 'ridgeRef']) {
      expect(openingTag(IceSource, ref)).not.toContain('castShadow');
    }
    expect(openingTag(IceSource, 'rockRef')).toContain('castShadow');
    expect(openingTag(IceSource, 'spireRef')).toContain('castShadow');
  });

  test('vulcão: árvores do entorno e montanhas do horizonte fora; rochas/agulhas perto da ilha dentro', () => {
    for (const ref of ['trunkRef', 'branchRef', 'mountainRef']) {
      expect(openingTag(VolcanicSource, ref)).not.toContain('castShadow');
    }
    expect(openingTag(VolcanicSource, 'rockRef')).toContain('castShadow');
    expect(openingTag(VolcanicSource, 'spireRef')).toContain('castShadow');
  });

  test('subaquático: recifes do horizonte e monumentos do fundo fora; rochas/coral/algas do entorno dentro', () => {
    for (const ref of ['monumentsRef', 'monumentCapsRef', 'distantReefsRef']) {
      expect(openingTag(UnderwaterSource, ref)).not.toContain('castShadow');
    }
    for (const ref of ['rocksRef', 'coralBranchesRef', 'coralHeadsRef', 'seaweedRef']) {
      expect(openingTag(UnderwaterSource, ref)).toContain('castShadow');
    }
  });
});

describe('desbaste econômico da vegetação de preenchimento (desktop intacto)', () => {
  test('floresta: mata 96→63 e arbustos 110→73 só no eco; anel distante e rochas preservados', () => {
    expect(ForestSource).toContain('function createForestLayout(ecoActive: boolean)');
    expect(ForestSource).toContain('const treeCount = thin(96);');
    expect(ForestSource).toContain('for (let i = 0; i < thin(110); i++)');
    expect(ForestSource).not.toContain('thin(36)'); // a muralha distante fica intacta
    expect(ForestSource).not.toContain('thin(58)'); // o campo de rochas fica intacto
  });

  test('gelo: anel 32→21 (ângulo acompanha a contagem) e rochas 82→54', () => {
    expect(IceSource).toContain('const treeRing = thin(32);');
    expect(IceSource).toContain('(i / treeRing) * Math.PI * 2');
    expect(IceSource).toContain('for (let i = 0; i < thin(82); i++)');
  });

  test('vulcão: campo de rochas 140→92; montanhas e agulhas do horizonte intactos', () => {
    expect(VolcanicSource).toContain('for (let i = 0; i < thin(140); i++)');
    expect(VolcanicSource).not.toContain('thin(22)');
    expect(VolcanicSource).not.toContain('thin(38)');
  });

  test('subaquático: rochas 128→84, corais 42→28, algas 58→38; recifes do horizonte intactos', () => {
    expect(UnderwaterSource).toContain('for (let i = 0; i < thin(128); i++)');
    expect(UnderwaterSource).toContain('cluster < thin(42)');
    expect(UnderwaterSource).toContain('cluster < thin(58)');
    expect(UnderwaterSource).not.toContain('thin(22)');
  });

  test('os quatro ambientes leem ecoActive do store e regeneram o layout ao mudar o modo', () => {
    for (const src of [ForestSource, IceSource, VolcanicSource, UnderwaterSource]) {
      expect(src).toContain('useGameStore((s) => s.ecoActive)');
      expect(src).toContain('const thin =');
    }
  });
});

describe('deploy: o cache do SW é isolado por local de instalação', () => {
  test('main (./) e preview de branch (ex.: /dev/) têm caches com nomes diferentes', () => {
    expect(SwSource).toContain('const SITE_DIR =');
    expect(SwSource).toContain('new URL(\'./\', self.location)');
    expect(SwSource).toContain('ebma-${SITE_DIR}-v4');
  });
});
