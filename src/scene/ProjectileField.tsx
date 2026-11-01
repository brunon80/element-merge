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
import { plugArenaEnv } from './envProbe';
import { makeIceMaterial } from './iceShaders';
import { makeSteamMaterial } from './steamShaders';

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
      obsidiana: '#8f5cff',
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
 *  - Tempestade (Nv.7, árvore): o DARDO de relâmpago — casca de arco LILÁS
 *    (o MESMO material dos mastros da muralha) com o núcleo de plasma aceso
 *    na cabeça e um GRODO de granizo congelado colado nela: o dardo chega
 *    escoltado por gelo (a marca fogo+água+ar).
 *  - Obsidiana (Nv.7, árvore): a FARPA DE VIDRO — lasca conchoidal do MESMO
 *    vidro negro do corpo (breu com faceta violeta e brasa encapsulada na
 *    costura), tombando PESADA no ar: o arremesso heavy da fortaleza não é
 *    bola nem raio, é um caco de vidro vulcânico girando devagar.
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
  const jetRef = useRef<THREE.InstancedMesh | null>(null);
  const jetCoreRef = useRef<THREE.InstancedMesh | null>(null);
  const blastRef = useRef<THREE.InstancedMesh | null>(null);
  const blastCoreRef = useRef<THREE.InstancedMesh | null>(null);
  const stormRef = useRef<THREE.InstancedMesh | null>(null);
  const stormCoreRef = useRef<THREE.InstancedMesh | null>(null);
  const hailRef = useRef<THREE.InstancedMesh | null>(null);
  const shardRef = useRef<THREE.InstancedMesh | null>(null);

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
      jitter: 0.08, // zigue-zague de ±8cm no fio de 14cm de diâmetro (1.2 era
                    // o ouriço de estilhaços — jitter é em unidades de mundo)
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
    const geo = new THREE.ConeGeometry(0.15, 1.05, 8, 5); // densa como o corpo
    // e GRANDE: na escala antiga ela sumia como um pontinho cruzando a arena
    geo.translate(0, -0.1, 0); // empurra o corpo pra trás da ponta
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeIceMaterial({
      iceA: '#f6fbff',
      iceB: '#a8cfe6',
      crack: '#d8f2ff',
      amp: 0.025,
      crackGlow: 1.5,
      crackScale: 2.6, // facetas pequenas do icicle: trincas curtas e densas
      crackWidth: 0.06,
      alpha: 0.85,
      bump: 1.2, // girando em voo, o reflexo e o spec dançam nas facetas
      reflPow: 130,
      envMix: 0.6, // espelho que quebra a luz da arena em pleno voo
      sparkle: 1.3,
      seed: 7.2,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const steamJet = useMemo(() => {
    // rajada do Vapor: cunha de VAPOR escaldante (a casca do cone abre no
    // choque de proa, o fiapo estreito fica na cauda) com o MESMO shader da
    // nuvem da criatura — alfa em ruído correndo, a pluma se desfaz em voo
    const geo = new THREE.CylinderGeometry(0.3, 0.04, 0.95, 14, 4, true);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeSteamMaterial({
      cool: '#f2f7fb',
      warm: '#ffcf9e',
      hot: '#fff0dd',
      amp: 0.05,
      alpha: 0.85, // projétil precisa ser mais denso que o corpo
      swirl: 1.5, // a pluma rasga em fiapos no voo
      seed: 5.1,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const jetCore = useMemo(() => {
    // o núcleo: um nódulo de água em ebulição na cabeça da pluma (o MESMO
    // material fervente da boca da caldeira — paleta água, não plasma)
    const geo = new THREE.IcosahedronGeometry(0.15, 2); // denso (anti low-poly)
    geo.translate(0, 0.3, 0);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeCoreMaterial({
      gold: '#ffe0b0', // a gota em ebulição (mesma paleta da boca da caldeira)
      white: '#fff8ec',
      cool: '#cfe8ff',
      amp: 0.06,
      seed: 3.7,
    });
    return { geo, mat, seeds };
  }, []);

  const sandBlast = useMemo(() => {
    // rajada da Areia: LUFA de grão em turbilhão (casca de cone com o MESMO
    // shader de vento do véu do gênio, paleta do deserto) — o topo largo é o
    // choque de proa no alvo e o fiapo fino é o rastro de grão
    const geo = new THREE.CylinderGeometry(0.3, 0.06, 0.85, 14, 4, true);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeWindMaterial({
      cold: '#573d18',
      mid: '#a3783a',
      hot: '#d9b26a', // teto creme (a regra anti-branco-toalha do véu vale
      // p/ a lufa em voo: fita clara é creme-ocre, nunca #ffe*)
      amp: 0.045, // pequeno p/ não rasgar a casca do cone
      twist: 0.4,
      spin: 7.5, // o grão gira frenético (é a LÂMINA de grãos cortantes)
      bend: 0,
      alphaMul: 1.25, // projétil denso: legível atravessando a arena
      soft: 0,
      seed: 6.3,
      phase: 2.2,
      yOff: 0,
      modelH: 0.85,
    });
    return { geo, mat, seeds };
  }, []);

  const sandCore = useMemo(() => {
    // o núcleo compactado no miolo da lufa: pedra-areia ocre com trincas
    // âmbar (o MESMO shader de pedra do corpo, paleta arenito) — o disparo
    // tem um punho SÓLIDO de areia compacta envolta pelo vendaval
    const geo = new THREE.DodecahedronGeometry(0.14, 1); // denso (anti low-poly)
    geo.translate(0, 0.3, 0);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeStoneMaterial({
      rockA: '#e0bd78',
      rockB: '#6e4a16',
      crack: '#ffbe55',
      amp: 0.035,
      crackGlow: 1.4,
      crackScale: 1.6,
      crackWidth: 0.03,
      speck: 0.8,
      seed: 5.9,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const stormBolt = useMemo(() => {
    // dardo da Tempestade: o MESMO arco dos mastros da muralha (material de
    // relâmpago) na paleta LILÁS da espécie (= a cor do projétil no motor,
    // #d0b6ff) — fio zigue-zague com traços correndo, o ouro é só a ponta
    const geo = new THREE.CylinderGeometry(0.07, 0.05, 0.8, 6, 1, true);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeArcMaterial({
      gold: '#ffe9c4', // faísca quente na cabeça (quase branca: o dardo é lilás)
      white: '#f6f1ff',
      cool: '#d0b6ff', // o lilás-relâmpago da tempestade (mesma cor do motor)
      coolAmt: 0.85,
      jitter: 0.07, // jitter em unidades de mundo: tem que couber no corpo do
                    // fio (r 0.05-0.07) — 1.0 estouraria em ouriço (a lição
                    // do print da muralha)
      dash: 30, // traço miúdo correndo ao longo do fio
      flow: 11,
      seed: 4.6,
    });
    return { geo, mat, seeds };
  }, []);

  const stormCore = useMemo(() => {
    // plasma lilás na cabeça do dardo (o MESMO core dos arcos internos do
    // muro — paleta trovoada, não-aditivo por natureza)
    const geo = new THREE.IcosahedronGeometry(0.14, 2); // denso (anti low-poly)
    geo.translate(0, 0.3, 0);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeCoreMaterial({
      gold: '#d8b2ff', // o lilás da trovoada (mesma paleta da brasa do muro)
      white: '#f6f0ff',
      cool: '#8f9cff', // orla azul-noturna no plasma
      amp: 0.05,
      seed: 6.9,
    });
    return { geo, mat, seeds };
  }, []);

  const stormHail = useMemo(() => {
    // grodo de granizo colado na cabeça do dardo: o MESMO gelo do granizo
    // da muralha (cristal translúcido com veios lilás acesos) — a marca de
    // que a tempestade é também ÁGUA congelada caindo
    const geo = new THREE.OctahedronGeometry(0.17, 1); // denso (anti low-poly)
    geo.scale(0.8, 1.6, 0.8); // grodo longo: a quina encara o voo
    geo.translate(0, 0.44, 0);
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeIceMaterial({
      iceA: '#e2ecff',
      iceB: '#93aed6',
      crack: '#d0b6ff', // veio lilás (o granizo da muralha é da mesma fornada)
      amp: 0.02,
      crackGlow: 1.3,
      crackScale: 2.6, // facetas pequenas: trincas curtas e densas
      crackWidth: 0.05,
      alpha: 0.78,
      bump: 1.2,
      reflPow: 130,
      envMix: 0.55, // o reflexo real da arena dançando em pleno voo
      sparkle: 1.2,
      seed: 8.4,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  const obsFlake = useMemo(() => {
    // lasca da Obsidiana: FARPA CONCHOIDAL de vidro vulcânico com o MESMO
    // material do corpo (breu com brilho violeta nas facetas + brasa
    // ENCAPSULADA acesa nas costuras). É o arremesso heavy da fortaleza: a
    // quina encara o voo e ela TOMBA devagar no ar (vidro grosso é pesado)
    const geo = new THREE.OctahedronGeometry(0.24, 1); // densa (anti low-poly)
    geo.scale(0.8, 1.95, 0.5); // lasca alongada e achatada (fratura de vidro)
    const seeds = seedsAttr();
    geo.setAttribute('aSeed', seeds);
    const mat = makeIceMaterial({
      iceA: '#332c47', // breu com o violeta da faceta (o albedo nunca lavanda)
      iceB: '#150f22',
      crack: '#8f5cff', // a brasa presa no vidro (mesma cor do motor/rig/FX)
      amp: 0.018, // pequeno p/ não esburacar a lasca
      crackGlow: 1.6,
      crackScale: 2.2, // faceta miúda: trincas curtas e densas
      crackWidth: 0.055,
      alpha: 0.9,
      bump: 1.0,
      reflPow: 150, // vidro polido: specular bem pontual
      envMix: 0.6, // tombando, cada faceta espelha a arena
      sparkle: 0.8,
      seed: 6.1,
      breath: 0.4,
    });
    return { geo, mat, seeds };
  }, []);

  useEffect(() => {
    return () => {
      for (const x of [flame, rock, blade, drop, bolt, boltCore, seedPod, lavaBoulder, lavaHeart, iceSpike, steamJet, jetCore, sandBlast, sandCore, stormBolt, stormCore, stormHail, obsFlake]) {
        x.geo.dispose();
        x.mat.dispose();
      }
    };
  }, [flame, rock, blade, drop, bolt, boltCore, seedPod, lavaBoulder, lavaHeart, iceSpike, steamJet, jetCore, sandBlast, sandCore, stormBolt, stormCore, stormHail, obsFlake]);

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
    let jetN = 0;
    let blastN = 0;
    let stormN = 0;
    let hailN = 0;
    let flakeN = 0;

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
    steamJet.mat.uniforms.uTime.value = time;
    // a pluma voa incandescente: o vapor do jato está fresco saído da fornalha
    steamJet.mat.uniforms.uCharge.value = 0.45 + 0.15 * Math.sin(time * 4.4);
    jetCore.mat.uniforms.uTime.value = time;
    jetCore.mat.uniforms.uCharge.value = 0.7 + 0.2 * Math.sin(time * 3.2);
    sandBlast.mat.uniforms.uTime.value = time;
    // a lufa voa a pleno vendaval (uFlare acelera as fitas de grão)
    sandBlast.mat.uniforms.uFlare.value = 0.55 + 0.2 * Math.sin(time * 5.1);
    sandCore.mat.uniforms.uTime.value = time;
    stormBolt.mat.uniforms.uTime.value = time;
    // o dardo voa a plena carga: traço grosso e fluxo nervoso (é um estalo
    // em voo, não um fio morto)
    stormBolt.mat.uniforms.uCharge.value = 0.7 + 0.25 * Math.sin(time * 6.2);
    stormCore.mat.uniforms.uTime.value = time;
    stormCore.mat.uniforms.uCharge.value = 0.75 + 0.2 * Math.sin(time * 4.8);
    stormHail.mat.uniforms.uTime.value = time;
    // o granizo voa trincado de frio: veios acesos por dentro
    stormHail.mat.uniforms.uCharge.value = 0.5 + 0.2 * Math.sin(time * 3.6);
    obsFlake.mat.uniforms.uTime.value = time;
    // a lasca voa com a brasa do interior acesa (o fogo vulcânico encapsulado
    // no vidro — a assinatura da espécie, NUNCA aditivo)
    obsFlake.mat.uniforms.uCharge.value = 0.6 + 0.25 * Math.sin(time * 2.7);
    // pluga o cubemap real da arena no cristal (captura feita uma vez pelo
    // IceRig; idempotente e barato — teste de identidade ignora o resto)
    plugArenaEnv(state.gl, [iceSpike.mat, stormHail.mat, obsFlake.mat]);
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
        const isJet = p.species === 'vapor';
        const isBlast = p.species === 'areia';
        const isStorm = p.species === 'tempestade';
        const isFlake = p.species === 'obsidiana';

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
        } else if (isJet) {
          // rajada do Vapor: a pluma encara o alvo com o topo largo (o choque
          // de proa) e o fiapo fino na cauda; enrola de leve no eixo do voo
          // (a coluna de vapor girando — vórtice de escoamento)
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            rollQuat.setFromAxisAngle(up, time * 1.8 + p.id * 2.1);
            tmpQuat.multiply(rollQuat);
            dummy.quaternion.copy(tmpQuat);
          }
          if (jetN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.3 + p.age / 0.08); // a pluma infla ao sair
            const scale = (0.9 + 0.12 * (lv - 6)) * launch;
            dummy.scale.set(scale, scale * (1 + Math.min(1, p.age * 2) * 0.55), scale);
            dummy.updateMatrix();
            jetRef.current?.setMatrixAt(jetN, dummy.matrix);
            steamJet.seeds.setX(jetN, ((p.id * 61) % 79) / 6.1);
            // nódulo fervente na cabeça da pluma (gira com ela)
            jetCoreRef.current?.setMatrixAt(jetN, dummy.matrix);
            jetCore.seeds.setX(jetN, ((p.id * 43) % 71) / 5.3);
            jetN++;
            haloScale = scale * 1.9; // a nuvem é larga — halo de vapor
            signature = true;
          }
        } else if (isBlast) {
          // rajada da Areia: a lufa de grão encara o alvo com o choque de
          // proa largo e gira no eixo do voo (é uma FRESA de grãos cortantes
          // — o spin do projétil é a lâmina); o núcleo compactado gira junto
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            rollQuat.setFromAxisAngle(up, time * 6.5 + p.id * 2.3);
            tmpQuat.multiply(rollQuat);
            dummy.quaternion.copy(tmpQuat);
          }
          if (blastN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.35 + p.age / 0.07); // a lufa infla ao sair
            const scale = (0.9 + 0.12 * (lv - 6)) * launch;
            dummy.scale.set(scale, scale * (1 + Math.min(1, p.age * 2.2) * 0.5), scale);
            dummy.updateMatrix();
            blastRef.current?.setMatrixAt(blastN, dummy.matrix);
            sandBlast.seeds.setX(blastN, ((p.id * 51) % 79) / 6.7);
            blastCoreRef.current?.setMatrixAt(blastN, dummy.matrix);
            sandCore.seeds.setX(blastN, ((p.id * 47) % 71) / 5.9);
            blastN++;
            haloScale = scale * 1.7; // o vendaval em torno da lufa
            signature = true;
          }
        } else if (isStorm) {
          // dardo da muralha: o fio de arco LILÁS esticado na velocidade (o
          // mesmo traje dos mastros) — e o grodo de granizo girando na cabeça
          // (o gelo escoltando o relâmpago: a marca água+ar da espécie)
          dir.set(p.vel[0], p.vel[1], p.vel[2]);
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            tmpQuat.setFromUnitVectors(up, dir);
            rollQuat.setFromAxisAngle(up, time * 3.2 + p.id * 2.4);
            tmpQuat.multiply(rollQuat);
            dummy.quaternion.copy(tmpQuat);
          }
          if (stormN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.3 + p.age / 0.09); // o estalo infla ao sair
            const scale = (0.85 + 0.12 * (lv - 7)) * launch;
            dummy.scale.set(scale, scale * (1.15 + Math.min(1, p.age * 3) * 0.55), scale);
            dummy.updateMatrix();
            stormRef.current?.setMatrixAt(stormN, dummy.matrix);
            stormBolt.seeds.setX(stormN, ((p.id * 67) % 83) / 7.3);
            // núcleo de plasma lilás na cabeça (esfera: sem rotação)
            dummy.quaternion.identity();
            dummy.scale.setScalar(scale * (0.9 + 0.1 * (lv - 7)));
            dummy.updateMatrix();
            stormCoreRef.current?.setMatrixAt(stormN, dummy.matrix);
            stormCore.seeds.setX(stormN, ((p.id * 19) % 71) / 6.1);
            stormN++;
            haloScale = scale * 1.5;
            signature = true;
          }
          if (hailN < MAX_PER_ELEMENT) {
            // grodo tombando no eixo do voo: o reflexo quebra nas facetas
            dummy.rotation.set(time * 4.1 + p.id, time * 2.7 + p.id * 1.3, time * 1.9);
            dummy.scale.setScalar(0.9 + 0.1 * (lv - 7));
            dummy.updateMatrix();
            hailRef.current?.setMatrixAt(hailN, dummy.matrix);
            stormHail.seeds.setX(hailN, ((p.id * 53) % 73) / 6.3);
            hailN++;
          }
        } else if (isFlake) {
          // lasca da fortaleza: vidro grossO arremessado TOMBA de ponta-cabeça
          // no ar (cambalhota PESADA, bem mais lenta que a do matacão do golem
          // — a inércia do vidro), e cada faceta espelha a arena ao virar
          dummy.rotation.set(time * 1.5 + p.id, time * 1.05 + p.id * 0.7, 0.6 + time * 0.5);
          if (flakeN < MAX_PER_ELEMENT) {
            const launch = Math.min(1, 0.3 + p.age / 0.12); // o peso demora a sair
            const scale = (0.95 + 0.12 * (lv - 7)) * launch;
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            shardRef.current?.setMatrixAt(flakeN, dummy.matrix);
            obsFlake.seeds.setX(flakeN, ((p.id * 43) % 79) / 6.7);
            flakeN++;
            haloScale = scale * 1.35; // halo contido: o brilho é da faceta, não da bola
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
      [jetRef.current, jetN, steamJet.seeds],
      [jetCoreRef.current, jetN, jetCore.seeds],
      [blastRef.current, blastN, sandBlast.seeds],
      [blastCoreRef.current, blastN, sandCore.seeds],
      [stormRef.current, stormN, stormBolt.seeds],
      [stormCoreRef.current, stormN, stormCore.seeds],
      [hailRef.current, hailN, stormHail.seeds],
      [shardRef.current, flakeN, obsFlake.seeds],
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
      {/* Vapor: a MESMA nuvem da criatura — pluma de vapor com o topo largo
          no rumo do alvo (a pluma some nas bordas: depthWrite off, NUNCA
          aditivo) */}
      <instancedMesh
        ref={(m) => {
          jetRef.current = m;
        }}
        args={[steamJet.geo, steamJet.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Vapor: nódulo de água em ebulição na cabeça da pluma */}
      <instancedMesh
        ref={(m) => {
          jetCoreRef.current = m;
        }}
        args={[jetCore.geo, jetCore.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Areia: a MESMA turbilhão do véu do gênio — lufa de grão com a proa
          no alvo, girando como uma fresa cortante (NUNCA aditivo) */}
      <instancedMesh
        ref={(m) => {
          blastRef.current = m;
        }}
        args={[sandBlast.geo, sandBlast.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Areia: punho de arenito compactado no miolo da lufa */}
      <instancedMesh
        ref={(m) => {
          blastCoreRef.current = m;
        }}
        args={[sandCore.geo, sandCore.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Tempestade: o MESMO arco lilás dos mastros da muralha — o dardo de
          relâmpago em voo (aditivo: é a descarga, a regra do raio) */}
      <instancedMesh
        ref={(m) => {
          stormRef.current = m;
        }}
        args={[stormBolt.geo, stormBolt.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Tempestade: plasma lilás na cabeça do dardo (não-aditivo) */}
      <instancedMesh
        ref={(m) => {
          stormCoreRef.current = m;
        }}
        args={[stormCore.geo, stormCore.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Tempestade: grodo de granizo na cabeça — o MESMO gelo do granizo
          do muro, com o reflexo real da arena (NUNCA aditivo) */}
      <instancedMesh
        ref={(m) => {
          hailRef.current = m;
        }}
        args={[stormHail.geo, stormHail.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
      {/* Obsidiana: a MESMA obsidiana do corpo — farpa conchoidal de vidro
          negro com a brasa violeta acesa nas costuras, tombando pesada */}
      <instancedMesh
        ref={(m) => {
          shardRef.current = m;
        }}
        args={[obsFlake.geo, obsFlake.mat, MAX_PER_ELEMENT]}
        frustumCulled={false}
      />
    </group>
  );
}
