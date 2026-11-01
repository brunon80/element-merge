import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeSteamMaterial } from './steamShaders';
import { makeArcMaterial, makeCoreMaterial } from './lightningShaders';
import { makeWindMaterial } from './windShaders';
import { makeIceMaterial } from './iceShaders';
import { plugArenaEnv } from './envProbe';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig da TEMPESTADE (Nv.7 — a MURALHA DE RAIOS), no MESMO padrão dos golems:
 * um MURO DE NUVEM de supercélula (steamShaders na paleta da trovoada —
 * ardósia escura em cima, ventre acinzentado, SEM tint de equipe, a regra da
 * nuvem) com rolo de frente de tempestade embaixo, bigornas planas no topo e
 * os MASTROS PARA-RAIOS na crista, com o curto-circuito em arco escrito ENTRE
 * eles (a assinatura do chain 3× saltos). Diferença da muralha:
 *
 *  1. A TROVOADA POR DENTRO: brasa lilás presa no miolo do muro (core), o
 *     ventre da nuvem acende para lilás quando o raio carrega (uCharge no
 *     vapor) — relâmpago intra-nuvem, o mais difícil de legar em 3D;
 *  2. CORTINAS DE CHUVA plantadas no chão (role veil = shader do vendaval em
 *     cinza-ardósia) + pontos de chuva caindo do rolo frontal — a chuva é a
 *     SAIA da muralha e a ancora no tabuleiro;
 *  3. ATAQUE (descarga em cadeia): o muro INCHA e escurece inspirando, os
 *     mastros flexionam para trás (a corrente sobe pelo mastro — uCharge nos
 *     arcos, os curtos-circuitos entre mastros engrossam) e no disparo os
 *     mastros estalam para frente, a cortina varre com o vendaval e um
 *     clarão sóbrio (NUNCA blowout) atravessa o muro.
 *
 * A timeline vem do motor (lastAttackAt); no bestiário, `demoAttackSeq`
 * dispara a mesma coreografia. O projétil-assinatura (dardo de relâmpago
 * gelado) usa os MESMOS materiais no ProjectileField.
 */

export const TEMPESTADE_ATTACK_WINDOW = 0.55;
/** fração da janela em que o muro inspira a descarga (mastros armados) */
export const TEMPESTADE_WINDUP = 0.5;

const TEMPESTADE_DEF = getSpecies('tempestade');

export interface AttackPose {
  twist: number; // o muro torce armazenando o campo
  swell: number; // 0..1 o muro INCHA inspirando (lateral) e afunda o teto
  lean: number; // mastros (neg = flexionados para trás, pos = estalam na frente)
  charge: number; // ventre lilás + arcos engrossando (0..1)
  stepZ: number; // a frente de tempestade AVANÇA no disparo
  flare: number; // curtos-circuitos e anéis estufam
  gust: number; // a rajada empurra as cortinas de chuva para frente
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    swell: 0,
    lean: 0,
    charge: 0,
    stepZ: 0,
    flare: 0,
    gust: 0,
  };
  if (since < 0 || since > TEMPESTADE_ATTACK_WINDOW) return P;
  const p = since / TEMPESTADE_ATTACK_WINDOW;
  if (p < TEMPESTADE_WINDUP) {
    const k = (p / TEMPESTADE_WINDUP) ** 1.3;
    P.twist = 0.05 * k;
    P.swell = k;
    P.lean = -0.34 * k;
    P.charge = k;
    P.stepZ = -0.05 * k;
    P.flare = 0.7 * k;
    P.gust = -0.25 * k; // o ar é SUGADO para dentro antes do estalo
    return P;
  }
  const r = (p - TEMPESTADE_WINDUP) / (1 - TEMPESTADE_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.22)) ** 2; // o raio sai quase junto
  const decay = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (0.05 - 0.12 * a) * decay;
  P.swell = (1 - 0.85 * a) * decay;
  P.lean = (-0.34 + 0.55 * a) * decay; // estalo dos mastros para a frente
  P.charge = Math.max(0, 1 - 1.7 * r) * decay;
  P.stepZ = (-0.05 + 0.22 * a) * decay;
  P.flare = (0.7 + 0.9 * a) * decay;
  P.gust = (-0.25 + 1.3 * a) * decay; // a cortina varre com o vendaval
  return P;
}

/** nuvem da muralha (steamShaders na paleta da trovoada): ardósia ESCURA —
 *  o oposto do vapor escaldante. A LIÇÃO DO PRINT: o shader de nuvem soma
 *  camadas (13 cascas se empilham no muro) sob a luz da arena (×2,4), então
 *  o ALBEDO tem que ser MUITO escuro — vapor claro vira bola branca estourada
 *  (blowout, cortado pela regra). O ventre acinzentado esfria para o azul
 *  noturno no topo da bigorna e o uCharge acende o LILÁS da assinatura
 *  (a mesma cor do projétil) por dentro, como relâmpago intra-nuvem.
 *  A regra da nuvem manda: NUNCA tint de equipe aqui */
interface CloudLook {
  cool: string;
  warm: string;
  alpha: number;
  swirl: number;
}

const CLOUD_ROLE_LOOK: Partial<Record<MatRole, CloudLook>> = {
  body: { cool: '#222b42', warm: '#2d3150', alpha: 0.82, swirl: 0.5 },
  dark: { cool: '#161d31', warm: '#232741', alpha: 0.86, swirl: 0.42 },
  steam: { cool: '#222b42', warm: '#2d3150', alpha: 0.82, swirl: 0.5 },
};

/** o lilás-relâmpago da tempestade (mesma cor do projétil #d0b6ff): é o
 *  uHot do vapor e o uCool dos arcos — a corrente e o clarão do muro */
const STORM_LILAC = '#d0b6ff';

/** cortinas de chuva (shader do vendaval na paleta da trovoada): fitas
 *  cinza-ardósia correndo para baixo; o hot é perolado ESCURO (NUNCA branco
 *  de lavadora — a lição do véu da areia). A lição do print 4: escuras
 *  DEMAIS somem no fundo escuro da arena — a cortina é a ASSINATURA plantada
 *  da muralha, ela precisa ler contra o tabuleiro (meio-termo ardósia). O
 *  print-probe (cortina vermelha crua) provou que a geometria está certa e
 *  larga o muro em volta: o que faltava era alpha do frag (base 0.3) — o
 *  alphaMul compensa isso e sobe a cortina a plano quase opaco nas fitas */
const RAIN_VEIL = {
  cold: '#33405c',
  mid: '#7688a8',
  hot: '#c6d2ea',
  alphaMul: 1.6,
  spin: 0.85, // turbilhão lento (a cortina gira de verdade, devagar)
};

function makeRainGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x5f3a77b9 ^ (n * 2654435761);
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface TempestadeRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** gotas de chuva da muralha (o análogo do "cascalho" das outras espécies) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — respingo frio da rajada e bruma da base */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpMast = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

export function TempestadeRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: TempestadeRigProps) {
  const modelDef = MODELS.tempestade;
  // espécie da árvore: forma única no nível da espécie (Nv.7)
  const level = Math.max(
    TEMPESTADE_DEF.levelMin,
    Math.min(TEMPESTADE_DEF.levelMax, Math.round(levelProp ?? TEMPESTADE_DEF.levelMin)),
  );
  // chuva é CORTINA, não faísca: o pool de embers dos outros rigs é pequeno
  // demais — a muralha exige no mínimo ~26 gotas caindo sempre
  const rainCount = Math.max(26, embers ?? 26);
  const topY = formTop(TEMPESTADE_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const flashRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);
  const mistAcc = useRef(0);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    // mastros para-raios: o modelo os escreve em pares (cilindro com tag
    // 'arm' + globo white logo ACIMA, mesmo x/z). O rig os trata como UM
    // corpo só: pivô na BASE do mastro — o cilindro gira e o globo vai na
    // ponta (senão o globo ficaria plantado enquanto o mastro inclina)
    interface Mast {
      mast: number;
      ball: number;
      side: 1 | -1;
      px: number;
      py: number;
      pz: number;
      len: number;
      ballD: number; // pivô → globo (em y, no modelo)
    }
    const masts: Mast[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      if (p.tag !== 'arm') return;
      if (p.g === 'cyl') {
        const ball = visParts.findIndex(
          (q, j) =>
            j !== i && q.tag === 'arm' && q.m === 'white' && Math.abs(q.p[0] - p.p[0]) < 0.01 && Math.abs(q.p[2] - p.p[2]) < 0.01,
        );
        masts.push({
          mast: i,
          ball,
          side,
          px: p.p[0],
          py: p.p[1] - p.a[2] / 2,
          pz: p.p[2],
          len: p.a[2],
          ballD: ball >= 0 ? visParts[ball].p[1] - (p.p[1] - p.a[2] / 2) : p.a[2] + 0.07,
        });
      }
    });
    return { masts };
  }, [visParts]);

  // índice peça→mastro p/ o loop de quadro (o rig roda 60×/s em várias
  // unidades: nada de .find dentro do useFrame)
  const mastIndex = useMemo(() => {
    const m = new Map<number, number>();
    actors.masts.forEach((ms, k) => {
      m.set(ms.mast, k);
      if (ms.ball >= 0) m.set(ms.ball, k);
    });
    return m;
  }, [actors]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // olhos: o relâmpago encarando por trás da cortina (lilás, sóbrio)
    const eye = new THREE.MeshStandardMaterial({
      color: '#eef0ff',
      emissive: '#b9a0ff',
      emissiveIntensity: 1.3,
      roughness: 0.3,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#141225' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      if (p.m === 'veil') {
        // cortina de chuva: o shader do VENTO na paleta da trovoada (fitas
        // cinza correndo + rotação diferencial lenta) — SEM tint, regra da
        // nuvem; hot perolado, nunca branco de lavadora
        const key = `RA|${p.g === 'cyl' ? Math.round(p.a[2] * 100) : 0}`;
        let m = cache.get(key);
        if (!m) {
          m = makeWindMaterial({
            cold: RAIN_VEIL.cold,
            mid: RAIN_VEIL.mid,
            hot: RAIN_VEIL.hot,
            amp: p.amp ?? 0.05,
            twist: 0.35,
            spin: RAIN_VEIL.spin,
            bend: 0,
            alphaMul: RAIN_VEIL.alphaMul,
            soft: 0, // volume cheio: a cortina é densa de frente
            seed: seed + 1.7,
            phase: seed,
            yOff: p.p[1],
            modelH: topY,
          });
          cache.set(key, m);
        }
        return m;
      }
      if (p.m === 'glow') {
        // brasa lilás presa na nuvem: núcleo do relâmpago nascendo (o plasma
        // do Raio na paleta lilás da tempestade — não-aditivo, a regra).
        // TOM MÉDIO: o core do raio é quase branco porque é pequeno e isolado;
        // aqui a brasa é GRANDE e fica ATRÁS de duas cascas de nuvem — plasma
        // claro viria mancha branca sem forma (o erro do primeiro print)
        const key = `K|${Math.round(p.p[1] * 100)}`;
        let m = cache.get(key);
        if (!m) {
          m = makeCoreMaterial({
            gold: '#9a6fd4', // o corpo do plasma: lilás médio (não pálido)
            white: '#c9aef2', // a fervura clara por dentro (mantiene o lilás)
            cool: '#5a6bb0', // orla azul-noturna
            amp: 0.055,
            seed: seed + 2.4,
          });
          cache.set(key, m);
        }
        return m;
      }
      if (p.m === 'accent') {
        // corrente: mastros (fio que corre pelo para-raios) e anéis de
        // curto-circuito (traço tracejado denso girando) — o ÚNICO aditivo
        // permitido no muro (a regra do raio: clarões em aditivo, corpo não)
        const ring = p.g === 'torus';
        const key = `A|${ring ? 1 : 0}|${(i + (ring ? Math.round(p.p[1] * 10) : 0)) % 2}`;
        let m = cache.get(key);
        if (!m) {
          m = makeArcMaterial({
            gold: '#ffd9a0', // ouro é só o acento: a trovoada é LILÁS
            white: '#f2ecff',
            cool: STORM_LILAC,
            coolAmt: ring ? 0.88 : 0.75,
            // jitter é em UNIDADES DE MUNDO (ARC_VERT desloca o tubo pela
            // normal): tem que caber no raio do tubo (0.03-0.07), senão o fio
            // vira ouriço de estilhaços (o blowout do print 2/3)
            jitter: ring ? 0.03 : 0.05, // zigue-zague de patamar (a polilinha)
            dash: ring ? 22 : 14,
            flow: (i % 2 === 0 ? 1 : -1) * (ring ? 6.5 : 9),
            seed: seed + i * 2.3,
          });
          cache.set(key, m);
        }
        return m;
      }
      if (p.m === 'trans') {
        // granizo: gelo translúcido com veios lilás (o cristal do Gelo na
        // paleta fria da trovoada; o reflexo real da arena entra via envProbe)
        let m = cache.get('ICE');
        if (!m) {
          m = makeIceMaterial({
            iceA: '#e2ecff',
            iceB: '#93aed6',
            crack: STORM_LILAC,
            amp: 0.018,
            crackGlow: 0.7,
            crackScale: 2.4,
            crackWidth: 0.05,
            alpha: 0.75,
            bump: 1.1,
            reflPow: 120,
            envMix: 0.5,
            sparkle: 1.1,
            seed: seed + 5.1,
          });
          cache.set('ICE', m);
        }
        return m;
      }
      const look = CLOUD_ROLE_LOOK[p.m] ?? CLOUD_ROLE_LOOK.body!;
      const key = `S|${p.m}|${p.amp ?? 0.06}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeSteamMaterial({
          cool: look.cool,
          warm: look.warm,
          // o charge acende o lilás-relâmpago por dentro. LILÁS ESCURO: o
          // mix do frag acontece ANTES da luz (a nuvem empilha ~13 cascas e a
          // luz da arena vale ×2) — lilás claro estoura em bola branca
          hot: '#8a63c9',
          amp: p.amp ?? 0.06,
          alpha: look.alpha,
          swirl: look.swirl,
          hotY: 1.05, // a brasa do miolo esquenta o VENTRE (e esfria a bigorna)
          seed: seed + (i % 3) * 3.3,
          breath: 1,
        });
        cache.set(key, m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), eye, socket],
      shaders: [...cache.values()] as THREE.ShaderMaterial[],
    };
  }, [visParts, seed, level, topY]);

  // chuva da muralha: gotas duras caindo do rolo frontal até o chão em
  // cortina (o análogo dos grãos da areia — mas CAINDO, com peso)
  const rain = useMemo(() => {
    const geo = makeRainGeo(rainCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
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
  }, [rainCount, emberScale]);

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
      rain.geo.dispose();
      rain.mat.dispose();
    };
  }, [partMats, rain]);

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
      if (demoT.current > TEMPESTADE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= TEMPESTADE_WINDUP * TEMPESTADE_ATTACK_WINDOW &&
      sinceAttack <= TEMPESTADE_ATTACK_WINDOW;

    // DESCARGA no disparo: respingo frio do vendaval na frente do muro
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 9; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 4.4, 0.05 + Math.random() * 0.3, 1.0 + Math.random() * 0.7)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.08 + Math.random() * 0.05,
            heat: 0, // névoa FRIOA da chuva (nunca fuligem quente)
            life: 0.9 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.24,
            rise: 0.1,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.4,
            vz: 0.7 + Math.random() * 1.3, // a rajada empurra a bruma para frente
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > TEMPESTADE_ATTACK_WINDOW) strikeDone.current = false;

    // a muralha NUNCA para de chuviscar: bruma fria rente à base
    if (smoke && alpha > 0.3) {
      mistAcc.current += dt * (0.5 + 0.7 * pose.charge) * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (mistAcc.current >= 1 && guard < 3) {
        mistAcc.current -= 1;
        guard++;
        rootRef.current?.updateWorldMatrix(true, false);
        tmpWorld
          .set((Math.random() - 0.5) * 4.2, 0.06 + Math.random() * 0.3, 0.6 + Math.random() * 0.9)
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.05 + Math.random() * 0.04,
          heat: 0, // bruma fria
          life: 1.2 + Math.random() * 0.6,
          lifeVar: 0.4,
          jitter: 0.12,
          rise: 0.04,
          drag: 2.6,
        });
      }
      if (mistAcc.current > 2) mistAcc.current = 2;
    }

    // ---- uniforms (nuvem, cortina, corrente, brasa e gelo no mesmo loop) ----
    const stormBreath =
      Math.sin(t * 0.5 + seed) * 0.5 +
      Math.sin(t * 1.15 + seed * 0.7) * 0.3 +
      Math.sin(t * 2.3 + 1.4) * 0.2; // a nuvem respira pesado
    const crumble = 1 - alpha; // morrendo: a muralha DESMANCHA em chuva e fiapo
    // clarão intra-nuvem ocioso: pulso fraco e irregular (nunca blowout)
    const idleGlow = 0.05 + 0.05 * Math.sin(t * 1.9 + seed) + 0.03 * Math.sin(t * 4.3 + 2.0);
    for (const m of partMats.shaders) {
      // cada shader tem o SEU par de uniforms (a receita dos rigs: loop único,
      // acesso protegido) — o arco elétrico não tem uAmp/uHurt: ele ferve pelo
      // uJitter (o zigue-zague engrossa no disparo e no desmanche)
      const baseAmp = m.uniforms.uAmp
        ? ((m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value)
        : undefined;
      if (baseAmp !== undefined) {
        m.userData.baseAmp = baseAmp;
        m.uniforms.uAmp!.value = baseAmp * (1 + hurt * 0.2 + crumble * 2.8);
      }
      const baseJit = m.uniforms.uJitter
        ? ((m.userData.baseJit as number | undefined) ?? m.uniforms.uJitter.value)
        : undefined;
      if (baseJit !== undefined) {
        m.userData.baseJit = baseJit;
        m.uniforms.uJitter!.value = baseJit * (1 + pose.charge * 0.35 + crumble * 1.6);
      }
      const baseAlpha =
        (m.userData.baseAlpha as number | undefined) ??
        (m.uniforms.uAlpha ? m.uniforms.uAlpha.value : 1);
      m.userData.baseAlpha = baseAlpha;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt;
      if (m.uniforms.uCharge) {
        m.uniforms.uCharge.value = Math.min(
          1,
          pose.charge + idleGlow * (unitId === undefined || hpFrac > 0.3 ? 1 : 0) + crumble * 0.55,
        );
      }
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = stormBreath * (0.6 + 0.4 * hpFrac);
      // cortina de chuva: o vendaval da rajada VARRE a cortina para frente
      if (m.uniforms.uFlare) {
        m.uniforms.uFlare.value = Math.min(1.4, pose.charge * 0.5 + pose.flare * 0.5 + crumble * 0.8);
        m.uniforms.uBend.value = 0.012 + Math.max(0, pose.gust) * 0.1 + crumble * 0.18;
      }
      if (m.uniforms.uAlpha) m.uniforms.uAlpha.value = baseAlpha * Math.max(0, alpha);
    }
    // o granizo pega o reflexo REAL da arena (idempotente; a mesma sonda do
    // IceRig/Gelo e do projétil do gelo)
    plugArenaEnv(state.gl, partMats.uniq.filter(
      (m) => m instanceof THREE.ShaderMaterial && m.uniforms.uEnv !== undefined,
    ) as THREE.ShaderMaterial[]);
    rain.mat.uniforms.uTime.value = t;
    rain.mat.uniforms.uAlpha.value = alpha;
    rain.mat.uniforms.uCharge.value = pose.charge;

    // clarão do relâmpago atravessando o muro: grande mas SOBRIO (blowout
    // sempre cortado — teto 0.2 de opacidade aditiva)
    const flash = flashRef.current;
    const snap = striking ? Math.max(0, 1 - (sinceAttack - TEMPESTADE_WINDUP * TEMPESTADE_ATTACK_WINDOW) / 0.22) : 0;
    flash.scale.setScalar(Math.max(1.4, 2.1 + pose.charge * 0.7));
    (flash.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.02 + idleGlow * 0.03 + pose.charge * 0.06 + snap * 0.09) * alpha,
    );

    // ---- corpo: o muro inspirando (lateral), o avanço da frente no estalo ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.4 + seed) * 0.01 + Math.sin(t * 0.9 + 1.7) * 0.005;
    g.scale.set(1 + pose.swell * 0.035, 1 - pose.swell * 0.012, 1 + pose.swell * 0.028);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.33 + seed * 0.6) * 0.006;
    g.rotation.x = pose.swell * 0.008 - pose.twist * 0.1;
    g.position.y = 0.015 + Math.sin(t * 0.75 + seed) * 0.015;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (a corrente que varre o muro inteiro) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.charge * 1.4);
    }

    // ---- peças: mastros flexionam na carga e ESTALAM na frente no disparo;
    // brasa interna pulsa com a corrente ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const mastK = mastIndex.get(i);
      if (mastK !== undefined) {
        const ms = actors.masts[mastK];
        // ângulo do mastro (identidade no idle: a crista fica quieta)
        const aX = pose.lean;
        const aZ = ms.side * (0.04 + pose.flare * 0.06);
        const aY = base[1] + ms.side * pose.twist * 0.4;
        if (part.g === 'cyl') {
          // o cilindro ORBITA a base do mastro (pivô embaixo, não no centro)
          const h = ms.len / 2;
          const cx = ms.px + h * Math.sin(aZ) * Math.cos(aX);
          const cy = ms.py + h * Math.cos(aZ) * Math.cos(aX);
          const cz = ms.pz - h * Math.sin(aX);
          mesh.position.set(cx, cy, cz);
          mesh.rotation.set(base[0] + aX, aY, base[2] + aZ);
        } else if (ms.ball >= 0) {
          // globo na PONTA: acompanha o estalo (a posição é o que importa —
          // esfera, rodar pouco não muda a silhueta)
          tmpMast.set(0, ms.ballD, 0).applyEuler(tmpEuler.set(aX, aY, aZ));
          mesh.position.set(ms.px + tmpMast.x, ms.py + tmpMast.y, ms.pz + tmpMast.z);
          mesh.rotation.set(base[0] + aX, aY, base[2] + aZ);
        }
        sc *= 1 + pose.charge * 0.2;
      } else if (part.m === 'glow') {
        // a brasa lilás cresce e ferve quando a corrente enche o muro
        sc *= 1 + pose.charge * 0.55 + 0.07 * Math.sin(t * 3.1 + i * 1.7 + seed);
      }

      if (part.flick && mastK === undefined) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
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
            castShadow
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
      <points geometry={rain.geo} material={rain.mat} frustumCulled={false} />
      <sprite ref={flashRef} position={[0, 2.6, 0.3]} scale={2.1}>
        <spriteMaterial
          map={circleTexture()}
          color={STORM_LILAC}
          transparent
          opacity={0.02}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Chuva da muralha: gotas DURAS caindo em cortina do rolo frontal até o chão
 * (peso — o oposto do vapor que sobe do VaporRig). Caem tortas, adiantam com
 * a rajada (uCharge empurra para frente e inclina), e o clamp de 90px é a
 * regra anti-envelope de sempre.
 */
const RAIN_VERT = /* glsl */ `
attribute vec3 aRand; // x: posição no muro, y: fase, z: velocidade/tamanho
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 1.1 + 0.9 * aRand.z;
  float prog = fract(uTime * speed * 0.42 + aRand.y);
  // larga da base da nuvem (~1.7) e cai até o chão inclinando para frente
  float x = (aRand.x - 0.5) * 4.6 + sin(aRand.y * 9.0 + uTime * 1.3) * 0.12;
  float z = (aRand.z - 0.5) * 1.6 + 0.4 + prog * (0.5 + uCharge * 1.6);
  float y = mix(1.55 + 0.5 * aRand.y, 0.02, prog);
  vec3 p = vec3(x, y, z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // gota curta e dura: ponto pequeno (não o fiapo macio do vapor)
  float size = (2.2 + 2.6 * aRand.z) * uSizeMul * (1.0 + uCharge * 0.3);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (1.0 - smoothstep(0.86, 1.0, prog)) * uAlpha;
  // o fio de chuva: perolado frio clareando perto do chão (NUNCA branco puro)
  vC = mix(vec3(0.55, 0.62, 0.78), vec3(0.8, 0.85, 0.95), prog * 0.7 + 0.2 * aRand.z);
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // gota elongada (streak): elipse vertical estreita
  vec2 q = vec2(d.x * 2.2, d.y);
  float m = smoothstep(0.5, 0.18, length(q));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.5);
}
`;
