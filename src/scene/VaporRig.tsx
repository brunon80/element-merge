import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { makeCoreMaterial } from './lightningShaders';
import { makeSteamMaterial } from './steamShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do VAPOR (Nv.6 — a CALDEIRA VIVA), no MESMO padrão dos golems: corpo
 * físico OPACA (aqui: chapa de FERRO com o shader de pedra na paleta ferro +
 * costuras de brasa onde o fogo lambia a panela) e uma CABEÇA de nuvem de
 * vapor que ferve por dentro (steamShaders — alfa em ruído, gradientes
 * quente/embaixo/frio/em cima pela altura de mundo). Diferença da caldeira:
 *
 *  1. PANELA GIGANTE em três socalcos de chapa com a boca aberta — água
 *     FERVENDO dentro (o núcleo de plasma do Raio repaletado para a água em
 *     ebulição, não-aditivo), brasa no leito debaixo do ventre e porta do
 *     fogo acesa na barriga;
 *  2. NUVENTO de vapor empilhado saindo da boca (ico sub 2 — malha densa,
 *     NADA de low-poly), com os OLHOS do braseiro acesos dentro da nuvem e
 *     gotas ferventes em órbita;
 *  3. ATAQUE (rajada de vapor escaldante): o fogo acende (fissuras da chapa),
 *     a nuvem INTEIRA incha e clareia (uCharge no vapor), os bicos laterais
 *     recuam e VARREM para frente no disparo, e uma baforada salta da boca.
 *
 * A timeline vem do motor (lastAttackAt); no bestiário, `demoAttackSeq`
 * dispara a mesma coreografia. O projétil-assinatura (cunha de vapor com
 * núcleo fervente) usa os MESMOS materiais no ProjectileField.
 */

export const VAPOR_ATTACK_WINDOW = 0.62;
/** fração da janela em que a caldeira está carregando o jato (fogo acende) */
const VAPOR_WINDUP = 0.5;

const VAPOR_DEF = getSpecies('vapor');

/** nível da água fervendo dentro da boca (torus da boca em y=2.28) */
const MOUTH_Y = 2.18;

interface AttackPose {
  twist: number; // a caldeira toda torce carregando o jato
  crouch: number; // 0..1 ela agacha (as pernas de ferro dobram o peso)
  swing: number; // bicos de vapor (negativo = recuados, positivo = varrem)
  charge: number; // brasa/fissuras acesas + nuvem inchando (0..1)
  stepZ: number; // empurra a panela para frente no disparo
  flare: number; // válvulas e aro estufam
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, crouch: 0, swing: 0, charge: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > VAPOR_ATTACK_WINDOW) return P;
  const p = since / VAPOR_ATTACK_WINDOW;
  if (p < VAPOR_WINDUP) {
    // a fervura sobe DEVAGAR (a panela enche o folego) e segura no pico
    const k = (p / VAPOR_WINDUP) ** 1.25;
    P.twist = -0.34 * k;
    P.crouch = k;
    P.swing = -0.85 * k;
    P.charge = k;
    P.stepZ = -0.06 * k;
    P.flare = 0.5 * k;
    return P;
  }
  const r = (p - VAPOR_WINDUP) / (1 - VAPOR_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.26)) ** 2; // o jato sai quase junto
  const decay = 1 - Math.max(0, (r - 0.4) / 0.6);
  P.twist = (-0.34 + 0.8 * a) * decay;
  P.crouch = (1 - 0.9 * a) * decay;
  P.swing = (-0.85 + 1.9 * a) * decay;
  P.charge = Math.max(0, 1 - 1.6 * r) * decay;
  P.stepZ = (-0.06 + 0.3 * a) * decay;
  P.flare = (0.5 + 0.8 * a) * decay;
  return P;
}

interface IronLook {
  rockA: string;
  rockB: string;
  crack: string;
  crackGlow: number;
  crackScale: number;
  crackWidth: number;
  amp: number;
  speck?: number;
}

/** chapa de FERRO forjada (cinza-azulada, martelada) com as COSTURAS de
 *  brasa onde o fogo lambe a panela — fissuras de calor, não de pedra; e o
 *  cobre dos reforços/parafusos (role accent), mais quente e mais macio */
const IRON_ROLE_LOOK: Partial<Record<MatRole, IronLook>> = {
  body: {
    rockA: '#b9c2cf', // chapa de ferro Clara (no print de longe a paleta antiga lia ferro fundido QUEIMADO)
    rockB: '#6a7482',
    crack: '#ff7e33', // costura de brasa onde o fogo lambia — NÃO rio de lava
    crackGlow: 0.35,
    crackScale: 3.2, // corpo grande: veio FINO e denso (width 0.024 renderia aros largos de mármore — a lição do Gelo)
    crackWidth: 0.012,
    amp: 0.03,
    speck: 0.5,
  },
  dark: {
    rockA: '#8a93a0',
    rockB: '#4a535f',
    crack: '#d96a2e',
    crackGlow: 0.22,
    crackScale: 2.6,
    crackWidth: 0.014,
    amp: 0.026,
    speck: 0.5,
  },
  accent: {
    rockA: '#c98a4b', // cobre vivo dos bicos e reforços
    rockB: '#4a2f1c',
    crack: '#ffb26e',
    crackGlow: 0.5,
    crackScale: 2.4,
    crackWidth: 0.014,
    amp: 0.02,
    speck: 0.5,
  },
  glow: {
    rockA: '#6b564a', // brasa e porta do fogo: carvão aceso (aqui o brilho ALTO é legítimo)
    rockB: '#241713',
    crack: '#ffbe55',
    crackGlow: 2.0,
    crackScale: 2.3,
    crackWidth: 0.03,
    amp: 0.02,
    speck: 0.4,
  },
};

/** nuvens da cabeça (role steam): vapor branco-pêssego do braseiro */
const STEAM_LOOK = {
  body: { cool: '#eaf2f8', warm: '#ffd2a6', alpha: 0.85, swirl: 0.55 },
  steam: { cool: '#eaf2f8', warm: '#ffd2a6', alpha: 0.85, swirl: 0.55 },
  trans: { cool: '#e0e9f0', warm: '#ffddb8', alpha: 0.24, swirl: 1.1 }, // anel escaldante rente ao chão
};

function makeSteamRiseGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x2f1b79b9 ^ (n * 2654435761);
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface VaporRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** vapor subindo da boca */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a caldeira usa para o fio de vapor da boca e a baforada */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function VaporRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: VaporRigProps) {
  const modelDef = MODELS.vapor;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(
    VAPOR_DEF.levelMin,
    Math.min(VAPOR_DEF.levelMax, Math.round(levelProp ?? VAPOR_DEF.levelMin)),
  );
  const riseCount = embers ?? 18;
  const topY = formTop(VAPOR_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);
  const steamAcc = useRef(0);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const spikes: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'spike') spikes.push({ i, side, base });
    });
    return { arms, spikes };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // tint da equipe batendo na chapa (o vapor NUNCA usa tint — regra do
  // halo de geada: nuvem translúcida é branco-pêssego sempre)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    // olhos: o braseiro espiando pela nuvem (brilho sóbrio, sem aditivo)
    const eye = new THREE.MeshStandardMaterial({
      color: '#ffd9ae',
      emissive: '#ff8a3d',
      emissiveIntensity: 1.0,
      roughness: 0.3,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#1a0f08' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      if (p.m === 'steam' || p.m === 'trans') {
        const look = STEAM_LOOK[p.m] ?? STEAM_LOOK.steam!;
        const key = `S|${p.m}|${p.amp ?? 0.06}|${Math.round(p.p[1] * 100)}|${i % 3}`;
        let m = cache.get(key);
        if (!m) {
          m = makeSteamMaterial({
            cool: look.cool,
            warm: look.warm,
            amp: p.amp ?? 0.06,
            alpha: look.alpha,
            swirl: look.swirl,
            hotY: 0.9, // o fogo da caldeira (gradiente quente embaixo da nuvem)
            seed: seed + (i % 3) * 3.3,
            breath: p.tag === 'arm' || p.tag === 'spike' ? 0.4 : 1,
          });
          cache.set(key, m);
        }
        return m;
      }
      const look = IRON_ROLE_LOOK[p.m] ?? IRON_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeStoneMaterial({
          rockA: look.rockA,
          rockB: look.rockB,
          crack: look.crack,
          amp: p.amp ?? look.amp,
          crackGlow: look.crackGlow,
          crackScale: look.crackScale,
          crackWidth: look.crackWidth,
          speck: look.speck ?? 1,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' || p.tag === 'spike' ? 0.35 : 1,
          teamColor: team,
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
  }, [visParts, seed, level, team]);

  // água fervendo DENTRO da boca: o plasma do Raio repaletado para a água
  // em ebulição. O print cobrou: azul-pálido + facetado = CUBO DE GELO na
  // panela. Fervura é BRANCO-quase-quente com bolhas GROSSAS (amp alto),
  // orla levemente azul só no fresnel
  const core = useMemo(
    () => ({
      geo: new THREE.IcosahedronGeometry(0.92, 2),
      mat: makeCoreMaterial({
        gold: '#ffe0b0', // o vapor quente por dentro (quase branco, levemente pêssego)
        white: '#fff8ec', // a pele branca da fervura
        cool: '#cfe8ff', // orla azul SÓ no fresnel (água, não gelo)
        amp: 0.09, // bolhas largas mas NÃO montanhas: amp .12 achatado virava "pão sovado" no macro
        seed: 2.1,
      }),
    }),
    [],
  );

  // vapor subindo da boca em fio fino (o oposto das brasas do Magma: sobe
  // torto, felpudo, ESFRIANDO do pêssego do braseiro para o branco azulado)
  const rise = useMemo(() => {
    const geo = makeSteamRiseGeo(riseCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RISE_VERT,
      fragmentShader: RISE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uMouthY: { value: MOUTH_Y },
        uMouthR: { value: 0.9 },
        uCharge: { value: 0 },
      },
    });
    return { geo, mat };
  }, [riseCount, emberScale]);

  // ferro/pedra e vapor leem aSeed por peça; clonamos só as que os usam.
  // Chapa é metal LISO martelado: normal INTERPOLADA (sem flat do gelo —
  // panela facetada virava origami)
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
      rise.geo.dispose();
      rise.mat.dispose();
    };
  }, [partMats, core, rise]);

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
      if (demoT.current > VAPOR_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= VAPOR_WINDUP * VAPOR_ATTACK_WINDOW && sinceAttack <= VAPOR_ATTACK_WINDOW;

    // BAFOREADA no instante do disparo: vapor grosso da boca + dos bicos
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 8; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.5, MOUTH_Y + 0.3, (Math.random() - 0.5) * 1.3)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.14 + Math.random() * 0.08,
            heat: 0.35, // vapor escaldante (quente, mas mais claro que cinza)
            life: 1.1 + Math.random() * 0.6,
            lifeVar: 0.35,
            jitter: 0.26,
            rise: 0.9,
            drag: 2.6,
            vx: (Math.random() - 0.5) * 1.2,
            vz: (Math.random() - 0.5) * 1.0 + 0.5,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > VAPOR_ATTACK_WINDOW) strikeDone.current = false;

    // a caldeira NUNCA para de ferver: fio contínuo de vapor da boca
    if (smoke && alpha > 0.3) {
      steamAcc.current += dt * (0.55 + 0.6 * pose.charge) * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (steamAcc.current >= 1 && guard < 3) {
        steamAcc.current -= 1;
        guard++;
        rootRef.current?.updateWorldMatrix(true, false);
        tmpWorld
          .set((Math.random() - 0.5) * 0.9, MOUTH_Y + 0.5, (Math.random() - 0.5) * 0.9)
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.08 + Math.random() * 0.05,
          heat: 0.22, // vapor quente e claro (nunca fuligem)
          life: 1.5 + Math.random() * 0.8,
          lifeVar: 0.4,
          jitter: 0.14,
          rise: 0.95,
          drag: 2.0,
        });
      }
      if (steamAcc.current > 2) steamAcc.current = 2;
    }

    // ---- uniforms dos materiais de peça (ferro E vapor no mesmo loop) ----
    const fireBreath =
      Math.sin(t * 0.6 + seed) * 0.5 +
      Math.sin(t * 1.3 + seed * 0.7) * 0.3 +
      Math.sin(t * 2.7 + 1.4) * 0.2; // a brasa do leito estala
    const crumble = 1 - alpha; // morrendo: a caldeira ARREBENTA em vapor
    for (const m of partMats.shaders) {
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
      m.userData.baseAmp = baseAmp;
      const baseAlpha = (m.userData.baseAlpha as number | undefined) ??
        (m.uniforms.uAlpha ? m.uniforms.uAlpha.value : 1);
      m.userData.baseAlpha = baseAlpha;
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt;
      // vapor morrendo: explode em vaporada (charge sobe com a morte)
      m.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.7);
      m.uniforms.uBreath.value = fireBreath * (0.6 + 0.4 * hpFrac);
      m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 2.8);
      if (m.uniforms.uAlpha) m.uniforms.uAlpha.value = baseAlpha * Math.max(0, alpha);
    }
    // água fervendo na boca: ferve sempre, INCHA e clareia na carga do jato
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = pose.charge;
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.94 + 0.06 * Math.sin(t * 3.1 + seed) + pose.charge * 0.18;
    coreRef.current.scale.set(boil, boil * 0.38, boil);
    coreRef.current.rotation.y += dt * (0.4 + pose.charge * 2.4);
    const glow = coreGlowRef.current;
    glow.scale.setScalar(Math.max(0.6, 0.8 + pose.charge * 0.6));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.025 * Math.sin(t * 2.4 + seed) + pose.charge * 0.1) * alpha,
    );
    rise.mat.uniforms.uTime.value = t;
    rise.mat.uniforms.uAlpha.value = alpha;
    rise.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: o peso da panela de ferro, a torção do jato ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.4 + seed) * 0.012 + Math.sin(t * 0.9 + 1.7) * 0.005;
    const crouchY = 1 - pose.crouch * 0.05;
    g.scale.set(1 + pose.crouch * 0.035 + pose.flare * 0.015, crouchY, 1 + pose.crouch * 0.035);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.33 + seed * 0.6) * 0.007;
    g.rotation.x = pose.crouch * 0.045 - pose.twist * 0.08;
    g.position.y = Math.sin(t * 0.75 + seed) * 0.008 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (gotas ferventes ao redor da nuvem) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)];
    }

    // ---- peças: bicos que varrem, válvulas que assobiam, brasas flick ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const spike = actors.spikes.find((x) => x.i === i);

      if (arm) {
        // bico de vapor: recua carregando o jato e VARRE para frente
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.3;
        sc *= 1 + pose.charge * 0.45;
      } else if (spike) {
        // válvulas: assobiam (sopram para fora) quando ela carrega o jato
        const whistle = Math.sin(t * (1.1 + (i % 3) * 0.3) + i * 1.7) * 0.04;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (whistle + pose.flare * 0.24));
        sc *= 1 + pose.flare * 0.1;
      }

      if (part.flick && !arm && !spike) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
    }
    void topY; // topo amarrado nos testes; forma única Nv.6
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
      {/* a água fervendo dentro da boca (visível pelo vão do aro) */}
      <mesh
        ref={coreRef}
        geometry={core.geo}
        material={core.mat}
        position={[0, MOUTH_Y, 0]}
        scale={[1, 0.38, 1]}
      />
      <points geometry={rise.geo} material={rise.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, MOUTH_Y + 0.35, 0]} scale={0.8}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffd9ae"
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
 * Vapor que SOBE da boca: fio torto subindo espiralando, grande e macio,
 * ESFRIANDO do pêssego do braseiro (embaixo) para o branco-azulado (no
 * alto) — o oposto térmico das brasas do Magma (que são duras e morrem
 * apagadas). uCharge acelera e engrossa a coluna no disparo.
 */
const RISE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uMouthY;
uniform float uMouthR;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.22 + 0.3 * aRand.z;
  float prog = fract(uTime * speed * 0.28 * (1.0 + uCharge * 0.8) + aRand.y);
  // sobe torto e ESPIRALA (o vapor da boca se enrola em si mesmo)
  float ang = aRand.x * 6.28318 + prog * (1.2 + 2.4 * aRand.z) + uTime * 0.25;
  float r = uMouthR * (0.3 + 1.1 * prog * (0.5 + 0.7 * aRand.z));
  float y = uMouthY + prog * (1.6 + 1.8 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // nuvem felpuda: ponto GRANDE e macio (não o pingo duro da brasa)
  float size = (6.0 + 9.0 * aRand.z) * (0.8 + uCharge * 0.6) * uSizeMul * (0.55 + prog * 0.7);
  // CLAMP: perto da câmera o sprite virava parede de vapor (o "envelope
  // fantasma" do print b-10) — 90px é o teto do fiapo
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce denso na boca, desmancha no alto (a nuvem some virando fiapo)
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.45, 1.0, prog)) * uAlpha;
  // esfriando: pêssego do braseiro -> branco azulado
  vC = mix(vec3(1.0, 0.85, 0.66), vec3(0.87, 0.93, 0.98), smoothstep(0.0, 0.6, prog));
  gl_Position = projectionMatrix * mv;
}
`;

const RISE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // sem núcleo duro: fiapo de nuvem (suave de borda e sem blowout)
  float m = smoothstep(0.5, 0.18, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.4);
}
`;
