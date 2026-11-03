import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MathUtils, type PerspectiveCamera } from 'three';
import {
  CAMERA_POS,
  CAMERA_MAX_DISTANCE,
  ICE_CAMERA_MAX_DISTANCE,
  ORBIT_TARGET,
  PLATFORM,
  SCENIC_CAMERA_MAX_DISTANCE,
  UNDERWATER_CAMERA_MAX_DISTANCE,
  VOLCANIC_CAMERA_MAX_DISTANCE,
} from '../game/board';
import { useGameStore } from '../store/gameStore';
import type { ArenaScene } from '../game/types';

/** fov base do Canvas (src/app/App.tsx) — casado com a calibração da sonda */
const BASE_FOV = 42;

/**
 * Largura de chão que a câmera precisa alcançar: a plataforma inteira
 * (2×halfX) encosta nas bordas da tela — o enquadramento de celular em
 * retrato que mostra a quadra grande, não uma miniatura no meio do vazio.
 */
const GROUND_SPAN = PLATFORM.halfX * 2;

/**
 * Quanto mais estreita a tela, menos largura horizontal o MESMO ângulo
 * enxerga. Em vez de empurrar a câmera para trás (que encolhe tudo), abrimos
 * o ângulo na medida justa da plataforma. Acima do aspecto do desktop (16:9)
 * o fov fica exatamente nos 42° calibrados — a sonda de alcançabilidade não
 * vê nada mudar — e o teto de 80° segura o olho de peixe em telas finas.
 */
function fovFor(aspect: number, distance: number): number {
  const a = Math.min(1.78, Math.max(0.35, aspect));
  const want = 2 * Math.atan(GROUND_SPAN / (2 * distance * a));
  return Math.min(80, Math.max(BASE_FOV, MathUtils.radToDeg(want)));
}

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
  const { camera, size } = useThree();
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

    // fov na largura da plataforma para a distância inicial DO CENÁRIO (cada
    // um tem a sua) — resize/giro de celular re-enquadra na hora
    const cam = camera as PerspectiveCamera;
    const d0 = Math.hypot(
      camera.position.x - ORBIT_TARGET[0],
      camera.position.y - ORBIT_TARGET[1],
      camera.position.z - ORBIT_TARGET[2],
    );
    cam.fov = fovFor(size.width / Math.max(1, size.height), d0);
    cam.updateProjectionMatrix();
  }, [camera, icy, volcanic, underwater, size]);

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
