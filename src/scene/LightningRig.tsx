import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import {
  makeArcMaterial,
  makeCoreMaterial,
  makeLightningShellMaterial,
} from './lightningShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import type { SmokePool } from './smokePool';
import { getSpecies } from '../data/monsters';

/**
 * Rig do RAIO (Nv.6 — espírito da trovoada), o primeiro elemento da árvore
 * com rig próprio de shader, no mesmo figurino dos quatro puros:
 *
 *  1. CASCA DOURADA OPACA (lightningShaders) com nervuras elétricas correndo
 *     pela superfície, aletas de descarga que eriçam na carga e uma CAVIDADE
 *     de plasma no peito — o núcleo dourado pulsante fica exposto e vaza luz;
 *  2. ARCOS ORBITANDO O CORPO — os dois anéis do modelo (grupos 0/1) ganham o
 *     material de arco: traços dourados correndo em sentidos opostos, com
 *     zigue-zague nervoso; faíscas pontuais estalando ao redor;
 *  3. RAJADAS DO NÚCLEO — um pool de mini-descargas (cilindros aditivos)
 *     exala do centro para fora em curtas rajadas que piscam e somem; a
 *     cadência dobra quando ele carrega o disparo;
 *  4. ATAQUE (descarga) — o corpo estufa de carga, os anéis aceleram, o
 *     núcleo clareia → no release um clarão branco salta pela frente do corpo
 *     e uma salva de rajadas é cuspida na direção do alvo.
 *
 * A timeline do ataque vem do motor (lastAttackAt); no bestiário,
 * `demoAttackSeq` dispara a mesma coreografia. O projétil-assinatura (a
 * "corrente" elétrica) é desenhado com os MESMOS materiais no ProjectileField.
 */

export const LIGHTNING_ATTACK_WINDOW = 0.42;
/** fração da janela em que o raio está carregando a descarga */
const LIGHTNING_WINDUP = 0.4;

const RAIO_DEF = getSpecies('raio');

interface AttackPose {
  charge: number; // energia acumulada (0..1) — nervuras e aletas acendem
  flash: number; // clarão do release (0..1, decai rápido)
  stepZ: number; // empurra o corpo para frente no disparo
  swell: number; // corpo estufa carregando / colapsa soltando
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = { charge: 0, flash: 0, stepZ: 0, swell: 0 };
  if (since < 0 || since > LIGHTNING_ATTACK_WINDOW) return P;
  const p = since / LIGHTNING_ATTACK_WINDOW;
  if (p < LIGHTNING_WINDUP) {
    const k = (p / LIGHTNING_WINDUP) ** 1.4;
    P.charge = k;
    P.swell = k;
    P.stepZ = -0.05 * k;
    return P;
  }
  const r = (p - LIGHTNING_WINDUP) / (1 - LIGHTNING_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.22)) ** 2; // a descarga sai de golpe
  const decay = 1 - Math.max(0, (r - 0.3) / 0.7);
  P.charge = Math.max(0, 1 - 1.8 * r) * decay;
  P.flash = Math.max(0, 1 - 2.4 * r);
  P.stepZ = (-0.05 + 0.3 * a) * decay;
  P.swell = (1 - 1.5 * a) * decay;
  return P;
}

function makeSparkGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x5bf03db7;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface LightningRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** faíscas estalando ao redor do corpo */
  embers?: number;
  emberScale?: number;
  /** incrementar dispara a coreografia de ataque (bestiário) */
  demoAttackSeq?: number;
  /** pool compartilhado (não usado pelo raio — a trovoada não solta fumaça) */
  smoke?: SmokePool;
}

const tmpDir = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

interface BurstBolt {
  dir: [number, number, number];
  life: number;
  max: number;
  rad: number;
  volley: boolean;
}

const BURST_CAP = 6;
/** centro do núcleo no modelo (dodeca/ico/torus em y=1.15) */
const CORE_Y = 1.15;

export function LightningRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
}: LightningRigProps) {
  const modelDef = MODELS.raio;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(RAIO_DEF.levelMin, Math.min(RAIO_DEF.levelMax, Math.round(levelProp ?? RAIO_DEF.levelMin)));
  const sparkCount = embers ?? 16;

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const glowRef = useRef<THREE.Sprite>(null!);
  const flashRef = useRef<THREE.Sprite>(null!);
  const burstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const burstAcc = useRef(0);
  const strikesDone = useRef(new Set<number>());

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  // tint da equipe (as luzes pontuais da arena batem na casca dourada)
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    const eye = new THREE.MeshStandardMaterial({
      color: '#fff3c4',
      emissive: '#ffd94a',
      emissiveIntensity: 1.9,
      roughness: 0.3,
      flatShading: true,
    });
    const pupil = new THREE.MeshBasicMaterial({ color: '#141006' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return pupil;
      if (p.m === 'accent') {
        // fragmentos orbitais: traços de arco correndo (fluxo invertido dá
        // leitura de corrente em duas direções)
        const key = `arc|${i % 2}|${Math.round(p.p[1] * 100)}`;
        let m = cache.get(key);
        if (!m) {
          m = makeArcMaterial({
            gold: '#ffb31f',
            white: '#fff3b0',
            jitter: 1.4,
            dash: 8,
            flow: i % 2 === 0 ? 5.5 : -4.2,
            seed: seed + i * 2.6,
          });
          cache.set(key, m);
        }
        return m;
      }
      if (p.m === 'glow') {
        if (p.g === 'torus') {
          // anel orbital: ARCO elétrico circulando o corpo (traço dourado
          // tracejado correndo, zigue-zague nervoso na linha)
          const key = `ring|${Math.round((p.r?.[1] ?? 0) * 100)}`;
          let m = cache.get(key);
          if (!m) {
            m = makeArcMaterial({
              gold: '#ffc63a',
              white: '#fffbe0',
              jitter: 0.9,
              dash: 26,
              flow: p.group === 1 ? -7 : 7,
              seed: seed + (p.group ?? 0) * 4.4,
            });
            cache.set(key, m);
          }
          return m;
        }
        if (p.g === 'cone') {
          // pináculos de faísca: curtos e sempre estalando na ponta
          const key = `sparkCone|${i % 2}`;
          let m = cache.get(key);
          if (!m) {
            m = makeArcMaterial({
              gold: '#ffd23f',
              white: '#ffffff',
              jitter: 1.6,
              dash: 3,
              flow: i % 2 === 0 ? 6 : -8,
              seed: seed + i * 1.7,
            });
            cache.set(key, m);
          }
          return m;
        }
        // núcleo de plasma dourado (aparece pela cavidade do peito)
        const key = `core|${Math.round(p.p[1] * 100)}`;
        let m = cache.get(key);
        if (!m) {
          m = makeCoreMaterial({
            gold: '#ffcf4d',
            white: '#fff8d6',
            amp: 0.06,
            seed: seed + 1.3,
          });
          cache.set(key, m);
        }
        return m;
      }
      // corpo: casca dourada opaca com nervuras, aletas e a janela do núcleo
      const key = `shell|${p.g}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeLightningShellMaterial({
          body: '#ffd23f',
          dark: '#7a5c12',
          vein: '#ffe14d',
          core: '#ffcf4d',
          amp: p.amp ?? 0.028,
          coreCut: p.g === 'dodeca' ? 0.5 : 0,
          seed: seed + (i % 3) * 3.1,
          teamColor: team,
        });
        cache.set(key, m);
      }
      return m;
    });
    return { list, uniq: [...cache.values(), eye, pupil] };
  }, [visParts, seed, level, team]);

  const sparks = useMemo(
    () => ({
      geo: makeSparkGeo(sparkCount),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPARK_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: CORE_Y - 0.45 },
          uY1: { value: CORE_Y + 0.45 },
          uR1: { value: 0.5 },
          uR2: { value: 0.86 },
          uSpin: { value: 2.4 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [sparkCount, emberScale],
  );

  // rajadas do núcleo: mini-descargas aditivas exalando do centro para fora
  const bursts = useMemo(() => {
    const geo = getGeometry('cyl', [0.02, 0.008, 0.5, 5]);
    const mats = Array.from({ length: BURST_CAP }, () =>
      new THREE.MeshBasicMaterial({
        color: '#ffe98a',
        map: circleTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    return { geo, mats };
  }, []);

  const burstData = useMemo<BurstBolt[]>(
    () =>
      Array.from({ length: BURST_CAP }, () => ({
        dir: [0, 1, 0] as [number, number, number],
        life: 0,
        max: 0.16,
        rad: 1,
        volley: false,
      })),
    [],
  );

  // materiais de arco/plasma leem `aSeed` por peça (fase do traço); as
  // geometrias do catálogo são compartilhadas, então clonamos apenas as peças
  // que recebem esses materiais e carimbamos aSeed com o seed do rig
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
      for (const m of bursts.mats) m.dispose();
      sparks.geo.dispose();
      sparks.mat.dispose();
    };
  }, [partMats, sparks, bursts]);

  /** dispara uma rajada do núcleo (volley = salvas do ataque, mais compridas) */
  const spawnBurst = (dir: [number, number, number], volley: boolean): void => {
    let idx = -1;
    let minLife = Infinity;
    for (let i = 0; i < BURST_CAP; i++) {
      const d = burstData[i];
      if (d.life <= 0) {
        idx = i;
        break;
      }
      if (d.life < minLife) {
        minLife = d.life;
        idx = i;
      }
    }
    if (idx < 0) return;
    const d = burstData[idx];
    d.dir = dir;
    d.max = volley ? 0.16 + Math.random() * 0.08 : 0.12 + Math.random() * 0.09;
    d.life = d.max;
    d.rad = 0.8 + Math.random() * 0.6;
    d.volley = volley;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor (dano, HP, morte, ataque)
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let strikeKey = -1;
    let frontZ = -1; // para onde a criatura aponta (jogador ataca para -Z)
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        frontZ = u.side === 'player' ? -1 : 1;
        strikeKey = Math.round(u.lastAttackAt * 10);
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      strikeKey = Math.round(demoT.current * 100);
      if (demoT.current > LIGHTNING_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const releasing =
      sinceAttack >= LIGHTNING_WINDUP * LIGHTNING_ATTACK_WINDOW &&
      sinceAttack <= LIGHTNING_ATTACK_WINDOW;

    // salva de rajadas no instante do disparo (uma por ataque do motor)
    if (releasing && strikeKey >= 0 && !strikesDone.current.has(strikeKey)) {
      strikesDone.current.add(strikeKey);
      if (strikesDone.current.size > 8) strikesDone.current.clear();
      for (let k = 0; k < 3; k++) {
        tmpDir
          .set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.6 + 0.15, frontZ * (0.8 + Math.random() * 0.4))
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], true);
      }
    }

    // exalação contínua do núcleo: rajadas curtas para todos os lados,
    // dobrando de cadência quando ele carrega a descarga
    if (alpha > 0.25) {
      burstAcc.current += dt * (2.4 + pose.charge * 4.2) * (0.7 + 0.3 * hpFrac);
      let guard = 0;
      while (burstAcc.current >= 1 && guard < 3) {
        burstAcc.current -= 1;
        guard++;
        tmpDir
          .set(Math.random() * 2 - 1, Math.random() * 1.4 - 0.4, Math.random() * 2 - 1)
          .normalize();
        spawnBurst([tmpDir.x, tmpDir.y, tmpDir.z], false);
      }
      if (burstAcc.current > 3) burstAcc.current = 3;
    }

    // rajadas: crescem do peito para fora, piscam nervosas e apagam
    for (let i = 0; i < BURST_CAP; i++) {
      const mesh = burstRefs.current[i];
      const mat = bursts.mats[i];
      const d = burstData[i];
      if (!mesh) continue;
      if (d.life > 0) {
        d.life -= dt;
        const k = Math.max(0, 1 - d.life / d.max); // 0→1 da vida
        // rajada CURTA (a exalação do núcleo, não uma lança): sai do peito e
        // para de crescer rápido; a largura também é contida para não virar bola
        const grow = Math.min(1, k / 0.3);
        const len = (d.volley ? 0.26 : 0.15) * (0.5 + 0.5 * grow) * d.max * 5;
        const r0 = 0.34 + grow * (d.volley ? 0.26 : 0.18);
        tmpDir.set(d.dir[0], d.dir[1], d.dir[2]);
        mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
        // centro do cilindro no meio do traço que sai do corpo
        const mid = r0 + len * 0.5;
        mesh.position.set(tmpDir.x * mid, CORE_Y + tmpDir.y * mid, tmpDir.z * mid);
        const flick = 0.65 + 0.35 * Math.sin((t + i * 1.7) * 61);
        const rad = d.rad * (0.5 + 0.3 * flick);
        mesh.scale.set(rad, len * 2, rad); // geo tem altura 0.5
        mat.opacity = Math.max(0, Math.min(1, flick * (1 - k * k) * alpha)) * 0.8;
        mat.color.set(d.volley ? '#fff3b0' : '#ffe98a');
      } else if ((mat as THREE.MeshBasicMaterial).opacity !== 0) {
        mat.opacity = 0;
      }
    }

    // uniforms dos shaders (carga acende nervuras/aletas; morte esvazia)
    for (const m of partMats.list) {
      if (m instanceof THREE.ShaderMaterial) {
        m.uniforms.uTime.value = t;
        if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt;
        if (m.uniforms.uCharge) m.uniforms.uCharge.value = pose.charge + pose.flash * 0.6;
        if (m.uniforms.uAlpha) m.uniforms.uAlpha.value = alpha;
      }
    }
    sparks.mat.uniforms.uTime.value = t;
    sparks.mat.uniforms.uAlpha.value = alpha;
    sparks.mat.uniforms.uCharge.value = pose.charge + pose.flash;

    // ---- corpo: flutuação, respiração elétrica, estufa na carga ----
    const g = rootRef.current;
    const pulse =
      Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.4 + 1.9 + seed * 0.5) * 0.4;
    const breathe = 1 + pulse * 0.018 + pose.swell * 0.06;
    const hpDip = 0.86 + 0.14 * hpFrac;
    g.scale.set(breathe, breathe * hpDip + pose.flash * 0.04, breathe);
    g.rotation.y = Math.sin(t * 0.5 + seed * 0.7) * 0.25;
    g.rotation.z = Math.sin(t * 0.8 + seed) * 0.02;
    g.rotation.x = pose.swell * -0.03;
    g.position.z = pose.stepZ;

    // ---- peças: anéis/acento tremendo de energia + grupos orbitais ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      if (part.flick) {
        const f = 1 + part.flick * (0.55 + 0.45 * Math.sin(t * (9 + (i % 5) * 2) + i * 2.3 + seed));
        mesh.scale.setScalar(f);
      }
    }
    const orbital = modelDef.groups ?? {};
    for (const k of Object.keys(orbital)) {
      const gid = Number(k);
      const grp = groupRefs.current[gid];
      if (grp) grp.rotation.y += orbital[gid] * dt * (1 + pose.charge * 1.6 + pose.flash * 2.2);
    }

    // ---- clarão dourado do núcleo + clarão branco do disparo ----
    // (o halo fica SÓ ao redor da silhueta: escala pequena o bastante para não
    // engolir o corpo — clarão grande demais é o que vira "bola de fogo")
    const glow = glowRef.current;
    glow.position.y = CORE_Y;
    glow.scale.setScalar(Math.max(0.9, 1.15 + pulse * 0.1 + pose.charge * 0.5 + hurt * 0.2));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.1 + 0.05 * pulse + pose.charge * 0.14) * alpha,
    );
    const flash = flashRef.current;
    flash.position.set(0, CORE_Y, -frontZ * 0.85); // a frente do corpo aponta para -Z local (jogador)
    const flashS = pose.flash > 0 ? 0.7 + 1.1 * (1 - pose.flash) : 0.0;
    flash.scale.setScalar(flashS);
    (flash.material as THREE.SpriteMaterial).opacity = pose.flash * 0.55 * alpha;
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
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            frustumCulled={false}
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
      {Array.from({ length: BURST_CAP }, (_, i) => (
        <mesh
          key={`burst${i}`}
          ref={(m) => {
            burstRefs.current[i] = m;
          }}
          geometry={bursts.geo}
          material={bursts.mats[i]}
          frustumCulled={false}
        />
      ))}
      <points geometry={sparks.geo} material={sparks.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, CORE_Y, 0]} scale={1.8}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffcf4d"
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} position={[0, CORE_Y, -0.85]} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#fff6c8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Faíscas orbitando o corpo: pontos dourados que orbitam o núcleo e ESTALAM
 * (ligado/desligado nervoso, não fade suave) — a coroa de mini-descargas do
 * espírito da trovoada; acendem mais quando ele carrega o disparo.
 */
const SPARK_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: raio/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uY0;
uniform float uY1;
uniform float uR1;
uniform float uR2;
uniform float uSpin;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float ang = aRand.x * 6.28318 + uTime * uSpin * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.2);
  float r = mix(uR1, uR2, aRand.z) * (0.8 + 0.35 * sin(uTime * 2.0 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 3.1 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // faísca ESTALA: quadrado de alta frequência com aleatoriedade por partícula
  float flick = step(0.62, fract(sin(floor(uTime * (16.0 + 14.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (3.4 + 2.6 * aRand.z) * (0.7 + 0.5 * flick) * uSizeMul * (1.0 + uCharge * 0.6);
  gl_PointSize = size * (28.0 / max(0.5, -mv.z));
  vA = flick * uAlpha * (0.55 + 0.2 * uCharge);
  vC = mix(vec3(1.0, 0.82, 0.30), vec3(1.0, 1.0, 0.92), flick * 0.7) * 0.85;
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.06, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA);
}
`;
