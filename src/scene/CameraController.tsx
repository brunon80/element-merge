import { OrbitControls } from '@react-three/drei';
import { useGameStore } from '../store/gameStore';

/**
 * Câmera de batalha com órbita LIVRE em 360° ao redor da arena (dá para ver a
 * batalha de qualquer lado, inclusive de frente para as criaturas), sem pan,
 * rotação desabilitada enquanto o jogador arrasta uma criatura. A inclinação
 * continua limitada: acima demais vira vista aérea sem leitura, abaixo da
 * horizontal o ponteiro entraria debaixo da ilha flutuante.
 */
export function CameraController({ menuMode }: { menuMode: boolean }) {
  const dragActive = useGameStore(
    (s) => s.dragId !== null || s.pendingDrag !== null,
  );
  return (
    <OrbitControls
      makeDefault
      target={[0, 1.15, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      enableRotate={!dragActive}
      autoRotate={menuMode}
      autoRotateSpeed={0.55}
      minDistance={10}
      maxDistance={34}
      minPolarAngle={0.35}
      maxPolarAngle={1.32}
    />
  );
}
