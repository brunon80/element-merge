import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeIceMaterial } from './iceShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { makeWoodMaterial } from './woodShaders';
import { makeCoreMaterial } from './lightningShaders';
import { arenaEnvTexture, captureArenaEnv } from './envProbe';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do CRISTAL (Nv.7 — raiz+duna: o PRISMA VIVO), o atirador de estilhaços
 * que ricocheteiam (chain 2). Zero shader novo: o corpo é o MESMO cristal do
 * Gelo/da Obsidiana (iceShaders — translúcido, depthWrite, reflexo REAL da
 * arena, veios de fratura acesos por dentro) lido em AMETISTA, a matriz da
 * duna é o stoneShaders do Gólem em ARDÓSIA LAVANDA (breu com veio acesso
 * virava "obsidiana com lava" no print — a espécie é areia+raiz, não magma) e
 * o veio do motor #b7a6ff mora nos três (cristal, matriz e raiz petrificada) —
 * é a IDENTIDADE única amarrada em teste, do motor ao FX.
 *
 * Figurino:
 *  1. PLANTADO NA DUNA: o prisma nasce de uma duna cimentada em degraus com
 *     saia de areia rente ao tabuleiro, raízes petrificadas e cascalho de
 *     ametista (o blurb: "raiz e duna cristalizam num colosso facetado"); sem
 *     floatY;
 *  2. PÉ DE PRISMAS + COLUNA HEXAGONAL: o pé é um leque de prismas escamados
 *     para fora (o cluster que fura a duna) e o tronco é a costela de SEIS
 *     faces com um gêmeo fundido girado 30° (tambor liso de papelão não é
 *     prisma); farpas, flautas e uma crista dorsal crescem por cima;
 *  3. GEMA NO PEITO: o miolo de luz NÃO fica enterrado no prisma translúcido
 *     (o alfa 0,86 comia a luz e o peito lia roxo liso) — ele vem ENCAIXADO na
 *     frente, num colar hexagonal de pedra segurado por quatro garras;
 *  4. AFINAÇÃO: HALO horizontal de oito farpas orbitando a cabeça (grupo 0,
 *     acelera com a carga — adeus aos anéis em pé que boiavam), cinto
 *     diafragma e cacos-filhote em duas órbitas. A luz entra pelas pontas e sai
 *     pela boca em farpa.
 *
 * Coreografia (afinar e disparar a cadeia): o prisma ENXUGA a luz do slot (os
 * motes sobem para dentro do corpo), agacha, o braço INTEIRO recolhe no pivô do
 * ombro, os veios ACENDEM da base para o topo e o halo acelera; no tiro ele
 * verga para frente, varre o braço e a farpa sai — cadeia de 2 saltos no motor.
 * Morte = o colosso SE ESTILHAÇA (amp sobe, alfa some).
 */

export const CRISTAL_ATTACK_WINDOW = 0.8;
/** fração da janela em que o prisma afina (a luz entra pelas pontas) */
export const CRISTAL_WINDUP = 0.55;
/** a AMETISTA da espécie: uma cor só entre motor, veios do gelo, do mineral,
 *  da raiz, do projétil e do FX (identidade da árvore-crystal) */
export const CRISTAL_AMETHYST = '#b7a6ff';

const CRISTAL_DEF = getSpecies('cristal');

/**
 * A GEMA do peito: encaixada NO COLAR hexagonal da frente (colar do modelo em
 * [0, 2.36, 0.66]), não enterrada no prisma — enterrada, o alfa denso do gelo
 * comia a luz e o print só mostrava roxo liso. Exportado: o pino da GEMA lê
 * aqui e amarra a luz FORA da pedra (a regra do peito que lê no card miúdo).
 */
export const CORE_POS: [number, number, number] = [0, 2.36, 0.86];

/**
 * Pivô do ombro (amarrado em teste): o braço INTEIRO gira aqui — é a BOLA DO
 * OMBRO do figurino (a peça em [1,42; 3,02; 0]), e não o centro do tronco:
 * girar cada peça do braço no próprio centro desarticularia o ombro no meio do
 * arremesso (o "manequim desmontado" do primeiro print).
 */
export const CRISTAL_ARM_PIVOT: [number, number, number] = [1.42, 3.02, 0];

export interface AttackPose {
  twist: number; // o colosso torce ao afinar (e devolve no tiro)
  gather: number; // negativo = encolhe absorvendo luz; positivo = estufa na descarga
  swing: number; // garras de farpa (negativo = recuam, positivo = varrem)
  charge: number; // 0..1: veios acendem, miolo arde, ressonadores vibram
  lean: number; // verga para trás ao afinar / para frente no tiro
  stepZ: number; // plantado: empurra só o tronco
  flare: number; // coroa, crescimentos e halo eriçam/vibram
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, gather: 0, swing: 0, charge: 0, lean: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > CRISTAL_ATTACK_WINDOW) return P;
  const p = since / CRISTAL_ATTACK_WINDOW;
  if (p < CRISTAL_WINDUP) {
    // a afinação segura o pico (o zumbido antes do estalo) — k**1.3 enche
    // pesado e para
    const k = (p / CRISTAL_WINDUP) ** 1.3;
    P.twist = 0.12 * k;
    P.gather = -0.9 * k; // contrai: a luz entra pelas pontas
    P.swing = -0.85 * k;
    P.charge = k;
    P.lean = -0.5 * k; // verga para trás (carregando)
    P.stepZ = -0.03 * k;
    P.flare = 0.85 * k; // coroa e anéis eriçam zumbindo
    return P;
  }
  const r = (p - CRISTAL_WINDUP) / (1 - CRISTAL_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.2)) ** 2; // o tiro de canhão-de-cristal estala quase junto
  const decay = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (0.12 - 0.34 * a) * decay;
  P.gather = (-0.9 + 1.75 * a) * decay; // de contraído a estufado (a luz saiu)
  P.swing = (-0.85 + 2.0 * a) * decay;
  P.charge = Math.max(0, 1 - 1.6 * r) * decay;
  P.lean = (-0.5 + 1.05 * a) * decay; // verga para FRENTE no tiro
  P.stepZ = (-0.03 + 0.22 * a) * decay;
  P.flare = (0.85 + 0.45 * a) * decay;
  return P;
}

/** ---------------------------------------------------------------- paletas */

/** CRISTAL DENSAMENTE COLORED (roles 'body'/'accent' grandes): ametista funda
 *  com o veio da IDENTIDADE por dentro. A pedra é densa, NUNCA "gelatina de
 *  vidro": alfa 0,90 (pedra DENSÍSSIMA — translúcido demais fazia o tronco ler
 *  "candelabro oco" com a luz vazando por trás) e o veio é claro-pálido sobre o
 *  fundo escuro (a régua do contraste do vidro negro). Contraste ALTO de
 *  propósito: no card miúdo da enciclopédia o corpo roxo uniforme virava um
 *  borrão sem aresta.
 *  SPARKLE BAIXO (0,35): o brilho de aresta do iceShaders é AZUL-BRANCO
 *  (vec3 .5,.62,.7) — no colosso grande ele lavava o lilás e o print lia
 *  "poste de gelo leitoso". Brilho de aresta só nas peças miúdas (GROW) */
export const PRISM_LOOK = {
  iceA: '#7d5ec8',
  iceB: '#150f2c',
  crack: '#efe6ff', // a LUZ do prisma (o veio do gelo é claro sobre escuro)
  crackGlow: 0.7,
  crackScale: 1.5, // veio longo e contínuo (corpo grande = trinca de coluna)
  crackWidth: 0.06,
  amp: 0.028,
  alpha: 0.9, // PEDRA DENSÍSSIMA: o print mostrava a luz vazando pelo tronco e
  // o figurino lia "candelabro oco". Translucidez é detalhe de perto (0,9), não
  // véu — e o invólucro do slot continua fechado
  bump: 0.9,
  reflPow: 130,
  envMix: 0.42, // espelhado mas não vitrificado a ponto de sumir no fundo
  sparkle: 0.35,
};

/** CRESCIMENTO VIVO (farpas novas, ombreiras, coroa, halo, cascalho): ametista
 *  CLARA — a peça recém-crescida é mais clara que o velho (o que lê o
 *  "vivo"), mesmo veio pálido */
export const GROW_LOOK = {
  iceA: '#d9c9ff',
  iceB: '#7d5fd8',
  crack: '#f7f2ff',
  crackGlow: 0.95,
  crackScale: 2.2,
  crackWidth: 0.045,
  amp: 0.02,
  alpha: 0.82,
  bump: 0.95,
  reflPow: 120,
  envMix: 0.45,
  sparkle: 0.7,
};

/** A FARPAS DO RICOCHETE (o projétil): o MESMO cristal do corpo — a farpa é
 *  um pedaço do colosso. Aqui o claro é a AMETISTA do motor e o escuro o
 *  breu: é o único caminho que lê contra o fundo da arena sem clarear (a
 *  lição do vidro da Obsidiana) e é o que a sonda do laço de QA varre */
export const SHARD_LOOK = {
  iceA: CRISTAL_AMETHYST,
  iceB: '#35245f',
  crack: '#e6dcff',
  crackGlow: 1.1,
  crackScale: 2.2,
  crackWidth: 0.05,
  amp: 0.02,
  alpha: 0.88,
  bump: 1.0,
  reflPow: 140,
  envMix: 0.55,
  sparkle: 1.0,
};

/** A LASCA do estouro (o filhote do tiro): a mesma luz dos crescimentos */
export const SLIVER_LOOK = {
  iceA: '#d6c8ff',
  iceB: '#8f76e0',
  crack: CRISTAL_AMETHYST,
};

/** MATRIZ DA DUNA (duna em degraus, saia de areia, colar da gema, cinto,
 *  máscara da cara): ARDÓSIA LAVANDA de geodo quebrada. A primeira versão era
 *  breu (#171122) com veio ameixa acesso a 0,3/0,8 de boost e o print lia
 *  "obsidiana com veios de LAVA" — magma, fora do tema de areia+raiz. Agora:
 *  pedra CLARA de grão curto (duna cimentada), veio da IDENTIDADE com glow
 *  CONTIDO (0,16) — a matriz não é fornalha, quem brilha é só a gema do peito
 *  Exportado: a amarração da paleta ÚNICA lê o veio daqui também */
export const MINERAL_LOOK = {
  rockA: '#a296a6', // matriz CLARA de duna cimentada (breu = "lava", ver acima)
  rockB: '#4e4656',
  crack: CRISTAL_AMETHYST,
  crackGlow: 0.16,
  crackScale: 2.6, // grão da duna: trama curta e densa (a regra do Pântano)
  crackWidth: 0.05,
  crackBoost: 0.4,
  speck: 0.34,
};

/** RAIZ PETRIFICADA (madeira virou pedra - o lado "raiz" do blurb): casca de
 *  ágata acinzentada, sem musgo verde (verde é da Madeira), seiva = a ametista
 *  do motor brilhando pela rachadura da casca petrificada */
export const ROOT_LOOK = {
  barkA: '#6f6169',
  barkB: '#2c2530',
  moss: '#7d7078', // crosta mineral (ágata), nunca clorofila
  sap: CRISTAL_AMETHYST,
  amp: 0.03,
  sapGlow: 0.34,
  speck: 0.24,
};

/** OLHO DE LUZ: fenda lilás acesa SEM blowout (emissivo miúdo — cartucho de
 *  sorvete foi o que o print da Névoa cobrou); o breu DENTRO da fenda é o
 *  kernel (claro-escuro-claro: a régua do contraste) e a boca-trinca lê na
 *  mesma escuridão (MeshBasic: preto sobre lilás é o único contraste que
 *  lê — a regra das manchas solares do Plasma) */
export const EYE_LOOK = {
  lit: '#e6dcff',
  glow: CRISTAL_AMETHYST,
  kernel: '#120c1e',
};

/** miolo de luz do peito (o core do Raio lido para a pedra): não-aditivo,
 *  nunca branco puro — o miolo quase branco virava "disco de opalina colado no
 *  peito" no print; aqui o claro é LILÁS e a orla é ameixa-funda. MAIS FORTE
 *  que o corpo (o print mostrava o tronco deixando a luz vazar e a gema
 *  apagada): a gema é o único ponto aceso do colosso e é ela que lê no card */
export const CORE_LOOK = {
  gold: CRISTAL_AMETHYST,
  white: '#dcc6ff',
  cool: '#33195f',
};

export interface CrystalRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o Cristal NÃO o usa: estilhaço não solta fumaça
   *  (o smokePool é grafite-fuligem; pedra quebrando solta PÓ, que são os
   *  motes minerais do próprio rig) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();

export function CrystalRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
}: CrystalRigProps) {
  const modelDef = MODELS.cristal;
  const level = Math.max(
    CRISTAL_DEF.levelMin,
    Math.min(CRISTAL_DEF.levelMax, Math.round(levelProp ?? CRISTAL_DEF.levelMin)),
  );
  const moteCount = embers ?? 26;
  const topY = formTop(CRISTAL_DEF, level);

  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const envShot = useRef(false);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** peças semânticas: braço do arremesso (gira no pivô do ombro), coroa eriça,
   *  crescimento zumbe, raiz treme na afinação. O HALO e os cacos em órbita não
   *  são atores: são grupos orbitais (`modelDef.groups`) — e não existe mais
   *  anel girando no próprio eixo (o anel em pé boiando saiu do figurino) */
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const spikes: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const growths: number[] = [];
    const roots: number[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'spike') spikes.push({ i, side, base });
      else if (p.tag === 'root') roots.push(i);
      else if (p.tag === 'growth') growths.push(i);
    });
    return { arms, spikes, growths, roots };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // olho de LUZ: lilás emissivo contido (o halo grande viraria carimbo — a
    // lição do coração da Névoa); o breu do kernel é MeshBasic (preto sobre
    // lilás é o único contraste que lê — a regra das manchas solares do Plasma)
    const eye = new THREE.MeshStandardMaterial({
      color: EYE_LOOK.lit,
      emissive: EYE_LOOK.glow,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      flatShading: true,
    });
    const kernel = new THREE.MeshBasicMaterial({ color: EYE_LOOK.kernel });
    const cache = new Map<string, THREE.Material>();
    const ices: THREE.ShaderMaterial[] = []; // só estas recebem o cubemap da arena
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return kernel;
      const ground = p.p[1] < 0.5; // duna/raiz/cascalho rentes ao tabuleiro
      const petrified = p.tag === 'root'; // raiz VIRADA pedra (madeira do blurb)
      const mineral = p.m === 'dark' || (p.m === 'body' && (p.tag === 'plinth' || ground));
      const growth = p.m === 'accent' || p.m === 'glow';
      if (petrified) {
        const key = `wood|${ground ? 'g' : 'n'}|${i % 3}`;
        let m = cache.get(key) as THREE.ShaderMaterial | undefined;
        if (!m) {
          m = makeWoodMaterial({
            barkA: ROOT_LOOK.barkA,
            barkB: ROOT_LOOK.barkB,
            moss: ROOT_LOOK.moss,
            sap: ROOT_LOOK.sap,
            amp: ROOT_LOOK.amp,
            sapGlow: ROOT_LOOK.sapGlow,
            speck: ROOT_LOOK.speck,
            seed: seed + (i % 3) * 2.9,
            breath: 0.5,
            teamColor: TEAM_TINT.neutral,
          });
          m.userData.iceKind = 'wood';
          cache.set(key, m);
        }
        return m;
      }
      if (mineral) {
        const key = `stone|${ground ? 'g' : 'n'}|${Math.round(p.p[1] * 50)}|${i % 3}`;
        let m = cache.get(key) as THREE.ShaderMaterial | undefined;
        if (!m) {
          m = makeStoneMaterial({
            rockA: MINERAL_LOOK.rockA,
            rockB: MINERAL_LOOK.rockB,
            crack: MINERAL_LOOK.crack,
            amp: ground ? 0.02 : 0.03,
            crackGlow: MINERAL_LOOK.crackGlow,
            crackScale: MINERAL_LOOK.crackScale,
            crackWidth: MINERAL_LOOK.crackWidth,
            crackBoost: MINERAL_LOOK.crackBoost,
            speck: MINERAL_LOOK.speck,
            seed: seed + (i % 3) * 3.3,
            breath: p.tag === 'ring' || p.tag === 'root' ? 0.4 : 1,
            teamColor: TEAM_TINT.neutral,
          });
          m.userData.iceKind = 'stone';
          cache.set(key, m);
        }
        return m;
      }
      const ice = growth ? GROW_LOOK : PRISM_LOOK;
      const key = `ice|${growth ? 'grow' : 'prism'}|${ground ? 'g' : 'n'}|${Math.round(p.p[1] * 50)}|${i % 3}`;
      let m = cache.get(key) as THREE.ShaderMaterial | undefined;
      if (!m) {
        m = makeIceMaterial({
          iceA: ice.iceA,
          iceB: ice.iceB,
          crack: ice.crack,
          amp: ice.amp,
          crackGlow: ice.crackGlow,
          crackScale: ice.crackScale,
          crackWidth: ice.crackWidth,
          alpha: ground ? 0.8 : ice.alpha, // peça de chão: mais fechada (nunca véu)
          bump: ice.bump,
          reflPow: ice.reflPow,
          envMix: ground ? 0.12 : ice.envMix, // chão NUNCA é espelho (a regra da geada)
          sparkle: ground ? 0.4 : ice.sparkle,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' || p.tag === 'spike' || p.tag === 'ring' ? 0.4 : 1,
        });
        m.userData.iceKind = 'ice';
        ices.push(m);
        cache.set(key, m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), eye, kernel],
      shaders: [...cache.values()] as THREE.ShaderMaterial[],
      ices,
      eye,
    };
  }, [visParts, seed, level]);

  // miolo de luz do peito: o core do Raio lido para a PEDRA (ametista por
  // dentro, miolo lilás-claro cortado, orla ameixa-funda — nunca aditivo,
  // nunca #ffffff; luz presa em pedra é a assinatura da espécie).
  // OCTAEDRO sub 1 apontado para a frente (escala z maior): a esfera icosa
  // lisa virava "olho de bode / disco de opalina colado no peito" no print —
  // GEMA facetada pontuda é o que lê como pedra preciosa
  const core = useMemo(
    () => ({
      geo: new THREE.OctahedronGeometry(0.26, 1), // facetado e denso (anti low-poly)
      mat: makeCoreMaterial({
        gold: CORE_LOOK.gold, // a ametista do motor (= projétil/veios/FX)
        white: CORE_LOOK.white, // miolo LILÁS (branco virava disco de opalina)
        cool: CORE_LOOK.cool, // orla ameixa-funda
        amp: 0.035,
        seed: 7.4,
      }),
    }),
    [],
  );

  // PÓ DE PRISMA que sobe e é SUGADO para dentro do corpo (a luz entrando
  // pelas pontas — o motivo de vida da espécie; ao carregar o tiro a subida
  // acelera e o arco aperta: o prisma ESTÁ bebendo a luz do slot)
  const motes = useMemo(() => {
    const geo = makeMoteGeo(moteCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
      },
    });
    return { geo, mat };
  }, [moteCount, emberScale]);

  // gelo/pedra/madeira leem aSeed por peça; clonamos só as que os usam
  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        const g = geo.clone();
        setSeedAttribute(g, seed + i * 1.9);
        geoClones.current.push(g);
        return g;
      }
      return geo;
    });
  }, [visParts, partMats, seed]);

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      for (const g of geoClones.current) g.dispose();
      geoClones.current = [];
      core.geo.dispose();
      core.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, core, motes]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > CRISTAL_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // O CRISTAL NÃO USA FUMAÇA DO POOL: pedra quebrando solta PÓ (os motes),
    // não fuligem grafite; e o mineral da duna nunca mancha de cinza.

    // ---- uniforms: gelo, mineral e raiz no mesmo loop da afinação ----
    const hum =
      Math.sin(t * 1.9 + seed) * 0.4 +
      Math.sin(t * 3.7 + seed * 0.6) * 0.3 +
      Math.sin(t * 0.7 + 1.3) * 0.3; // o prisma zumbe baixinho o tempo todo
    const crumble = 1 - alpha; // morrendo: o colosso SE ESTILHAÇA
    for (const m of partMats.shaders) {
      const kind = m.userData.iceKind as string | undefined;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
      m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      // flash de dano CORTADO (0,3): a 0,5 o iceShaders branqueia até 50% do
      // albedo e em luta contínua o colosso inteiro ficava LEITOSO no print — a
      // ametista da espécie sumia justamente na hora em que mais importa
      m.uniforms.uHurt.value = hurt * 0.3;
      // a carga ACENDE os veios (gelo) / a brasa do veio (pedra) / a seiva
      // (raiz) — tudo na MESMA ametista; miúdo nas peças de chão
      const cap = kind === 'stone' ? 0.55 : kind === 'wood' ? 0.5 : 1;
      m.uniforms.uCharge.value = Math.min(
        cap,
        pose.charge * (kind === 'ice' ? 1 : 0.7) + crumble * 0.6,
      );
      m.uniforms.uBreath.value = hum * (0.55 + 0.45 * hpFrac) + pose.flare * 0.4;
      // estilhaçando: o deslocamento sobe e a pedra/madeira esfarela
      m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.12 + crumble * 2.4);
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
    }
    // olho de luz: acesa pela carga (a luz do miolo vazando pela carapaça)
    partMats.eye.emissiveIntensity = 0.55 + pose.charge * 0.9 + crumble * 0.4;

    // miolo de luz: arde na afinação e APAGA quase junto no tiro (a luz saiu
    // pela boca — é o que vende a cadeia de cristal saindo do peito)
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = pose.charge;
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const flare01 = 0.94 + 0.06 * Math.sin(t * 2.6 + seed) + pose.charge * 0.16 - pose.gather * 0.02;
    const gem = Math.max(0.4, flare01 * (1 - crumble * 0.4));
    // GEMA facetada: a escala NÃO-uniforme (ponta alongada no Z, apontando para
    // a frente) é justamente a diferença entre "pedra preciosa encaixada" e
    // "bola de cristal / olho de bode colado no peito"
    coreRef.current.scale.set(gem * 0.85, gem * 0.85, gem * 1.2);
    // balança só um pouco (a ponta nunca sai de frente): girar o octaedro
    // alongado no Y inteiro faria a gema "espetar" para dentro do colosso
    coreRef.current.rotation.y = Math.sin(t * 0.4 + seed) * 0.3 + pose.charge * 0.4;
    coreRef.current.rotation.x = pose.lean * 0.3;
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.2 + pose.charge * 0.14); // halo MIÚDO (a lição do carimbo)
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 2.1 + seed) + pose.charge * 0.1) * alpha,
    );
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = pose.charge;

    // reflexo REAL nos cristais do colosso (o mesmo tiro único do Gelo)
    if (!envShot.current) {
      envShot.current = true;
      let envTex = arenaEnvTexture(gl);
      if (!envTex) {
        const root = rootRef.current;
        root.visible = false; // tiro limpo: nada de blob próprio no cubemap
        root.updateWorldMatrix(true, false);
        tmpWorld.set(0, 2.4, 0).applyMatrix4(root.matrixWorld);
        envTex = captureArenaEnv(gl, scene, tmpWorld);
        root.visible = true;
      }
      for (const w of partMats.ices) w.uniforms.uEnv.value = envTex;
    }

    // ---- corpo: plantado na duna (o prisma NÃO anda nem flutua) ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.3 + seed) * 0.014 + Math.sin(t * 0.9 + 1.7) * 0.006;
    const breathe = Math.sin(t * 0.7 + seed) * 0.008;
    g.scale.set(
      1 - pose.gather * 0.035 + breathe,
      1 + pose.gather * 0.05 + breathe, // encolhe ao afinar, estufa no tiro
      1 - pose.gather * 0.035 + breathe,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.25 + seed * 0.6) * 0.008;
    g.rotation.x = pose.lean * 0.05;
    g.position.y = 0;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais: o HALO de farpas em volta da cabeça e as duas
    // órbitas de cacos-filhote. A afinação aqui é VELOCIDADE (o grupo acelera
    // com a carga), não tremor de arame ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.charge * 1.8);
    }

    // ---- braços: o braço INTEIRO gira no PIVÔ DO OMBRO (recua ao afinar e
    // VARRE para frente no tiro). Girar cada peça do braço no próprio centro
    // era o que desarticulava o ombro no meio do arremesso ----
    const [pvX, pvY, pvZ] = CRISTAL_ARM_PIVOT;
    for (const a of actors.arms) {
      const mesh = partRefs.current[a.i];
      if (!mesh) continue;
      const part = visParts[a.i];
      const base = part.r ?? [0, 0, 0];
      const px = pvX * a.side;
      tmpQ.setFromEuler(new THREE.Euler(-pose.swing * 0.5, 0, a.side * pose.twist * 0.22));
      tmpQ2.setFromEuler(new THREE.Euler(base[0], base[1], base[2]));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld.set(part.p[0] - px, part.p[1] - pvY, part.p[2] - pvZ).applyQuaternion(tmpQ);
      mesh.position.set(px + tmpWorld.x, pvY + tmpWorld.y, pvZ + tmpWorld.z);
      const k = 1 + pose.charge * 0.16;
      const bs = part.s ?? [1, 1, 1];
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- peças: coroa eriça, crescimento/halo zumbe, raiz treme (os braços
    // já giraram no pivô do ombro acima) ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh || part.tag === 'arm') continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const spike = actors.spikes.find((x) => x.i === i);

      if (spike) {
        // coroa/ombreiras/garras do colar: eriçam na afinação e apontam no tiro
        const shimmer = Math.sin(t * (1.1 + (i % 3) * 0.3) + i * 1.7) * 0.025;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.16));
        sc *= 1 + pose.flare * 0.06;
      } else if (part.tag === 'growth') {
        // crescido no osso (e as farpas do halo): zumbe com a afinação
        sc *= 1 + pose.charge * 0.05 + Math.sin(t * (9 + (i % 4) * 2.2) + i) * 0.012 * pose.charge;
      } else if (part.tag === 'root') {
        // raiz na pedra: treme de leve quando a nota enche
        mesh.rotation.x = base[0] + Math.sin(t * 6 + i * 2.1) * 0.012 * pose.charge;
      }

      if (part.flick) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      }
      if (sc !== 1) {
        // escala NÃO uniforme preservada: a farpa é alongada de propósito
        // (setScalar na peça com `s` virava lasca redonda pulsando)
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }
    void topY; // topo amarrado nos testes; forma única Nv.7
  });

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => {
        const mesh = (
          <mesh
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            // só o MINERAL e a raiz projetam sombra: o crystal translúcido
            // com depthWrite/alfa no depth map virava bloco preto no piso
            // (a lição do funil da Névoa)
            castShadow={part.m === 'dark' || (part.m === 'body' && part.tag === 'plinth')}
          />
        );
        if (part.group !== undefined && modelDef.groups?.[part.group] !== undefined) {
          return (
            <group
              key={`g${part.group}-${level}-${i}`}
              ref={(gr) => {
                groupRefs.current[part.group!] = gr;
              }}
            >
              {mesh}
            </group>
          );
        }
        return <group key={`${level}-${i}`}>{mesh}</group>;
      })}
      {/* a GEMA do peito: encaixada no colar hexagonal da frente do colosso
          (o miolo enterrado no prisma translúcido não lia — a luz saía e o
          print só mostrava roxo liso). MIÚDA, facetada (octa apontado para a
          frente = pedra preciosa, nunca bola) e amarrada na paleta */}
      <mesh
        ref={coreRef}
        geometry={core.geo}
        material={core.mat}
        position={CORE_POS}
        scale={[0.85, 0.85, 1.2]}
        castShadow
      />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[CORE_POS[0], CORE_POS[1] + 0.06, CORE_POS[2] + 0.14]} scale={0.24}>
        <spriteMaterial
          map={circleTexture()}
          color={CRISTAL_AMETHYST}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Pó de prisma que SOBE e é engolido pelo corpo (a luz entrando pela pedra):
 * sobe em espiral que APERTA subindo (funil invertido do SandRig), tremula
 * como farpa miúda e esquenta do lilás-pálido (no chão) para a ametista do
 * motor (chegando no peito). uCharge acelera a sucção ao carregar o tiro.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.55 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.16 * (1.0 + uCharge * 1.3) + aRand.y);
  // funil INVERTIDO: largo no chão do slot, apertado no peito do prisma
  float ang = aRand.x * 6.28318 + prog * (1.2 + 2.4 * aRand.z) + uTime * 0.18;
  float r = 1.35 - prog * (0.8 + 0.55 * aRand.z);
  float y = 0.12 + prog * (2.15 + 0.35 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // farpa miúda e SECA (pó de pedra, não o fiapo macio do vapor)
  float size = (3.0 + 5.0 * aRand.z) * (0.85 + uCharge * 0.6) * uSizeMul * (1.0 - prog * 0.35);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce no chão do slot e morre engolido pelo corpo
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.62, 1.0, prog)) * uAlpha;
  // esquentando: lilás-pálido no chão -> ametista do motor no peito
  vC = mix(vec3(0.78, 0.68, 0.95), vec3(0.72, 0.65, 1.0), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pontinho duro com halo mínimo (caco de luz, não puff)
  float m = smoothstep(0.5, 0.22, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.55);
}
`;
