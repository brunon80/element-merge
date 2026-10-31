import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeWaterMaterial } from './waterShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de ÁGUA para o elemento água (Nereia). Material em waterShaders.ts
 * (massa translúcida com correntes, espuma no topo das ondas e fresnel).
 * Como nos outros elementos:
 *
 *  1. PROGRESSÃO POR NÍVEL — `partsForLevel` monta a silhueta do nível atual
 *     (Nv1 gotinha → Nv2 gota viva → Nv3 ondina → Nv4 grande onda → Nv5
 *     TSUNAMI: muralha de água larga com cacho de espuma quebrando na frente,
 *     funis de sucção nas laterais, jato no cume e bolhas orbitando).
 *  2. ANIMAÇÃO DE ATAQUE (arremesso de água) — o corpo ACHATA e puxa para
 *     trás (carregando a maré), as barbatanas varrem para trás, e então o
 *     corpo ESTICA e embica para frente soltando um jato: barbatanas disparam
 *     para frente, a fenda da boca abre e uma chuva de gotas espirra do topo.
 *  3. VIDA DA ÁGUA — flutuação suave, ondulação contínua no shader (uSwell),
 *     funis laterais girando em sentidos opostos e bolhas em órbita.
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário, `demoAttackSeq`
 * dispara a mesma coreografia.
 */

export const WATER_ATTACK_WINDOW = 0.55;
/** fração da janela em que a Nereia está carregando a maré */
const WATER_WINDUP = 0.45;

const NEREIA_DEF = getSpecies('nereia');

interface WaterLook {
  deep: string;
  mid: string;
  foam: string;
  alpha: number;
  foamAmt: number;
  swell: number;
}

/**
 * Paleta do catálogo (lineariza ao virar uniforme; ver waterShaders.ts). Os hex
 * casam com o VISUALS.nereia dos dados (#4db4ff corpo, #173e6e escuro) para o
 * shader ler azure saturado no pixel — e a onda branca fica SOBRE o azure.
 */
export const WATER_ROLE_LOOK: Partial<Record<MatRole, WaterLook>> = {
  body: { deep: '#123a66', mid: '#4db4ff', foam: '#eaf6ff', alpha: 0.85, foamAmt: 0.5, swell: 1 },
  glow: { deep: '#1a5c94', mid: '#7ad4ff', foam: '#f5fbff', alpha: 0.72, foamAmt: 0.55, swell: 1.3 },
  accent: { deep: '#2a6ea6', mid: '#8fd0ff', foam: '#ffffff', alpha: 0.75, foamAmt: 0.7, swell: 0.5 },
  trans: { deep: '#0d2a4d', mid: '#2a6ea6', foam: '#bfe0f6', alpha: 0.22, foamAmt: 0.3, swell: 1.5 },
  dark: { deep: '#081a33', mid: '#173e6e', foam: '#84b4d8', alpha: 0.8, foamAmt: 0.22, swell: 0.6 },
};

interface AttackPose {
  surge: number; // corpo puxado (neg) / arremessado (pos) para frente
  squash: number; // −1 = achatada carregando, +1 = esticada soltando
  swing: number; // barbatanas/pés (neg = varridas para trás, pos = disparam)
  charge: number; // energia acumulada (0..1)
  flare: number; // espuma/clarão estufam
  roar: number; // fenda da boca
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { surge: 0, squash: 0, swing: 0, charge: 0, flare: 0, roar: 0 };
  if (since < 0 || since > WATER_ATTACK_WINDOW) return P;
  const p = since / WATER_ATTACK_WINDOW;
  if (p < WATER_WINDUP) {
    const k = (p / WATER_WINDUP) ** 1.6;
    P.surge = -0.55 * k;
    P.squash = -k;
    P.swing = -0.85 * k;
    P.charge = k;
    P.flare = 0.45 * k;
    P.roar = 0.3 * k;
    return P;
  }
  const r = (p - WATER_WINDUP) / (1 - WATER_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.26)) ** 2; // o jato sai quase de imediato
  const decay = 1 - Math.max(0, (r - 0.36) / 0.64);
  P.surge = (-0.55 + 1.6 * a) * decay;
  P.squash = (-1 + 1.9 * a) * decay;
  P.swing = (-0.85 + 2.05 * a) * decay;
  P.charge = Math.max(0, 1 - 1.7 * r) * decay;
  P.flare = (0.45 + 0.75 * a) * decay;
  P.roar = (0.3 + 1.1 * a) * decay;
  return P;
}

function makeSprayGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x8abc1234;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface WaterRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** gotas de respingo (cresce com o nível) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — névoa d'água do arremesso */
  smoke?: SmokePool;
}

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

const tmpWorld = new THREE.Vector3();

export function WaterRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WaterRigProps) {
  const modelDef = MODELS.nereia;
  const level = clampLevel(levelProp);
  const sprayCount = embers ?? 10 + level * 8;

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sprayDone = useRef(true);
  const spinAcc = useRef(new Map<string, [number, number, number]>());
  const wobble = useRef(new Map<string, [number, number, number]>());

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const topY = formTop(NEREIA_DEF, level);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const crests: { i: number; base: [number, number, number] }[] = [];
    const jaws: { i: number; base: [number, number, number] }[] = [];
    const spins: { i: number; key: string; partDir: 1 | -1 }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'crest') crests.push({ i, base });
      else if (p.tag === 'jaw') jaws.push({ i, base });
      // funis de sucção giram na CPU em sentidos opostos (o shader da água não gira);
      // peças espelhadas giram ao contrário uma da outra
      if (p.g === 'vortex') {
        const dir = (p.tag === 'counter' ? -1 : 1) * (p.p[0] >= 0 ? 1 : -1);
        spins.push({ i, key: `sp${i}`, partDir: dir as 1 | -1 });
      }
      // anéis/aletas com spin no modelo giram na CPU
      if (p.spin) spins.push({ i, key: `spn${i}`, partDir: 1 });
    });
    return { arms, crests, jaws, spins };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // bolhas/espuma: AZULADAS — branco puro nas bolhas/olhos apagava o
    // contraste com as ondas brancas do corpo
    const foam = new THREE.MeshStandardMaterial({
      color: '#6fa8d8',
      emissive: '#3f7fae',
      emissiveIntensity: 0.28,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: true,
    });
    const eyeWhite = new THREE.MeshStandardMaterial({
      color: '#9cc8e8',
      emissive: '#5d9cc8',
      emissiveIntensity: 0.4,
      roughness: 0.4,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#0c1522' });
    const cache = new Map<string, THREE.Material>();
    // quanto mais evoluída, mais agitada a superfície
    const agitation = 0.7 + level * 0.14;
    const list = visParts.map((p, i) => {
      if (p.m === 'accent') return foam;
      if (p.m === 'white') return eyeWhite;
      if (p.m === 'black') return socket;
      const look = WATER_ROLE_LOOK[p.m] ?? WATER_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? 0.1}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        const solid = p.g === 'sphere' || p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca' || p.g === 'drop';
        const flat = p.g === 'ring' || p.g === 'plane';
        m = makeWaterMaterial({
          deep: look.deep,
          mid: look.mid,
          foam: look.foam,
          amp: flat ? 0 : (p.amp ?? 0.1) * 0.8 * agitation,
          swell: flat ? 0 : look.swell * (0.03 + level * 0.006),
          bend: flat ? 0 : 0.02 + level * 0.008,
          alphaMul: flat ? 0.4 : look.alpha,
          foamAmt: look.foamAmt,
          soft: solid || flat ? 0 : 1,
          seed: seed + (i % 3) * 2.9,
          phase: seed,
          yOff: p.p[1],
          modelH: topY,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values(), foam, eyeWhite, socket] };
  }, [visParts, seed, level, topY]);

  const spray = useMemo(
    () => ({
      geo: makeSprayGeo(sprayCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPRAY_VERT,
        fragmentShader: SPRAY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: topY },
          uSpread: { value: 0.5 + level * 0.22 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [sprayCount, emberScale, level, topY],
  );

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      spray.geo.dispose();
      spray.mat.dispose();
    };
  }, [partMats, spray]);

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
      if (demoT.current > WATER_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const releasing =
      sinceAttack >= WATER_WINDUP * WATER_ATTACK_WINDOW && sinceAttack <= WATER_ATTACK_WINDOW;

    // névoa do arremesso: uma rajada no instante em que o jato dispara
    if (releasing && !sprayDone.current) {
      sprayDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 5 + level; i++) {
          tmpWorld
            .set(
              (Math.random() - 0.5) * (0.8 + level * 0.18),
              topY * (0.4 + Math.random() * 0.5),
              0.6 + Math.random() * 0.5,
            )
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.06 + 0.012 * level + Math.random() * 0.03,
            heat: 0.02, // névoa fria
            life: 0.55 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.1,
            vz: 1.2 + Math.random() * 1.4,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > WATER_ATTACK_WINDOW) sprayDone.current = false;

    // uniforms do shader (surge empurra o corpo no arremesso; morrendo a água
    // agita demais e se desfaz)
    const crumble = 1 - alpha;
    for (const m of partMats.list) {
      if (m instanceof THREE.ShaderMaterial && m.uniforms.uSurge) {
        const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
        m.userData.baseAmp = baseAmp;
        m.uniforms.uTime.value = t;
        m.uniforms.uHurt.value = hurt;
        m.uniforms.uFlare.value = pose.flare;
        m.uniforms.uSurge.value = pose.surge;
        m.uniforms.uAlpha.value = alpha;
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.25 + crumble * 2.4);
      }
    }
    spray.mat.uniforms.uTime.value = t;
    spray.mat.uniforms.uAlpha.value = alpha;
    spray.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: flutuação, maré, squash do arremesso ----
    const g = rootRef.current;
    const floatBase = 0.03 + level * 0.012;
    const sway = Math.sin(t * 0.55 + seed) * 0.02 + Math.sin(t * 1.2 + 2.1) * 0.008;
    const sq = pose.squash; // −1 achatada .. +0.9 esticada
    g.scale.set(1 - sq * 0.16, 1 + sq * 0.2, 1 - sq * 0.16);
    g.rotation.y = sway;
    g.rotation.z = Math.sin(t * 0.4 + seed * 0.6) * 0.015;
    g.rotation.x = -pose.surge * 0.1;
    g.position.y = floatBase + Math.sin(t * 0.9 + seed) * 0.05 * (0.5 + 0.5 * hpFrac);
    g.position.z = pose.surge * 0.12;

    // clarão de maré (cresce com o nível e no arremesso) — discreto: um halo
    // aditivo grande demais lava a criatura de azul-branco
    if (glowRef.current) {
      const glow = glowRef.current;
      const baseGlow = 1.0 + level * 0.18;
      glow.scale.setScalar(Math.max(0.7, baseGlow + pose.flare * 0.6 + hurt * 0.3));
      glow.position.y = topY * 0.55;
      (glow.material as THREE.SpriteMaterial).opacity = Math.max(
        0,
        (0.06 + level * 0.012 + pose.charge * 0.14 + pose.flare * 0.18) * alpha,
      );
    }

    // ---- peças: barbatanas, cristas, boca, funis e anéis girando ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const crest = actors.crests.find((x) => x.i === i);
      const jaw = actors.jaws.find((x) => x.i === i);

      if (arm) {
        // barbatana/pé: varre para trás carregando e dispara na liberação
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.surge * 0.3;
        sc *= 1 + pose.charge * 0.18;
      } else if (crest) {
        // crista de espuma: estufa segurando e jorra para frente na liberação
        mesh.rotation.set(base[0] + pose.surge * 0.25, base[1], base[2]);
        sc *= 1 + pose.flare * 0.16;
      } else if (jaw) {
        mesh.rotation.set(base[0] + pose.roar * 0.4, base[1], base[2]);
      }

      // spin de CPU: funis laterais (counter giram ao contrário) e anéis
      const spin = actors.spins.find((x) => x.i === i);
      if (spin) {
        const acc = spinAcc.current.get(spin.key) ?? [0, 0, 0];
        const sp = part.spin ?? [0, spin.partDir * (1.1 + level * 0.12), 0];
        acc[0] += sp[0] * dt;
        acc[1] += sp[1] * dt;
        acc[2] += sp[2] * dt;
        spinAcc.current.set(spin.key, acc);
        mesh.rotation.set(base[0] + acc[0], base[1] + acc[1], base[2] + acc[2]);
      }

      // gotas/bolhas soltas (com `flick`) balançam devagar
      if (!arm && !crest && !jaw && part.flick) {
        const key = `${level}:${i}`;
        const acc = wobble.current.get(key) ?? [0, 0, 0];
        acc[0] = Math.sin(t * (1.2 + (i % 4) * 0.3) + i * 1.7) * 0.06 * part.flick;
        acc[2] = Math.sin(t * (0.8 + (i % 3) * 0.35) + i) * 0.06 * part.flick;
        wobble.current.set(key, acc);
        mesh.rotation.set(base[0] + acc[0], base[1], base[2] + acc[2]);
      }

      if (sc !== 1) mesh.scale.setScalar(sc);
    }

    // ---- bolhas/jatos orbitando (grupos do modelo) ----
    const orbital = modelDef.groups ?? {};
    for (const k of Object.keys(orbital)) {
      const gid = Number(k);
      const grp = groupRefs.current[gid];
      if (grp) grp.rotation.y += orbital[gid] * dt * (1 + pose.charge * 1.2);
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
      <points geometry={spray.geo} material={spray.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.7}>
        <spriteMaterial
          map={circleTexture()}
          color="#3f9fd8"
          transparent
          opacity={0.07}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Respingo de gotas: saem do corpo em arco, sobem e CAEM (água tem peso —
 * diferente dos detritos do vento, que sobem). Nível alto = mais gotas e mais
 * longe. Usam NormalBlending para não estourar em branco.
 */
const SPRAY_VERT = /* glsl */ `
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
  float speed = 0.32 + 0.3 * aRand.z;
  float prog = fract(uTime * speed * 0.75 + aRand.y);
  float T = prog * 1.35; // segundos de voo
  float ang = aRand.x * 6.28318 + prog * 1.2;
  // arco parabólico: sobe com v0, cai com gravidade (escala do jogo)
  float v0 = 1.4 + 2.2 * aRand.z;
  float y0 = uHeight * (0.25 + 0.65 * aRand.z);
  float y = y0 + v0 * T - 3.6 * T * T;
  float r = (0.75 + 0.3 * aRand.z + (0.7 + 1.6 * aRand.z) * T * (0.6 + 0.6 * uCharge)) * uSpread;
  vec3 p = vec3(cos(ang) * r, max(0.02, y), sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (1.2 + 1.9 * aRand.z) * uSizeMul;
  gl_PointSize = size * (28.0 / max(0.5, -mv.z));
  vA = smoothstep(0.0, 0.06, prog) * (1.0 - smoothstep(0.78, 0.98, prog)) * uAlpha;
  // gotas AZULADAS (partículas quase brancas lambiam o corpo da criatura);
  // clareiam um pouco quando a maré está carregada
  vC = mix(vec3(0.22, 0.48, 0.75), vec3(0.42, 0.68, 0.92), 0.35 + 0.5 * uCharge);
  gl_Position = projectionMatrix * mv;
}
`;

const SPRAY_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.12, length(d) * 2.0);
  // reflexo pontual no topo da gota
  float hi = smoothstep(0.0, 0.35, -(d.y + d.x * 0.4));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC + 0.15 * hi, m * vA * 0.7);
}
`;
