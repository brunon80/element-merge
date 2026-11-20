import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBSIDIAN_URL } from './modelUrls';
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
  OBSIDIANA_ATTACK_WINDOW,
  OBSIDIANA_WINDUP,
  OBS_CORE_LOOK,
  type ObsidianaRigProps,
} from './ObsidianaRig';

/**
 * OBSIDIANA DE MALHA 3D IMPORTADA — A FORTALEZA DE VIDRO NEGRO (Nv.7): a forma
 * da espécie vira um mesh texturizado criado fora do jogo
 * (`src/models/obsidian/obsidian.glb` — ~36.900 vértices, UMA malha com UMA
 * textura 2048²; SEM ossos e SEM animação): o bruto de vidro negro polido com as
 * juntas de ouro-metal, o NÚCLEO ÂMBAR aceso no peito e os CRISTAIS DE AMETISTA
 * brotando das costas. Enquanto a malha desce (demanda), o SELO DE INVOCÇÃO
 * (`SummonFX`) segura o buraco — o figurino de vidro (`ObsidianaRig`) nunca mais
 * pipoca no campo (ficou só doador de efeitos e coreografia) — e TODOS os efeitos
 * da fortaleza continuam vivos por cima da malha, no mesmo idioma dos demais
 * figurinos da linha "modelos 3D":
 *
 *  1. BRASA VIOLETA NAS COSTURAS da pintura do GLB: `onBeforeCompile` LÊ A
 *     TEXTURA no emissivo — onde a tinta é VIOLETA/clara (os cristais e as arestas
 *     de vidro pegando luz) a BRASA ENCAPSULADA (o violeta #8f5cff da IDENTIDADE do
 *     motor) ACENDE pelas fraturas, num sorteio duro de faceta; as FACETAS TREMEM
 *     de leve na afinação (treme curto na normal SOLDADA `aDispNrm`, lição das
 *     soldas — O VIDRO NEGRO NÃO BRANQUEIA sob dano: o feedback migra para a brasa
 *     das costuras, a lição do print da fortaleza que tanqueia a luta inteira);
 *  2. O NÚCLEO DO PEITO (o único ponto aceso da fortaleza — a lição do card
 *     miúdo): clarão aditivo miúdo plantado na FRENTE do núcleo do GLB + auréola de
 *     estilhaços de vidro (dois `starburst` em leque) — NUNCA o núcleo sólido do
 *     rig antigo (a malha já traz a pedra esculpida; religar uma brasa na frente
 *     seria a bola do Magmar cortada na aprovação);
 *  3. LIMALHAS DE VIDRO (os cacos que se soltam das arestas): o enxame do rig
 *     antigo BOIA rente ao corpo (vidro é pesado: vaivém curto e queda lenta),
 *     agora escalado ao encaixe da malha; a carga solta mais farpa;
 *  4. HALO DE FARPAS orbitando o corpo (as lasquinhas da coroa): um enxame duro de
 *     vidro numa faixa do corpo (da base à cabeça, NUNCA acima da malha — lição da
 *     trovoada), metade gira para o lado oposto.
 *
 * SEM fumaça do pool no corpo: vidro quebrando solta LIMALHA (as farpas), não
 * fuligem (o rig antigo só usava a cinza vulcânica dos PÉS no disparo). A
 * coreografia é a MESMA timeline do motor (janela 0,95 s — a mais PESADA da
 * árvore: a fortaleza AFFUNDA as fundações, as ombreiras recuam e sobem, o corpo
 * torce devagar, e VARRE para frente no arremesso; na morte ESTILHAÇA) lida de
 * `lastAttackAt`, e o `demoAttackSeq` do bestiário dispara o mesmo show. Sem
 * ossos: o rig antigo animava o GRUPO raiz (afundar, torcer, bofear) e a malha
 * herda esse grupo.
 *
 * ENCAIXE: a malha é quase CÚBICA (caixa crua x −0,362..0,357, y −0,416..0,499,
 * z −0,220..0,247 — spanY 0,916), como os demais Nv.7, e o encaixe vem da
 * LARGURA (o teto de altura 4,3/0,916=4,69 não aperta). `MEDIDO.obsidiana` no
 * degrau da linha (~1,9) põe a malha do mesmo porte dos Nv.6; a cara encara o
 * INIMIGO no +Z local (rumo 0 — o NÚCLEO ÂMBAR do peito saiu no painel "frente
 * (+Z)" do viewer de 4 vistas, `qa/mesh-viewer-shot.mjs`). O `slotFit` da família
 * (teto 1,15) não muda.
 */

/** dados da espécie (a altura autoral da forma vem do catálogo, não do modelo) */
const OBSIDIANA_DEF = getSpecies('obsidiana');

/** topo autoral da forma Nv.7 (o mesmo número que o motor usa p/ o canhão) */
const TOP = formTop(OBSIDIANA_DEF, OBSIDIANA_DEF.levelMin);

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local. O print de quatro vistas do
 * GLB puro (painel superior esquerdo = frente +Z) mostrou o NÚCLEO do peito no +Z
 * e os cristais de ametista nas COSTAS (−Z) — como as demais malhas da linha. Se
 * um GLB substituto vier virado, vire aqui.
 */
export const OBSIDIANA_MODEL_YAW = 0;

/**
 * Abraço estático do invólucro (em metros do MODELO): folga que a auréola de
 * farpas ganha para fora. MESMO 0,13 da linha; a sonda de footprint lê a caixa
 * CPU e NÃO vê os pontos, mas a auréola vive na régua da caixa.
 */
const SHELL_HUG = 0.13;

/**
 * Coração da fortaleza em PORCENTAGEM da altura da malha: o NÚCLEO do peito (a
 * brasa vulcânica encapsulada no vidro) mora um dedo ACIMA do meio geométrico. É
 * a régua de CORE_Y: clarão, auréola e a fervura da brasa nascem dessa altura.
 */
const CORE_FRAC = 0.6;

/** o violeta encapsulado da fortaleza (= a cor do projétil/FX do motor) e o flash */
const CRACK_VIOLET = new THREE.Color(OBS_CORE_LOOK.gold); // #8f5cff
const EMISSIVE_BASE = new THREE.Color('#2a1f44');
const EMISSIVE_FLASH = new THREE.Color('#d9c4ff');

/**
 * VERTEX da LIMALHA DE VIDRO escalada ao encaixe da malha (o caco solto das
 * arestas do ObsidianaRig antigo): farpas miúdas que BOIAM rente ao corpo — vidro
 * é PESADO: o vaivém é curto e a queda é lenta, arrastada pelo calor que sobe do
 * vulcão. `uScale` amarra o raio/altura ao porte da malha (caixa crua ~0,9);
 * `uCharge` solta mais farpa quando a fortaleza carrega o arremesso.
 */
const GRIT_VERT = /* glsl */ `
attribute vec4 aRand; // x: ângulo, y: fase, z: tamanho, w: giro
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uScale;
uniform float uCharge;
varying float vA;
varying float vRot;
void main() {
  float speed = 0.16 + 0.18 * aRand.z;
  float prog = fract(uTime * speed * 0.34 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * 0.12;
  // vaivém curto (o caco sobe, engasga no calor e desce de novo)
  float bob = sin(uTime * 0.9 + aRand.y * 7.0 + prog * 6.0) * 0.18;
  float r = (0.62 + 0.62 * aRand.z) * uScale + bob * uScale;
  float y = ((0.25 + 0.2 * aRand.w) + prog * (0.7 + 0.5 * aRand.z)) * uScale + bob * uScale;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r * 0.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // farpa miúda: ponto PEQUENO (perto da câmera não pode virar parede)
  float size = (1.6 + 2.2 * aRand.z) * (1.0 + uCharge * 0.4) * uSizeMul;
  gl_PointSize = min(64.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.8, 0.98, prog)) * uAlpha;
  vRot = uTime * (0.5 + 1.8 * aRand.w) + aRand.y * 6.28318;
  gl_Position = projectionMatrix * mv;
}
`;

const GRIT_FRAG = /* glsl */ `
varying float vA;
varying float vRot;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // farpa de vidro: lasca ALONGARADA girando (não bolinha), com o brilho
  // violeta só numa ponta — o reflexo do fogo preso passando pela faceta
  float ca = cos(vRot), sa = sin(vRot);
  vec2 q = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  float sliver = smoothstep(0.09, 0.0, abs(q.y)) * smoothstep(0.42, 0.12, abs(q.x));
  if (sliver <= 0.001 || vA <= 0.001) discard;
  float glint = smoothstep(0.0, 0.35, q.x + 0.35);
  vec3 col = mix(vec3(0.16, 0.13, 0.24), vec3(0.56, 0.36, 1.0), glint * 0.7);
  gl_FragColor = vec4(col, min(1.0, sliver) * vA * 0.62);
}
`;

/**
 * VERTEX do HALO DE FARPAS orbitando a fortaleza (as lasquinhas da coroa): cada
 * farpa dura orbita numa faixa própria do corpo (da base à cabeça, NUNCA acima da
 * malha — lição da trovoada), com raio/altura tremendo em senóides desencontradas
 * e um lampejo duro (a facetada de vidro pegando luz). Metade gira para o lado
 * oposto (caos). Violeta do motor; a que lampeja vira lilás-quase-branco.
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
  vec3 tint = vec3(0.56, 0.36, 1.0); // o violeta encapsulado (#8f5cff)
  vC = mix(tint, vec3(0.85, 0.78, 1.0), step(0.6, fract(aRand.y * 7.13)) * 0.5 + glint * 0.45);
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Dispatcher da Obsidiana: Nv.7 = a malha importada da fortaleza de vidro negro;
 * enquanto ela desce (demanda, uma vez por sessão), o SELO PROCEDURAL DE INVOCÇÃO
 * segura o buraco — o figurino de vidro antigo nunca mais aparece no campo (a
 * lição da troca: o monstro velho pipocando antes da malha desvaloriza o print; o
 * `ObsidianaRig` antigo ficou só doador de efeitos e coreografia).
 */
export function ObsidianaRig(props: ObsidianaRigProps) {
  return (
    <Suspense fallback={<SummonSigil species="obsidiana" url={OBSIDIAN_URL} seed={props.seed} />}>
      <SummonReveal species="obsidiana" seed={props.seed}>
        <ObsidianaMeshRig {...props} />
      </SummonReveal>
    </Suspense>
  );
}

/** malha pura da forma — suspensa pelo `readModel` (o dispatcher amarra o Suspense) */
function ObsidianaMeshRig({ seed, unitId, embers, emberScale = 1, demoAttackSeq }: ObsidianaRigProps) {
  const { scene } = readModel(OBSIDIAN_URL);

  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error(`${OBSIDIAN_URL} não tem mesh`);
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
      // o coração da fortaleza: o NÚCLEO do peito (brasa vulcânica encapsulada)
      coreY: CORE_FRAC * spanY,
    };
  }, [scene]);

  // encaixe autoral: a malha é quase CÚBICA, então a LARGURA manda (o teto de
  // altura 4,69 não aperta); plantado com a base no y 0 local, centro do corpo no
  // eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S) e a AABB é a
  // EXATA da caixa girada.
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const foot = footprintOf('obsidiana', OBSIDIANA_DEF.levelMin as MonsterLevel);
    const yaw = OBSIDIANA_MODEL_YAW;
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

  // material por instância: textura do GLB + BRASA VIOLETA NAS COSTURAS — a
  // leitura da pintura no emissivo (os cristais e as arestas de vidro acendem o
  // violeta da IDENTIDADE pelas fraturas) via onBeforeCompile com o MESMO ruído
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      // vidro negro POLIDO: rugosidade baixa e metal médio (o brilho vem do
      // specular e do reflexo da arena, nunca do albedo — a lição do print)
      roughness: 0.24,
      metalness: 0.55,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.18,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOT = { value: 0 };
      sh.uniforms.uOSeed = { value: seed };
      sh.uniforms.uOCharge = { value: 0 };
      sh.uniforms.uOHurt = { value: 0 };
      sh.vertexShader =
        `uniform float uOT;\nuniform float uOSeed;\nuniform float uOCharge;\nvarying vec3 vJit;\nattribute vec3 aDispNrm;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // as FACETAS de vidro zumbem de leve (a brasa presa esquentando): treme
          // CURTO e sorteado por faceta (celula dura), na normal SOLDADA (aDispNrm
          // — senão as arestas duras abririam as "rachaduras" do qa/probe-cracks.mjs).
          // A régua é MILIMÉTRICA (o ruído vale 0..1 e a amplitude mora em METROS).
          float facet = fnoise(floor(vJit * 14.0) + uOSeed);
          float hum = sin(uOT * 9.0 + facet * 60.0) * (0.0006 + uOCharge * 0.0028);
          transformed += aDispNrm * (facet * 0.004 + hum);
          vJit = position;`,
        );
      sh.fragmentShader =
        'uniform float uOT;\nuniform float uOCharge;\nuniform float uOHurt;\nvarying vec3 vJit;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          #ifdef USE_MAP
          // O VIDRO VIRA VIDA: onde a pintura é VIOLETA/clara (os cristais e as
          // arestas de vidro pegando luz) a BRASA ENCAPSULADA (o violeta #8f5cff da
          // IDENTIDADE) ACENDE pelas fraturas num sorteio duro de faceta — o NÚCLEO
          // do peito é o único ponto aceso da fortaleza e é ele que lê no card miúdo.
          vec4 pain = texture2D(map, vMapUv);
          float violet = clamp(pain.r + pain.b - 2.0 * pain.g - 0.25, 0.0, 1.0);
          float lum = clamp(pain.r + pain.g + pain.b - 1.35, 0.0, 1.0);
          float ck = step(0.5, fract(sin(floor(uOT * 5.0 + pain.g * 77.0) + vJit.x * 13.0) * 43758.5453));
          // veios de brasa violeta (nunca branco puro — o vidro negro não branqueia)
          totalEmissiveRadiance += vec3(0.56, 0.36, 1.0) * (violet + 0.4 * lum) * (0.3 + 0.5 * ck + uOCharge * 0.9);
          // a brasa das costuras ACENDE mais forte quando a fortaleza apanha (a
          // "carne que volta" de vidro — o feedback NUNCA migra pro albedo)
          totalEmissiveRadiance *= 1.0 + uOCharge * 0.9 + uOHurt * 0.8;
          #endif`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // halo de farpas de vidro orbitando a fortaleza (as lasquinhas da coroa): faixas
  // do corpo (da base ao topo da cabeça), nunca acima da malha
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
          uR2: { value: s * 0.8 },
          uSpin: { value: 1.6 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [emberScale, s, src.spanY],
  );

  // limalha de vidro: cacos boiando rente ao corpo (escalados ao porte da malha) —
  // o vidro quebrando solta farpa, não fuligem (o motivo de vida da espécie)
  const grit = useMemo(
    () => ({
      geo: (() => {
        const g = new THREE.BufferGeometry();
        const n = embers ?? 14;
        const pos = new Float32Array(n * 3);
        const rnd = new Float32Array(n * 4);
        let st = 0x2f7a19c3 ^ n;
        const rand = () => {
          st = (st * 1664525 + 1013904223) >>> 0;
          return st / 4294967296;
        };
        for (let i = 0; i < n * 4; i++) rnd[i] = rand();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
        return g;
      })(),
      mat: new THREE.ShaderMaterial({
        vertexShader: GRIT_VERT,
        fragmentShader: GRIT_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uScale: { value: s },
          uCharge: { value: 0 },
        },
      }),
    }),
    [embers, emberScale, s],
  );

  // auréola de estilhaços (violeta do motor + lilás-quase-branco — o projétil-
  // assinatura da fortaleza é lasca de vidro negro com brasa encapsulada)
  const starburstGeos = useMemo(
    () => [
      makeStarburstGeo(seed + 2.1, 20, OBS_CORE_LOOK.gold),
      makeStarburstGeo(seed + 7.4, 14, OBS_CORE_LOOK.white),
    ],
    [seed],
  );

  useEffect(() => {
    return () => {
      body.dispose(); // a TEXTURA é do cache do readModel (compartilhada): não dispor
      orbit.geo.dispose();
      orbit.mat.dispose();
      grit.geo.dispose();
      grit.mat.dispose();
      for (const g of starburstGeos) g.dispose();
    };
  }, [body, orbit, grit, starburstGeos]);

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
      if (demoT.current > OBSIDIANA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= OBSIDIANA_WINDUP * OBSIDIANA_ATTACK_WINDOW && sinceAttack <= OBSIDIANA_ATTACK_WINDOW;
    // o arremesso é PESADO: o clarão do núcleo nasce no disparo e some em ~0,35 s
    const flash = striking ? Math.max(0, 1 - (sinceAttack - OBSIDIANA_WINDUP * OBSIDIANA_ATTACK_WINDOW) / 0.35) : 0;
    const crumble = 1 - alpha;

    // uniforms do corpo (facetas zunindo + brasa das costuras acendendo e
    // acendendo MAIS quando apanha — o feedback migra da brasa, nunca do albedo)
    const sh = body.userData.shader as
      | { uniforms: { uOT: { value: number }; uOCharge: { value: number }; uOHurt: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uOT.value = t;
      sh.uniforms.uOCharge.value = pose.charge;
      sh.uniforms.uOHurt.value = hurt;
    }
    // a brasa das costuras respira DEVAGAR (vidro grosso segurando fogo demora a
    // piscar) e ACENDE na carga do arremesso (a fortaleza tanqueia: o dano vira brasa)
    const emberPulse = 0.42 + 0.2 * Math.sin(t * 0.9 + seed) + pose.charge * 1.5 + hurt * 1.2;
    body.emissiveIntensity = Math.max(
      0,
      (0.18 + emberPulse * 0.06 + flash * 0.5 + crumble * 0.3) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, flash * 0.3 + pose.charge * 0.25));

    // limalha de vidro: a carga solta mais farpa; na morte o vidro ESTILHAÇA
    grit.mat.uniforms.uTime.value = t;
    grit.mat.uniforms.uAlpha.value = alpha;
    grit.mat.uniforms.uCharge.value = Math.min(1, pose.charge + crumble * 0.9);

    // halo de farpas orbitando o corpo (o turbilhão DOBRA na carga)
    orbit.mat.uniforms.uTime.value = t;
    orbit.mat.uniforms.uAlpha.value = alpha;
    orbit.mat.uniforms.uCharge.value = pose.charge + flash * 0.6;

    // ---- corpo: o PESO do vidro grosso (a fundação AFFUNDA na carga, bofeia no
    // arremesso, torce devagar, afunda na morte) ----
    const sway = Math.sin(t * 0.3 + seed) * 0.01 + Math.sin(t * 0.72 + 1.7) * 0.005;
    const sink = 1 - pose.crouch * 0.06 - crumble * 0.05;
    g.scale.set(
      1 + pose.bulge * 0.045 + pose.flare * 0.015,
      sink,
      1 + pose.bulge * 0.04 + pose.flare * 0.015,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.26 + seed * 0.6) * 0.006;
    g.rotation.x = pose.crouch * 0.035 - pose.twist * 0.08;
    g.position.y = Math.sin(t * 0.6 + seed) * 0.008 - pose.crouch * 0.03;
    g.position.x = 0;
    g.position.z = pose.stepZ;

    // ---- clarão do NÚCLEO aceso no peito (o miolo de luz do rig antigo — plantado
    // na FRENTE do núcleo do GLB, MIÚDO e SÓBRIO nunca blowout) ----
    const glow = glowRef.current;
    glow.position.y = coreY;
    glow.scale.setScalar(Math.max(1.1, 1.25 + emberPulse * 0.05 + pose.charge * 0.4 + hurt * 0.15));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + 0.015 * Math.sin(t * 1.9 + seed) + pose.charge * 0.07) * alpha,
    );
    const flashSprite = flashRef.current;
    flashSprite.position.set(0, coreY, frontZ * -(0.5 + 0.1 * s));
    const flashS = flash > 0 ? 0.7 + 1.1 * (1 - flash) : 0.0;
    flashSprite.scale.setScalar(flashS);
    (flashSprite.material as THREE.SpriteMaterial).opacity = flash * 0.2 * alpha;

    const aura = burstAuraRef.current;
    aura.position.y = coreY;
    aura.position.z = frontZ * -0.28;
    aura.rotation.z = Math.sin(t * 0.9 + seed) * 0.08;
    aura.rotation.x = Math.sin(t * 1.3 + seed * 0.4) * 0.25;
    aura.scale.setScalar(s * 0.38 * (1 + Math.sin(t * 4.2 + seed) * 0.05 + pose.charge * 0.12));
    const auraPulse = 0.62 + 0.38 * Math.sin(t * 6.4 + seed);
    const violetShard = starburstRefs.current[0];
    const whiteShard = starburstRefs.current[1];
    if (violetShard) {
      (violetShard.material as THREE.MeshBasicMaterial).opacity = (0.08 + pose.charge * 0.07) * auraPulse * alpha;
    }
    if (whiteShard) {
      (whiteShard.material as THREE.MeshBasicMaterial).opacity = (0.06 + flash * 0.1) * auraPulse * alpha;
    }
    const coreGlow = coreGlowRef.current;
    coreGlow.position.set(0, coreY, frontZ * -(0.3 * s + 0.12)); // rente ao núcleo
    coreGlow.scale.setScalar(0.24 + pose.charge * 0.16 + flash * 0.14); // MIÚDO (a lição do carimbo)
    (coreGlow.material as THREE.SpriteMaterial).opacity = (0.06 + pose.charge * 0.14 + flash * 0.12) * alpha;
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={OBSIDIANA_MODEL_YAW} scale={fit.s}>
        <mesh geometry={src.geo} material={body} castShadow frustumCulled={false} />
      </group>
      {/* limalha de vidro: cacos boiando rente ao corpo (o vidro quebrando solta farpa) */}
      <points geometry={grit.geo} material={grit.mat} frustumCulled={false} />
      {/* halo de farpas de vidro orbitando o corpo (metade gira para o lado oposto) */}
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
      {/* SEM anéis de chão: a fortaleza espelhada no piso é o envelope que a malha
          já dá (a lição do Magmar — só se re-ancora o que o rig antigo de fato tinha) */}
      <sprite ref={coreGlowRef} scale={0.24} renderOrder={3}>
        <spriteMaterial
          map={circleTexture()}
          color={CRACK_VIOLET.getStyle()}
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
          color="#d9c4ff"
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
          color="#e0ccff"
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
