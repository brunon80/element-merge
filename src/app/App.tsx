import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
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
import { ARENA_R, CAMERA_POS } from '../game/board';
import { BestiaryStage } from '../scene/BestiaryStage';
import { BattleScene } from '../scene/BattleScene';
import { useGameStore } from '../store/gameStore';
import { GLBoundary } from './GLBoundary';

export function App() {
  useGameDriver();
  const screen = useGameStore((s) => s.screen);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const matchKey = useGameStore((s) => s.matchId);
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), []);

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
          <color attach="background" args={['#0b1020']} />
          {/* o fog começa logo além da borda inimiga da ilha (o tabuleiro em si
              fica limpo) e engole o vazio — as duas distâncias saem de ARENA_R */}
          <fog attach="fog" args={['#0b1020', ARENA_R * 2.36, ARENA_R * 6.26]} />
          <BattleScene key={matchKey ?? `menu-${seed}`} menuMode={!inGame} />
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
