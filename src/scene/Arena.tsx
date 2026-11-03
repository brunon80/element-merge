import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../data/elements';
import {
  ARENA_R as ISLAND_R,
  MONSTER_FOOT_R,
  PLATFORM,
  ROW_DEPTH,
  TILE_SPACING_X,
  UNIT_BASE_Y,
  boardSlotPositions,
} from '../game/board';
import { useGameStore } from '../store/gameStore';
import { circleTexture } from './assets';
import type { ArenaScene } from '../game/types';
import { ForestEnvironment } from './ForestEnvironment';
import { IceEnvironment } from './IceEnvironment';
import { VolcanicEnvironment } from './VolcanicEnvironment';

/** Marcadores de slot: o anel EXTERNO é a fronteira de encaixe (`MONSTER_FOOT_R`)
 *  — o invólucro do figurino nunca passa dele, então o anel mostra ao jogador o
 *  buraco real e os anéis de vizinhos nunca se encostam (2 × 2,5 < 5,2 do vão). */
const SLOT_RING: [number, number] = [MONSTER_FOOT_R * 0.86, MONSTER_FOOT_R];
const COURT_WIDTH = (PLATFORM.halfX + 0.55) * 2;
const COURT_DEPTH = (PLATFORM.backZ + 0.55) * 2;

/** obeliscos elementais: do lado de fora das plataformas, na altura do meio */
const OBELISK_X = PLATFORM.halfX + 2.4;
const OBELISK_Z = PLATFORM.centerZ;

/** Arena: ilha flutuante com plataformas elementais e decorações.
 *  Toda a arte é derivada das constantes do tabuleiro (board.ts), então
 *  alargar os slots alarga a arena inteira junto. */
export function Arena({ sceneVariant }: { sceneVariant: ArenaScene }) {
  const forest = sceneVariant === 'forest';
  const icy = sceneVariant === 'ice';
  const volcanic = sceneVariant === 'volcanic';
  const scenic = forest || icy || volcanic;
  const crystalRef = useRef<THREE.Mesh>(null!);
  const rockRefs = useRef<THREE.Mesh[]>([]);
  const motesRef = useRef<THREE.Points>(null!);

  const slots = useMemo(() => boardSlotPositions(), []);
  const rockDefs = useMemo(
    () => [
      { p: [-17.4, 1.2, -12.9] as const, s: 1.1, ph: 0.4 },
      { p: [19.4, 2.4, -4.9] as const, s: 0.8, ph: 2.1 },
      { p: [-20.0, 3.6, 6.8] as const, s: 0.9, ph: 1.2 },
      { p: [15.9, -1.8, 11.4] as const, s: 1.4, ph: 3.4 },
      { p: [-14.9, -2.6, -14.9] as const, s: 1.6, ph: 0.9 },
      { p: [20.4, 0.5, 8.4] as const, s: 0.6, ph: 4.4 },
      { p: [-9.9, 4.2, -18.1] as const, s: 0.7, ph: 2.7 },
    ],
    [],
  );

  const stars = useMemo(() => {
    const n = 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const r = 70 + Math.random() * 38;
      pos[i * 3] = Math.cos(a) * Math.cos(b) * r;
      pos[i * 3 + 1] = Math.sin(b) * r * 0.7 + 8;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const motes = useMemo(() => {
    const n = 150;
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
      {forest && <ForestEnvironment />}
      {icy && <IceEnvironment />}
      {volcanic && <VolcanicEnvironment />}
      {/* ilha */}
      <mesh position={[0, -0.8, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_R, ISLAND_R, 1.6, 12]} />
        <meshStandardMaterial
          color={forest ? '#526640' : icy ? '#789ba9' : volcanic ? '#49332a' : '#232c44'}
          emissive={volcanic ? '#301008' : '#000000'}
          emissiveIntensity={volcanic ? 0.18 : 0}
          flatShading
          roughness={0.95}
        />
      </mesh>
      {!scenic && (
        <mesh position={[0, -4.9, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[ISLAND_R - 0.6, 6.8, 9]} />
          <meshStandardMaterial color="#1a2136" flatShading roughness={1} />
        </mesh>
      )}

      {/* campo circular arcano ou quadra retangular dos cenários naturais */}
      {scenic ? (
        <group
          name={
            forest ? 'forest-court' : icy ? 'ice-court' : 'volcanic-court'
          }
        >
          <mesh position={[0, 0.02, 0]} receiveShadow castShadow>
            <boxGeometry args={[COURT_WIDTH + 1.15, 0.48, COURT_DEPTH + 1.15]} />
            <meshStandardMaterial
              color={forest ? '#656653' : icy ? '#789aa8' : '#684637'}
              roughness={0.96}
              flatShading
            />
          </mesh>
          <mesh position={[0, 0.225, 0]} receiveShadow>
            <boxGeometry args={[COURT_WIDTH, 0.11, COURT_DEPTH]} />
            <meshStandardMaterial
              color={forest ? '#50564a' : icy ? '#416276' : '#493229'}
              emissive={volcanic ? '#291007' : '#000000'}
              emissiveIntensity={volcanic ? 0.18 : 0}
              roughness={0.88}
              metalness={icy ? 0.12 : 0}
              flatShading
            />
          </mesh>
          {slots.map((slot) => (
            <mesh
              key={`paver-${slot.side}-${slot.tile}`}
              position={[slot.pos[0], 0.282, slot.pos[2]]}
              receiveShadow
            >
              <boxGeometry args={[TILE_SPACING_X - 0.14, 0.004, ROW_DEPTH - 0.14]} />
              <meshStandardMaterial
                color={
                  (forest
                    ? ['#50574a', '#53594b', '#4f564a', '#555a4b']
                    : icy
                      ? ['#3e5b6d', '#456578', '#3b596c', '#496a7d']
                      : ['#4c352a', '#573a2c', '#493229', '#62402d'])[
                    (slot.tile * 3 + (slot.side === 'ai' ? 2 : 0)) % 4
                  ]
                }
                roughness={icy ? 0.82 : 1}
                metalness={icy ? 0.1 : 0}
                emissive={volcanic ? '#341309' : '#000000'}
                emissiveIntensity={volcanic ? 0.16 : 0}
                flatShading
              />
            </mesh>
          ))}
          {(
            [
              [0, 0.325, -COURT_DEPTH / 2, COURT_WIDTH + 0.5, 0.14, 0.38],
              [0, 0.325, COURT_DEPTH / 2, COURT_WIDTH + 0.5, 0.14, 0.38],
              [-COURT_WIDTH / 2, 0.325, 0, 0.38, 0.14, COURT_DEPTH + 0.5],
              [COURT_WIDTH / 2, 0.325, 0, 0.38, 0.14, COURT_DEPTH + 0.5],
            ] as const
          ).map((edge, index) => (
            <mesh key={index} position={[edge[0], edge[1], edge[2]]} castShadow>
              <boxGeometry args={[edge[3], edge[4], edge[5]]} />
              <meshStandardMaterial
                color={forest ? '#777661' : icy ? '#a9cad5' : '#80543a'}
                roughness={icy ? 0.86 : 1}
                flatShading
              />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[ISLAND_R - 0.1, 12]} />
          <meshStandardMaterial color="#2a3552" roughness={0.9} />
        </mesh>
      )}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ISLAND_R - 1.9, ISLAND_R - 1.5, 64]} />
        <meshBasicMaterial
          color={forest ? '#8a9460' : icy ? '#8ee7fb' : volcanic ? '#ff4c14' : '#3c4b74'}
          transparent
          opacity={forest ? 0.48 : icy ? 0.42 : volcanic ? 0.72 : 0.55}
        />
      </mesh>

      {/* linha central luminosa */}
      {scenic ? (
        <group>
          <mesh position={[0, 0.292, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[PLATFORM.halfX * 2.1, 0.72]} />
            <meshStandardMaterial
              color={forest ? '#706d53' : icy ? '#7395a4' : '#68442f'}
              roughness={1}
            />
          </mesh>
          <mesh position={[0, 0.304, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[PLATFORM.halfX * 2.1, 0.055]} />
            <meshBasicMaterial
              color={forest ? '#c6a85e' : icy ? '#a5efff' : '#ff7832'}
              transparent
              opacity={volcanic ? 0.82 : 0.78}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * (PLATFORM.halfX * 1.04), 0.12, 0]}
              rotation={[0, 0, 0.08 * side]}
              castShadow
            >
              <boxGeometry args={[0.42, 0.24, 0.72]} />
              <meshStandardMaterial
                color={forest ? '#79745c' : icy ? '#91b5c3' : '#704832'}
                roughness={1}
                flatShading
              />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ISLAND_R * 1.7, 0.14]} />
          <meshBasicMaterial color="#4fd4ff" transparent opacity={0.4} toneMapped={false} />
        </mesh>
      )}

      {/* cristal central */}
      {!forest && (
        <mesh ref={crystalRef} position={[0, 1.7, 0]}>
          <octahedronGeometry args={[0.55]} />
          <meshStandardMaterial
            color={icy ? '#b1f1ff' : volcanic ? '#ff6622' : '#7050d8'}
            emissive={icy ? '#68d9f5' : volcanic ? '#ff3b00' : '#8f5cff'}
            emissiveIntensity={icy ? 1.25 : volcanic ? 1.8 : 1.6}
            flatShading
            toneMapped={false}
          />
        </mesh>
      )}

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
            {!scenic && (
              <mesh position={[0, UNIT_BASE_Y - 0.15, cz]} receiveShadow>
                <boxGeometry args={[w, 0.3, d]} />
                <meshStandardMaterial color="#33406a" roughness={0.75} />
              </mesh>
            )}
            {/* moldura emissiva */}
            {(
              [
                [0, 0.2, cz - d / 2 - 0.03, w + 0.1, 0.06, 0.1],
                [0, 0.2, cz + d / 2 + 0.03, w + 0.1, 0.06, 0.1],
                [-(hx + 0.03), 0.2, cz, 0.1, 0.06, d + 0.12],
                [hx + 0.03, 0.2, cz, 0.1, 0.06, d + 0.12],
              ] as const
            ).map((b, i) => (
              !scenic && (
              <mesh key={i} position={[b[0], b[1], b[2]]}>
                <boxGeometry args={[b[3], b[4], b[5]]} />
                <meshBasicMaterial color={trim} toneMapped={false} transparent opacity={0.85} />
              </mesh>
              )
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
                  <meshBasicMaterial
                    color={forest ? '#c1c79a' : volcanic ? '#ff7842' : '#cfe3ff'}
                    transparent
                    opacity={forest ? 0.24 : icy ? 0.34 : volcanic ? 0.4 : 0.12}
                  />
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
            <meshStandardMaterial
              color={forest ? '#656b52' : icy ? '#7ca8b8' : volcanic ? '#38241e' : '#2c3554'}
              flatShading
              roughness={0.9}
            />
          </mesh>
          {!scenic && (
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
          )}
          {icy && (
            <mesh position={[0, 2.6, 0]}>
              <octahedronGeometry args={[0.38]} />
              <meshStandardMaterial
                color="#b4f0ff"
                emissive="#6bd8f5"
                emissiveIntensity={0.75}
                flatShading
              />
            </mesh>
          )}
          {volcanic && (
            <mesh position={[0, 2.6, 0]}>
              <octahedronGeometry args={[0.38]} />
              <meshStandardMaterial
                color="#ff6a22"
                emissive="#ff3300"
                emissiveIntensity={1.4}
                flatShading
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* rochas flutuantes */}
      {!scenic && rockDefs.map((d, i) => (
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
      {!scenic && <points geometry={stars} frustumCulled={false}>
        <pointsMaterial
          size={0.5}
          color="#9fb8e8"
          transparent
          opacity={0.75}
          sizeAttenuation
          map={circleTexture()}
          depthWrite={false}
        />
      </points>}
      {!icy && !volcanic && <points ref={motesRef} geometry={motes} frustumCulled={false}>
        <pointsMaterial
          size={forest ? 0.13 : 0.09}
          color={forest ? '#d3dc91' : '#7ad4ff'}
          transparent
          opacity={0.5}
          map={circleTexture()}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>}

      {/* plano invisível para raycast do arraste */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.28, 0]}
        onPointerMove={(e) => {
          const st = useGameStore.getState();
          if (st.dragId !== null) st.hoverWorld(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[ISLAND_R * 2.15, ISLAND_R * 2.15]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
    </group>
  );
}
