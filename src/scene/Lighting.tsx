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
  return (
    <group>
      <hemisphereLight
        args={[
          forest ? '#e2edc5' : '#8fb2ff',
          forest ? '#465638' : '#141a2c',
          forest ? 1.18 : 0.75,
        ]}
      />
      <ambientLight
        intensity={forest ? 0.62 : 0.18}
        color={forest ? '#e0edc0' : '#a8c4ff'}
      />
      <directionalLight
        position={
          forest
            ? [0, ARENA_R * 1.7, 0]
            : [ARENA_R * 0.3, ARENA_R * 0.65, ARENA_R * 0.22]
        }
        intensity={forest ? 1.8 : 1.7}
        color={forest ? '#fff1cb' : '#ffe9c4'}
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
        color={forest ? '#d8b45d' : '#f5c451'}
      />
      <pointLight
        position={[0, TEAM_LIGHT_Y, -TEAM_LIGHT_Z]}
        intensity={TEAM_LIGHT_INTENSITY}
        distance={TEAM_LIGHT_RANGE}
        decay={2}
        color={forest ? '#849b65' : '#9d5cff'}
      />
      <pointLight
        position={[0, ARENA_R * 0.24, 0]}
        intensity={12 * ((ARENA_R * 0.62) / 12) ** 2}
        distance={ARENA_R * 0.62}
        decay={2}
        color={forest ? '#8b9860' : '#6d4fff'}
      />
    </group>
  );
}
