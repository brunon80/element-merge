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
          camera={{ position: [0, 14.2, 19.5], fov: 42 }}
          onPointerMissed={() => selectUnit(null)}
        >
          <color attach="background" args={['#0b1020']} />
          <fog attach="fog" args={['#0b1020', 30, 80]} />
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
