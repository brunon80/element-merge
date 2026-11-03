import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_R } from '../game/board';
import { circleTexture } from './assets';

export const UNDERWATER_BG = '#0b3446';

const GROUND_Y = -1.53;
const GROUND_RADIUS = ARENA_R + 68;

interface Instance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

interface UnderwaterLayout {
  rocks: Instance[];
  coralBranches: Instance[];
  coralHeads: Instance[];
  seaweed: Instance[];
  monuments: Instance[];
  monumentCaps: Instance[];
  distantReefs: Instance[];
}

function createUnderwaterLayout(): UnderwaterLayout {
  let state = 0x5ea771c;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const layout: UnderwaterLayout = {
    rocks: [],
    coralBranches: [],
    coralHeads: [],
    seaweed: [],
    monuments: [],
    monumentCaps: [],
    distantReefs: [],
  };
  const coralColors = ['#d58b7d', '#cb8bb4', '#d2b779', '#88bd9e', '#e5cfa1'];

  for (let i = 0; i < 128; i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1.5 + random() * 32;
    const size = 0.7 + random() * 2.4;
    layout.rocks.push({
      position: [
        Math.cos(angle) * radius,
        GROUND_Y + size * 0.3,
        Math.sin(angle) * radius,
      ],
      rotation: [random() * 0.3, random() * Math.PI, random() * 0.3],
      scale: [size * 1.25, size * 0.55, size * (0.75 + random() * 0.55)],
      color: ['#244b55', '#315c62', '#426b6b', '#587978'][i % 4],
    });
  }

  for (let cluster = 0; cluster < 42; cluster++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 2.5 + random() * 21;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const branchCount = 4 + Math.floor(random() * 4);
    const coralColor = coralColors[Math.floor(random() * coralColors.length)];

    for (let branch = 0; branch < branchCount; branch++) {
      const direction = angle + random() * Math.PI * 2;
      const height = 1.8 + random() * 3.8;
      const length = 0.8 + random() * 2;
      const start = new THREE.Vector3(x, GROUND_Y + height * 0.28, z);
      const end = start.clone().add(
        new THREE.Vector3(
          Math.cos(direction) * length,
          height * (0.56 + random() * 0.22),
          Math.sin(direction) * length,
        ),
      );
      const vector = end.clone().sub(start);
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vector.clone().normalize(),
        ),
      );
      layout.coralBranches.push({
        position: [(start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [0.22 + random() * 0.16, vector.length(), 0.22 + random() * 0.16],
        color: coralColor,
      });

      for (let fork = 0; fork < 2; fork++) {
        const forkStart = start.clone().lerp(end, 0.58 + random() * 0.2);
        const forkDirection = direction + (fork === 0 ? -1 : 1) * (0.48 + random() * 0.42);
        const forkEnd = forkStart.clone().add(
          new THREE.Vector3(
            Math.cos(forkDirection) * (0.7 + random() * 1.1),
            0.55 + random() * 1.1,
            Math.sin(forkDirection) * (0.7 + random() * 1.1),
          ),
        );
        const forkVector = forkEnd.clone().sub(forkStart);
        const forkRotation = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            forkVector.clone().normalize(),
          ),
        );
        layout.coralBranches.push({
          position: [
            (forkStart.x + forkEnd.x) / 2,
            (forkStart.y + forkEnd.y) / 2,
            (forkStart.z + forkEnd.z) / 2,
          ],
          rotation: [forkRotation.x, forkRotation.y, forkRotation.z],
          scale: [0.13 + random() * 0.1, forkVector.length(), 0.13 + random() * 0.1],
          color: coralColor,
        });
      }
    }

    const bushSize = 1 + random() * 1.4;
    layout.coralHeads.push({
      position: [x, GROUND_Y + bushSize * 0.45, z],
      rotation: [random() * 0.25, random() * Math.PI, random() * 0.25],
      scale: [bushSize * 1.3, bushSize * 0.68, bushSize],
      color: coralColors[cluster % coralColors.length],
    });
  }

  for (let cluster = 0; cluster < 58; cluster++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 2 + random() * 25;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const blades = 4 + Math.floor(random() * 5);
    for (let blade = 0; blade < blades; blade++) {
      const direction = random() * Math.PI * 2;
      const length = 2.8 + random() * 5.5;
      const lean = 0.08 + random() * 0.28;
      layout.seaweed.push({
        position: [
          x + Math.cos(direction) * lean * length * 0.5,
          GROUND_Y + length * 0.45,
          z + Math.sin(direction) * lean * length * 0.5,
        ],
        rotation: [
          Math.sin(direction) * lean,
          direction,
          -Math.cos(direction) * lean,
        ],
        scale: [0.54 + random() * 0.42, length, 0.3 + random() * 0.22],
        color: ['#347f68', '#459879', '#62a978', '#8ba86a'][blade % 4],
      });
    }
  }

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.18;
    const radius = ARENA_R + 8 + random() * 10;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 5.5 + random() * 5.5;
    const width = 0.85 + random() * 0.65;
    layout.monuments.push({
      position: [x, GROUND_Y + height / 2, z],
      rotation: [(random() - 0.5) * 0.1, angle, (random() - 0.5) * 0.1],
      scale: [width, height, width],
      color: ['#31525c', '#3c6269', '#547579'][i % 3],
    });
    layout.monumentCaps.push({
      position: [x, GROUND_Y + height + 0.35, z],
      rotation: [0, angle, 0],
      scale: [width * 0.82, 0.8 + random() * 0.7, width * 0.82],
      color: '#739795',
    });
  }

  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + (random() - 0.5) * 0.18;
    const radius = ARENA_R + 38 + random() * 22;
    const height = 8 + random() * 9;
    const width = 9 + random() * 10;
    layout.distantReefs.push({
      position: [Math.cos(angle) * radius, GROUND_Y + height * 0.34, Math.sin(angle) * radius],
      rotation: [(random() - 0.5) * 0.08, angle, (random() - 0.5) * 0.08],
      scale: [width, height, width * (0.7 + random() * 0.5)],
      color: ['#1d4650', '#244f58', '#2a5960', '#32636a'][i % 4],
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

function createBubbles(): THREE.BufferGeometry {
  let state = 0xbabb1e5;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const count = 380;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (GROUND_RADIUS + 8);
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = random() * 27;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function UnderwaterEnvironment() {
  const layout = useMemo(createUnderwaterLayout, []);
  const bubbles = useMemo(createBubbles, []);
  const rocksRef = useRef<THREE.InstancedMesh>(null);
  const coralBranchesRef = useRef<THREE.InstancedMesh>(null);
  const coralHeadsRef = useRef<THREE.InstancedMesh>(null);
  const seaweedRef = useRef<THREE.InstancedMesh>(null);
  const monumentsRef = useRef<THREE.InstancedMesh>(null);
  const monumentCapsRef = useRef<THREE.InstancedMesh>(null);
  const distantReefsRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    applyInstances(rocksRef.current, layout.rocks);
    applyInstances(coralBranchesRef.current, layout.coralBranches);
    applyInstances(coralHeadsRef.current, layout.coralHeads);
    applyInstances(seaweedRef.current, layout.seaweed);
    applyInstances(monumentsRef.current, layout.monuments);
    applyInstances(monumentCapsRef.current, layout.monumentCaps);
    applyInstances(distantReefsRef.current, layout.distantReefs);
  }, [layout]);

  useFrame((state, delta) => {
    const positions = bubbles.getAttribute('position') as THREE.BufferAttribute;
    const values = positions.array as Float32Array;
    for (let i = 0; i < values.length; i += 3) {
      const phase = values[i] * 0.12 + values[i + 2] * 0.08;
      values[i] += Math.sin(state.clock.elapsedTime * 0.8 + phase) * delta * 0.24;
      values[i + 2] += Math.cos(state.clock.elapsedTime * 0.7 + phase) * delta * 0.18;
      values[i + 1] += delta * (0.55 + (i % 11) * 0.055);
      if (values[i + 1] > 28) values[i + 1] = GROUND_Y;
    }
    positions.needsUpdate = true;
  });

  return (
    <group name="underwater-environment">
      <mesh position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[GROUND_RADIUS, 72]} />
        <meshStandardMaterial
          color="#28505a"
          emissive="#0b2936"
          emissiveIntensity={0.14}
          roughness={1}
          flatShading
        />
      </mesh>

      <instancedMesh ref={rocksRef} args={[undefined, undefined, layout.rocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.96} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={coralBranchesRef}
        args={[undefined, undefined, layout.coralBranches.length]}
        castShadow
      >
        <cylinderGeometry args={[0.2, 0.3, 1, 6]} />
        <meshStandardMaterial roughness={0.88} flatShading />
      </instancedMesh>
      <instancedMesh ref={coralHeadsRef} args={[undefined, undefined, layout.coralHeads.length]} castShadow>
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.82} flatShading />
      </instancedMesh>
      <instancedMesh ref={seaweedRef} args={[undefined, undefined, layout.seaweed.length]} castShadow>
        <coneGeometry args={[0.5, 1, 5]} />
        <meshStandardMaterial roughness={0.9} flatShading side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh
        ref={monumentsRef}
        args={[undefined, undefined, layout.monuments.length]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.46, 0.7, 1, 5]} />
        <meshStandardMaterial roughness={0.98} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={monumentCapsRef}
        args={[undefined, undefined, layout.monumentCaps.length]}
        castShadow
      >
        <coneGeometry args={[0.72, 1, 5]} />
        <meshStandardMaterial roughness={0.94} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={distantReefsRef}
        args={[undefined, undefined, layout.distantReefs.length]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <points geometry={bubbles} frustumCulled={false}>
        <pointsMaterial
          map={circleTexture()}
          color="#c6f4f3"
          size={0.34}
          transparent
          opacity={0.52}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <pointLight
        position={[0, ARENA_R * 1.2, -ARENA_R * 0.45]}
        color="#62d9e8"
        intensity={26}
        distance={ARENA_R * 1.5}
        decay={2}
      />
      <pointLight
        position={[-ARENA_R * 0.8, ARENA_R * 0.7, ARENA_R * 0.5]}
        color="#48aebf"
        intensity={18}
        distance={ARENA_R * 1.2}
        decay={2}
      />
    </group>
  );
}
