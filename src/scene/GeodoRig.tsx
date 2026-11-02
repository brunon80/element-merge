import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeIceMaterial } from './iceShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do GEODO (Nv.8 — obsidiana+cristal: a CATEDRAL DE GEODO), o mais duro dos
 * tanques (`heavy` + `splash 1,8`, alvo `lowestHp`, boulder a 7 un/s). Zero shader
 * novo: a rocha é o `stoneShaders` lido em BASALTO quase preto (áspero, salpicado)
 * e em CANTARIA clara lilás; o quartzo é o `iceShaders` em ametista ORQUÍDEA de
 * prisma PENTAGONAL; a luz da goela e o coração da rosácea são o `makeCoreMaterial`
 * do Plasma/Raio. A identidade é UMA cor do motor ao impacto:
 * `#c77dff` = projectileColor do motor = VISUALS.geodo.accent = uCrack do basalto =
 * uCrack da cantaria = uGold do núcleo na goela = o veio do boulder arremessado =
 * o veio do caco do impacto. O lilás quente `#e0b3ff` (= VISUALS.geodo.glow) é
 * SEMPRE acento: veio do quartzo, o coração da rosácea, os olhos e o halo do núcleo.
 *
 * Diferença dura contra os dois pais e o irmão da mesma cor:
 *  - OBSIDIANA (mãe, Nv.7): vidro NEGRO ESPELHADO (metalness 0,55, arestas retas).
 *    Aqui a pedra é CRUA (roughness 0,9, `speck` 0,85) e o figurino é claro de
 *    cantaria por cima — o geodo é a única espécie da árvore em que a pedra CLARA
 *    é maioria do figurino;
 *  - CRISTAL (mãe, Nv.7): colunas hexagonais TRANS LÚCIDAS com farpa que
 *    ricocheteia. Aqui o cristal é TOCO (ponta curta e grossa de geodo), a rocha é
 *    opaca e o tiro é um BOULDER pesado que arrebenta no chão (`splash`);
 *  - CóSMICO (irmão Nv.8): doze faces + oito pontas. Aqui é PENTÁGONO EM TUDO:
 *    cada `cyl`/`cone` do figurino tem CINCO faces (84+4 peças, zero seis, zero
 *    oito), os mamelões são dodecaedros (doze pentágonos) e a face, a rosácea, a
 *    goela e a coroa em órbita são todas de CINCO.
 *
 * Coreografia (a mais LENTA da árvore: janela 1,05 s e 68% de afinação): o maciço
 * AGACHA e comprime as colunas, as cinco placas mandibulares do geodo ABREM na
 * dobradiça da borda, o boulder sobe da cama de cristais para a goela, os
 * arcobotantes escoram para os lados e os estilhaços em órbita se eriçam; no tiro
 * a goela BATE, o boulder sai, o coice estufa o peito e os arcos batem de volta.
 * O geodo NÃO anda (moveSpeed 0): ele é a paisagem que atira.
 */

export const GEODO_ATTACK_WINDOW = 1.05;
/** fração da janela em que o geodo carrega a goela (a mais longa da árvore) */
export const GEODO_WINDUP = 0.68;

/** A ametista do geodo: a identidade única (orquídea clara, nunca o violeta
 *  fundo do Cristal nem o roxo da Obsidiana) — do motor ao caco do impacto */
export const GEODO_AMETHYST = '#c77dff';
/** o lilás QUENTE da espécie (= VISUALS.geodo.glow): sempre acento, nunca a
 *  cor principal (a regra da árvore para a segunda cor) */
export const GEODO_LILAC = '#e0b3ff';

const GEODO_DEF = getSpecies('geodo');

/**
 * O BOULDER que espera na goela (e que o tiro cospe): um dodecaedro de luz
 * pentagonal pousado na cama de cristais, acima do aro. Amarrado em teste — o
 * projétil do motor nasce exatamente daqui, então a silhueta do boulder é a
 * silhueta do tiro.
 */
export const GEODO_CORE_POS: [number, number, number] = [0, 3.72, 0];

/**
 * A DOBRIÇA do geodo (amarrado em teste): as cinco placas mandibulares e as cinco
 * pontas das costuras giram no ARO do aro pentagonal — um eixo tangencial numa
 * borda de raio `GEODO_JAW_RIM` no plano `GEODO_JAW_Y`. Uma peça mandibular com a
 * própria base abaixo desse plano é o que faz a rotação ser uma DOBRADIÇA e não a
 * peça voando solta da cabeça.
 */
export const GEODO_JAW_RIM = 0.55;
export const GEODO_JAW_Y = 3.62;

/** pivô do arcobotante (amarrado em teste): o ombro INTEIRO — nódulo, arco,
 *  pilar de cima, nervura e punho de cristal — rocks no nódulo do ombro. O
 *  CONTRAFORTE plantado no degrau (`arm.pier`) NUNCA gira: é a fundação. */
export const GEODO_ARM_PIVOT: [number, number, number] = [0.82, 3.1, -0.04];

export interface AttackPose {
  twist: number; // o maciço torce ao carregar (e devolve no coice)
  crouch: number; // negativo = agacha e comprime; positivo = estufa no coice
  heave: number; // o boulder sobe da cama de cristais para a goela (0..1)
  jaw: number; // 0..1: a goela de cinco placas abre na dobradiça
  swing: number; // arcobotantes (positivo = escoram para fora, negativo = batem)
  charge: number; // 0..1: veios acendem, rosácea ilumina, órbitas eriçam
  lean: number; // verga para trás ao carregar / para frente no coice
  flare: number; // estilhaços e cristas se eriçam
}

/**
 * Coreografia do tanque mais pesado da árvore: nada de tremor nervoso — o tempo
 * todo é o geodo CHEIANDO (o pow-wow da rocha). Comparação da árvore: Obsidiana
 * 0,95 / 0,58, Cristal 0,8 / 0,55, Cósmico 0,86 / 0,62.
 */
export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    crouch: 0,
    heave: 0,
    jaw: 0,
    swing: 0,
    charge: 0,
    lean: 0,
    flare: 0,
  };
  if (since < 0 || since > GEODO_ATTACK_WINDOW) return P;
  const p = since / GEODO_ATTACK_WINDOW;
  if (p < GEODO_WINDUP) {
    // o maciço se enrola: as potências altas (=1,6) fazem o começo quase parado
    const k = (p / GEODO_WINDUP) ** 1.6;
    P.twist = 0.15 * k;
    P.crouch = -0.72 * k; // agacha: o tronco encolhe e os lados alargam
    P.heave = k; // o boulder sobe da cama para a goela
    P.jaw = k; // as cinco placas abrem na dobradiça
    P.swing = 0.55 * k; // os arcos escoram para os lados (o empuxo da abóbada)
    P.charge = k;
    P.lean = -0.3 * k;
    P.flare = 0.8 * k; // os estilhaços em órbita se eriçam (o "devolve estilhaços")
    return P;
  }
  const r = (p - GEODO_WINDUP) / (1 - GEODO_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.2)) ** 2; // o boulder sai quase junto
  const decay = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (0.15 - 0.52 * a) * decay; // torce para o lado oposto no coice
  P.crouch = (-0.72 + 1.55 * a) * decay; // de agachado a estufado
  P.heave = (1 - 1.4 * a) * decay; // o boulder SAI: a goela fica vazia
  P.jaw = (1 - 1.15 * a) * decay; // a goela BATE depois de cuspir
  P.swing = (0.55 - 1.35 * a) * decay; // os arcobotantes batem de volta
  P.charge = (1 - 0.82 * a) * decay;
  P.lean = (-0.3 + 1.15 * a) * decay;
  P.flare = (0.8 - 0.95 * a) * decay;
  return P;
}

/**
 * O BASALTO (o corpo, os ombros, o entulho): roxo-escuro CRUA e salpicada — a
 * cobrança do print: com #453a52 o Geodo lia o MESMO preto-vidro da Obsidiana
 * (mãe) e a catedral sumia ao lado dela. Aqui a pedra é AMEIXA CLARADA e fosca
 * (metalness 0,06; a Obsidiana é espelhada) com a faceta clara do speck alta.
 * O veio é a ametista da espécie (identidade amarrada em teste), contido: glow
 * 0,34 × boost 0,75 = 0,255 — a rocha nunca arde como brasa; quem arde é o
 * interior do geodo.
 */
export const BASALT_LOOK = {
  rockA: '#5c4e74',
  rockB: '#282040',
  crack: GEODO_AMETHYST,
  crackGlow: 0.34,
  crackScale: 2.1, // veio CURTO e denso de basalto (corpo grande = pedra miúda)
  crackWidth: 0.045,
  crackBoost: 0.75,
  speck: 0.9, // o salpicado da rocha crua (o cristal de geodo miúdo na pedra)
  amp: 0.034,
};

/** o breu do basalto (as luvas fundas, o entulho, o pilar do degrau) */
export const BASALT_DEEP_LOOK = {
  ...BASALT_LOOK,
  rockA: '#3a3054',
  crackGlow: 0.26,
  amp: 0.03,
};

/**
 * A CANTARIA (degraus, colunas da nave, colar do pescoço, máscara, aro e placas
 * do geodo, arcobotantes): pedra CLARA lilás — é ela que faz o geodo ler
 * CONSTRUÇÃO e não mameluco. No print do Cristal a placa escura da face virava
 * buraco com a luz da arena; aqui a face e a cantaria inteira são claras.
 * Veio CONTIDO: glow 0,2 × boost 0,45 = 0,09 — a cantaria não arde; a luz da
 * espécie vem do quartzo e do núcleo.
 */
export const ASHLAR_LOOK = {
  rockA: '#b6a6c6',
  rockB: '#6b5d7d',
  crack: GEODO_AMETHYST,
  crackGlow: 0.2,
  crackScale: 1.5,
  crackWidth: 0.05,
  crackBoost: 0.45,
  speck: 0.45,
  amp: 0.012,
};

/**
 * O QUARTZO DE GEODO (toda ponta do figurino: rosácea da face, barba, costuras
 * da goela, cama do núcleo, torres, estilhaços em órbita, garras, mamelões do
 * degrau): ametista ORQUÍDEA e TOCA — o cristal de geodo é um prisma pentagonal
 * GROSSO e CURTO (o Cristal, mãe, tem colunas SEIS faces longas e o miolo
 * translúcido vazando).
 * `amp` 0,012: o relevo do shader NÃO pode arredondar a quina do prisma — a
 * silhueta da espécie é a aresta de cinco faces (a lição do Cristal em pedra).
 */
export const QUARTZ_LOOK = {
  iceA: '#b46fe0',
  iceB: '#3a1b4e',
  crack: GEODO_LILAC,
  crackGlow: 0.8,
  crackScale: 1.15,
  crackWidth: 0.05,
  sparkle: 0.55,
  alpha: 0.86, // pedra densa: translucidez é detalhe de perto, não véu
  bump: 0.7,
  reflPow: 120,
  envMix: 0.38,
  amp: 0.012,
};

/** O BOULDER-DE-LUZ na goela: a ametista do motor fervendo por dentro da rocha
 *  pentagonal (o miolo quase branco-lilás, nunca #ffffff puro) */
export const CORE_LOOK = {
  gold: GEODO_AMETHYST,
  white: '#f6e6ff',
  cool: GEODO_LILAC,
  amp: 0.05,
};

/** o coração da rosácea e os olhos: o lilás QUENTE na frente de tudo (o único
 *  contraste que lê no card miúdo) */
export const HEART_LOOK = {
  gold: GEODO_LILAC,
  white: '#fdf6ff',
  cool: GEODO_AMETHYST,
  amp: 0.014,
};

/** os nódulos acesos que respiram por dentro do basalto (a luz do geodo vazando
 *  pela rocha — três olhos de ametista no maciço) */
export const VEIN_LOOK = {
  gold: GEODO_AMETHYST,
  white: '#e8cfff',
  cool: GEODO_LILAC,
  amp: 0.02,
};

export interface GeodoRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o GEODO usa — o pó frio de pedra que a goela exala no
   *  arremesso é a poeira de uma catedral, não fuligem quente */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpHinge = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

export function GeodoRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: GeodoRigProps) {
  const modelDef = MODELS.geodo;
  const level = Math.max(
    GEODO_DEF.levelMin,
    Math.min(GEODO_DEF.levelMax, Math.round(levelProp ?? GEODO_DEF.levelMin)),
  );
  const moteCount = embers ?? 26;
  const topY = formTop(GEODO_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** peças semânticas: o arcobotante INTEIRO rocks no nódulo do ombro (menos o
   *  contraforte plantado); a GOELA inteira gira na dobradiça do aro (mesmo ângulo
   *  para placa e ponta de costura = a goela fecha sem desencaixar); as costelas
   *  eriçam; a cama e a rosácea pulsam com a carga. Os estilhaços em órbita são os
   *  três grupos orbitais, não atores */
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1 }[] = [];
    const jaw: number[] = [];
    const spikes: { i: number; side: 1 | -1 }[] = [];
    const nest: number[] = [];
    const crests: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      if (tag.startsWith('arm') && tag !== 'arm.pier') arms.push({ i, side });
      else if (tag === 'jaw.plate' || tag === 'jaw.point') jaw.push(i);
      else if (tag === 'spike') spikes.push({ i, side });
      else if (tag === 'bed' || tag === 'rosette') nest.push(i);
      else if (tag === 'crest' || tag === 'vault') crests.push(i);
    });
    return { arms, jaw, spikes, nest, crests };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // o breu NA FRENTE do olho: claro-sobre-escuro é o único contraste que lê no
    // card miúdo (a regra das manchas brutas da árvore)
    const kernel = new THREE.MeshBasicMaterial({ color: '#100b18' });
    const cache = new Map<string, THREE.ShaderMaterial>();
    const pick = (key: string, make: () => THREE.ShaderMaterial) => {
      let m = cache.get(key);
      if (!m) {
        m = make();
        cache.set(key, m);
      }
      return m;
    };
    const list = visParts.map((p, i) => {
      const tag = p.tag ?? '';
      if (p.m === 'black') return kernel;
      if (p.m === 'white')
        return pick(`heart|${i % 2}`, () =>
          makeCoreMaterial({
            gold: HEART_LOOK.gold, // = o lilás quente da espécie (o coração da rosácea)
            white: HEART_LOOK.white,
            cool: HEART_LOOK.cool,
            amp: HEART_LOOK.amp,
            seed: 3.2 + (i % 2) * 2.6,
          }),
        );
      if (p.m === 'glow')
        return pick(`vein|${i % 2}`, () =>
          makeCoreMaterial({
            gold: VEIN_LOOK.gold,
            white: VEIN_LOOK.white,
            cool: VEIN_LOOK.cool,
            amp: VEIN_LOOK.amp,
            seed: 7.4 + (i % 2) * 3.3,
          }),
        );
      if (p.m === 'trans')
        return pick(`quartz|${tag === 'mask' ? 'face' : tag}|${i % 3}`, () =>
          makeIceMaterial({
            iceA: QUARTZ_LOOK.iceA,
            iceB: QUARTZ_LOOK.iceB,
            crack: QUARTZ_LOOK.crack,
            amp: tag === 'rosette' || tag === 'bed' ? QUARTZ_LOOK.amp * 0.6 : QUARTZ_LOOK.amp,
            crackGlow: QUARTZ_LOOK.crackGlow,
            crackScale: QUARTZ_LOOK.crackScale,
            crackWidth: QUARTZ_LOOK.crackWidth,
            sparkle: tag === 'dart' || tag === 'rosette' ? 0.8 : QUARTZ_LOOK.sparkle,
            alpha: QUARTZ_LOOK.alpha,
            bump: QUARTZ_LOOK.bump,
            reflPow: QUARTZ_LOOK.reflPow,
            envMix: QUARTZ_LOOK.envMix,
            seed: seed + (i % 3) * 2.7,
            breath: tag === 'cluster' ? 0.4 : 0.7, // o mameluco do chão não respira
            teamColor: TEAM_TINT.neutral,
          }),
        );
      if (p.m === 'accent')
        return pick(`ashlar|${tag === 'mask' ? 'face' : 'hard'}|${i % 2}`, () =>
          makeStoneMaterial({
            rockA: ASHLAR_LOOK.rockA,
            rockB: ASHLAR_LOOK.rockB,
            crack: ASHLAR_LOOK.crack, // = a cor do motor (identidade na pedra clara)
            // a MÁSCARA e o aro do geodo são lisos: rosto/goela serrilhados = mancha
            // no print (a lição da máscara da Névoa e do rosto do Cósmico)
            amp: tag === 'mask' || tag === 'jaw.collar' ? 0.006 : ASHLAR_LOOK.amp,
            crackGlow: ASHLAR_LOOK.crackGlow,
            crackScale: ASHLAR_LOOK.crackScale,
            crackWidth: ASHLAR_LOOK.crackWidth,
            crackBoost: ASHLAR_LOOK.crackBoost,
            speck: ASHLAR_LOOK.speck,
            seed: seed + (i % 2) * 2.9,
            breath: tag === 'floor' || tag === 'dais' ? 0.25 : 0.55, // a fundação não respira
            teamColor: TEAM_TINT.neutral,
          }),
        );
      const deep = p.m === 'dark';
      const L = deep ? BASALT_DEEP_LOOK : BASALT_LOOK;
      return pick(`basalt|${deep ? 'deep' : 'rock'}|${i % 2}`, () =>
        makeStoneMaterial({
          rockA: L.rockA,
          rockB: L.rockB,
          crack: L.crack, // = a cor do motor (o veio de ametista do basalto)
          amp: tag === 'leg' || tag === 'rubble' ? L.amp * 0.8 : L.amp,
          crackGlow: L.crackGlow,
          crackScale: L.crackScale,
          crackWidth: L.crackWidth,
          crackBoost: L.crackBoost,
          speck: L.speck,
          seed: seed + (i % 2) * 3.1,
          breath: 0.5,
          teamColor: TEAM_TINT.neutral,
        }),
      );
    });
    const shaders = [...cache.values()];
    for (const m of shaders) {
      // o traje manda nos uniforms (cascos sem uSparkle/uSpeck não podem ser
      // escritos pelo loop — a regra do guard por uniforme, não por sorte)
      const fs = m.fragmentShader;
      m.userData.kind = fs.includes('uSpeck') ? 'stone' : fs.includes('uSparkle') ? 'quartz' : 'core';
    }
    return { list, uniq: [...cache.values(), kernel], shaders };
  }, [visParts, seed, level]);

  // O BOULDER da goela: dodecaedro (as doze FACES PENTAGONAIS da espécie) com a
  // luz do motor fervendo por dentro. Denso (sub 1 = 180 faces) porque é a peça
  // que vira PROJÉTIL — a silhueta do tiro é a silhueta da goela.
  const core = useMemo(
    () => ({
      geo: new THREE.DodecahedronGeometry(0.3, 1),
      mat: makeCoreMaterial({
        gold: CORE_LOOK.gold, // = a cor do motor (identidade da goela ao projétil)
        white: CORE_LOOK.white,
        cool: CORE_LOOK.cool,
        amp: CORE_LOOK.amp,
        seed: 5.3,
      }),
    }),
    [],
  );

  // PÓ DE CATEDRAL: a pozolana desce da goela aberta e vai assentar no degrau
  // (o oposto do funil que sobe do Cósmico). Ao carregar o tiro o geodo sacode a
  // própria abóbada e a chuva de pó APERTA.
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

  // pedra/quartzo/núcleo leem aSeed por peça; clonamos só os que usam
  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        const g = geo.clone();
        setSeedAttribute(g, seed + i * 1.7);
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
      if (demoT.current > GEODO_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const crumble = 1 - alpha; // morrendo: a catedral desaba e o geodo apaga
    const striking =
      sinceAttack >= GEODO_ATTACK_WINDOW * GEODO_WINDUP && sinceAttack <= GEODO_ATTACK_WINDOW;
    if (!striking) strikeDone.current = false;

    // ---- pó de pedra frio na goela no instante do arremesso (o boulder sai
    // cuspindo pozolana; heat 0 = pó mineral, nunca fuligem de fogueira) ----
    if (striking && !strikeDone.current && smoke) {
      strikeDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 7; i++) {
        tmpWorld
          .set(
            GEODO_CORE_POS[0] + (Math.random() - 0.5) * 0.8,
            GEODO_CORE_POS[1] + 0.1 + Math.random() * 0.3,
            GEODO_CORE_POS[2] + (Math.random() - 0.5) * 0.8,
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.09 + Math.random() * 0.07,
          heat: 0, // pedra moída não brilha
          life: 0.9 + Math.random() * 0.6,
          lifeVar: 0.35,
          jitter: 0.2,
          rise: 0.1,
          drag: 3.4,
          vx: (Math.random() - 0.5) * 1.3,
          vy: 0.5 + Math.random() * 0.7,
          vz: (Math.random() - 0.5) * 1.3,
        });
      }
    }

    // ---- uniforms: basalto, cantaria, quartzo e núcleos no MESMO loop ----
    const hum =
      Math.sin(t * 1.15 + seed) * 0.4 + Math.sin(t * 2.6 + seed * 0.7) * 0.3 +
      Math.sin(t * 0.5 + 2.1) * 0.3; // o geodo respira como forno de cal devagar
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'quartz' ? 0.22 : 0.3);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1 : 0.7) + crumble * 0.4);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = hum * (0.5 + 0.5 * hpFrac) + pose.flare * 0.3;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: a cantaria racha e o basalto esfarela; ferido: quase não muda
      // (a lição do Cristal — uHurt alto com uAmp grande serrilha o figurino)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + crumble * 1.9);
      // a AFINAÇÃO acende os veios das duas pedras: o geodo fica mais claro
      // conforme a goela enche (a luz do motor procurando a saída)
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.55);
      }
      // o quartzo brilha mais na carga (aresta acesa), SEM estourar o sparkle
      if (m.uniforms.uSparkle) {
        if (m.userData.baseSparkle === undefined) m.userData.baseSparkle = m.uniforms.uSparkle.value;
        m.uniforms.uSparkle.value = (m.userData.baseSparkle as number) * (1 + pose.charge * 0.3);
      }
    }

    // ---- o BOULDER na goela: sobe da cama, arde, e some no tiro ----
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 1.1 + crumble * 0.5);
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.9 + 0.08 * Math.sin(t * 2.2 + seed) + pose.heave * 0.16;
    coreRef.current.scale.setScalar(Math.max(0.12, boil * (1 - crumble * 0.5)));
    // giro LENTO (é rocha pentagonal, não pião): as doze faces têm que ler no print
    coreRef.current.rotation.y = t * 0.28 + seed;
    coreRef.current.rotation.x = 0.2 * Math.sin(t * 0.6 + seed) + pose.lean * 0.2;
    coreRef.current.position.set(
      GEODO_CORE_POS[0],
      GEODO_CORE_POS[1] + pose.heave * 0.18 + Math.sin(t * 1.7 + seed) * 0.02,
      GEODO_CORE_POS[2],
    );
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.34 + pose.charge * 0.3 + pose.heave * 0.12);
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.07 + 0.02 * Math.sin(t * 2.1 + seed) + pose.charge * 0.11) * alpha,
    );
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: plantado na fundação (o tanque não anda; a abóbada trabalha) ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.3 + seed) * 0.012 + Math.sin(t * 0.74 + 1.4) * 0.006;
    const breathe = Math.sin(t * 0.55 + seed) * 0.007;
    g.scale.set(
      1 - pose.crouch * 0.035 + breathe + crumble * 0.05, // agachado: alarga
      1 + pose.crouch * 0.055 + breathe - crumble * 0.14, // agachado: encolhe
      1 - pose.crouch * 0.035 + breathe + crumble * 0.05,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.24 + seed * 0.5) * 0.008 + crumble * 0.12; // desabando: tomba
    g.rotation.x = pose.lean * 0.055;

    // ---- três corpos em movimento em três alturas: seis tocos de quartzo no
    // peito (0), sete lascas de basalto raspando o degrau no sentido CONTRÁRIO
    // (1) e cinco estilhaços altos acima da goela (2). A afinação aqui é
    // VELOCIDADE e escala, não tremor de arame ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.flare * 1.2);
    }

    // ---- arcobotantes: o ARCO INTEIRO (nódulo + arco + pilar + nervura + garra)
    // rocks no nódulo do ombro. Pouco: são arcos de pedra, não braços de borracha;
    // o contraforte plantado (`arm.pier`) fica parado — é a fundação ----
    const [pvX, pvY, pvZ] = GEODO_ARM_PIVOT;
    const armZ = pose.swing * 0.17; // escora para fora ao carregar, bate no coice
    const armX = pose.swing * 0.09;
    for (const a of actors.arms) {
      const mesh = partRefs.current[a.i];
      if (!mesh) continue;
      const part = visParts[a.i];
      const base = part.r ?? [0, 0, 0];
      tmpEuler.set(armX, 0, a.side * (armZ + pose.flare * 0.02));
      tmpQ.setFromEuler(tmpEuler);
      tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2]));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld
        .set(part.p[0] - pvX * a.side, part.p[1] - pvY, part.p[2] - pvZ)
        .applyQuaternion(tmpQ);
      mesh.position.set(pvX * a.side + tmpWorld.x, pvY + tmpWorld.y, pvZ + tmpWorld.z);
      const k = 1 + pose.charge * 0.02;
      const bs = part.s ?? [1, 1, 1];
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- A GOELA: a ASSINATURA do geodo. Placas e pontas de costura giram na
    // MESMA dobradiça (eixo tangencial à borda do aro, no plano do aro) — é por
    // isso que a cavidade abre sem nenhum piece solto voando da cabeça ----
    const jawOpen = 0.5 * pose.jaw + 0.07 + 0.03 * Math.sin(t * 1.25 + seed);
    for (const i of actors.jaw) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const phi = Math.atan2(part.p[2], part.p[0]);
      const rx = Math.cos(phi) * GEODO_JAW_RIM;
      const rz = Math.sin(phi) * GEODO_JAW_RIM;
      tmpHinge.set(-Math.sin(phi), 0, Math.cos(phi));
      tmpQ.setFromAxisAngle(tmpHinge, -jawOpen);
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      tmpPivot.set(rx, GEODO_JAW_Y, rz);
      tmpWorld.set(part.p[0] - rx, part.p[1] - GEODO_JAW_Y, part.p[2] - rz).applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
      const bs = part.s ?? [1, 1, 1];
      const k = 1 + pose.jaw * 0.04;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- peças: costelas de basalto eriçam, torres e abóbada crescem na carga,
    // a rosácea e a cama de cristais pulsam (a luz subindo pela catedral) ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh || part.tag?.startsWith('arm') || part.tag === 'jaw.plate' || part.tag === 'jaw.point')
        continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const spike = actors.spikes.find((x) => x.i === i);
      if (spike) {
        const shimmer = Math.sin(t * (1.1 + (i % 3) * 0.3) + i * 1.9) * 0.025;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.14));
        sc *= 1 + pose.flare * 0.05;
      } else if (actors.nest.includes(i)) {
        // a rosácea da face e a cama do núcleo: a luz sobe — elas incham com a carga
        sc *= 1 + pose.charge * 0.09 + Math.sin(t * (4.6 + (i % 4) * 1.1) + i * 1.7) * 0.02 * pose.charge;
      } else if (actors.crests.includes(i)) {
        // torres e arcos da abóbada: esticam na afinação (a catedral se apruma)
        sc *= 1 + pose.charge * 0.05;
      } else if (part.tag === 'dart') {
        sc *= 1 + pose.flare * 0.1;
        mesh.rotation.y += dt * 0.5;
      }

      if (part.flick) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      }
      if (sc !== 1) {
        // escala NÃO uniforme preservada (os mamelões achatados do entulho viravam
        // bolinha pulsando com setScalar)
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }
    void topY; // topo amarrado nos testes; forma única Nv.8
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
            // só a rocha projeta sombra: quartzo, luz do núcleo e os olhos são
            // translúcidos e viravam bloco preto no piso (a lição do funil da Névoa)
            castShadow={part.m === 'body' || part.m === 'dark' || part.m === 'accent'}
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
      {/* O BOULDER esperando na goela: a pedra pentagonal com a luz do motor por
          dentro — é ELE que o `heavy`+`splash` cospe, então a silhueta do tiro é a
          silhueta da cavidade */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} position={GEODO_CORE_POS} />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite
        ref={coreGlowRef}
        position={[GEODO_CORE_POS[0], GEODO_CORE_POS[1] + 0.16, GEODO_CORE_POS[2]]}
        scale={0.36}
      >
        <spriteMaterial
          map={circleTexture()}
          color={GEODO_LILAC}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Pó de CATEDRAL que DESCE da goela aberta e vai assentar no degrau (o oposto do
 * funil que sobe do Cósmico): cai em espiral que ALARGA (o pó derramando pela
 * abóbada), é duro e miúdo (pozolana, não bruma) e esfria do lilás-quente na
 * goela para o cinza-lilás da pedra no chão. uCharge aperta a chuva de pó.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: angulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.5 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.13 * (1.0 + uCharge * 1.5) + aRand.y);
  // caindo e ALARGANDO: o pó derramado pela goela cobre a catedral
  float ang = aRand.x * 6.28318 - prog * (0.9 + 1.7 * aRand.z) + uTime * 0.07;
  float r = 0.4 + prog * (0.8 + 0.8 * aRand.z);
  float y = 3.86 - prog * (3.5 + 0.3 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // grão duro e MIÚDO (pozolana): nunca o fiapo macio do vapor nem confete aceso
  float size = (1.5 + 2.4 * aRand.z) * (0.9 + uCharge * 0.5) * uSizeMul * (1.0 - prog * 0.3);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce na goela e morre assentando no degrau
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.55, 1.0, prog)) * uAlpha;
  // esfriando: lilás-quente na goela -> cinza-lilás de pedra no chão
  vC = mix(vec3(0.878, 0.702, 1.0), vec3(0.55, 0.52, 0.62), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // grão duro com halo minimo (pó mineral, nao puff)
  float m = smoothstep(0.5, 0.2, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.34);
}
`;
