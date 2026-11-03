import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ARENA_R } from '../game/board';
import { circleTexture } from './assets';

export const UNIVERSE_END_BG = '#080d1e';
const SINGULARITY_POSITION: [number, number, number] = [0, 8, -68];
const ACCRETION_PARTICLE_COUNT = 640;
const ACCRETION_OUTER_RADIUS = 22;
const ACCRETION_INNER_RADIUS = 5.7;

function createAccretionGeometry(): THREE.BufferGeometry {
  let state = 0xacc4e710;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const randomValues = new Float32Array(ACCRETION_PARTICLE_COUNT * 3);
  for (let i = 0; i < ACCRETION_PARTICLE_COUNT; i++) {
    randomValues[i * 3] = random() * Math.PI * 2;
    randomValues[i * 3 + 1] = random();
    randomValues[i * 3 + 2] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(ACCRETION_PARTICLE_COUNT * 3), 3),
  );
  geometry.setAttribute('aRand', new THREE.BufferAttribute(randomValues, 3));
  return geometry;
}

const ACCRETION_DISK_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ACCRETION_DISK_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSpin;
uniform float uInner;
uniform float uOuter;
uniform vec3 uHot;
uniform vec3 uGold;
uniform vec3 uEmber;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float radius = length(c) * 2.0 * uOuter;
  if (radius < uInner || radius > uOuter) discard;

  float angle = atan(c.y, c.x);
  float rate = pow(radius / uInner, -1.5);
  float bandsA = 0.5 + 0.5 * sin((angle + uSpin * rate) * 9.0 + radius * 17.0);
  float bandsB = 0.5 + 0.5 * sin((angle + uSpin * rate) * 4.0 - radius * 6.0 + 2.1);
  float density = 0.35 + 0.65 * (bandsA * 0.6 + bandsB * 0.4);
  vec3 color = mix(uHot, uGold, smoothstep(uInner + 0.7, uOuter * 0.48, radius));
  color = mix(color, uEmber, smoothstep(uOuter * 0.76, uOuter, radius) * 0.45);
  float doppler = 1.0 + 0.28 * cos(angle - 1.0);
  float edge = smoothstep(uInner, uInner + 0.55, radius) *
    (1.0 - smoothstep(uOuter - 1.5, uOuter, radius));
  float alpha = density * edge * 0.62;
  if (!(alpha > 0.002)) discard;
  gl_FragColor = vec4(color * doppler * 1.65, alpha);
}
`;

const ACCRETION_DUST_VERTEX = /* glsl */ `
attribute vec3 aRand;
uniform float uTime;
uniform float uInner;
uniform float uOuter;
uniform vec3 uHot;
uniform vec3 uGold;
uniform vec3 uEmber;
varying float vAlpha;
varying vec3 vColor;
void main() {
  const float TAU = 6.28318;
  float infall = step(0.72, aRand.z);
  float baseRadius = mix(uInner + 0.45, uOuter - 0.8, aRand.z);
  float progress = fract(uTime * (0.055 + aRand.z * 0.035) + aRand.y);
  float radius = mix(baseRadius, uInner + 0.35, infall * progress);
  float omega = 2.4 * pow(uInner / radius, 1.5);
  float angle = aRand.x + uTime * omega;
  float height = infall * progress * progress * 5.2 +
    0.08 * sin(uTime * 1.2 + aRand.y * 9.0);
  vec3 position = vec3(cos(angle) * radius, height, sin(angle) * radius);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  float size = 1.6 + 2.4 * aRand.z;
  gl_PointSize = min(28.0, size * (150.0 / max(20.0, -viewPosition.z)));
  float cycleFade = smoothstep(0.0, 0.08, progress) *
    (1.0 - smoothstep(0.92, 1.0, progress));
  vAlpha = mix(0.7, cycleFade, infall);
  vColor = mix(uHot, uGold, smoothstep(uInner, uOuter * 0.55, radius));
  vColor = mix(vColor, uEmber, smoothstep(uOuter * 0.72, uOuter, radius) * 0.4);
  gl_Position = projectionMatrix * viewPosition;
}
`;

const ACCRETION_DUST_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float distanceFromCenter = length(gl_PointCoord - 0.5);
  float halo = 1.0 - smoothstep(0.06, 0.5, distanceFromCenter);
  float core = 1.0 - smoothstep(0.0, 0.16, distanceFromCenter);
  float alpha = halo * vAlpha * 0.52;
  if (!(alpha > 0.002)) discard;
  gl_FragColor = vec4(vColor * (0.8 + core * 0.9), alpha);
}
`;

interface Fragment {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
}

function createFragments(
  count: number,
  minRadius: number,
  maxRadius: number,
  seed: number,
  sizeScale = 1,
) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const fragments: Fragment[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    const size = 0.22 + random() * 1.15;
    fragments.push({
      position: [
        Math.cos(angle) * radius,
        (random() - 0.5) * (maxRadius > 30 ? 3.2 : 8),
        Math.sin(angle) * radius,
      ],
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      scale: [
        size * (0.7 + random() * 0.7) * sizeScale,
        size * (0.55 + random() * 0.8) * sizeScale,
        size * sizeScale,
      ],
      color: ['#45506b', '#69718b', '#8e8095', '#a28b77', '#383e57'][i % 5],
    });
  }
  return fragments;
}

function applyFragments(mesh: THREE.InstancedMesh | null, fragments: Fragment[]) {
  if (!mesh) return;
  const transform = new THREE.Object3D();
  fragments.forEach((fragment, index) => {
    transform.position.set(...fragment.position);
    transform.rotation.set(...fragment.rotation);
    transform.scale.set(...fragment.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, new THREE.Color(fragment.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function createStars() {
  let state = 0x91e10da5;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const elevation = (random() - 0.2) * Math.PI * 0.76;
    const radius = ARENA_R * (2.1 + random() * 3.2);
    positions[i * 3] = Math.cos(angle) * Math.cos(elevation) * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius * 0.7 + 10;
    positions[i * 3 + 2] = Math.sin(angle) * Math.cos(elevation) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function UniverseEndEnvironment() {
  const orbitRef = useRef<THREE.Group>(null);
  const orbitalDebrisRef = useRef<THREE.InstancedMesh>(null);
  const terrainDebrisRef = useRef<THREE.InstancedMesh>(null);
  const orbitalFragments = useMemo(
    () => createFragments(100, ARENA_R * 1.05, ARENA_R * 1.4, 0x51a7d1, 0.42),
    [],
  );
  const terrainFragments = useMemo(
    () => createFragments(90, ARENA_R + 1.5, ARENA_R + 22, 0x2d0b1e, 0.65),
    [],
  );
  const stars = useMemo(createStars, []);
  const accretion = useMemo(createAccretionGeometry, []);
  const blackHoleRef = useRef<THREE.Mesh>(null);
  const diskMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ACCRETION_DISK_VERTEX,
        fragmentShader: ACCRETION_DISK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uSpin: { value: 0 },
          uInner: { value: ACCRETION_INNER_RADIUS },
          uOuter: { value: ACCRETION_OUTER_RADIUS },
          uHot: { value: new THREE.Color('#fff3d4') },
          uGold: { value: new THREE.Color('#ffd36f') },
          uEmber: { value: new THREE.Color('#e6a05c') },
        },
      }),
    [],
  );
  const dustMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ACCRETION_DUST_VERTEX,
        fragmentShader: ACCRETION_DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uInner: { value: ACCRETION_INNER_RADIUS },
          uOuter: { value: ACCRETION_OUTER_RADIUS },
          uHot: { value: new THREE.Color('#fff3d4') },
          uGold: { value: new THREE.Color('#ffd36f') },
          uEmber: { value: new THREE.Color('#e6a05c') },
        },
      }),
    [],
  );

  useLayoutEffect(() => {
    applyFragments(orbitalDebrisRef.current, orbitalFragments);
    applyFragments(terrainDebrisRef.current, terrainFragments);
  }, [orbitalFragments, terrainFragments]);

  useEffect(() => {
    return () => {
      accretion.dispose();
      diskMaterial.dispose();
      dustMaterial.dispose();
    };
  }, [accretion, diskMaterial, dustMaterial]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (orbitRef.current) orbitRef.current.rotation.y = time * 0.012;
    diskMaterial.uniforms.uTime.value = time;
    diskMaterial.uniforms.uSpin.value = time * 2.4;
    dustMaterial.uniforms.uTime.value = time;
    if (blackHoleRef.current) {
      const pulse = 1 + Math.sin(time * 0.7) * 0.012;
      blackHoleRef.current.scale.setScalar(pulse);
    }
  }, -1);

  return (
    <group name="universe-end-environment">
      <points geometry={stars} frustumCulled={false}>
        <pointsMaterial
          map={circleTexture()}
          color="#b9d8ff"
          size={0.58}
          transparent
          opacity={0.86}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <group ref={orbitRef} position={SINGULARITY_POSITION}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <mesh renderOrder={1}>
            <ringGeometry
              args={[ACCRETION_INNER_RADIUS, ACCRETION_OUTER_RADIUS, 192]}
            />
            <primitive object={diskMaterial} attach="material" />
          </mesh>
          <points
            geometry={accretion}
            material={dustMaterial}
            frustumCulled={false}
            renderOrder={3}
          />
          <mesh ref={blackHoleRef} position={[0, 0, 0]} renderOrder={2}>
            <sphereGeometry args={[5.05, 48, 32]} />
            <meshBasicMaterial color="#010208" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.13, 0]} renderOrder={3}>
            <torusGeometry args={[5.28, 0.12, 8, 128]} />
            <meshBasicMaterial
              color="#fff0d4"
              toneMapped={false}
              transparent
              opacity={0.9}
            />
          </mesh>
          <instancedMesh
            ref={orbitalDebrisRef}
            args={[undefined, undefined, orbitalFragments.length]}
            castShadow
            receiveShadow
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color="#8b8b91"
              roughness={0.8}
              metalness={0.42}
              flatShading
            />
          </instancedMesh>
        </group>
      </group>

      <instancedMesh
        ref={terrainDebrisRef}
        args={[undefined, undefined, terrainFragments.length]}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#687086" roughness={0.94} flatShading />
      </instancedMesh>
      <pointLight
        position={SINGULARITY_POSITION}
        color="#84ceff"
        intensity={310}
        distance={ARENA_R * 3.1}
        decay={2}
      />
      <pointLight
        position={[-ARENA_R * 0.9, 8, -ARENA_R * 0.6]}
        color="#e783d4"
        intensity={95}
        distance={ARENA_R * 2}
        decay={2}
      />
      <pointLight
        position={[ARENA_R * 0.9, 6, -ARENA_R * 0.3]}
        color="#ffb778"
        intensity={80}
        distance={ARENA_R * 1.8}
        decay={2}
      />
    </group>
  );
}
