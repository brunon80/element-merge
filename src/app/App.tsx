import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { unlockAudio } from '../audio/core';
import { Bestiary } from '../components/Bestiary';
import { BattleControls } from '../components/BattleControls';
import { CodexFab } from '../components/CodexFab';
import { DiscoveryOverlay } from '../components/DiscoveryOverlay';
import { HUD } from '../components/HUD';
import { InspectorPanel } from '../components/InspectorPanel';
import { MenuScreen } from '../components/MenuScreen';
import { ResultScreen } from '../components/ResultScreen';
import { SettingsMenu } from '../components/SettingsMenu';
import { ShopPanel } from '../components/ShopPanel';
import { ToastLayer } from '../components/ToastLayer';
import { TurboFab } from '../components/TurboFab';
import { useGameDriver } from '../hooks/useGameDriver';
import { useMusicTrack } from '../hooks/useMusicTrack';
import { CAMERA_POS } from '../game/board';
import { AdaptiveFog } from '../scene/AdaptiveFog';
import { EcoHeartbeat } from '../scene/EcoHeartbeat';
import { BestiaryStage } from '../scene/BestiaryStage';
import { ARENA_BG, BloomGate } from '../scene/BloomGate';
import { FOREST_BG } from '../scene/ForestEnvironment';
import { ICE_BG } from '../scene/IceEnvironment';
import { VOLCANIC_BG } from '../scene/VolcanicEnvironment';
import { UNDERWATER_BG } from '../scene/UnderwaterEnvironment';
import { UNIVERSE_END_BG } from '../scene/UniverseEndEnvironment';
import { BattleScene } from '../scene/BattleScene';
import { useGameStore } from '../store/gameStore';
import { GLBoundary } from './GLBoundary';

export function App() {
  useGameDriver();
  useMusicTrack();
  // política de autoplay: o AudioContext nasce suspenso e só acende no
  // primeiro clique/tecla (qualquer botão do menu já resolve isso)
  useEffect(() => unlockAudio(), []);
  const screen = useGameStore((s) => s.screen);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const matchKey = useGameStore((s) => s.matchId);
  const activeArenaScene = useGameStore((s) => s.activeArenaScene);
  const ecoActive = useGameStore((s) => s.ecoActive);
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), []);
  const sceneBackground =
    activeArenaScene === 'forest'
      ? FOREST_BG
      : activeArenaScene === 'ice'
        ? ICE_BG
        : activeArenaScene === 'volcanic'
          ? VOLCANIC_BG
          : activeArenaScene === 'underwater'
            ? UNDERWATER_BG
            : activeArenaScene === 'universe-end'
              ? UNIVERSE_END_BG
        : ARENA_BG;

  const inGame = screen === 'game';

  return (
    <div className="app-shell" data-screen={screen} data-eco={ecoActive ? 'on' : 'off'}>
      <GLBoundary>
        <Canvas
          shadows
          dpr={ecoActive ? [1, 1.25] : [1, 2]}
          frameloop={ecoActive ? 'demand' : 'always'}
          camera={{ position: CAMERA_POS, fov: 42 }}
          onPointerMissed={() => selectUnit(null)}
        >
          {/* fog adaptivo (ver scene/AdaptiveFog.tsx): começa sempre logo após
              a última linha do tabuleiro — QUALQUER fase/janela/zoom mantém a
              linha inimiga limpa — e tem comprimento por cenário; o antigo fog
              fixo engolia a vegetação do anel no enquadre do celular */}
          {activeArenaScene !== 'universe-end' && (
            <AdaptiveFog color={sceneBackground} variant={activeArenaScene} />
          )}
          {/* 🔋 no econômico o canvas é "demand": este batimento acorda a cena
              a 30 Hz (metade do frame de antes) sem o rAF de 60 fps */}
          {ecoActive && <EcoHeartbeat hz={30} />}
          <BattleScene
            key={matchKey ?? `menu-${seed}`}
            menuMode={!inGame}
            sceneVariant={activeArenaScene}
          />
          {/* Bloom global, com intensidade controlada nas configurações. O fundo
              da cena passa ao clearColor do RenderPass (ver BloomGate). */}
          <BloomGate
            backgroundColor={sceneBackground}
          />
        </Canvas>
      </GLBoundary>

      {inGame && (
        <>
          <HUD />
          <CodexFab />
          <TurboFab />
          <InspectorPanel />
          <div className="dock">
            <ShopPanel />
            <BattleControls />
          </div>
        </>
      )}

      {!inGame && <MenuScreen />}
      <ResultScreen />
      {/* palco WebGL da enciclopédia: UM contexto para todos os cards (o iOS
          perderia o canvas da batalha se cada card montasse o seu) */}
      <BestiaryStage />
      <Bestiary />
      <DiscoveryOverlay />
      <SettingsMenu />
      <ToastLayer />
    </div>
  );
}
