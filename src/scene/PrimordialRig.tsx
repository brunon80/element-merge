import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeIceMaterial } from './iceShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import {
  MODELS,
  partsForLevel,
  PRIMORDIAL_CORTE_R,
  PRIMORDIAL_DISK_Y,
  PRIMORDIAL_HORIZON_R,
  PRIMORDIAL_DISK_R,
  PRIMORDIAL_DISK_TILT,
  PRIMORDIAL_TILT_MAX,
  PRIMORDIAL_TOWER_R,
  PRIMORDIAL_TOWER_K,
  PRIMORDIAL_MUZZLE,
  PRIMORDIAL_QUASAR,
  PRIMORDIAL_ICE,
  PRIMORDIAL_EMBER,
  PRIMORDIAL_FROST,
  PRIMORDIAL_DEEP,
} from './speciesModels';
import type { Part } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do PRIMORDIAL (Nv.10 — Astral+Colosso: O QUASAR SUPERMASSIVO que precede
 * os quatro elementos), plantado pela CORTE dos dezessete pilares. A assinatura
 * é o DISCO DE ACREFÃO — uma única malha com shader próprio (anel de fótons em
 * HDR pra alimentar o bloom, bandas de gás com ω ∝ ρ^−1,5 e franja ember na
 * borda): o astro NÃO tem geometria, é pintura no disco, e o furo ρ<0,62 é o
 * horizonte de eventos por onde sai a rajada.
 *
 * A física que manda no figurino inteiro mora aqui: o anel é RÍGIDO e
 * PRECESSIONA em Y (q = qTilt·qBase no pivô (0, Y_D, 0)), então o plano
 * inclinado varre TODOS os azimutes e a superfície passa entre Y_D ± ρ·tan(t) —
 * por isso o tilt do rig oscila APENAS em [0,42, 0,50] (PRIMORDIAL_TILT_MAX é a
 * régua das folgas do figurino) e o spin diferencial mora no SHADER (bandas
 * arrastadas pelo ângulo acumulado `uSpin`, ω ∝ ρ^−1,5 — o wrapper nunca gira o
 * anel, só o inclina; girar o wrapper e o shader ao mesmo tempo contaria a
 * rotação duas vezes).
 *
 * Zero shader novo de pedra: a cantaria é o `stoneShaders` lido em GEOBRUTA
 * (geada clara — a pedra mais clara da árvore) sobre BREU-ROXO, com o veio de
 * luz-de-azo do motor (#e8f6ff) correndo por dentro de toda pedra; o gelo é o
 * `makeIceMaterial` do Cristal nas lunetas; a luz é o `makeCoreMaterial` do
 * Raio lido em azo-quasar. Três shaders próprios: o DISCO, o JATO (cone aberto
 * na goela do buraco) e o PÓ DE QUASAR — grãos orbitando o MESMO plano inclinado
 * com ω ∝ 1/ρ (herança direta do pó de anel do Colosso).
 *
 * A coreografia (interval 1,5 — a cadência do Nv.10, então a JANELA fica entre a
 * do astral e a do colosso: 0,94 s, e 0,6 dela é afinação): o quasar COLETA a
 * matéria com as garras nas torres (gather), o cometa segurado SOME na afinação
 * (matéria engolida — o rig apaga arm.core/arm.tail), o disco ACENDE e as bandas
 * ACELERAM (charge), e no estouro o JATO varre do furo do horizonte (jet — a
 * rajada de energia do motor: piercing + chain + burn), o disco infla em flare e
 * o QUAKE é a gravidade cedendo no soalho. Todos os canais assentam em ~0 antes
 * do fim da janela (continuidade amarrada em teste).
 */

const PRIMORDIAL_DEF = getSpecies('primordial');

/** janela e afinação: cadência 1,5 do Nv.10 — a janela (0,94) fica entre o
 *  astral (0,74 no interval 1,2) e o colosso (1,25 no 2,5); 0,6 dela é afinação
 *  porque a arma é um JATO contínuo de jato contínuo (pierce 2 + chain 3) */
export const PRIMORDIAL_ATTACK_WINDOW = 0.94;
export const PRIMORDIAL_WINDUP = 0.6;

/** identidade amarrada em teste: luz-de-azo #e8f6ff (= projectileColor do motor
 *  = glow do figurino = uCrack de TODA a pedra = anel de fótons do disco) e o
 *  gelo #9ad0ff (= accent: as lunetas elementais e o veio frio da meia-envergadura) */
export { PRIMORDIAL_QUASAR, PRIMORDIAL_ICE, PRIMORDIAL_EMBER, PRIMORDIAL_FROST, PRIMORDIAL_DEEP };

/** a GEOBRUTA: geada bruta quase branca (a pedra MAIS CLARA da árvore — é o que
 *  faz o print ler templo de quasar e não fenda de abismo) com o veio de azó do
 *  motor por dentro. O VEIO É CONTIDO (0,3 × 0,6 = 0,18): com o disco inteiro
 *  aceso no HDR, veio solto transformaria o templo numa lâmpada riscada */
export const GEOBRUTA_LOOK = {
  rockA: PRIMORDIAL_FROST,
  rockB: '#8e97ab',
  crack: PRIMORDIAL_QUASAR,
  amp: 0.04,
  crackGlow: 0.3,
  crackScale: 1.4,
  crackWidth: 0.038,
  crackBoost: 0.6,
  speck: 0.85,
};

/** o BREU DA CANTARIA: os dezessete pilares por dentro, as lages, o colarinho
 *  escuro da goela, o tambor da garra e os detritos. O veio quase apagado: o
 *  escuro tem que ser ESCURO (a lição do print do Colosso) */
export const CANTARIA_DEEP_LOOK = {
  ...GEOBRUTA_LOOK,
  rockA: PRIMORDIAL_DEEP,
  rockB: '#141021',
  amp: 0.03,
  crackGlow: 0.14,
  speck: 0.5,
};

/** o GELO-DE-LUNETAS (accent): pedra azulada fria com o veio de azó na fratura
 *  — é o gelo herdado do pai Astral lido como pedra, não como plasma */
export const ICESTONE_LOOK = {
  rockA: '#546f96',
  rockB: '#252c40',
  crack: PRIMORDIAL_QUASAR,
  amp: 0.02,
  crackGlow: 0.9,
  crackScale: 2.2,
  crackWidth: 0.028,
  crackBoost: 1.0,
  speck: 1.0,
};

/** o plasma do horizonte: azo-quasar com o branco estelar — SÓ na tampa do fuso,
 *  nas lâmpadas miúdas e no jato (traço estrutural nunca é translúcido) */
export const QUASAR_PLASMA = {
  gold: PRIMORDIAL_QUASAR,
  white: '#ffffff',
  cool: PRIMORDIAL_ICE, // o contorno é gelo, nunca azul-elétrico do Raio puro
  amp: 0.03,
};

/** pivô do disco: o centro do anel (o wrapper só INCLINA no pivô — o spin
 *  diferencial é do shader, arrastado pelo ângulo acumulado uSpin) */
export const PRIMORDIAL_DISK_PIVOT: [number, number, number] = [0, PRIMORDIAL_DISK_Y, 0];

/** pivôs das DUAS TORRES (k 4 e k 13 = ±84,7°, o par espelhado no Z de 17 lados):
 *  a garra inteira gira no eixo VERTICAL da torre — rodando em volta da vertical
 *  da torre o ρ de cada peça nunca pode furar a borda (a distância da peça ao
 *  eixo da torre é o teto do avanço: 2,62 − 0,21 = 2,41 > 2,28 + raio miúdo) */
export function primTowerPivot(side: number): [number, number, number] {
  const k = side > 0 ? PRIMORDIAL_TOWER_K[0] : PRIMORDIAL_TOWER_K[1];
  const phi = (k / 17) * Math.PI * 2;
  return [PRIMORDIAL_TOWER_R * Math.cos(phi), 0, PRIMORDIAL_TOWER_R * Math.sin(phi)];
}

export interface PrimordialRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** grãos de poeira de quasar orbitando o plano inclinado do disco — TRINTA E
   *  QUATRO (o primo dezessete manda nas contagens estruturais, no pó vale a
   *  razão 2×17 do anel de poeira do Colosso: três cintas miúdas) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o PRIMORDIAL exala PÓ DE ESTRELA ENGOLE com heat 0,05
   *  (nem a cinza incandescente do pai Vulcânico, nem o talco morto do Colosso —
   *  matéria recém-caçada, ainda fria na queda) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpAxis = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

/**
 * A coreografia do quasar: `gather` é a COLETA das garras nas torres (o braço
 * gira no eixo da torre ensacando matéria), `lean` é o templo todo tombando na
 * respiração da coleta, `charge` é o disco esquentando e o cometa segurado
 * murchando (matéria engolida), `flare` acende a tampa do fuso e as lâmpadas
 * da coroa, `jet` é o JATO de azó varrendo do furo do
 * horizonte no estouro (a rajada do motor) e `quake` é a gravidade cendendo no
 * soalho. Todos voltam a ~zero no fim da janela e são zero fora dela.
 */
export function attackPose(since: number) {
  const p = { gather: 0, lean: 0, charge: 0, flare: 0, jet: 0, recoil: 0, quake: 0 };
  if (since < 0 || since > PRIMORDIAL_ATTACK_WINDOW) return p;
  const u = PRIMORDIAL_ATTACK_WINDOW;
  const w = u * PRIMORDIAL_WINDUP;
  if (since < w) {
    const s = since / w;
    const ease = 1 - Math.pow(1 - s, 3);
    p.gather = ease; // as garras varrem o exterior ensacando matéria
    p.lean = -0.6 * ease; // o templo tomba para trás na coleta (o rig lê
    // lean·0,012 sobre o eixo X — miúdo: a corte é plantada nos dezessete)
    p.charge = Math.pow(s, 1.4); // o disco esquenta e o cometa segurado afunda
    p.flare = 0.2 * Math.pow(s, 0.35) + 0.5 * ease;
  } else {
    const r = (since - w) / (u - w);
    const fall = Math.pow(1 - r, 2);
    const relax = 1 - Math.pow(r, 2.2);
    // o jato IGNA e varre: nasce em 0 no estouro, estoura no meio do sopro e
    // ASSENTA em 0 aos 87% do resto da janela (nada de jato ainda aceso no frame
    // em que a pose vira zero)
    p.jet = Math.sin(Math.min(1, r * 1.15) * Math.PI);
    p.gather = Math.cos(Math.min(1, r * 1.25) * Math.PI / 2); // a garra larga o grão
    p.charge = fall; // o disco esfria devagar depois do sopro
    p.flare = (0.5 + fall * 1.2) * relax;
    p.recoil = p.jet * (1 - r); // o recuo do sopro: o templo afunda no soalho
    p.quake = Math.pow(1 - r, 1.3); // a gravidade cede no estouro e levanta devagar
    // o templo tombado na coleta DEVOLVE junto com o jato (em r=0 vale −0,6, o
    // mesmo valor com que a afinação terminou, e no fim da janela é zero)
    p.lean = p.jet * (1 - r) * 0.7 - 0.6 * Math.pow(1 - r, 2.4);
  }
  return p;
}

export function PrimordialRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: PrimordialRigProps) {
  const modelDef = MODELS.primordial;
  const level = Math.max(
    PRIMORDIAL_DEF.levelMin,
    Math.min(PRIMORDIAL_DEF.levelMax, Math.round(levelProp ?? PRIMORDIAL_DEF.levelMin)),
  );
  const moteCount = embers ?? 34;
  const topY = formTop(PRIMORDIAL_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const diskRef = useRef<THREE.Mesh>(null!);
  const armRefs = useRef<(THREE.Group | null)[]>([]);
  const jetRef = useRef<THREE.Mesh>(null!);
  const jetGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);
  // giros ACUMULADOS (nunca `t * velocidade`: quando a carga mexe na
  // velocidade, ângulo absoluto daria salto — as bandas do disco têm que
  // acelerar suave junto com o disco)
  const spins = useRef<Record<number, number>>({});

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const diskIdx = useMemo(() => visParts.findIndex((p) => p.tag === 'disk.accr'), [visParts]);

  /** UMA wrapper por grupo orbital: a corte plantada (pilares, torres, lages,
   *  goela, mastro, espinhos — tudo parafusado no soalho dos dezessete), as
   *  DUAS garras nas torres (cada uma no eixo vertical da sua torre), os cinco
   *  corpos orbitais e o DISCO à parte (ele não é grupo: o rig inclina o anel
   *  sozinho e o shader gira as bandas) */
  const buckets = useMemo(() => {
    const planted: number[] = []; // soalho, corte, torres, goela, coroa
    const arms: { i: number; side: number }[] = [];
    const byGroup = new Map<number, number[]>();
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (tag === 'disk.accr') return; // vai à parte, com wrapper próprio
      if (p.group !== undefined && modelDef.groups?.[p.group] !== undefined) {
        const arr = byGroup.get(p.group) ?? [];
        arr.push(i);
        byGroup.set(p.group, arr);
      } else if (tag.startsWith('arm')) arms.push({ i, side: p.p[2] < 0 ? -1 : 1 });
      else planted.push(i);
    });
    return { planted, arms, orbitals: [...byGroup.entries()] };
  }, [visParts, modelDef]);

  /** atores da coreografia */
  const actors = useMemo(() => {
    const lamps: number[] = []; // coroa + punho + tampa do fuso (escala no flare)
    const comets: number[] = []; // arm.core/arm.tail: o GRÃO engolido na afinação
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (tag === 'crown.lamp' || tag === 'well.cap') lamps.push(i);
      else if (tag === 'arm.core' || tag === 'arm.tail') comets.push(i);
    });
    return { lamps, comets };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // ---- O DISCO DE ACREFÃO (shader próprio, HDR pro bloom): anel de fótons
  // junto ao horizonte, bandas de gás com ω ∝ ρ^−1,5 e franja ember na borda
  const disk = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpin: { value: 0 }, // ângulo ACUMULADO (a carga acelera sem salto)
        uCharge: { value: 0 },
        uJet: { value: 0 },
        uAlpha: { value: 1 },
        uInner: { value: PRIMORDIAL_HORIZON_R },
        uOuter: { value: PRIMORDIAL_DISK_R },
        uHot: { value: new THREE.Color(PRIMORDIAL_QUASAR) },
        uMid: { value: new THREE.Color(PRIMORDIAL_ICE) },
        uEmber: { value: new THREE.Color(PRIMORDIAL_EMBER) },
      },
    });
    return { mat };
  }, []);

  const partMats = useMemo(() => {
    // A RÉGUA DO RELEVO (herança do Colosso): amplitude da ordem do raio da peça
    // INFLA a peça em vez de texturizá-la; peça miúda come relevo miúdo.
    const ampOf = (p: Part, base: number): number => {
      const g = getGeometry(p.g, p.a);
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox ?? new THREE.Box3();
      const s = p.s ?? [1, 1, 1];
      const rMin =
        Math.min(
          (b.max.x - b.min.x) * s[0],
          (b.max.y - b.min.y) * s[1],
          (b.max.z - b.min.z) * s[2],
        ) / 2;
      return Math.round(Math.min(base, rMin * 0.25) * 200) / 200;
    };
    const kernel = new THREE.MeshBasicMaterial({ color: '#0b0812' }); // o colarinho
    // da goela: breu puro — é a moldura do horizonte, não pedra
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
      if (tag === 'disk.accr') return disk.mat; // o disco: pintura pura
      if (p.m === 'black') return kernel;
      if (p.m === 'glow') {
        const amp = ampOf(p, QUASAR_PLASMA.amp);
        // SÓ miudezas de luz usam plasma: a tampa do fuso (a lâmpada do
        // horizonte), as lâmpadas da coroa, o punho e o grão segurado
        return pick(
          `quasar|${amp}|${tag === 'well.cap' ? 'cap' : tag.startsWith('arm') ? 'grain' : 'lamp'}|${i % 2}`,
          () =>
            makeCoreMaterial({
              gold: QUASAR_PLASMA.gold, // = a cor do motor (cap→rajada→impacto)
              white: QUASAR_PLASMA.white,
              cool: QUASAR_PLASMA.cool,
              amp,
              seed: 4.3 + (i % 2) * 2.9,
            }),
        );
      }
      if (p.m === 'trans') {
        // as lunetas de VENTO são gelo translúcido (a herança do pai Astral lida
        // como casca de nuvem de cristal, alpha baixo — nunca o plasma do Raio)
        const amp = ampOf(p, 0.02);
        return pick(`ice|${amp}|${i % 2}`, () =>
          makeIceMaterial({
            iceA: PRIMORDIAL_ICE,
            iceB: '#2a3a56',
            crack: PRIMORDIAL_QUASAR,
            amp,
            crackGlow: 0.8,
            crackScale: 2.4,
            crackWidth: 0.03,
            sparkle: 0.7,
            alpha: 0.34,
            seed: seed + (i % 2) * 2.7,
            breath: 0.5,
            teamColor: TEAM_TINT.neutral,
          }),
        );
      }
      if (p.m === 'accent') {
        const amp = ampOf(p, p.amp ?? ICESTONE_LOOK.amp);
        return pick(`icestone|${amp}|${tag === 'crown.ring' ? 'band' : tag === 'orbital.rock' ? 'rock' : 'lunet'}|${i % 2}`, () =>
          makeStoneMaterial({
            rockA: ICESTONE_LOOK.rockA,
            rockB: ICESTONE_LOOK.rockB,
            crack: ICESTONE_LOOK.crack, // = a cor do motor na fratura do gelo
            amp,
            crackGlow: tag === 'crown.ring' ? ICESTONE_LOOK.crackGlow * 1.3 : ICESTONE_LOOK.crackGlow,
            crackScale: ICESTONE_LOOK.crackScale,
            crackWidth: ICESTONE_LOOK.crackWidth,
            crackBoost: ICESTONE_LOOK.crackBoost,
            speck: ICESTONE_LOOK.speck,
            seed: seed + (i % 2) * 2.7,
            breath: 0.4,
            teamColor: TEAM_TINT.neutral,
          }),
        );
      }
      const deep = p.m === 'dark';
      const L = deep ? CANTARIA_DEEP_LOOK : GEOBRUTA_LOOK;
      const amp = ampOf(p, p.amp ?? L.amp);
      return pick(`geobruta|${deep ? 'deep' : 'frost'}|${amp}|${tag.startsWith('court') ? 'court' : tag.startsWith('well') ? 'well' : tag.startsWith('crown') ? 'crown' : tag.startsWith('arm') ? 'arm' : 'hard'}|${i % 2}`, () =>
        makeStoneMaterial({
          rockA: L.rockA,
          rockB: L.rockB,
          crack: L.crack, // = a cor do motor (o veio de azó de toda a pedra)
          amp,
          crackGlow: L.crackGlow,
          crackScale: tag === 'court.pylon' || tag === 'well.spindle' || tag === 'well.hub' ? L.crackScale : L.crackScale * 1.7, // vara e lage miúdas não comportam veio largo
          crackWidth: L.crackWidth,
          crackBoost: L.crackBoost,
          speck: L.speck,
          seed: seed + (i % 2) * 3.1,
          breath: 0.45,
          teamColor: TEAM_TINT.neutral,
        }),
      );
    });
    const shaders = [...cache.values()]; // o DISCO fica FORA do loop: uniformes próprios
    for (const m of shaders) {
      m.userData.kind = m.fragmentShader.includes('uSpeck') ? 'stone' : 'core';
    }
    return { list, uniq: [...cache.values(), kernel], shaders };
  }, [visParts, seed, level, disk]);

  // o JATO de azó: cone aberto (semi-cilindro de dezessete faces) cavalgando o
  // eixo da rajada, saindo do FURO do horizonte na direção do alvo. A rajada do
  // motor nasce em PRIMORDIAL_MUZZLE — o cone é LUZ atravessando gás (aditivo,
  // depthWrite off): ele fura a franja interna do disco de propósito, é isso que
  // faz um quasar ler quasar (o jato relativístico varando o disco de acreção)
  const jet = useMemo(
    () => ({
      geo: new THREE.CylinderGeometry(0.24, 0.05, 1.1, 17, 1, true),
      mat: new THREE.ShaderMaterial({
        vertexShader: JET_VERT,
        fragmentShader: JET_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uJet: { value: 0 },
          uAlpha: { value: 1 },
          uHot: { value: new THREE.Color(PRIMORDIAL_QUASAR) },
          uCool: { value: new THREE.Color(PRIMORDIAL_ICE) },
        },
      }),
    }),
    [],
  );

  // PÓ DE QUASAR: grãos de matéria caçada ORBITANDO o plano inclinado do disco
  // com ω ∝ 1/ρ (o mesmo motor do pó de anel do Colosso e do grão do Astral —
  // aqui é gás de estrela, não talco de lua morta). Quente perto do horizonte
  // (azo), frio na franja ember da borda.
  const motes = useMemo(() => {
    const geo = makeMoteGeo(moteCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUASAR_DUST_VERT,
      fragmentShader: QUASAR_DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
        uSnap: { value: 0 },
        uDiskY: { value: PRIMORDIAL_DISK_Y },
        uTilt: { value: PRIMORDIAL_DISK_TILT }, // o pó cai no MESMO plano do anel
        uWarm: { value: new THREE.Color(PRIMORDIAL_QUASAR) },
        uCool: { value: new THREE.Color(PRIMORDIAL_EMBER) },
      },
    });
    return { geo, mat };
  }, [moteCount, emberScale]);

  // rocha/gelo/miudezas de luz leem aSeed por vértice (a lição WebKit); clonamos
  // só os que usam
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
      disk.mat.dispose();
      jet.geo.dispose();
      jet.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, disk, jet, motes]);

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
      if (demoT.current > PRIMORDIAL_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const dying = 1 - alpha; // morrendo: o disco apaga, o pó racha e o jato morre
    const striking =
      sinceAttack >= PRIMORDIAL_ATTACK_WINDOW * PRIMORDIAL_WINDUP &&
      sinceAttack <= PRIMORDIAL_ATTACK_WINDOW;
    if (!striking) strikeDone.current = false;

    // ---- PÓ DE ESTRELA ENGOLE na goela do buraco no instante do sopro:
    // DEZESSETE baforadas (o primo dezessete até na pluma), na direção da rajada.
    // heat 0,05: matéria recém-caçada quase fria — o oposto da cinza incandescente
    // do pai Vulcânico; o jato é luz, a pluma é o que sobra do grão ----
    if (striking && !strikeDone.current && smoke) {
      strikeDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 17; i++) {
        const a = (i / 17) * Math.PI * 2 + Math.random() * 0.5;
        tmpWorld
          .set(
            PRIMORDIAL_MUZZLE[0] + Math.cos(a) * (0.12 + Math.random() * 0.22),
            PRIMORDIAL_MUZZLE[1] - 0.1 + Math.random() * 0.5,
            PRIMORDIAL_MUZZLE[2] + Math.sin(a) * (0.12 + Math.random() * 0.22),
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.12 + Math.random() * 0.1,
          heat: 0.05, // azo quase frio com o miolo ainda aceso
          life: 1.1 + Math.random() * 0.7,
          lifeVar: 0.5,
          jitter: 0.28,
          rise: 0.3,
          drag: 2.4,
          vx: (Math.random() - 0.5) * 1.1,
          vy: 0.25 + Math.random() * 0.7,
          vz: 0.5 + Math.random() * 1.1, // a pluma vai JUNTO com o jato
        });
      }
    }

    // ---- uniforms: geobruta, cantaria, gelo e núcleos de azó no MESMO loop ----
    const drift =
      Math.sin(t * 0.42 + seed) * 0.3 +
      Math.sin(t * 1.3 + seed * 0.6) * 0.22 +
      Math.sin(t * 0.21 + 1.4) * 0.35; // o templo respira como maré de maré funda
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'core' ? 0.12 : 0.22);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1.3 : 0.8) + pose.jet * 0.2 + dying * 0.35);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = drift * (0.5 + 0.5 * hpFrac) + pose.quake * 0.4;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + dying * 1.7 + pose.quake * 0.3);
      // a afinação acende o veio de azó da pedra inteira: o templo fica mais
      // aceso conforme o disco carrega e o jato varre
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.7 + pose.jet * 0.5);
      }
    }

    // ---- uniforms do DISCO e do PÓ DE QUASAR ----
    disk.mat.uniforms.uTime.value = t;
    disk.mat.uniforms.uCharge.value = pose.charge;
    disk.mat.uniforms.uJet.value = pose.jet;
    disk.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 0.9 + pose.jet * 1.1);
    motes.mat.uniforms.uSnap.value = pose.quake;

    // ---- O DISCO: só a INCLINAÇÃO (o spin diferencial é do shader, arrastado
    // pelo ângulo acumulado — girar o wrapper E o shader contaria a rotação duas
    // vezes). O tilt oscila APENAS em [0,42, 0,50]: é daqui que sai a régua de
    // folgas do figurino (a superfície varre Y_D ± ρ·tan(0,5) em todo azimute) ----
    spins.current[-1] = (spins.current[-1] ?? 0) + dt * (0.5 + pose.charge * 0.55 + pose.jet * 0.9) * (1 - dying * 0.9);
    disk.mat.uniforms.uSpin.value = spins.current[-1];
    const tiltRaw =
      PRIMORDIAL_DISK_TILT +
      0.03 * Math.sin(t * 0.31 + seed) +
      0.006 * Math.sin(t * 1.17 + seed * 0.8) +
      pose.charge * 0.003 +
      pose.jet * 0.004;
    const tilt = Math.max(0.42, Math.min(PRIMORDIAL_TILT_MAX, tiltRaw));
    motes.mat.uniforms.uTilt.value = tilt; // o pó cai no plano de AGORA, não no de descanso
    tmpQ.setFromAxisAngle(tmpAxis.set(1, 0, 0), tilt); // precessão: qTilt no pivô
    const dp = visParts[diskIdx];
    if (diskRef.current && dp) {
      const base = dp.r ?? [0, 0, 0];
      tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])); // o anel deitado
      diskRef.current.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpPivot.set(PRIMORDIAL_DISK_PIVOT[0], PRIMORDIAL_DISK_PIVOT[1], PRIMORDIAL_DISK_PIVOT[2]);
      diskRef.current.position.copy(tmpPivot); // o pivô É o centro do anel: sem translação
    }

    // ---- OS CINCO CORPOS ORBITAIS: rotação diferencial ACUMULADA (a cinta
    // rasteira 0 a 0,34, o entulho do meio 1 ao CONTRÁRIO, os anéis de contenção
    // 3, o orbe alto 4 e as lunetas 5). Na afinação a coroa de anéis ACELERA com
    // o disco e no sopro ela DESTORA ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital).map(Number)) {
      const grp = groupRefs.current[gid];
      if (!grp) continue;
      const band = gid === 3;
      const boost = band ? 1 + pose.charge * 1.1 + pose.jet * 1.6 : 1 + pose.charge * 0.3 + pose.jet * 0.5;
      spins.current[gid] = (spins.current[gid] ?? 0) + dt * orbital[gid] * boost * (1 - dying * 0.85);
      grp.quaternion.setFromAxisAngle(tmpAxis.set(0, 1, 0), spins.current[gid]);
      grp.position.set(0, 0, 0);
    }

    // ---- AS DUAS GARRAS NAS TORRES: o braço INTEIRO gira no eixo VERTICAL da
    // torre, uma quaternión só. O lado espelhado (k 13, z<0) usa o ângulo
    // NEGADO — o espelho no Z conjuga Ry(β) em Ry(−β). Rodando na vertical da
    // torre o ρ de cada peça nunca pode furar a borda do disco (a distância ao
    // eixo da torre é o teto do avanço: 2,62 − 0,21 = 2,41 > 2,28) ----
    const beta = pose.gather * 0.26 + Math.sin(t * 0.55 + seed) * 0.012 * (1 - dying);
    for (const side of [-1, 1]) {
      const grp = armRefs.current[side + 1];
      if (!grp) continue;
      const [pvX, , pvZ] = primTowerPivot(side);
      tmpQ.setFromAxisAngle(tmpAxis.set(0, 1, 0), side > 0 ? beta : -beta);
      grp.quaternion.copy(tmpQ);
      tmpWorld.set(pvX, 0, pvZ).applyQuaternion(tmpQ);
      grp.position.set(pvX - tmpWorld.x, 0, pvZ - tmpWorld.z);
    }

    // ---- O JATO DE AZÓ: invisível fora da rajada; na ignição ele cresce do
    // furo do fuso até varrer a frente, e assenta antes do fim da janela ----
    jet.mat.uniforms.uTime.value = t;
    jet.mat.uniforms.uJet.value = pose.jet;
    jet.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const jetOn = pose.jet > 0.02;
    jetRef.current.visible = jetOn;
    if (jetOn) {
      const s = pose.jet;
      jetRef.current.scale.set(0.5 + s * 0.6, 0.55 + s * 0.75, 0.5 + s * 0.6);
    }
    const jglow = jetGlowRef.current;
    jglow.scale.setScalar(0.26 + pose.jet * 0.5 + pose.charge * 0.12);
    (jglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + 0.02 * Math.sin(t * 2.6 + seed) + pose.charge * 0.06 + pose.jet * 0.3) * alpha,
    );

    // ---- A TAMPA DO FUSO E AS LÂMPADAS DA COROA ACENDEM no flare (a única luz
    // com geometria do templo: a luz-de-azo do motor) ----
    const bs0 = [1, 1, 1];
    for (const i of actors.lamps) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const isCap = (part.tag ?? '') === 'well.cap';
      let sc = 1 + 0.08 * Math.sin(t * (2.6 + (i % 5) * 0.6) + i * 1.7 + seed);
      sc *= 1 + pose.flare * (isCap ? 0.16 : 0.22) + pose.jet * (isCap ? 0.5 : 0.2) + pose.charge * (isCap ? 0.18 : 0.05) - dying * 0.5;
      mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
    }

    // ---- O GRÃO ENGOLIDO: o cometa segurado (arm.core/arm.tail) MURCHA na
    // afinação e APAGA quando a carga enche (matéria engolida pelo horizonte — a
    // luz recolhe no furo e a rajada sai de lá). Refaz depois, flicker de grão
    // novo caçando de volta ----
    for (const i of actors.comets) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const swallow = 1 - Math.min(1, pose.charge * 1.15);
      let sc = Math.max(0.001, swallow) * (1 - dying * 0.6);
      if (part.flick) sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      mesh.visible = sc > 0.02;
    }

    // ---- o resto: os detritos cintilam (o `flick` do figurino) e os anéis de
    // contenção pulsam miúdo com o disco ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const tag = part.tag ?? '';
      if (tag === 'crown.lamp' || tag === 'well.cap' || tag === 'arm.core' || tag === 'arm.tail') continue;
      let sc = 1;
      if (tag === 'crown.ring') sc *= 1 + pose.charge * 0.05 + pose.jet * 0.12;
      if (part.flick) sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      if (sc !== 1) {
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }

    // ---- corpo: PLANTADO NA CORTE DOS DEZESSETE (floatY 0 — o templo não boia;
    // a coleta tomba o templo miúdo no lean, o coice do jato é o QUAKE da
    // gravidade cedendo no soalho: forte mas abaixo do colosso, porque aqui o
    // soco é luz e não planetóide) ----
    const g = rootRef.current;
    const breathe = Math.sin(t * 0.36 + seed) * 0.004;
    g.scale.set(
      1 + breathe + pose.gather * 0.008 + pose.quake * 0.008 - dying * 0.05,
      1 + breathe - pose.gather * 0.012 - dying * 0.1,
      1 + breathe + pose.gather * 0.008 + pose.quake * 0.008 - dying * 0.05,
    );
    g.position.x = Math.sin(t * 31 + seed) * 0.03 * pose.quake;
    g.position.z = Math.cos(t * 27 + seed * 0.7) * 0.026 * pose.quake - pose.recoil * 0.05;
    g.position.y = -pose.recoil * 0.02 + Math.sin(t * 25 + seed) * 0.008 * pose.quake;
    g.rotation.y = Math.sin(t * 0.17 + seed) * 0.008 + pose.gather * 0.02;
    g.rotation.x = pose.lean * 0.012 + pose.quake * 0.004;
    void topY; // forma única Nv.10 — o topo amarrado nos testes
    void PRIMORDIAL_CORTE_R; // a régua do anel vem das constantes amarradas
  });

  return (
    <group ref={rootRef}>
      {buckets.planted.map((i) => (
        <mesh
          key={`pl${level}-${i}`}
          ref={(m) => {
            partRefs.current[i] = m;
          }}
          geometry={partGeos[i]}
          material={partMats.list[i]}
          position={visParts[i].p}
          rotation={visParts[i].r ?? [0, 0, 0]}
          scale={visParts[i].s ?? 1}
          castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'}
        />
      ))}
      {/* as duas garras, cada uma no eixo vertical da sua torre (k 4 / k 13 —
          o par espelhado no Z de 17 lados; a quaternión vem do rig) */}
      {[-1, 1].map((side) => (
        <group
          key={`arm${side}-${level}`}
          ref={(gr) => {
            armRefs.current[side + 1] = gr;
          }}
        >
          {buckets.arms
            .filter((a) => a.side === side)
            .map(({ i }) => (
              <mesh
                key={`al${level}-${i}`}
                ref={(m) => {
                  partRefs.current[i] = m;
                }}
                geometry={partGeos[i]}
                material={partMats.list[i]}
                position={visParts[i].p}
                rotation={visParts[i].r ?? [0, 0, 0]}
                scale={visParts[i].s ?? 1}
                castShadow={visParts[i].m !== 'glow' && visParts[i].m !== 'black' && visParts[i].m !== 'trans'}
              />
            ))}
        </group>
      ))}
      {buckets.orbitals.map(([gid, indices]) => (
        <group
          key={`g${gid}-${level}`}
          ref={(gr) => {
            groupRefs.current[gid] = gr;
          }}
        >
          {indices.map((i) => (
            <mesh
              key={`p${level}-${i}`}
              ref={(m) => {
                partRefs.current[i] = m;
              }}
              geometry={partGeos[i]}
              material={partMats.list[i]}
              position={visParts[i].p}
              rotation={visParts[i].r ?? [0, 0, 0]}
              scale={visParts[i].s ?? 1}
              // só a rocha projeta sombra: luz translúcida viraria bloco preto
              // no piso (a lição do funil da Névoa) — e o DISCO nunca projeta
              castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'}
            />
          ))}
        </group>
      ))}
      {/* O DISCO DE ACREFÃO: uma malha, wrapper só de inclinação no pivô
          (0, Y_D, 0); o spin diferencial é pintura no frag */}
      {diskIdx >= 0 && (
        <mesh
          ref={diskRef}
          geometry={partGeos[diskIdx]}
          material={partMats.list[diskIdx]}
          position={visParts[diskIdx].p}
          renderOrder={2}
        />
      )}
      {/* o JATO de dezessete faces varando o furo do horizonte na direção do
          alvo + o halo na boca do buraco */}
      <mesh
        ref={jetRef}
        geometry={jet.geo}
        material={jet.mat}
        position={[PRIMORDIAL_MUZZLE[0], PRIMORDIAL_MUZZLE[1], PRIMORDIAL_MUZZLE[2] + 0.55]}
        rotation={[Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={3}
      />
      <sprite ref={jetGlowRef} position={[PRIMORDIAL_MUZZLE[0], PRIMORDIAL_MUZZLE[1], PRIMORDIAL_MUZZLE[2] + 0.2]}>
        <spriteMaterial
          map={circleTexture()}
          color={PRIMORDIAL_QUASAR}
          transparent
          opacity={0.05}
          depthWrite={false}
        />
      </sprite>
      {/* o pó de quasar orbitando o plano inclinado em velocidade diferencial */}
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} renderOrder={2} />
    </group>
  );
}

/**
 * O DISCO DE ACREFÃO (a assinatura do Nv.10): o anel é RÍGIDO e o rig só o
 * INCLINA — o spin diferencial mora AQUI, bandas arrastadas pelo ângulo
 * acumulado uSpin com ω ∝ ρ^−1,5 (as de dentro dão mais voltas que as de fora;
 * como o ângulo é acumulado, a carga acelerando o disco não dá salto de fase).
 * O anel de fótons rente ao horizonte (0,62) sai em HDR (>1) pra alimentar o
 * bloom gateado da arena, com feixe doppler (um lado mais aceso); a meia-
 * envergadura é gelo, e a franja da borda (2,0–2,28) é ember esfriando. O astro
 * NÃO tem geometria: o furo ρ<0,62 é o vazio do horizonte de eventos.
 */
const DISK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSpin;
uniform float uCharge;
uniform float uJet;
uniform float uAlpha;
uniform float uInner;
uniform float uOuter;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uEmber;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  // o uv do RingGeometry varre a CAIXA do anel inteiro: rho = |uv-0.5|·2·borda
  float rho = length(c) * 2.0 * uOuter;
  if (rho < uInner || rho > uOuter) discard;
  float ang = atan(c.y, c.x);
  // rotação DIFERENCIAL: ω ∝ ρ^−1,5 ancorada no horizonte; o ângulo é o
  // acumulado do rig (uSpin), então a carga acelerando o disco nunca dá salto
  // de fase. A base do pow vem do rho que o discard acima crava em ≥ uInner > 0, então
  // ela é sempre ≥ 1: pow com base NEGATIVA é INDEFINIDO em GLSL (vira NaN no
  // ANGLE/D3D11 do WebKit — lesson do quadrado preto no HANDOFF)
  float rate = pow(rho / uInner, -1.5);
  float b = ang + uSpin * rate;
  // gás em duas famílias de bandas (sem noise: senão o print engordura o disco)
  float g1 = 0.5 + 0.5 * sin(b * 9.0 + rho * 17.0);
  float g2 = 0.5 + 0.5 * sin(b * 4.0 - rho * 6.0 + 2.1);
  float dens = 0.35 + 0.65 * (g1 * 0.6 + g2 * 0.4);
  // quente no horizonte, gelo na meia-envergadura, ember esfriando na borda
  vec3 col = mix(uHot, uMid, smoothstep(0.75, 1.55, rho));
  col = mix(col, uEmber, smoothstep(2.0, 2.16, rho));
  // o ANEL DE FÓTONS: uma volta HDR rente ao horizonte (é o que segura o bloom
  // pra leitura de quasar) com o feixe doppler — um lado do anel vem de frente
  float drho = (rho - (uInner + 0.045)) / 0.055;
  // o quadrado é feito com multiplicação, NÃO com pow: a base passa por negativa
  // dentro do anel e pow(base<0, x) é INDEFINIDO em GLSL (= NaN no WebKit);
  // x*x é exato e não tem caso indefinido nenhum
  float ring = exp(-drho * drho);
  float beam = 1.0 + 0.45 * cos(ang - 1.0);
  col += uHot * ring * (1.4 + 0.5 * sin(ang * 7.0 + uTime * 1.7)) * beam;
  // na afinação o disco todo esquenta; no sopro ele infla
  col *= 1.0 + uCharge * 0.5 + uJet * 0.8;
  float edge = smoothstep(uInner, uInner + 0.04, rho) * smoothstep(uOuter, uOuter - 0.12, rho);
  float a = dens * edge * uAlpha * 0.5;
  if (!(a > 0.002)) discard; // discard à prova de NaN (ver JET_FRAG)
  gl_FragColor = vec4(col, a);
}
`;

/** o JATO: cone de dezessete faces cavalgando o eixo da rajada, brilhando na
 *  boca do buraco e desbotando na ponta (a luz de azó do motor varando o gás) */
const JET_VERT = /* glsl */ `
uniform float uTime;
uniform float uJet;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 pos = position;
  pos += normal * 0.015 * sin(uTime * 9.0 + position.y * 14.0) * (0.4 + uJet);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const JET_FRAG = /* glsl */ `
uniform float uJet;
uniform float uAlpha;
uniform vec3 uHot;
uniform vec3 uCool;
varying vec2 vUv;
void main() {
  // 0 = boca do buraco (estreita), 1 = ponta (larga). O vUv vem interpolado com
  // correção de perspectiva: nas bordas do cone ele passa de 1,0 em alguns ULPs.
  // SEM o clamp, a base "1.0 - along" fica NEGATIVA e pow(base negativa,
  // fração) é INDEFINIDO em GLSL -> NaN. É um punhado de texels por frame (6-10), mas o
  // highpass do bloom os pesca e CADA borrão da escada de mips MULTIPLICA a
  // área contaminada (91 -> 912 -> 6.992 -> 48.096 -> 309.132 texels), e o
  // compósito somatório devolve essa mancha pro buffer da cena — onde a cópia
  // final amostra NaN como PRETO PURO. Foi assim que "o monstro inteiro e seus
  // ataques viraram quadrados pretos" no iOS/WebKit (02/nov): a caixa medida na
  // sonda tinha exatos 560x556 px, e esconder só ESTE mesh zerava o NaN da cena.
  float along = clamp(vUv.y, 0.0, 1.0);
  float fall = pow(1.0 - along, 1.35); // aceso na boca, desbotando na ponta
  float core = pow(1.0 - abs(along - 0.0), 2.0);
  vec3 col = mix(uHot, uCool, along) * (1.0 + core * 1.2);
  float a = fall * uJet * uAlpha * 0.85;
  // discard À PROVA DE NaN: "a <= 0.002" é FALSO pra NaN, então a comparação
  // escrita "ao natural" deixa o texel podre PASSAR e escrever no buffer.
  // Invertida ("!(a > 0.002)"), ela captura NaN/Inf junto e descarta.
  if (!(a > 0.002)) discard;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * PÓ DE QUASAR: cada grão escolhe um raio e um ângulo e ORBITA o plano
 * INCLINADO do disco com ω ∝ 1/ρ (rotação diferencial — o mesmo motor do pó de
 * anel do Colosso, aqui em gás de estrela e não em talco de lua morta; caído
 * pela MESMA inclinação que o rig aplica ao anel). Quente perto do horizonte
 * (azo #e8f6ff), frio na franja ember da borda: a curva de cor do quasar.
 */
const QUASAR_DUST_VERT = /* glsl */ `
attribute vec3 aRand; // x: angulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uSnap;
uniform float uDiskY;
uniform float uTilt;
uniform vec3 uWarm;
uniform vec3 uCool;
varying float vA;
varying vec3 vC;
void main() {
  const float TAU = 6.28318;
  // os grãos nascem NA FAIXA do disco (do horizonte 0,62 à borda 2,28): poeira
  // de matéria caçada orbitando junto, não nuvem solta boiando no escuro
  float band = step(0.72, aRand.z);
  float r = 0.64 + 1.62 * aRand.z;
  float omega = (1.4 / r) * (1.0 + uCharge * 0.5 + uSnap * 1.2);
  float ang = aRand.y * TAU + uTime * omega * (band > 0.5 ? 0.6 : 1.0);
  float prog = fract(uTime * (0.07 + 0.11 * aRand.z) + aRand.y * 3.7);
  float lift = band * prog * prog * (0.35 + 0.3 * aRand.z + uSnap * 0.9);
  float py = 0.02 + 0.04 * sin(uTime * 1.2 + aRand.y * 9.0) + lift;
  float rr = r * (1.0 + prog * (0.04 + uSnap * 0.15));
  // o grão nasce no plano HORIZONTAL e é caído pela MESMA inclinação que o rig
  // aplica ao anel (R_x: y' = y·cos - z·sin)
  float px = cos(ang) * rr;
  float pz = sin(ang) * rr;
  vec3 p = vec3(px, uDiskY + py * cos(uTilt) - pz * sin(uTilt), py * sin(uTilt) + pz * cos(uTilt));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // grão de luz fria com halo largo (gás de estrela, não faísca de foguete)
  float size = (1.5 + 2.2 * aRand.z) * (0.85 + uCharge * 0.45) * uSizeMul;
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.45 + 0.45 * aRand.z) * (1.0 - prog * 0.6) * uAlpha;
  // curva de cor: o grão quente é o que raspa o horizonte, o de fora esfria em
  // ember na franja da borda
  vC = mix(uWarm, uCool, smoothstep(0.7, 2.2, r));
  gl_Position = projectionMatrix * mv;
}
`;

const QUASAR_DUST_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // puff macio (gás em suspensão, não grão duro de regolito)
  float m = smoothstep(0.5, 0.06, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.34);
}
`;
