import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeWaterMaterial } from './waterShaders';
import { makeStoneMaterial } from './stoneShaders';
import { makeWoodMaterial } from './woodShaders';
import { makeSteamMaterial } from './steamShaders';
import { makeCoreMaterial } from './lightningShaders';
import { TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do PÂNTANO (Nv.7 — água+terra+fogo): a HIDRA DO LODO, o brejo que
 * engoliu o ancião (Madeira) e o caldeirão (Vapor). Zero shader novo de
 * propósito — cada material é uma família que a árvore já aprovou, lida na
 * paleta do brejo:
 *
 *  1. LODO (role 'body'): o `waterShaders` da Nereia lido como LAMA — albedo
 *     em BREU esverdeado, ondas que ESCORREM para baixo (a lama escorregando
 *     pela criatura) e espuma virando BOLOR pálido (foamAmt BAIXO: espuma
 *     branca em corpo escuro é neve, não brejo). A massa ferve no lugar:
 *     ondulação + `uSwell`/`uSurge` (puxa e empurra) na coreografia;
 *  2. CROSTA (role 'dark'): o `stoneShaders` do golem lido como a PELE SECA
 *     RACHADA do brejo — e o veio de dano do magma vira o VERDE-VITRÍOLO do
 *     veneno que sangra pela crosta. A `caldeira afogada` é o mesmo material
 *     numa paleta de ferro crostoso (o fogo do caldeireiro aceso por dentro);
 *  3. RAIZ/TRONCO (role 'accent'): o `woodShaders` da Madeira — o ancião
 *     afogado, com a seiva esmeralda lida como seiva envenenada;
 *  4. GÁS DO BREJO (role 'steam' + 'trans'): o `steamShaders` do Vapor —
 *     pluma densa saindo da boca do caldeirão, bolha nos cantos da poça e o
 *     filme de bolor na borda (NUNCA tint da equipe: gás não aceita tinta);
 *  5. BILE (role 'glow'): o plasma do raio lido em VITRÍOLO — o veneno na
 *     goela, os fogo-fátuo pairando e a brasa dentro do caldeirão.
 *
 * Regras amarradas: o dano NÃO pode branquear a identidade (uHurt amortecido
 * no albedo — o feedback migra para a VEO DE VENENO, que é a "carne que
 * volta": quanto mais ferida, mais largo e aceso o vitríolo, e ele FECHA
 * quando o regen devolve vida); blowout cortado (o branco nunca é #ffffff);
 * nada aditivo no lodo/crosta/raiz/gás; gás e bolor sem tint da equipe.
 */

export const PANTANO_ATTACK_WINDOW = 0.72;
/** fração da janela em que a hidra encova o pescoço para o bote */
export const PANTANO_WINDUP = 0.45;

/** o vitríolo único da espécie: motor = rig = projétil = FX (amarrado em teste) */
export const PANTANO_POISON = '#a8cf4a';

const PANTANO_DEF = getSpecies('pantano');

interface AttackPose {
  twist: number; // corpo torce (negativo = encovando)
  crouch: number; // 0..1 o montículo AFFUNDA no brejo
  bulge: number; // squash & bulge: a lama comprime e estufa ao soltar
  coil: number; // pescoços (negativo = recolhidos, positivo = chicoteando)
  gape: number; // 0..1 o maxilar ESCANCARADO (a bica do cuspe)
  charge: number; // bile/veneno enchendo a goela e o caldeirão
  stepZ: number; // plantado: empurra só o tronco
  flare: number; // 0..1 o bafo: gás eriça, musgo e juncos balançam
}

export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    crouch: 0,
    bulge: 0,
    coil: 0,
    gape: 0,
    charge: 0,
    stepZ: 0,
    flare: 0,
  };
  if (since < 0 || since > PANTANO_ATTACK_WINDOW) return P;
  const p = since / PANTANO_ATTACK_WINDOW;
  if (p < PANTANO_WINDUP) {
    // k**1.5: o lodo é ELÁSTICO (encova mais devagar no começo e engata no fim)
    const k = (p / PANTANO_WINDUP) ** 1.5;
    P.twist = -0.1 * k;
    P.crouch = 0.8 * k;
    P.bulge = 0.9 * k;
    P.coil = -1.0 * k;
    P.gape = 0.15 * k; // o maxilar fica TRAVADO quase fechado segurando o globo
    P.charge = k;
    P.stepZ = -0.03 * k;
    P.flare = 0.5 * k;
    return P;
  }
  const r = (p - PANTANO_WINDUP) / (1 - PANTANO_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.3)) ** 2; // o chicote é rápido, não instantâneo
  const decay = 1 - Math.max(0, (r - 0.45) / 0.55);
  P.twist = (-0.1 + 0.42 * a) * decay;
  P.crouch = (0.8 - 0.85 * a) * decay;
  P.bulge = (0.9 - 1.2 * a) * decay;
  P.coil = (-1.0 + 1.9 * a) * decay;
  P.gape = (0.15 + 0.85 * a) * decay;
  P.charge = Math.max(0, 1 - 1.2 * r) * decay;
  P.stepZ = (-0.03 + 0.13 * a) * decay;
  P.flare = (0.5 + 0.7 * a) * decay;
  return P;
}

// ---------------------------------------------------------------- paletas --

interface MudLook {
  deep: string;
  mid: string;
  foam: string;
  foamAmt: number;
  amp: number;
  swell: number;
  bend: number;
}

/** LODO VIVO (o corpo, os pescoços, a poça): o albedo é BREU esverdeado — a
 *  lama molhada lê pelo gradiente vertical e pelas ondas que escorrem, nunca
 *  por albedo claro (senão vira lama de obra, não brejo). Espuma CONTIDA: o
 *  bolor pálido tem que ser minoritário, senão a criatura parece coberta de
 *  neve/sabão */
export const MUD_ROLE_LOOK: Partial<Record<MatRole, MudLook>> = {
  body: {
    deep: '#1b2310',
    mid: '#5d6f3a', // o meio do lodo: escuro demais, o corpo lia BURACO no print
    foam: '#a3b67e', // bolor pálido (nunca #ffffff)
    foamAmt: 0.26,
    amp: 0.085,
    swell: 0.05,
    bend: 0.03,
  },
  // lodo mais fundo da poça e do caldo do caldeirão: quase breu puro
  trans: {
    deep: '#151d0c',
    mid: '#3c4a24',
    foam: '#8b9d64',
    foamAmt: 0.2,
    amp: 0.05,
    swell: 0.07,
    bend: 0.02,
  },
};

/** CROSTA SECA (role 'dark'): a pele rachada do brejo no material do golem.
 *  O veio é o VITRÍOLO — costura LARGA e contínua (crackScale baixo), porque
 *  crackScale alto em corpo grande vira poeira pontilhada (a lição do vidro) */
export const CRUST_LOOK = {
  rockA: '#4a4630', // lama seca clara
  rockB: '#1c1a12', // lama seca sombra
  crack: PANTANO_POISON,
  // GLOW CONTIDO: no print o veio acendia feito RELÂMPAGO amarelo cobrindo a
  // crosta inteira — o vitríolo tem que ser VEIO úmido, não solda elétrica
  crackGlow: 0.33,
  crackScale: 2.1, // veio CURTO e denso (escala baixa faz zigue-zague de RELÂMPAGO)
  crackWidth: 0.045,
  crackBoost: 0.85,
  speck: 0.22, // grão de areia do brejo (baixo: sem glitter)
};

/** FERRO CROSTOSO do caldeirão afogado: o mesmo stoneShaders, mais BREU e com
 *  a brasa do caldeireiro acesa por dentro (veio mais bruto e contínuo) */
export const IRON_LOOK = {
  rockA: '#2b3226',
  rockB: '#0e120b',
  crack: PANTANO_POISON,
  // 0,85/0,6 ainda lia como solda verde no print do caldeirão: brasa do
  // ferreiro é VEIO quente sob a crosta, não rabisco de neon por cima do ferro.
  // Escala ALTA = trama curta (cicatriz de ferro), escala baixa = raio
  crackGlow: 0.45,
  crackScale: 1.9,
  crackWidth: 0.045,
  crackBoost: 0.8,
  speck: 0.12,
};

/** O ANCIÃO AFOGADO: casca encharcada (quase preta), musgo do brejo e a seiva
 *  lida como seiva ENVENENADA (mesmo vitríolo da espécie) */
export const ROOT_LOOK = {
  barkA: '#2e2419', // madeira ENCHARCADA (clara, o tronco virava a estrela do print)
  barkB: '#100c09',
  moss: '#3f5c28',
  sap: PANTANO_POISON,
  amp: 0.05,
  sapGlow: 0.4,
  speck: 0.12, // resina escura: quase cortada
};

/** GÁS DO BREJO: pesado, frio em cima, quente na boca do caldeirão. `swirl`
 *  BAIXO (gás de pântano não sobe em redemoinho como vapor de caldeira — ele
 *  RASTEJA) e SEM tint da equipe */
export const GAS_LOOK = {
  cool: '#a2b085', // palha doente (nunca branco)
  warm: '#5c7a2f', // esquentado pela brasa do caldeireiro
  hot: '#c2d884', // escaldante carregando o cuspe (cortado, sem #ffffff)
  alpha: 0.5,
  swirl: 0.18,
};

/** filme de bolor na borda da poça (role 'trans'): quase parado, alfa baixa */
export const SCUM_LOOK = {
  cool: '#93a368',
  warm: '#6b7a44',
  hot: '#b9cf85',
  alpha: 0.45,
  swirl: 0.08,
};

/** A BILE (role 'glow'): plasma do raio lido em veneno. Não-aditivo (regra do
 *  projeto) e o miolo quente NUNCA é #ffffff */
export const BILE_LOOK = {
  gold: PANTANO_POISON,
  white: '#e4f3b4',
  cool: '#3d5a1b',
};

export interface PantanoRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o pântano usa para o spray de lodo do cuspe */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpOff = new THREE.Vector3();
const tmpEuler = new THREE.Euler();

export function PantanoRig({
  seed,
  unitId,
  level: levelProp,
  demoAttackSeq,
  smoke,
}: PantanoRigProps) {
  const modelDef = MODELS.pantano;
  // espécie da árvore: forma única no nível da espécie (Nv.7)
  const level = Math.max(
    PANTANO_DEF.levelMin,
    Math.min(PANTANO_DEF.levelMax, Math.round(levelProp ?? PANTANO_DEF.levelMin)),
  );
  const topY = formTop(PANTANO_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const spitDone = useRef(true);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** as três hidras: grupo (part.group) → peças + âncora do pivô (a base do
   *  pescoço, no montículo). O rig enrola/devolve o pescoço INTEIRO em torno
   *  dessa âncora — sem isso a cápsula só gira no próprio centro e a junção
   *  abre (a lição das juntas do golem) */
  const necks = useMemo(() => {
    type Neck = {
      id: number;
      side: 1 | -1 | 0;
      anchor: [number, number, number];
      items: { i: number; off: [number, number, number]; base: [number, number, number] }[];
    };
    const byGroup = new Map<number, number[]>();
    visParts.forEach((p, i) => {
      if (p.group === undefined || !['neck', 'head', 'jaw', 'eye', 'gullet', 'drip'].includes(p.tag ?? '')) return;
      const list = byGroup.get(p.group) ?? [];
      list.push(i);
      byGroup.set(p.group, list);
    });
    const out: Neck[] = [];
    for (const [id, idxs] of byGroup) {
      const basePart = visParts[idxs.reduce((a, b) => (visParts[a].p[1] <= visParts[b].p[1] ? a : b))];
      const anchor: [number, number, number] = [basePart.p[0], basePart.p[1] - 0.12, basePart.p[2]];
      out.push({
        id,
        side: anchor[0] > 0.05 ? 1 : anchor[0] < -0.05 ? -1 : 0,
        anchor,
        items: idxs.map((i) => {
          const p = visParts[i];
          return {
            i,
            off: [p.p[0] - anchor[0], p.p[1] - anchor[1], p.p[2] - anchor[2]] as [number, number, number],
            base: (p.r ?? [0, 0, 0]) as [number, number, number],
          };
        }),
      });
    }
    return out.sort((a, b) => a.id - b.id);
  }, [visParts]);

  /** tudo que NÃO é pescoço pivoteia no próprio eixo (raiz, crosta, gás...) */
  const sway = useMemo(() => {
    const reeds: number[] = [];
    const moss: number[] = [];
    const gas: number[] = [];
    const wisps: number[] = [];
    visParts.forEach((p, i) => {
      if (p.tag === 'reed') reeds.push(i);
      else if (p.tag === 'moss') moss.push(i);
      else if (p.tag === 'gas') gas.push(i);
      else if (p.tag === 'wisp') wisps.push(i);
    });
    return { reeds, moss, gas, wisps };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  const partMats = useMemo(() => {
    // olho: FENDA doente (pálida, acesa de vitríolo) — sem bolinha de boneca
    const eye = new THREE.MeshStandardMaterial({
      color: '#e9f2c8',
      emissive: PANTANO_POISON,
      emissiveIntensity: 1.05,
      roughness: 0.4,
      flatShading: true,
    });
    const cache = new Map<string, THREE.Material>();
    const mud: THREE.ShaderMaterial[] = [];
    const crust: THREE.ShaderMaterial[] = [];
    const roots: THREE.ShaderMaterial[] = [];
    const gas: THREE.ShaderMaterial[] = [];
    const bile: THREE.ShaderMaterial[] = [];
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return new THREE.MeshBasicMaterial({ color: '#0b0f08' });
      const key = `${p.m}|${p.tag ?? ''}|${p.amp ?? 0}|${Math.round(p.p[1] * 50)}|${i % 3}`;
      const cached = cache.get(key);
      if (cached) return cached;
      let m: THREE.Material;
      if (p.m === 'glow') {
        // bile/veneno: plasma não-aditivo (regra do Gelo) — brasa do caldeirão,
        // fogo-fátuo e a bile na goela usam o MESMO vitríolo
        const sm = makeCoreMaterial({
          ...BILE_LOOK,
          amp: p.flick ? 0.02 : 0.05,
          seed: seed + i * 2.3,
        });
        bile.push(sm);
        m = sm;
      } else if (p.m === 'steam' || p.m === 'trans') {
        // gás do brejo (e o filme de bolor da poça): NUNCA tint de equipe
        const pot = p.p[1] > 1.2;
        const sm = makeSteamMaterial({
          ...(p.m === 'trans' ? SCUM_LOOK : GAS_LOOK),
          amp: p.amp ?? 0.14,
          hotY: pot ? 1.7 : p.p[1],
          swirl: p.m === 'trans' ? SCUM_LOOK.swirl : GAS_LOOK.swirl * (pot ? 1.5 : 0.7),
          seed: seed + (i % 3) * 2.9,
        });
        gas.push(sm);
        m = sm;
      } else if (p.m === 'accent') {
        const sm = makeWoodMaterial({
          ...ROOT_LOOK,
          amp: p.amp ?? ROOT_LOOK.amp,
          seed: seed + (i % 3) * 3.7,
          teamColor: p.tag === 'reed' ? '#7f8a5a' : team,
        });
        roots.push(sm);
        m = sm;
      } else if (p.m === 'dark') {
        const iron = p.tag === 'pot';
        const look = iron ? IRON_LOOK : CRUST_LOOK;
        const sm = makeStoneMaterial({
          rockA: look.rockA,
          rockB: look.rockB,
          crack: look.crack,
          amp: p.amp ?? 0.04,
          crackGlow: look.crackGlow,
          crackScale: look.crackScale,
          crackWidth: look.crackWidth,
          crackBoost: look.crackBoost,
          speck: look.speck,
          seed: seed + (i % 3) * 3.1,
          breath: p.tag === 'pot' ? 0.35 : 1,
          // bolor/crosta rente ao chão NÃO é espelho nem aceita tint forte:
          // é o brejo do tabuleiro, não uma armadura
          teamColor: p.p[1] < 0.25 ? '#6d7a52' : team,
        });
        crust.push(sm);
        m = sm;
      } else {
        const look = MUD_ROLE_LOOK[p.m] ?? MUD_ROLE_LOOK.body!;
        const sm = makeWaterMaterial({
          deep: look.deep,
          mid: look.mid,
          foam: look.foam,
          amp: p.amp ?? look.amp,
          foamAmt: look.foamAmt,
          swell: look.swell,
          bend: look.bend,
          yOff: p.p[1], // emendas contínuas: a onda percorre o modelo inteiro
          modelH: topY,
          seed: seed + (i % 3) * 2.7,
          teamColor: team,
        });
        mud.push(sm);
        m = sm;
      }
      cache.set(key, m);
      return m;
    });
    return { list, uniq: [...cache.values(), eye], mud, crust, roots, gas, bile };
  }, [visParts, seed, level, team, topY]);

  // os materiais do lodo/crosta/raiz/gás leem `aSeed` por peça: clonamos a
  // geometria compartilhada e escrevemos o seed. Diferente do vidro, o LODO
  // quer normal INTERPOLADA (massa molhada e redonda, não faceta de vidro)
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
    let wound = 0; // 0 = inteira, 1 = por um fio (a "carne que volta" some)
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
      if (demoT.current > PANTANO_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= PANTANO_ATTACK_WINDOW * PANTANO_WINDUP &&
      sinceAttack <= PANTANO_ATTACK_WINDOW * (PANTANO_WINDUP + 0.34);

    // spray de lodo na boca e bolha estourando na poça no instante do cuspe
    if (striking && !spitDone.current) {
      spitDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 7; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 0.5, 3.1 + Math.random() * 0.3, 1.0 + Math.random() * 0.3)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.06 + Math.random() * 0.05,
            heat: 0, // fuligem FRIA de brejo (nunca brasa de fogueira)
            life: 0.5 + Math.random() * 0.4,
            lifeVar: 0.2,
            jitter: 0.14,
            rise: 0.05,
            drag: 4.6,
            vx: (Math.random() - 0.5) * 1.6,
            vy: 0.3 + Math.random() * 0.9,
            vz: 0.9 + Math.random() * 1.2,
          });
        }
        for (let i = 0; i < 3; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 2.2, 0.12, (Math.random() - 0.5) * 1.8)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.09 + Math.random() * 0.05,
            heat: 0,
            life: 0.7 + Math.random() * 0.4,
            jitter: 0.1,
            rise: 0.12,
            drag: 3.2,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > PANTANO_ATTACK_WINDOW) spitDone.current = false;

    // ---- uniforms: a fervura do brejo ----
    // boil: a lama borbulha SEMPRE (é a respiração da criatura) e acelera na carga
    const boil = 0.5 + 0.5 * Math.sin(t * (1.5 + pose.charge * 1.6) + seed);
    const breath = Math.sin(t * 0.42 + seed) * 0.6 + Math.sin(t * 1.1 + seed * 0.7) * 0.4;
    const crumble = 1 - alpha; // morrendo: o lodo DESEMBECA e a criatura derrete
    // O LODO NÃO PODE BRANQUEAR sob fogo (a lição do vidro: o branqueamento
    // padrão dos shaders pinta a criatura de cinza no combate, e o Pântano
    // tanqueia a luta inteira com poison+regen). O dano vai amortecido no
    // albedo e o feedback migra para o VEIO DE VENENO.
    const vein = 1 + (wound * 1.5 + hurt * 0.9 + pose.charge * 1.1) * 0.8;
    for (const m of partMats.mud) {
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
      m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * 0.3;
      m.uniforms.uFlare.value = pose.charge * 0.7 + pose.flare * 0.4;
      // a massa puxa o corpo na carga e EMPURRA no cuspe (o ângulo do cuspe
      // é o uSurge do próprio shader — a lama bofa para fora)
      m.uniforms.uSurge.value = pose.charge * -0.5 + pose.coil * 0.55;
      m.uniforms.uSwell.value =
        ((m.userData.baseSwell as number | undefined) ??
          (m.userData.baseSwell = m.uniforms.uSwell.value)) *
        (1 + pose.flare * 0.5 + boil * 0.35);
      m.uniforms.uBend.value =
        ((m.userData.baseBend as number | undefined) ??
          (m.userData.baseBend = m.uniforms.uBend.value)) *
        (1 + pose.twist * 0.6 + Math.sin(t * 0.5 + seed) * 0.3);
      // fervendo: a casca engrossa e afina com a bolha; na morte DESMANCHA
      m.uniforms.uAmp.value = baseAmp * (1 + boil * 0.3 + pose.charge * 0.5 + crumble * 2.2);
      // o BOLOR tem teto: espuma branca demais é sabão, não brejo
      const baseFoam = (m.userData.baseFoam as number | undefined) ??
        (m.userData.baseFoam = m.uniforms.uFoamAmt.value);
      m.uniforms.uFoamAmt.value = baseFoam * (1 + wound * 0.25 + pose.charge * 0.15);
    }
    for (const m of partMats.crust) {
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * 0.28;
      m.uniforms.uCharge.value = pose.charge;
      m.uniforms.uBreath.value = breath;
      // A CARNE QUE VOLTA: com o regen devolvendo vida o vitríolo FECHA (veio
      // apaga e a crosta se recompoem); ferida, o veio alarga e acende
      const baseGlow = (m.userData.baseGlow as number | undefined) ??
        (m.userData.baseGlow = m.uniforms.uCrackGlow.value);
      m.uniforms.uCrackGlow.value = baseGlow * vein;
      const baseW = (m.userData.baseW as number | undefined) ?? (m.userData.baseW = m.uniforms.uCrackWidth.value);
      m.uniforms.uCrackWidth.value = baseW * (1 + wound * 0.5 + pose.charge * 0.35);
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? (m.userData.baseAmp = m.uniforms.uAmp.value);
      m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.15 + crumble * 1.8);
    }
    for (const m of partMats.roots) {
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * 0.25;
      m.uniforms.uCharge.value = pose.charge;
      m.uniforms.uBreath.value = breath;
      // a seiva do ancião afogado corre mais forte quando o regen trabalha
      m.uniforms.uSap.value = 0.4 + 0.3 * Math.sin(t * 0.7 + seed) + wound * 0.8 + pose.charge * 0.6;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? (m.userData.baseAmp = m.uniforms.uAmp.value);
      m.uniforms.uAmp.value = baseAmp * (1 + crumble * 1.5);
    }
    for (const m of partMats.gas) {
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt * 0.2;
      m.uniforms.uCharge.value = pose.charge * 0.9 + pose.flare * 0.3;
      m.uniforms.uBreath.value = 0.6 + boil * 0.8;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? (m.userData.baseAmp = m.uniforms.uAmp.value);
      m.uniforms.uAmp.value = baseAmp * (1 + pose.flare * 0.45 + boil * 0.25);
      const baseA = (m.userData.baseA as number | undefined) ?? (m.userData.baseA = m.uniforms.uAlpha.value);
      m.uniforms.uAlpha.value = baseA * (1 + pose.flare * 0.35) * alpha;
    }
    for (const m of partMats.bile) {
      m.uniforms.uTime.value = t;
      // a bile enche a goela na carga e o veneno pisca mais forte ferido
      m.uniforms.uCharge.value = pose.charge * (1 + wound * 0.6) + crumble * 0.5;
      // alfa CONTIDA: plasma em opacity 1 virava bola de fogo-amarelo no print
      m.uniforms.uAlpha.value = Math.max(0, 0.85 * alpha);
    }

    // clarão SÓBRIO na boca do caldeirão (o fogo do caldeireiro; nunca blowout)
    const glow = glowRef.current;
    if (glow) {
      glow.scale.setScalar(0.5 + pose.charge * 0.22 + boil * 0.06);
      (glow.material as THREE.SpriteMaterial).opacity = Math.max(
        0,
        (0.05 + boil * 0.03 + pose.charge * 0.1) * alpha,
      );
    }

    // ---- corpo: plantado, afunda no brejo, respira com a fervura ----
    const g = rootRef.current;
    const idleSway = Math.sin(t * 0.34 + seed) * 0.012 + Math.sin(t * 0.8 + 1.9) * 0.006;
    const sink = 1 - pose.crouch * 0.06 - crumble * 0.16; // derrete para dentro da poça
    g.scale.set(
      1 + pose.bulge * 0.05 + crumble * 0.1,
      sink,
      1 + pose.bulge * 0.045 + crumble * 0.12,
    );
    g.rotation.y = idleSway + pose.twist;
    g.rotation.z = Math.sin(t * 0.29 + seed * 0.6) * 0.008;
    g.rotation.x = pose.crouch * 0.03 - pose.coil * 0.015 + crumble * 0.05;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.012 - crumble * 0.06;
    g.position.z = pose.stepZ;

    // ---- as 3 hidras: enrolam (encovam) e chicoteiam no cuspe ----
    for (const neck of necks) {
      // do meio cospe (chicote cheio); as laterais acompanham com atraso e
      // só abanam — a silhueta é de hidra, mas o tiro é um só
      const own = neck.id === 1 ? 1 : 0.45;
      const lag = neck.id === 1 ? 0 : 0.12;
      const pitch = pose.coil * (0.62 - neck.anchor[1] * 0.03) * own;
      const yaw = pose.twist * 0.4 + neck.side * pose.flare * 0.07 * own;
      const roll = neck.side * pose.coil * -0.1 * own;
      const e = tmpEuler.set(pitch, yaw, roll, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(e);
      for (const it of neck.items) {
        const mesh = partRefs.current[it.i];
        if (!mesh) continue;
        const part = visParts[it.i];
        tmpOff.set(it.off[0], it.off[1], it.off[2]).applyQuaternion(q);
        mesh.position.set(neck.anchor[0] + tmpOff.x, neck.anchor[1] + tmpOff.y, neck.anchor[2] + tmpOff.z);
        const b = it.base;
        if (part.tag === 'jaw') {
          // maxilar ESCANCA na descarga (a bica do cuspe) e trava quase
          // fechado na carga (segurando o globo de lodo)
          const gape = (sinceAttack >= 0 ? attackPose(Math.max(0, sinceAttack - lag)).gape : 0) * own;
          mesh.rotation.set(b[0] + gape * 0.75, b[1], b[2]);
        } else {
          mesh.rotation.set(b[0] + pitch * 0.35, b[1] + yaw * 0.5, b[2] + roll * 0.5);
        }
        let sc = 1;
        if (part.tag === 'neck') sc *= 1 + pose.charge * 0.06 * own; // a goela enche
        if (part.tag === 'gullet') sc *= 1 + pose.charge * 0.5 * own; // a bile incha
        if (part.tag === 'drip') {
          // o fio de lodo estica na carga e ARREBENTA no cuspe
          const stretch = 1 + pose.charge * 0.9 - (pose.coil > 0.4 ? 0.7 : 0);
          mesh.scale.set(1, Math.max(0.35, stretch), 1);
        }
        if (sc !== 1) mesh.scale.setScalar(sc);
      }
    }

    // ---- peças de fora: juncos, musgo, gás, fogo-fátuo ----
    const swing = (i: number, amp: number) =>
      Math.sin(t * (0.8 + (i % 4) * 0.13) + i * 1.7 + seed) * amp;
    for (const i of sway.reeds) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const b = visParts[i].r ?? [0, 0, 0];
      mesh.rotation.set(b[0] + swing(i, 0.05 + pose.flare * 0.12), b[1], b[2] + swing(i + 3, 0.04));
    }
    for (const i of sway.moss) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const b = visParts[i].r ?? [0, 0, 0];
      mesh.rotation.set(b[0] + swing(i, 0.07), b[1], b[2] + swing(i + 5, 0.06 + pose.flare * 0.1));
    }
    for (const i of sway.gas) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      // o gás do brejo RASTEJA: sobe pouco, alarga e some, e incha na carga
      const cyc = ((t * (0.32 + (i % 3) * 0.07) + i * 0.31 + seed * 0.1) % 1 + 1) % 1;
      const puff = 0.7 + cyc * 0.75 + pose.flare * 0.35;
      mesh.scale.setScalar(puff);
      mesh.position.y = visParts[i].p[1] + cyc * 0.5;
      mesh.position.x = visParts[i].p[0] + swing(i, 0.09);
    }
    for (const i of sway.wisps) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      // fogo-fátuo: flutua em vaivém preguiçoso e pisca (iscando o brejo)
      const bob = Math.sin(t * (0.55 + (i % 3) * 0.11) + i * 2.3 + seed) * 0.16;
      mesh.position.set(
        visParts[i].p[0] + Math.sin(t * 0.34 + i * 1.9 + seed) * 0.22,
        visParts[i].p[1] + bob,
        visParts[i].p[2] + Math.cos(t * 0.28 + i * 1.3 + seed) * 0.18,
      );
      const blink = 0.7 + 0.5 * Math.sin(t * (2.4 + i * 0.6) + i * 3.1);
      mesh.scale.setScalar(Math.max(0.25, blink) * (1 + pose.charge * 0.3));
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
      <sprite ref={glowRef} position={[0.32, 2.12, -0.66]} scale={0.5}>
        <spriteMaterial
          map={circleTexture()}
          color={PANTANO_POISON}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
