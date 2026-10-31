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
import { makeArcMaterial, makeCoreMaterial } from './lightningShaders';
import { makeWoodMaterial } from './woodShaders';
import { makeIceMaterial } from './iceShaders';

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
const rollQuat = new THREE.Quaternion();
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
 *  - Raio (Nv.6, árvore): a CORRENTE elétrica — fio aditivo zigue-zague do
 *    material de arco da criatura alinhado à velocidade, com o núcleo de
 *    plasma dourado na cabeça (os dois clonam sozinhos nos respingos de
 *    corrente, virando mini-relâmpagos).
 *  - Madeira (Nv.6, árvore): a SEMENTE — matacão de casca com seiva esmeralda
 *    acesa, cambalhoteando no ar (o MESMO shader da criatura, padrão golem).
 *  - Magma (Nv.6, árvore): o BLOCO DE LAVA — basalto quase preto com rios
 *    largos de lava aceso e um coração de plasma derretido no miolo, também
 *    cambalhota (padrão golem, paleta ígnea).
 *  - Gelo (Nv.6, árvore): a ESTACA — icicle comprido do MESMO cristal da
 *    criatura (branco translúcido/reflexivo, trincas internas acesas), com a
 *    ponta encarando o voo e girando no próprio eixo.
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
  const boltRef = useRef<THREE.InstancedMesh | null>(null);
  const boltCoreRef = useRef<THREE.InstancedMesh | null>(null);
  const seedRef = useRef<THREE.InstancedMesh | null>(null);
  const boulderRef = useRef<THREE.InstancedMesh | null>(null);
  const heartRef = useRef<THREE.InstancedMesh | null>(null);
  const spikeRef = useRef<THREE.InstancedMesh | null>(null);

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

  const bolt = useMemo(() => {
    // geometrias DA CACHE compartilhada não servem: precisam do aSeed por
    // instância (fase do traço), então clonamos as formas base
    const geo = new THREE.CylinderGeometry(0.07, 0.05, 0.8, 6, 1, true);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeArcMaterial({
      gold: '#ffc63a', // acento dourado da corrente
      white: '#dff2ff',
      cool: '#2fa4ff', // o traço principal é o azul elétrico da referência
      coolAmt: 0.78,
      jitter: 1.2, // zigue-zague de ±~8cm no fio de 14cm de diâmetro
      dash: 26, // traços curtos correndo ao longo da corrente
      flow: 9,
      seed: 6.2,
    });
    return { geo, mat, seeds };
  }, []);

  const boltCore = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.13, 1);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeCoreMaterial({
      gold: '#ffcf4d', // cabeça quente dourada
      white: '#fff8d6',
      cool: '#5fc8ff', // orla azul elétrica na borda do plasma
      amp: 0.045,
      seed: 2.9,
    });
    return { geo, mat, seeds };
  }, []);

  const seedPod = useMemo(() => {
    // semente do ancião: matacão de casca com seiva esmeralda acesa (o MESMO
    // shader da criatura — igual ao matacão de pedra do golem)
    const geo = new THREE.DodecahedronGeometry(0.18);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeWoodMaterial({
      barkA: '#8a6a3f',
      barkB: '#3c2c1a',
      moss: '#5f8f4f',
      sap: '#3ee27f',
      amp: 0.05,
      sapGlow: 1.6,
      speck: 0.8,
      seed: 9.1,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const lavaBoulder = useMemo(() => {
    // bloco de lava do vulcão: basalto quase preto com rios largos de lava
    // aceso (o MESMO shader de pedra do corpo) e um coração derretido de
    // plasma quente por dentro — o análogo ígneo do matacão do golem
    const geo = new THREE.DodecahedronGeometry(0.2);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeStoneMaterial({
      rockA: '#42322e',
      rockB: '#140f10',
      crack: '#ff6a1f',
      amp: 0.05,
      crackGlow: 2.2,
      crackScale: 1.25,
      crackWidth: 0.04,
      crackBoost: 1.15,
      speck: 0.3,
      seed: 4.4,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const lavaHeart = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.11, 1);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeCoreMaterial({
      gold: '#ff5a1f', // o fogo da lava (mesma paleta do núcleo da cratera)
      white: '#ffd08a',
      cool: '#ffcf7a', // orla quente (nada de azul no magma)
      amp: 0.04,
      seed: 3.3,
    });
    return { geo, mat, seeds };
  }, []);

  const iceSpike = useMemo(() => {
    // estaca de gelo do Gelo: icicle comprido com a MESMA aparência da
    // criatura (cristal branco translúcido/reflexivo com trincas internas
    // acesas) — a ponta encara o alvo e ela roda de leve no eixo do voo
    const geo = new THREE.ConeGeometry(0.1, 0.72, 6);
    geo.translate(0, -0.06, 0); // empurra o corpo pra trás da ponta
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeIceMaterial({
      iceA: '#f6fbff',
      iceB: '#a8cfe6',
      crack: '#d8f2ff',
      amp: 0.025,
      crackGlow: 1.5,
      crackScale: 1.6,
      crackWidth: 0.024,
      alpha: 0.85,
      sparkle: 1.3,
      seed: 7.2,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  useEffect(() => {
    return () => {
      for (const x of [flame, rock, blade, drop, bolt, boltCore, seedPod, lavaBoulder, lavaHeart, iceSpike]) {
        x.geo.dispose();
        x.mat.dispose();
      }
    };
  }, [flame, rock, blade, drop, bolt, boltCore, seedPod, lavaBoulder, lavaHeart, iceSpike]);

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
    let boltN = 0;
    let seedN = 0;
    let boulderN = 0;
    let spikeN = 0;

    // fervor/time dos materiais compartilhados
    flame.mat.uniforms.uTime.value = time;
    rock.mat.uniforms.uTime.value = time;
    blade.mat.uniforms.uTime.value = time;
    drop.mat.uniforms.uTime.value = time;
    bolt.mat.uniforms.uTime.value = time;
    boltCore.mat.uniforms.uTime.value = time;
    seedPod.mat.uniforms.uTime.value = time;
    seedPod.mat.uniforms.uSap.value = 0.6 + 0.2 * Math.sin(time * 2.4);
    lavaBoulder.mat.uniforms.uTime.value = time;
    // o bloco voa com as fissuras ao máximo (a lava do projétil está fresca)
    lavaBoulder.mat.uniforms.uCharge.value = 0.8 + 0.2 * Math.sin(time * 3.1);
    lavaHeart.mat.uniforms.uTime.value = time;
    iceSpike.mat.uniforms.uTime.value = time;
    // a estaca voa "carregada": as trincas internas ficam acesas
    iceSpike.mat.uniforms.uCharge.value = 0.55 + 0.25 * Math.sin(time * 4.2);

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
        const isBolt = p.species === 'raio';
        const isSeed = p.species === 'madeira';
        const isBoulder = p.species === 'magma';
        const isSpike = p.species === 'gelo';

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
        } else if (isBolt) {
          // CORRENTE elétrica do Raio: o fio de arco (cilindro casca aberto)
          // esticado ao longo da velocidade — é um segimento de relâmpago
          // zigue-zague com traços correndo, não uma bolinha
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            dummy.quaternion.copy(tmpQuat);
          }
          if (boltN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.3 + p.age / 0.1); // estica ao disparar
            const scale = (0.8 + 0.14 * (lv - 6)) * launch;
            dummy.scale.set(scale, scale * (1.1 + Math.min(1, p.age * 3) * 0.5), scale);
            dummy.updateMatrix();
            boltRef.current?.setMatrixAt(boltN, dummy.matrix);
            bolt.seeds.setX(boltN, ((p.id * 61) % 83) / 7.1);
            // núcleo de plasma dourado na cabeça da corrente
            dummy.quaternion.identity();
            dummy.scale.setScalar(scale * (0.9 + 0.12 * (lv - 6)));
            dummy.updateMatrix();
            boltCoreRef.current?.setMatrixAt(boltN, dummy.matrix);
            boltCore.seeds.setX(boltN, ((p.id * 17) % 71) / 5.9);
            boltN++;
            haloScale = scale * 1.4;
            signature = true;
          }
        } else if (isSeed) {
          // semente do ancião: cambalhota pesada no ar (o mesmo porte do
          // matacão do golem), casca rachada de seiva esmeralda acesa
          dummy.rotation.set(time * 2.6 + p.id, time * 1.9, time * 1.1 + p.id * 0.7);
          if (seedN < MAX_PER_ELEMENT) {
            const scale = 0.9 + 0.1 * (lv - 6);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            seedRef.current?.setMatrixAt(seedN, dummy.matrix);
            seedPod.seeds.setX(seedN, ((p.id * 59) % 83) / 6.7);
            seedN++;
            haloScale = scale * 1.6;
            signature = true;
          }
        } else if (isBoulder) {
          // bloco de lava do vulcão: cambalhota pesada como o matacão do
          // golem, mas o coração de plasma gira junto e as fissuras vão
          // esfriando em falso no ar (uCharge já respira no material)
          dummy.rotation.set(time * 2.9 + p.id, time * 2.1, time * 1.4 + p.id * 0.5);
          if (boulderN < MAX_PER_ELEMENT) {
            const scale = 0.9 + 0.12 * (lv - 6);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            boulderRef.current?.setMatrixAt(boulderN, dummy.matrix);
            lavaBoulder.seeds.setX(boulderN, ((p.id * 67) % 79) / 6.3);
            // coração derretido no miolo do bloco
            dummy.rotation.set(-time * 1.7, time * 2.3 + p.id, 0);
            dummy.scale.setScalar(scale * (0.95 + 0.05 * Math.sin(time * 5 + p.id)));
            dummy.updateMatrix();
            heartRef.current?.setMatrixAt(boulderN, dummy.matrix);
            lavaHeart.seeds.setX(boulderN, ((p.id * 23) % 67) / 5.7);
            boulderN++;
            haloScale = scale * 1.7;
            signature = true;
          }
        } else if (isSpike) {
          // estaca do glaciar: a ponta encara o voo ( lança de gelo) e ela
          // gira de leve no próprio eixo — o brilho reflexivo varre as facetas
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            // rola de leve no próprio eixo: o reflexo varre as facetas do gelo
            rollQuat.setFromAxisAngle(up, time * 2.4 + p.id);
            tmpQuat.multiply(rollQuat);
            dummy.quaternion.copy(tmpQuat);
          }
          if (spikeN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.35 + p.age / 0.1); // cresce ao disparar
            const scale = (0.9 + 0.1 * (lv - 6)) * launch;
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            spikeRef.current?.setMatrixAt(spikeN, dummy.matrix);
            iceSpike.seeds.setX(spikeN, ((p.id * 71) % 83) / 6.9);
            spikeN++;
            haloScale = scale * 1.3;
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
      [boltRef.current, boltN, bolt.seeds],
      [boltCoreRef.current, boltN, boltCore.seeds],
      [seedRef.current, seedN, seedPod.seeds],
      [boulderRef.current, boulderN, lavaBoulder.seeds],
      [heartRef.current, boulderN, lavaHeart.seeds],
      [spikeRef.current, spikeN, iceSpike.seeds],
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
      {/* Raio: o MESMO arco elétrico da criatura — a corrente em voo */}
      <instancedMesh
        ref={(m) => {
          boltRef.current = m;
        }}
        args={[bolt.geo, bolt.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Raio: núcleo de plasma dourado na cabeça da corrente */}
      <instancedMesh
        ref={(m) => {
          boltCoreRef.current = m;
        }}
        args={[boltCore.geo, boltCore.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Madeira: a MESMA casca com seiva da criatura — semente cambalhota */}
      <instancedMesh
        ref={(m) => {
          seedRef.current = m;
        }}
        args={[seedPod.geo, seedPod.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Magma: o MESMO basalto do vulcão — bloco de lava cambalhota */}
      <instancedMesh
        ref={(m) => {
          boulderRef.current = m;
        }}
        args={[lavaBoulder.geo, lavaBoulder.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Magma: coração de plasma derretido no miolo do bloco */}
      <instancedMesh
        ref={(m) => {
          heartRef.current = m;
        }}
        args={[lavaHeart.geo, lavaHeart.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Gelo: o MESMO cristal da criatura — estaca com a ponta no alvo */}
      <instancedMesh
        ref={(m) => {
          spikeRef.current = m;
        }}
        args={[iceSpike.geo, iceSpike.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
    </group>
  );
}
