import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MathUtils, type PerspectiveCamera } from 'three';
import {
  ARENA_R,
  CAMERA_MAX_DISTANCE,
  CAMERA_POS,
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
  const ecoActive = useGameStore((s) => s.ecoActive);
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
    } else if (
      // só entra no enquadro baixo onde o rodapé comporta a linha frontal:
      // >=1100px de largura mantém o buraco do canto fora da loja de 200px
      // (em janelas menores a folga some); as aspas de altura/aspecto são as
      // do @media compacto do styles.css, abaixo das quais o dock é faixa
      // full-width e não há onde pousar a linha frontal
      size.width >= 1100 &&
      size.height > 560 &&
      size.width / Math.max(1, size.height) >= 1.7
    ) {
      // Enquadro inicial do desktop (o da imagem de referência): câmera BAIXA
      // (~30° da horizontal) e PERTO — a borda frontal da plataforma invade o
      // rodapé, a linha de buracos mais próxima pousa a ~91% da altura e o
      // corpo celeste grande coroa o topo. Os números vieram da sonda (custo
      // contra 93%/230px da referência): é o mais baixo/perto que ainda deixa
      // os 24 buracos livres do DOM em TODAS as janelas do ramo (1100×640 é a
      // mais apertada, folga de ~12px entre o buraco e a loja de 200px).
      const dist = ARENA_R * 1.316;
      const pitch = 0.52; // rad; a órbita livre continua nos limites de sempre
      camera.position.set(
        0,
        ORBIT_TARGET[1] + dist * Math.sin(pitch),
        ORBIT_TARGET[2] + dist * Math.cos(pitch),
      );
    } else {
      // Celular/tablet/janela estreita: o enquadro antigo calibrado pelas
      // sondas — a sonda de alcançabilidade passou 24/24 com EXATAMENTE estas
      // coordenadas, e a folga entre a última linha e a loja é de ~1px;
      // qualquer "melhoria" aqui derruba buraco para baixo do dock.
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
      // 🔋 no eco a inércia MORRE: a damping do OrbitControls continua
      // disparando 'change' depois que o dedo sai do vidro, e cada 'change'
      // revalida o canvas demand — a sonda mediu 53,5 fps na cauda de 2 s
      // pós-arraste (o teto de 30 só valia com a cena parada). Sem damping a
      // câmera responde 1:1 com o dedo e a cauda não existe. No cheio, a
      // suavidade de sempre (e o showcase auto-rotate) continua.
      enableDamping={!ecoActive}
      dampingFactor={0.08}
      enableRotate={!dragActive}
      // 🔋 no MENU o palco gira sozinho (showcase) — mas em demand cada giro
      // dispara 'change' no OrbitControls, que invalida o frame e derruba o
      // teto de 30 Hz do modo econômico (a sonda mediu 62 fps em vez de 30).
      // No eco o menu fica estático; no cheio o showcase continua.
      autoRotate={menuMode && !ecoActive}
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
