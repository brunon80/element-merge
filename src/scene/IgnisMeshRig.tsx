import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import fireLvl1Url from '../models/fire/fire_model_lvl1.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import { circleTexture } from './assets';
import { attackPose, FlameRig, ROLE_LOOK, type FlameRigProps } from './FlameRig';
import { makeEmberParticles, NOISE_GLSL } from './flameShaders';

/**
 * IGNIS Nv.1 de MALHA 3D IMPORTADA (experimental): a unidade Nv.1 ("faísca")
 * troca o figurino procedural de chamas pelo mesh texturizado criado fora do
 * jogo (`src/models/fire/fire_model_lvl1.glb` — ~21 mil vértices, 40 mil
 * triângulos, UMA malha com UMA textura; gerado no Hunyuan3D, SEM ossos e SEM
 * animação no arquivo). Nv.2+ continua o FlameRig normal, e enquanto a malha
 * carrega o fallback também é o FlameRig.
 *
 * O GLB não traz esqueleto, então o ESQUELETO NASCE EM CÓDIGO:
 * `root → spine → head → hair0 → hair1`, com pesos de pele (2 ossos/vértice)
 * calculados por FAIXA de Y da malha (`ensureSkin`, uma vez por geometria e
 * compartilhados entre instâncias — quem anima é o osso, e osso é por unidade).
 * A "vida" vem em camadas, no mesmo idioma dos rigs da casa:
 *  1. RESPIRAÇÃO + cambalear idle nos ossos (spine infla/murcha, head atrasa,
 *     crina faz follow-through — o que escala de grupo nenhum faz);
 *  2. COREOGRAFIA DE ATAQUE idêntica — `attackPose` do FlameRig sincronizado
 *     pela janela do motor (`lastAttackAt`) e pelo `demoAttackSeq` do bestiário:
 *     recolher (crina arrasta para trás) → arremesso (chicote + estouro);
 *  3. VIDA DA CHAMA no material: `onBeforeCompile` com o ruído de
 *     `flameShaders.ts` — cada ponta do leque molleja/alonga/pisca FORA DE
 *     FASE (em cima do movimento do osso, não no lugar dele);
 *  4. as MESMAS brasas subindo e a fuligem do pool compartilhado;
 *  5. INVOLTÓRIO DE CHAMA (o antigo abraçando o novo): uma casca da mesma
 *     malha vestida com o shader do FlameRig (fervura da base → topo),
 *     aditiva e translúcida por cima da textura — o rosto lê ATRAVÉS da
 *     chama-veu, como os olhos do imps antigo na própria bola de fogo.
 *
 * ENCAIXE: o modelo é escalado para o topo autoral da forma (`formTop` Nv.1 =
 * 1,95) e plantado com a base no chão — o invólucro da malha (~0,68 × 0,53 de
 * meia-envergadura) é MENOR que o `MEDIDO` da faísca (1,01 × 1.27), então
 * `slotFit`/buracos/HUD seguem sem tocar em `data/footprints.ts`.
 */

/** dados da espécie (a altura autoral do Nv.1 vem do catálogo, não do modelo) */
const IGNIS_DEF = getSpecies('ignis');
const TOP_LVL1 = formTop(IGNIS_DEF, 1);
const LEVEL_1 = 1;

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local (o mesmo +Z do avanço do
 * arremesso). O Hunyuan3D costuma exportar a frente no +Z da câmera que gerou
 * a imagem — se o print mostrar o bicho DE COSTAS para a câmera/inimigo,
 * vire aqui (Math.PI para meia-volta; π/2 e -π/2 para os lados).
 */
export const MODEL_YAW = 0;

/** brasa base do emissivo (mesma família de cores do FlameRig) e o flash */
const EMISSIVE_BASE = new THREE.Color('#ff5a12');
const EMISSIVE_FLASH = new THREE.Color('#fff2d8');

/**
 * ENVOLTÓRIO DE CHAMA (o antigo abraçando o novo): uma casca da MESMA malha,
 * deslocada para fora e vestida com o shader de chama do FlameRig — fervura
 * que NASCE NA BASE e CORRE para o topo (fluxo vertical do ruído + amplitude
 * crescendo com a altura + twist no topo). Renderizada aditiva e translúcida
 * por cima do corpo texturizado: o rosto fica lido ATRAVÉS da chama-veu, como
 * os olhos do imps antigo immersionados na própria bola de fogo.
 */
const SHELL_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uSeed;
uniform float uHurt;
varying float vH;
varying float vN1;
varying vec3 vNrm;
varying vec3 vView;
${NOISE_GLSL}
void main() {
  vec3 pos = position;
  // altura no modelo (bbox local −1.02..+0.97): a fervura começa na base e vai
  // ao topo — miúda embaixo, violenta em cima (o gradiente do FLAME_VERT antigo)
  float h01 = clamp((pos.y + 1.02) / 1.99, 0.0, 1.0);
  vH = h01;
  vec3 q = vec3(pos.x * 3.2, pos.y * 1.35 - uTime * 3.1, pos.z * 3.2) + uSeed;
  float n1 = fbm(q);
  float n2 = fnoise(q * 2.1 + vec3(0.0, -uTime * 2.2, 0.0) + 17.0);
  vN1 = mix(n1, n2, 0.25);
  float amp = uAmp * mix(0.55, 1.6, h01) * (1.0 + uHurt * 0.5);
  // folga + fervura na direção do EIXO do corpo (não na normal): na normal, as
  // duas faces das pontas finas empurram para lados opostos, dobram na quina e
  // nascem as "rachaduras"; no eixo as faces andam juntas — e a ponta cresce
  // para cima, que é exatamente o gesto de uma língua de fogo
  vec3 away = pos - vec3(0.0, -0.15, 0.0); // umbigo da bolota = centro do eixo
  vec3 axis = normalize(vec3(away.x, away.y * 0.3, away.z) + 1e-5);
  pos += axis * (0.13 + ((n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9) * amp);
  pos.y += (n1 - 0.4) * amp * h01; // línguas lambendo para cima no topo
  float tw = (fbm(q * 1.5 + 13.0) - 0.5) * 1.4 * h01; // twist que cresce com a altura
  float c = cos(tw);
  float s = sin(tw);
  pos.xz = mat2(c, -s, s, c) * pos.xz;
  vNrm = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uCold;
uniform vec3 uMid;
uniform vec3 uHot;
uniform float uAlpha;
uniform float uHurt;
varying float vH;
varying float vN1;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vec3 vd = normalize(vView);
  // clamp antes do pow (regra HANDOFF #4 — base de pow nunca negativa)
  float rim = pow(1.0 - abs(clamp(dot(normalize(vNrm), vd), -1.0, 1.0)), 1.6);
  // calor do antigo: base incandescente, topo esfriando, ruído mancha o gradiente
  float heat = clamp(1.18 - vH * 1.15 + (vN1 - 0.5) * 0.5, 0.0, 1.0);
  vec3 col = mix(uMid, uHot, smoothstep(0.6, 0.98, heat));
  col = mix(uCold, col, smoothstep(0.12, 0.6, heat));
  col += uHot * rim * 0.65;
  col *= 1.08;
  col = mix(vec3(1.0, 0.95, 0.85), col, 1.0 - uHurt * 0.45); // flash de dano
  // alfa do antigo (base densa → topo translúcido), com a barra do chão podada
  float a = (0.82 + 0.35 * vN1) * (1.0 - 0.62 * smoothstep(0.5, 1.1, vH));
  a *= smoothstep(0.015, 0.12, vH);
  a *= uAlpha;
  if (!(a > 0.004)) discard; // discard invertido: NaN nunca escreve (lição WebKit)
  gl_FragColor = vec4(col, a);
}
`;

const tmpWorld = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));

/**
 * Esqueleto em código (o GLB não traz nenhum): `root → spine → head →
 * hair0 → hair1`. As juntas calcam nos marcos do modelo (bbox y −1.00..+0.97):
 * base do corpo, coração da bolota, topo da cara, raiz da crina e meio da
 * crina — a ponta final fica livre para o follow-through.
 */
const JOINT_Y = [-1.0, -0.15, 0.3, 0.42, 0.72];

/**
 * Pesos de pele POR FAIXA DE Y (2 influências por vértice, rampas suaves —
 * sem costuras duras). Uma vez por geometria (`userData` guarda o pino); as
 * instâncias compartilham os atributos, cada uma anima o PRÓPRIO esqueleto.
 * Abaixo de 0.28 o rosto nunca herda nada da crina (os olhos ficam firmes).
 */
function ensureSkin(geo: THREE.BufferGeometry): void {
  if (geo.userData.ignisSkin) return;
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
      a = 2; b = 3; w = band(y, 0.28, 0.44); // Head → Hair0
    } else {
      a = 3; b = 4; w = band(y, 0.5, 0.8); // Hair0 → Hair1 (ponta = 1.0)
    }
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    wgt[i * 4] = 1 - w;
    wgt[i * 4 + 1] = w;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.ignisSkin = true;
}

/**
 * Dispatcher do Ignis: Nv.1 = malha importada; Nv.2..5 = FlameRig (a silhueta
 * procedural continua a estrela da progressão faísca → dragão).
 */
export function IgnisRig(props: FlameRigProps) {
  const level = clampLevel(props.level);
  if (level === 1) {
    // enquanto o GLB (2,4 MB) carrega, a faísca antiga segura o palco
    return (
      <Suspense fallback={<FlameRig {...props} level={1} />}>
        <FireLvl1MeshRig {...props} level={1} />
      </Suspense>
    );
  }
  return <FlameRig {...props} level={level} />;
}

/** malha Nv.1 pura — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function FireLvl1MeshRig({
  seed,
  unitId,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: FlameRigProps) {
  useGLTF.preload(fireLvl1Url);
  const { scene } = useGLTF(fireLvl1Url);

  // a malha + a textura da fonte (o geometry é COMPARTILHADO entre instâncias;
  // só o material é por unidade, para dano/flicker não vazarem entre os bichos)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error('fire_model_lvl1.glb não tem mesh');
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    const tex = (meshes[0].material as THREE.MeshStandardMaterial).map;
    return { geo, tex };
  }, [scene]);

  // encaixe autoral: altura = formTop Nv.1, base no chão (y=0), centro do
  // corpo no eixo do rig; o offset compensa a rotação de rumo (matriz T·R·S)
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const s = TOP_LVL1 / (bb.max.y - bb.min.y);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(MODEL_YAW) + cz * Math.sin(MODEL_YAW));
    const pz = cx * Math.sin(MODEL_YAW) - cz * Math.cos(MODEL_YAW);
    return { s, pos: [px, -bb.min.y * s, pz] as [number, number, number] };
  }, [src]);

  // material por instância: textura do GLB + brasa emissiva + ondulação de
  // chama via onBeforeCompile (o MESMO ruído de flameShaders.ts)
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.8,
      metalness: 0,
      emissive: EMISSIVE_BASE.clone(),
      emissiveMap: src.tex,
      emissiveIntensity: 1.0,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: 0.06 };
      sh.uniforms.uFSeed = { value: seed };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSeed;\nvarying float vHair;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // CRINA DE FOGO (comportamento de chama, não "gelatina"):
          // y<0.42 é sólido (rosto/olhos nunca tremem); de 0.42 ao topo (0.97),
          // cada ponta do leque TEM FASE PRÓPRIA — molleja, alonga/encurta e
          // acende fora de fase, como línguas de fogo numa vela.
          float h = clamp((transformed.y - 0.42) / 0.55, 0.0, 1.0);
          float w = h * h; // raiz plantada na cabeça, pontas livres
          float ph = atan(transformed.z, transformed.x) * 1.3 + transformed.y * 2.0 + uFSeed;
          // mollejo lateral (dois harmônicos — senão vira metrônomo)
          transformed.x += (sin(uFT * 6.1 + ph) * 0.6 + sin(uFT * 11.7 + ph * 2.6) * 0.3) * uFA * 2.2 * w;
          transformed.z += (cos(uFT * 5.3 + ph * 1.6) * 0.55 + sin(uFT * 9.9 + ph * 0.8) * 0.25) * uFA * 2.2 * w;
          // línguas de fogo: a ponta alonga e encolhe (onda subindo pela crina)
          float tongue = sin(uFT * 7.4 + ph * 3.4) * 0.5
            + fbm(vec3(transformed.x * 7.0, transformed.y * 5.0 - uFT * 5.0, transformed.z * 7.0) + uFSeed) - 0.4;
          transformed.y = 0.42 + (transformed.y - 0.42) * (1.0 + uFA * 3.4 * w * tongue);
          // as pontas dobram para dentro/para fora do eixo (chama respirando)
          vec2 radial = length(transformed.xz) > 1e-4 ? normalize(vec2(transformed.x, transformed.z)) : vec2(0.0);
          transformed.xz += radial * uFA * 1.5 * w * sin(uFT * 4.6 + ph);
          // grão de brasa na superfície INTEIRA correndo para cima: é isso que
          // faz o corpo parecer plasma, não uma bola pintada (o antigo fervia
          // o corpo todo no shader; aqui o corpo ferve menos que a crina)
          float fn = fbm(transformed * 3.6 + vec3(0.0, -uFT * 2.6, 0.0) + uFSeed);
          transformed += objectNormal * (fn - 0.5) * uFA * (0.9 + 1.9 * h);
          vHair = h * max(0.0, 0.5 + 0.7 * tongue); // brasa que pisca na ponta`,
        );
      sh.fragmentShader =
        'varying float vHair;\n' +
        sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance *= 1.0 + 1.1 * vHair;`,
        );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed]);

  // ESQUELETO POR INSTÂNCIA: a geometria (com os pesos de `ensureSkin`) é
  // compartilhada, mas os ossos e a animação são privados de cada unidade —
  // dois Ignis Nv.1 em cena nunca dançam sincronizados.
  const rig = useMemo(() => {
    ensureSkin(src.geo);
    const mk = (name: string, y: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, y, 0);
      return b;
    };
    // juntas absolutas (JOINT_Y) viram offsets locais na cadeia
    const root = mk('root', JOINT_Y[0]);
    const spine = mk('spine', JOINT_Y[1] - JOINT_Y[0]);
    const head = mk('head', JOINT_Y[2] - JOINT_Y[1]);
    const hair0 = mk('hair0', JOINT_Y[3] - JOINT_Y[2]);
    const hair1 = mk('hair1', JOINT_Y[4] - JOINT_Y[3]);
    root.add(spine);
    spine.add(head);
    head.add(hair0);
    hair0.add(hair1);
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, spine, head, hair0, hair1]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // crina + shader viajam além da esfera da malha
    return { skinned, bones: { root, spine, head, hair0, hair1 } };
  }, [src, body]);

  // brasas subindo + clarão + fuligem: o mesmo idioma visual do FlameRig
  const ember = useMemo(
    () =>
      makeEmberParticles({
        count: 12 + LEVEL_1 * 8,
        emberScale,
        level: LEVEL_1,
        topY: TOP_LVL1,
      }),
    [emberScale],
  );

  // INVOLTÓRIO: a casca de chama do antigo (shader próprio acima, mesmo
  // ROLE_LOOK do FlameRig) por cima da textura — um material por unidade
  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: 0.11 },
          uSeed: { value: seed },
          uHurt: { value: 0 },
          uAlpha: { value: 0.55 },
          uCold: { value: new THREE.Color(ROLE_LOOK.body!.cold) },
          uMid: { value: new THREE.Color(ROLE_LOOK.body!.mid) },
          uHot: { value: new THREE.Color(ROLE_LOOK.body!.hot) },
        },
      }),
    [seed],
  );

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      shellMat.dispose();
      rig.skinned.skeleton?.dispose();
      ember.geo.dispose();
      ember.mat.dispose();
    },
    [body, shellMat, rig, ember],
  );

  const animRef = useRef<THREE.Group>(null!);
  const shellRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sootAcc = useRef(0);

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

    // estado da unidade no motor (dano, HP, morte) — os mesmos canais do FlameRig
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
      if (demoT.current > 0.45) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // ---- ossos vivos: a respiração ENCHE a barriga (spine infla e o resto
    // afunda), a cabeça ATRASA o lean e a crina é amostrada NO PASSADO — o
    // follow-through que escala de grupo nenhum faz (dois atrasos de cadeia) ----
    // ---- VOLUMETRIA DO FOGUINHO: o stretch é a FÓRMULA EXATA do FlameRig
    // (flick de 3 harmônicos + surge lento) — no modelo importado isso mora no
    // osso SPINE: o corpo inteiro infla/espreme em alta frequência e o topo
    // afunda em contrafase, igual ao figurino de chamas pulsando ----
    const flick =
      Math.sin(t * 5.7 + seed) * 0.55 +
      Math.sin(t * 11.9 + 3.1) * 0.3 +
      Math.sin(t * 2.3 + seed * 0.7) * 0.15;
    const surge = Math.max(0, Math.sin(t * 0.9 + seed) * 1.6 - 0.65) * 0.13;
    const stretch = 1 + flick * 0.085 + surge + pose.flare * 0.1;
    const lagA = attackPose(sinceAttack - 0.07);
    const lagB = attackPose(sinceAttack - 0.14);
    const b = rig.bones;
    const hpDip = 0.8 + 0.2 * hpFrac; // machucado encolhe/murcha
    const wilt = (1 - alpha) * 0.9; // morte: cabeça e pontas murcham
    const sy = stretch * hpDip * (1 - hurt * 0.07) * (1 - wilt * 0.55);
    b.spine.scale.set(1 - (stretch - 1) * 0.55, sy, 1 - (stretch - 1) * 0.55);
    // cambalear idêntico ao FlameRig (os mesmos dois harmônicos de eixo)
    b.spine.rotation.z = Math.sin(t * 1.8 + seed) * 0.07 + Math.sin(t * 4.7 + 1.1) * 0.03;
    b.spine.rotation.x = Math.sin(t * 2.2 + seed) * 0.045 + pose.lean * 0.85;
    b.root.position.y = JOINT_Y[0] + Math.sin(t * 2.6 + seed * 1.3) * 0.05 + surge * 0.7;
    b.head.rotation.x =
      Math.sin(t * 1.9 + seed * 0.7) * 0.06 + pose.lean * 0.45 - hurt * 0.18 + wilt * 0.6;
    b.head.rotation.z = Math.sin(t * 1.25 + seed * 0.4) * 0.05;
    // crina arrasta atrás do corpo e CHICOTEIA no arremesso (swing amostrado
    // 1/8 de segundo depois — o estalo que a gelatina nunca teve)
    b.hair0.rotation.x = lagA.lean * 0.5 + lagA.swing * 0.25 + Math.sin(t * 1.7 + seed) * 0.04 + wilt * 0.5;
    b.hair0.rotation.z = Math.sin(t * 1.35 + seed * 0.6) * 0.05;
    b.hair1.rotation.x = lagB.lean * 0.35 + lagB.swing * 0.55 + Math.sin(t * 2.05 + seed * 1.6) * 0.07 + wilt * 0.7;
    b.hair1.rotation.z = Math.sin(t * 1.45 + seed * 0.9) * 0.08;
    b.hair1.scale.y = (1 + lagA.flare * 0.22 + flick * 0.06) * (1 - wilt * 0.35);
    // o invólucro cola no beat do SPINE (pulso + lean) — skinning aproximado:
    // a casca acompanha a barriga que espreme sem precisar de ossos próprios
    const env = shellRef.current;
    if (env) {
      env.scale.set(1 - (stretch - 1) * 0.55, sy, 1 - (stretch - 1) * 0.55);
      env.rotation.set(b.spine.rotation.x, 0, b.spine.rotation.z);
    }
    shellMat.uniforms.uTime.value = t;
    shellMat.uniforms.uHurt.value = hurt;
    shellMat.uniforms.uAmp.value =
      0.11 * (0.62 + 0.38 * hpFrac) * (1 + pose.flare * 0.6) * (1 + hurt * 0.4) * (1 - wilt * 0.6);
    shellMat.uniforms.uAlpha.value = Math.max(0, (0.55 + flick * 0.07 + pose.flare * 0.25) * alpha);
    g.position.z = pose.stepZ;

    // ---- vida no material: ondulação + brasa emissiva + flash de dano ----
    const sh = body.userData.shader as
      | { uniforms: { uFT: { value: number }; uFA: { value: number } } }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      // fervor acompanha HP/fraca, estouro do arremesso e dano (o mesmo
      // ampMul do FlameRig: fogo ferido ferve diferente, fogo cheio ferve mais)
      sh.uniforms.uFA.value =
        0.06 * (0.7 + 0.3 * hpFrac) * (1 + pose.flare * 1.2 + hurt * 0.6);
    }
    body.emissiveIntensity = Math.max(
      0,
      (1.0 + flick * 0.18 + pose.flare * 0.9 + hurt * 1.2) * (0.7 + 0.3 * hpFrac) * alpha,
    );
    body.emissive
      .copy(EMISSIVE_BASE)
      .lerp(EMISSIVE_FLASH, Math.min(1, hurt * 0.8 + pose.flare * 0.3));

    ember.mat.uniforms.uTime.value = t;
    ember.mat.uniforms.uAlpha.value = alpha;

    // ---- fuligem do corpo (pool compartilhado com a trilha de fogo) ----
    if (smoke && alpha > 0.25) {
      sootAcc.current += dt * (2.2 + 2.7 * LEVEL_1);
      let guard = 0;
      while (sootAcc.current >= 1 && guard < 4) {
        sootAcc.current -= 1;
        guard++;
        g.updateWorldMatrix(true, false);
        // sai da coluna sobre a cabeça: altura entre 45% e 105% do topo
        tmpWorld
          .set(
            (Math.random() - 0.5) * (0.4 + LEVEL_1 * 0.16),
            TOP_LVL1 * (0.45 + Math.random() * 0.6),
            (Math.random() - 0.5) * (0.4 + LEVEL_1 * 0.16) - 0.15,
          )
          .applyMatrix4(g.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.055 + 0.016 * LEVEL_1,
          heat: 0.35 + Math.random() * 0.3,
          life: 1.0 + LEVEL_1 * 0.08,
          lifeVar: 0.5,
          jitter: 0.14,
          rise: 0.55,
          drag: 2.4,
        });
      }
      if (sootAcc.current > 4) sootAcc.current = 4;
    }

    // ---- clarão quente (carrega no arremesso como o FlameRig) ----
    const s2 = Math.max(0.6, 1.78 + flick * 0.3 + hurt * 0.5 + pose.flare * 0.7);
    glow.scale.setScalar(s2);
    glow.position.y = TOP_LVL1 * 0.5;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.24 + flick * 0.08 + hurt * 0.2 + pose.flare * 0.3) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={MODEL_YAW} scale={fit.s}>
        <primitive object={rig.skinned} />
        {/* pivô no joelho do spine: a casca espreme/inclina junto do corpo */}
        <group ref={shellRef} position={[0, JOINT_Y[1], 0]}>
          <mesh
            geometry={src.geo}
            material={shellMat}
            position={[0, -JOINT_Y[1], 0]}
            frustumCulled={false}
          />
        </group>
      </group>
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
