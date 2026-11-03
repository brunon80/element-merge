import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import {
  CAMERA_POS,
  CAMERA_MAX_DISTANCE,
  ICE_CAMERA_MAX_DISTANCE,
  ORBIT_TARGET,
  SCENIC_CAMERA_MAX_DISTANCE,
  UNDERWATER_CAMERA_MAX_DISTANCE,
  VOLCANIC_CAMERA_MAX_DISTANCE,
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
  const icy = sceneVariant === 'ice';
  const volcanic = sceneVariant === 'volcanic';
  const underwater = sceneVariant === 'underwater';
  const { camera } = useThree();
  const dragActive = useGameStore(
    (s) => s.dragId !== null || s.pendingDrag !== null,
  );

  useEffect(() => {
    if (icy || volcanic || underwater) {
      const distance = icy
        ? ICE_CAMERA_MAX_DISTANCE
        : volcanic
          ? VOLCANIC_CAMERA_MAX_DISTANCE
          : UNDERWATER_CAMERA_MAX_DISTANCE;
      camera.position.set(
        0,
        ORBIT_TARGET[1] + distance * (volcanic ? 0.4 : 0.46),
        ORBIT_TARGET[2] + distance * (volcanic ? 0.92 : 0.89),
      );
    } else {
      camera.position.set(...CAMERA_POS);
    }
    camera.lookAt(...ORBIT_TARGET);
  }, [camera, icy, volcanic, underwater]);

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
        forest
          ? SCENIC_CAMERA_MAX_DISTANCE
          : icy
            ? ICE_CAMERA_MAX_DISTANCE
            : volcanic
              ? VOLCANIC_CAMERA_MAX_DISTANCE
              : underwater
                ? UNDERWATER_CAMERA_MAX_DISTANCE
            : CAMERA_MAX_DISTANCE
      } // dá para ler a ilha inteira de uma vez
      minPolarAngle={0.35}
      maxPolarAngle={1.32}
    />
  );
}
