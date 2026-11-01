import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { makeCoreMaterial } from './lightningShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do MAGMA (Nv.6 — o colosso de lava), no MESMO padrão do golem: corpo de
 * rocha OPACA com fissuras incandescentes (o shader de pedra com basalto
 * escuro e crackGlow alto), pose de soco/arremesso e poeira nos pés. A
 * diferença vulcânica:
 *
 *  1. CORPO DE MONTANHA em três socalcos com borda de cratera — a cabeça
 *     pequena na beirada é o truque de escala que vende o tamanho;
 *  2. NÚCLEO DE LAVA na cratera (o mesmo material de plasma do Raio, na
 *     paleta da lava, agora não-aditivo e legível) — ferve e INCHA quando ele
 *     carrega o arremesso, e exala brasas que SOREM da cratera (pontos de
 *     brasa ascendentes, o oposto das lascas que caem do golem);
 *  3. ATAQUE (arremesso de matacão) — agacha, torce, o braço recua com as
 *     fissuras ao máximo → tranco para frente, o braço varre, a cratera
 *     CLAREIA como uma erupção curta e uma baforada de cinzas salta dos pés.
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário,
 * `demoAttackSeq` dispara a mesma coreografia. O projétil-assinatura (bloco de
 * lava com coração derretido) desenha com os MESMOS materiais no ProjectileField.
 */

export const MAGMA_ATTACK_WINDOW = 0.55;
/** fração da janela em que o colosso está carregando o matacão */
const MAGMA_WINDUP = 0.44;

const MAGMA_DEF = getSpecies('magma');

/** centro da cratera no modelo (torus em y=2.82; o núcleo ferve logo acima) */
const CRATER_Y = 2.92;

interface AttackPose {
  twist: number; // tronco torce (negativo = carregando)
  crouch: number; // 0..1 joelhos de pedra dobram
  swing: number; // braço (negativo = recuado, positivo = arremesso)
  charge: number; // fissuras acesas (0..1)
  stepZ: number; // empurra o corpo para frente
  flare: number; // cratera/ombros estufam
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, crouch: 0, swing: 0, charge: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > MAGMA_ATTACK_WINDOW) return P;
  const p = since / MAGMA_ATTACK_WINDOW;
  if (p < MAGMA_WINDUP) {
    const k = (p / MAGMA_WINDUP) ** 1.5;
    P.twist = -0.4 * k;
    P.crouch = k;
    P.swing = -0.95 * k;
    P.charge = k;
    P.stepZ = -0.07 * k;
    P.flare = 0.55 * k;
    return P;
  }
  const r = (p - MAGMA_WINDUP) / (1 - MAGMA_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.3)) ** 2; // o matacão sai quase de imediato
  const decay = 1 - Math.max(0, (r - 0.34) / 0.66);
  P.twist = (-0.4 + 0.95 * a) * decay;
  P.crouch = (1 - 0.9 * a) * decay;
  P.swing = (-0.95 + 2.15 * a) * decay;
  P.charge = Math.max(0, 1 - 1.5 * r) * decay;
  P.stepZ = (-0.07 + 0.34 * a) * decay;
  P.flare = (0.55 + 0.7 * a) * decay;
  return P;
}

interface MagmaLook {
  rockA: string;
  rockB: string;
  crack: string;
  crackGlow: number;
  crackScale: number;
  crackWidth: number;
  crackBoost: number;
  amp: number;
  speck?: number;
}

/** basalto quase preto com rios de lava largos (bem mais aceso que o golem).
 *  O corpo é do porte de uma montanha: sem uCrackScale alto, os veios da
 *  frequência base esticavam em rios enormes sobre as encostas (o "textura
 *  esticada" do print) e o glow alto saturava tudo em laranja sólido */
const MAGMA_ROLE_LOOK: Partial<Record<MatRole, MagmaLook>> = {
  body: {
    rockA: '#4a3733',
    rockB: '#191113',
    crack: '#ff6a1f',
    crackGlow: 1.15,
    crackScale: 1.6,
    crackWidth: 0.03,
    crackBoost: 1.1,
    amp: 0.075,
  },
  dark: {
    rockA: '#2c211f',
    rockB: '#0e0a0b',
    crack: '#e0501a',
    crackGlow: 0.55,
    crackScale: 1.35,
    crackWidth: 0.035,
    crackBoost: 0.9,
    amp: 0.07,
  },
  glow: {
    rockA: '#5c4038',
    rockB: '#20161a',
    crack: '#ffbe55',
    crackGlow: 1.9,
    crackScale: 2.2,
    crackWidth: 0.03,
    crackBoost: 1.3,
    amp: 0.05,
    speck: 0.4,
  },
};

function makeEmberGeo(n: number): THREE.BufferGeometry {
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

export interface MagmaRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** brasas subindo da cratera */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o vulcão usa para cinzas dos pés e baforada de fundo */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function MagmaRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: MagmaRigProps) {
  const modelDef = MODELS.magma;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(
    MAGMA_DEF.levelMin,
    Math.min(MAGMA_DEF.levelMax, Math.round(levelProp ?? MAGMA_DEF.levelMin)),
  );
  const emberCount = embers ?? 16;
  const topY = formTop(MAGMA_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);
  const ashAcc = useRef(0);

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

  // tint da equipe (as luzes pontuais da arena batem no basalto)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      const look = MAGMA_ROLE_LOOK[p.m] ?? MAGMA_ROLE_LOOK.body!;
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
          crackBoost: look.crackBoost,
          speck: look.speck ?? 1,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' || p.tag === 'spike' ? 0.35 : 1,
          teamColor: team,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values()] };
  }, [visParts, seed, level, team]);

  // núcleo de lava da cratera: plasma do Raio repaleta para a lava (o factory
  // já é NÃO-aditivo por decisão do ajuste fino — legível, sem blowout)
  const core = useMemo(
    () => ({
      geo: new THREE.IcosahedronGeometry(0.34, 1),
      mat: makeCoreMaterial({
        gold: '#ff5a1f',
        white: '#ffd08a',
        cool: '#ffcf7a',
        amp: 0.06,
        seed: 1.7,
      }),
    }),
    [],
  );

  const embersGeo = useMemo(() => ({
    geo: makeEmberGeo(emberCount),
    mat: new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT,
      fragmentShader: EMBER_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCraterY: { value: CRATER_Y },
        uCraterR: { value: 0.5 },
        uCharge: { value: 0 },
      },
    }),
  }), [emberCount, emberScale]);

  // materiais de rocha leem aSeed por peça; clonamos só as peças que os usam
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
      core.geo.dispose();
      core.mat.dispose();
      embersGeo.geo.dispose();
      embersGeo.mat.dispose();
    };
  }, [partMats, core, embersGeo]);

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
      if (demoT.current > MAGMA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= MAGMA_WINDUP * MAGMA_ATTACK_WINDOW && sinceAttack <= MAGMA_ATTACK_WINDOW;

    // baforada de cinzas no instante do arremesso (cinza quente, não poeira)
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 6; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.3, 0.06, (Math.random() - 0.5) * 1.0 + 0.2)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.1 + Math.random() * 0.06,
            heat: 0.3, // cinza ainda quente na base
            life: 0.9 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.24,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.0,
            vz: (Math.random() - 0.5) * 1.2,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > MAGMA_ATTACK_WINDOW) strikeDone.current = false;

    // rosnado do vulcão: fio contínuo de fumaça fina da cratera
    if (smoke && alpha > 0.3) {
      ashAcc.current += dt * 0.5 * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (ashAcc.current >= 1 && guard < 2) {
        ashAcc.current -= 1;
        guard++;
        rootRef.current?.updateWorldMatrix(true, false);
        tmpWorld
          .set((Math.random() - 0.5) * 0.5, CRATER_Y + 0.15, (Math.random() - 0.5) * 0.5)
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + Math.random() * 0.04,
          heat: 0.14,
          life: 1.4 + Math.random() * 0.8,
          lifeVar: 0.4,
          jitter: 0.12,
          rise: 0.85,
          drag: 2.2,
        });
      }
      if (ashAcc.current > 2) ashAcc.current = 2;
    }

    // uniforms da rocha: as fissuras acendem na carga (como o golem)
    const breath = Math.sin(t * 0.55 + seed) * 0.6 + Math.sin(t * 1.15 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: a montanha desaba
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
    // núcleo da cratera: ferve sempre, INCHA e clareia na carga do arremesso
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = pose.charge;
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.94 + 0.06 * Math.sin(t * 2.3 + seed) + pose.charge * 0.22;
    coreRef.current.scale.setScalar(boil);
    coreRef.current.rotation.y += dt * (0.5 + pose.charge * 2.2);
    const glow = coreGlowRef.current;
    glow.scale.setScalar(Math.max(0.55, 0.7 + pose.charge * 0.5 + pose.flare * 0.15));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.03 * Math.sin(t * 1.9 + seed) + pose.charge * 0.12) * alpha,
    );
    embersGeo.mat.uniforms.uTime.value = t;
    embersGeo.mat.uniforms.uAlpha.value = alpha;
    embersGeo.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: respiração da montanha, torção do arremesso ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.45 + seed) * 0.016 + Math.sin(t * 1.0 + 1.7) * 0.006;
    const crouchY = 1 - pose.crouch * 0.05;
    g.scale.set(1 + pose.crouch * 0.04 + pose.flare * 0.02, crouchY, 1 + pose.crouch * 0.04);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.38 + seed * 0.6) * 0.008;
    g.rotation.x = pose.crouch * 0.04 - pose.twist * 0.1;
    g.position.y = Math.sin(t * 0.8 + seed) * 0.01 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- peças: braço do arremesso, ombros que estufam, tampões flick ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const spike = actors.spikes.find((x) => x.i === i);

      if (arm) {
        // braço: recua carregando o matacão e varre para frente no arremesso
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.35;
        sc *= 1 + pose.charge * 0.4;
      } else if (spike) {
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * pose.flare * 0.2);
        sc *= 1 + pose.flare * 0.1;
      }

      if (part.flick && !arm && !spike) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
    }
    // o topo do modelo é amarrado nos testes; topY usado pela barra de vida da cena
    void topY;
  });

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => (
        <mesh
          key={`${level}-${i}`}
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
      ))}
      {/* núcleo de lava fervendo dentro da cratera */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} position={[0, CRATER_Y, 0]} />
      <points geometry={embersGeo.geo} material={embersGeo.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, CRATER_Y + 0.1, 0]} scale={0.7}>
        <spriteMaterial
          map={circleTexture()}
          color="#ff7a2a"
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Brasas que SOREM da cratera: sobem tortas, esfriam do branco-incandescente
 * para o brasa-fria e apagam no alto — o inverso das lascas que caem do golem
 * (vulcão expele, montanha de pedra desmorona).
 */
const EMBER_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCraterY;
uniform float uCraterR;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.30 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.35 + aRand.y);
  // sobe espiralando um pouco e deriva com o "vento" da cratera
  float ang = aRand.x * 6.28318 + prog * (2.0 + 3.0 * aRand.z);
  float r = uCraterR * (0.25 + 0.9 * prog * (0.4 + 0.6 * aRand.z));
  float y = uCraterY + prog * (1.1 + 1.3 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (1.8 + 2.8 * aRand.z) * (0.8 + uCharge * 0.5) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce acesa, morre devagar; some no alto
  vA = (1.0 - smoothstep(0.55, 1.0, prog)) * uAlpha;
  // esfriando: branca no berço -> laranja -> brasa vermelha no alto
  vC = mix(vec3(1.0, 0.85, 0.5), vec3(0.95, 0.32, 0.08), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const EMBER_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.08, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.85);
}
`;
