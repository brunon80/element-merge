import { View } from '@react-three/drei/web';
import { Canvas } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { ClearBuffer } from './BestiaryStage';
import { hasWebGL2 } from './webgl';

/**
 * Palco 3D da prévia de fusões (o painel que persegue o ponteiro durante o
 * arraste): UM único contexto WebGL para todas as miniaturas — mesma regra do
 * palco da enciclopédia (o teto de contextos do iOS mataria o canvas da
 * batalha se cada miniatura montasse o seu `<Canvas>`).
 *
 * Vive só enquanto um arraste está armado (o contexto nasce na promoção do
 * gesto e morre no soltar — nunca chega a haver um terceiro contexto junto:
 * a enciclopédia não abre no meio de um arraste). As miniaturas (`MergeThumb`)
 * abrem janelas scissor aqui dentro; a câmera é UMA só e cada modelo se
 * enquadra sozinho na origem (o drei só troca o aspect por View).
 */
export function MergeStage() {
  const dragging = useGameStore((s) => s.dragId !== null);
  const eco = useGameStore((s) => s.ecoActive);
  const can3d = hasWebGL2();

  if (!dragging || !can3d) return null;
  return (
    <Canvas
      className="merge-stage"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      dpr={[1, eco ? 1 : 1.5]}
      camera={{ position: [0, 1.1, 4.6], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0); // transparente: o DOM aparece por baixo
        camera.lookAt(0, 0, 0);
      }}
    >
      <ClearBuffer />
      <View.Port />
    </Canvas>
  );
}
