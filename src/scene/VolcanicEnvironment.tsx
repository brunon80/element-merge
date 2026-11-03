import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_R } from '../game/board';
import { circleTexture } from './assets';

export const VOLCANIC_BG = '#241713';

const GROUND_Y = -1.53;
const LAVA_INNER_RADIUS = ARENA_R + 2;
const LAVA_OUTER_RADIUS = ARENA_R + 7;
const LAVA_GROUND_RADIUS = LAVA_OUTER_RADIUS + 68;

interface Instance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

interface VolcanicLayout {
  rocks: Instance[];
  spires: Instance[];
  trunks: Instance[];
  branches: Instance[];
}

interface Volcano {
  angle: number;
  distance: number;
  radius: number;
  height: number;
  rotation: number;
  smoke: boolean;
}

const VOLCANOES: Volcano[] = [
  { angle: -2.91, distance: ARENA_R + 38, radius: 7.5, height: 13, rotation: 0.18, smoke: true },
  { angle: -2.49, distance: ARENA_R + 27, radius: 5.2, height: 9, rotation: -0.12, smoke: false },
  { angle: -2.08, distance: ARENA_R + 44, radius: 9, height: 16, rotation: 0.28, smoke: true },
  { angle: -1.65, distance: ARENA_R + 31, radius: 6.4, height: 11, rotation: -0.2, smoke: false },
  { angle: -1.22, distance: ARENA_R + 40, radius: 8.5, height: 15, rotation: 0.12, smoke: true },
  { angle: -0.78, distance: ARENA_R + 28, radius: 5.8, height: 10, rotation: -0.26, smoke: false },
  { angle: -0.35, distance: ARENA_R + 46, radius: 10.5, height: 19, rotation: 0.08, smoke: true },
  { angle: 0.08, distance: ARENA_R + 33, radius: 7, height: 12, rotation: -0.16, smoke: false },
  { angle: 0.51, distance: ARENA_R + 42, radius: 8, height: 14, rotation: 0.22, smoke: true },
  { angle: 0.94, distance: ARENA_R + 26, radius: 5.5, height: 9.5, rotation: -0.08, smoke: false },
  { angle: 1.37, distance: ARENA_R + 48, radius: 11, height: 20, rotation: 0.16, smoke: true },
  { angle: 1.8, distance: ARENA_R + 34, radius: 7.2, height: 12.5, rotation: -0.24, smoke: false },
  { angle: 2.23, distance: ARENA_R + 43, radius: 9.2, height: 16, rotation: 0.1, smoke: true },
  { angle: 2.66, distance: ARENA_R + 29, radius: 6, height: 10.5, rotation: -0.18, smoke: false },
];

interface VolcanoFeatures {
  body: THREE.BufferGeometry;
  lavaFlows: THREE.BufferGeometry[];
  craterFloorY: number;
}

const VOLCANO_PROFILE: readonly [number, number][] = [
  [0, 1],
  [0.07, 0.96],
  [0.24, 0.81],
  [0.46, 0.63],
  [0.68, 0.45],
  [0.85, 0.32],
  [0.94, 0.26],
  [0.96, 0.22],
  [0.92, 0.17],
  [0.84, 0.12],
  [0.76, 0.07],
];

function createVolcanoFeatures(volcano: Volcano, seed: number): VolcanoFeatures {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const segments = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const baseColor = new THREE.Color('#59463e');
  const ringVariation = Array.from({ length: segments }, () => 0.78 + random() * 0.38);
  const angularRoughness = (angle: number) => {
    const wrappedAngle = THREE.MathUtils.euclideanModulo(angle, Math.PI * 2);
    const segmentPosition = (wrappedAngle / (Math.PI * 2)) * segments;
    const segment = Math.floor(segmentPosition);
    const fraction = segmentPosition - segment;
    const ringNoise = THREE.MathUtils.lerp(
      ringVariation[segment],
      ringVariation[(segment + 1) % segments],
      fraction,
    );
    return (
      ringNoise +
      Math.sin(wrappedAngle * 3 + seed) * 0.035 +
      Math.sin(wrappedAngle * 7 - seed) * 0.018
    );
  };
  const rimDisplacement = (angle: number, height: number) => {
    const ringDisplacement = (ring: number) =>
      ring >= 5 && ring <= 7
        ? Math.sin(angle * 5 + seed * 0.3) * volcano.height * 0.022
        : 0;
    for (let ring = 1; ring < VOLCANO_PROFILE.length; ring++) {
      const [previousHeight] = VOLCANO_PROFILE[ring - 1];
      const [nextHeight] = VOLCANO_PROFILE[ring];
      if (nextHeight <= previousHeight || height < previousHeight || height > nextHeight) continue;
      const mix = (height - previousHeight) / (nextHeight - previousHeight);
      return THREE.MathUtils.lerp(ringDisplacement(ring - 1), ringDisplacement(ring), mix);
    }
    return 0;
  };

  VOLCANO_PROFILE.forEach(([height, radius], ring) => {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const scaledRadius = volcano.radius * radius * angularRoughness(angle);
      positions.push(
        Math.cos(angle) * scaledRadius,
        volcano.height * height + rimDisplacement(angle, height),
        Math.sin(angle) * scaledRadius,
      );
      const shade = ring < 2 ? 0.82 : 0.9 + ringVariation[segment] * 0.13;
      colors.push(baseColor.r * shade, baseColor.g * shade, baseColor.b * shade);

      if (ring < VOLCANO_PROFILE.length - 1) {
        const current = ring * segments + segment;
        const next = ring * segments + ((segment + 1) % segments);
        const upper = (ring + 1) * segments + segment;
        const upperNext = (ring + 1) * segments + ((segment + 1) % segments);
        indices.push(current, upper, next, next, upper, upperNext);
      }
    }
  });

  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  body.setIndex(indices);
  body.computeVertexNormals();

  const radiusAtHeight = (height: number) => {
    for (let index = 1; index < VOLCANO_PROFILE.length; index++) {
      const [nextHeight, nextRadius] = VOLCANO_PROFILE[index];
      const [previousHeight, previousRadius] = VOLCANO_PROFILE[index - 1];
      if (nextHeight <= previousHeight || height < previousHeight || height > nextHeight) continue;
      const mix = (height - previousHeight) / (nextHeight - previousHeight);
      return THREE.MathUtils.lerp(previousRadius, nextRadius, mix);
    }
    return VOLCANO_PROFILE[7][1];
  };

  const lavaFlows = Array.from({ length: 6 }, (_, flowIndex) => {
    const baseAngle =
      (flowIndex / 6) * Math.PI * 2 + (random() - 0.5) * 0.22;
    const rows = 22;
    const flowPositions: number[] = [];
    const flowIndices: number[] = [];
    for (let row = 0; row <= rows; row++) {
      const progress = row / rows;
      const height = 0.94 - progress * 0.82;
      const angle =
        baseAngle +
        Math.sin(progress * 5.3 + seed + flowIndex) * 0.075 +
        Math.sin(progress * 11 + seed * 0.2) * 0.028;
      const surfaceRadius = radiusAtHeight(height);
      const spread = (0.22 + progress * 0.22) / Math.max(volcano.radius * surfaceRadius, 1);
      for (const edge of [-1, 1]) {
        const edgeAngle = angle + spread * edge;
        const edgeRadius =
          volcano.radius * surfaceRadius * angularRoughness(edgeAngle) * 1.004;
        flowPositions.push(
          Math.cos(edgeAngle) * edgeRadius,
          volcano.height * height + rimDisplacement(edgeAngle, height) + 0.055,
          Math.sin(edgeAngle) * edgeRadius,
        );
      }
      if (row < rows) {
        const current = row * 2;
        flowIndices.push(current, current + 1, current + 2, current + 1, current + 3, current + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flowPositions, 3));
    geometry.setIndex(flowIndices);
    geometry.computeVertexNormals();
    return geometry;
  });

  return {
    body,
    lavaFlows,
    craterFloorY: volcano.height * 0.74,
  };
}

function createVolcanicLayout(): VolcanicLayout {
  let state = 0x70c4a11c;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const layout: VolcanicLayout = {
    rocks: [],
    spires: [],
    trunks: [],
    branches: [],
  };

  for (let i = 0; i < 140; i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1 + random() * 23;
    const size = 0.45 + random() * 2.2;
    layout.rocks.push({
      position: [Math.cos(angle) * radius, GROUND_Y + size * 0.34, Math.sin(angle) * radius],
      rotation: [random() * 0.35, random() * Math.PI, random() * 0.35],
      scale: [
        size * (0.8 + random() * 0.45),
        size * (0.45 + random() * 0.48),
        size * (0.65 + random() * 0.5),
      ],
      color: ['#201b1a', '#302321', '#3b2923', '#493027'][i % 4],
    });
  }

  for (let i = 0; i < 38; i++) {
    const angle = i * 2.399963 + (random() - 0.5) * 0.3;
    const radius = ARENA_R + 2 + Math.sqrt(random()) * 20;
    const height = 3.5 + random() * 8.5;
    const width = 0.8 + random() * 1.7;
    layout.spires.push({
      position: [Math.cos(angle) * radius, GROUND_Y + height / 2, Math.sin(angle) * radius],
      rotation: [(random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2],
      scale: [width, height, width * (0.55 + random() * 0.5)],
      color: ['#171515', '#241b1a', '#33211d', '#42271f'][i % 4],
    });
  }

  for (let i = 0; i < 12; i++) {
    const angle = Math.PI + (i / 11) * Math.PI + (random() - 0.5) * 0.14;
    const radius = ARENA_R + 8 + random() * 12;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const height = 7 + random() * 6;
    const trunk = new THREE.Vector3(x, GROUND_Y + height / 2, z);
    layout.trunks.push({
      position: [trunk.x, trunk.y, trunk.z],
      rotation: [(random() - 0.5) * 0.14, random() * Math.PI, (random() - 0.5) * 0.14],
      scale: [0.35 + random() * 0.35, height, 0.35 + random() * 0.35],
      color: ['#211817', '#30201c', '#39241e'][i % 3],
    });
    for (let branch = 0; branch < 3; branch++) {
      const direction = angle + (random() - 0.5) * 1.8;
      const length = 2.5 + random() * 3.5;
      const start = new THREE.Vector3(
        x,
        GROUND_Y + height * (0.48 + random() * 0.42),
        z,
      );
      const end = start.clone().add(
        new THREE.Vector3(Math.cos(direction) * length, 1 + random() * 2.2, Math.sin(direction) * length),
      );
      const vector = end.clone().sub(start);
      const rotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          vector.clone().normalize(),
        ),
      );
      layout.branches.push({
        position: [
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          (start.z + end.z) / 2,
        ],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [0.16 + random() * 0.12, vector.length(), 0.16 + random() * 0.12],
        color: '#281b18',
      });
    }
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

function createEmbers(): THREE.BufferGeometry {
  let state = 0xeab3e25;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const count = 360;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = ARENA_R + 1 + random() * 25;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = GROUND_Y + random() * 15;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function VolcanicEnvironment() {
  const layout = useMemo(createVolcanicLayout, []);
  const embers = useMemo(createEmbers, []);
  const volcanoFeatures = useMemo(
    () => VOLCANOES.map((volcano, index) => createVolcanoFeatures(volcano, 0x71a1 + index * 127)),
    [],
  );
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const spireRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const flameRefs = useRef<THREE.Mesh[]>([]);
  const eruptionRefs = useRef<THREE.Group[]>([]);

  useLayoutEffect(() => {
    applyInstances(rockRef.current, layout.rocks);
    applyInstances(spireRef.current, layout.spires);
    applyInstances(trunkRef.current, layout.trunks);
    applyInstances(branchRef.current, layout.branches);
  }, [layout]);

  useFrame((state, delta) => {
    const positions = embers.getAttribute('position') as THREE.BufferAttribute;
    const values = positions.array as Float32Array;
    for (let i = 0; i < values.length; i += 3) {
      values[i] += Math.sin(state.clock.elapsedTime + values[i + 2]) * delta * 0.6;
      values[i + 1] += delta * (0.8 + (i % 9) * 0.08);
      if (values[i + 1] > 14) values[i + 1] = GROUND_Y;
    }
    positions.needsUpdate = true;
    flameRefs.current.forEach((flame, index) => {
      if (!flame) return;
      const pulse = 0.82 + Math.sin(state.clock.elapsedTime * 4 + index * 1.7) * 0.12;
      flame.scale.set(pulse, 0.8 + pulse * 0.25, pulse);
    });
    eruptionRefs.current.forEach((eruption, index) => {
      if (!eruption) return;
      const pulse = 0.9 + Math.sin(state.clock.elapsedTime * 1.8 + index * 2.1) * 0.1;
      eruption.scale.set(pulse, pulse, pulse);
      eruption.rotation.y = Math.sin(state.clock.elapsedTime * 0.35 + index) * 0.08;
    });
  });

  return (
    <group name="volcanic-environment">
      <mesh position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[LAVA_GROUND_RADIUS, 64]} />
        <meshStandardMaterial
          color="#392b26"
          emissive="#160b08"
          emissiveIntensity={0.08}
          roughness={1}
          flatShading
        />
      </mesh>

      {Array.from({ length: 22 }, (_, index) => {
        const start = (index / 22) * Math.PI * 2 + 0.07;
        const length = 0.17 + (index % 3) * 0.018;
        return (
          <group key={`lava-flow-${index}`}>
            <mesh position={[0, GROUND_Y + 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[LAVA_INNER_RADIUS, LAVA_OUTER_RADIUS, 12, 1, start, length]} />
              <meshStandardMaterial
                color="#b34219"
                emissive="#e53c0c"
                emissiveIntensity={0.75}
                roughness={0.48}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, GROUND_Y + 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry
                args={[LAVA_INNER_RADIUS + 0.3, LAVA_OUTER_RADIUS - 0.55, 12, 1, start + 0.02, length * 0.48]}
              />
              <meshBasicMaterial
                color="#ffc06a"
                transparent
                opacity={0.46}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      <instancedMesh ref={rockRef} args={[undefined, undefined, layout.rocks.length]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.98} flatShading />
      </instancedMesh>
      <instancedMesh ref={spireRef} args={[undefined, undefined, layout.spires.length]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, layout.trunks.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.34, 1, 6]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[undefined, undefined, layout.branches.length]} castShadow>
        <cylinderGeometry args={[0.2, 0.34, 1, 5]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>

      {VOLCANOES.map((volcano, index) => {
        const features = volcanoFeatures[index];
        const position: [number, number, number] = [
          Math.cos(volcano.angle) * volcano.distance,
          GROUND_Y,
          Math.sin(volcano.angle) * volcano.distance,
        ];
        return (
          <group
            key={`active-volcano-${index}`}
            position={position}
            rotation={[0, volcano.rotation, 0]}
          >
            <mesh geometry={features.body} castShadow receiveShadow>
              <meshStandardMaterial
                vertexColors
                color="#ffffff"
                emissive="#21100b"
                emissiveIntensity={0.35}
                roughness={1}
                flatShading
              />
            </mesh>
            {features.lavaFlows.map((geometry, flowIndex) => (
              <mesh key={`lava-river-${flowIndex}`} geometry={geometry}>
                <meshBasicMaterial
                  color={flowIndex % 2 === 0 ? '#ff4b12' : '#ff7921'}
                  toneMapped={false}
                />
              </mesh>
            ))}
            <mesh
              position={[0, features.craterFloorY + 0.04, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[volcano.radius * 0.065, 12]} />
              <meshBasicMaterial color="#ff9a38" toneMapped={false} />
            </mesh>
            <mesh position={[0, features.craterFloorY + 0.08, 0]}>
              <sphereGeometry args={[volcano.radius * 0.055, 9, 6]} />
              <meshStandardMaterial
                color="#ff641b"
                emissive="#ff3b06"
                emissiveIntensity={2}
                toneMapped={false}
                flatShading
              />
            </mesh>
            {volcano.smoke && (
              <group
                ref={(group) => {
                  if (group) eruptionRefs.current[index] = group;
                }}
                position={[0, features.craterFloorY + 0.12, 0]}
              >
                <mesh position={[0, volcano.radius * 0.23, 0]}>
                  <coneGeometry args={[volcano.radius * 0.11, volcano.radius * 0.62, 8]} />
                  <meshStandardMaterial
                    color="#65554e"
                    transparent
                    opacity={0.54}
                    depthWrite={false}
                    roughness={1}
                    flatShading
                  />
                </mesh>
                <mesh position={[0, volcano.radius * 0.59, 0]}>
                  <sphereGeometry args={[volcano.radius * 0.15, 9, 7]} />
                  <meshStandardMaterial
                    color="#72635c"
                    emissive="#1e100b"
                    emissiveIntensity={0.12}
                    transparent
                    opacity={0.64}
                    depthWrite={false}
                    roughness={1}
                    flatShading
                  />
                </mesh>
                <mesh
                  position={[volcano.radius * 0.08, volcano.radius * 0.83, volcano.radius * 0.04]}
                  scale={[1.22, 0.8, 1]}
                >
                  <sphereGeometry args={[volcano.radius * 0.12, 9, 7]} />
                  <meshStandardMaterial
                    color="#544741"
                    emissive="#180c08"
                    emissiveIntensity={0.08}
                    transparent
                    opacity={0.52}
                    depthWrite={false}
                    roughness={1}
                    flatShading
                  />
                </mesh>
                <mesh
                  position={[-volcano.radius * 0.08, volcano.radius * 1.03, -volcano.radius * 0.03]}
                  scale={[1.35, 0.72, 1.1]}
                >
                  <sphereGeometry args={[volcano.radius * 0.1, 8, 6]} />
                  <meshStandardMaterial
                    color="#463c37"
                    transparent
                    opacity={0.42}
                    depthWrite={false}
                    roughness={1}
                    flatShading
                  />
                </mesh>
              </group>
            )}
            {volcano.radius >= 8.5 && (
              <pointLight
                position={[0, features.craterFloorY + 1, 0]}
                color="#ff4b12"
                intensity={18}
                distance={volcano.radius * 2.3}
                decay={2}
              />
            )}
          </group>
        );
      })}

      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2 + 0.22;
        const radius = ARENA_R - 0.7;
        return (
          <group
            key={`fire-brazier-${index}`}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
          >
            <mesh position={[0, 0.32, 0]} castShadow>
              <cylinderGeometry args={[0.75, 0.95, 0.64, 6]} />
              <meshStandardMaterial color="#211817" roughness={0.96} flatShading />
            </mesh>
            <mesh position={[0, 0.76, 0]} castShadow>
              <cylinderGeometry args={[0.48, 0.66, 0.28, 6]} />
              <meshStandardMaterial color="#5a3023" roughness={0.9} flatShading />
            </mesh>
            <mesh
              ref={(mesh) => {
                if (mesh) flameRefs.current[index] = mesh;
              }}
              position={[0, 1.42, 0]}
              castShadow
            >
              <coneGeometry args={[0.4, 1.25, 6]} />
              <meshStandardMaterial
                color="#ff761c"
                emissive="#ff3d00"
                emissiveIntensity={1.3}
                toneMapped={false}
                flatShading
              />
            </mesh>
            <pointLight
              position={[0, 1.3, 0]}
              color="#ff5b16"
              intensity={18}
              distance={9}
              decay={2}
            />
          </group>
        );
      })}

      <points geometry={embers} frustumCulled={false}>
        <pointsMaterial
          map={circleTexture()}
          color="#ff9a3c"
          size={0.24}
          transparent
          opacity={0.82}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
