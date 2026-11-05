import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_R, ORBIT_TARGET, SCENIC_CAMERA_MAX_DISTANCE } from '../game/board';
import { useGameStore } from '../store/gameStore';

export const FOREST_BG = '#4d6041';
const TREE_CANOPY_RADIUS = 24;
const TREE_CAMERA_CLEARANCE = 3;
const TREE_RING_WIDTH = 18;
const TREE_RING_INNER_RADIUS =
  SCENIC_CAMERA_MAX_DISTANCE +
  Math.hypot(ORBIT_TARGET[0], ORBIT_TARGET[2]) +
  TREE_CANOPY_RADIUS +
  TREE_CAMERA_CLEARANCE;
const FOREST_GROUND_RADIUS = TREE_RING_INNER_RADIUS + TREE_RING_WIDTH + 12;

interface Instance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

interface ForestLayout {
  trunks: Instance[];
  distantTrunks: Instance[];
  distantCrowns: Instance[];
  roots: Instance[];
  branches: Instance[];
  crowns: Instance[];
  shrubs: Instance[];
  ferns: Instance[];
  rocks: Instance[];
}

function addBranch(
  branches: Instance[],
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  color: string,
): void {
  const vector = end.clone().sub(start);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      vector.clone().normalize(),
    ),
  );
  branches.push({
    position: [
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    ],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [width, vector.length(), width],
    color,
  });
}

function createForestLayout(ecoActive: boolean): ForestLayout {
  let state = 0x4f524553;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const layout: ForestLayout = {
    trunks: [],
    distantTrunks: [],
    distantCrowns: [],
    roots: [],
    branches: [],
    crowns: [],
    shrubs: [],
    ferns: [],
    rocks: [],
  };
  // 🔋 modo econômico: a vegetação de preenchimento emagrece (mesmo PRNG com
  // seed, mesma distribuição de raio — só a contagem cai). Os anéis ficam
  // intactos: a muralha distante e as rochas do entorno são a silhueta do
  // cenário e não entram no passe de sombra de qualquer jeito (ver castShadow
  // removido nos meshes do anel).
  const thin = (n: number): number => (ecoActive ? Math.max(8, Math.round(n * 0.66)) : n);
  const treeCount = thin(96);
  const groundY = -1.53;

  for (let i = 0; i < treeCount; i++) {
    const angle = i * 2.399963 + (random() - 0.5) * 0.3;
    const radius = TREE_RING_INNER_RADIUS + Math.sqrt(random()) * TREE_RING_WIDTH;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 13 + random() * 9;
    const width = 1.3 + random() * 1.1;
    const lean = (random() - 0.5) * 0.42;
    const trunkColor = ['#493b2b', '#57432e', '#66503a'][Math.floor(random() * 3)];
    const trunkBend = (random() - 0.5) * 8.4;
    const trunkBendZ = (random() - 0.5) * 8.4;
    const trunkPoints = [
      new THREE.Vector3(x, groundY, z),
      new THREE.Vector3(x + lean * 2, groundY + height * 0.36, z - lean),
      new THREE.Vector3(x + trunkBend, groundY + height * 0.7, z + trunkBendZ),
      new THREE.Vector3(x + trunkBend * 0.55, groundY + height, z + trunkBendZ * 0.55),
    ];
    for (let segment = 0; segment < trunkPoints.length - 1; segment++) {
      const start = trunkPoints[segment];
      const end = trunkPoints[segment + 1];
      const vector = end.clone().sub(start);
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vector.clone().normalize(),
        ),
      );
      layout.trunks.push({
        position: [
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          (start.z + end.z) / 2,
        ],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [width * (1.45 - segment * 0.18), vector.length(), width * (1.45 - segment * 0.18)],
        color: trunkColor,
      });
    }

    for (let root = 0; root < 6; root++) {
      const direction = angle + (root / 6) * Math.PI * 2 + random() * 0.25;
      const length = width * (1.8 + random() * 1.7);
      const rise = 0.2 + random() * 0.5;
      const vector = new THREE.Vector3(
        Math.cos(direction) * length,
        rise,
        Math.sin(direction) * length,
      );
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vector.clone().normalize(),
        ),
      );
      layout.roots.push({
        position: [x + vector.x / 2, groundY + vector.y / 2, z + vector.z / 2],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [width * 0.82, vector.length(), width * 0.82],
        color: trunkColor,
      });
    }

    const branchCount = 5 + Math.floor(random() * 3);
    for (let branch = 0; branch < branchCount; branch++) {
      const direction = angle + random() * Math.PI * 2;
      const length = 5 + random() * 4.5;
      const rise = 0.9 + random() * 2.6;
      const startY = groundY + height * (0.3 + random() * 0.32);
      const trunkProgress = (startY - groundY) / height;
      const branchX = x + trunkBend * trunkProgress;
      const branchZ = z + trunkBendZ * trunkProgress;
      const start = new THREE.Vector3(branchX, startY, branchZ);
      const endpoint = start.clone().add(
        new THREE.Vector3(
          Math.cos(direction) * length,
          rise,
          Math.sin(direction) * length,
        ),
      );
      addBranch(layout.branches, start, endpoint, width * 0.92, trunkColor);

      const forkCount = 1 + Math.floor(random() * 2);
      for (let fork = 0; fork < forkCount; fork++) {
        const forkDirection = direction + (random() < 0.5 ? -1 : 1) * (0.45 + random() * 0.7);
        const forkLength = 2.8 + random() * 2.8;
        const forkEnd = endpoint.clone().add(
          new THREE.Vector3(
            Math.cos(forkDirection) * forkLength,
            0.4 + random() * 1.5,
            Math.sin(forkDirection) * forkLength,
          ),
        );
        addBranch(layout.branches, endpoint, forkEnd, width * 0.48, trunkColor);
      }
    }

    const crownY = groundY + height * 0.72;
    const crownCount = 6 + Math.floor(random() * 3);
    const crownColor = ['#4b873a', '#559342', '#65a04b', '#72a952'][
      Math.floor(random() * 4)
    ];
    for (let crown = 0; crown < crownCount; crown++) {
      const crownAngle = random() * Math.PI * 2;
      const spread = crown === 0 ? 0 : 2.4 + random() * 4.2;
      const size = crown === 0 ? 7 + random() * 2.2 : 5.2 + random() * 3.2;
      layout.crowns.push({
        position: [
          x + trunkBend * 0.5 + Math.cos(crownAngle) * spread,
          crownY + (random() - 0.45) * 3.4,
          z + Math.sin(crownAngle) * spread,
        ],
        rotation: [random() * 0.25, random() * Math.PI, random() * 0.25],
        scale: [size, size * (0.25 + random() * 0.16), size * (0.82 + random() * 0.4)],
        color:
          crown === 0 || random() > 0.28
            ? crownColor
            : ['#559342', '#65a04b', '#72a952'][Math.floor(random() * 3)],
      });
    }
  }

  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (random() - 0.5) * 0.14;
    const radius = TREE_RING_INNER_RADIUS + TREE_RING_WIDTH + 6 + random() * 6;
    const height = 17 + random() * 10;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const width = 0.55 + random() * 0.55;
    layout.distantTrunks.push({
      position: [x, groundY + height * 0.46, z],
      rotation: [0, angle, 0],
      scale: [width, height, width],
      color: ['#493b2b', '#57432e', '#66503a'][i % 3],
    });
    layout.distantCrowns.push({
      position: [x, groundY + height * 0.87, z],
      rotation: [0, random() * Math.PI, 0],
      scale: [6 + random() * 4, 5 + random() * 4, 6 + random() * 4],
      color: ['#29452b', '#355b32', '#486c38'][i % 3],
    });
  }

  for (let i = 0; i < thin(110); i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1.5 + random() * 34;
    const size = 0.6 + random() * 1.4;
    layout.shrubs.push({
      position: [Math.cos(angle) * radius, groundY + size * 0.42, Math.sin(angle) * radius],
      rotation: [0, random() * Math.PI, 0],
      scale: [size, size * (0.45 + random() * 0.4), size * (0.8 + random() * 0.5)],
      color: ['#29452b', '#355b32', '#486c38', '#58723b'][i % 4],
    });
  }

  for (let i = 0; i < 25; i++) {
    const angle = (i / 25) * Math.PI * 2 + random() * 0.3;
    const radius = ARENA_R + 2 + random() * 24;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const leafCount = 5 + Math.floor(random() * 3);
    for (let leaf = 0; leaf < leafCount; leaf++) {
      const leafAngle = (leaf / leafCount) * Math.PI * 2;
      const length = 0.85 + random() * 1.15;
      const vector = new THREE.Vector3(
        Math.cos(leafAngle) * length * 0.7,
        length,
        Math.sin(leafAngle) * length * 0.7,
      );
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vector.clone().normalize(),
        ),
      );
      layout.ferns.push({
        position: [x + vector.x / 2, groundY + vector.y / 2, z + vector.z / 2],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [0.55, vector.length(), 0.55],
        color: ['#47763a', '#5a8b43', '#6c9a4c'][leaf % 3],
      });
    }
  }

  for (let i = 0; i < 58; i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1 + random() * 31;
    const size = 0.45 + random() * 1.8;
    layout.rocks.push({
      position: [Math.cos(angle) * radius, groundY + size * 0.35, Math.sin(angle) * radius],
      rotation: [random() * 0.4, random() * Math.PI, random() * 0.4],
      scale: [size, size * (0.5 + random() * 0.6), size * (0.75 + random() * 0.55)],
      color: ['#59604a', '#666b51', '#77745b'][i % 3],
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

export function ForestEnvironment() {
  // 🔋 no econômico a mata emagrece (createForestLayout recebe ecoActive)
  const ecoActive = useGameStore((s) => s.ecoActive);
  const layout = useMemo(() => createForestLayout(ecoActive), [ecoActive]);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const distantTrunkRef = useRef<THREE.InstancedMesh>(null);
  const distantCrownRef = useRef<THREE.InstancedMesh>(null);
  const rootRef = useRef<THREE.InstancedMesh>(null);
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const shrubRef = useRef<THREE.InstancedMesh>(null);
  const fernRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    applyInstances(trunkRef.current, layout.trunks);
    applyInstances(distantTrunkRef.current, layout.distantTrunks);
    applyInstances(distantCrownRef.current, layout.distantCrowns);
    applyInstances(rootRef.current, layout.roots);
    applyInstances(branchRef.current, layout.branches);
    applyInstances(crownRef.current, layout.crowns);
    applyInstances(shrubRef.current, layout.shrubs);
    applyInstances(fernRef.current, layout.ferns);
    applyInstances(rockRef.current, layout.rocks);
  }, [layout]);

  return (
    <group name="forest-environment">
      <mesh
        position={[0, -1.53, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[FOREST_GROUND_RADIUS, 64]} />
        <meshStandardMaterial
          color="#5d7147"
          emissive="#354728"
          emissiveIntensity={0.08}
          roughness={1}
        />
      </mesh>

      {/* 🔋 A muralha da floresta (troncos/copas a r 86+) e a muralha distante
          (r 110+) ficam FORA da caixa de sombra (ARENA_R×1,15 ≈ 26,6): o
          desenho delas no passe de profundidade era desperdício puro — o
          castShadow morreu nelas. Rochas e arbustos perto da ilha continuam
          projetando sombra. */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, layout.trunks.length]} receiveShadow>
        <cylinderGeometry args={[0.48, 0.82, 1, 7]} />
        <meshStandardMaterial roughness={0.92} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={distantTrunkRef}
        args={[undefined, undefined, layout.distantTrunks.length]}
      >
        <cylinderGeometry args={[0.48, 0.82, 1, 7]} />
        <meshStandardMaterial roughness={0.92} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={distantCrownRef}
        args={[undefined, undefined, layout.distantCrowns.length]}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={rootRef} args={[undefined, undefined, layout.roots.length]} receiveShadow>
        <cylinderGeometry args={[0.16, 0.34, 1, 6]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[undefined, undefined, layout.branches.length]}>
        <cylinderGeometry args={[0.2, 0.38, 1, 6]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, layout.crowns.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={shrubRef} args={[undefined, undefined, layout.shrubs.length]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={fernRef} args={[undefined, undefined, layout.ferns.length]} receiveShadow>
        <coneGeometry args={[0.28, 1, 5]} />
        <meshStandardMaterial roughness={0.95} flatShading side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[undefined, undefined, layout.rocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>

      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2 + 0.18;
        const radius = ARENA_R + 1.8;
        const height = 1.5 + ((index * 7) % 4) * 0.72;
        return (
          <group
            key={index}
            position={[Math.cos(angle) * radius, -1.53, Math.sin(angle) * radius]}
            rotation={[0, angle, 0]}
          >
            <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.9, 1.15, 0.44, 7]} />
              <meshStandardMaterial color="#686c55" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.44 + height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.95, height, 0.82]} />
              <meshStandardMaterial color="#77745e" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.57 + height, 0]} rotation={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[1.18, 0.26, 1.06]} />
              <meshStandardMaterial color="#858067" roughness={1} flatShading />
            </mesh>
            <mesh position={[0.04, 0.44 + height * 0.68, 0.02]} castShadow>
              <boxGeometry args={[0.99, 0.14, 0.86]} />
              <meshStandardMaterial color="#5e634f" roughness={1} flatShading />
            </mesh>
            <mesh position={[0.75, 0.2, 0.3]} rotation={[0.12, angle, 0.3]} castShadow>
              <boxGeometry args={[1.8, 0.42, 0.72]} />
              <meshStandardMaterial color="#5e634f" roughness={1} flatShading />
            </mesh>
          </group>
        );
      })}

      {Array.from({ length: 4 }, (_, index) => {
        const angle = (index / 4) * Math.PI * 2 + 0.58;
        const radius = ARENA_R + 4.8 + (index % 2) * 1.6;
        const height = 4.8 + ((index * 3) % 4) * 0.72;
        const stone = index % 2 === 0 ? '#737765' : '#656d5c';
        return (
          <group
            key={`stone-monument-${index}`}
            position={[Math.cos(angle) * radius, -1.53, Math.sin(angle) * radius]}
            rotation={[0, angle + 0.35, 0.08 * (index % 2 ? 1 : -1)]}
          >
            <mesh position={[0, 0.42, 0]} rotation={[0.04, 0.12, -0.06]} castShadow receiveShadow>
              <dodecahedronGeometry args={[1]} />
              <meshStandardMaterial color="#59614f" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0.5, 0]} rotation={[0, 0.12, 0]} castShadow receiveShadow>
              <boxGeometry args={[3.4, 0.64, 2.5]} />
              <meshStandardMaterial color={stone} roughness={1} flatShading />
            </mesh>
            <mesh
              position={[-0.62, 0.76 + height * 0.43, 0]}
              rotation={[0.03, 0.08, 0.12 * (index % 2 ? 1 : -1)]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1.4, height, 1.12]} />
              <meshStandardMaterial color="#777a66" roughness={1} flatShading />
            </mesh>
            <mesh
              position={[-0.7, 0.76 + height, 0]}
              rotation={[0, 0.18, 0.12 * (index % 2 ? 1 : -1)]}
              castShadow
            >
              <boxGeometry args={[1.9, 0.52, 1.5]} />
              <meshStandardMaterial color="#85836e" roughness={1} flatShading />
            </mesh>
            <mesh
              position={[1.15, 1.28, 0.28]}
              rotation={[0.16, 0.2, 0.42 * (index % 2 ? 1 : -1)]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1.25, 2.8 + (index % 3) * 0.55, 1.05]} />
              <meshStandardMaterial color="#626a58" roughness={1} flatShading />
            </mesh>
            <mesh position={[-1.62, 0.48, 0.94]} rotation={[0.2, 0.4, -0.12]} castShadow>
              <dodecahedronGeometry args={[0.72]} />
              <meshStandardMaterial color="#85836e" roughness={1} flatShading />
            </mesh>
            <mesh position={[1.72, 0.56, -0.72]} rotation={[0.16, 0.8, 0.08]} castShadow>
              <dodecahedronGeometry args={[0.92]} />
              <meshStandardMaterial color="#777a66" roughness={1} flatShading />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
