import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_R } from '../game/board';
import { useGameStore } from '../store/gameStore';

export const ICE_BG = '#132b40';

const TREE_CANOPY_RADIUS = 7.5;
const TREE_RING_WIDTH = 12;
const TREE_RING_INNER_RADIUS = ARENA_R + TREE_CANOPY_RADIUS + 2;
const GROUND_RADIUS = TREE_RING_INNER_RADIUS + TREE_RING_WIDTH + 32;
const GROUND_Y = -1.53;

interface Instance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

interface IceLayout {
  trunks: Instance[];
  foliage: Instance[];
  snowCaps: Instance[];
  rocks: Instance[];
  spires: Instance[];
  ridges: Instance[];
}

function createIceLayout(ecoActive: boolean): IceLayout {
  let state = 0x1ce2025;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  // 🔋 modo econômico: árvores do anel (32) e rochas de preenchimento (82)
  // emagrecem; agulhas e cumes do horizonte ficam intactos (silhueta)
  const thin = (n: number): number => (ecoActive ? Math.max(6, Math.round(n * 0.66)) : n);
  const layout: IceLayout = {
    trunks: [],
    foliage: [],
    snowCaps: [],
    rocks: [],
    spires: [],
    ridges: [],
  };

  const treeRing = thin(32);
  for (let i = 0; i < treeRing; i++) {
    const angle = (i / treeRing) * Math.PI * 2 + (random() - 0.5) * 0.12;
    const radius = TREE_RING_INNER_RADIUS + Math.sqrt(random()) * TREE_RING_WIDTH;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 12 + random() * 7;
    const trunkHeight = height * (0.62 + random() * 0.12);
    layout.trunks.push({
      position: [x, GROUND_Y + trunkHeight / 2, z],
      rotation: [0, random() * Math.PI, 0],
      scale: [0.34 + random() * 0.28, trunkHeight, 0.34 + random() * 0.28],
      color: ['#354e60', '#405a6b', '#4b6575'][Math.floor(random() * 3)],
    });

    const tiers = 4;
    const foliageColor = ['#255f7a', '#2e7590', '#3988a3'][Math.floor(random() * 3)];
    for (let tier = 0; tier < tiers; tier++) {
      const tierWidth = height * (0.15 + (tiers - tier) * 0.02);
      const tierHeight = height * (0.34 + random() * 0.05);
      const tierY = GROUND_Y + height * (0.27 + tier * 0.17);
      layout.foliage.push({
        position: [x, tierY, z],
        rotation: [0, random() * Math.PI, 0],
        scale: [tierWidth, tierHeight, tierWidth],
        color: foliageColor,
      });
      layout.snowCaps.push({
        position: [x, tierY + tierHeight * 0.22, z],
        rotation: [0, random() * Math.PI, 0],
        scale: [tierWidth * 0.64, tierHeight * 0.38, tierWidth * 0.64],
        color: ['#d4f0f8', '#edfaff', '#b9e3ef'][Math.floor(random() * 3)],
      });
    }
  }

  for (let i = 0; i < thin(82); i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1 + random() * 12;
    const size = 0.6 + random() * 2.1;
    layout.rocks.push({
      position: [Math.cos(angle) * radius, GROUND_Y + size * 0.35, Math.sin(angle) * radius],
      rotation: [random() * 0.35, random() * Math.PI, random() * 0.35],
      scale: [size, size * (0.48 + random() * 0.5), size * (0.72 + random() * 0.48)],
      color: ['#b5dce9', '#d2edf4', '#91baca', '#e3f4f7'][i % 4],
    });
  }

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + random() * 0.2;
    const radius = ARENA_R + 3 + random() * 9;
    const height = 3 + random() * 4.5;
    const size = 0.8 + random() * 1.1;
    layout.spires.push({
      position: [Math.cos(angle) * radius, GROUND_Y + height / 2, Math.sin(angle) * radius],
      rotation: [(random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2],
      scale: [size, height, size * (0.6 + random() * 0.5)],
      color: ['#65b9d5', '#8bd5e8', '#b8ecf5'][i % 3],
    });
  }

  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + (random() - 0.5) * 0.18;
    const radius = ARENA_R + 30 + random() * 21;
    const height = 10 + random() * 12;
    const width = 9 + random() * 10;
    layout.ridges.push({
      position: [Math.cos(angle) * radius, GROUND_Y + height * 0.42, Math.sin(angle) * radius],
      rotation: [(random() - 0.5) * 0.12, angle, (random() - 0.5) * 0.12],
      scale: [width, height, width * (0.72 + random() * 0.4)],
      color: ['#587d90', '#668da0', '#739bac', '#82aebe'][i % 4],
    });
  }
  return layout;
}

function applyInstances(mesh: THREE.InstancedMesh | null, instances: Instance[]): void {
  if (!mesh) return;
  const transform = new THREE.Object3D();
  instances.forEach((instance, index) => {
    transform.position.set(...instance.position);
    transform.rotation.set(...instance.rotation);
    transform.scale.set(...instance.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, new THREE.Color(instance.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function createSnowfall(): THREE.BufferGeometry {
  let state = 0x5a0f1a11;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const count = 520;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (GROUND_RADIUS + 12);
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = random() * 34;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function IceEnvironment() {
  // 🔋 no econômico o layout recebe ecoActive (menos árvores/rochas de preenchimento)
  const ecoActive = useGameStore((s) => s.ecoActive);
  const layout = useMemo(() => createIceLayout(ecoActive), [ecoActive]);
  const snowfall = useMemo(createSnowfall, []);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const snowCapRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const spireRef = useRef<THREE.InstancedMesh>(null);
  const ridgeRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    applyInstances(trunkRef.current, layout.trunks);
    applyInstances(foliageRef.current, layout.foliage);
    applyInstances(snowCapRef.current, layout.snowCaps);
    applyInstances(rockRef.current, layout.rocks);
    applyInstances(spireRef.current, layout.spires);
    applyInstances(ridgeRef.current, layout.ridges);
  }, [layout]);

  useFrame((_, delta) => {
    const positions = snowfall.getAttribute('position') as THREE.BufferAttribute;
    const values = positions.array as Float32Array;
    for (let i = 0; i < values.length; i += 3) {
      values[i] += Math.sin(values[i + 2] * 0.05) * delta * 0.35;
      values[i + 1] -= delta * (2.5 + (i % 7) * 0.18);
      if (values[i + 1] < -1) values[i + 1] = 33;
    }
    positions.needsUpdate = true;
  });

  return (
    <group name="ice-environment">
      <mesh position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[GROUND_RADIUS, 64]} />
        <meshStandardMaterial
          color="#91b3c2"
          emissive="#577c90"
          emissiveIntensity={0.04}
          roughness={1}
        />
      </mesh>

      {/* 🔋 o anel de gelo (r 32+) e as cumes do horizonte (r 53+) ficam FORA
          da caixa de sombra (ARENA_R×1,15 ≈ 26,6): castShadow nelas só
          desenhava instância no passe de profundidade à toa */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, layout.trunks.length]} receiveShadow>
        <cylinderGeometry args={[0.42, 0.62, 1, 7]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={foliageRef} args={[undefined, undefined, layout.foliage.length]}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={snowCapRef} args={[undefined, undefined, layout.snowCaps.length]}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[undefined, undefined, layout.rocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={spireRef} args={[undefined, undefined, layout.spires.length]} castShadow receiveShadow>
        <octahedronGeometry args={[1]} />
        <meshStandardMaterial roughness={0.72} metalness={0.08} flatShading />
      </instancedMesh>
      <instancedMesh ref={ridgeRef} args={[undefined, undefined, layout.ridges.length]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>

      <group position={[0, ARENA_R * 1.4, -ARENA_R * 1.35]}>
        {Array.from({ length: 7 }, (_, index) => {
          const x = (index - 3) * 4.8;
          const height = 4 + ((index * 7) % 5) * 1.15;
          return (
            <group key={index} position={[x, 0, (index % 2) * 2.8]}>
              <mesh scale={[4, height, 4.8]} castShadow>
                <dodecahedronGeometry args={[1, 0]} />
                <meshStandardMaterial
                  color={index % 3 === 0 ? '#a9d8e8' : '#78b9d1'}
                  roughness={0.82}
                  flatShading
                />
              </mesh>
              {index % 2 === 0 && (
                <mesh position={[0, -height * 0.62, 0]} rotation={[Math.PI, 0, 0]} castShadow>
                  <coneGeometry args={[1.1, 5 + (index % 3), 6]} />
                  <meshStandardMaterial color="#b8e4ef" roughness={0.78} flatShading />
                </mesh>
              )}
            </group>
          );
        })}
      </group>

      <points geometry={snowfall} frustumCulled={false}>
        <pointsMaterial
          color="#eafaff"
          size={0.32}
          transparent
          opacity={0.82}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}
