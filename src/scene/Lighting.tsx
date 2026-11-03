import { ARENA_R, PLATFORM } from '../game/board';
import type { ArenaScene } from '../game/types';

/** Iluminação da arena: key com sombras + preenchimento hemisférico + tons das equipes.
 *
 *  Tudo é derivado do TABULEIRO (`ARENA_R`, `PLATFORM`): quando os buracos
 *  crescem, a caixa de sombra, o alcance das luzes e o enquadramento acompanham
 *  sozinhos. Com a luz do tamanho antigo a linha de fundo ficava no escuro e sem
 *  sombra — e era justamente lá que a CPU plantava. */

/** caixa de sombra cobre a ilha inteira (com folga: a luz é inclinada) */
const SHADOW_BOX = ARENA_R * 1.15;
/** os holofotes das equipes ficam sobre o CENTRO de cada plataforma */
const TEAM_LIGHT_Z = PLATFORM.centerZ;
const TEAM_LIGHT_Y = ARENA_R * 0.17;
const TEAM_LIGHT_RANGE = ARENA_R * 0.85;
// intensidade cresce com o QUADRADO do alcance (decaimento físico 1/d²) para a
// plataforma continuar com o mesmo brilho de antes do tabuleiro ter crescido
const TEAM_LIGHT_INTENSITY = 22 * (TEAM_LIGHT_RANGE / 17) ** 2;

export function Lighting({ sceneVariant }: { sceneVariant: ArenaScene }) {
  const forest = sceneVariant === 'forest';
  const icy = sceneVariant === 'ice';
  const volcanic = sceneVariant === 'volcanic';
  const underwater = sceneVariant === 'underwater';
  return (
    <group>
      <hemisphereLight
        args={[
          forest ? '#e2edc5' : icy ? '#d9f3ff' : volcanic ? '#b96743' : underwater ? '#8de8eb' : '#8fb2ff',
          forest ? '#465638' : icy ? '#294459' : volcanic ? '#24130f' : underwater ? '#123943' : '#141a2c',
          forest ? 1.18 : icy ? 0.9 : volcanic ? 1 : underwater ? 1.02 : 0.75,
        ]}
      />
      <ambientLight
        intensity={forest ? 0.62 : icy ? 0.32 : volcanic ? 0.38 : underwater ? 0.52 : 0.18}
        color={forest ? '#e0edc0' : icy ? '#bdeaff' : volcanic ? '#ef7a36' : underwater ? '#8edfe5' : '#a8c4ff'}
      />
      <directionalLight
        position={
          forest
            ? [0, ARENA_R * 1.7, 0]
            : icy
              ? [-ARENA_R * 0.35, ARENA_R * 1.8, -ARENA_R * 0.45]
              : volcanic
                ? [-ARENA_R * 0.25, ARENA_R * 1.1, ARENA_R * 0.45]
                : underwater
                  ? [0, ARENA_R * 2, -ARENA_R * 0.45]
            : [ARENA_R * 0.3, ARENA_R * 0.65, ARENA_R * 0.22]
        }
        intensity={forest ? 1.8 : icy ? 1.55 : volcanic ? 1.05 : underwater ? 1.45 : 1.7}
        color={forest ? '#fff1cb' : icy ? '#d6f1ff' : volcanic ? '#ff9b56' : underwater ? '#a3f6f1' : '#ffe9c4'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-SHADOW_BOX}
        shadow-camera-right={SHADOW_BOX}
        shadow-camera-top={SHADOW_BOX}
        shadow-camera-bottom={-SHADOW_BOX}
        shadow-camera-near={1}
        shadow-camera-far={ARENA_R * 3.2}
        shadow-bias={-0.0004}
      />
      {/* tons das equipes: jogador dourado, IA violeta (no meio das plataformas) */}
      <pointLight
        position={[0, TEAM_LIGHT_Y, TEAM_LIGHT_Z]}
        intensity={TEAM_LIGHT_INTENSITY}
        distance={TEAM_LIGHT_RANGE}
        decay={2}
        color={forest ? '#d8b45d' : icy ? '#f2d89a' : volcanic ? '#ff7a28' : underwater ? '#75e7df' : '#f5c451'}
      />
      <pointLight
        position={[0, TEAM_LIGHT_Y, -TEAM_LIGHT_Z]}
        intensity={TEAM_LIGHT_INTENSITY}
        distance={TEAM_LIGHT_RANGE}
        decay={2}
        color={forest ? '#849b65' : icy ? '#78c8ee' : volcanic ? '#b93b1a' : underwater ? '#428fbd' : '#9d5cff'}
      />
      <pointLight
        position={[0, ARENA_R * 0.24, 0]}
        intensity={12 * ((ARENA_R * 0.62) / 12) ** 2}
        distance={ARENA_R * 0.62}
        decay={2}
        color={forest ? '#8b9860' : icy ? '#4aa9d0' : volcanic ? '#ff4b12' : underwater ? '#5bc9d0' : '#6d4fff'}
      />
    </group>
  );
}
