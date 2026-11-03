import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import {
  MODELS,
  partsForLevel,
  PRIMORDIAL_DISK_Y,
  PRIMORDIAL_DISK_IN,
  PRIMORDIAL_DISK_R,
  PRIMORDIAL_DISK_TILT,
  PRIMORDIAL_TILT_MAX,
  PRIMORDIAL_MUZZLE,
  PRIMORDIAL_QUASAR,
  PRIMORDIAL_GOLD,
  PRIMORDIAL_EMBER,
  PRIMORDIAL_DEEP,
} from './speciesModels';
import type { Part } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do PRIMORDIAL (Nv.10 — Astral+Colosso: O QUASAR SUPERMASSIVO que precede
 * os quatro elementos). Desde o rework de 03/nov a criatura é APENAS o quasar:
 * a ESFERA NEGRA do horizonte de eventos (agora com geometria — breu puro), o
 * DISCO DE ACREÇÃO (ρ 0,96→3,0 — a assinatura elogiada, mais larga e girando
 * BEM mais rápido), o ANEL DE FÓTONS rente ao ombro da esfera e os DOIS ARCOS
 * DE LENTE que desenham a silhueta SUPERIOR e INFERIOR do disco sobre o breu
 * (o look Gargantua do Interestelar). O templo dos dezessete pilares caiu.
 *
 * A física do disco continua mandando: o anel é RÍGIDO e PRECESSIONA em Y
 * (q = qTilt·qBase no pivô (0, Y_D, 0)), o tilt oscila APENAS em [0,42, 0,50]
 * (PRIMORDIAL_TILT_MAX é a régua da folga do deck: Y_D − 3,0·sin(0,5) ≈ 0,95
 * na borda — o quasar paira) e o spin diferencial mora no SHADER (bandas
 * arrastadas pelo ângulo acumulado `uSpin`, ω ∝ ρ^−1,5 — o wrapper nunca gira
 * o anel, só o inclina; girar os dois contaria a rotação duas vezes).
 *
 * O CÉU (anel de fótons + arcos de lente) mora no plano vertical de frente e
 * o rig o vira inteiro para ENCARAR A CÂMERA (billboard em Y no eixo da
 * esfera): o anel de lente é uma projeção no plano do céu, não uma peça do
 * disco — por isso ele nunca entra no wrapper de inclinação.
 *
 * Três shaders próprios: o DISCO (ouro-quasar na boca, ouro na
 * meia-envergadura, ember esfriando na borda; anel de fótons em HDR pro bloom
 * com feixe doppler), o JATO (cone aberto de dezessete faces saindo do ventre
 * da esfera) e o PÓ DE QUASAR (grãos orbitando o MESMO plano inclinado com
 * ω ∝ 1/ρ). A luz é OURO QUASAR — o azó frio do desenho antigo morreu junto
 * com o templo.
 *
 * A coreografia (interval 1,5 — a cadência do Nv.10, JANELA 0,94 s entre a do
 * astral e a do colosso, 0,6 dela é afinação): o disco ACENDE e as bandas
 * ACELERAM (charge), o anel de fótons e as lentes incham (flare), e no
 * estouro o JATO varre do ventre da esfera (jet — a rajada do motor:
 * piercing + chain + burn), o disco infla em flare e o QUAKE é a gravidade
 * cedendo. Todos os canais assentam em ~0 antes do fim da janela
 * (continuidade amarrada em teste).
 */

const PRIMORDIAL_DEF = getSpecies('primordial');

/** janela e afinação: cadência 1,5 do Nv.10 — a janela (0,94) fica entre o
 *  astral (0,74 no interval 1,2) e o colosso (1,25 no 2,5); 0,6 dela é afinação
 *  porque a arma é um JATO contínuo (pierce 2 + chain 3) */
export const PRIMORDIAL_ATTACK_WINDOW = 0.94;
export const PRIMORDIAL_WINDUP = 0.6;

/** identidade amarrada em teste: luz-de-quasar #ffeccb (= projectileColor do
 *  motor = glow do figurino = anel de fótons = veio da rajada), o ouro #ffd66b
 *  (= body: a meia-envergadura do disco) e o ember #ff7a3c esfriando na borda */
export { PRIMORDIAL_QUASAR, PRIMORDIAL_GOLD, PRIMORDIAL_EMBER, PRIMORDIAL_DEEP };

/** a rotação ALTA pedida no rework (03/nov): o ângulo acumulado do disco sobe
 *  a 2,4 rad/s no descanso (era 0,5), e a carga/jato somam quase o dobro —
 *  amarrado em teste: `PRIMORDIAL_SPIN.base ≥ 2` */
export const PRIMORDIAL_SPIN = { base: 2.4, charge: 1.7, jet: 2.6 };

/** a MATÉRIA VITRIFICADA (a única "pedra" que sobrou depois que o templo
 *  caiu): escória de plasma que já passou pelo poço e esfriou em vidro dourado
 *  com o veio de luz-de-quasar do motor correndo por dentro. É o corpo da
 *  rajada (a lança de dezessete faces) e as farpas do impacto — identidade
 *  boca→rajada→FX amarrada em teste */
export const SINTER_LOOK = {
  rockA: '#e6cfa6', // escória vitrificada: clara, quente, vítroa
  rockB: '#5c4630', // a sombra da escória (nunca cinza frio — o azó morreu)
  crack: PRIMORDIAL_QUASAR, // = a cor do motor
  amp: 0.03,
  crackGlow: 0.8,
  crackScale: 2.2,
  crackWidth: 0.036,
  crackBoost: 0.9,
  speck: 0.7,
};

/** o plasma do horizonte: branco-quasar com o ouro na borda — SÓ no anel de
 *  fótons e no miolo do jato (traço estrutural nunca é translúcido) */
export const QUASAR_PLASMA = {
  gold: PRIMORDIAL_QUASAR,
  white: '#ffffff',
  cool: PRIMORDIAL_GOLD, // o contorno é o OURO do disco, nunca o azó antigo
  amp: 0.03,
};

/** pivô do disco (e centro da esfera negra): o centro do anel (o wrapper só
 *  INCLINA no pivô — o spin diferencial é do shader) */
export const PRIMORDIAL_DISK_PIVOT: [number, number, number] = [0, PRIMORDIAL_DISK_Y, 0];

export interface PrimordialRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** grãos de poeira de quasar orbitando o plano inclinado do disco — TRINTA E
   *  QUATRO (o primo dezessete: 2×17 do anel de poeira do Colosso) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o PRIMORDIAL exala VAPOR VITRIFICADO com heat 0,18
   *  (matéria arrancada do disco — quente, mas plasma que esfria rápido, nunca
   *  a cinza incandescente do pai Vulcânico) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpAxis = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

/**
 * A coreografia do quasar: `lean` é o quasar inteiro tombando na respiração
 * funda, `charge` é o disco esquentando e as bandas acelerando, `flare` acende
 * o anel de fótons e as lentes, `jet` é o JATO varrendo do ventre da esfera no
 * estouro (a rajada do motor) e `quake` é a gravidade cedendo. Todos voltam a
 * ~zero no fim da janela e são zero fora dela. (O `gather` das garras morreu
 * junto com o templo.)
 */
export function attackPose(since: number) {
  const p = { lean: 0, charge: 0, flare: 0, jet: 0, recoil: 0, quake: 0 };
  if (since < 0 || since > PRIMORDIAL_ATTACK_WINDOW) return p;
  const u = PRIMORDIAL_ATTACK_WINDOW;
  const w = u * PRIMORDIAL_WINDUP;
  if (since < w) {
    const s = since / w;
    const ease = 1 - Math.pow(1 - s, 3);
    p.lean = -0.6 * ease; // o quasar tomba para trás na respiração da afinação
    p.charge = Math.pow(s, 1.4); // o disco esquenta, as bandas aceleram
    p.flare = 0.2 * Math.pow(s, 0.35) + 0.5 * ease;
  } else {
    const r = (since - w) / (u - w);
    const fall = Math.pow(1 - r, 2);
    const relax = 1 - Math.pow(r, 2.2);
    // o jato IGNA e varre: nasce em 0 no estouro, estoura no meio do sopro e
    // ASSENTA em 0 aos 87% do resto da janela (nada de jato ainda aceso no frame
    // em que a pose vira zero)
    p.jet = Math.sin(Math.min(1, r * 1.15) * Math.PI);
    p.charge = fall; // o disco esfria devagar depois do sopro
    p.flare = (0.5 + fall * 1.2) * relax;
    p.recoil = p.jet * (1 - r); // o recuo do sopro: o quasar afunda
    p.quake = Math.pow(1 - r, 1.3); // a gravidade cede no estouro e levanta devagar
    // o quasar tombado na afinação DEVOLVE junto com o jato (em r=0 vale −0,6,
    // o mesmo valor com que a afinação terminou, e no fim da janela é zero)
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
  const skyRef = useRef<THREE.Group>(null!);
  const diskRef = useRef<THREE.Mesh>(null!);
  const jetRef = useRef<THREE.Mesh>(null!);
  const jetGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);
  // giro ACUMULADO do disco (nunca `t * velocidade`: quando a carga mexe na
  // velocidade, ângulo absoluto daria salto — as bandas têm que acelerar suave)
  const spins = useRef<Record<number, number>>({});

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const diskIdx = useMemo(() => visParts.findIndex((p) => p.tag === 'disk.accr'), [visParts]);

  /** CINCO peças: o DISCO (wrapper próprio de inclinação), a ESFERA NEGRA
   *  (planta, sem wrapper) e o CÉU — anel de fótons + dois arcos de lente —
   *  que o rig vira inteiro para encarar a câmera (billboard em Y) */
  const buckets = useMemo(() => {
    const sky: number[] = []; // hole.photon + lens.* (billboard)
    const solid: number[] = []; // hole.horizon (esfera negra)
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (tag === 'disk.accr') return; // vai à parte, com wrapper próprio
      if (tag === 'hole.photon' || tag.startsWith('lens.')) sky.push(i);
      else solid.push(i);
    });
    return { sky, solid };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // ---- O DISCO DE ACREÇÃO (shader próprio, HDR pro bloom): ouro-quasar na
  // boca, ouro na meia-envergadura, ember esfriando na borda; anel de fótons
  // rente ao horizonte em HDR, bandas com ω ∝ ρ^−1,5 e feixe doppler
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
        uInner: { value: PRIMORDIAL_DISK_IN }, // o disco nasce NA esfera (0,96)
        uOuter: { value: PRIMORDIAL_DISK_R },
        uHot: { value: new THREE.Color(PRIMORDIAL_QUASAR) }, // branco-quasar na boca
        uMid: { value: new THREE.Color(PRIMORDIAL_GOLD) }, // ouro na meia-envergadura
        uEmber: { value: new THREE.Color(PRIMORDIAL_EMBER) }, // esfriando na borda
      },
    });
    return { mat };
  }, []);

  // ---- OS ARCOS DE LENTE (a silhueta lensada do disco sobre o breu — o look
  // Gargantua): material próprio, o brilho ESMAECE nas pontas do arco (onde a
  // banda do disco assume) e pulsa devagar. O de cima é mais gordo e mais
  // aceso que o de baixo (a imagem lensada inferior é mais fraca)
  const lens = useMemo(
    () => ({
      top: makeLensMaterial(0.85),
      bottom: makeLensMaterial(0.55),
    }),
    [],
  );

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
    const kernel = new THREE.MeshBasicMaterial({ color: '#050408' }); // a ESFERA
    // NEGRA: breu puro, sem relevo, sem luz — o horizonte de eventos não reflete
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
      if (tag === 'lens.top') return lens.top;
      if (tag === 'lens.bottom') return lens.bottom;
      if (p.m === 'black') return kernel;
      if (p.m === 'glow') {
        // SÓ o anel de fótons usa plasma: a volta de luz que ancora o horizon-
        // te na tela (branco-quasar com o ouro de borda — nunca o azó antigo)
        const amp = ampOf(p, QUASAR_PLASMA.amp);
        return pick(`quasar|${amp}`, () =>
          makeCoreMaterial({
            gold: QUASAR_PLASMA.gold, // = a cor do motor (cap→rajada→impacto)
            white: QUASAR_PLASMA.white,
            cool: QUASAR_PLASMA.cool,
            amp,
            seed: 4.3 + (i % 2) * 2.9,
          }),
        );
      }
      return kernel; // não há mais pedra no figurino — fallback seguro
    });
    const shaders = [...cache.values()]; // o DISCO fica FORA do loop: uniformes próprios
    for (const m of shaders) m.userData.kind = 'core';
    return { list, uniq: [kernel, ...cache.values()], shaders };
  }, [visParts, level, disk, lens]);

  // o JATO branco-dourado: cone aberto (semi-cilindro de dezessete faces)
  // cavalgando o eixo da rajada, saindo do VENTRE da esfera na direção do
  // alvo. A rajada do motor nasce em PRIMORDIAL_MUZZLE — o cone é LUZ
  // atravessando gás (aditivo, depthWrite off): ele fura a franja interna do
  // disco de propósito, é isso que faz um quasar ler quasar (o jato
  // relativístico varando o disco de acreção)
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
          uCool: { value: new THREE.Color(PRIMORDIAL_GOLD) },
        },
      }),
    }),
    [],
  );

  // PÓ DE QUASAR: grãos de matéria caçada ORBITANDO o plano inclinado do disco
  // com ω ∝ 1/ρ (o mesmo motor do pó de anel do Colosso e do grão do Astral —
  // aqui é gás de estrela, não talco de lua morta). Quente perto da boca
  // (branco-quasar), frio na franja ember da borda.
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

  // só o anel de fótons (plasma com aSeed por vértice — a lição WebKit) precisa
  // de clone com semente; disco, lentes e a esfera negra não leem aSeed
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
      lens.top.dispose();
      lens.bottom.dispose();
      for (const g of geoClones.current) g.dispose();
      geoClones.current = [];
      disk.mat.dispose();
      jet.geo.dispose();
      jet.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, lens, disk, jet, motes]);

  useFrame((state, dtRaw) => {
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

    // ---- VAPOR VITRIFICADO no ventre da esfera no instante do sopro:
    // DEZESSETE baforadas (o primo dezessete até na pluma), na direção da
    // rajada. heat 0,18: plasma arrancado do disco — quente e esfriando rápido,
    // o oposto da cinza incandescente do pai Vulcânico; o jato é luz, a pluma
    // é o que sobra da matéria vitrificada ----
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
          heat: 0.18, // plasma dourado esfriando em vidro
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

    // ---- uniforms do plasma do anel de fótons e das lentes no MESMO loop ----
    const drift =
      Math.sin(t * 0.42 + seed) * 0.3 +
      Math.sin(t * 1.3 + seed * 0.6) * 0.22 +
      Math.sin(t * 0.21 + 1.4) * 0.35; // o quasar respira como maré funda
    for (const m of partMats.shaders) {
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * 0.12;
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * 1.3 + pose.jet * 0.2 + dying * 0.35);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = drift * (0.5 + 0.5 * hpFrac) + pose.quake * 0.4;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + dying * 1.7 + pose.quake * 0.3);
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
    // vezes). A rotação ALTA do rework mora aqui: base 2,4 rad/s acumulados,
    // carga/jato somam até +4,3 — amarrada em teste pelo PRIMORDIAL_SPIN. O
    // tilt oscila APENAS em [0,42, 0,50]: é daqui que sai a régua da folga do
    // deck (Y_D − 3,0·sin(0,5) ≈ 0,95 na borda — o quasar paira) ----
    spins.current[-1] =
      (spins.current[-1] ?? 0) +
      dt *
        (PRIMORDIAL_SPIN.base + pose.charge * PRIMORDIAL_SPIN.charge + pose.jet * PRIMORDIAL_SPIN.jet) *
        (1 - dying * 0.9);
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

    // ---- O CÉU DE BILLBOARD: o anel de fótons e os arcos de lente moram no
    // plano vertical de frente e DESDEMBRAM a silhueta superior/inferior do
    // disco sobre a esfera negra (o look Gargantua). O rig gira o grupo inteiro
    // em Y para encarar a câmera — descontado o yaw que a cadeia acima da raiz
    // (facing do tabuleiro) já aplicou. É projeção no plano do céu, por isso o
    // CÉU nunca entra no wrapper de inclinação do disco ----
    const sky = skyRef.current;
    if (sky && sky.parent) {
      sky.parent.updateWorldMatrix(true, false);
      tmpPivot.setFromMatrixPosition(sky.parent.matrixWorld);
      const cam = state.camera.position;
      const yawWorld = Math.atan2(cam.x - tmpPivot.x, cam.z - tmpPivot.z);
      tmpQ.setFromRotationMatrix(sky.parent.matrixWorld);
      tmpEuler.setFromQuaternion(tmpQ, 'YXZ');
      sky.rotation.y = yawWorld - tmpEuler.y;
    }

    // ---- O JATO BRANCO-DOURADO: invisível fora da rajada; na ignição ele
    // cresce do ventre da esfera até varrer a frente, e assenta antes do fim da
    // janela ----
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

    // ---- O ANEL DE FÓTONS E AS LENTES ACENDEM no flare (a única luz com
    // geometria do quasar: branco-quasar + ouro) — flick de grão de luz e
    // inchaço no sopro ----
    const bs0 = [1, 1, 1];
    for (const i of buckets.sky) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const isPhoton = (part.tag ?? '') === 'hole.photon';
      let sc = 1 + 0.05 * Math.sin(t * (2.4 + (i % 3) * 0.7) + i * 1.7 + seed);
      sc *= 1 + pose.flare * (isPhoton ? 0.16 : 0.1) + pose.jet * (isPhoton ? 0.5 : 0.22) + pose.charge * (isPhoton ? 0.14 : 0.05) - dying * 0.5;
      if (part.flick) sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      mesh.scale.set(Math.max(0.001, bs[0] * sc), Math.max(0.001, bs[1] * sc), Math.max(0.001, bs[2] * sc));
    }

    // ---- corpo: o QUASAR paira (floatY 0 — o pivô do disco é o plantio); o
    // coice do jato é o QUAKE da gravidade cedendo: forte mas abaixo do
    // colosso, porque aqui o soco é luz e não planetóide ----
    const g = rootRef.current;
    const breathe = Math.sin(t * 0.36 + seed) * 0.004;
    g.scale.set(
      1 + breathe + pose.quake * 0.008 - dying * 0.05,
      1 + breathe - dying * 0.1,
      1 + breathe + pose.quake * 0.008 - dying * 0.05,
    );
    g.position.x = Math.sin(t * 31 + seed) * 0.03 * pose.quake;
    g.position.z = Math.cos(t * 27 + seed * 0.7) * 0.026 * pose.quake - pose.recoil * 0.05;
    g.position.y = -pose.recoil * 0.02 + Math.sin(t * 25 + seed) * 0.008 * pose.quake;
    g.rotation.y = Math.sin(t * 0.17 + seed) * 0.008;
    g.rotation.x = pose.lean * 0.012 + pose.quake * 0.004;
    void topY; // forma única Nv.10 — o topo amarrado nos testes
  });

  return (
    <group ref={rootRef}>
      {/* a ESFERA NEGRA do horizonte: breu puro sem wrapper (o disco nasce na
          superfície dela; o céu de lente gira por fora) */}
      {buckets.solid.map((i) => (
        <mesh
          key={`so${level}-${i}`}
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
      {/* O CÉU DE BILLBOARD: anel de fótons + arcos de lente (a silhueta do
          disco sobre o breu) — o rig vira o grupo inteiro para encarar a
          câmera (plano do céu, nunca o wrapper de inclinação do disco) */}
      <group ref={skyRef}>
        {buckets.sky.map((i) => (
          <mesh
            key={`sk${level}-${i}`}
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={visParts[i].p}
            rotation={visParts[i].r ?? [0, 0, 0]}
            scale={visParts[i].s ?? 1}
            // luz translúcida não projeta sombra (a lição do funil da Névoa)
            renderOrder={2}
          />
        ))}
      </group>
      {/* O DISCO DE ACREÇÃO: uma malha, wrapper só de inclinação no pivô
          (0, Y_D, 0); o spin diferencial (a rotação alta) é pintura no frag */}
      {diskIdx >= 0 && (
        <mesh
          ref={diskRef}
          geometry={partGeos[diskIdx]}
          material={partMats.list[diskIdx]}
          position={visParts[diskIdx].p}
          renderOrder={2}
        />
      )}
      {/* o JATO de dezessete faces varando o ventre da esfera na direção do
          alvo + o halo na boca */}
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
 * O DISCO DE ACREÇÃO (a assinatura do Nv.10): o anel é RÍGIDO e o rig só o
 * INCLINA — o spin diferencial mora AQUI, bandas arrastadas pelo ângulo
 * acumulado uSpin com ω ∝ ρ^−1,5 (as de dentro dão mais voltas que as de fora;
 * como o ângulo é acumulado, a carga acelerando o disco não dá salto de fase).
 * No rework de 03/nov a curva de cor é OURO QUASAR: branco-quasar na boca
 * (ρ~1), ouro na meia-envergadura (smoothstep 1,05→2,3) e ember esfriando na
 * franja da borda (2,5→2,9). O anel de fótons rente ao horizonte (uInner =
 * 0,96, o disco nasce NA superfície da esfera negra) sai em HDR (>1) pra
 * alimentar o bloom gateado da arena, com feixe doppler (um lado mais aceso).
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
  // rotação DIFERENCIAL: ω ∝ ρ^−1,5 ancorada na boca do disco; o ângulo é o
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
  // branco-quasar na boca, OURO na meia-envergadura, ember esfriando na borda
  vec3 col = mix(uHot, uMid, smoothstep(1.05, 2.3, rho));
  col = mix(col, uEmber, smoothstep(2.5, 2.9, rho));
  // o ANEL DE FÓTONS: uma volta HDR rente a boca do disco (é o que segura o
  // bloom pra leitura de quasar) com o feixe doppler — um lado do anel vem de
  // frente
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
  // 0,45 (não 0,5): o disco novo é 32% mais largo e a área HDR a mais pede
  // freio no alpha pra não estourar o bloom gateado
  float a = dens * edge * uAlpha * 0.45;
  if (!(a > 0.002)) discard; // discard à prova de NaN (ver JET_FRAG)
  gl_FragColor = vec4(col, a);
}
`;

/** OS ARCOS DE LENTE (a silhueta lensada do disco sobre o breu — o look
 *  Gargantua): o toro do three só existe porque o `arc` foi exposto no
 *  `torus` dos assets; o brilho ESMAECE nas duas pontas do arco (onde a banda
 *  do disco assume) e pulsa devagar. Sem pow, sem log — só smoothstep e exp
 *  de argumento não-negativo: o lesson WebKit do quadrado preto não pode
 *  voltar por shader novo */
const LENS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function makeLensMaterial(glow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LENS_VERT,
    fragmentShader: LENS_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uCharge: { value: 0 },
      uGlow: { value: glow },
      uHot: { value: new THREE.Color(PRIMORDIAL_QUASAR) },
      uGold: { value: new THREE.Color(PRIMORDIAL_GOLD) },
    },
  });
}

const LENS_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uCharge;
uniform float uGlow;
uniform vec3 uHot;
uniform vec3 uGold;
varying vec2 vUv;
void main() {
  // vUv.x percorre o ARCO inteiro (0 = uma ponta, 1 = a outra): as pontas
  // esmaecem onde a banda do disco assume — é isso que costura a lente com o
  // disco no print Gargantua
  float tip = smoothstep(0.03, 0.26, vUv.x) * (1.0 - smoothstep(0.74, 0.97, vUv.x));
  // o miolo do arco pulsa devagar (matéria lensada acesa na volta da luz)
  float shim = 1.0 + 0.3 * sin(uTime * 2.3 + vUv.x * 19.0);
  // branco-quasar no miolo do tubo, ouro virando a borda
  vec3 col = mix(uGold, uHot, 0.45 + 0.35 * cos(vUv.y * 6.28318));
  col *= shim;
  col *= 1.0 + uCharge * 0.6;
  float a = tip * uGlow * uAlpha * (0.32 + 0.12 * shim);
  if (!(a > 0.002)) discard; // discard à prova de NaN (lesson WebKit)
  gl_FragColor = vec4(col, a);
}
`;

/** o JATO: cone de dezessete faces cavalgando o eixo da rajada, brilhando na
 *  boca da esfera e desbotando na ponta (a luz de ouro-quasar varando o gás) */
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
  // 0 = boca da esfera (estreita), 1 = ponta (larga). O vUv vem interpolado com
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
 * pela MESMA inclinação que o rig aplica ao anel). No rework de 03/nov os
 * grãos nascem na FAIXA do disco novo (ρ 1,02–2,92), a rotação subiu para
 * 5,2/ρ (era 1,4/ρ — "alta rotação" pedida) e a curva de cor é ouro: quente
 * branco-quasar na boca, esfriando em ember na franja da borda.
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
  // os grãos nascem NA FAIXA do disco novo (da boca 1,02 à borda 2,92): poeira
  // de matéria caçada orbitando junto, não nuvem solta boiando no escuro
  float band = step(0.72, aRand.z);
  float r = 1.02 + 1.9 * aRand.z;
  // rotação ALTA do rework: 5,2/ρ (era 1,4/ρ) — a régua vem do PRIMORDIAL_SPIN
  float omega = (5.2 / r) * (1.0 + uCharge * 0.5 + uSnap * 1.2);
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
  // grão de luz dourada com halo largo (gás de estrela, não faísca de foguete)
  float size = (1.5 + 2.2 * aRand.z) * (0.85 + uCharge * 0.45) * uSizeMul;
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.45 + 0.45 * aRand.z) * (1.0 - prog * 0.6) * uAlpha;
  // curva de cor: o grão quente é o que raspa a boca do disco, o de fora esfria
  // em ember na franja da borda
  vC = mix(uWarm, uCool, smoothstep(1.1, 2.7, r));
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
