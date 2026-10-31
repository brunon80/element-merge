import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeIceMaterial } from './iceShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de GELO para a espécie Gelo (Nv.6 — o golem de cristal), no PADRÃO DO
 * GOLÉM (objeto físico, sem energia aditiva) mas com o figurino pedido:
 * cristalino, BRANCO, translúcido e reflexivo (iceShaders.ts):
 *
 *  1. CRISTAL DE GLACIAR: corpo quase branco com veios de fratura internos
 *     que pulsam devagar e ACENDEM quando ele carrega a estaca — o análogo
 *     gelado das fissuras de magma do golem; reflexo fake da arena varrendo
 *     as facetas (o "brilho de cristal" sem cubemap nem aditivo);
 *  2. NEVE — parado, ele expele flocos: points de floco de seis braços
 *     caindo em deriva lenta ao redor do corpo (o shader gira cada floco);
 *  3. ATAQUE (arremesso da estaca) — agacha e TORCE, o braço de icicle
 *     recua com as trincas ao máximo → tranco para frente, o braço varre,
 *     os espinhos da coroa elevam e uma rajada de neve/frota salta dos pés;
 *  4. Fragmentos orbitando devagar (o gelo ao redor respira).
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário,
 * `demoAttackSeq` dispara a mesma coreografia. A estaca-assinatura desenha
 * com o MESMO material no ProjectileField e os cacos do impacto também.
 */

export const ICE_ATTACK_WINDOW = 0.5;
/** fração da janela em que o Gelo está carregando a estaca */
const ICE_WINDUP = 0.42;

const GELO_DEF = getSpecies('gelo');

interface AttackPose {
  twist: number; // corpo torce (negativo = carregando)
  crouch: number; // 0..1 joelhos de gelo dobram / corpo desce
  swing: number; // braço (negativo = recuado, positivo = arremesso)
  charge: number; // trincas acesas (0..1)
  stepZ: number; // empurra o corpo para frente
  flare: number; // espinhos da coroa/ombros elevam
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, crouch: 0, swing: 0, charge: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > ICE_ATTACK_WINDOW) return P;
  const p = since / ICE_ATTACK_WINDOW;
  if (p < ICE_WINDUP) {
    const k = (p / ICE_WINDUP) ** 1.5;
    P.twist = -0.32 * k;
    P.crouch = k;
    P.swing = -0.95 * k;
    P.charge = k;
    P.stepZ = -0.06 * k;
    P.flare = 0.5 * k;
    return P;
  }
  const r = (p - ICE_WINDUP) / (1 - ICE_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.28)) ** 2; // a estaca sai quase de imediato
  const decay = 1 - Math.max(0, (r - 0.32) / 0.68);
  P.twist = (-0.32 + 0.8 * a) * decay;
  P.crouch = (1 - 0.9 * a) * decay;
  P.swing = (-0.95 + 2.1 * a) * decay;
  P.charge = Math.max(0, 1 - 1.6 * r) * decay;
  P.stepZ = (-0.06 + 0.3 * a) * decay;
  P.flare = (0.5 + 0.6 * a) * decay;
  return P;
}

interface IceLook {
  iceA: string;
  iceB: string;
  crack: string;
  crackGlow: number;
  crackScale: number;
  crackWidth: number;
  amp: number;
  alpha: number;
  sparkle?: number;
}

/** cristal BRANCO (o pedido): o azul aparece só no miolo denso e nos veios.
 *  A frequência das trincas é calibrada pelo PORTE da peça (a lição do print
 *  do Magma e deste): na frequência fixa, os veios do torso/ombros esticavam
 *  em borrachos largos (ondas de contorno), enquanto nas peças pequenas
 *  ficavam do tamanho certo. Peça maior → uCrackScale maior (veios mais
 *  densos) e o veio é FINO — gelo racha em trinca, não derrete em onda */
const ICE_ROLE_LOOK: Partial<Record<MatRole, IceLook>> = {
  body: {
    iceA: '#f2f9ff',
    iceB: '#9fc4dd',
    crack: '#cfeeff',
    crackGlow: 0.7,
    crackScale: 1.9,
    crackWidth: 0.022,
    amp: 0.04,
    alpha: 0.86,
  },
  dark: {
    iceA: '#cfe0ec',
    iceB: '#5f7f96',
    crack: '#a8d8ef',
    crackGlow: 0.45,
    crackScale: 1.5,
    crackWidth: 0.024,
    amp: 0.045,
    alpha: 0.92,
  },
  glow: {
    iceA: '#ffffff',
    iceB: '#bfe4ff',
    crack: '#e8fbff',
    crackGlow: 1.2,
    crackScale: 1.5,
    crackWidth: 0.02,
    amp: 0.028,
    alpha: 0.8,
    sparkle: 1.4,
  },
  accent: {
    iceA: '#e4f2ff',
    iceB: '#82aac6',
    crack: '#bfe8ff',
    crackGlow: 0.9,
    crackScale: 1.6,
    crackWidth: 0.022,
    amp: 0.03,
    alpha: 0.78,
  },
  trans: {
    iceA: '#bfe0f6',
    iceB: '#7ba6c2',
    crack: '#d8f2ff',
    crackGlow: 0.4,
    crackScale: 1.1,
    crackWidth: 0.02,
    amp: 0.012,
    alpha: 0.3,
    sparkle: 0.4,
  },
};

function makeFlakeGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 4); // x: ângulo, y: fase, z: tamanho, w: giro
  let s = 0x51f2b3c7;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 4; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  return g;
}

export interface IceRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** flocos de neve ao redor do corpo */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o glaciar usa para a névoa fria dos pés */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function IceRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: IceRigProps) {
  const modelDef = MODELS.gelo;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(
    GELO_DEF.levelMin,
    Math.min(GELO_DEF.levelMax, Math.round(levelProp ?? GELO_DEF.levelMin)),
  );
  const flakeCount = embers ?? 16;
  const topY = formTop(GELO_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);

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

  // tint da equipe (as luzes pontuais da arena batem no cristal)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    // olhos: azul profundo de glaciar (padrão do golem: 'white' brilha,
    // 'black' é órbita) — aqui o "brilho" é o azul frio, sem aditivo
    const eye = new THREE.MeshStandardMaterial({
      color: '#bfe4ff',
      emissive: '#5fa8d8',
      emissiveIntensity: 1.1,
      roughness: 0.25,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#0b1420' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      const look = ICE_ROLE_LOOK[p.m] ?? ICE_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeIceMaterial({
          iceA: look.iceA,
          iceB: look.iceB,
          crack: look.crack,
          amp: p.amp ?? look.amp,
          crackGlow: look.crackGlow,
          crackScale: look.crackScale,
          crackWidth: look.crackWidth,
          alpha: look.alpha,
          sparkle: look.sparkle ?? 1,
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
      ices: [...cache.values()] as THREE.ShaderMaterial[],
    };
  }, [visParts, seed, level, team]);

  // flocos de neve: parado, ele expele — caem em deriva lenta girando
  const flakes = useMemo(
    () => ({
      geo: makeFlakeGeo(flakeCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: FLAKE_VERT,
        fragmentShader: FLAKE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uSpread: { value: 1.15 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [flakeCount, emberScale, topY],
  );

  // materiais de cristal leem `aSeed` por peça; clonamos só as que o usam
  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        const g = geo.clone();
        g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([seed + i * 1.9]), 1));
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
      flakes.geo.dispose();
      flakes.mat.dispose();
    };
  }, [partMats, flakes]);

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
      if (demoT.current > ICE_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= ICE_WINDUP * ICE_ATTACK_WINDOW && sinceAttack <= ICE_ATTACK_WINDOW;

    // rajada de neve fria nos pés no instante do arremesso (névoa, não fuligem)
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 5; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.2, 0.07, (Math.random() - 0.5) * 0.9 + 0.2)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.08 + Math.random() * 0.05,
            heat: 0, // névoa fria (o oposto do magma)
            life: 0.9 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.2,
            rise: 0.35,
            drag: 3.4,
            vx: (Math.random() - 0.5) * 1.0,
            vz: (Math.random() - 0.5) * 1.0,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > ICE_ATTACK_WINDOW) strikeDone.current = false;

    // uniforms do cristal: as trincas internas pulsam devagar e ACENDEM na
    // carga (o padrão das fissuras do golem, na leitura gelada)
    const coldPulse = 0.4 + 0.18 * Math.sin(t * 1.2 + seed) + pose.charge * 1.4;
    const breath = Math.sin(t * 0.5 + seed) * 0.6 + Math.sin(t * 1.1 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: o cristal estilhaça
    for (const w of partMats.ices) {
      const baseAmp = (w.userData.baseAmp as number | undefined) ?? w.uniforms.uAmp.value;
      w.userData.baseAmp = baseAmp;
      w.uniforms.uTime.value = t;
      w.uniforms.uHurt.value = hurt;
      w.uniforms.uCharge.value = pose.charge;
      w.uniforms.uBreath.value = breath;
      w.uniforms.uCrackGlow.value =
        ((w.userData.baseGlow as number | undefined) ??
          (w.userData.baseGlow = w.uniforms.uCrackGlow.value)) *
        (1 + coldPulse * 0.5);
      w.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 3.2);
    }
    flakes.mat.uniforms.uTime.value = t;
    flakes.mat.uniforms.uAlpha.value = alpha;
    flakes.mat.uniforms.uCharge.value = pose.charge;

    // clarão sóbrio no peito de gelo (nunca aditivo forte — legibilidade)
    const core = coreGlowRef.current;
    core.scale.setScalar(0.5 + pose.charge * 0.16);
    (core.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + coldPulse * 0.05 + pose.charge * 0.09) * alpha,
    );

    // ---- corpo:Balanceio de glaciar, torção do arremesso, agachamento ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.42 + seed) * 0.018 + Math.sin(t * 0.95 + 1.7) * 0.007;
    const crouchY = 1 - pose.crouch * 0.06;
    g.scale.set(1 + pose.crouch * 0.04 + pose.flare * 0.02, crouchY, 1 + pose.crouch * 0.04);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.35 + seed * 0.6) * 0.01;
    g.rotation.x = pose.crouch * 0.05 - pose.twist * 0.1;
    g.position.y = Math.sin(t * 0.85 + seed) * 0.012 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (fragmentos flutuando ao redor) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)];
    }

    // ---- peças: braço da estaca, espinhos que elevam, lasca flick ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const spike = actors.spikes.find((x) => x.i === i);

      if (arm) {
        // braço de icicle: recua carregando a estaca e varre para frente
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.3;
        sc *= 1 + pose.charge * 0.25;
      } else if (spike) {
        // espinhos da coroa/ombros: levantam quando ele carrega a estaca
        const shimmer = Math.sin(t * (0.8 + (i % 3) * 0.25) + i * 1.9) * 0.03;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.28));
        sc *= 1 + pose.flare * 0.08;
      }

      if (part.flick && !arm && !spike) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.0 + i * 2.1 + seed));
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
      <points geometry={flakes.geo} material={flakes.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, 1.7, 0.45]} scale={0.5}>
        <spriteMaterial
          map={circleTexture()}
          color="#bfe4ff"
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Flocos de neve que caem em volta: deriva lenta (neve tem arrasto, não
 * peso), balanço lateral de vaivém e GIRO próprio — cada floco roda no
 * próprio eixo (aRand.w alimenta a rotação desenhada no frag).
 */
const FLAKE_VERT = /* glsl */ `
attribute vec4 aRand; // x: ângulo, y: fase, z: tamanho, w: giro
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uSpread;
uniform float uCharge;
varying float vA;
varying float vRot;
void main() {
  float speed = 0.10 + 0.12 * aRand.z;      // neve cai DEVAGAR
  float prog = fract(uTime * speed * 0.4 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.18;
  // deriva: o floco balança bem mais do que cai reto (o vento frio da peça)
  float drift = sin(uTime * 1.1 + aRand.y * 9.0 + prog * 9.0) * 0.22;
  float r = mix(0.5, 1.35, aRand.z) * uSpread + drift;
  float y = mix(uHeight * (0.5 + 0.5 * aRand.z), 0.04, prog);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.4 + 3.2 * aRand.z) * (1.0 + uCharge * 0.35) * uSizeMul;
  gl_PointSize = size * (28.0 / max(0.5, -mv.z));
  vA = smoothstep(0.0, 0.06, prog) * (1.0 - smoothstep(0.82, 0.99, prog)) * uAlpha;
  vRot = uTime * (0.6 + 2.2 * aRand.w) + aRand.y * 6.28318;
  gl_Position = projectionMatrix * mv;
}
`;

const FLAKE_FRAG = /* glsl */ `
varying float vA;
varying float vRot;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // floco de seis braços: três eixos girados de 60° cortando o ponto.
  // (nada de bolinha borrada — é o floco parado expelindo neve)
  float a = atan(d.y, d.x) + vRot;
  float arm = abs(cos(a * 3.0));                 // 3 eixos = 6 braços
  float radial = smoothstep(0.5, 0.06, length(d));
  float m = smoothstep(0.55, 0.2, arm) * radial + radial * 0.45;
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vec3(0.93, 0.97, 1.0), min(1.0, m) * vA * 0.85);
}
`;
