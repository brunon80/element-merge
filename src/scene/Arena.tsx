import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../data/elements';
import {
  PLATFORM,
  TILE_SPACING_X,
  UNIT_BASE_Y,
  boardSlotPositions,
} from '../game/board';
import { useGameStore } from '../store/gameStore';
import { circleTexture } from './assets';

/** Raios interno/externo dos marcadores de slot (proporcionais ao espaçamento). */
const SLOT_RING: [number, number] = [TILE_SPACING_X * 0.26, TILE_SPACING_X * 0.31];

/** Ilha e ornamentos acompanham o tamanho do tabuleiro. */
const ISLAND_R = PLATFORM.backZ + 6.4;
/** obeliscos elementais: do lado de fora das plataformas, na diagonal dos fundos */
const OBELISK_X = PLATFORM.halfX + 2.7;
const OBELISK_Z = PLATFORM.backZ + 1.7;

/** Arena: ilha flutuante com plataformas elementais e decorações.
 *  Toda a arte é derivada das constantes do tabuleiro (board.ts), então
 *  alargar os slots alarga a arena inteira junto. */
export function Arena() {
  const crystalRef = useRef<THREE.Mesh>(null!);
  const rockRefs = useRef<THREE.Mesh[]>([]);
  const motesRef = useRef<THREE.Points>(null!);

  const slots = useMemo(() => boardSlotPositions(), []);
  const rockDefs = useMemo(
    () => [
      { p: [-13.9, 1.2, -10.3] as const, s: 1.1, ph: 0.4 },
      { p: [15.5, 2.4, -3.9] as const, s: 0.8, ph: 2.1 },
      { p: [-16.0, 3.6, 5.4] as const, s: 0.9, ph: 1.2 },
      { p: [12.7, -1.8, 9.1] as const, s: 1.4, ph: 3.4 },
      { p: [-11.9, -2.6, -11.9] as const, s: 1.6, ph: 0.9 },
      { p: [16.3, 0.5, 6.7] as const, s: 0.6, ph: 4.4 },
      { p: [-7.9, 4.2, -14.5] as const, s: 0.7, ph: 2.7 },
    ],
    [],
  );

  const stars = useMemo(() => {
    const n = 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const r = 56 + Math.random() * 30;
      pos[i * 3] = Math.cos(a) * Math.cos(b) * r;
      pos[i * 3 + 1] = Math.sin(b) * r * 0.7 + 8;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const motes = useMemo(() => {
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (ISLAND_R - 1);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 8;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // cristais flutuantes
    for (let i = 0; i < rockDefs.length; i++) {
      const m = rockRefs.current[i];
      if (!m) continue;
      const d = rockDefs[i];
      m.position.y = d.p[1] + Math.sin(t * 0.55 + d.ph) * 0.35;
      m.rotation.y = t * 0.15 + d.ph;
    }
    const crystal = crystalRef.current;
    if (crystal) {
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 1.7 + Math.sin(t * 1.2) * 0.18;
    }
    // motes ascendentes
    const pts = motesRef.current;
    if (pts) {
      const arr = (pts.geometry.getAttribute('position') as THREE.BufferAttribute)
        .array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] += 0.25 * (1 / 60);
        if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = 0;
      }
      (pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <group>
      {/* ilha */}
      <mesh position={[0, -0.8, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_R, ISLAND_R, 1.6, 12]} />
        <meshStandardMaterial color="#232c44" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, -4.9, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[ISLAND_R - 0.6, 6.8, 9]} />
        <meshStandardMaterial color="#1a2136" flatShading roughness={1} />
      </mesh>

      {/* convés */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ISLAND_R - 0.1, 12]} />
        <meshStandardMaterial color="#2a3552" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ISLAND_R - 1.9, ISLAND_R - 1.5, 64]} />
        <meshBasicMaterial color="#3c4b74" transparent opacity={0.55} />
      </mesh>

      {/* linha central luminosa */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ISLAND_R * 1.7, 0.14]} />
        <meshBasicMaterial color="#4fd4ff" transparent opacity={0.4} toneMapped={false} />
      </mesh>

      {/* cristal central */}
      <mesh ref={crystalRef} position={[0, 1.7, 0]}>
        <octahedronGeometry args={[0.55]} />
        <meshStandardMaterial
          color="#7050d8"
          emissive="#8f5cff"
          emissiveIntensity={1.6}
          flatShading
          toneMapped={false}
        />
      </mesh>

      {/* plataformas das equipes */}
      {(['player', 'ai'] as const).map((side) => {
        const sign = side === 'player' ? 1 : -1;
        const trim = side === 'player' ? '#f5c451' : '#b06ef0';
        const cz = sign * PLATFORM.centerZ;
        const w = PLATFORM.halfX * 2;
        const d = PLATFORM.depth;
        const hx = PLATFORM.halfX;
        return (
          <group key={side}>
            {/* topo da plataforma exatamente na base das criaturas */}
            <mesh position={[0, UNIT_BASE_Y - 0.15, cz]} receiveShadow>
              <boxGeometry args={[w, 0.3, d]} />
              <meshStandardMaterial color="#33406a" roughness={0.75} />
            </mesh>
            {/* moldura emissiva */}
            {(
              [
                [0, 0.2, cz - d / 2 - 0.03, w + 0.1, 0.06, 0.1],
                [0, 0.2, cz + d / 2 + 0.03, w + 0.1, 0.06, 0.1],
                [-(hx + 0.03), 0.2, cz, 0.1, 0.06, d + 0.12],
                [hx + 0.03, 0.2, cz, 0.1, 0.06, d + 0.12],
              ] as const
            ).map((b, i) => (
              <mesh key={i} position={[b[0], b[1], b[2]]}>
                <boxGeometry args={[b[3], b[4], b[5]]} />
                <meshBasicMaterial color={trim} toneMapped={false} transparent opacity={0.85} />
              </mesh>
            ))}
            {/* marcadores de slot */}
            {slots
              .filter((s) => s.side === side)
              .map((s) => (
                <mesh
                  key={s.tile}
                  position={[s.pos[0], s.pos[1] + 0.012, s.pos[2]]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <ringGeometry args={[SLOT_RING[0], SLOT_RING[1], 28]} />
                  <meshBasicMaterial color="#cfe3ff" transparent opacity={0.12} />
                </mesh>
              ))}
          </group>
        );
      })}

      {/* obeliscos elementais nos cantos */}
      {(
        [
          { el: 'fire', x: OBELISK_X, z: OBELISK_Z },
          { el: 'water', x: -OBELISK_X, z: OBELISK_Z },
          { el: 'earth', x: -OBELISK_X, z: -OBELISK_Z },
          { el: 'air', x: OBELISK_X, z: -OBELISK_Z },
        ] as const
      ).map((o) => (
        <group key={o.el} position={[o.x, 0, o.z]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.34, 2.2, 6]} />
            <meshStandardMaterial color="#2c3554" flatShading roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <octahedronGeometry args={[0.3]} />
            <meshStandardMaterial
              color={ELEMENTS[o.el].color}
              emissive={ELEMENTS[o.el].glow}
              emissiveIntensity={1.4}
              flatShading
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {/* rochas flutuantes */}
      {rockDefs.map((d, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) rockRefs.current[i] = m;
          }}
          position={[d.p[0], d.p[1], d.p[2]]}
        >
          <dodecahedronGeometry args={[d.s, 0]} />
          <meshStandardMaterial color="#2c3554" flatShading roughness={1} />
        </mesh>
      ))}

      {/* céu estrelado + motes */}
      <points geometry={stars} frustumCulled={false}>
        <pointsMaterial
          size={0.5}
          color="#9fb8e8"
          transparent
          opacity={0.75}
          sizeAttenuation
          map={circleTexture()}
          depthWrite={false}
        />
      </points>
      <points ref={motesRef} geometry={motes} frustumCulled={false}>
        <pointsMaterial
          size={0.09}
          color="#7ad4ff"
          transparent
          opacity={0.5}
          map={circleTexture()}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* plano invisível para raycast do arraste */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.28, 0]}
        onPointerMove={(e) => {
          const st = useGameStore.getState();
          if (st.dragId !== null) st.hoverWorld(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[46, 40]} />
        <meshBasicMaterial colorWrite={false} transparent opacity={0} />
      </mesh>
    </group>
  );
}
