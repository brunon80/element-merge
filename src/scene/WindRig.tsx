import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeWindMaterial } from './windShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de VENTO para o elemento ar (zéfiro). Material compartilhado em
 * windShaders.ts (casca translúcida, dupla face, fitas de vento subindo).
 * O rig cuida de três coisas, igual ao do fogo:
 *
 *  1. PROGRESSÃO POR NÍVEL — `partsForLevel` escolhe as partes do nível atual
 *     (Nv1 sopro redondo → Nv5 TORNADO com funis cruzados e bigorna de nuvem),
 *     então a silhueta muda de verdade a cada fusão. Quanto maior o vendaval:
 *     mais estilhaços orbitando, mais poeira sugada e mais luz.
 *  2. ANIMAÇÃO DE ATAQUE (rajada) — o funil INALA (encolhe, pás recuam,
 *     mandíbula de sucção abre, torção acumula energia) → SOLTA (chicote para
 *     frente, pás varrem, funil estica e expande, rotação dispara).
 *  3. VIDA DO VENTO — dança idle: rotação diferencial nos shaders (a base gira
 *     mais rápido que o topo), balanço de coluna, respiração dos anéis e grupos
 *     de lufadas orbitando.
 *
 * A timeline do ataque vem do motor (lastAttackAt) em combate; no bestiário,
 * `demoAttackSeq` dispara a mesma coreografia.
 */

export const WIND_ATTACK_WINDOW = 0.42;

/** dados da espécie (alturas por forma vêm do catálogo de dados) */
const ZEPHYR_DEF = getSpecies('zephyr');

interface WindLook {
  cold: string;
  mid: string;
  hot: string;
  alpha: number;
  /** enrolamento por altura (rad/unidade) */
  twist: number;
  /** rad/s na base (o topo gira ~40% mais devagar) */
  spin: number;
}

/** tons de tempestade: azul-acinzentado na massa, branco só nas fitas e bordas */
export const WIND_ROLE_LOOK: Partial<Record<MatRole, WindLook>> = {
  body: { cold: '#2b4f6e', mid: '#8ab4d2', hot: '#e9f4ff', alpha: 0.85, twist: 1.05, spin: 2.1 },
  glow: { cold: '#5aa9d0', mid: '#cbe6f8', hot: '#ffffff', alpha: 0.7, twist: 1.55, spin: 3.0 },
  accent: { cold: '#47708f', mid: '#b6d6ea', hot: '#f2faff', alpha: 0.6, twist: 0.75, spin: 2.6 },
  trans: { cold: '#1d3f5c', mid: '#6e9ab6', hot: '#cfe6f5', alpha: 0.3, twist: 0.6, spin: 1.2 },
  dark: { cold: '#1b3149', mid: '#3f5f78', hot: '#8fb4cd', alpha: 0.5, twist: 0.7, spin: 1.6 },
};

/** o vendaval criatura abaixo flutua mais (o tornado de Nv5 pisa o chão) */
const FLOAT_Y = [0.34, 0.24, 0.13, 0.05, 0];
const BOB_AMP = [0.11, 0.09, 0.07, 0.045, 0.02];

interface AttackPose {
  lean: number; // coluna inclina (negativo = recolhendo/inalando)
  swing: number; // pás e lâminas (para frente no release)
  flare: number; // energia de rotação (0..1) — acelera torção e brilho
  stepZ: number; // empurra o corpo para frente
  roar: number; // mandíbula de sucção aberta
  suck: number; // 1 = funil comprimido (inalando), negativo = expande
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { lean: 0, swing: 0, flare: 0, stepZ: 0, roar: 0, suck: 0 };
  if (since < 0 || since > WIND_ATTACK_WINDOW) return P;
  const p = since / WIND_ATTACK_WINDOW;
  if (p < 0.36) {
    const k = (p / 0.36) ** 1.6; // inala (puxa para dentro)
    P.lean = -0.2 * k;
    P.swing = -0.42 * k;
    P.flare = 0.5 * k;
    P.stepZ = -0.07 * k;
    P.roar = 0.45 * k;
    P.suck = k;
    return P;
  }
  const r = (p - 0.36) / 0.64;
  const a = 1 - (1 - Math.min(1, r / 0.4)) ** 2; // solta a rajada de golpe
  const decay = 1 - Math.max(0, (r - 0.4) / 0.6);
  P.lean = (-0.2 + 0.72 * a) * decay;
  P.swing = (-0.42 + 1.75 * a) * decay;
  P.stepZ = (-0.07 + 0.26 * a) * decay;
  P.flare = Math.min(1, 0.5 + 0.95 * a) * decay;
  P.roar = (0.45 + 1.15 * a) * decay;
  P.suck = (1 - 1.4 * a) * decay; // volta e passa do ponto: o ar se expande
  return P;
}

function makeMoteGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x9e3779b9;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface WindRigProps {
  /** offset de fase (criaturas vizinhas não dançam juntas) */
  seed: number;
  /** quando presente, o rig lê dano/morte/HP da unidade no motor */
  unitId?: number;
  /** nível da unidade (1..5) — define a silhueta e a força do vendaval */
  level?: number;
  /** quantidade de estilhaços carregados pelo funil (cresce com o nível) */
  embers?: number;
  /** multiplicador de tamanho dos estilhaços (bestiário vê de mais perto) */
  emberScale?: number;
  /** incrementar dispara a coreografia de ataque (bestiário) */
  demoAttackSeq?: number;
  /** pool compartilhado — o vento usa para a poeira sugada */
  smoke?: SmokePool;
}

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

const tmpWorld = new THREE.Vector3();

export function WindRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WindRigProps) {
  const modelDef = MODELS.zephyr;
  const level = clampLevel(levelProp);
  const moteCount = embers ?? 10 + level * 9;

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const dustAcc = useRef(0);
  /** rotações acumuladas das peças com `spin` (anéis/lufadas) por (nível,índice) */
  const spinAcc = useRef(new Map<string, [number, number, number]>());

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const topY = formTop(ZEPHYR_DEF, level);

  // peças que o ataque mexe: lâminas/pás de arremesso, barbatanas, mandíbula
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const wings: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const jaws: { i: number; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'wing') wings.push({ i, side, base });
      else if (p.tag === 'jaw') jaws.push({ i, base });
    });
    return { arms, wings, jaws };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // um material por (papel, turbulência, altura da peça) — a torção e o balanço
  // coerentes do funil inteiro exigem saber em que altura do modelo a peça fica
  const partMats = useMemo(() => {
    const eyeWhite = new THREE.MeshStandardMaterial({
      color: '#dcecf8',
      emissive: '#8fc6e8',
      emissiveIntensity: 0.7,
      roughness: 0.4,
      flatShading: true,
    });
    const pupil = new THREE.MeshBasicMaterial({ color: '#0b1220' });
    const cache = new Map<string, THREE.Material>();
    const spinMul = 0.72 + level * 0.16; // vendaval maior gira mais rápido
    const twistMul = 1 + (level - 1) * 0.12;
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eyeWhite;
      if (p.m === 'black') return pupil;
      const look = WIND_ROLE_LOOK[p.m] ?? WIND_ROLE_LOOK.body!;
      const key = `${p.m}|${p.g}|${p.amp ?? 0.1}|${p.tag ?? ''}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        // funis marcados 'counter' giram no sentido contrário: dois funis
        // entrelaçados dão volume e leitura de turbilhão
        const dir = p.tag === 'counter' ? -1 : 1;
        const solid = p.g === 'sphere' || p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca';
        // discos/ anéis rasos (poeira no chão): ficam no lugar e só brilham —
        // torção e balanço são para as cascas verticais do funil
        const flat = p.g === 'ring' || p.g === 'plane';
        m = makeWindMaterial({
          cold: look.cold,
          mid: look.mid,
          hot: look.hot,
          // turbulência contida: acima disso a casca se desloca para dentro e a
          // silhueta vira borrão (o monstro some na distância do tabuleiro)
          amp: flat ? 0 : (p.amp ?? 0.1) * 0.72,
          twist: flat ? 0 : look.twist * twistMul,
          spin: flat ? 0 : look.spin * spinMul * dir,
          bend: flat ? 0 : 0.02 + level * 0.012,
          alphaMul: flat ? 0.34 : look.alpha,
          soft: solid || flat ? 0 : 1,
          seed: seed + (i % 3) * 1.9 + (dir < 0 ? 7.7 : 0),
          phase: seed,
          yOff: p.p[1],
          modelH: topY,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values(), eyeWhite, pupil] };
  }, [visParts, seed, level, topY]);

  const motes = useMemo(
    () => ({
      geo: makeMoteGeo(moteCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY }, // sobem pelo funil até o topo da forma
          uR1: { value: 0.15 + 0.05 * level }, // raio na base (pescoço do funil)
          uR2: { value: 0.55 + 0.16 * level }, // abre em leque acima do funil
          uSpin: { value: 1.1 + level * 0.4 },
        },
      }),
    }),
    [moteCount, emberScale, level, topY],
  );

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, motes]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor (dano, HP, morte, ataque)
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let dying = 0;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
          dying = 1 - alpha;
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > WIND_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // ventos fortes (nível alto, HP baixo) fervem mais; morrer desmancha o funil
    const ampMul =
      (0.7 + 0.3 * hpFrac) *
      (1 + pose.flare * 0.45) *
      (1 + hurt * 0.35) *
      (1 + (level - 1) * 0.06) *
      (1 + dying * 0.9);
    const spinBoost = 1 + pose.flare * 1.6 + dying * 1.4;
    for (const m of partMats.list) {
      if (m instanceof THREE.ShaderMaterial) {
        const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
        const baseSpin = (m.userData.baseSpin as number | undefined) ?? m.uniforms.uSpin.value;
        const baseBend = (m.userData.baseBend as number | undefined) ?? m.uniforms.uBend.value;
        m.userData.baseAmp = baseAmp;
        m.userData.baseSpin = baseSpin;
        m.userData.baseBend = baseBend;
        m.uniforms.uTime.value = t;
        m.uniforms.uHurt.value = hurt;
        m.uniforms.uAlpha.value = alpha;
        m.uniforms.uFlare.value = pose.flare;
        m.uniforms.uAmp.value = baseAmp * ampMul;
        m.uniforms.uSpin.value = baseSpin * spinBoost;
        m.uniforms.uBend.value = baseBend * (1 + dying * 2.2);
      }
    }
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;

    // ---- dança do vendaval + coreografia da rajada ----
    const g = rootRef.current;
    const lv = level - 1;
    const pulse =
      Math.sin(t * 1.35 + seed) * 0.6 + Math.sin(t * 2.7 + 2.2 + seed * 0.4) * 0.4;
    const surge = Math.max(0, Math.sin(t * 0.7 + seed) * 1.4 - 0.7) * 0.12;
    const breathe = 1 + pulse * 0.028 + pose.suck * -0.06 + pose.flare * 0.03;
    const hpDip = 0.78 + 0.22 * hpFrac;
    g.scale.set(
      breathe,
      (1 + pulse * 0.03 + pose.flare * 0.07 + pose.suck * 0.05) * hpDip,
      breathe,
    );
    g.rotation.z = Math.sin(t * 0.9 + seed) * 0.045 + pose.lean * 0.25;
    g.rotation.x = Math.sin(t * 1.1 + seed * 0.8) * 0.03 + pose.lean;
    g.rotation.y = Math.sin(t * 0.35 + seed * 0.5) * 0.16;
    g.position.y = FLOAT_Y[lv] + Math.sin(t * 1.6 + seed) * BOB_AMP[lv] + surge * 0.6;
    g.position.z = pose.stepZ;

    // ---- POEIRA sugada pelo funil (mais poeira conforme o vendaval cresce) ----
    if (smoke && alpha > 0.25) {
      dustAcc.current += dt * (1.1 + 2.1 * level);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 4) {
        dustAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        // Nv4/Nv5 cospem poeira do chão; os primeiros soltam lufadas do corpo
        const low = level >= 4 ? 0.02 + Math.random() * 0.3 : 0.2 + Math.random() * 0.6;
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.5 + level * 0.16),
            topY * low,
            (Math.random() - 0.5) * (0.5 + level * 0.16),
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + 0.016 * level,
          heat: 0.06 + Math.random() * 0.14, // poeira fria, não brasa
          life: 0.85 + level * 0.09,
          lifeVar: 0.45,
          jitter: 0.2,
          rise: 0.3 + level * 0.05,
          drag: 2.9,
        });
      }
      if (dustAcc.current > 4) dustAcc.current = 4;
    }

    // ---- peças: spin próprio, tremor e coreografia ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = part.flick ? 1 + part.flick * 0.35 * Math.sin(t * (7 + (i % 5)) + i * 2.1) : 1;

      const key = `${level}:${i}`;
      const arm = actors.arms.find((a) => a.i === i);
      const wing = actors.wings.find((w) => w.i === i);
      const jaw = actors.jaws.find((j) => j.i === i);

      if (arm) {
        // lâmina/pá do arremesso: varre para frente no release
        mesh.rotation.y = base[1] - 1.0 * pose.swing * arm.side;
        mesh.rotation.x = base[0] + pose.lean * 0.4;
        sc *= 1 + 0.6 * pose.flare; // a pá engorda de vento
      } else if (wing) {
        // barbatanas: batem devagar quando livre, escancaram na rajada
        const flap = Math.sin(t * (1.0 + level * 0.1) + seed + (wing.side === 1 ? 0 : 0.4));
        const open = 0.12 + 0.15 * flap + pose.flare * 0.55;
        mesh.rotation.set(
          base[0] + pose.lean * 0.7,
          base[1] + flap * 0.09,
          base[2] + wing.side * open,
        );
        sc *= 1 + pose.flare * 0.16;
      } else if (jaw) {
        // mandíbula de sucção: abre puxando o ar e escancara ao soltar a rajada
        mesh.rotation.set(
          base[0] + pose.roar * 0.4 + Math.sin(t * 1.4 + seed) * 0.035,
          base[1],
          base[2],
        );
      } else {
        // anéis/discos giram no próprio plano (e os discos rasos de poeira não
        // têm `spin` no modelo — o rig dá a eles uma rotação lenta própria)
        const sp =
          part.spin ?? (part.g === 'ring' ? ([0, 0, 0.9] as [number, number, number]) : null);
        if (sp) {
          const acc = spinAcc.current.get(key) ?? [0, 0, 0];
          acc[0] += sp[0] * dt * spinBoost;
          acc[1] += sp[1] * dt * spinBoost;
          acc[2] += sp[2] * dt * spinBoost;
          spinAcc.current.set(key, acc);
          mesh.rotation.set(base[0] + acc[0], base[1] + acc[1], base[2] + acc[2]);
        }
      }

      if (sc !== 1) mesh.scale.setScalar(sc);
    }

    // ---- lufadas orbitando o funil ----
    const orbital = modelDef.groups ?? {};
    for (const k of Object.keys(orbital)) {
      const gid = Number(k);
      const grp = groupRefs.current[gid];
      if (grp) grp.rotation.y += orbital[gid] * dt * (1 + pose.flare * 1.5);
    }

    // ---- clarão frio da tempestade ----
    const glow = glowRef.current;
    const baseGlow = 1.4 + level * 0.32;
    glow.scale.setScalar(Math.max(0.8, baseGlow + pulse * 0.25 + hurt * 0.4 + pose.flare * 0.7));
    glow.position.y = topY * 0.52;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.15 + level * 0.03 + pulse * 0.05 + hurt * 0.16 + pose.flare * 0.24) * alpha,
    );
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
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.8}>
        <spriteMaterial
          map={circleTexture()}
          color="#7fc4ee"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Estilhaços carregados pelo funil: sobem em espiral apertada (a base do funil
 * é estreita e o topo abre em leque), girando mais rápido embaixo — são poeira,
 * folhas e luz de relâmpago subindo junto com a coluna de vento.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uR1;
uniform float uR2;
uniform float uSpin;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.26 + 0.46 * aRand.z;
  float prog = fract(uTime * speed * 0.6 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * uSpin * (1.35 - 0.55 * prog) + prog * 7.5;
  float r = mix(uR1, uR2, prog * prog) * (0.5 + 0.6 * aRand.z);
  vec3 p = vec3(cos(ang) * r, prog * uHeight, sin(ang) * r);
  p.x += sin(uTime * 3.1 + aRand.x * 9.0 + prog * 8.0) * 0.06;
  p.z += cos(uTime * 2.7 + aRand.y * 7.0 + prog * 6.0) * 0.06;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (4.4 * (1.0 - prog) + 1.5) * (0.65 + 0.6 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // vivem até o topo do funil (o rastro de detritos é a marca do tornado)
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.72, 1.0, prog)) * uAlpha;
  vec3 dust = vec3(0.7, 0.65, 0.53);
  vC = mix(mix(dust, vec3(0.62, 0.85, 0.98), aRand.z), vec3(1.0, 1.0, 1.0), prog) * 1.05;
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.1, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.8);
}
`;
