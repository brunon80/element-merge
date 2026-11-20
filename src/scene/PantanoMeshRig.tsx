import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PANTANO_URL } from './modelUrls';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { footprintOf } from '../data/footprints';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import type { MonsterLevel } from '../game/types';
import { circleTexture, weldDispNormals } from './assets';
import { NOISE_GLSL } from './flameShaders';
import { makeStarburstGeo, makeSparkGeo, SPARK_FRAG } from './LightningRig';
import { readModel } from './modelPreload';
import { SummonReveal, SummonSigil } from './SummonFX';
import {
  attackPose,
  PANTANO_ATTACK_WINDOW,
  PANTANO_WINDUP,
  PANTANO_POISON,
  GAS_LOOK,
  type PantanoRigProps,
} from './PantanoRig';

/**
 * PÂNTANO DE MALHA 3D IMPORTADA — A HIDRA DO LODO (Nv.7): a forma da espécie
 * vira um mesh texturizado criado fora do jogo (`src/models/pantano/pantano.glb`
 * — malha ÚNICA com textura 2048²; SEM ossos e SEM animação): o montículo de
 * lodo com o CALDEIRÃO AFUGADO aceso na barriga, o musgo e as raízes encharcadas
 * e o vitríolo escorrendo pelas juntas. Enquanto a malha desce (demanda), o SELO
 * DE INVOCÇÃO (`SummonFX`) segura o buraco — o figurino do brejo (`PantanoRig`)
 * nunca mais pipoca no campo (ficou só doador de efeitos e coreografia) — e
 * TODOS os efeitos do pântano continuam vivos por cima da malha, no mesmo idioma
 * dos demais figurinos da linha "modelos 3D":
 *
 *  1. VITRÍOLO VIVO na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no
 *     emissivo — onde a tinta é VERDE/clara (o vitríolo que escorre pelas juntas
 *     e o veio da crosta pegando luz) o veneno da IDENTIDADE (#a8cf4a do motor)
 *     ACENDE pelas trincas, num sorteio duro de celula; o lodo ONDULA de leve na
 *     afinação (treme curto na normal SOLDADA `aDispNrm`, lição das soldas). O
 *     VEIO É A "CARNE QUE VOLTA": quanto mais ferido, mais largo e aceso o
 *     vitríolo (nunca migra pro albedo — a crosta do brejo não branqueia);
 *  2. O CALDEIRÃO DA BARRIGA (o único ponto aceso do brejo — a lição do card
 *     miúdo): clarão aditivo miúdo plantado na FRENTE do caldeirão do GLB +
 *     auréola de estilhaços de bile (dois `starburst` em leque) — NUNCA o globo
 *     de bile sólido do rig antigo (a malha já traz a fornalha esculpida; religar
 *     uma bola na frente seria a bola do Magmar cortada na aprovação);
 *  3. GÁS DO BREJO (o bafo venenoso — o motivo de vida da espécie): os vapores
 *     do rig antigo RASTEJAM (gás de pântano pesado NÃO sobe em redemoinho como
 *     vapor de caldeira — o `swirl` é BAIXO), agora escalados ao encaixe da
 *     malha; a cadência ACELERA e a pluma clareia quando a hidra cospe o globo;
 *  4. BOLHAS DE VITRÍOLO orbitando a barriga (a fervura do caldeirão): um enxame
 *     de bolhas verdes numa faixa do corpo (da base à cabeça, NUNCA acima da
 *     malha — lição da trovoada), metade sobe e estoura, metade gira para o lado
 *     oposto (caos).
 *
 * SEM fumaça do pool no corpo: o brejo solta GÁS e BILE, não fuligem de grafite
 * (a regra do PantanoRig antigo — o smokePool só entrava no SPRAY do cuspe, e o
 * cuspe é a bile verde que a malha já acende). A coreografia é a MESMA timeline
 * do motor (janela 0,72 s: a hidra ENCOVA o pescoço no brejo — montículo
 * affunda, maxilar trava segurando o globo, o caldeirão ferve; no bote o
 * maxilar ESCANCA, o pescoço CHICOTEIA e o corpo ARQUEIA para frente) lida de
 * `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o mesmo show. Sem
 * ossos: o rig antigo animava o GRUPO raiz (encovar, chicotear, arquear) e a
 * malha herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x ±0,351, spanY 0,846), como os
 * demais Nv.7, e o encaixe vem da LARGURA (o teto de altura 4,6/0,846=5,44 não
 * aperta). `MEDIDO.pantano` no degrau 2,5 quadrado (a régua nova dos Nv.7-cubo,
 * igual à dos irmãos — em 1,9 o cubo ficava BAIXO ao lado dos Nv.6) põe a malha
 * do mesmo porte dos Nv.6; a cara encara o INIMIGO no +Z local (rumo 0 — o
 * maxilar cuspidor e o caldeirão da frente saíram no painel "frente (+Z)" do
 * viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`). O `slotFit` da família (teto
 * 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const PANTANO_DEF = getSpecies('pantano');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(PANTANO_DEF, PANTANO_DEF.levelMin);

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou o maxilar cuspidor e o
 * caldeirão da frente no +Z — como as demais malhas da linha. Se um GLB
 * substituto vier virado, vire aqui.
 */
export const PANTANO_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola de
 * bile ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa CPU
 * e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do brejo em PORCENTAGEM da altura da malha: o CALDEIRÃO AFOGADO da
 * barriga (a fornalha do veneno) mora perto do MEIO geométrico, encostado no
 * chão do montículo. É a régua de CORE_Y: clarão, auréola e a fervura das bolhas
 * nascem dessa altura.
 */
const CORE_FRAC = 0.5;

/** brasa base do emissivo (o vitríolo úmido do brejo) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#2c3a18');
const EMISSIVE_FLASH = new THREE.Color('#cfe89a');

/**
 * VERTEX do GÁS DO BREJO escalado ao encaixe da malha (o bafo venenoso do
 * PantanoRig antigo: o vapor RASTEIA — gás de pântano é PESADO, não sobe em
 * redemoinho de caldeira; `uScale` amarra o raio/altura ao porte da malha (caixa
 * crua ~0,85); `uCharge` acelera e alarga a pluma quando a hidra cospe o globo.
 * Nasce do caldeirão da barriga, rasteja para fora e some na altura do ombro.
 * Frio-palha na base, escaldante-esverdeado carregando o cuspe no pico.
 */
const GAS_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.22 + 0.22 * aRand.z;
  float prog = fract(uTime * speed * 0.30 * (1.0 + uCharge * 1.1) + aRand.y);
  // RASTEJA: sobe pouco e alarga muito (o oposto do vapor de caldeira em funil)
  float ang = aRand.x * 6.28318 + prog * (0.4 + 0.8 * aRand.z) + uTime * 0.08;
  float r = (0.55 + prog * (1.05 + 0.85 * aRand.z)) * uScale;
  float y = (0.34 + prog * (0.78 + 0.30 * aRand.z)) * uScale;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // puff LARGO e MOLE (gás pesado espalhado no chão do brejo)
  float size = (8.0 + 11.0 * aRand.z) * (0.9 + uCharge * 0.6) * uSizeMul * (0.55 + prog * 1.15);
  gl_PointSize = min(150.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce do caldeirão e some na altura do ombro
  vA = smoothstep(0.0, 0.14, prog) * (1.0 - smoothstep(0.5, 1.0, prog)) * uAlpha * 0.5;
  // frio-palha na base -> escaldante-esverdeado carregando o cuspe
  vC = mix(vec3(0.42, 0.5, 0.32), vec3(0.70, 0.82, 0.52), prog + uCharge * 0.2);
  gl_Position = projectionMatrix * mv;
}
`;

const GAS_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pluma MOLE e espalhada (gás pesado, sem borda dura)
  float m = smoothstep(0.5, 0.0, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.55);
}
`;

/**
 * VERTEX das BOLHAS DE VITRÍOLO orbitando a barriga (a fervura do caldeirão):
 * cada bolha verde orbita/sobe numa faixa própria do corpo (da base à cabeça,
 * NUNCA acima da malha — lição da trovoada), com raio/altura tremendo em
 * senóides desencontradas e um estouro duro (a bolha que alcança o topo da
 * pluma e PIPOCA). Metade gira para o lado oposto (caos). Vitríolo do motor; a
 * que lampeja vira amarelo-bile-quase-branco.
 */
const BUBBLE_ORBIT_VERT = /* glsl */ `
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
  float dir = 0.5 - step(0.5, fract(aRand.z * 3.77));
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.6 + 0.5 * aRand.z) * (1.0 + uCharge * 1.5);
  float r = mix(uR1, uR2, aRand.z) * (0.8 + 0.3 * sin(uTime * 1.3 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.18 * sin(uTime * 1.9 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // estouro duro: a bolha PIPOCA num instante sorteado (o brilho some de golpe)
  float pop = step(0.62, fract(uTime * (2.2 + 2.4 * aRand.z) + aRand.y * 43.0));
  float glint = 1.0 - pop * 0.7;
  float size = (2.4 + 3.4 * aRand.z) * (0.7 + 0.5 * pop) * uSizeMul * (1.0 + uCharge * 0.6);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.5 + 0.5 * glint) * uAlpha * (0.55 + 0.35 * uCharge);
  vec3 tint = vec3(0.66, 0.81, 0.29); // o vitríolo do motor (#a8cf4a)
  vC = mix(tint, vec3(0.89, 0.95, 0.71), pop * 0.55); // ao estourar vira bile clara
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher do Pântano: Nv.7 = a malha importada da hidra do lodo; enquanto ela
 * desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO segura o
 * buraco — o figurino do brejo antigo nunca mais aparece no campo (a lição da
 * troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `PantanoRig` antigo ficou só doador de efeitos e coreografia).
 */
export function PantanoRig(props: PantanoRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="pantano" url={PANTANO_URL} seed={props.seed} />}>
      <SummonReveal species="pantano" seed={props.seed}>
        <PantanoMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function PantanoMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: PantanoRigProps) {
  const { scene } = readModel(PANTANO_URL);

  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${PANTANO_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ a ondulação do lodo não rasgar nas arestas duras do GLB
    // (qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do brejo: o CALDEIRÃO AFOGADO da barriga (a fornalha do veneno)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 5,44 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('pantano', PANTANO_DEF.levelMin as MonsterLevel);
    const yaw = PANTANO_MODEL_YAW;
    const hx = Math.max(-bb.min.x, bb.max.x);
    const hz = Math.max(-bb.min.z, bb.max.z);
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const halfWide = hx * ca + hz * sa;
    const halfAlong = hx * sa + hz * ca;
    const sW = Math.min(foot.x / (halfWide + SHELL_HUG), foot.z / (halfAlong + SHELL_HUG));
    const s = Math.min(TOP / src.spanY, sW);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(yaw) + cz * Math.sin(yaw));
    const pz = cx * Math.sin(yaw) - cz * Math.cos(yaw);
    return {
      s,
      pos: [px, -bb.min.y * s, pz] as [number, number, number],
    };
  }, [src]);

  const s = fit.s;
  const coreY = src.coreY * s;

  // material por instância: textura do GLB + VITRÍOLO VIVO — a leitura da pintura
  // no emissivo (o veneno escorrendo pelas juntas acende o verde da IDENTIDADE
  // pelas trincas) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // lodo ÚMIDO mas não espelho: rugoso, quase sem metal (a crosta seca do
      // brejo segura a luz fosca; o brilho vem só do vitríolo acendendo)
      roughness: 0.86,
      metalness: 0.06,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.18,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPT = { value: 0 };
      sh.uniforms.uPSeed = { value: seed };
      sh.uniforms.uPCharge = { value: 0 };
      sh.uniforms.uPHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uPT;\nuniform float uPSeed;\nuniform float uPCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // o LODO ondula de leve (a respiração lenta do brejo): treme CURTO e
          // sorteado por celula dura, na normal SOLDADA (aDispNrm — senão as
          // arestas duras abririam as "rachaduras" do qa/probe-cracks.mjs). A
          // régua é MILIMÉTRICA (o ruído vale 0..1 e a amplitude mora em METROS).
          float cell = fnoise(floor(vJit * 12.0) + uPSeed);
          float wave = sin(uPT * 6.0 + cell * 40.0) * (0.0009 + uPCharge * 0.0032);
          transformed += aDispNrm * (cell * 0.0045 + wave);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uPT;\nuniform float uPCharge;\nuniform float uPHurt;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // O VITRÍOLO VIRA VIDA: onde a pintura é VERDE/clara (o veneno que
          // escorre pelas juntas e o veio da crosta pegando luz) o veneno da
          // IDENTIDADE (#a8cf4a do motor) ACENDE pelas trincas num sorteio duro de
          // celula — o CALDEIRÃO da barriga é o único ponto aceso do brejo e é ele
          // que lê no card miúdo.
          vec4 pain = texture2D(map, vMapUv);
          float green = clamp(pain.g - pain.r - pain.b * 0.5 + 0.05, 0.0, 1.0);
          float lum = clamp(pain.r + pain.g + pain.b - 1.35, 0.0, 1.0);
          float ck = step(0.5, fract(sin(floor(uPT * 5.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // veios de vitríolo (nunca branco puro — a crosta do brejo não branqueia)
          totalEmissiveRadiance += vec3(0.66, 0.81, 0.29) * (green + 0.35 * lum) * (0.28 + 0.45 * ck + uPCharge * 0.9);
          // o VEIO É A "CARNE QUE VOLTA": ACENDE mais largo/forte quando a hidra
          // apanha (o vitríolo é a feedback da fortaleza de lodo — nunca pro albedo)
          totalEmissiveRadiance *= 1.0 + uPCharge * 0.9 + uPHurt * 1.0;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // bolhas de vitríolo orbitando a barriga (a fervura do caldeirão): faixas do
  // corpo (da base ao topo da cabeça), nunca acima da malha
  const orbit = useMemo(
    () => ({
      geo: makeSparkGeo(20),
      mat: new THREE.ShaderMaterial({
        vertexShader: BUBBLE_ORBIT_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.18 * s },
          uY1: { value: src.spanY * s - 0.16 * s },
          uR1: { value: s * 0.52 },
          uR2: { value: s * 0.78 },
          uSpin: { value: 1.1 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // gás do brejo rastejando (o bafo venenoso — escalado ao porte da malha) — o
  // motivo de vida da espécie (gás pesado espalhado, nunca funil de caldeira)
  const gas = useMemo(
    () => ({
      geo: makeSparkGeo(embers ?? 22),
      mat: new THREE.ShaderMaterial({
        vertexShader: GAS_VERT,
        fragmentShader: GAS_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uCharge: { value: 0 },
          uScale: { value: s },
        },
      }),
    }),
    [embers, emberScale, s],
  );

  // auréola de estilhaços (vitríolo do motor + amarelo-bile — o projétil-
  // assinatura do brejo é o globo de bile verde cuspidado)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, PANTANO_POISON),
      makeStarburstGeo(seed + 7.4, 14, GAS_LOOK.hot),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      gas.geo.dispose();
      gas.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, gas, starburstGeos]);

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const flashRef = useRef<THREE.Sprite>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const burstAuraRef = useRef<THREE.Group>(null!);
  const starburstRefs = useRef<(THREE.Mesh | null)[]>([]);
  const clock = useRef(0);
  const demoT = useRef(-1);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  useFrame((_, dtRaw) => {
    const g = animRef.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let frontZ = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        frontZ = u.side === 'player' ? -1 : 1;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > PANTANO_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= PANTANO_WINDUP * PANTANO_ATTACK_WINDOW && sinceAttack <= PANTANO_ATTACK_WINDOW;
    // o cuspe é rápido: o clarão do globo nasce no disparo e some em ~0,28 s
    const flash = striking ? Math.max(0, 1 - (sinceAttack - PANTANO_WINDUP * PANTANO_ATTACK_WINDOW) / 0.28) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (lodo ondulando + vitríolo das juntas acendendo e ACENDENDO
    // MAIS quando apanha — a "carne que volta" do brejo, migra da brasa, nunca albedo)
    const sh = body.userData.shader as
      | { uniforms: { uPT: { value: number }; uPCharge: { value: number }; uPHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uPT.value = t;
      sh.uniforms.uPCharge.value = pose.charge;
      sh.uniforms.uPHurt.value = hurt;
    }
    // o caldeirão ferve devagar (lodo grosso) e o vitríolo ARDE na goela cheia
    const boil =
      Math.sin(t * 0.7 + seed) * 0.5 +
      Math.sin(t * 1.6 + seed * 0.7) * 0.3 +
      Math.sin(t * 3.1 + 1.1) * 0.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.18 + boil * 0.03 + pose.charge * 0.55 + flash * 0.5 + hurt * 0.5 + crumble * 0.3) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.35 + flash * 0.3 + pose.charge * 0.3));

    // gás: rasteja e acelera ao cuspir o globo; na morte o brejo DESSANGRA em gás
    gas.mat.uniforms.uTime.value = t;
    gas.mat.uniforms.uAlpha.value = alpha;
    gas.mat.uniforms.uCharge.value = Math.min(1, pose.charge + pose.flare * 0.5 + crumble * 0.7);

    // bolhas orbitando a barriga (a fervura DOBRA na carga do cuspe)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: o LODO ELÁSTICO (ENCOVA no brejo ao carregar, CHICOTEIA e
    // ARQUEIA para frente no cuspe, affunda na morte) ----
    const sway = Math.sin(t * 0.32 + seed) * 0.014 + Math.sin(t * 0.74 + 1.7) * 0.006;
    const breathe = Math.sin(t * 0.9 + seed) * 0.014;
    g.scale.set(
      1 + pose.bulge * 0.06 + breathe * 0.3,
      1 - pose.crouch * 0.08 - pose.bulge * 0.03 + breathe,
      1 + pose.bulge * 0.05 + breathe * 0.3,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.28 + seed * 0.6) * 0.008;
    g.rotation.x = pose.crouch * 0.03 + pose.flare * 0.01;
    g.position.y = -pose.crouch * 0.04 + Math.sin(t * 0.6 + seed) * 0.008;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão do CALDEIRÃO aceso na barriga (o miolo de luz do rig antigo —
    // plantado na FRENTE do caldeirão do GLB, MIÚDO e SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.25 + boil * 0.06 + pose.charge * 0.4 + hurt * 0.2));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 1.7 + seed) + pose.charge * 0.07) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY + 0.1 * s, frontZ * -(0.5 + 0.12 * s));
    const flashS = flash > 0 ? 0.7 + 1.0 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.22 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para o
    // envelope total nunca passar do anel (a auréola é a ÚNICA malha além da
    // silhueta que a sonda de footprint lê — por isso o fator é apertado)
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.26;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.38 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.12));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const greenShard = starburstRefs.current[0];
    const bileShard = starburstRefs.current[1];
    if (greenShard) {
      (greenShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.07) * auraPulse * alpha;
    }
    if (bileShard) {
      (bileShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente ao caldeirão
    coreGlow.scale.setScalar(0.24 + pose.charge * 0.16 + flash * 0.14); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.06 + pose.charge * 0.14 + flash * 0.12) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={PANTANO_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* gás do brejo rastejando (o bafo venenoso — o oposto do vapor de caldeira) */}
      <points geometry={gas.geo} material={gas.mat} frustumCulled={false} />
      {/* bolhas de vitríolo orbitando a barriga (a fervura do caldeirão) */}
      <points geometry={orbit.geo} material={orbit.mat} frustumCulled={false} />
      <group ref={burstAuraRef} position={[0, coreY, 0]}>
        {starburstGeos.map((geometry, i) => (
          <mesh
            key={`starburst${i}`}
            ref={(mesh) => {
              starburstRefs.current[i] = mesh;
            }}
            geometry={geometry}
            renderOrder={2}
            frustumCulled={false}
          >
            <meshBasicMaterial
              vertexColors
              transparent
              opacity={i === 0 ? 0.18 : 0.14}
              blending={THREE.AdditiveBlending}
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      {/* SEM anéis de chão: a poça de lodo é o envelope que a malha já dá (a
          lição do Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.24} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={PANTANO_POISON}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.25}>
        <spriteMaterial
          map={circleTexture()}
          color={GAS_LOOK.hot}
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color={GAS_LOOK.hot}
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
