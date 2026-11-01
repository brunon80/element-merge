import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de PEDRA para o elemento terra (golem). Material em stoneShaders.ts
 * (rocha opaca com relevo procedural e fissuras de magma). Como no fogo/vento:
 *
 *  1. PROGRESSÃO POR NÍVEL — `partsForLevel` monta a silhueta do nível atual
 *     (Nv1 penedo → Nv2 rocha viva → Nv3 golem → Nv4 colosso → Nv5 MONTANHA
 *     MUSCULAR: traps/cabeças de ombro como dois picos, placas de abdomen,
 *     cumeeira de montanha nas costas e pedras flutuando em volta).
 *  2. ANIMAÇÃO DE ATAQUE (soco de pedreira) — o corpo agacha e TORCE para trás,
 *     o punho recua e as fissuras ACENDEM (carregando) → o corpo destorce, o
 *     punho dispara para frente, a mandíbula abre, o pico de ombro estufa e uma
 *     nuvem de poeira salta dos pés.
 *  3. VIDA DA ROCHA — respiração lenta do monólito, oscilação mínima, lascas
 *     caindo dos ombros e pedras orbitando (Nv4/Nv5).
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário, `demoAttackSeq`
 * dispara a mesma coreografia.
 */

export const STONE_ATTACK_WINDOW = 0.52;
/** fração da janela em que o golem está carregando o soco */
const STONE_WINDUP = 0.44;

const GOLEM_DEF = getSpecies('golem');

interface StoneLook {
  rockA: string;
  rockB: string;
  crack: string;
  crackGlow: number;
  amp: number;
  speck?: number;
}

/** rocha cinza-azulada com veios de magma; `glow` = placas já rachadas de luz */
export const STONE_ROLE_LOOK: Partial<Record<MatRole, StoneLook>> = {
  body: { rockA: '#a3acb7', rockB: '#474f59', crack: '#ff8a3c', crackGlow: 0.5, amp: 0.075 },
  glow: { rockA: '#b9906d', rockB: '#5b3a2a', crack: '#ffbe55', crackGlow: 1.5, amp: 0.05, speck: 0.4 },
  dark: { rockA: '#666f7a', rockB: '#242a33', crack: '#e06a28', crackGlow: 0.34, amp: 0.085 },
  trans: { rockA: '#8e98a4', rockB: '#3b434d', crack: '#ff9a4a', crackGlow: 0.8, amp: 0.06 },
};

interface AttackPose {
  twist: number; // tronco torce (negativo = carregando)
  crouch: number; // 0..1 joelhos dobram / corpo desce
  swing: number; // punho (negativo = recuado, positivo = soco estendido)
  charge: number; // fissuras acesas (0..1)
  stepZ: number; // empurra o corpo para frente
  roar: number; // mandíbula
  flare: number; // picos de ombro/cumeeira estufam
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    crouch: 0,
    swing: 0,
    charge: 0,
    stepZ: 0,
    roar: 0,
    flare: 0,
  };
  if (since < 0 || since > STONE_ATTACK_WINDOW) return P;
  const p = since / STONE_ATTACK_WINDOW;
  if (p < STONE_WINDUP) {
    const k = (p / STONE_WINDUP) ** 1.5;
    P.twist = -0.42 * k;
    P.crouch = k;
    P.swing = -0.9 * k;
    P.charge = k;
    P.stepZ = -0.08 * k;
    P.roar = 0.4 * k;
    P.flare = 0.5 * k;
    return P;
  }
  const r = (p - STONE_WINDUP) / (1 - STONE_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.3)) ** 2; // o soco dispara quase de imediato
  const decay = 1 - Math.max(0, (r - 0.34) / 0.66);
  P.twist = (-0.42 + 0.95 * a) * decay;
  P.crouch = (1 - 0.9 * a) * decay;
  P.swing = (-0.9 + 2.1 * a) * decay;
  P.charge = Math.max(0, (1 - 1.5 * r)) * decay;
  P.stepZ = (-0.08 + 0.34 * a) * decay;
  P.roar = (0.4 + 1.1 * a) * decay;
  P.flare = (0.5 + 0.6 * a) * decay;
  return P;
}

function makeChipGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x2545f491;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface StoneRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** lascas/cascalho caindo do corpo (cresce com o nível) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a terra usa para a poeira dos pés e do impacto */
  smoke?: SmokePool;
}

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

const tmpWorld = new THREE.Vector3();

export function StoneRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: StoneRigProps) {
  const modelDef = MODELS.golem;
  const level = clampLevel(levelProp);
  const chipCount = embers ?? 6 + level * 6;

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const clock = useRef(0);
  const demoT = useRef(-1);
  const dustAcc = useRef(0);
  const strikeDone = useRef(true);
  const chipAcc = useRef(new Map<string, [number, number, number]>());

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const topY = formTop(GOLEM_DEF, level);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const spikes: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const jaws: { i: number; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'spike') spikes.push({ i, side, base });
      else if (p.tag === 'jaw') jaws.push({ i, base });
    });
    return { arms, spikes, jaws };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // tint da equipe (o mesmo das luzes pontuais da arena)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    const moss = new THREE.MeshStandardMaterial({
      color: '#6f8f57',
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    const eye = new THREE.MeshStandardMaterial({
      color: '#ffe3b0',
      emissive: '#ffab4a',
      emissiveIntensity: 1.7,
      roughness: 0.35,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#0d1118' });
    const cache = new Map<string, THREE.Material>();
    // quanto mais evoluído, mais a pedra está rachada por dentro
    const glowMul = 0.55 + level * 0.24;
    const list = visParts.map((p, i) => {
      if (p.m === 'accent') return moss;
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      const look = STONE_ROLE_LOOK[p.m] ?? STONE_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeStoneMaterial({
          rockA: look.rockA,
          rockB: look.rockB,
          crack: look.crack,
          amp: p.amp ?? look.amp,
          crackGlow: look.crackGlow * glowMul,
          speck: look.speck ?? 1,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' || p.tag === 'spike' ? 0.35 : 1,
          teamColor: team,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values(), moss, eye, socket] };
  }, [visParts, seed, level, team]);

  const chips = useMemo(
    () => ({
      geo: makeChipGeo(chipCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: CHIP_VERT,
        fragmentShader: CHIP_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uSpread: { value: 0.55 + level * 0.2 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [chipCount, emberScale, level, topY],
  );

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      chips.geo.dispose();
      chips.mat.dispose();
    };
  }, [partMats, chips]);

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
      if (demoT.current > STONE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking = sinceAttack >= STONE_WINDUP * STONE_ATTACK_WINDOW && sinceAttack <= STONE_ATTACK_WINDOW;

    // poeira dos pés no instante do soco (e um fio contínuo enquanto carrega)
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 6 + level; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * (1.1 + level * 0.2), 0.06, (Math.random() - 0.5) * 0.9 + 0.2)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.09 + 0.02 * level + Math.random() * 0.05,
            heat: 0.12,
            life: 0.7 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.22,
            rise: 0.35,
            drag: 3.4,
            vx: (Math.random() - 0.5) * 1.2,
            vz: 0.6 + Math.random() * 1.4,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > STONE_ATTACK_WINDOW) strikeDone.current = false;

    // poeira de fundo: a pedra se desfaz um pouco em nível alto
    if (smoke && alpha > 0.3) {
      dustAcc.current += dt * (0.35 + 0.75 * level) * (0.6 + 0.4 * hpFrac);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 3) {
        dustAcc.current -= 1;
        guard++;
        rootRef.current?.updateWorldMatrix(true, false);
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.7 + level * 0.24),
            topY * (0.15 + Math.random() * 0.7),
            (Math.random() - 0.5) * (0.7 + level * 0.24),
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.05 + 0.012 * level,
          heat: 0.1,
          life: 0.7 + level * 0.06,
          lifeVar: 0.35,
          jitter: 0.14,
          rise: 0.18,
          drag: 3.0,
        });
      }
      if (dustAcc.current > 3) dustAcc.current = 3;
    }

    // uniforms do shader (carga do soco acende as fissuras)
    const breath = Math.sin(t * 0.62 + seed) * 0.6 + Math.sin(t * 1.3 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: a rocha se desfaz
    for (const m of partMats.list) {
      if (m instanceof THREE.ShaderMaterial) {
        const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
        m.userData.baseAmp = baseAmp;
        m.uniforms.uTime.value = t;
        m.uniforms.uHurt.value = hurt;
        m.uniforms.uCharge.value = pose.charge;
        m.uniforms.uBreath.value = breath * (0.6 + 0.4 * hpFrac);
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 2.6);
      }
    }
    chips.mat.uniforms.uTime.value = t;
    chips.mat.uniforms.uAlpha.value = alpha;
    chips.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: respiração, torção do soco, agachamento ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.5 + seed) * 0.022 + Math.sin(t * 1.1 + 1.7) * 0.008;
    const crouchY = 1 - pose.crouch * (0.06 + level * 0.006);
    g.scale.set(1 + pose.crouch * 0.05 + pose.flare * 0.03, crouchY, 1 + pose.crouch * 0.05);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.42 + seed * 0.6) * 0.012;
    g.rotation.x = pose.crouch * 0.05 - pose.twist * 0.12;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.014 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- peças: lascas, punho, mandíbula, picos de ombro ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const spike = actors.spikes.find((x) => x.i === i);
      const jaw = actors.jaws.find((x) => x.i === i);

      if (arm) {
        // punho: recua carregando e dispara para frente (eixo X local)
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.35;
        sc *= 1 + pose.charge * 0.45; // o punho ganha calor/luz ao carregar
      } else if (spike) {
        // picos de ombro/cumeeira: estufam quando o golem se prepara
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * pose.flare * 0.22);
        sc *= 1 + pose.flare * 0.12;
      } else if (jaw) {
        mesh.rotation.set(base[0] + pose.roar * 0.42, base[1], base[2]);
      }

      // lascas soltas balançam de leve com a respiração
      if (!arm && !spike && !jaw && part.flick) {
        const acc = chipAcc.current.get(`${level}:${i}`) ?? [0, 0, 0];
        acc[0] = Math.sin(t * (1.3 + (i % 4) * 0.35) + i * 2.1) * 0.05 * part.flick;
        acc[2] = Math.sin(t * (0.9 + (i % 3) * 0.4) + i) * 0.05 * part.flick;
        chipAcc.current.set(`${level}:${i}`, acc);
        mesh.rotation.set(base[0] + acc[0], base[1], base[2] + acc[2]);
      }

      if (sc !== 1) mesh.scale.setScalar(sc);
    }

    // ---- pedras flutuando em volta do colosso/montanha ----
    const orbital = modelDef.groups ?? {};
    for (const k of Object.keys(orbital)) {
      const gid = Number(k);
      const grp = groupRefs.current[gid];
      if (grp) grp.rotation.y += orbital[gid] * dt * (1 + pose.charge * 1.4);
    }
  });

  const orbitalGroups = modelDef.groups ?? {};

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => {
        const mesh = (
          <mesh
            key={`${level}-${i}`}
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={getGeometry(part.g, part.a)}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            castShadow
          />
        );
        if (part.group !== undefined && orbitalGroups[part.group] !== undefined) {
          return (
            <group
              key={`g${i}`}
              ref={(gr) => {
                groupRefs.current[part.group!] = gr;
              }}
            >
              {mesh}
            </group>
          );
        }
        return mesh;
      })}
      <points geometry={chips.geo} material={chips.mat} frustumCulled={false} />
    </group>
  );
}

/**
 * Lascas que se desprendem da pedra: caem em arco, girando, e somem no chão.
 * Nível alto = mais lascas (o corpo está se desfazendo de tanto magma dentro).
 */
const CHIP_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uSpread;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.24 + 0.34 * aRand.z;
  float prog = fract(uTime * speed * 0.55 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.35;
  float r = mix(0.35, 1.05, prog * 0.5 + 0.5 * aRand.z) * uSpread;
  // cai de um ponto alto do corpo até o chão
  float y = mix(uHeight * (0.35 + 0.6 * aRand.z), 0.02, prog);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.2 + 3.2 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.72, 0.98, prog)) * uAlpha;
  // pedra cinza com aresta quente quando o golem carrega o soco
  vC = mix(vec3(0.55, 0.58, 0.62), vec3(1.0, 0.55, 0.22), uCharge * 0.7 + 0.12);
  gl_Position = projectionMatrix * mv;
}
`;

const CHIP_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // lasca angular (losango), não bolinha: combina com pedra quebrada
  float m = smoothstep(0.5, 0.16, abs(d.x) + abs(d.y));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.85);
}
`;
