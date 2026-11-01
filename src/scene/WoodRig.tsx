import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeWoodMaterial } from './woodShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de MADEIRA para a espécie Madeira (Nv.6 — o ancião das raízes), no
 * MESMO padrão do golem (corpo opaco de shader + estilhaços físicos):
 *
 *  1. CASCA DE TRONCO OPACA (woodShaders) com sulcos verticais de madeira,
 *     musgo nas encimadas e VEIOS DE SEIVA esmeralda que pulsam devagar com a
 *     regeneração e ACENDEM quando ele carrega o disparo — o análogo lenhoso
 *     das fissuras de magma do golem;
 *  2. AS ASAS E AS JÓIAS do modelo (asas-leque de cristal e esmeraldas do
 *     peito/ombros/testa) ganham material de gema: facetado, esmeralda viva,
 *     pulsando com o succo da árvore e inflando na carga;
 *  3. VIDA DA FLORESTA — folhas/esporos caindo em espiral ao redor do corpo,
 *     succo lento do tronco, asas tremendo de leve;
 *  4. ATAQUE (catapulta de seiva) — ele agacha e torce, os galhos recuam, a
 *     esmeralda da barriga acende → o corpo destorce com um tranco, os galhos
 *     varrem para frente e uma nuvem de esporos salta dos pés.
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário,
 * `demoAttackSeq` dispara a mesma coreografia. O projétil-assinatura (a
 * semente de casca e seiva) é desenhado com o MESMO material no ProjectileField.
 */

export const WOOD_ATTACK_WINDOW = 0.5;
/** fração da janela em que a Madeira está carregando a seiva */
const WOOD_WINDUP = 0.42;

const MADEIRA_DEF = getSpecies('madeira');

interface AttackPose {
  twist: number; // tronco torce (negativo = carregando)
  crouch: number; // 0..1 pernas de raiz dobram / corpo desce
  swing: number; // galhos (negativo = recuados, positivo = varridos à frente)
  charge: number; // seiva acesa (0..1)
  stepZ: number; // empurra o corpo para frente
  flare: number; // joias e asas estufam/levantam
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, crouch: 0, swing: 0, charge: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > WOOD_ATTACK_WINDOW) return P;
  const p = since / WOOD_ATTACK_WINDOW;
  if (p < WOOD_WINDUP) {
    const k = (p / WOOD_WINDUP) ** 1.5;
    P.twist = -0.3 * k;
    P.crouch = k;
    P.swing = -0.9 * k;
    P.charge = k;
    P.stepZ = -0.06 * k;
    P.flare = 0.45 * k;
    return P;
  }
  const r = (p - WOOD_WINDUP) / (1 - WOOD_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.28)) ** 2; // o tranco sai quase de imediato
  const decay = 1 - Math.max(0, (r - 0.32) / 0.68);
  P.twist = (-0.3 + 0.75 * a) * decay;
  P.crouch = (1 - 0.9 * a) * decay;
  P.swing = (-0.9 + 2.05 * a) * decay;
  P.charge = Math.max(0, 1 - 1.6 * r) * decay;
  P.stepZ = (-0.06 + 0.3 * a) * decay;
  P.flare = (0.45 + 0.55 * a) * decay;
  return P;
}

interface WoodLook {
  barkA: string;
  barkB: string;
  moss: string;
  sap: string;
  amp: number;
  sapGlow?: number;
  speck?: number;
}

/** casca marfim-de-carvalho com musgo e seiva esmeralda (a paleta da referência) */
const WOOD_ROLE_LOOK: Partial<Record<MatRole, WoodLook>> = {
  body: { barkA: '#8a6a3f', barkB: '#3c2c1a', moss: '#4f7a3d', sap: '#3ee27f', amp: 0.075 },
  dark: { barkA: '#6d5233', barkB: '#2a1e12', moss: '#3f6632', sap: '#2fbf6f', amp: 0.085, sapGlow: 0.32 },
  accent: { barkA: '#77914f', barkB: '#33401f', moss: '#6f9a4a', sap: '#35d573', amp: 0.05, sapGlow: 0.8 },
};

function makeSporeGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x71d4f2a9;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface WoodRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** esporos/folhas caindo do corpo */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a floresta usa para a nuvem de esporos dos pés */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function WoodRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WoodRigProps) {
  const modelDef = MODELS.madeira;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(
    MADEIRA_DEF.levelMin,
    Math.min(MADEIRA_DEF.levelMax, Math.round(levelProp ?? MADEIRA_DEF.levelMin)),
  );
  const sporeCount = embers ?? 14;
  const topY = formTop(MADEIRA_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const wings: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'wing') wings.push({ i, side, base });
    });
    return { arms, wings };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // tint da equipe (as luzes pontuais da arena batem na casca)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    const eye = new THREE.MeshStandardMaterial({
      color: '#eafff0',
      emissive: '#5fe08c',
      emissiveIntensity: 1.3,
      roughness: 0.3,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#101508' });
    // joia esmeralda opaca e facetada (legível de longe, sem aditivo)
    const gemCache = new Map<string, THREE.MeshStandardMaterial>();
    const gems: THREE.MeshStandardMaterial[] = [];
    const gemOf = (key: string, opts?: THREE.MeshStandardMaterialParameters) => {
      let m = gemCache.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color: '#2f9e57',
          emissive: '#25c46e',
          emissiveIntensity: 0.5,
          roughness: 0.25,
          metalness: 0.05,
          flatShading: true,
          ...opts,
        });
        gemCache.set(key, m);
        gems.push(m);
      }
      return m;
    };
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      if (p.m === 'glow') {
        // asas-leque de cristal: mais translúcidas e frias que as joias
        if (p.tag === 'wing') {
          return gemOf(`wing${p.p[0] >= 0 ? 'R' : 'L'}`, {
            color: '#2a8f6a',
            emissive: '#1fd073',
            roughness: 0.15,
            transparent: true,
            opacity: 0.85,
          });
        }
        return gemOf(`gem|${Math.round(p.p[1] * 100)}|${Math.round(p.p[0] * 100)}`);
      }
      const look = WOOD_ROLE_LOOK[p.m] ?? WOOD_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeWoodMaterial({
          barkA: look.barkA,
          barkB: look.barkB,
          moss: look.moss,
          sap: look.sap,
          amp: p.amp ?? look.amp,
          sapGlow: look.sapGlow ?? 0.5,
          speck: look.speck ?? 1,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' ? 0.35 : 1,
          teamColor: team,
        });
        cache.set(key, m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), ...gemCache.values(), eye, socket],
      woods: [...cache.values()] as THREE.ShaderMaterial[],
      gems,
    };
  }, [visParts, seed, level, team]);

  const spores = useMemo(
    () => ({
      geo: makeSporeGeo(sporeCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPORE_VERT,
        fragmentShader: SPORE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uSpread: { value: 0.95 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [sporeCount, emberScale, topY],
  );

  // materiais de casca leem `aSeed` por peça (fase do grão); clonamos só as
  // peças que os recebem (as geometrias do catálogo são compartilhadas)
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
      spores.geo.dispose();
      spores.mat.dispose();
    };
  }, [partMats, spores]);

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
      if (demoT.current > WOOD_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= WOOD_WINDUP * WOOD_ATTACK_WINDOW && sinceAttack <= WOOD_ATTACK_WINDOW;
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 5; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.1, 0.08, (Math.random() - 0.5) * 0.8 + 0.15)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.07 + Math.random() * 0.05,
            heat: 0.04, // esporos frios (nada de brasa)
            life: 0.8 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 0.9,
            vz: (Math.random() - 0.5) * 0.9,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > WOOD_ATTACK_WINDOW) strikeDone.current = false;

    // uniforms: a seiva pulsa devagar com a regeneração (quanto mais HP, mais
    // viva) e ACRESCITA na carga do disparo — o padrão das fissuras do golem
    const vig = 0.35 + 0.65 * hpFrac;
    const sapPulse = 0.42 + 0.22 * Math.sin(t * 1.55 + seed) * vig + pose.charge * 1.15;
    const breath = Math.sin(t * 0.5 + seed) * 0.6 + Math.sin(t * 1.05 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: a madeira se desfaz
    for (const w of partMats.woods) {
      const baseAmp = (w.userData.baseAmp as number | undefined) ?? w.uniforms.uAmp.value;
      w.userData.baseAmp = baseAmp;
      w.uniforms.uTime.value = t;
      w.uniforms.uHurt.value = hurt;
      w.uniforms.uCharge.value = pose.charge;
      w.uniforms.uSap.value = sapPulse;
      w.uniforms.uBreath.value = breath * (0.6 + 0.4 * hpFrac);
      w.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 2.6);
    }
    for (const gem of partMats.gems) {
      gem.emissiveIntensity = Math.min(
        2.2,
        0.45 + 0.3 * Math.sin(t * 1.9 + seed) * vig + pose.charge * 1.5 + hurt * 0.4,
      );
    }
    spores.mat.uniforms.uTime.value = t;
    spores.mat.uniforms.uAlpha.value = alpha;
    spores.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: succo do tronco, torção do tranco, agachamento de raiz ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.45 + seed) * 0.02 + Math.sin(t * 1.0 + 1.7) * 0.008;
    const crouchY = 1 - pose.crouch * 0.07;
    g.scale.set(1 + pose.crouch * 0.05 + pose.flare * 0.02, crouchY, 1 + pose.crouch * 0.05);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.38 + seed * 0.6) * 0.012;
    g.rotation.x = pose.crouch * 0.05 - pose.twist * 0.1;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.01 + pose.crouch * -0.02;
    g.position.z = pose.stepZ;

    // ---- peças: galhos (arremesso), asas (elevam na carga), joias flick ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const wing = actors.wings.find((x) => x.i === i);

      if (arm) {
        // galhos: recuam carregando a seiva e varrem para frente no tranco
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.3;
        sc *= 1 + pose.charge * 0.3;
      } else if (wing) {
        // asas de cristal: tremem de leve e levantam quando ele carrega
        const flap = Math.sin(t * (0.7 + (i % 3) * 0.22) + i * 1.7) * 0.045;
        mesh.rotation.set(base[0], base[1], base[2] + wing.side * (flap + pose.flare * 0.3));
        sc *= 1 + pose.flare * 0.06;
      }

      if (part.flick && !arm && !wing) {
        sc *= 1 + part.flick * 2.5 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
    }

    // ---- clarão da esmeralda da barriga (sóbrio, como o núcleo do Raio) ----
    const core = coreGlowRef.current;
    core.scale.setScalar(0.4 + pose.charge * 0.14 + pose.flare * 0.06);
    (core.material as THREE.SpriteMaterial).opacity =
      Math.max(0, (0.06 + sapPulse * 0.08 + pose.charge * 0.1) * alpha);
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
      <points geometry={spores.geo} material={spores.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, 0.98, 0.6]} scale={0.4}>
        <spriteMaterial
          map={circleTexture()}
          color="#3fe07f"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Esporos e folhas que caem da copa: descem em flutter (dançam no XZ, não
 * caem em linha), girando devagar — o oposto das lascas pesadas da pedra.
 */
const SPORE_VERT = /* glsl */ `
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
  float speed = 0.12 + 0.2 * aRand.z;
  float prog = fract(uTime * speed * 0.55 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.25;
  // flutter: a folha desce balançando (o duplo do prog faz o vaivém)
  float swayX = sin(uTime * 2.2 + aRand.y * 12.0 + prog * 18.0) * 0.14;
  float r = mix(0.4, 1.15, aRand.z) * uSpread + swayX;
  float y = mix(uHeight * (0.45 + 0.5 * aRand.z), 0.02, prog);
  vec3 p = vec3(cos(ang) * r + swayX, y - 0.06 * sin(prog * 22.0), sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (2.0 + 2.6 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.06, prog) * (1.0 - smoothstep(0.8, 0.98, prog)) * uAlpha;
  // folha verde com broto âmbar quando a seiva corre acesa (carregando)
  float leaf = step(0.35, aRand.z);
  vC = mix(vec3(0.28, 0.5, 0.24), vec3(0.55, 0.75, 0.35), aRand.y) * leaf
     + vec3(0.9, 0.62, 0.2) * (1.0 - leaf) * 0.6
     + vec3(0.1, 0.5, 0.25) * uCharge * 0.6;
  gl_Position = projectionMatrix * mv;
}
`;

const SPORE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // folha: elipse alongada (não losango de pedra nem bolinha)
  float m = smoothstep(0.5, 0.12, abs(d.x) * 1.6 + abs(d.y) * 0.9);
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.8);
}
`;
