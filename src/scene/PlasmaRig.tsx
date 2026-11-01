import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeStoneMaterial } from './stoneShaders';
import { makeSteamMaterial } from './steamShaders';
import { makeCoreMaterial } from './lightningShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do PLASMA (Nv.7 — fogo+ar+terra: a ESTRELA DE BOLSO), o canhão plantado
 * da árvore: um sol em miniatura acorrentado a uma forja. Zero shader novo de
 * propósito — cada material é uma família que a árvore já aprovou, lido na
 * paleta da estrela:
 *
 *  1. O NÚCLEO (role 'glow'): o plasma do Raio (`makeCoreMaterial`) lido em
 *     ROSA-VITRÍOLO (#ff9ef5) — ferve sozinho (fbm), e a carga do tiro enche a
 *     estrela. NÃO-ADITIVO: a assinatura é o albedo incandescente, não halo;
 *  2. A GAIOLA (roles 'body'/'dark'/'accent'): o `stoneShaders` do golem lido
 *     como FERRO FORJADO — bigorna da base, três garfos, anéis de contenção.
 *     O veio do magma vira a COSTURA ENERGÉTICA rosa do ferro (glow contido:
 *     a lição do Pântano — veio é brasa, não solda elétrica);
 *  3. OS ANÉIS GIRAM: torus simétrico não mostra giro — o rig gira o conjunto
 *     anel+grampos (`part.group`) em torno do normal do anel, e a carga
 *     ACELERA a contenção (o ar/Raio domando a estrela antes do feixe);
 *  4. MANCHAS SOLARES pretas (role 'black'): é isso que vende "sol" — preto
 *     sobre plasma é o único contraste que lê (olho branco sumiria no brilho);
 *  5. O BAFO QUENTE (role 'steam'): `steamShaders` do Vapor — a forja respira
 *     (NUNCA tint da equipe: fumaça não aceita tinta).
 *
 * Regras amarradas: dano NÃO branqueia a estrela (uHurt amortecido; o feedback
 * migra para a COSTURA do ferro e para a fervura do plasma); blowout cortado
 * (o branco nunca é #ffffff); anéis sem tint forte rente ao chão (scorch).
 */

export const PLASMA_ATTACK_WINDOW = 0.48;
/** fração da janela em que a contenção aperta e a estrela encoita (rápida:
 *  plasma é o gatilho mais nervoso da árvore — o tiro é um feixe, não um tomb) */
export const PLASMA_WINDUP = 0.62;

/** a centelha única da espécie: motor = rig = projétil = FX (amarrado em teste) */
export const PLASMA_SPARK = '#ff9ef5';

const PLASMA_DEF = getSpecies('plasma');

interface AttackPose {
  twist: number; // a gaiola destorce (os anéis acumulam torque)
  crouch: number; // a forja afunda no chão quando a estrela puxa para baixo
  bulge: number; // a estrela encovada comprime e ESTUFA na descarga
  bloom: number; // 0..1 os garfos abrem a jaula (negativo = apertam antes do tiro)
  charge: number; // a estrela carregada (núcleo + costuras do ferro)
  stepZ: number; // plantada: empurra só a base
  flare: number; // proeminências esticam, faíscas e bafo alçam
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    crouch: 0,
    bulge: 0,
    bloom: 0,
    charge: 0,
    stepZ: 0,
    flare: 0,
  };
  if (since < 0 || since > PLASMA_ATTACK_WINDOW) return P;
  const p = since / PLASMA_ATTACK_WINDOW;
  if (p < PLASMA_WINDUP) {
    // a contenção APERTA progressivamente (k**1.7: engata devagar e trava no
    // fim) e a estrela encolhe sob a pressão (bulge negativo vira squash)
    const k = (p / PLASMA_WINDUP) ** 1.7;
    P.twist = 0.22 * k;
    P.crouch = 0.5 * k;
    P.bulge = -0.55 * k; // esmagada: a jaula fecha
    P.bloom = -0.6 * k; // os garfos APERTAM a jaula antes de abrir
    P.charge = k;
    P.stepZ = -0.02 * k;
    P.flare = 0.35 * k;
    return P;
  }
  const r = (p - PLASMA_WINDUP) / (1 - PLASMA_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.22)) ** 2; // a descarga é QUASE INSTANTÂNEA
  const decay = 1 - Math.max(0, (r - 0.35) / 0.65);
  P.twist = (0.22 - 0.5 * a) * decay; // a gaiola solta o torque de uma vez
  P.crouch = (0.5 - 0.5 * a) * decay;
  P.bulge = (-0.55 + 1.6 * a) * decay; // a estrela ESTUFA na descarga
  P.bloom = (-0.6 + 1.1 * a) * decay; // os garfos abrem para o feixe sair
  P.charge = Math.max(0, 1 - 1.6 * r) * decay;
  P.stepZ = (-0.02 + 0.1 * a) * decay;
  P.flare = (0.35 + 0.85 * a) * decay;
  return P;
}

// ---------------------------------------------------------------- paletas --

/** FERRO FORJADO da gaiola (role 'body'/'accent'): ferro vivo, nunca cinza de
 *  obra — o breu puxa para o roxo e a costura é a CENTELHA da espécie. Veio
 *  CURTO e denso (a regra do Pântano: crackScale alto = cicatriz de ferro;
 *  escala baixa = rabisco de raio) com glow contido (não é solda elétrica) */
export const CAGE_LOOK = {
  rockA: '#6a6168',
  rockB: '#241d28',
  crack: PLASMA_SPARK,
  crackGlow: 0.5,
  crackScale: 1.9,
  crackWidth: 0.045,
  crackBoost: 0.85,
  speck: 0.15, // lima de ferro: quase cortada
};

/** O FERRO MORTO da bigorna (role 'dark'): mais breu, costura quase apagada —
 *  a forja segura a estrela, quem brilha é a estrela */
export const FORGE_LOOK = {
  rockA: '#3c353c',
  rockB: '#141019',
  crack: PLASMA_SPARK,
  crackGlow: 0.26,
  crackScale: 2.2,
  crackWidth: 0.04,
  crackBoost: 0.8,
  speck: 0.2,
};

/** A ESTRELA (role 'glow'): o plasma do Raio lido em rosa-vitríolo. O miolo
 *  quente é ROSA-CLARO, nunca #ffffff (blowout sempre cortado); a orla é
 *  ameixa queimada (não o azul elétrico do Raio) */
export const CORE_LOOK = {
  gold: PLASMA_SPARK,
  white: '#ffe3f6',
  cool: '#6d2a55',
};

/** o bafo quente da forja (role 'steam'): cinza QUEENTE escuro (o bafo claro
 *  virava bola de neve no print da forja) puxando para o rosa da estrela;
 *  SEM tint de equipe (o steamShaders nem tem uniform de tint) */
export const HEAT_LOOK = {
  cool: '#8f8089',
  warm: '#7d5165',
  hot: '#f0a9cd',
  alpha: 0.38,
  swirl: 0.3,
};

export interface PlasmaRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o plasma usa para a saraivada de faíscas da descarga */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();

/** centro da estrela (o pivô de tudo que orbita/gira) */
const STAR: [number, number, number] = [0, 2.35, 0];
/** velocidade base dos anéis por grupo (o `spin` acelera com a carga) */
const RING_SPEED: Record<number, number> = { 11: 0.7, 12: -0.9, 13: 1.1 };

export function PlasmaRig({
  seed,
  unitId,
  level: levelProp,
  demoAttackSeq,
  smoke,
}: PlasmaRigProps) {
  const modelDef = MODELS.plasma;
  // espécie da árvore: forma única no nível da espécie (Nv.7)
  const level = Math.max(
    PLASMA_DEF.levelMin,
    Math.min(PLASMA_DEF.levelMax, Math.round(levelProp ?? PLASMA_DEF.levelMin)),
  );
  const topY = formTop(PLASMA_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const fireDone = useRef(true);
  const ringAngles = useRef<Record<number, number>>({});

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** os três giros da contenção: grupo → peças + ângulo (normal do anel e
   *  centro). O torus é simétrico e NÃO mostra rotação própria — o que vende
   *  o giro é o GRAMPO passeando pelo aro, então anel+grampos giram juntos em
   *  torno do normal do anel (matemática de pivô igual às hidras do Pântano) */
  const gyros = useMemo(() => {
    type Gyro = {
      id: number;
      center: [number, number, number];
      axis: THREE.Vector3;
      items: {
        i: number;
        off: [number, number, number];
        baseQ: THREE.Quaternion;
      }[];
    };
    const byGroup = new Map<number, number[]>();
    visParts.forEach((p, i) => {
      if (p.group === undefined) return;
      const list = byGroup.get(p.group) ?? [];
      list.push(i);
      byGroup.set(p.group, list);
    });
    const out: Gyro[] = [];
    for (const [id, idxs] of byGroup) {
      const ring = visParts[idxs.find((i) => visParts[i].tag === 'ring') ?? idxs[0]];
      const e = new THREE.Euler(...(ring.r ?? [0, 0, 0]));
      // torus nasce no plano XY (normal = +Z): o euler da peça rotaciona o normal
      const axis = new THREE.Vector3(0, 0, 1).applyEuler(e).normalize();
      out.push({
        id,
        center: ring.p,
        axis,
        items: idxs.map((i) => ({
          i,
          off: [
            visParts[i].p[0] - ring.p[0],
            visParts[i].p[1] - ring.p[1],
            visParts[i].p[2] - ring.p[2],
          ] as [number, number, number],
          baseQ: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(...(visParts[i].r ?? [0, 0, 0])),
          ),
        })),
      });
    }
    return out.sort((a, b) => a.id - b.id);
  }, [visParts]);

  /** peças semânticas fora dos giros: garfos/garras/proeminências/faíscas... */
  const extras = useMemo(() => {
    const prongs: number[] = [];
    const claws: number[] = [];
    const spots: number[] = [];
    const loops: number[] = [];
    const flares: number[] = [];
    const sparks: number[] = [];
    const heat: number[] = [];
    visParts.forEach((p, i) => {
      if (p.tag === 'prong') prongs.push(i);
      else if (p.tag === 'claw') claws.push(i);
      else if (p.tag === 'spot') spots.push(i);
      else if (p.tag === 'loop') loops.push(i);
      else if (p.tag === 'flare') flares.push(i);
      else if (p.tag === 'spark') sparks.push(i);
      else if (p.tag === 'heat') heat.push(i);
    });
    return { prongs, claws, spots, loops, flares, sparks, heat };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    // ferro preto da mancha solar/olho: basic mesmo fora do shader — o
    // CONTRASTE do sol é preto sobre plasma (olho claro sumiria no albedo)
    const black = new THREE.MeshBasicMaterial({ color: '#150d14', transparent: true });
    // o reflexo do olho (fagulha branca-cortada, nunca #ffffff)
    const glint = new THREE.MeshStandardMaterial({
      color: '#ffe3f6',
      emissive: '#ff9ef5',
      emissiveIntensity: 1.1,
      roughness: 0.3,
      flatShading: true,
    });
    const cache = new Map<string, THREE.Material>();
    const iron: THREE.ShaderMaterial[] = []; // gaiola (body/accent)
    const forge: THREE.ShaderMaterial[] = []; // bigorna (dark)
    const heat: THREE.ShaderMaterial[] = []; // bafo (steam)
    const star: THREE.ShaderMaterial[] = []; // plasma (glow)
    const list = visParts.map((p, i) => {
      if (p.m === 'black') return black;
      if (p.m === 'white') return glint;
      if (p.m === 'glow') {
        // a estrela em si + proeminências + faíscas: o MESMO plasma (não-aditivo).
        // FRONT only: no print, o núcleo grande em DoubleSide deixava as costas
        // do plasma transpassarem a frente — a bola virava chiclete lavado
        const sm = makeCoreMaterial({
          ...CORE_LOOK,
          amp: p.tag === 'core' ? 0.09 : 0.03, // plasma ferve na superfície
          seed: seed + (i % 3) * 2.6,
        });
        sm.side = THREE.FrontSide;
        star.push(sm);
        return sm;
      }
      if (p.m === 'steam') {
        const sm = makeSteamMaterial({
          ...HEAT_LOOK,
          amp: p.amp ?? 0.12,
          hotY: p.p[1], // o bafo acende na base (a forja quente) e esfria ao subir
          seed: seed + (i % 3) * 2.9,
        });
        heat.push(sm);
        return sm;
      }
      const key = `${p.m}|${p.tag ?? ''}|${p.amp ?? 0}|${Math.round(p.p[1] * 50)}|${i % 3}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const look = p.m === 'dark' ? FORGE_LOOK : CAGE_LOOK;
      const sm = makeStoneMaterial({
        rockA: look.rockA,
        rockB: look.rockB,
        crack: look.crack,
        amp: p.amp ?? 0.026,
        crackGlow: look.crackGlow,
        crackScale: look.crackScale,
        crackWidth: look.crackWidth,
        crackBoost: look.crackBoost,
        speck: look.speck,
        seed: seed + (i % 3) * 3.1,
        // a marca queimada rente ao chão NÃO aceita tint forte: é fuligem do
        // tabuleiro, não armadura (a regra do chão da Obsidiana)
        teamColor: p.tag === 'scorch' ? '#6f6a72' : team,
      });
      (p.m === 'dark' ? forge : iron).push(sm);
      cache.set(key, sm);
      return sm;
    });
    return { list, uniq: [...cache.values(), black, glint], iron, forge, heat, star };
  }, [visParts, seed, level, team]);

  // o stoneShaders lê `aSeed` por peça: clonamos a geometria compartilhada e
  // escrevemos o seed (normal suavizada: ferro forjado tem bojo, não faceta)
  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        const g = geo.clone();
        setSeedAttribute(g, seed + i * 1.7);
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
    };
  }, [partMats]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    let hurt = 0;
    let alpha = 1;
    let wound = 0; // 0 = inteira; ferida, o ferro racha mais
    let sinceAttack = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        wound = Math.max(0, 1 - u.hp / u.maxHp);
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > PLASMA_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const firing =
      sinceAttack >= PLASMA_ATTACK_WINDOW * PLASMA_WINDUP &&
      sinceAttack <= PLASMA_ATTACK_WINDOW * (PLASMA_WINDUP + 0.3);

    // saraivada de faíscas quentes no instante da descarga (o feixe rasgando)
    if (firing && !fireDone.current) {
      fireDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 9; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 0.7, 2.35 + (Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.5)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.05 + Math.random() * 0.04,
            heat: 0.35, // faísca de forja: quente, mas nunca bola de fogo
            life: 0.35 + Math.random() * 0.35,
            lifeVar: 0.2,
            jitter: 0.12,
            rise: 0.25,
            drag: 4.2,
            vx: (Math.random() - 0.5) * 2.2,
            vy: 0.2 + Math.random() * 1.2,
            vz: 1.2 + Math.random() * 1.8,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > PLASMA_ATTACK_WINDOW) fireDone.current = false;

    // ---- uniforms ----
    const boil = 0.5 + 0.5 * Math.sin(t * (2.1 + pose.charge * 2.4) + seed);
    const breath = Math.sin(t * 0.5 + seed) * 0.6 + Math.sin(t * 1.3 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: a jaula desaba e a estrela apaga
    // O DANO NÃO PODE BRANQUEAR A ESTRELA (a lição do vidro): amortecido no
    // ferro, e o feedback migra para a COSTURA do ferro + para a carga do plasma
    const seam = 1 + (wound * 1.4 + hurt * 0.8 + pose.charge * 1.2) * 0.75;
    for (const arr of [partMats.iron, partMats.forge]) {
      for (const m of arr) {
        m.uniforms.uTime.value = t;
        m.uniforms.uHurt.value = hurt * 0.25;
        m.uniforms.uCharge.value = pose.charge;
        m.uniforms.uBreath.value = breath;
        const baseGlow = (m.userData.baseGlow as number | undefined) ??
          (m.userData.baseGlow = m.uniforms.uCrackGlow.value);
        m.uniforms.uCrackGlow.value = baseGlow * seam;
        const baseW = (m.userData.baseW as number | undefined) ??
          (m.userData.baseW = m.uniforms.uCrackWidth.value);
        m.uniforms.uCrackWidth.value = baseW * (1 + wound * 0.45 + pose.charge * 0.3);
        const baseAmp = (m.userData.baseAmp as number | undefined) ??
          (m.userData.baseAmp = m.uniforms.uAmp.value);
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.15 + crumble * 2.0);
      }
    }
    for (const m of partMats.star) {
      m.uniforms.uTime.value = t;
      // a estrela FERVE sempre (no print ocioso o plasma lia como bola de
      // chiclete parada): carga base + fervura; a carga do tiro enche mais, e
      // ferida ela só ferve mais rápido
      m.uniforms.uCharge.value =
        0.3 + boil * 0.22 + pose.charge * 0.85 + (pose.bulge > 0.4 ? pose.bulge * 0.3 : 0) + wound * 0.25;
      const baseA = (m.userData.baseA as number | undefined) ?? (m.userData.baseA = m.uniforms.uAlpha.value);
      m.uniforms.uAlpha.value = baseA * (0.92 + pose.charge * 0.08) * alpha;
    }
    for (const m of partMats.heat) {
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * 0.2;
      m.uniforms.uCharge.value = pose.charge * 0.8 + pose.flare * 0.4;
      m.uniforms.uBreath.value = 0.6 + boil * 0.8;
      const baseAmp = (m.userData.baseAmp as number | undefined) ??
        (m.userData.baseAmp = m.uniforms.uAmp.value);
      m.uniforms.uAmp.value = baseAmp * (1 + pose.flare * 0.5 + boil * 0.25);
      const baseA = (m.userData.baseA as number | undefined) ?? (m.userData.baseA = m.uniforms.uAlpha.value);
      m.uniforms.uAlpha.value = baseA * (1 + pose.flare * 0.35) * alpha;
    }

    // clarão SÓBRIO na estrela (a forja do caldeireiro celeste; blowout cortado)
    const glow = glowRef.current;
    if (glow) {
      glow.scale.setScalar(0.62 + pose.charge * 0.18 + (pose.bulge > 0 ? pose.bulge * 0.22 : 0));
      (glow.material as THREE.SpriteMaterial).opacity = Math.max(
        0,
        (0.07 + boil * 0.02 + pose.charge * 0.05 + Math.max(0, pose.bulge) * 0.08) * alpha,
      );
    }

    // ---- corpo: plantado na forja; afunda quando a estrela puxa, empurra na descarga
    const g = rootRef.current;
    g.scale.set(
      1 + Math.max(0, pose.bulge) * 0.04 + crumble * 0.08,
      1 - pose.crouch * 0.03 - crumble * 0.12,
      1 + Math.max(0, pose.bulge) * 0.035 + crumble * 0.1,
    );
    g.rotation.y = Math.sin(t * 0.3 + seed) * 0.012 + pose.twist * 0.35;
    g.rotation.z = Math.sin(t * 0.24 + seed * 0.6) * 0.006;
    g.position.y = Math.sin(t * 1.2 + seed) * 0.01 - crumble * 0.05;
    g.position.z = pose.stepZ;

    // ---- os giros da contenção: a carga ACELERA e trava o torque ----
    for (const gyro of gyros) {
      const speed = RING_SPEED[gyro.id] ?? 0.8;
      const acc = 1 + pose.charge * 3.2 + Math.max(0, pose.bulge) * 1.5;
      ringAngles.current[gyro.id] = (ringAngles.current[gyro.id] ?? 0) + speed * acc * dt;
      const ang = ringAngles.current[gyro.id] ?? 0;
      tmpAxis.copy(gyro.axis);
      tmpQuat.setFromAxisAngle(tmpAxis, ang);
      for (const it of gyro.items) {
        const mesh = partRefs.current[it.i];
        if (!mesh) continue;
        tmpWorld.set(it.off[0], it.off[1], it.off[2]).applyQuaternion(tmpQuat);
        mesh.position.set(
          gyro.center[0] + tmpWorld.x,
          gyro.center[1] + tmpWorld.y,
          gyro.center[2] + tmpWorld.z,
        );
        mesh.quaternion.copy(tmpQuat).multiply(it.baseQ);
      }
    }

    // ---- a estrela: encovada encolhe, na descarga ESTUFA ----
    const coreI = visParts.findIndex((p) => p.tag === 'core');
    if (coreI >= 0) {
      const core = partRefs.current[coreI];
      if (core) {
        const sc = Math.max(0.2, 1 + pose.bulge * 0.16 + pose.charge * 0.05 + boil * 0.015 - crumble * 0.5);
        core.scale.setScalar(sc);
      }
    }
    // as manchas solares acompanham o pulso do núcleo (afundam quando encolhe)
    for (const i of extras.spots) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const s = Math.max(0.15, 1 + pose.bulge * 0.14 + pose.charge * 0.04);
      mesh.scale.set((visParts[i].s?.[0] ?? 1) * s, (visParts[i].s?.[1] ?? 1) * s, (visParts[i].s?.[2] ?? 0.3) * s);
    }
    // as garras ABREM a jaula na descarga (e apertam antes): rotação extra
    // para fora em torno da base do garfo + os garfos afrouxam o breu
    for (const i of extras.claws) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const side = visParts[i].p[0] > 0.05 ? 1 : visParts[i].p[0] < -0.05 ? -1 : 0;
      const back = visParts[i].p[2] < -0.4 && side === 0;
      const b = visParts[i].r ?? [0, 0, 0];
      const open = pose.bloom * (back ? 0.3 : 0.45);
      mesh.rotation.set(
        b[0] + (back ? -open : open * 0.4),
        b[1],
        b[2] + (side === 0 ? 0 : -side * open),
      );
    }
    for (const i of extras.prongs) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const side = visParts[i].p[0] > 0.05 ? 1 : visParts[i].p[0] < -0.05 ? -1 : 0;
      const b = visParts[i].r ?? [0, 0, 0];
      const back = visParts[i].p[2] < -0.4 && side === 0;
      // a jaula respira: fecha na carga, escancara no disparo (e o torque entorta)
      const open = pose.bloom * (back ? 0.16 : 0.22);
      mesh.rotation.set(
        b[0] + (back ? -open : open * 0.3),
        b[1] + pose.twist * 0.12,
        b[2] + (side === 0 ? 0 : -side * open),
      );
    }
    // proeminências e línguas de fogo: esticam na carga e disparam para frente
    const stretch = (i: number) =>
      1 + pose.charge * 0.4 + pose.flare * 0.25 + Math.sin(t * (3.2 + (i % 3) * 0.7) + i * 2.3 + seed) * 0.12;
    for (const i of [...extras.loops, ...extras.flares]) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      mesh.scale.setScalar(Math.max(0.2, stretch(i)) * (1 - crumble * 0.6));
      const b = visParts[i].r ?? [0, 0, 0];
      mesh.rotation.set(b[0] + pose.flare * 0.08, b[1], b[2] + pose.flare * 0.1);
    }
    // faíscas orbitando a jaula (espiralando para dentro na carga)
    for (const i of extras.sparks) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const p0 = visParts[i].p;
      const dx = p0[0] - STAR[0];
      const dz = p0[2] - STAR[2];
      const rad = Math.hypot(dx, dz) * (1 - pose.charge * 0.28);
      const a0 = Math.atan2(dz, dx) + t * (0.5 + pose.charge * 1.6) + i * 1.9;
      mesh.position.set(
        STAR[0] + Math.cos(a0) * rad,
        p0[1] + Math.sin(t * (0.7 + (i % 3) * 0.15) + i * 2.2 + seed) * 0.14,
        STAR[2] + Math.sin(a0) * rad,
      );
      const blink = 0.65 + 0.45 * Math.sin(t * (3.4 + i * 0.7) + i * 3.3);
      mesh.scale.setScalar(Math.max(0.25, blink) * (1 + pose.charge * 0.45) * (1 - crumble));
    }
    // o bafo quente da forja: sobe devagar, alarga e some
    for (const i of extras.heat) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const cyc = ((t * (0.3 + (i % 3) * 0.07) + i * 0.37 + seed * 0.1) % 1 + 1) % 1;
      mesh.scale.setScalar(0.8 + cyc * 0.8 + pose.flare * 0.35);
      mesh.position.y = visParts[i].p[1] + cyc * 0.7;
      mesh.position.x = visParts[i].p[0] + Math.sin(t * 0.6 + i * 1.7 + seed) * 0.08;
    }
    void topY; // topo amarrado nos testes; forma única Nv.7
  });

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => (
        <group key={`${level}-${i}`}>
          <mesh
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            castShadow
          />
        </group>
      ))}
      <sprite ref={glowRef} position={[0, 2.35, 0]} scale={0.62}>
        <spriteMaterial
          map={circleTexture()}
          color={PLASMA_SPARK}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
