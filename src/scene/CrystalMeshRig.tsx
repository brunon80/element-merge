import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CRYSTAL_URL } from './modelUrls';
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
import { makeMoteGeo } from './NevoaRig';
import {
  attackPose,
  CRISTAL_ATTACK_WINDOW,
  CRISTAL_WINDUP,
  CRISTAL_AMETHYST,
  type CrystalRigProps,
} from './CrystalRig';

/**
 * CRISTAL DE MALHA 3D IMPORTADA — O PRISMA VIVO (Nv.7): a forma da espécie vira
 * um mesh texturizado criado fora do jogo (`src/models/crystal/crystal.glb` —
 * ~39.800 vértices, UMA malha com UMA textura 2048²; SEM ossos e SEM animação):
 * o colosso facetado de colunas de ametista com a GEMA de luz acesa no peito, as
 * veias de ouro entre as chapas de cristal e as farpas de ricochete nos braços.
 * Enquanto a malha desce (demanda), o SELO DE INVOCÇÃO (`SummonFX`) segura o
 * buraco — o figurino de prisma (`CrystalRig`) nunca mais pipoca no campo (ficou
 * só doador de efeitos e coreografia) — e TODOS os efeitos do cristal continuam
 * vivos por cima da malha, no mesmo idioma dos demais figurinos da linha
 * "modelos 3D":
 *
 *  1. PRISMA VIVO na pintura do GLB: `onBeforeCompile` LÊ A TEXTURA no emissivo —
 *     onde a tinta é clara (as arestas/lascas do cristal pegando luz) a gema do
 *     peito ACENDE o veio da IDENTIDADE (#b7a6ff do motor) pelas fraturas, num
 *     sorteio duro de faceta; as pontas TREMEM de leve na afinação (treme curto na
 *     normal SOLDADA `aDispNrm`, lição das soldas, em régua milimétrica);
 *  2. A GEMA DO PEITO (o único ponto aceso do colosso — a lição do card miúdo):
 *     clarão aditivo miúdo plantado na FRENTE da gema do GLB + auréola de
 *     estilhaços de ametista (dois `starburst` em leque) — NUNCA o octaedro
 *     sólido do rig antigo (a malha já traz a pedra esculpida; religar uma gema
 *     na frente seria a bola de plasma do Magmar cortada na aprovação);
 *  3. PÓ DE PRISMA (a luz entrando pelas pontas): os motes do rig antigo sobem em
 *     funil e são engolidos pelo corpo — agora escalados ao encaixe da malha;
 *     a cadência APERTA e acelera quando o prisma carrega a cadeia;
 *  4. HALO DE ESTILHAÇOS orbitando o corpo (as farpas do ricochete): um enxame de
 *     faíscas duras de ametista numa faixa do corpo (da base à cabeça, NUNCA
 *     acima da malha — lição da trovoada), metade gira para o lado oposto.
 *
 * SEM fumaça: pedra quebrando solta PÓ (os motes), não fuligem (a regra do
 * CrystalRig antigo). A coreografia é a MESMA timeline do motor (janela 0,8 s: o
 * prisma ENXUGA a luz do slot — os motes sobem para dentro, agacha/contrai, os
 * veios ACENDEM da base ao topo; no tiro verga para frente e estala quase junto)
 * lida de `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o mesmo show.
 * Sem ossos: o rig antigo animava o GRUPO raiz (contrair/estufar, torcer, vergar)
 * e a malha herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x ±0,439, y −0,410..0,446,
 * z ±0,270 — spanY 0,856), diferente dos golens altos da linha; por isso o
 * encaixe vem da LARGURA (o teto de altura 4,4/0,856=5,14 não aperta — a malha
 * é baixa para a régua autoral). `MEDIDO.cristal` no degrau da linha (~1,9) põe
 * a malha do mesmo porte dos Nv.6; a cara encara o INIMIGO no +Z local (rumo 0 —
 * a GEMA do peito e os olhos ciano saíram no painel "frente (+Z)" do viewer de 4
 * vistas, `qa/mesh-viewer-shot.mjs`). O `slotFit` da família não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const CRISTAL_DEF = getSpecies('cristal');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(CRISTAL_DEF, CRISTAL_DEF.levelMin);

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou a GEMA do peito e os
 * olhos ciano no +Z — como as demais malhas da linha. Se um GLB substituto vier
 * virado, vire aqui.
 */
export const CRISTAL_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola de
 * estilhaços ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a
 * caixa CPU e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração do colosso em PORCENTAGEM da altura da malha: a GEMA de luz do peito
 * (a fornalha do prisma) mora um dedo ACIMA do meio geométrico. É a régua de
 * CORE_Y: clarão, auréola e o núcleo da sucção dos motes nascem dessa altura.
 */
const CORE_FRAC = 0.6;

/** brasa base do emissivo (a ametista do veio do prisma) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#5b3fa6');
const EMISSIVE_FLASH = new THREE.Color('#c9b8ff');

/**
 * VERTEX do PÓ DE PRISMA escalado ao encaixe da malha (o funil invertido do
 * CrystalRig antigo: largo no chão do slot, apertado na GEMA do peito — a luz
 * entrando pela pedra). `uScale` amarra o raio/altura ao porte da malha
 * (a caixa crua é ~0,86, o rig antigo era ~3 alto); `uCharge` aperta e acelera a
 * sucção quando o prisma carrega a cadeia. Esquenta do lilás-pálido no chão para
 * a ametista do motor no peito.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.55 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.16 * (1.0 + uCharge * 1.3) + aRand.y);
  // funil INVERTIDO: largo no chão do slot, apertado na gema do prisma
  float ang = aRand.x * 6.28318 + prog * (1.2 + 2.4 * aRand.z) + uTime * 0.18;
  float r = (1.35 - prog * (0.8 + 0.55 * aRand.z)) * uScale;
  float y = (0.12 + prog * (2.15 + 0.35 * aRand.z)) * uScale;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // farpa miúda e SECA (pó de pedra, não o fiapo macio do vapor)
  float size = (3.0 + 5.0 * aRand.z) * (0.85 + uCharge * 0.6) * uSizeMul * (1.0 - prog * 0.35);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce no chão do slot e morre engolido pelo corpo
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.62, 1.0, prog)) * uAlpha;
  // esquentando: lilás-pálido no chão -> ametista do motor no peito
  vC = mix(vec3(0.78, 0.68, 0.95), vec3(0.72, 0.65, 1.0), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pontinho duro com halo mínimo (caco de luz, não puff)
  float m = smoothstep(0.5, 0.22, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.55);
}
`;

/**
 * VERTEX do HALO DE ESTILHAÇOS orbitando o colosso (as farpas do ricochete do rig
 * antigo): cada faísca dura orbita numa faixa própria do corpo (da base à cabeça,
 * NUNCA acima da malha — lição da trovoada), com raio/altura tremendo em senóides
 * desencontradas e um lampejo duro (a facetada pegando luz). Metade gira para o
 * lado oposto (caos). Ametista do motor; a que lampeja vira lilás-quase-branco.
 */
const SHARD_ORBIT_VERT = /* glsl */ `
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
  float ang = aRand.x * 6.28318 + uTime * uSpin * dir * (0.7 + 0.6 * aRand.z) * (1.0 + uCharge * 1.4);
  float r = mix(uR1, uR2, aRand.z) * (0.85 + 0.25 * sin(uTime * 1.6 + aRand.y * 9.0));
  float y = mix(uY0, uY1, aRand.y) + 0.14 * sin(uTime * 2.1 + aRand.x * 6.0);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float glint = step(0.5, fract(sin(floor(uTime * (10.0 + 12.0 * aRand.z) + aRand.y * 43.0)) * 43758.5453));
  float size = (2.2 + 2.8 * aRand.z) * (0.7 + 0.5 * glint) * uSizeMul * (1.0 + uCharge * 0.5);
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.55 + 0.45 * glint) * uAlpha * (0.55 + 0.3 * uCharge);
  vec3 tint = vec3(0.72, 0.65, 1.0); // a ametista do motor
  vC = mix(tint, vec3(0.88, 0.82, 1.0), step(0.6, fract(aRand.y * 7.13)) * 0.5 + glint * 0.45);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher do Cristal: Nv.7 = a malha importada do prisma vivo; enquanto ela
 * desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO segura o
 * buraco — o figurino do prisma antigo nunca mais aparece no campo (a lição da
 * troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `CrystalRig` antigo ficou só doador de efeitos e coreografia).
 */
export function CrystalRig(props: CrystalRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="cristal" url={CRYSTAL_URL} seed={props.seed} />}>
      <SummonReveal species="cristal" seed={props.seed}>
        <CrystalMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function CrystalMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: CrystalRigProps) {
  const { scene } = readModel(CRYSTAL_URL);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/carga não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${CRYSTAL_URL} não tem mesh`);
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    // solda p/ o tremor das facetas não rasgar nas arestas duras do GLB
    // (qa/probe-cracks.mjs)
    weldDispNormals(geo);
    const bb = geo.boundingBox!;
    const spanY = bb.max.y - bb.min.y;
    return {
      geo,
      tex: (meshes[0].material as THREE.MeshStandardMaterial).map,
      yMin: bb.min.y,
      spanY,
      // o coração do colosso: a GEMA de luz do peito (fornalha do prisma)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 5,14 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('cristal', CRISTAL_DEF.levelMin as MonsterLevel);
    const yaw = CRISTAL_MODEL_YAW;
    const hx = Math.max(-bb.min.x, bb.max.x);
    const hz = Math.max(-bb.min.z, bb.max.z);
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const halfWide = hx * ca + hz * sa; // o que o buraco VÊ de esq/dir
    const halfAlong = hx * sa + hz * ca; // e de trás/frente
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

  // altura local do coração (gema do peito): a base da malha já fica plantada no
  // y 0 do rig, então mora na própria porcentagem escalada — SEM somar `pos[1]`
  // de novo (a lição do Raio)
  const s = fit.s;
  const coreY = src.coreY * s;

  // material por instância: textura do GLB + PRISMA VIVO — a leitura da pintura no
  // emissivo (as arestas claras de cristal acendem o veio da IDENTIDADE pelas
  // fraturas) via onBeforeCompile com o MESMO ruído de flameShaders
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // ametista facetada: polida mas não espelhada (o reflexo puro some no fundo)
      roughness: 0.42,
      metalness: 0.2,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.22,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uCT = { value: 0 };
      sh.uniforms.uCSeed = { value: seed };
      sh.uniforms.uCCharge = { value: 0 };
      sh.uniforms.uCHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uCT;\nuniform float uCSeed;\nuniform float uCCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // as FACETAS zumbem de leve na afinação (o prisma bebe a luz): treme
          // CURTO e sorteado por faceta (celula dura), na normal SOLDADA
          // (aDispNrm — senão as arestas duras abririam as "rachaduras" do
          // qa/probe-cracks.mjs). A régua é MILIMÉTRICA (o ruído vale 0..1 e a
          // amplitude mora em METROS; o plate cru inflaria o colosso inteiro).
          float facet = fnoise(floor(vJit * 14.0) + uCSeed);
          float hum = sin(uCT * 11.0 + facet * 60.0) * (0.0008 + uCCharge * 0.0035);
          transformed += aDispNrm * (facet * 0.004 + hum);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uCT;\nuniform float uCCharge;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // A PEDRA VIRA VIDA: onde a pintura é CLARA (as arestas/lascas do
          // cristal pegando luz) o veio da IDENTIDADE (ametista) ACENDE pelas
          // fraturas num sorteio duro de faceta — a gema do peito é o único
          // ponto aceso do colosso e é ela que lê no card miúdo.
          vec4 pain = texture2D(map, vMapUv);
          float lum = clamp(pain.r + pain.g + pain.b - 0.9, 0.0, 1.0);
          float ck = step(0.5, fract(sin(floor(uCT * 6.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // veios de ametista (nunca branco puro somado a tudo — a regra do gelo)
          totalEmissiveRadiance += vec3(0.55, 0.45, 0.92) * lum * (0.25 + 0.5 * ck + uCCharge * 0.9);
          totalEmissiveRadiance *= 1.0 + uCCharge * 0.8;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // halo de estilhaços de ametista orbitando o colosso (as farpas do ricochete):
  // faixas do corpo (da base ao topo da cabeça), nunca acima da malha
  const orbit = useMemo(
    () => ({
      geo: makeSparkGeo(22),
      mat: new THREE.ShaderMaterial({
        vertexShader: SHARD_ORBIT_VERT,
        fragmentShader: SPARK_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uY0: { value: 0.22 * s },
          uY1: { value: src.spanY * s - 0.14 * s },
          uR1: { value: s * 0.5 },
          uR2: { value: s * 0.82 },
          uSpin: { value: 1.8 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // pó de prisma: funil invertido do chão do slot para a gema do peito (escalado
  // ao porte da malha) — a luz entrando pela pedra (o motivo de vida da espécie)
  const motes = useMemo(
    () => ({
      geo: makeMoteGeo(embers ?? 26),
      mat: new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
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

  // auréola de estilhaços (ametista do motor + lilás-quase-branco — o projétil-
  // assinatura do prisma é farpa de cristal que ricocheteia)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, CRISTAL_AMETHYST),
      makeStarburstGeo(seed + 7.4, 14, '#d6c8ff'),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, motes, starburstGeos]);

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

    // estado da unidade no motor (dano, HP, morte, ataque) — os mesmos canais
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let frontZ = -1; // para onde a criatura aponta (jogador ataca para -Z)
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
      if (demoT.current > CRISTAL_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= CRISTAL_WINDUP * CRISTAL_ATTACK_WINDOW && sinceAttack <= CRISTAL_ATTACK_WINDOW;
    // o clarão da cadeia nasce no estalo e some em ~0,3 s (a luz saiu pela boca)
    const flash = striking ? Math.max(0, 1 - (sinceAttack - CRISTAL_WINDUP * CRISTAL_ATTACK_WINDOW) / 0.3) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (facetadas zumbando + veios da gema acendendo)
    const sh = body.userData.shader as
      | { uniforms: { uCT: { value: number }; uCCharge: { value: number }; uCHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uCT.value = t;
      sh.uniforms.uCCharge.value = pose.charge;
      sh.uniforms.uCHurt.value = hurt;
    }
    // o prisma zumba baixinho o tempo todo e a gema arde na afinação (APAGA quase
    // junto no tiro — a luz saiu pela boca)
    const hum =
      Math.sin(t * 1.9 + seed) * 0.4 +
      Math.sin(t * 3.7 + seed * 0.6) * 0.3 +
      Math.sin(t * 0.7 + 1.3) * 0.3;
    body.emissiveIntensity = Math.max(
      0,
      (0.22 + hum * 0.04 + pose.charge * 0.55 + flash * 0.7 + hurt * 0.5 + crumble * 0.3) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.6 + flash * 0.35 + pose.charge * 0.3));

    // pó de prisma: a sucção acelera e aperta ao carregar a cadeia; na morte o
    // colosso SE ESTILHAÇA (carga de morte engolindo e vazando tudo)
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.7);

    // halo de estilhaços orbitando o corpo (o turbilhão DOBRA na afinação)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: plantado na duna (o prisma NÃO flutua): ENXUGA a luz ao afinar
    // (contrai) e ESTUFA no tiro (a luz saiu), torce, verga para frente ----
    const sway = Math.sin(t * 0.3 + seed) * 0.014 + Math.sin(t * 0.9 + 1.7) * 0.006;
    const breathe = Math.sin(t * 0.7 + seed) * 0.008;
    g.scale.set(
      1 - pose.gather * 0.035 + breathe,
      1 + pose.gather * 0.05 + breathe,
      1 - pose.gather * 0.035 + breathe,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.25 + seed * 0.6) * 0.008;
    g.rotation.x = pose.lean * 0.05;
    g.position.y = 0;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão da GEMA acesa no peito (o miolo de luz do rig antigo — plantado
    // na FRENTE da gema do GLB, MIÚDO e SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.3 + hum * 0.08 + pose.charge * 0.45 + hurt * 0.2));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.02 * Math.sin(t * 2.4 + seed) + pose.charge * 0.08) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.55 + 0.1 * s));
    const flashS = flash > 0 ? 0.7 + 1.1 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.22 * alpha;

    const aura = burstAuraRef.current;
    // a auréola gruda no corpo (deslocamento e escala SEGUEM o encaixe `s`) para o
    // envelope total nunca passar do anel — a mesma régua da trovoada
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.28;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.40 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.12));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const amethystShard = starburstRefs.current[0];
    const lilacShard = starburstRefs.current[1];
    if (amethystShard) {
      (amethystShard.material as THREE.MeshBasicMaterial).opacity = (0.1 + pose.charge * 0.07) * auraPulse * alpha;
    }
    if (lilacShard) {
      (lilacShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente à gema
    coreGlow.scale.setScalar(0.22 + pose.charge * 0.16 + flash * 0.14); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.06 + pose.charge * 0.14 + flash * 0.12) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={CRISTAL_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* pó de prisma: a luz entrando pelas pontas e sendo engolida pelo corpo */}
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      {/* halo de estilhaços de ametista orbitando o corpo (metade gira para o lado oposto) */}
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
      {/* SEM anéis de chão: o colosso de pedra nunca os teve (a lição do Magmar) */}
      <sprite ref={coreGlowRef} scale={0.22} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={CRISTAL_AMETHYST}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={glowRef} position={[0, coreY, 0]} scale={1.3}>
        <spriteMaterial
          map={circleTexture()}
          color="#cbb6ff"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flashRef} scale={0.0}>
        <spriteMaterial
          map={circleTexture()}
          color="#e6dcff"
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
