import { OrbitControls } from '@react-three/drei';
import {
  CAMERA_MAX_DISTANCE,
  FOREST_CAMERA_MAX_DISTANCE,
  ORBIT_TARGET,
} from '../game/board';
import { useGameStore } from '../store/gameStore';
import type { ArenaScene } from '../game/types';

/**
 * Câmera de batalha com órbita LIVRE em 360° ao redor da arena (dá para ver a
 * batalha de qualquer lado, inclusive de frente para as criaturas), sem pan,
 * rotação desabilitada enquanto o jogador arrasta uma criatura. A inclinação
 * continua limitada: acima demais vira vista aérea sem leitura, abaixo da
 * horizontal o ponteiro entraria debaixo da ilha flutuante.
 */
export function CameraController({
  menuMode,
  sceneVariant,
}: {
  menuMode: boolean;
  sceneVariant: ArenaScene;
}) {
  const forest = sceneVariant === 'forest';
  const dragActive = useGameStore(
    (s) => s.dragId !== null || s.pendingDrag !== null,
  );
  return (
    <OrbitControls
      makeDefault
      target={ORBIT_TARGET}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      enableRotate={!dragActive}
      autoRotate={menuMode}
      autoRotateSpeed={0.55}
      minDistance={3} // zoom colado p/ inspecionar o figurino (o clamp antigo
      // em 10 deixava a estaca e os cacos de gelo minúsculos na tela)
      maxDistance={
        forest ? FOREST_CAMERA_MAX_DISTANCE : CAMERA_MAX_DISTANCE
      } // dá para ler a ilha inteira de uma vez
      minPolarAngle={0.35}
      maxPolarAngle={1.32}
    />
  );
}
