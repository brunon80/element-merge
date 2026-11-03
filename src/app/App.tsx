import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { unlockAudio } from '../audio/core';
import { Bestiary } from '../components/Bestiary';
import { BattleControls } from '../components/BattleControls';
import { DiscoveryOverlay } from '../components/DiscoveryOverlay';
import { HUD } from '../components/HUD';
import { InspectorPanel } from '../components/InspectorPanel';
import { MenuScreen } from '../components/MenuScreen';
import { ResultScreen } from '../components/ResultScreen';
import { SettingsMenu } from '../components/SettingsMenu';
import { ShopPanel } from '../components/ShopPanel';
import { ToastLayer } from '../components/ToastLayer';
import { useGameDriver } from '../hooks/useGameDriver';
import { useMusicTrack } from '../hooks/useMusicTrack';
import { ARENA_R, CAMERA_POS } from '../game/board';
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
  const scenic = activeArenaScene !== 'arcane';

  const inGame = screen === 'game';

  return (
    <div className="app-shell" data-screen={screen}>
      <GLBoundary>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: CAMERA_POS, fov: 42 }}
          onPointerMissed={() => selectUnit(null)}
        >
          {/* o fog começa logo além da borda inimiga da ilha (o tabuleiro em si
              fica limpo) e engole o vazio — as duas distâncias saem de ARENA_R */}
          {activeArenaScene !== 'universe-end' && (
            <fog
              attach="fog"
              args={[
                sceneBackground,
                ARENA_R * (scenic ? 2 : 2.36),
                ARENA_R *
                  (activeArenaScene === 'ice'
                    ? 7.5
                    : activeArenaScene === 'volcanic'
                      ? 6.2
                      : activeArenaScene === 'underwater'
                        ? 5.4
                        : scenic
                          ? 5.5
                          : 6.26),
              ]}
            />
          )}
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
