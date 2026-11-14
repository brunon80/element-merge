import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import windLvl1Url from '../models/wind/wind_model_lvl1.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import { circleTexture, setSeedAttribute } from './assets';
import { NOISE_GLSL } from './flameShaders';
import {
  attackPose,
  WIND_ATTACK_WINDOW,
  WIND_ROLE_LOOK,
  WindRig,
  type WindRigProps,
} from './WindRig';
import { WIND_FRAG } from './windShaders';

/**
 * ZÉFIRO Nv.1 de MALHA 3D IMPORTADA (linha "modelos 3D", molde do Ignis Nv.1):
 * a unidade Nv.1 ("sopro") troca o funil procedural de peças pelo mesh
 * texturizado criado fora do jogo (`src/models/wind/wind_model_lvl1.glb` —
 * ~24,7 mil vértices, 40 mil triângulos, UMA malha com UMA textura, exportado
 * pelo trimesh a partir de um .ply; SEM ossos e SEM animação no arquivo).
 * Nv.2+ continua o WindRig normal (redemoinho → tornado), e enquanto a malha
 * carrega o fallback também é o WindRig.
 *
 * O GLB não traz esqueleto, então vale o mesmo esquema da malha do fogo:
 * esqueleto gerado em código (`root → spine → head → fin0 → fin1`) com pesos
 * por FAIXA de Y (`ensureSkin`), coreografia de rajada é o `attackPose`
 * exportado do WindRig (inalar → soltar), follow-through amostrado no passado,
 * e a VIDA DO VENTO em camadas:
 *  1. o corpo texturizado com `onBeforeCompile`: grão das fitas de vento
 *     CORRENDO PARA CIMA (a pista de "vento" — análogo da fervura do fogo) e
 *     as barbatanas/acrescimo acima de y 0.3 batendo com fase própria; o
 *     rosto (y < 0.28) fica firme;
 *  2. ENVOLTÓRIO DE VENTO (o antigo abraçando o novo): a MESMA malha folgada
 *     para fora vestida com o WIND_FRAG LITERAL do WindRig — fitas subindo em
 *     espiral, torção + rotação DIFERENCIAL (a base gira mais que o topo) e a
 *     nuvem de tempestade translúcida. O deslocamento é pelo EIXO do corpo,
 *     nunca pela normal (lição das "rachaduras" do invólucro do fogo: na
 *     normal, pontas finas dobram na quina). Translúcido com mesclagem NORMAL
 *     como o figurino do vento (nada estoura em branco), e o rosto lê através
 *     do véu.
 *  3. os MESMOS motes subindo em espiral pelo funil (poeira, folhas e luz de
 *     relâmpago) e a poeira sugada do pool compartilhado.
 *
 * ENCAIXE: modelo escalado para o topo autoral da forma (`formTop` Nv.1 =
 * 1,75) e FLUTUANDO à altura do sopro antigo (`FLOAT_Y` Nv.1 = 0,34) — a
 * meia-envergadura da malha escalada (~0,73 × 0,62) é MENOR que o `MEDIDO` do
 * sopro (0,9 × 0,88), então `slotFit`/buracos/HUD seguem sem tocar em
 * `data/footprints.ts`. O giro do invólucro é deliberadamente LENTO (uSpin
 * modesto): redemoinhar rápido alargaria a varredura do invólucro para fora do
 * anel da pegada.
 */

/** dados da espécie (a altura autoral do Nv.1 vem do catálogo, não do modelo) */
const ZEPHYR_DEF = getSpecies('zephyr');
const TOP_LVL1 = formTop(ZEPHYR_DEF, 1);
/** o sopro antigo flutuava (FLOAT_Y do WindRig, Nv.1) — a malha também flutua */
const FLOAT_LVL1 = 0.34;

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local (o mesmo +Z do avanço da
 * rajada). Se o print mostrar o bicho DE COSTAS, vire aqui (Math.PI = meia
 * volta; π/2 e -π/2 para os lados).
 */
export const ZEPHYR_MODEL_YAW = 0;

/** brasa fria do emissivo (tempestade, não fogo) e o flash de dano */
const EMISSIVE_BASE = new THREE.Color('#4f9fd0');
const EMISSIVE_FLASH = new THREE.Color('#eaf6ff');

/**
 * ENVOLTÓRIO DE VENTO: casca da mesma malha folgada ao longo do EIXO do corpo
 * (a lição do fogo vale em dobro aqui — o wind tem barbatanas finas) vestida
 * com o WIND_FRAG LITERAL do figurino. O vertex reescreve a fervura do
 * WIND_VERT trocando o deslocamento pela NORMAL pelo eixo suavizado, e
 * mantém torção + rotação diferencial + balanço da coluna idênticos.
 * Os varying batem com o WIND_FRAG (vU/vAng/vN1/vG/vNrm/vView), então o
 * fragment — fitas, nuvem de tempestade, mesclagem e anti-NaN — é o mesmo.
 */
const SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uSeed;
uniform float uHurt;
uniform float uFlare;
uniform float uTwist;
uniform float uSpin;
uniform float uBend;
uniform float uPhase;
uniform float uModelH;
attribute float aSeed;
varying float vU;
varying float vAng;
varying float vN1;
varying float vG;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  vU = uv.y;
  vAng = atan(pos.z, pos.x);

  // altura no modelo (bbox local −1,00..+0,98): tudo cresce com a altura,
  // a base fica mais firme — o mesmo gradiente do WIND_VERT (gfrac)
  float gh = pos.y + 1.0;
  float gfrac = clamp(gh / max(0.001, uModelH), 0.0, 1.0);
  vG = gfrac;

  // ruído anisotrópico subindo pela superfície (idêntico ao WIND_VERT)
  vec3 q = vec3(pos.x * 2.4, pos.y * 1.4 - uTime * 2.1, pos.z * 2.4) + uSeed + aSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.2 + vec3(3.1, -uTime * 1.6, 1.7) + 11.0);
  vN1 = mix(n1, n2, 0.3);

  float amp = uAmp * (1.0 + uHurt * 0.35) * (1.0 + uFlare * 0.35);
  // folga + turbulência no EIXO do corpo (não na normal): nas barbatanas
  // finas as duas faces empurriam para lados opostos e dobravam na quina
  // (as "rachaduras" do invólucro do fogo) — no eixo as faces andam juntas
  vec3 away = pos - vec3(0.0, -0.1, 0.0); // centro do sopro (umbigo da nuvem)
  vec3 axis = normalize(vec3(away.x, away.y * 0.3, away.z) + 1e-5);
  pos += axis * (0.12 + ((n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9) * amp);

  // torção + rotação DIFERENCIAL com ruído dentro do ângulo (espiral bamba)
  float ang =
    uTwist * gh * (1.0 + uFlare * 0.6) +
    uTime * uSpin * (1.0 - 0.4 * gfrac) * (1.0 + uFlare * 0.9) +
    (fbm(q * 0.8 + 5.0) - 0.5) * 1.2;
  float c = cos(ang);
  float s = sin(ang);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  vNrm = normalMatrix * normal;

  // a coluna balança como um funil solto (mesma fase do corpo — uPhase)
  float sway = uBend * gfrac * gfrac * (1.0 + uFlare * 0.8);
  pos.x += sin(uTime * 0.85 + uPhase) * sway;
  pos.z += cos(uTime * 0.67 + uPhase * 1.7) * sway * 0.8;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const tmpWorld = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

/**
 * Esqueleto em código (o GLB não traz nenhum): `root → spine → head → fin0 →
 * fin1`. Juntas calcadas nos marcos da malha (bbox y −1,00..+0,98): cauda do
 * sopro, coração da nuvem, topo da cara e raiz/ponta das barbatanas.
 */
const JOINT_Y = [-1.0, -0.15, 0.3, 0.42, 0.72];

/**
 * Pesos de pele POR FAIXA DE Y (2 influências por vértice, rampas suaves).
 * Uma vez por geometria; as instâncias compartilham os atributos, cada uma
 * anima o PRÓPRIO esqueleto. Abaixo de 0.28 o rosto nunca herda osso das
 * barbatanas (os olhos ficam firmes). Carimba também o `aSeed` que o
 * WIND_FRAG/SHELL exigem (lição WebKit: bound curto = o WebKit não desenha).
 */
function ensureSkin(geo: THREE.BufferGeometry, seed: number): void {
  if (!geo.userData.windSeed) {
    setSeedAttribute(geo, seed);
    geo.userData.windSeed = true;
  }
  if (geo.userData.zephyrSkin) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  const band = (y: number, a: number, b: number) => THREE.MathUtils.clamp((y - a) / (b - a), 0, 1);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    let a: number, b: number, w: number;
    if (y < -0.2) {
      a = 0; b = 1; w = band(y, -0.7, -0.2); // Root → Spine
    } else if (y < 0.28) {
      a = 1; b = 2; w = band(y, -0.2, 0.28); // Spine → Head
    } else if (y < 0.44) {
      a = 2; b = 3; w = band(y, 0.28, 0.44); // Head → Fin0
    } else {
      a = 3; b = 4; w = band(y, 0.5, 0.8); // Fin0 → Fin1 (ponta = 1.0)
    }
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    wgt[i * 4] = 1 - w;
    wgt[i * 4 + 1] = w;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.zephyrSkin = true;
}

/**
 * Dispatcher do Zéfiro: Nv.1 = malha importada; Nv.2..5 = WindRig (a
 * progressão redemoinho → funil → ciclone → TORNADO continua procedural).
 */
export function ZephyrRig(props: WindRigProps) {
  const level = clampLevel(props.level);
  if (level === 1) {
    // enquanto o GLB (4,4 MB) carrega, o sopro antigo segura o palco
    return (
      <Suspense fallback={<WindRig {...props} level={1} />}>
        <WindLvl1MeshRig {...props} level={1} />
      </Suspense>
    );
  }
  return <WindRig {...props} level={level} />;
}

/** motes do funil: poeira, folhas e luz subindo em espiral (o MATE do WindRig) */
function makeMoteGeo(n: number): THREE.BufferGeometry {
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

const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uHeight;
uniform float uR1;
uniform float uR2;
uniform float uSpin;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.26 + 0.46 * aRand.z;
  float prog = fract(uTime * speed * 0.6 + aRand.y);
  float ang = aRand.x * 6.28318 + uTime * uSpin * (1.35 - 0.55 * prog) + prog * 7.5;
  float r = mix(uR1, uR2, prog * prog) * (0.5 + 0.6 * aRand.z);
  vec3 p = vec3(cos(ang) * r, prog * uHeight, sin(ang) * r);
  p.x += sin(uTime * 3.1 + aRand.x * 9.0 + prog * 8.0) * 0.06;
  p.z += cos(uTime * 2.7 + aRand.y * 7.0 + prog * 6.0) * 0.06;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (4.4 * (1.0 - prog) + 1.5) * (0.65 + 0.6 * aRand.z) * uSizeMul;
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // vivem até o topo do funil (o rastro de detritos é a marca do vendaval)
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.72, 1.0, prog)) * uAlpha;
  vec3 dust = vec3(0.7, 0.65, 0.53);
  vC = mix(mix(dust, vec3(0.62, 0.85, 0.98), aRand.z), vec3(1.0, 1.0, 1.0), prog) * 1.05;
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.1, length(d));
  if (!(m > 0.001 && vA > 0.001)) discard; // anti-NaN: aditivo + NaN = mancha preta via bloom
  gl_FragColor = vec4(vC, m * vA * 0.8);
}
`;

/** malha Nv.1 pura — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function WindLvl1MeshRig({
  seed,
  unitId,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WindRigProps) {
  useGLTF.preload(windLvl1Url);
  const { scene } = useGLTF(windLvl1Url);

  // a malha + a textura da fonte (geometry COMPARTILHADO entre instâncias;
  // material e esqueleto são por unidade)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error('wind_model_lvl1.glb não tem mesh');
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    const tex = (meshes[0].material as THREE.MeshStandardMaterial).map;
    return { geo, tex };
  }, [scene]);

  // encaixe autoral: altura = formTop Nv.1, corpo centralizado; a base fica a
  // FLOAT_LVL1 do tabuleiro (o sopro antigo FLUTUAVA — não se planta no chão)
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const s = TOP_LVL1 / (bb.max.y - bb.min.y);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(ZEPHYR_MODEL_YAW) + cz * Math.sin(ZEPHYR_MODEL_YAW));
    const pz = cx * Math.sin(ZEPHYR_MODEL_YAW) - cz * Math.cos(ZEPHYR_MODEL_YAW);
    return { s, pos: [px, FLOAT_LVL1 - bb.min.y * s, pz] as [number, number, number] };
  }, [src]);

  // material por instância: textura do GLB + brasa FRIA emissiva + fitas de
  // vento correndo para cima no vértice (o MESMO ruído dos shaders da casa)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.85,
      metalness: 0,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 0.7,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.045 };
      sh.uniforms.uFSeed = { value: seed };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nvarying float vRibbon;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // VENTO NA MALHA (o gesto do figurino, não "gelatina"): grão das
          // fitas CORRENDO PARA CIMA (análogo da fervura que sobe no fogo) e
          // as barbatanas/acréscimos acima de y 0.3 batendo com FASE PRÓPRIA
          // (o mesmo critério de fase azimutal da crina do fogo). y < 0.28 é
          // sólido: rosto/olhos nunca tremem.
          float h = clamp((transformed.y + 1.0) / 1.98, 0.0, 1.0);
          float fin = clamp((transformed.y - 0.3) / 0.65, 0.0, 1.0);
          float w = fin * fin; // raiz plantada na cabeça, barbatana livre
          float ph = atan(transformed.z, transformed.x) * 1.3 + uFSeed;
          // batida das barbatanas (mollejo lateral — dois harmônicos)
          transformed.x += (sin(uFT * 4.3 + ph) * 0.6 + sin(uFT * 8.9 + ph * 2.2) * 0.3) * uFA * 1.8 * w;
          transformed.z += (cos(uFT * 3.9 + ph * 1.4) * 0.5 + sin(uFT * 7.7 + ph * 0.7) * 0.25) * uFA * 1.8 * w;
          // fitas de vento subindo pela superfície (grão fino, fluxo vertical;
          // o corpo do vento ferve MENOS que o do fogo — é seda, não plasma)
          float fn = fbm(transformed * 2.6 + vec3(0.0, -uFT * 2.1, 0.0) + uFSeed);
          transformed += objectNormal * (fn - 0.5) * uFA * (0.8 + 1.4 * h);
          // o emissivo acende nas FITAS que passam (mesmo traço do WIND_FRAG:
          // faixa senoidal viajante em azimute × altura), contido — nuvem de
          // tempestade, não bola de luz
          float ribbon = 0.5 + 0.5 * sin(ph * 2.6 + transformed.y * 13.0 - uFT * 5.2);
          vRibbon = smoothstep(0.62, 0.95, ribbon);`,
        );
      sh.fragmentShader =
        'varying float vRibbon;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 + 0.5 * vRibbon;`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // ESQUELETO POR INSTÂNCIA: geometria (com pesos) compartilhada, ossos e
  // animação privados de cada unidade — dois Zéfiros Nv.1 nunca dançam juntos.
  const rig = useMemo(() => {
    ensureSkin(src.geo, seed);
    const mk = (name: string, y: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, y, 0);
      return b;
    };
    const root = mk('root', JOINT_Y[0]);
    const spine = mk('spine', JOINT_Y[1] - JOINT_Y[0]);
    const head = mk('head', JOINT_Y[2] - JOINT_Y[1]);
    const fin0 = mk('fin0', JOINT_Y[3] - JOINT_Y[2]);
    const fin1 = mk('fin1', JOINT_Y[4] - JOINT_Y[3]);
    root.add(spine);
    spine.add(head);
    head.add(fin0);
    fin0.add(fin1);
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, spine, head, fin0, fin1]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // barbatanas + shader viajam além da esfera
    return { skinned, bones: { root, spine, head, fin0, fin1 } };
  }, [src, body, seed]);

  // motes subindo em espiral pelo funil + clarão frio + poeira sugada: o
  // mesmo idioma visual do WindRig (Nv.1: sopro)
  const motes = useMemo(
    () => ({
      geo: makeMoteGeo(19), // 10 + level·9 do WindRig, Nv.1
      mat: new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: TOP_LVL1 },
          uR1: { value: 0.2 }, // 0.15 + 0.05·level, Nv.1
          uR2: { value: 0.71 }, // 0.55 + 0.16·level, Nv.1
          uSpin: { value: 1.5 }, // 1.1 + 0.4·level, Nv.1
        },
      }),
    }),
    [emberScale],
  );

  // INVOLTÓRIO: a casca de vento do antigo (WIND_FRAG literal; eixo em vez de
  // normal no vertex) por cima da textura — mesclagem NORMAL como o figurino
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: WIND_FRAG,
        transparent: true,
        blending: THREE.NormalBlending, // nuvem translúcida: nada estoura
        depthWrite: false,
        side: THREE.DoubleSide, // a parede de dentro do vórtice é mais fraca
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed },
          uPhase: { value: seed },
          uAmp: { value: 0.1 },
          uTwist: { value: 0.8 },
          uSpin: { value: 0.9 }, // LENTO de propósito: varredura dentro da pegada
          uBend: { value: 0.032 }, // 0.02 + 0.012·level, Nv.1
          uFlare: { value: 0 },
          uHurt: { value: 0 },
          uYOff: { value: 0 },
          uModelH: { value: TOP_LVL1 },
          uAlpha: { value: 1 },
          // o véu é mais denso que o do fogo (mesclagem NORMAL + dupla face):
          // 0,62 deixa a cara ler ATRAVÉS do vento; suba se quiser mais nuvem
          uAlphaMul: { value: 0.62 },
          uSoft: { value: 1 },
          uCold: { value: new THREE.Color(WIND_ROLE_LOOK.body!.cold) },
          uMid: { value: new THREE.Color(WIND_ROLE_LOOK.body!.mid) },
          uHot: { value: new THREE.Color(WIND_ROLE_LOOK.body!.hot) },
        },
      }),
    [seed],
  );

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      rig.skinned.skeleton?.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    },
    [body, shellMat, rig, motes],
  );

  const animRef = useRef<THREE.Group>(null!);
  const shellRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const dustAcc = useRef(0);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  useFrame((_, dtRaw) => {
    const g = animRef.current;
    const glow = glowRef.current;
    if (!g || !glow) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor — os mesmos canais do WindRig
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    let dying = 0;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
          dying = 1 - alpha;
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > WIND_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // ---- DANÇA DO VENDAVAL nos ossos: a FÓRMULA EXATA do WindRig mora no
    // osso SPINE (respiração do funil + sucção da inalação + expansão do
    // release), a cabeça ATRASA o lean e as barbatanas são amostradas NO
    // PASSADO — o arraste que escala de grupo nenhum faz ----
    const pulse =
      Math.sin(t * 1.35 + seed) * 0.6 + Math.sin(t * 2.7 + 2.2 + seed * 0.4) * 0.4;
    const surge = Math.max(0, Math.sin(t * 0.7 + seed) * 1.4 - 0.7) * 0.12;
    const breathe = 1 + pulse * 0.028 + pose.suck * -0.06 + pose.flare * 0.03;
    const hpDip = 0.78 + 0.22 * hpFrac;
    const wilt = dying * 0.9; // morte: o funil se desmancha
    const lagA = attackPose(sinceAttack - 0.07);
    const lagB = attackPose(sinceAttack - 0.14);
    const b = rig.bones;
    b.spine.scale.set(
      breathe * (1 - wilt * 0.4),
      (1 + pulse * 0.03 + pose.flare * 0.07 + pose.suck * 0.05) * hpDip * (1 - wilt * 0.55),
      breathe * (1 - wilt * 0.4),
    );
    b.spine.rotation.z = Math.sin(t * 0.9 + seed) * 0.045 + pose.lean * 0.25;
    b.spine.rotation.x = Math.sin(t * 1.1 + seed * 0.8) * 0.03 + pose.lean * 0.9;
    // o sopro FLUTUA (FLOAT_Y + bob + surge do WindRig) — o repouso do osso
    // entra na conta (lição do root do ignis)
    b.root.position.y =
      JOINT_Y[0] + Math.sin(t * 1.6 + seed) * 0.11 + surge * 0.6;
    b.head.rotation.x =
      Math.sin(t * 1.3 + seed * 0.6) * 0.05 + pose.lean * 0.45 - hurt * 0.15 + wilt * 0.5;
    b.head.rotation.z = Math.sin(t * 1.1 + seed * 0.5) * 0.04;
    // barbatanas arrastam atrás do funil e ESCANCARAM no release (amostradas
    // 70/140 ms no passado — o atraso do tecido de vento)
    b.fin0.rotation.x = lagA.lean * 0.45 + lagA.swing * 0.22 + Math.sin(t * 1.5 + seed) * 0.05 + wilt * 0.5;
    b.fin0.rotation.z = Math.sin(t * 1.25 + seed * 0.7) * 0.06;
    b.fin1.rotation.x = lagB.lean * 0.3 + lagB.swing * 0.5 + Math.sin(t * 1.9 + seed * 1.4) * 0.08 + wilt * 0.7;
    b.fin1.rotation.z = Math.sin(t * 1.4 + seed * 0.9) * 0.09;
    b.fin1.scale.y = (1 + lagA.flare * 0.18 + pulse * 0.04) * (1 - wilt * 0.4);
    // giro lento do corpo inteiro no idle (o vendaval respira girando — o
    // WindRig balança o y do grupo; a rotação DE VELOCIDADE é do invólucro)
    g.rotation.y = Math.sin(t * 0.35 + seed * 0.5) * 0.16;
    g.position.z = pose.stepZ;

    // o invólucro cola no beat do SPINE (respiração + lean) — skinning aproximado
    const env = shellRef.current;
    if (env) {
      env.scale.set(b.spine.scale.x, b.spine.scale.y, b.spine.scale.z);
      env.rotation.set(b.spine.rotation.x, 0, b.spine.rotation.z);
    }
    // fervor do vento (o MESMO ampMul/spinBoost do WindRig): HP/fraca ferve
    // menos, estouro acelera torção, morrer desmancha o funil
    const ampMul =
      (0.7 + 0.3 * hpFrac) * (1 + pose.flare * 0.45) * (1 + hurt * 0.35) * (1 + dying * 0.9);
    const spinBoost = 1 + pose.flare * 1.6 + dying * 1.4;
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uFlare.value = pose.flare;
    shellMat.uniforms.uAmp.value = 0.1 * ampMul;
    shellMat.uniforms.uSpin.value = 0.9 * spinBoost;
    shellMat.uniforms.uBend.value = 0.032 * (1 + dying * 2.2);
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.75 + pulse * 0.08 + pose.flare * 0.2) * alpha);

    // ---- vida no material do corpo: fitas + brasa fria ----
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      sh.uniforms.uFA.value = 0.045 * ampMul;
    }
    body.emissiveIntensity = Math.max(
      0,
      (0.7 + pulse * 0.12 + pose.flare * 0.5 + hurt * 0.8) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.7 + pose.flare * 0.25));

    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;

    // ---- POEIRA sugada pelo funil (o canal de poeira FRIA do WindRig, Nv.1) ----
    if (smoke && alpha > 0.25) {
      dustAcc.current += dt * (1.1 + 2.1);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 4) {
        dustAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.5 + 0.16),
            TOP_LVL1 * (0.2 + Math.random() * 0.6),
            (Math.random() - 0.5) * (0.5 + 0.16),
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + 0.016,
          heat: 0.06 + Math.random() * 0.14, // poeira fria, não brasa
          life: 0.85 + 0.09,
          lifeVar: 0.45,
          jitter: 0.2,
          rise: 0.3 + 0.05,
          drag: 2.9,
        });
      }
      if (dustAcc.current > 4) dustAcc.current = 4;
    }

    // ---- clarão frio da tempestade (carrega no arremesso como o WindRig) ----
    const s2 = Math.max(0.8, 1.72 + pulse * 0.25 + hurt * 0.4 + pose.flare * 0.7);
    glow.scale.setScalar(s2);
    glow.position.y = TOP_LVL1 * 0.52;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.18 + pulse * 0.05 + hurt * 0.16 + pose.flare * 0.24) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={ZEPHYR_MODEL_YAW} scale={fit.s}>
        <primitive object={rig.skinned} />
        {/* pivô no joelho do spine: a casca respira/inclina junto do corpo */}
        <group ref={shellRef} position={[0, JOINT_Y[1], 0]}>
          <mesh
            geometry={src.geo}
            material={shellMat}
            position={[0, -JOINT_Y[1], 0]}
            frustumCulled={false}
          />
        </group>
      </group>
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.72}>
        <spriteMaterial
          map={circleTexture()}
          color="#7fc4ee"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}
