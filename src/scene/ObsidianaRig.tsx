import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { arenaEnvTexture, captureArenaEnv } from './envProbe';
import { makeIceMaterial } from './iceShaders';
import { makeCoreMaterial } from './lightningShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig da OBSIDIANA (Nv.7 — fogo+terra+ar): a FORTALEZA DE VIDRO NEGRO, o
 * tanque plantado da árvore. Sem shader novo de propósito — o vidro negro é o
 * MESMO cristal do Gelo (iceShaders: translúcido, reflexivo, depthWrite, veios
 * acesos por dentro) lido na paleta da obsidiana:
 *
 *  1. VIDRO NEGRO POLIDO: albedo quase preto com o brilho violeta nas
 *     facetas (specular apertado exp150 + reflexo REAL da arena forte,
 *     envMix 0,55 — obsidiana é o material mais espelhado da árvore);
 *  2. BRASA VIOLETA NAS COSTURAS: os veios de fratura do cristal viram o
 *     fogo vulcânico ENCAPSULADO no vidro (crack #8f5cff) — pulsam devagar e
 *     ACENDEM quando a fortaleza carrega o arremesso (a receita das fissuras
 *     do golem, lida em vidro);
 *  3. CORES VIVAS: as peças 'glow' (brasa presa nas costuras) usam o MESMO
 *     plasma do raio, na paleta violeta (gold #8f5cff) — não-aditivo;
 *  4. PLANTADA E PESADA: sem float, pose de arremesso PESADO (janela 0,95s —
 *     a mais lenta da árvore: o corpo agacha, as ombreiras recuam e sobem, e
 *     VARREM para frente), e na morte a fortaleza ESTILHAÇA (amp ×3,4).
 *
 * A regra da legibilidade continua: o halo de vidro no chão NUNCA sai na cor
 * da equipe (fresnel puxa o tint de raspão — a lição da geada do Gelo).
 */

export const OBSIDIANA_ATTACK_WINDOW = 0.95;
/** fração da janela em que a fortaleza está carregando o arremesso (lenta) */
export const OBSIDIANA_WINDUP = 0.58;

const OBSIDIANA_DEF = getSpecies('obsidiana');

interface AttackPose {
  twist: number; // corpo torce (negativo = carregando)
  crouch: number; // 0..1 a fortaleza AFFUNDA as fundações
  bulge: number; // squash & bulge: o vidro grosso comprime e bofeia
  swing: number; // ombreiras (negativo = recuadas, positivo = varrem para frente)
  charge: number; // brasa das costuras acesa (0..1)
  stepZ: number; // a fortaleza NÃO anda: empurra só o tronco
  flare: number; // barbatanas-muralha e chifres eriçam
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    crouch: 0,
    bulge: 0,
    swing: 0,
    charge: 0,
    stepZ: 0,
    flare: 0,
  };
  if (since < 0 || since > OBSIDIANA_ATTACK_WINDOW) return P;
  const p = since / OBSIDIANA_ATTACK_WINDOW;
  if (p < OBSIDIANA_WINDUP) {
    // o vidro enverga DEVAGAR (k**2 = ainda mais pesado que o gelo)
    const k = (p / OBSIDIANA_WINDUP) ** 2;
    P.twist = -0.16 * k;
    P.crouch = k;
    P.bulge = k;
    P.swing = -0.85 * k;
    P.charge = k;
    P.stepZ = -0.04 * k;
    P.flare = 0.55 * k;
    return P;
  }
  const r = (p - OBSIDIANA_WINDUP) / (1 - OBSIDIANA_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.42)) ** 2; // o arremesso é PESADO: nada instantâneo
  const decay = 1 - Math.max(0, (r - 0.4) / 0.6);
  P.twist = (-0.16 + 0.5 * a) * decay;
  P.crouch = (1 - 0.85 * a) * decay;
  P.bulge = (1 - 1.15 * a) * decay;
  P.swing = (-0.85 + 1.95 * a) * decay;
  P.charge = Math.max(0, 1 - 1.3 * r) * decay;
  P.stepZ = (-0.04 + 0.2 * a) * decay;
  P.flare = (0.55 + 0.5 * a) * decay;
  return P;
}

interface GlassLook {
  iceA: string;
  iceB: string;
  crack: string;
  crackGlow: number;
  crackScale: number;
  crackWidth: number;
  amp: number;
  alpha: number;
  bump: number;
  refl: number;
  env: number;
  sparkle: number;
}

/** VIDRO NEGRO: o claro é quase BREU (o brilho da obsidiana vem do specular
 *  apertado, do reflexo da arena e da brasa nas costuras — nunca do albedo:
 *  a lição do print, iceA #4a4463 × luz da arena pintava a fortaleza de
 *  LAVANDA e no b-frame do combate ela lia prata). O veio é a BRASA
 *  ENCAPSULADA (#8f5cff): costura LARGA e contínua (crackScale baixo), não a
 *  treliça pontilhada miúda (crackScale alto = linha tracejada). E o sparkle
 *  vem BAIXO: glitter alto em corpo escuro é POEIRA, não vidro.
 *  Exportado: é a PALETA ÚNICA da espécie (motor/projétil/FX leem o mesmo
 *  violeta) e os testes amarram essas regras */
export const OBS_ROLE_LOOK: Partial<Record<MatRole, GlassLook>> = {
  body: {
    iceA: '#2a2438',
    iceB: '#130f1e',
    crack: '#8f5cff',
    crackGlow: 0.8,
    crackScale: 1.3,
    crackWidth: 0.07,
    amp: 0.05,
    alpha: 0.93,
    bump: 0.85,
    refl: 150,
    env: 0.5,
    sparkle: 0.5,
  },
  dark: {
    iceA: '#1d1829',
    iceB: '#0b0812',
    crack: '#6c47c8',
    crackGlow: 0.65,
    crackScale: 1.15,
    crackWidth: 0.075,
    amp: 0.05,
    alpha: 0.95,
    bump: 0.7,
    refl: 120,
    env: 0.42,
    sparkle: 0.35,
  },
  trans: {
    // halo de vidro rente ao chão: anel FINO (o pé da fortaleza espelhado no
    // piso), quase só o reflexo e um fio de brasa — alfa alto virava LAMA
    // VIOLETA no tabuleiro (a lição do macro)
    iceA: '#3a3352',
    iceB: '#1c1729',
    crack: '#8f5cff',
    crackGlow: 0.3,
    crackScale: 1.2,
    crackWidth: 0.04,
    amp: 0.012,
    alpha: 0.24,
    bump: 0.4,
    refl: 90,
    env: 0.3,
    sparkle: 0.5,
  },
};

/** A brasa viva (role 'glow'): o plasma do raio lido em VIOLETA de vulcão.
 *  Não-aditivo (depthWrite off é só pra ler dentro do vidro) */
export const OBS_CORE_LOOK = {
  gold: '#8f5cff', // o violeta da espécie (mesma cor do tiro do motor)
  white: '#e0ccff', // miolo quente, SEM #ffffff (o blowout é sempre cortado)
  cool: '#4a2f8f', // orla violeta-escura (nunca o azul elétrico do raio)
};

/** Peças RENTE AO CHÃO (os cacos da raiz): placa chata de frente pro piso é
 *  ESPELHO da arena — no print o caco lia como uma LÂMINA violeta acesa. O
 *  chão tem pouca luz pra refletir, então aqui o reflexo é quase cortado e o
 *  albedo afunda no breu (regra nova da passada da obsidiana) */
export const OBS_GROUND = { iceA: '#1a1523', env: 0.16 };

function makeGritGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 4); // x: ângulo, y: fase, z: tamanho, w: giro
  let s = 0x2f7a19c3 ^ n;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 4; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  return g;
}

export interface ObsidianaRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** limalhas de vidro flutuando ao redor da fortaleza */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a obsidiana usa para a cinza vulcânica dos pés */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const envAt = new THREE.Vector3();

export function ObsidianaRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: ObsidianaRigProps) {
  const modelDef = MODELS.obsidiana;
  // espécie da árvore: forma única no nível da espécie (Nv.7)
  const level = Math.max(
    OBSIDIANA_DEF.levelMin,
    Math.min(OBSIDIANA_DEF.levelMax, Math.round(levelProp ?? OBSIDIANA_DEF.levelMin)),
  );
  const gritCount = embers ?? 14;
  const topY = formTop(OBSIDIANA_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);
  const envShot = useRef(false);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const fins: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (Math.abs(p.p[0]) > 1.1 && p.p[1] > 1.4 && p.p[1] < 2.6) fins.push({ i, side, base });
    });
    return { arms, fins };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // tint da equipe (os holofotes batem no vidro polido — o aro de fresnel)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    // olhos: RASGO violeta aceso (sem bolinha de boneca — a fortaleza encara
    // estreita); 'black' é a fenda vazia por trás do rasgo
    const eye = new THREE.MeshStandardMaterial({
      color: '#efe6ff',
      emissive: '#8f5cff',
      emissiveIntensity: 1.15,
      roughness: 0.3,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#150f21' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      if (p.m === 'glow') {
        // brasa encapsulada: o plasma violeta (não-aditivo, a regra do Gelo)
        const key = `core|${p.flick ? 1 : 0}|${Math.round(p.p[1] * 100)}`;
        let m = cache.get(key);
        if (!m) {
          m = makeCoreMaterial({ ...OBS_CORE_LOOK, amp: p.flick ? 0.02 : 0.05, seed: seed + i * 2.7 });
          cache.set(key, m);
        }
        return m;
      }
      const look = OBS_ROLE_LOOK[p.m] ?? OBS_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        // cacos rente ao chão (a raiz espalhada): placa CHATA de frente pro
        // piso = ESPELHO da arena — no print o caco lia como uma LÂMINA
        // violeta acesa. Chão tem pouca luz pra refletir, então aqui o
        // reflexo é quase cortado e o albedo afunda no breu
        const ground = p.p[1] < 0.25 && p.m !== 'trans';
        m = makeIceMaterial({
          iceA: ground ? OBS_GROUND.iceA : look.iceA,
          iceB: look.iceB,
          crack: look.crack,
          amp: p.amp ?? look.amp,
          crackGlow: look.crackGlow,
          crackScale: look.crackScale,
          crackWidth: look.crackWidth,
          alpha: look.alpha,
          bump: look.bump,
          reflPow: look.refl,
          envMix: ground ? OBS_GROUND.env : look.env,
          sparkle: look.sparkle,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' ? 0.3 : 1,
          // o halo de vidro do chão NUNCA sai na cor da equipe (a lição da
          // geada: de raspão o fresnel puxa o tint todo pra ele)
          teamColor: p.m === 'trans' ? '#8f7bc0' : team,
        });
        cache.set(key, m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), eye, socket],
      ices: [...cache.values()].filter(
        (m) => m instanceof THREE.ShaderMaterial && m.uniforms.uIceA !== undefined,
      ) as THREE.ShaderMaterial[],
      cores: [...cache.values()].filter(
        (m) => m instanceof THREE.ShaderMaterial && m.uniforms.uIceA === undefined,
      ) as THREE.ShaderMaterial[],
    };
  }, [visParts, seed, level, team]);

  // limalhas de vidro: lasquinhas soltas da fortaleza, flutuando DEVAGAR
  // (vidro tem peso — sobem e caem num vaivém curto, não em deriva de neve)
  const grit = useMemo(
    () => ({
      geo: makeGritGeo(gritCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: GRIT_VERT,
        fragmentShader: GRIT_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uCharge: { value: 0 },
        },
      }),
    }),
    [gritCount, emberScale, topY],
  );

  // materiais de vidro/plasma leem `aSeed` por peça; clonamos só as que usam
  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        // NORMALS PLANAS: vidro fratura em FACETAS (cada lasca pega a luz da
        // arena num ângulo e pisca — normal interpolada em malha densa vira
        // plástico redondo). Poliedros já vêm não-indexados: clone neles
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.computeVertexNormals();
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
      grit.geo.dispose();
      grit.mat.dispose();
    };
  }, [partMats, grit]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    let hurt = 0;
    let alpha = 1;
    let sinceAttack = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > OBSIDIANA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= OBSIDIANA_ATTACK_WINDOW * OBSIDIANA_WINDUP &&
      sinceAttack <= OBSIDIANA_ATTACK_WINDOW;

    // pó de vidro + cinza vulcânica nos pés no instante do arremesso
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 6; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.6, 0.07, (Math.random() - 0.5) * 1.1 + 0.25)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.07 + Math.random() * 0.05,
            heat: 0.18, // cinza morna de vulcão (nunca fuligem de fogueira)
            life: 0.8 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.22,
            drag: 3.8,
            vx: (Math.random() - 0.5) * 1.1,
            vz: (Math.random() - 0.5) * 1.1,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > OBSIDIANA_ATTACK_WINDOW) strikeDone.current = false;

    // uniforms do vidro: a brasa das costuras respira DEVAGAR (vidro grosso
    // segurando fogo demora a piscar) e ACENDE na carga do arremesso
    const emberPulse = 0.42 + 0.2 * Math.sin(t * 0.9 + seed) + pose.charge * 1.5;
    const breath = Math.sin(t * 0.34 + seed) * 0.5 + Math.sin(t * 0.8 + seed * 0.6) * 0.3;
    const crumble = 1 - alpha; // morrendo: a fortaleza ESTILHAÇA
    for (const w of partMats.ices) {
      const baseAmp = (w.userData.baseAmp as number | undefined) ?? w.uniforms.uAmp.value;
      w.userData.baseAmp = baseAmp;
      w.uniforms.uTime.value = t;
      // O VIDRO NEGRO NÃO PODE BRANQUEAR sob fogo (a lição do b-frame: o
      // branqueamento padrão do cristal — mix(1, col, 1-uHurt*0.5) — pintava a
      // fortaleza de CINZA BEGE enquanto ela tanqueia, e é nisso que ela passa
      // a batalha inteira). Aqui o dano é AMORTECIDO no albedo e o feedback
      // vai todo para a BRASA: as costuras acendem mais forte quando ela apanha
      w.uniforms.uHurt.value = hurt * 0.3;
      w.uniforms.uCharge.value = pose.charge;
      w.uniforms.uBreath.value = breath;
      w.uniforms.uCrackGlow.value =
        ((w.userData.baseGlow as number | undefined) ??
          (w.userData.baseGlow = w.uniforms.uCrackGlow.value)) *
        (1 + (emberPulse + hurt * 1.6) * 0.55);
      // amp ×3,4 na morte: o vidro estilhaça (a fortaleza desmorona em lascas)
      w.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 3.4);
    }
    for (const w of partMats.cores) {
      w.uniforms.uTime.value = t;
      w.uniforms.uCharge.value = pose.charge * 0.8 + crumble * 0.6;
    }
    grit.mat.uniforms.uTime.value = t;
    grit.mat.uniforms.uAlpha.value = alpha;
    grit.mat.uniforms.uCharge.value = pose.charge;

    // reflexo REAL da arena no vidro (mesma sonda do Gelo: um cubemap 128px
    // por contexto WebGL, capturado uma vez; projétil e cacos plugam depois)
    if (!envShot.current) {
      envShot.current = true;
      let envTex = arenaEnvTexture(gl);
      if (!envTex) {
        const root = rootRef.current;
        root.visible = false; // tiro limpo: nada de blob próprio no cubemap
        root.updateWorldMatrix(true, false);
        envAt.set(0, 1.9, 0).applyMatrix4(root.matrixWorld);
        envTex = captureArenaEnv(gl, scene, envAt);
        root.visible = true;
      }
      for (const w of partMats.ices) w.uniforms.uEnv.value = envTex;
    }

    // clarão SÓBRIO no peito de vidro (nunca aditivo forte — legibilidade)
    const core = coreGlowRef.current;
    core.scale.setScalar(0.55 + pose.charge * 0.18);
    (core.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.035 + emberPulse * 0.045 + pose.charge * 0.08) * alpha,
    );

    // ---- corpo: fundação assentada, torção do arremesso, squash & bulge ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.3 + seed) * 0.01 + Math.sin(t * 0.72 + 1.7) * 0.005;
    const sink = 1 - pose.crouch * 0.07 - crumble * 0.05; // afunda as fundações
    g.scale.set(
      1 + pose.bulge * 0.05 + pose.flare * 0.015,
      sink,
      1 + pose.bulge * 0.045 + pose.flare * 0.015,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.26 + seed * 0.6) * 0.006;
    g.rotation.x = pose.crouch * 0.035 - pose.twist * 0.08;
    g.position.y = Math.sin(t * 0.6 + seed) * 0.008 + pose.crouch * -0.03;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (se a espécie os tiver) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)];
    }

    // ---- peças: ombreiras que varrem, barbatanas que eriçam, limalha flick ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const fin = actors.fins.find((x) => x.i === i);

      if (arm) {
        // ombreira de lasca grossa: recua e SOBE carregando o arremesso, depois
        // varre para frente e para baixo (o soco de vidro da fortaleza)
        mesh.rotation.x = base[0] - pose.swing * 0.9;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * (pose.twist * 0.25 + pose.flare * 0.12);
        sc *= 1 + pose.charge * 0.16;
      } else if (fin) {
        // barbatanas-muralha: eriçam quando o fogo interno enche o vidro
        const shimmer = Math.sin(t * (0.7 + (i % 3) * 0.2) + i * 1.9) * 0.02;
        mesh.rotation.set(base[0], base[1], base[2] + fin.side * (shimmer + pose.flare * 0.1));
        sc *= 1 + pose.flare * 0.05;
      }

      if (part.flick && !arm && !fin) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
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
      <points geometry={grit.geo} material={grit.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, 2.05, 0.45]} scale={0.55}>
        <spriteMaterial
          map={circleTexture()}
          color="#8f5cff"
          transparent
          opacity={0.035}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Limalhas de vidro da fortaleza: farpas miúdas que se soltam das arestas e
 * ficam BOIANDO rente ao corpo (vidro é pesado: o vaivém é curto e a queda é
 * lenta, arrastada pelo calor que sobe do vulcão).
 */
const GRIT_VERT = /* glsl */ `
attribute vec4 aRand; // x: ângulo, y: fase, z: tamanho, w: giro
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uCharge;
varying float vA;
varying float vRot;
void main() {
  float speed = 0.16 + 0.18 * aRand.z;
  float prog = fract(uTime * speed * 0.34 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.12;
  // vaivém curto (o caco sobe, engasga no calor e desce de novo)
  float bob = sin(uTime * 0.9 + aRand.y * 7.0 + prog * 6.0) * 0.18;
  float r = mix(1.05, 1.9, aRand.z) + bob;
  float y = mix(0.25 + 0.2 * aRand.w, uHeight * (0.35 + 0.3 * aRand.z), prog) + bob;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r * 0.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // farpa miúda: ponto PEQUENO (perto da câmera não pode virar parede)
  float size = (1.6 + 2.2 * aRand.z) * (1.0 + uCharge * 0.4) * uSizeMul;
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.8, 0.98, prog)) * uAlpha;
  vRot = uTime * (0.5 + 1.8 * aRand.w) + aRand.y * 6.28318;
  gl_Position = projectionMatrix * mv;
}
`;

const GRIT_FRAG = /* glsl */ `
varying float vA;
varying float vRot;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // farpa de vidro: lasca ALONGARADA girando (não bolinha), com o brilho
  // violeta só numa ponta — o reflexo do fogo preso passando pela faceta
  float ca = cos(vRot), sa = sin(vRot);
  vec2 q = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  float sliver = smoothstep(0.09, 0.0, abs(q.y)) * smoothstep(0.42, 0.12, abs(q.x));
  if (sliver <= 0.001 || vA <= 0.001) discard;
  float glint = smoothstep(0.0, 0.35, q.x + 0.35);
  vec3 col = mix(vec3(0.16, 0.13, 0.24), vec3(0.56, 0.36, 1.0), glint * 0.7);
  gl_FragColor = vec4(col, min(1.0, sliver) * vA * 0.62);
}
`;
