import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { circleTexture } from './assets';
import { getLoadProgress } from './modelPreload';
import { VISUALS } from './speciesModels';
import { makeSparkGeo, makeStarburstGeo } from './LightningRig';

/**
 * SELO DE INVOCÇÃO — a coreografia procedural que cobre a espera da malha.
 *
 * A regra nova da linha "modelos 3D": enquanto o GLB desce (`modelPreload`),
 * o buraco NO CAMPO é segurado por este sigilo — NUNCA pelo figurino antigo
 * da espécie (a lição da troca: o monstro velho pipocando por um instante
 * antes da malha desvaloriza o print e ainda sai trocando de corpo na cara
 * do jogador). O selo é inteiro procedural e nasce no mesmo frame do spawn:
 *
 *  - anel de RUNA no chão: disco de luz macio + arco de PROGRESSO (o shader
 *    come o ângulo pela fração REAL do download, lida no `getLoadProgress`)
 *    com a cabeça brilhante correndo na frente do arco;
 *  - oito MARCOS girando devagar (aceleram com o progresso — a invocação
 *    "carrega");
 *  - EMBRIÃO: orbe aditivo pulsando na altura do peito da forma que vem,
 *    plantado onde o monstro vai nascer;
 *  - FAÍSCAS DE CARGA: partículas subindo em espiral para dentro do embrião
 *    (o mesmo disco macio da faísca da trovoada, tintado na cor da espécie).
 *
 * Quando a malha chega, o `Suspense` remonta o figurino dentro do
 * `SummonReveal`: a malha POPA do selo (ease-out-back) com um ESTALIDO de
 * raios em estrela virado para a câmera — a troca vira nascer, não engasgo.
 * Com o cache já quente (pré-baixa da loja/prévia/bestiário, ou segunda vez
 * na mesma sessão) nada disso é espera: o selo não chega a aparecer e o
 * figurino nasce direto pelo pop do reveal — a invocação instantânea.
 */

function useSummonMetrics(species: SpeciesId, level?: number) {
  return useMemo(() => {
    const def = getSpecies(species);
    const lv = (level ?? def.levelMin) as MonsterLevel;
    const foot = footprintOf(species, lv);
    const footR = Math.max(foot.x, foot.z);
    const topY = formTop(def, lv);
    const vis = VISUALS[species];
    return { footR, topY, glow: vis.glow, accent: vis.accent };
  }, [species, level]);
}

/** arco de progresso: anel plano cujo shader só pinta o ângulo já baixado */
const PIE_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const PIE_FRAG = /* glsl */ `
uniform float uProg;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  float ang = fract(atan(vP.y, vP.x) * 0.15915494 + 0.25); // 0 no topo, anti-horário
  if (ang > max(0.0015, uProg)) discard;
  float head = smoothstep(0.05, 0.0, uProg - ang); // a cabeça do arco brilha mais
  float pulse = 0.86 + 0.14 * sin(uTime * 4.0);
  vec3 c = uColor * (0.6 + 1.5 * head);
  gl_FragColor = vec4(c, (0.5 + 0.5 * head) * pulse);
}
`;

/** faíscas de carga: sobem em espiral para dentro do embrião */
const CHARGE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: velocidade/raio
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor;
uniform float uTop;
uniform float uR;
uniform float uSizeMul;
varying float vA;
varying vec3 vC;
void main() {
  float t = fract(uTime * (0.16 + 0.3 * aRand.z) + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * (1.4 + 2.4 * aRand.z);
  float r = mix(uR, uR * 0.12, t * t) * (0.9 + 0.18 * sin(uTime * 2.0 + aRand.y * 11.0));
  vec3 p = vec3(cos(ang) * r, 0.05 + t * uTop, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float fade = sin(t * 3.14159);
  vA = fade * fade * uAlpha;
  vC = mix(uColor, vec3(1.0, 0.96, 0.86), 0.25 + 0.5 * fade * fade);
  gl_PointSize = min(64.0, (2.8 + 2.2 * aRand.z) * (0.6 + 0.8 * fade) * uSizeMul * (30.0 / max(0.5, -mv.z)));
  gl_Position = projectionMatrix * mv;
}
`;
const CHARGE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.06, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA);
}
`;

export function SummonSigil({
  species,
  level,
  url,
  seed = 0,
}: {
  species: SpeciesId;
  level?: number;
  /** o GLB que está descendo — o arco acompanha o download dele */
  url: string;
  seed?: number;
}) {
  const { footR, topY, glow, accent } = useSummonMetrics(species, level);
  const marksRef = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const diskRef = useRef<THREE.Mesh>(null!);

  const geos = useMemo(
    () => ({
      disk: new THREE.PlaneGeometry(footR * 2.6, footR * 2.6),
      pie: new THREE.RingGeometry(footR * 0.66, footR * 0.8, 64),
      mark: new THREE.BoxGeometry(0.035, 0.012, 0.16),
      core: new THREE.SphereGeometry(Math.min(0.17, footR * 0.18), 12, 10),
      sparks: makeSparkGeo(26),
    }),
    [footR],
  );

  const mats = useMemo(() => {
    const pie = new THREE.ShaderMaterial({
      vertexShader: PIE_VERT,
      fragmentShader: PIE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uProg: { value: 0.06 },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(glow) },
      },
    });
    const sparks = new THREE.ShaderMaterial({
      vertexShader: CHARGE_VERT,
      fragmentShader: CHARGE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uColor: { value: new THREE.Color(accent) },
        uTop: { value: Math.min(topY * 0.8, 2.4) },
        uR: { value: footR * 0.85 },
        uSizeMul: { value: Math.max(0.7, footR / 0.9) },
      },
    });
    return {
      pie,
      sparks,
      marks: new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      core: new THREE.MeshBasicMaterial({
        color: glow,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      disk: new THREE.MeshBasicMaterial({
        map: circleTexture(),
        color: glow,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
  }, [glow, accent, footR, topY]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose()); // a TEXTURA do disk é do cache (circleTexture): não dispor
      Object.values(geos).forEach((g) => g.dispose());
    },
    [mats, geos],
  );

  useFrame((state, dt) => {
    const p = getLoadProgress(url);
    const prog = p.state === 'ready' ? 1 : p.fraction;
    const t = state.clock.elapsedTime + seed;
    const u = mats.pie.uniforms.uProg;
    u.value += (prog - u.value) * Math.min(1, dt * 5); // o arco anda suave entre os chunks
    mats.pie.uniforms.uTime.value = t;
    mats.sparks.uniforms.uTime.value = t;
    // rede caída: o selo respira fraco, avisando que a invocação está presa
    mats.sparks.uniforms.uAlpha.value =
      p.state === 'retrying' ? 0.35 + 0.25 * Math.abs(Math.sin(t * 2.2)) : 0.55 + 0.45 * u.value;
    marksRef.current.rotation.y = t * (0.7 + 2.8 * u.value);
    const pulse = 1 + 0.14 * Math.sin(t * 3.4 + seed);
    coreRef.current.scale.setScalar(pulse);
    coreRef.current.position.y = topY * 0.42 + 0.05 * Math.sin(t * 2.1);
    mats.core.opacity = 0.4 + 0.25 * Math.sin(t * 4.1) + 0.3 * u.value;
    mats.disk.opacity = 0.16 + 0.26 * u.value;
  });

  return (
    // `name="sigil"`: fora da silhueta medida (contrato das sondas de
    // invólucro — o selo não entra na régua do figurino, igual ao HUD e ao
    // anel de seleção). Some junto quando a malha chega.
    <group name="sigil">
      <mesh ref={diskRef} geometry={geos.disk} material={mats.disk} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} />
      <mesh geometry={geos.pie} material={mats.pie} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} />
      <group ref={marksRef} position={[0, 0.05, 0]}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const r = footR * 0.92;
          return (
            <mesh
              key={i}
              geometry={geos.mark}
              material={mats.marks}
              position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
              rotation={[0, -a, 0]}
            />
          );
        })}
      </group>
      <mesh ref={coreRef} geometry={geos.core} material={mats.core} position={[0, topY * 0.42, 0]} />
      <points geometry={geos.sparks} material={mats.sparks} />
    </group>
  );
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/**
 * Envolucro do figurino em malha: no MOUNT (a malha recém-chegada, ou o
 * cache quente no spawn) o corpo popa do selo com ease-out-back e um
 * ESTALIDO de raios em estrela — a troca vira nascer. Com cache quente o
 * selo nem chegou a montar, mas o pop+estalo dá o "nascimento" instantâneo
 * igualzinho para todo spawn (a mesma coreografia com ou sem download).
 */
export function SummonReveal({
  species,
  level,
  seed = 0,
  children,
}: {
  species: SpeciesId;
  level?: number;
  seed?: number;
  children: ReactNode;
}) {
  const { footR, topY, glow } = useSummonMetrics(species, level);
  const bodyRef = useRef<THREE.Group>(null!);
  const flashRef = useRef<THREE.Mesh>(null!);
  const bornRef = useRef(-1);
  const qBuf = useMemo(() => new THREE.Quaternion(), []);

  const flashGeo = useMemo(() => makeStarburstGeo(seed * 0.37 + 1.7, 18, glow), [seed, glow]);
  const flashMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      flashGeo.dispose();
      flashMat.dispose();
    },
    [flashGeo, flashMat],
  );

  useFrame((state) => {
    if (bornRef.current < 0) bornRef.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - bornRef.current;
    const body = bodyRef.current;
    if (body) {
      const p = Math.min(1, age / 0.26);
      body.scale.setScalar(p >= 1 ? 1 : 0.1 + 0.9 * easeOutBack(p));
    }
    const flash = flashRef.current;
    if (flash) {
      const q = age / 0.42;
      if (q >= 1) {
        flash.visible = false;
      } else {
        flash.visible = true;
        flash.scale.setScalar((0.4 + 1.1 * q) * Math.max(0.6, footR));
        flashMat.opacity = (1 - q) * (1 - q);
        flash.position.y = topY * 0.45;
        // billboard: o grupo do modelo encara o inimigo (π no player), então
        // desfaço a rotação herdada antes de copiar a quaternion da câmera
        body.getWorldQuaternion(qBuf).invert();
        flash.quaternion.copy(state.camera.quaternion).premultiply(qBuf);
      }
    }
  });

  return (
    <group ref={bodyRef}>
      {children}
      <mesh ref={flashRef} geometry={flashGeo} material={flashMat} visible={false} />
    </group>
  );
}
