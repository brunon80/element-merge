import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeSteamMaterial } from './steamShaders';
import { makeIceMaterial } from './iceShaders';
import { makeCoreMaterial } from './lightningShaders';
import { arenaEnvTexture, captureArenaEnv } from './envProbe';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig da NÉVOA (Nv.7 — o ESPECTRO DA BRUMA), gelo+vapor. Zero shader novo:
 * nuvem fria = steamShaders lido em paleta GLACIAL (o oposto térmico do
 * Vapor: aqui o frio mora em BAIXO — a poça de geada — e a nuvem clareia
 * subindo), máscara/icicles/gotas = iceShaders do Gelo em duas fornadas
 * (ardósia p/ a máscara, gelo claro p/ os accels) com o MESMO reflexo real da
 * arena (envProbe), e o coração congelado = makeCoreMaterial repaletado para
 * o frio (não-aditivo — gelo que brilha por dentro, nunca bola de luz).
 *
 * Figurino:
 *  1. PLANTADO NA POÇA: o espectro nasce de uma poça de geada no tabuleiro
 *     (ico achatado sub 2 + halo raso de bruma + saia rasteira); a cauda é um
 *     funil de névoa que alarga do fiapo (r 0,18) até o manto — a física do
 *     gênio invertida para o frio (o grão escorre, a bruma POUSA);
 *  2. MANTO DUPLA-CASCA de nuvem fria (ico sub 2, amp 0,04–0,055 — lombada de
 *     nuvem, não espinho) com ombros largos; capuz com a MÁSCARA de gelo-
 *     ardósia Aparafusada na frente (peça de face sai da superfície — a regra
 *     da fortaleza) e os olhos fendados claros na máscara escura (contrast:
 *     claro sobre escuro, como as manchas solares do Plasma);
 *  3. CORES: identidade #cfe6ee (a geada vitrificada do motor) nos veios da
 *     máscara, nas gretas dos icicles, nos anéis do FX e no coração.
 *
 * Coreografia (expelir a bruma): o espectro ASPIRA o ar (manto contrai,
 * garras recolhem, coroa eriça, o coração congela acendendo os veios) e no
 * disparo ele SOLTA O BAFO: manto estufa, garras varrem, a nuvem INTEIRA
 * clareia (uCharge no vapor frio) e uma onda de bruma densa sai da máscara.
 * Morte = o espectro SE DESMANCHA em névoa (amp sobe, alfa some — a nuvem
 * arreenta igual a caldeira do Vapor, mas para o frio).
 */

export const NEVOA_ATTACK_WINDOW = 0.66;
/** fração da janela em que o espectro aspira o ar (coração acende) */
export const NEVOA_WINDUP = 0.45;
/** a GEADA da espécie: uma cor só entre motor, veios do gelo, pluma e FX */
export const NEVOA_FROST = '#cfe6ee';

const NEVOA_DEF = getSpecies('nevoa');

/** peito do espectro (coração congelado na fresta do manto) */
const HEART_Y = 2.5;

export interface AttackPose {
  twist: number; // o manto torce torcendo o ar
  gather: number; // negativo = manto contrai aspirando; positivo = estufa no bafo
  swing: number; // garras (negativo = recuam, positivo = varrem para frente)
  charge: number; // 0..1: coração acende, veios de gelo inflam, nuvem clareia
  lift: number; // o espectro SE ERGUER na inspiração (o fôlego puxa o corpo)
  stepZ: number; // empurra o espectro para frente no bafo
  flare: number; // coroa e ombreiras eriçam
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, gather: 0, swing: 0, charge: 0, lift: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > NEVOA_ATTACK_WINDOW) return P;
  const p = since / NEVOA_ATTACK_WINDOW;
  if (p < NEVOA_WINDUP) {
    // a aspiração é lenta e SEGURA o pico (o silêncio antes do bafo)
    const k = (p / NEVOA_WINDUP) ** 1.2;
    P.twist = -0.22 * k;
    P.gather = -0.95 * k;
    P.swing = -0.85 * k;
    P.charge = k;
    P.lift = k;
    P.stepZ = -0.05 * k;
    P.flare = 0.7 * k;
    return P;
  }
  const r = (p - NEVOA_WINDUP) / (1 - NEVOA_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.24)) ** 2; // o bafo ESCANCARA quase junto
  const decay = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (-0.22 + 0.55 * a) * decay;
  P.gather = (-0.95 + 2.25 * a) * decay; // de contraído a estufado (a nuvem exala)
  P.swing = (-0.85 + 2.2 * a) * decay;
  P.charge = Math.max(0, 1 - 1.5 * r) * decay;
  P.lift = (1 - 1.35 * a) * decay;
  P.stepZ = (-0.05 + 0.34 * a) * decay;
  P.flare = (0.7 + 0.6 * a) * decay;
  return P;
}

/** nuvem FRIA: o gradiente térmico invertido — embaixo mora a geada (azul
 *  denso da poça), em cima o fiapo quase branco. uHot (carga) é PÁLIDO, nunca
 *  #fff (o mix do frag acontece antes da luz ×2,4 e as cascas empilham).
 *  A TÚNICA (robe) é a peça mais opaca (o corpo do espectro); o funil da
 *  GARMA é casca oca — vista de lado o caminho óptico DOBRA, então alfa alto
 *  fechava como tinta preta: fica raso (0,4) e rasgado em fiapos (swirl alto) */
export const CLOUD_LOOK: Record<string, { cool: string; warm: string; hot: string; alpha: number; swirl: number }> = {
  steam: { cool: '#eef5fb', warm: '#c3d8e6', hot: NEVOA_FROST, alpha: 0.93, swirl: 0.5 },
  body: { cool: '#eef5fb', warm: '#c3d8e6', hot: NEVOA_FROST, alpha: 0.93, swirl: 0.5 },
  // TÚNICA: alfa no TETO do shader (o clamp é 0,94; den médio do ruído ~0,65
  // come o resto) + uCharge de base 0,35 (o "frio aceso" permanente — o
  // multiplcador (1+charge*0,25) leva a régua a ~1,0 no tronco). O fiapo vem
  // do DESLOCAMENTO (amp 0,11), não de buracos no alfa: swirl alto abria a
  // "gelatina de vidro" e dava pra ver a cloaca do sino pelo tecido
  robe: { cool: '#e8f1f8', warm: '#b9d0e0', hot: NEVOA_FROST, alpha: 0.94, swirl: 0.7 },
  armveil: { cool: '#eef5fb', warm: '#c3d8e6', hot: NEVOA_FROST, alpha: 0.4, swirl: 1.3 },
  trans: { cool: '#dfeaf2', warm: '#aec8d8', hot: NEVOA_FROST, alpha: 0.3, swirl: 0.85 },
};

/** as duas fornadas de gelo da espécie: a MÁSCARA (breu-ardósia, o rosto lê
 *  por specular/veios — a regra do vidro negro) e os ACCENTS (gelo claro de
 *  icicle, quase branco, trincas da MESMA geada #cfe6ee) */
export const MASK_LOOK = {
  iceA: '#5c7488', // slate MÉDIO: breu absoluto virava cartucho (o rosto lê
  iceB: '#2c3a48', // pela trama de trincas + specular, não pelo preto puro)
  crack: NEVOA_FROST,
  amp: 0.016,
  crackGlow: 0.7,
  crackScale: 3.4, // trama CURTA e densa no rosto (traço fino de gelado)
  crackWidth: 0.045,
  alpha: 0.95,
  bump: 1.1,
  reflPow: 110,
  envMix: 0.22, // face opaca: reflexo contido (0,4 vitrificava a máscara)
  sparkle: 0.5,
};
export const ICE_LOOK = {
  iceA: '#d7e6f2',
  iceB: '#9fbdd2',
  crack: NEVOA_FROST,
  amp: 0.02,
  crackGlow: 1.1,
  crackScale: 2.6,
  crackWidth: 0.05,
  alpha: 0.85,
  bump: 1.1,
  reflPow: 130,
  envMix: 0.5,
  sparkle: 1.2,
};

/** nuvem/gelo leem aSeed por peça; shared com o CrystalRig (o mesmo padrão de motes) */
export function makeMoteGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x9e3779b9 ^ (n * 2654435761);
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface NevoaRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** flocos/geada caindo ao redor do manto */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a Névoa NÃO o usa: o smokePool é grafite-fuligem
   *  (frio não suja, só geada); a vazão da bruma são os motes + os véus */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function NevoaRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
}: NevoaRigProps) {
  const modelDef = MODELS.nevoa;
  const level = Math.max(
    NEVOA_DEF.levelMin,
    Math.min(NEVOA_DEF.levelMax, Math.round(levelProp ?? NEVOA_DEF.levelMin)),
  );
  const moteCount = embers ?? 24;
  const topY = formTop(NEVOA_DEF, level);

  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const heartRef = useRef<THREE.Mesh>(null!);
  const heartGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const envShot = useRef(false);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    const spikes: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
      else if (p.tag === 'spike') spikes.push({ i, side, base });
    });
    return { arms, spikes };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // olhos FENDADOS miúdos: branco SEM bloom (emissivo baixo — o anel
    // emissivo forte virava cartucho de sorvete) sobre a máscara escura, com
    // o kernel glacial no centro da fenda (claro sobre escuro — a regra do
    // contraste; olho escuro na nuvem clara sumiria)
    const eye = new THREE.MeshStandardMaterial({
      color: '#dfe9f2',
      emissive: '#cfe6ee',
      emissiveIntensity: 0.4,
      roughness: 0.35,
      flatShading: true,
    });
    const slit = new THREE.MeshBasicMaterial({ color: '#eef7fb' });
    const cache = new Map<string, THREE.Material>();
    const ices: THREE.ShaderMaterial[] = [];
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'glow') return slit;
      if (p.m === 'black') return slit;
      if (p.m === 'steam' || p.m === 'trans' || p.m === 'robe' || p.m === 'armveil') {
        const look = CLOUD_LOOK[p.m] ?? CLOUD_LOOK.steam!;
        // o anel do chão é mais raso que a poça/saia (nunca placa — a lição
        // da geada do Gelo); peças iguais compartilham o material. As três
        // cascas da TÚNICA compartilham de propósito (mesmo ruído, alfa no
        // teto): é o que fecha o corpo em volume denso de frente
        const thin = p.g === 'ring';
        const key = p.m === 'robe'
          ? 'S|robe'
          : `S|${p.m}|${thin ? 'r' : 'p'}|${Math.round(p.p[1] * 100)}|${i % 3}`;
        let m = cache.get(key);
        if (!m) {
          m = makeSteamMaterial({
            cool: look.cool,
            warm: look.warm,
            hot: look.hot,
            amp: p.m === 'robe' ? 0.09 : p.amp ?? 0.045,
            alpha: thin ? 0.16 : look.alpha,
            swirl: look.swirl,
            hotY: 1.1, // o frio denso MORA embaixo (a poça), não o fogo
            seed: seed + (i % 3) * 3.3,
            breath: p.tag === 'arm' || p.tag === 'spike' ? 0.4 : 1,
          });
          if (p.m === 'robe') m.userData.robe = true;
          cache.set(key, m);
        }
        return m;
      }
      const look = p.m === 'dark' ? MASK_LOOK : p.m === 'accent' ? ICE_LOOK : ICE_LOOK;
      // anéis rentes ao chão: reflexo e brilho CORTADOS (peça de chão nunca
      // é espelho — a lição da geada) e miúdos: o halo é véu fino de gelo
      const ground = p.g === 'ring' || (p.m === 'accent' && p.p[1] < 0.25);
      const key = `I|${p.m}|${p.amp ?? look.amp}|${ground ? 'g' : 'n'}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key) as THREE.ShaderMaterial | undefined;
      if (!m) {
        m = makeIceMaterial({
          iceA: look.iceA,
          iceB: look.iceB,
          crack: look.crack,
          amp: p.amp ?? look.amp,
          crackGlow: look.crackGlow,
          crackScale: look.crackScale,
          crackWidth: look.crackWidth,
          alpha: p.g === 'ring' ? 0.5 : look.alpha,
          bump: look.bump,
          reflPow: look.reflPow,
          envMix: ground ? 0.12 : look.envMix,
          sparkle: ground ? 0.4 : look.sparkle,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' || p.tag === 'spike' ? 0.4 : 1,
        });
        cache.set(key, m);
        ices.push(m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), eye, slit],
      shaders: [...cache.values()] as THREE.ShaderMaterial[],
      ices,
    };
  }, [visParts, seed, level]);

  // coração congelado na fresta do peito: o core do Raio lido para o FRIO
  // (geada #cfe6ee por dentro, orla ardósia — nunca aditivo, nunca branco
  // puro; gelo acende por dentro como brasa, essa é a assinatura da espécie)
  const heart = useMemo(
    () => ({
      geo: new THREE.IcosahedronGeometry(0.22, 2), // denso (anti low-poly)
      mat: makeCoreMaterial({
        gold: '#cfe6ee', // a geada do motor (= cor do projétil/FX — identidade)
        white: '#eef7fb', // miolo glacial (fora do branco-puro do flash)
        cool: '#44607a', // orla ardósia gelada (o gelo brilha POR DENTRO)
        amp: 0.05,
        seed: 5.8,
      }),
    }),
    [],
  );

  // flocos de geada CAINDO ao redor do manto (o oposto do vapor do Vapor:
  // o frio desce; derivam em espiral larga e estreita — neve pousando)
  const motes = useMemo(() => {
    const geo = makeMoteGeo(moteCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
      },
    });
    return { geo, mat };
  }, [moteCount, emberScale]);

  // nuvem/gelo leem aSeed por peça; clonamos só as que os usam
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
      heart.geo.dispose();
      heart.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, heart, motes]);

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
      if (demoT.current > NEVOA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);

    // A NÉVOA NÃO USA FUMAÇA DO POOL: o smokePool é grafite-fuligem (o
    // shader pinta (0,42,0,38,0,36) mesmo com heat 0) e os "puffs" frios
    // manchavam a poça branca de cinza (o print pegou a poça suja). A
    // vazão da bruma são os MOTES de geada caindo + os véus da túnica;
    // o bafo é a própria pluma do projétil. Frio não suja — só geada.

    // ---- uniforms: nuvem fria + gelo + coração no mesmo loop ----
    const coldBreath =
      Math.sin(t * 0.5 + seed) * 0.5 +
      Math.sin(t * 1.1 + seed * 0.7) * 0.3 +
      Math.sin(t * 2.3 + 1.1) * 0.2; // a bruma respira devagar (o frio é lento)
    const crumble = 1 - alpha; // morrendo: o espectro SE DESMANCHA em névoa
    for (const m of partMats.shaders) {
      const isSteam = !!m.uniforms.uSwirl;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
      m.userData.baseAmp = baseAmp;
      const baseAlpha = (m.userData.baseAlpha as number | undefined) ??
        (m.uniforms.uAlpha ? m.uniforms.uAlpha.value : 1);
      m.userData.baseAlpha = baseAlpha;
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * (isSteam ? 1 : 0.5); // gelo escuro: flash cortado
      // nuvem: uCharge de base 0,3 (o frio aceso permanente empurra o alfa
      // para o teto — sem isso den*alpha ~0,65 e o corpo fica vidro); gelo:
      // veios inflam só na aspiração
      const coldBase = !isSteam
        ? 0
        : m.userData.robe
          ? 0.55 // túnica: frio aceso forte — fecha o volume no teto do alfa
          : (m.userData.baseAlpha as number) > 0.5
            ? 0.3
            : 0;
      m.uniforms.uCharge.value = Math.min(
        1,
        pose.charge + coldBase + crumble * (isSteam ? 0.85 : 0.5),
      );
      m.uniforms.uBreath.value = coldBreath * (0.6 + 0.4 * hpFrac);
      m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.12 + crumble * (isSteam ? 3.1 : 1.8));
      if (m.uniforms.uAlpha) m.uniforms.uAlpha.value = baseAlpha * Math.max(0, alpha);
    }
    // coração congelado: acende os veios internos na aspiração, escura no bafo
    heart.mat.uniforms.uTime.value = t;
    heart.mat.uniforms.uCharge.value = pose.charge;
    heart.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const chill = 0.96 + 0.05 * Math.sin(t * 2.2 + seed) + pose.charge * 0.14;
    heartRef.current.scale.setScalar(chill);
    heartRef.current.rotation.y += dt * (0.25 + pose.charge * 1.6);
    const glow = heartGlowRef.current;
    glow.scale.setScalar(Math.max(0.5, 0.55 + pose.charge * 0.5));
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.04 + 0.02 * Math.sin(t * 1.9 + seed) + pose.charge * 0.09) * alpha,
    );
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = pose.charge;

    // reflexo REAL nos gelos do espectro (o mesmo tiro único do Gelo; se o
    // Gelo já capturou neste contexto, só plugamos)
    if (!envShot.current) {
      envShot.current = true;
      let envTex = arenaEnvTexture(gl);
      if (!envTex) {
        const root = rootRef.current;
        root.visible = false; // tiro limpo: nada de blob próprio no cubemap
        root.updateWorldMatrix(true, false);
        tmpWorld.set(0, 2.2, 0).applyMatrix4(root.matrixWorld);
        envTex = captureArenaEnv(gl, scene, tmpWorld);
        root.visible = true;
      }
      for (const w of partMats.ices) w.uniforms.uEnv.value = envTex;
    }

    // ---- corpo: flutuação presa ao chão pela cauda (o espectro NÃO voa) ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.35 + seed) * 0.02 + Math.sin(t * 0.8 + 1.7) * 0.007;
    const breathe = Math.sin(t * 0.8 + seed) * 0.012;
    g.scale.set(
      1 + pose.gather * 0.06 + breathe * 0.3,
      1 - pose.gather * 0.025 + pose.lift * 0.045 + breathe,
      1 + pose.gather * 0.06 + breathe * 0.3,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.3 + seed * 0.6) * 0.01;
    g.rotation.x = pose.lift * 0.03 - pose.twist * 0.06;
    // levita 4 cm (a cauda-funil continua plantada na poça — o funil longo
    // disfarça o vão); na inspiração o fôlego ergue o corpo mais 6 cm
    g.position.y = 0.04 + Math.sin(t * 0.62 + seed) * 0.03 + pose.lift * 0.06;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (gotas congeladas circundando o manto) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)];
    }

    // ---- peças: garras varrem, coroa eriça, gotas cintilam ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      const spike = actors.spikes.find((x) => x.i === i);

      if (arm) {
        // garra de bruma: recolhe juntando o frio e VARRE no bafo
        mesh.rotation.x = base[0] - pose.swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.3;
        sc *= 1 + pose.charge * 0.4;
      } else if (spike) {
        // icicles da coroa: eriçam na inspiração e apontam no bafo
        const shimmer = Math.sin(t * (0.9 + (i % 3) * 0.25) + i * 1.7) * 0.03;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.22));
        sc *= 1 + pose.flare * 0.08;
      }

      if (part.flick && !arm && !spike) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 1.9 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
    }
    void topY; // topo amarrado nos testes; forma única Nv.7
  });

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => {
        const mesh = (
          <mesh
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            // só o GELO e a máscara projetam sombra: o depth map do shadow
            // map ignora alfa — nuvem/funil translúcido com castShadow virava
            // disco preto sólido (a casca do funil projetava a própria silhueta)
            castShadow={part.m === 'accent' || part.m === 'dark'}
          />
        );
        if (part.group !== undefined && modelDef.groups?.[part.group] !== undefined) {
          return (
            <group
              key={`g${part.group}-${level}-${i}`}
              ref={(gr) => {
                groupRefs.current[part.group!] = gr;
              }}
            >
              {mesh}
            </group>
          );
        }
        return <group key={`${level}-${i}`}>{mesh}</group>;
      })}
      {/* o coração congelado na fresta do manto: MIÚDO e encaixado no peito
          (o disco pálido grande lia como carimbo — gelo bom é pedra dura que
          brilha por dentro, não carimbo); halo mínimo, só respira na aspiração */}
      <mesh
        ref={heartRef}
        geometry={heart.geo}
        material={heart.mat}
        position={[0, HEART_Y, 0.66]}
        castShadow
      />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite ref={heartGlowRef} position={[0, HEART_Y + 0.08, 0.78]} scale={0.3}>
        <spriteMaterial
          map={circleTexture()}
          color="#cfe6ee"
          transparent
          opacity={0.04}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Flocos de geada que DESCEM do manto e pousam (o frio caído): caem tortos
 * em deriva larga, girando no próprio eixo de deriva, e esfriam do branco
 * quase puro (recém-soltos) para o azul-geada (perto do chão). uCharge
 * acelera a queda no bafo (o espectro exala neve).
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.3 + 0.3 * aRand.z;
  float prog = fract(uTime * speed * 0.22 * (1.0 + uCharge * 0.9) + aRand.y);
  // deriva torto-espiral em torno da coluna do manto (raio cresce descendo)
  float ang = aRand.x * 6.28318 - prog * (0.8 + 1.8 * aRand.z) + uTime * 0.12;
  float r = 0.55 + prog * (0.55 + 0.75 * aRand.z);
  float y = 4.2 - prog * (3.6 + 0.8 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // floco pequeno e SECO (não o puff fofo do vapor quente)
  float size = (4.0 + 6.0 * aRand.z) * (0.8 + uCharge * 0.5) * uSizeMul * (0.7 + prog * 0.5);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce do manto e morre pousando na poça
  vA = smoothstep(0.0, 0.1, prog) * (1.0 - smoothstep(0.55, 1.0, prog)) * uAlpha;
  // esfriando: branco glacial -> azul-geada perto do chão
  vC = mix(vec3(0.95, 0.98, 1.0), vec3(0.72, 0.83, 0.92), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // floco duro-miúdo com halo mínimo (o contrário do fiapo macio do vapor)
  float m = smoothstep(0.5, 0.28, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.5);
}
`;
