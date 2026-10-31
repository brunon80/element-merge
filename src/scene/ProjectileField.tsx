import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ElementId, SpeciesId } from '../game/types';
import { getEngine } from '../store/gameStore';
import { circleTexture, flameDropGeometry, getGeometry } from './assets';
import { makeFlameMaterial } from './flameShaders';
import { makeStoneMaterial } from './stoneShaders';
import { makeWaterMaterial } from './waterShaders';
import { makeWindMaterial } from './windShaders';

const MAX_PER_ELEMENT = 56;
const ELEMENTS_ORDER: ElementId[] = ['fire', 'water', 'earth', 'air'];

interface PerElement {
  mesh: THREE.InstancedMesh | null;
  halo: THREE.InstancedMesh | null;
}

function speciesColor(species: SpeciesId): THREE.Color {
  const cache = speciesColor.cache;
  let c = cache.get(species);
  if (!c) {
    // cores distintas por espécie (espécies da árvore com cor própria)
    const map: Record<string, string> = {
      ignis: '#ff5a1f',
      nereia: '#4db4ff',
      golem: '#e0b96a',
      zephyr: '#bfe9ff',
      // Nv.6 — híbridos
      raio: '#ffe14d',
      madeira: '#7fb069',
      magma: '#ff6a1f',
      gelo: '#a8e6ff',
      vapor: '#ffc9a0',
      areia: '#e8d49a',
      // Nv.7 — compostos
      tempestade: '#d0b6ff',
      obsidiana: '#6a4a93',
      pantano: '#6a8f3d',
      plasma: '#ff9ef5',
      nevoa: '#cfe6ee',
      cristal: '#b7a6ff',
      // Nv.8 — avançados
      cosmico: '#9ad0ff',
      geodo: '#c77dff',
      abissal: '#3f6f8f',
      vulcanico: '#ff4d12',
      // Nv.9 — lendários
      astral: '#8fd6ff',
      colosso: '#d98c4a',
      // Nv.10 — primordial
      primordial: '#e8f6ff',
    };
    c = new THREE.Color(map[species] ?? '#ffffff');
    cache.set(species, c);
  }
  return c;
}
speciesColor.cache = new Map<string, THREE.Color>();

const dummy = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const dir = new THREE.Vector3();

/**
 * Projéteis instanciados — os quatro elementos puros têm PROJÉTIL-ASSINATURA
 * desenhado com o mesmo material da criatura, escalando com o nível do
 * atirador (a faísca Nv1 e o meteoro Nv5 não são a mesma bola):
 *  - Ignis: bola de fogo (chama da criatura, orientada pela velocidade);
 *  - Gólem: matacão de pedra com relevo procedural e fissuras de magma,
 *    cambalhota no ar;
 *  - Zéfiro: anel de vento do material do vendaval, alinhado à velocidade;
 *  - Nereia: lança em gota d'água (ponta para frente).
 * Híbridos e o resto usam as silhuetas básicas instanciadas por elemento,
 * com cor por espécie (instanceColor). Todo projétil ganha um halo billboard
 * que cresce com o nível.
 */
export function ProjectileField() {
  const refs = useRef<Record<string, PerElement>>({});
  const flameRef = useRef<THREE.InstancedMesh | null>(null);
  const rockRef = useRef<THREE.InstancedMesh | null>(null);
  const bladeRef = useRef<THREE.InstancedMesh | null>(null);
  const dropRef = useRef<THREE.InstancedMesh | null>(null);

  const geos = useMemo(() => {
    return {
      fire: getGeometry('sphere', [0.17, 10, 8]),
      water: getGeometry('capsule', [0.09, 0.4]),
      earth: getGeometry('dodeca', [0.16]),
      air: getGeometry('torus', [0.16, 0.05, 6, 18]),
    } as Record<ElementId, THREE.BufferGeometry>;
  }, []);

  // geometrias próprias (não usar a cache compartilhada: cada uma precisa do
  // atributo instanciado aSeed para a fase do shader)
  const seedsAttr = () => {
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_ELEMENT), 1);
    seeds.setUsage(THREE.DynamicDrawUsage);
    return seeds;
  };

  const flame = useMemo(() => {
    const geo = flameDropGeometry(0.6, 1.3, 20, 18);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeFlameMaterial({
      cold: '#ff3d0a',
      mid: '#ff8a1e',
      hot: '#ffe6a0',
      amp: 0.2, // fervor forte (a escala 0.55 reduz o deslocamento efetivo)
      alphaMul: 1.0,
      seed: 3.7,
    });
    return { geo, mat, seeds };
  }, []);

  const rock = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.2);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeStoneMaterial({
      rockA: '#b3bcc6',
      rockB: '#454d57',
      crack: '#ff8a3c', // a pedra voa com as fissuras de magma acesas
      amp: 0.05,
      crackGlow: 1.1,
      speck: 0.7,
      seed: 8.3,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const blade = useMemo(() => {
    const geo = new THREE.TorusGeometry(0.17, 0.062, 8, 22);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeWindMaterial({
      cold: '#4d7ca3',
      mid: '#a8d4ea',
      hot: '#f6fbff',
      amp: 0.035, // pequeno o bastante para não rasgar o tubo do anel
      twist: 0.5,
      spin: 6.5, // o anel gira frenético cortando o ar
      bend: 0,
      alphaMul: 1.0,
      soft: 0, // volume cheio: sem fade nas bordas do tubo
      seed: 5.9,
      modelH: 0.5,
    });
    return { geo, mat, seeds };
  }, []);

  const drop = useMemo(() => {
    const geo = flameDropGeometry(0.14, 0.44, 16, 14);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeWaterMaterial({
      deep: '#123a66',
      mid: '#4db4ff',
      foam: '#eaf6ff',
      amp: 0.035,
      swell: 0.05,
      bend: 0,
      alphaMul: 1.25, // projétil precisa ser mais denso que o corpo
      soft: 0,
      foamAmt: 0.25,
      seed: 4.6,
      modelH: 0.5,
    });
    return { geo, mat, seeds };
  }, []);

  useEffect(() => {
    return () => {
      for (const x of [flame, rock, blade, drop]) {
        x.geo.dispose();
        x.mat.dispose();
      }
    };
  }, [flame, rock, blade, drop]);

  useFrame((state) => {
    const eng = getEngine();
    const world = eng?.world;
    const time = world?.time ?? state.clock.elapsedTime;
    const counts: Record<string, number> = { fire: 0, water: 0, earth: 0, air: 0 }; // halo
    const basic: Record<string, number> = { fire: 0, water: 0, earth: 0, air: 0 }; // malha básica
    let flameN = 0;
    let rockN = 0;
    let bladeN = 0;
    let dropN = 0;

    // fervor/time dos materiais compartilhados
    flame.mat.uniforms.uTime.value = time;
    rock.mat.uniforms.uTime.value = time;
    blade.mat.uniforms.uTime.value = time;
    drop.mat.uniforms.uTime.value = time;

    if (world) {
      for (const p of world.projectiles) {
        if (!p.alive) continue;
        const el = p.damageElement;
        const slot = refs.current[el];
        if (!slot?.mesh) continue;
        if (counts[el] >= MAX_PER_ELEMENT) continue;
        const haloIdx = counts[el]++; // halo existe para TODO projétil
        const lv = Math.max(1, Math.min(10, p.ownerLevel ?? 1));
        // assinatura dos puros só existe até Nv.5; trava o crescimento de escala
        const lvSign = Math.min(5, lv);

        const isFlame = el === 'fire' && p.species === 'ignis';
        const isRock = el === 'earth' && p.species === 'golem';
        const isBlade = el === 'air' && p.species === 'zephyr';
        const isDrop = el === 'water' && p.species === 'nereia';

        dummy.position.set(p.pos[0], p.pos[1], p.pos[2]);
        let haloScale = 0.75;
        let signature = false;

        if (isFlame) {
          // ponta da chama para trás (Meteoro): alinha +y com o sentido oposto à velocidade
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize().negate();
            tmpQuat.setFromUnitVectors(up, dir);
            dummy.quaternion.copy(tmpQuat);
          }
          if (flameN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.25 + p.age / 0.12); // nasce pequena e "dispara"
            // dragões Nv5 lançam bolas de fogo bem maiores que a faísca Nv1
            const scale = (0.5 + 0.11 * (lvSign - 1)) * launch;
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            flameRef.current?.setMatrixAt(flameN, dummy.matrix);
            flame.seeds.setX(flameN, ((p.id * 37) % 97) / 7.3);
            flameN++;
            haloScale = scale * 2.4;
            signature = true;
          }
        } else if (isRock) {
          // matacão: cambalhota lenta; pedra Nv5 é quase três vezes a de Nv1
          dummy.rotation.set(time * 3.1 + p.id, time * 2.2, time * 1.5);
          if (rockN < MAX_PER_ELEMENT) {
            const scale = 0.85 + 0.3 * (lvSign - 1);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            rockRef.current?.setMatrixAt(rockN, dummy.matrix);
            rock.seeds.setX(rockN, ((p.id * 41) % 89) / 6.1);
            rockN++;
            haloScale = scale * 1.5;
            signature = true;
          }
        } else if (isBlade) {
          // lâmina de vento: o plano do anel encara o voo (a fenda corta o ar)
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(zAxis, dir);
            dummy.quaternion.copy(tmpQuat);
          }
          if (bladeN < MAX_PER_ELEMENT) {
            const scale = 0.9 + 0.3 * (lvSign - 1);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            bladeRef.current?.setMatrixAt(bladeN, dummy.matrix);
            blade.seeds.setX(bladeN, ((p.id * 53) % 71) / 5.3);
            bladeN++;
            haloScale = scale * 1.6;
            signature = true;
          }
        } else if (isDrop) {
          // lança aquática: a ponta da gota aponta para o alvo (arco balístico)
          const target = eng ? eng.getUnit(p.targetId) : undefined;
          const from = target && target.alive ? target.pos : p.lastTargetPos;
          dir.set(from[0] - p.pos[0], from[1] - p.pos[1], from[2] - p.pos[2]);
          if (dir.lengthSq() > 0.0001) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            dummy.quaternion.copy(tmpQuat);
          }
          if (dropN < MAX_PER_ELEMENT) {
            const scale = 0.8 + 0.26 * (lvSign - 1);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            dropRef.current?.setMatrixAt(dropN, dummy.matrix);
            drop.seeds.setX(dropN, ((p.id * 29) % 79) / 6.7);
            dropN++;
            haloScale = scale * 1.8;
            signature = true;
          }
        }

        if (!signature) {
          // silhueta básica do elemento (híbridos) girando/tombando no ar
          if (el === 'water') {
            const target = eng ? eng.getUnit(p.targetId) : undefined;
            const from = target && target.alive ? target.pos : p.lastTargetPos;
            dir.set(from[0] - p.pos[0], from[1] - p.pos[1], from[2] - p.pos[2]);
            if (dir.lengthSq() > 0.0001) {
              dir.normalize();
              tmpQuat.setFromUnitVectors(up, dir);
              dummy.quaternion.copy(tmpQuat);
            }
          } else if (el === 'earth') {
            dummy.rotation.set(time * 3 + p.id, time * 2.2, 0);
          } else if (el === 'air') {
            dummy.rotation.set(Math.PI / 2, 0, time * 10 + p.id);
          }
          const mIdx = basic[el]++;
          const bscale = 0.85 + 0.12 * (lv - 1);
          dummy.scale.setScalar(bscale);
          dummy.updateMatrix();
          slot.mesh.setMatrixAt(mIdx, dummy.matrix);
          slot.mesh.setColorAt(mIdx, speciesColor(p.species));
          haloScale = bscale * 0.95;
        }

        // halo billboard (todos os projéteis; maior quando o projétil é maior)
        dummy.quaternion.copy(state.camera.quaternion);
        dummy.scale.setScalar(haloScale);
        dummy.updateMatrix();
        slot.halo?.setMatrixAt(haloIdx, dummy.matrix);
        slot.halo?.setColorAt(haloIdx, speciesColor(p.species));
      }
    }

    for (const el of ELEMENTS_ORDER) {
      const slot = refs.current[el];
      if (!slot?.mesh) continue;
      slot.mesh.count = basic[el];
      slot.mesh.instanceMatrix.needsUpdate = true;
      if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
      if (slot.halo) {
        slot.halo.count = counts[el];
        slot.halo.instanceMatrix.needsUpdate = true;
        if (slot.halo.instanceColor) slot.halo.instanceColor.needsUpdate = true;
      }
    }

    for (const [mesh, n, seeds] of [
      [flameRef.current, flameN, flame.seeds],
      [rockRef.current, rockN, rock.seeds],
      [bladeRef.current, bladeN, blade.seeds],
      [dropRef.current, dropN, drop.seeds],
    ] as const) {
      if (!mesh) continue;
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (n > 0) seeds.needsUpdate = true;
    }
  });

  return (
    <group>
      {ELEMENTS_ORDER.map((el) => (
        <group key={el}>
          <instancedMesh
            ref={(m) => {
              if (m) refs.current[el] = { ...(refs.current[el] ?? {}), mesh: m };
            }}
            args={[geos[el], undefined, MAX_PER_ELEMENT]}
            frustumCulled={false}
          >
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh
            ref={(m) => {
              if (m) refs.current[el] = { ...(refs.current[el] ?? {}), halo: m };
            }}
            args={[getGeometry('plane', [1, 1]), undefined, MAX_PER_ELEMENT]}
            frustumCulled={false}
          >
            <meshBasicMaterial
              map={circleTexture()}
              toneMapped={false}
              transparent
              opacity={0.32}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </instancedMesh>
        </group>
      ))}
      {/* Ignis: a MESMA chama da criatura, em instância */}
      <instancedMesh
        ref={(m) => {
          flameRef.current = m;
        }}
        args={[flame.geo, flame.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Gólem: a MESMA pedra da criatura (fissuras acesas), cambalhoteando */}
      <instancedMesh
        ref={(m) => {
          rockRef.current = m;
        }}
        args={[rock.geo, rock.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Zéfiro: o MESMO vento da criatura, anel cortando o ar */}
      <instancedMesh
        ref={(m) => {
          bladeRef.current = m;
        }}
        args={[blade.geo, blade.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Nereia: a MESMA água da criatura, lança em gota */}
      <instancedMesh
        ref={(m) => {
          dropRef.current = m;
        }}
        args={[drop.geo, drop.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
    </group>
  );
}
