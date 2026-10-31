import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import type { SmokePool } from './smokePool';

/**
 * Camada que desenha e simula um SmokePool (fumaça/fuligem). Monta uma única
 * vez por cena; os emissores (trilha dos projéteis, chamas das criaturas,
 * fusões) só chamam pool.spawn().
 */
export function SmokeLayer({ pool }: { pool: SmokePool }) {
  useFrame((state, dtRaw) => {
    pool.update(Math.min(dtRaw, 0.05), state.clock.elapsedTime);
  });
  useEffect(() => () => pool.dispose(), [pool]);
  return <points geometry={pool.geo} material={pool.mat} frustumCulled={false} />;
}
