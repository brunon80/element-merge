import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeFlameMaterial } from './flameShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig de CHAMA para o elemento fogo (ignis). Visual: shaders compartilhados
 * em flameShaders.ts (a bola de fogo dos projéteis usa exatamente o mesmo
 * material). O rig cuida de três coisas:
 *
 *  1. PROGRESSÃO POR NÍVEL — `partsForLevel` seleciona as partes do nível
 *     atual (Nv1 imps → Nv5 dragão de fogo), então a silhueta muda de verdade
 *     a cada fusão: mais comprido, mais patas, asas, crina, chifres, cauda.
 *     Chamas maiores = mais brasas, mais luz e MUITO mais fuligem saindo do
 *     corpo (pool compartilhado com a trilha dos projéteis).
 *  2. ANIMAÇÃO DE ATAQUE — recolher (corpo inclina pra trás, braços/patas da
 *     frente sobem reunindo energia) → arremesso (chicote pra frente, passo à
 *     frente, estouro de clarão, asas abrem e mandíbula ruge) → repouso.
 *  3. VIDA DA CHAMA — dança idle (tremor, respingo, torção via shader).
 *
 * A timeline do ataque é sincronizada pela janela do motor (lastAttackAt) em
 * combate; no bestiário, `demoAttackSeq` dispara a mesma coreografia.
 */

export const ATTACK_WINDOW = 0.4;

/** dados da espécie (alturas por forma vêm do catálogo de dados, não do modelo) */
const IGNIS_DEF = getSpecies('ignis');

interface FlameLook {
  cold: string;
  mid: string;
  hot: string;
  alpha: number;
}

// cores quentes e brilhantes — o corpo precisa ser denso, não fantasma
export const ROLE_LOOK: Partial<Record<MatRole, FlameLook>> = {
  body: { cold: '#ff3d0a', mid: '#ff8a1e', hot: '#ffe6a0', alpha: 1.0 },
  glow: { cold: '#ff8a2a', mid: '#ffd05e', hot: '#fff7d8', alpha: 1.05 },
  dark: { cold: '#b8280a', mid: '#ff5a12', hot: '#ffa64d', alpha: 0.8 },
};

interface AttackPose {
  lean: number; // inclinação do corpo (negativo = recolhendo)
  swing: number; // balanço dos braços/patas (para frente no arremesso)
  flare: number; // energia reunida/estouro (0..1)
  stepZ: number; // passo à frente no arremesso
  roar: number; // mandíbula aberta (rugido de fogo)
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { lean: 0, swing: 0, flare: 0, stepZ: 0, roar: 0 };
  if (since < 0 || since > ATTACK_WINDOW) return P;
  const p = since / ATTACK_WINDOW;
  if (p < 0.32) {
    const k = (p / 0.32) ** 2; // recolher (acelera)
    P.lean = -0.26 * k;
    P.swing = -0.3 * k;
    P.flare = 0.55 * k;
    P.stepZ = -0.06 * k;
    P.roar = 0.5 * k;
    return P;
  }
  const r = (p - 0.32) / 0.68;
  const a = 1 - (1 - Math.min(1, r / 0.42)) ** 2; // estalo pra frente
  const b = Math.max(0, (r - 0.42) / 0.58); // retorno suave ao repouso
  const decay = 1 - b;
  P.lean = (-0.26 + 0.68 * a) * decay;
  P.swing = (-0.3 + 1.4 * a) * decay;
  P.stepZ = (-0.06 + 0.23 * a) * decay;
  P.flare = Math.min(1, 0.55 + 0.9 * a) * decay;
  P.roar = (0.5 + 1.3 * a) * decay;
  return P;
}

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

export interface FlameRigProps {
  /** offset de fase para unitários não dançarem sincronizados */
  seed: number;
  /** quando presente, o rig lê o estado da unidade no motor (dano/morte/HP) */
  unitId?: number;
  /** nível da unidade (1..5) — define a silhueta e a intensidade do fogo */
  level?: number;
  /** quantidade de brasões (padrão cresce com o nível) */
  embers?: number;
  /** multiplicador de tamanho das fagulhas (bestiário vê de mais perto) */
  emberScale?: number;
  /** incrementar dispara a coreografia de ataque (bestiário) */
  demoAttackSeq?: number;
  /** pool de fuligem compartilhado (fumaça que emerge das chamas) */
  smoke?: SmokePool;
}

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

const tmpWorld = new THREE.Vector3();

export function FlameRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: FlameRigProps) {
  const modelDef = MODELS.ignis;
  const level = clampLevel(levelProp);
  const emberCount = embers ?? 12 + level * 8;

  const flameRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sootAcc = useRef(0);

  // partes do nível atual + altura do topo (para a fuligem sair das chamas)
  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  const topY = formTop(IGNIS_DEF, level);

  // partes animáveis: patas da frente do arremesso, asas, mandíbula
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; axis: 'x' | 'y'; baseX: number }[] = [];
    const wings: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const jaws: { i: number; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') {
        // perna/pata da frente (apontando para baixo) gira no eixo X; braço
        // horizontal gira no Y
        arms.push({ i, side, axis: Math.abs(base[0]) > 2 ? 'x' : 'y', baseX: base[0] });
      } else if (p.tag === 'wing') {
        wings.push({ i, side, base });
      } else if (p.tag === 'jaw') {
        jaws.push({ i, base });
      }
    });
    return { arms, wings, jaws };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // materiais de chama deduplicados por (papel, turbulência, rótulo, fase) —
  // um dragão Nv5 tem dezenas de partes, então não faz sentido um material cada
  const partMats = useMemo(() => {
    const eyeWhite = new THREE.MeshStandardMaterial({
      color: '#f8e7c8',
      emissive: '#ffcf8a',
      emissiveIntensity: 0.85,
      roughness: 0.4,
      flatShading: true,
    });
    const pupil = new THREE.MeshBasicMaterial({ color: '#140b06' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eyeWhite;
      if (p.m === 'black') return pupil;
      const look = ROLE_LOOK[p.m] ?? ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? 0.1}|${p.tag ?? ''}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeFlameMaterial({
          cold: look.cold,
          mid: look.mid,
          hot: look.hot,
          amp: p.amp ?? 0.1,
          alphaMul: look.alpha,
          seed: seed + (i % 3) * 2.1,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values(), eyeWhite, pupil] };
  }, [visParts, seed]);

  const ember = useMemo(
    () => ({
      geo: makeEmberGeo(emberCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uSpread: { value: 0.55 + level * 0.18 }, // fogo maior solta brasas mais longe
          uHeight: { value: topY }, // brasas sobem junto da coluna de fogo do nível
        },
      }),
    }),
    [emberCount, emberScale, level, topY],
  );

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      ember.geo.dispose();
      ember.mat.dispose();
    };
  }, [partMats, ember]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor (dano, HP, morte) — alimentam os uniforms
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
      if (demoT.current > ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // fogo mais forte (nível alto) ferve mais
    const ampMul =
      (0.62 + 0.38 * hpFrac) * (1 + pose.flare * 0.5) * (1 + hurt * 0.4) * (1 + (level - 1) * 0.07);
    for (const m of partMats.list) {
      if (m instanceof THREE.ShaderMaterial) {
        const base = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
        m.userData.baseAmp = base;
        m.uniforms.uTime.value = t;
        m.uniforms.uHurt.value = hurt;
        m.uniforms.uAlpha.value = alpha;
        m.uniforms.uAmp.value = base * ampMul;
      }
    }
    ember.mat.uniforms.uTime.value = t;
    ember.mat.uniforms.uAlpha.value = alpha;

    // ---- dança da chama + coreografia de ataque ----
    const g = flameRef.current;
    const flick =
      Math.sin(t * 5.7 + seed) * 0.55 +
      Math.sin(t * 11.9 + 3.1) * 0.3 +
      Math.sin(t * 2.3 + seed * 0.7) * 0.15;
    const surge = Math.max(0, Math.sin(t * 0.9 + seed) * 1.6 - 0.65) * 0.13;
    const stretch = 1 + flick * 0.075 + surge + pose.flare * 0.1;
    const hpDip = 0.75 + 0.25 * hpFrac;
    g.scale.set(1 - (stretch - 1) * 0.5, stretch * hpDip, 1 - (stretch - 1) * 0.5);
    g.rotation.z = Math.sin(t * 1.8 + seed) * 0.07 + Math.sin(t * 4.7 + 1.1) * 0.03;
    g.rotation.x = Math.sin(t * 2.2 + seed) * 0.04 + pose.lean;
    g.position.y = Math.sin(t * 2.6 + seed * 1.3) * 0.05 + surge * 0.7;
    g.position.z = pose.stepZ;

    // ---- FULIGEM emergindo das chamas (quantidade e tamanho com o nível) ----
    if (smoke && alpha > 0.25) {
      sootAcc.current += dt * (2.2 + 2.7 * level);
      let guard = 0;
      while (sootAcc.current >= 1 && guard < 4) {
        sootAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        // sale da coluna de fogo: altura entre 45% e 105% do topo
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.4 + level * 0.16),
            topY * (0.45 + Math.random() * 0.6),
            (Math.random() - 0.5) * (0.4 + level * 0.16) - 0.15,
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.055 + 0.016 * level,
          heat: 0.35 + Math.random() * 0.3,
          life: 1.0 + level * 0.08,
          lifeVar: 0.5,
          jitter: 0.14,
          rise: 0.55,
          drag: 2.4,
        });
      }
      if (sootAcc.current > 4) sootAcc.current = 4;
    }

    // tremor por parte (dado 'flick') + coreografia de patas/asas/mandíbula
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      let sc = part.flick ? 1 + part.flick * Math.sin(t * (9 + (i % 5)) + i * 2.3) : 1;

      const arm = actors.arms.find((a) => a.i === i);
      if (arm) {
        if (arm.axis === 'x') {
          // pata da frente: avança no arremesso, recolhe antes dele
          mesh.rotation.x = arm.baseX - 0.62 * pose.swing;
        } else {
          mesh.rotation.y = -0.95 * pose.swing * arm.side;
        }
        sc *= 1 + 0.65 * pose.flare; // a "bola de fogo" cresce na mão/pata
        const mat = partMats.list[i];
        if (mat instanceof THREE.ShaderMaterial) {
          const baseMul =
            (mat.userData.baseAlphaMul as number | undefined) ?? mat.uniforms.uAlphaMul.value;
          mat.userData.baseAlphaMul = baseMul;
          mat.uniforms.uAlphaMul.value = baseMul * (1 + 0.5 * pose.flare);
        }
      }

      const wing = actors.wings.find((w) => w.i === i);
      if (wing) {
        // batida idle (mesma fase para todas as partes de um mesmo lado) +
        // abertura máxima e puxada para trás no instante do arremesso
        const flap = Math.sin(t * (1.5 + level * 0.08) + seed + (wing.side === 1 ? 0 : 0.35));
        const open = 0.18 + 0.2 * flap + pose.flare * 0.55;
        mesh.rotation.set(
          wing.base[0] + pose.lean * 0.8,
          wing.base[1] + flap * 0.08,
          wing.base[2] + wing.side * open,
        );
        sc *= 1 + pose.flare * 0.18;
      }

      const jaw = actors.jaws.find((j) => j.i === i);
      if (jaw) {
        // rugido de fogo: mandíbula abre ao reunir energia e escancara no lançamento
        mesh.rotation.set(jaw.base[0] + pose.roar * 0.42 + Math.sin(t * 1.7 + seed) * 0.04, jaw.base[1], jaw.base[2]);
      }

      mesh.scale.setScalar(sc);
    }

    // clarão quente (cresce com o nível e explode no arremesso)
    const glow = glowRef.current;
    const baseGlow = 1.5 + level * 0.28;
    const s2 = Math.max(0.6, baseGlow + flick * 0.3 + hurt * 0.5 + pose.flare * 0.7);
    glow.scale.setScalar(s2);
    glow.position.y = topY * 0.5;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.18 + level * 0.03 + flick * 0.07 + hurt * 0.2 + pose.flare * 0.3) * alpha,
    );
  });

  return (
    <group ref={flameRef}>
      {visParts.map((part, i) => (
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
      ))}
      <points geometry={ember.geo} material={ember.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.65}>
        <spriteMaterial
          map={circleTexture()}
          color="#ff5a1a"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

const EMBER_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: velocidade/tamanho
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uSpread;
uniform float uHeight;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.32 + 0.42 * aRand.z;
  float prog = fract(uTime * speed + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.5 * (1.0 + aRand.z);
  float r = mix(0.14, 0.75, prog) * (0.5 + 0.5 * aRand.z) * uSpread;
  vec3 p = vec3(cos(ang) * r, mix(0.2, 1.0, prog) * uHeight, sin(ang) * r);
  p.x += sin(uTime * 2.3 + aRand.x * 10.0 + prog * 9.0) * 0.08;
  p.z += cos(uTime * 2.0 + aRand.y * 8.0 + prog * 7.0) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (5.0 * (1.0 - prog) + 1.2) * (0.7 + 0.5 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.45, 1.0, prog)) * uAlpha;
  vC = mix(vec3(1.0, 0.85, 0.35), vec3(1.0, 0.28, 0.05), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const EMBER_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.12, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA);
}
`;
