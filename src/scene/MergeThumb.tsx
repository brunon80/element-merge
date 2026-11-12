import { View } from '@react-three/drei/web';
import { memo, useRef } from 'react';
import { formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { VISUALS } from './speciesModels';
import { SpeciesRig, type Turntable } from './MonsterViewer';
import { hasWebGL2 } from './webgl';

/**
 * Miniatura 3D da prévia de fusões: modelo (ou silhueta selada) dentro de uma
 * caixinha DOM. O `View` do drei desenha esta caixa na JANELA (scissor) do
 * palco único `MergeStage` — mesmo desenho da enciclopédia: nada de contexto
 * WebGL por miniatura (o teto do iOS perderia o canvas da batalha).
 *
 * `locked = true` é a regra do bestiário para espécie ainda não descoberta:
 * silhueta escura uniforme, sem cor nem brilho — o jogador vê a forma, não a
 * identidade. O resultado MIRADO no arraste (linha 1 da prévia) nunca é
 * bloqueado: é a recompensa de segurar a criatura sobre a parceira.
 */
export const MergeThumb = memo(function MergeThumb({
  species,
  level,
  locked,
  viewIndex,
}: {
  species: SpeciesId;
  level: MonsterLevel;
  /** silhueta selada (espécie da árvore ainda não descoberta) */
  locked: boolean;
  /** prioridade única do View neste palco (um por miniatura montada) */
  viewIndex: number;
}): JSX.Element {
  const can3d = hasWebGL2();
  // vitrola: girinho lento automático (o SpeciesRig gira sozinho enquanto
  // `dragging` é falso); o painel é intocável, então ninguém segura o giro
  const turn = useRef<Turntable>({
    userRot: { current: 0.6 }, // fase inicial variada: nem todas de frente
    dragging: { current: false },
  });
  // enquadramento idêntico ao card da enciclopédia (MonsterViewer): o modelo
  // vai para a origem com escala que cabe na câmera única do palco
  const def = getSpecies(species);
  const variants = hasForms(def);
  const fixedLevel = def.levelMin === def.levelMax;
  const top = formTop(def, level);
  const fitRaw = variants || fixedLevel ? 1.96 / Math.pow(top, 0.72) : 1.25;
  const fit = Math.min(fitRaw, 2.7 / top);
  const frameY = -top * fit * 0.5;
  return (
    <div className={`mt-box${locked ? ' locked' : ''}`} data-testid="merge-thumb">
      {can3d ? (
        <View as="div" className="mt-model" index={viewIndex}>
          <ambientLight intensity={0.65} />
          <hemisphereLight args={['#9db8ff', '#141a2c', 0.5]} />
          <directionalLight position={[3, 6, 4]} intensity={1.4} />
          <pointLight
            position={[-2.5, 2.5, -2]}
            intensity={locked ? 0.35 : 12}
            color={locked ? '#8a93b5' : VISUALS[species].glow}
          />
          {/* selada, a caixa é minúscula e a silhueta é quase preta (mesma massa
             escura do card do bestiário, que lá é grande e tem fumaça por cima).
             Uma luz de recorte fria por trás devolve a FORMA ao jogador — é o
             que o selo do bestiário ensina: esconde a espécie, nunca o vazio */}
          {locked && <directionalLight position={[-3, 2.5, -3.5]} intensity={2.6} color="#7d90c8" />}
          <group position={[0, frameY, 0]} scale={fit}>
            <SpeciesRig species={species} level={level} locked={locked} turn={turn.current} />
          </group>
        </View>
      ) : (
        // sem WebGL2: bolinha na cor da espécie (ou vazia, selada) — a prévia
        // continua legível por nomes e níveis
        <span
          className="mt-flat"
          style={locked ? undefined : { background: VISUALS[species].glow }}
        />
      )}
    </div>
  );
});
