import { View } from '@react-three/drei/web';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import { hasWebGL2 } from './webgl';

/**
 * Palco 3D da enciclopédia: **um único contexto WebGL para todos os cards**.
 *
 * Por que não um `<Canvas>` por card (como era antes): o WebKit (o motor do iOS
 * Safari) tem teto de contextos WebGL vivos e, quando estoura, PERDE O MAIS
 * ANTIGO — que é justamente o canvas da batalha. Abrir a enciclopédia e rolar a
 * grade de 28 cards derrubava a cena 3D inteira no iPhone (parecia que "os
 * shaders sumiam"). Devolver o contexto com `forceContextLoss` no desmonte não
 * bastou: a contagem interna do Safari só cai no GC, e o GC nunca chega a tempo
 * de salvar o canvas da batalha. A solução definitiva é não criar contexto
 * nenhum por card: o drei `View` desenha cada card numa JANELA (scissor +
 * viewport) do canvas único deste palco, na posição exata da caixa do card.
 *
 * Detalhe que o drei não faz sozinho: o container do `View` só liga o scissor e
 * renderiza — ele NUNCA limpa a própria região. Como um contexto só serve a esta
 * enciclopédia, o `ClearBuffer` abaixo esvazia o buffer no começo de cada quadro
 * (cor + profundidade). Sem isso os cards herdam a imagem e o z-buffer uns dos
 * outros: profundidade envelhecida faz partes do modelo sumirem ou atravessarem
 * umas às outras (o fantasma que apareceu na primeira versão do palco).
 *
 * O canvas fica ACIMA do overlay da enciclopédia (z-index 45 > 40) e é
 * transparente fora das caixas: o fundo do card, as bordas e o texto aparecem
 * por baixo, e o modelo só pinta dentro da caixa do próprio card.
 */

/** limpa o buffer inteiro antes dos containers do View (prioridade = index >= 1) */
function ClearBuffer() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    gl.setScissorTest(false); // scissor/viewport ficam sujos do card anterior
    gl.clear(); // clearColor com alpha 0: o palco inteiro volta a vazio
  }, -1);
  return null;
}

export function BestiaryStage() {
  const open = useGameStore((s) => s.showBestiary);
  const can3d = hasWebGL2();

  if (!open || !can3d) return null;
  return (
    <Canvas
      className="beast-stage"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.1, 4.6], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0); // transparente: o DOM aparece por baixo
        // UMA câmera para todos os cards: olhar para a origem, onde cada card
        // centraliza o modelo (o drei só troca o aspect por card, jamais a pose)
        camera.lookAt(0, 0, 0);
      }}
    >
      <ClearBuffer />
      <View.Port />
    </Canvas>
  );
}
