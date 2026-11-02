import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do VULCANICO (Nv.8 — obsidiana+plasma: o VULCAO DE NOVE ESTRATOS, a
 * `catástrofe andante`), plantado: `moveSpeed 0`, alvo `closest`, `heavy` +
 * `splash 2,0` + `burn 0,4` — o tiro nasce DA BOCA da montanha. Zero shader
 * novo: a rocha é o `stoneShaders` lido em BASALTO DE TINTA (cru, salpicado,
 * trinca de lava acesa) e em TUFO CLARO (máscara da face, soalho da caldeira e
 * merlões); a lava do lago, das veias e dos olhos é o `makeCoreMaterial` do
 * Plasma/Raio. A identidade é UMA cor do motor ao impacto:
 * `#ff4d12` = projectileColor do motor = VISUALS.vulcanico.glow = uCrack de
 * toda a pedra = uGold das veias/lago/bomba. A brasa `#ff9d3d`
 * (= VISUALS.vulcanico.accent) é SEMPRE acento: olhos, coração, fagulhas e os
 * anéis do FX — nunca corpo.
 *
 * Diferença dura contra os pais, o irmão e o tio:
 *  - OBSIDIANA (mãe, Nv.7) e PLASMA (pai, Nv.7): vidro roxo ESPELHADO e ferro
 *    com centelha ROSA. Aqui a pedra é CRUA fosca sem metal e a luz é LAVA
 *    encarnada (#ff4d12, nunca rosa);
 *  - MAGMA (tio, Nv.6, o golem de lava): barro cozido (#5a4038, r >> g) com
 *    mamelões redondos e lava em MANCHA. Aqui a tinta é de BASALTO (b ≥ r), a
 *    forma é GEOMETRIA de nove estratos de nove faces e a lava é VEIA reta de
 *    nove faces descosturada na rocha — risco zero de ler "a mesma espécie";
 *  - Geodo (irmão Nv.8): CINCO faces em tudo e pedra CLARA maioria. Aqui é
 *    NOVE EM TUDO (todo `cyl`/`cone` do figurino tem nove faces; nove estratos,
 *    nove veias, nove fumarolas, nove merlões, nove esporões, nove pingos, três
 *    cintas de nove) e o corpo é ESCURO com a máscara Clara por cima.
 *
 * Coreografia (janela 0,98 s, 65% de afinação — a segunda mais lenta da árvore,
 * só atrás do Geodo 0,714 s; acima de Abissal 0,552 e Cósmico 0,533): a
 * montanha TREME cada vez mais (nada de vergar — montanha não verga, o tremor
 * é sísmico), o LAGO DE LAVA incha acima do poço, as NOVE TAMPAS de escória das
 * fumarolas erguem na beirada, os cones-parasitas escoram no empuxo e as brasas em
 * órbita aceleram; no tiro a tampa do poço ESTOURO para dentro, a onda de
 * choque devolve o tremor e a pluma de cinza quente sobe.
 */

export const VULCAN_ATTACK_WINDOW = 0.98;
/** fração da janela em que o vulcão carrega a erupção (o pow-wow sísmico) */
export const VULCAN_WINDUP = 0.64;

/** A lava do vulcão: a identidade única (encarnada, nunca o laranja-amarelado
 *  do Magma nem o rosa do Plasma) — do motor ao anel de queimadura no chão */
export const VULCAN_LAVA = '#ff4d12';
/** a brasa da espécie (= VISUALS.vulcanico.accent): sempre acento, nunca a
 *  cor principal (a regra da árvore para a segunda cor) */
export const VULCAN_EMBER = '#ff9d3d';

const VULCAN_DEF = getSpecies('vulcanico');

/**
 * O LAGO DE LAVA na caldeira (amarrado em teste): o disco de NOVE FACES que
 * ferve no soalho claro da cratera, dentro do poço de breu. A silhueta do disco
 * é a silhueta da bomba (o fuso de nove faces que o `heavy` cospe) — o tiro é
 * um naco do próprio lago voando.
 */
export const VULCAN_CORE_POS: [number, number, number] = [0, 3.95, 0];

/**
 * O ARO das NOVE FUMAROLAS (amarrado em teste): cada tampa de escória gira na
 * tangente do aro de raio `VULCAN_VENT_RIM` no plano `VULCAN_VENT_Y` — a MESMA
 * receita de dobradiça do geodo (o irmão): a tampa tem a própria base abaixo do
 * plano do aro, então a rotação é dobradiça, não tampa voando solta.
 */
export const VULCAN_VENT_RIM = 0.58;
export const VULCAN_VENT_Y = 4.15;

/** pivô do cone-parasita (amarrado em teste): o ombro INTEIRO — cone, cratera
 *  acesa e bloco de escória — rocks no plinto. O PLINTO plantado no estrato
 *  (`arm.plinth`) NUNCA gira: é fundação (a regra do contraforte do Geodo). */
export const VULCAN_ARM_PIVOT: [number, number, number] = [1.14, 0.78, 0.46];

export interface AttackPose {
  quake: number; // 0..1: o tremor sísmico (montanha não verga — treme)
  dome: number; // 0..1: o lago de lava incha acima do poço (a tampa saltando)
  heave: number; // os cones-parasitas escoram no empuxo / socam no coice
  burst: number; // 0..1: o instante do estouro — tampas erguem de vez, plume estala
  plume: number; // cinza quente e brasas: vigor da coluna que sobe da cratera
  flare: number; // esporões e cristas se eriçam, órbitas aceleram
  charge: number; // 0..1: veias acendem, olhos inflam, lago clareia
}

/**
 * Coreografia da montanha: o tempo todo é a erupção CHEIANDO — tremor que
 * aperta, lago que infla, tampas que batem no aro. Comparação da árvore:
 * Geodo 1,05 / 0,68, Abissal 0,92 / 0,60, Cósmico 0,86 / 0,62.
 */
export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    quake: 0,
    dome: 0,
    heave: 0,
    burst: 0,
    plume: 0,
    flare: 0,
    charge: 0,
  };
  if (since < 0 || since > VULCAN_ATTACK_WINDOW) return P;
  const p = since / VULCAN_ATTACK_WINDOW;
  if (p < VULCAN_WINDUP) {
    // o magma sobe: potências altas (=1,5) deixam o começo quase parado e o fim
    // quase desbocado (a montanha perde o controle aos poucos)
    const k = (p / VULCAN_WINDUP) ** 1.5;
    P.quake = 0.55 * k;
    P.dome = 0.85 * k;
    P.heave = 0.45 * k;
    P.plume = 0.45 * k;
    P.flare = 0.75 * k;
    P.charge = k;
    return P;
  }
  const r = (p - VULCAN_WINDUP) / (1 - VULCAN_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.18)) ** 2; // o tampo sai quase junto
  const decay = 1 - Math.max(0, (r - 0.4) / 0.6);
  P.quake = (0.55 + 0.6 * a) * decay; // a erupção treme mais que a afinação
  P.dome = (0.85 - 1.4 * a) * decay; // o lago esvazia: o naco foi embora
  P.heave = (0.45 - 1.25 * a) * decay; // os parasitas socam no coice
  P.burst = a * decay; // as nove tampas abrem de vez no estouro
  P.plume = (0.45 + 1.7 * a) * decay; // a coluna de cinza quente estoura
  P.flare = (0.75 + 0.4 * a) * decay;
  P.charge = (1 - 0.75 * a) * decay;
  return P;
}

/**
 * O BASALTO DE TINTA (estratos, esporões, entulho, parasitas): cru, fosco e
 * FRIOR — a tinta do basalto (b ≥ r) contra o barro cozido do tio Magma (r >> g)
 * e o vidro espelhado da mãe Obsidiana. A trinca é a LAVA do motor (#ff4d12),
 * acesa mas contida: glow 0,45 × boost 1,05 — aqui a rocha QUASE arde (é o
 * vulcão da árvore); quem arde de verdade é só o lago e as veias.
 */
export const BASALT_VULC_LOOK = {
  rockA: '#443c42',
  rockB: '#1e1a20',
  crack: VULCAN_LAVA,
  crackGlow: 0.45,
  crackScale: 1.7, // veio CURTO e nervoso de basalto (corpo grande = pedra miúda)
  crackWidth: 0.05,
  crackBoost: 1.05,
  speck: 0.5, // salpicado fino de cinza colada na rocha
  amp: 0.03,
};

/** o breu do basalto (parasitas, esporões, fumarolas, entulho escuro) */
export const BASALT_VULC_DEEP_LOOK = {
  ...BASALT_VULC_LOOK,
  rockA: '#2c262c',
  crackGlow: 0.32,
  amp: 0.026,
};

/**
 * O TUFO CLARO (máscara da face, soalho da caldeira, saia da borda, merlões,
 * queixo e barbatanas): pedra clara de cinza cimentada — é ela que faz a boca
 * da montanha e a cara lerem no print miúdo (a máscara do Geodo invertida: aqui
 * o corpo é escuro e a placa é clara). Veio CONTIDO: glow 0,22 × boost 0,5 — a
 * luz da espécie vem do lago e das veias, não da cantaria.
 */
export const TUFF_VULC_LOOK = {
  rockA: '#6e6157',
  rockB: '#463d36',
  crack: VULCAN_LAVA,
  crackGlow: 0.22,
  crackScale: 1.4,
  crackWidth: 0.05,
  crackBoost: 0.5,
  speck: 0.4,
  amp: 0.012,
};

/** O LAGO, as NOVE VEIAS, as crateras e a boca acesa: a lava do motor fervendo
 *  por fora da rocha — o miolo quase creme-escaldado, nunca #ffffff puro */
export const LAVA_LOOK = {
  gold: VULCAN_LAVA, // = a cor do motor (identidade caldeira→veia→bomba→anel)
  white: '#ffd9a8',
  cool: '#83280f',
  amp: 0.05,
};

/** os olhos e o coração da face: a brasa #ff9d3d na frente de tudo (o único
 *  contraste que lê no card miúdo) — sempre acento, nunca corpo */
export const EMBER_HEART_LOOK = {
  gold: VULCAN_EMBER,
  white: '#ffecd2',
  cool: VULCAN_LAVA,
  amp: 0.014,
};

/** a escória das nove fumarolas e dos nove pingos: pedra furada com a trinca
 *  da brasa (acento) — a crosta friável que a erupção arranca */
export const SCORIA_VULC_LOOK = {
  ...BASALT_VULC_DEEP_LOOK,
  crack: VULCAN_EMBER,
  crackGlow: 0.5,
};

export interface VulcanRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o VULCAO usa — a cinza QUENTE que a cratera exala no
   *  arremesso é fuligem de fogo, não pozolana fria (a Geodo guardou heat 0, o
   *  abissal heat 0,03 — o vulcão é dono do calor) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpHinge = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

export function VulcanRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: VulcanRigProps) {
  const modelDef = MODELS.vulcanico;
  const level = Math.max(
    VULCAN_DEF.levelMin,
    Math.min(VULCAN_DEF.levelMax, Math.round(levelProp ?? VULCAN_DEF.levelMin)),
  );
  const moteCount = embers ?? 26;
  const topY = formTop(VULCAN_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** peças semânticas: o cone-parasita INTEIRO (cone + cratera + bloco) rocks no
   *  plinto do ombro (menos o plinto plantado); as NOVE TAMPAS de escória giram na
   *  dobradiça do aro das fumarolas (mesmo ângulo para todas = a coroa abre junto);
   *  as brasa de fundo das fumarolas inflam no estouro; as cristas de cinza atrás
   *  eriçam. As três cintas em órbita (brasas/escórias/vaga-lumes) são grupos
   *  orbitais, não atores */
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1 }[] = [];
    const caps: number[] = [];
    const capEmbers: number[] = [];
    const crests: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      if (tag.startsWith('arm') && tag !== 'arm.plinth') arms.push({ i, side });
      else if (tag === 'vent.cap') caps.push(i);
      else if (tag === 'vent.ember') capEmbers.push(i);
      else if (tag === 'crest') crests.push(i);
    });
    return { arms, caps, capEmbers, crests };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // o breu do POÇO e das órbitas faciais: claro-sobre-escuro é o único
    // contraste que lê no card miúdo (a regra das manchas brutas da árvore)
    const kernel = new THREE.MeshBasicMaterial({ color: '#160d0c' });
    const cache = new Map<string, THREE.ShaderMaterial>();
    const pick = (key: string, make: () => THREE.ShaderMaterial) => {
      let m = cache.get(key);
      if (!m) {
        m = make();
        cache.set(key, m);
      }
      return m;
    };
    const list = visParts.map((p, i) => {
      const tag = p.tag ?? '';
      if (p.m === 'black') return kernel;
      if (p.m === 'white')
        return pick(`ember|${i % 2}`, () =>
          makeCoreMaterial({
            gold: EMBER_HEART_LOOK.gold, // = a brasa da espécie (olhos/coração)
            white: EMBER_HEART_LOOK.white,
            cool: EMBER_HEART_LOOK.cool,
            amp: EMBER_HEART_LOOK.amp,
            seed: 3.4 + (i % 2) * 2.7,
          }),
        );
      if (p.m === 'glow')
        return pick(`lava|${i % 2}`, () =>
          makeCoreMaterial({
            gold: LAVA_LOOK.gold, // = a cor do motor (veias/lago/boca acesas)
            white: LAVA_LOOK.white,
            cool: LAVA_LOOK.cool,
            amp: tag === 'vein' || tag === 'drip' ? LAVA_LOOK.amp * 0.6 : LAVA_LOOK.amp,
            seed: 8.1 + (i % 2) * 3.2,
          }),
        );
      if (p.m === 'accent')
        return pick(`tuff|${tag === 'mask' || tag === 'boss' ? 'face' : 'hard'}|${i % 2}`, () =>
          makeStoneMaterial({
            rockA: TUFF_VULC_LOOK.rockA,
            rockB: TUFF_VULC_LOOK.rockB,
            crack: TUFF_VULC_LOOK.crack, // = a cor do motor (identidade na pedra clara)
            // a MÁSCARA e o soalho da caldeira são lisos: rosto/cratera
            // serrilhados = mancha no print (a lição da máscara da Névoa)
            amp: tag === 'mask' || tag === 'boss' || tag === 'caldera' ? 0.006 : TUFF_VULC_LOOK.amp,
            crackGlow: TUFF_VULC_LOOK.crackGlow,
            crackScale: TUFF_VULC_LOOK.crackScale,
            crackWidth: TUFF_VULC_LOOK.crackWidth,
            crackBoost: TUFF_VULC_LOOK.crackBoost,
            speck: TUFF_VULC_LOOK.speck,
            seed: seed + (i % 2) * 2.9,
            breath: tag === 'caldera' || tag === 'rim' || tag === 'merlon' ? 0.3 : 0.55, // a borda da cratera não respira
            teamColor: TEAM_TINT.neutral,
          }),
        );
      const deep = p.m === 'dark';
      const L = deep ? BASALT_VULC_DEEP_LOOK : BASALT_VULC_LOOK;
      return pick(`basalt|${deep ? 'deep' : 'rock'}|${i % 2}`, () =>
        makeStoneMaterial({
          rockA: L.rockA,
          rockB: L.rockB,
          crack: L.crack, // = a cor do motor (a trinca de lava do basalto)
          amp: tag === 'rubble' || tag === 'toe' || tag === 'scree' ? L.amp * 0.8 : L.amp,
          crackGlow: L.crackGlow,
          crackScale: L.crackScale,
          crackWidth: L.crackWidth,
          crackBoost: L.crackBoost,
          speck: L.speck,
          seed: seed + (i % 2) * 3.1,
          breath: 0.5,
          teamColor: TEAM_TINT.neutral,
        }),
      );
    });
    const shaders = [...cache.values()];
    for (const m of shaders) {
      // o traje manda nos uniforms (cascos sem uSpeck não podem ser escritos
      // pelo loop — a regra do guard por uniforme, não por sorte)
      const fs = m.fragmentShader;
      m.userData.kind = fs.includes('uSpeck') ? 'stone' : 'core';
    }
    return { list, uniq: [...cache.values(), kernel], shaders };
  }, [visParts, seed, level]);

  // O LAGO DA CALDEIRA: disco de NOVE FACES (o DNA do vulcão) com a lava do
  // motor fervendo por cima do breu do poço. Denso porque é a peça que vira
  // PROJÉTIL na imaginação do bicho — a silhueta do lago é a silhueta da bomba.
  const core = useMemo(
    () => ({
      geo: new THREE.CylinderGeometry(0.5, 0.38, 0.16, 9, 2),
      mat: makeCoreMaterial({
        gold: LAVA_LOOK.gold, // = a cor do motor (identidade lago→bomba→anel)
        white: LAVA_LOOK.white,
        cool: LAVA_LOOK.cool,
        amp: 0.07,
        seed: 5.7,
      }),
    }),
    [],
  );

  // BRASAS QUE SOBEM DA CALDEIRA: o oposto do pó que desce do Geodo — aqui a
  // montanha está sempre de fogo aceso e as fagulhas sobem tortas, apagando do
  // creme-escaldado na boca para a brasa encarnada no alto. uCharge aperta a
  // coluna na afinação; uBurst dá o tranco do estouro.
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

  // pedra/lago/núcleo leem aSeed por peça; clonamos só os que usam
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
      core.geo.dispose();
      core.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, core, motes]);

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
      if (demoT.current > VULCAN_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const crumble = 1 - alpha; // morrendo: o vulcão desaba e o lago apaga
    const striking =
      sinceAttack >= VULCAN_ATTACK_WINDOW * VULCAN_WINDUP && sinceAttack <= VULCAN_ATTACK_WINDOW;
    if (!striking) strikeDone.current = false;

    // ---- CINZA QUENTE na cratera no instante do arremesso (o naco de lava sai
    // cuspindo pluma; heat 0,6 = cinza incandescente, o calor que o Geodo e o
    // Abissal negaram e este vulcão é dono) ----
    if (striking && !strikeDone.current && smoke) {
      strikeDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 9; i++) {
        // NOVE baforadas: o nove da montanha até na pluma
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.7;
        tmpWorld
          .set(
            VULCAN_CORE_POS[0] + Math.cos(a) * (0.15 + Math.random() * 0.35),
            VULCAN_CORE_POS[1] + 0.25 + Math.random() * 0.25,
            VULCAN_CORE_POS[2] + Math.sin(a) * (0.15 + Math.random() * 0.35),
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.13 + Math.random() * 0.09,
          heat: 0.6, // CINZA QUENTE: a brasa ainda acesa no miolo da pluma
          life: 1.1 + Math.random() * 0.7,
          lifeVar: 0.4,
          jitter: 0.3,
          rise: 0.9,
          drag: 2.4,
          vx: (Math.random() - 0.5) * 0.9,
          vy: 1.1 + Math.random() * 1.1,
          vz: (Math.random() - 0.5) * 0.9,
        });
      }
    }

    // ---- uniforms: basalto, tufo e núcleos de lava/brasa no MESMO loop ----
    const rumble =
      Math.sin(t * 0.7 + seed) * 0.35 + Math.sin(t * 1.9 + seed * 0.6) * 0.25 +
      Math.sin(t * 0.33 + 1.7) * 0.4; // o vulcão ronca como fole de forja
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'core' ? 0.16 : 0.26);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1.25 : 0.8) + crumble * 0.4);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = rumble * (0.5 + 0.5 * hpFrac) + pose.quake * 0.45;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: a rocha racha e o entulho esfarela; ferido: quase não muda
      // (a lição do Cristal — uHurt alto com uAmp grande serrilha o figurino)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + crumble * 1.9 + pose.quake * 0.25);
      // a AFINAÇÃO acende a trinca da pedra e a lava: a montanha inteira fica
      // mais vermelha conforme o lago enche (o magma procurando a saída)
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.7);
      }
    }

    // ---- o LAGO na caldeira: infla, arde, e esvazia no tiro ----
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 1.3 + pose.burst * 0.6 + crumble * 0.5);
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.94 + 0.07 * Math.sin(t * 1.9 + seed) + 0.04 * Math.sin(t * 3.7 + seed * 1.3);
    coreRef.current.scale.setScalar(Math.max(0.12, boil * (1 + pose.dome * 0.3) * (1 - crumble * 0.5)));
    // giro LENTO (é lava viscosa, não pião): as nove faces têm que ler no print
    coreRef.current.rotation.y = t * 0.32 + seed;
    coreRef.current.position.set(
      VULCAN_CORE_POS[0],
      VULCAN_CORE_POS[1] + Math.max(0, pose.dome) * 0.16 + Math.sin(t * 2.6 + seed) * 0.015,
      VULCAN_CORE_POS[2],
    );
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.36 + pose.charge * 0.34 + pose.burst * 0.24);
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.02 * Math.sin(t * 2.3 + seed) + pose.charge * 0.1 + pose.burst * 0.09) * alpha,
    );
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 0.6 + pose.burst * 1.2);

    // ---- corpo: PLANTADO na própria catarata de escória. A montanha NÃO verga
    // (nada de lean) — ela TREME: o tremor é sísmico, de alta frequência e
    // amplitude menor que a própria base (0,03 < 2,2 de raio: nunca desliza) ----
    const g = rootRef.current;
    const breathe = Math.sin(t * 0.5 + seed) * 0.006;
    g.scale.set(
      1 + pose.dome * 0.012 + breathe + crumble * 0.05, // o empuxo do lago alarga o flanco
      1 + pose.dome * 0.02 + breathe - crumble * 0.16, // e ergue a montanha um dedo
      1 + pose.dome * 0.012 + breathe + crumble * 0.05,
    );
    g.position.x = Math.sin(t * 46 + seed) * 0.03 * pose.quake;
    g.position.z = Math.cos(t * 41 + seed * 0.7) * 0.026 * pose.quake;
    g.rotation.y = Math.sin(t * 0.26 + seed) * 0.01;
    g.rotation.z = Math.sin(t * 0.21 + seed * 0.5) * 0.006 + crumble * 0.12; // desabando: tomba
    g.rotation.x = Math.sin(t * 51 + seed * 1.3) * 0.02 * pose.quake + crumble * 0.1;

    // ---- três cintas em movimento em três alturas que nunca se tocam: nove
    // brasas acima da caldeira (0), nove escórias raspando o cone no sentido
    // CONTRARIO (1) e nove vaga-lumes de lava rente ao sopé (2). A afinação aqui
    // é VELOCIDADE (o empuxo térmico acelera as cintas), não tremor ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.plume * 1.4);
    }

    // ---- cones-parasitas: o CONE INTEIRO (cone + cratera + bloco) rocks no
    // plinto. Pouco: são rochas empurradas pelo empuxo, não braços de borracha;
    // o plinto plantado (`arm.plinth`) fica parado — é fundação ----
    const [pvX, pvY, pvZ] = VULCAN_ARM_PIVOT;
    const armZ = pose.heave * 0.16; // escora no empuxo ao carregar, soca no coice
    const armX = pose.heave * 0.1;
    for (const a of actors.arms) {
      const mesh = partRefs.current[a.i];
      if (!mesh) continue;
      const part = visParts[a.i];
      const base = part.r ?? [0, 0, 0];
      tmpEuler.set(armX, 0, a.side * (armZ + pose.flare * 0.02));
      tmpQ.setFromEuler(tmpEuler);
      tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2]));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld
        .set(part.p[0] - pvX * a.side, part.p[1] - pvY, part.p[2] - pvZ)
        .applyQuaternion(tmpQ);
      mesh.position.set(pvX * a.side + tmpWorld.x, pvY + tmpWorld.y, pvZ + tmpWorld.z);
      const k = 1 + pose.charge * 0.02;
      const bs = part.s ?? [1, 1, 1];
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- AS NOVE TAMPAS DA FUMAROLA: a COROA da assinatura. A tampa e a brasa
    // por baixo giram na MESMA dobradiça tangencial do aro (a receita do geodo)
    // — erguer a tampa é o respirar da fumarola; no estouro as nove abrem de
    // vez e a brasa por baixo vira vista ----
    const capOpen =
      0.12 + 0.05 * Math.sin(t * 1.6 + seed) + pose.dome * 0.28 + pose.burst * 0.7;
    for (const i of actors.caps) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const phi = Math.atan2(part.p[2], part.p[0]);
      const rx = Math.cos(phi) * VULCAN_VENT_RIM;
      const rz = Math.sin(phi) * VULCAN_VENT_RIM;
      tmpHinge.set(-Math.sin(phi), 0, Math.cos(phi));
      tmpQ.setFromAxisAngle(tmpHinge, -capOpen); // para FORA/de cima: a fumarola abre
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      tmpPivot.set(rx, VULCAN_VENT_Y, rz);
      tmpWorld.set(part.p[0] - rx, part.p[1] - VULCAN_VENT_Y, part.p[2] - rz).applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
      const bs = part.s ?? [1, 1, 1];
      const k = 1 + pose.burst * 0.06;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- peças: as brasas das fumarolas inflam (fora da dobradiça, crescem no
    // lugar), as cristas de cinza atras eriçam, os pingos e as veias pulsam
    // quente, a face incha com a carga (a montanha range com o fogo na garganta) ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh || part.tag?.startsWith('arm') || part.tag === 'vent.cap') continue;
      let sc = 1;

      if (part.tag === 'vent.ember') {
        // a brasa por baixo da tampa: cresce quando a tampa ergue (a fumarola
        // respirando); sem tampa erguida quase não se vê
        sc *= 0.75 + pose.dome * 1.1 + pose.burst * 0.6;
      } else if (part.tag === 'crest') {
        // barbatanas de cinza atrás da caldeira: esticam na afinação
        sc *= 1 + pose.charge * 0.06;
      } else if (part.tag === 'vein' || part.tag === 'drip') {
        // as veias do motor: engrossam quando o lago enche (a lava subindo)
        sc *= 1 + pose.charge * 0.07 + Math.sin(t * (3.8 + (i % 5) * 0.9) + i * 1.4) * 0.02 * pose.charge;
      } else if (part.tag === 'heart' || part.tag === 'eye') {
        // coração/olhos da face: a luz sobe — incham com a carga
        sc *= 1 + pose.charge * 0.1 + Math.sin(t * (4.4 + (i % 4) * 1.2) + i * 1.9) * 0.02 * pose.charge;
      } else if (part.tag === 'mouth.lava') {
        // a boca vaza mais conforme a erupção cresce (a montanha range)
        sc *= 1 + pose.charge * 0.35;
      }

      if (part.flick) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      }
      if (sc !== 1) {
        // escala NÃO uniforme preservada (os entulhos achatados viravam bolinha
        // pulsando com setScalar)
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }
    void topY; // topo amarrado nos testes; forma única Nv.8
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
            // só a rocha projeta sombra: lava, brasa e o poço são luz/breu e
            // viravam bloco preto no piso (a lição do funil da Névoa)
            castShadow={part.m === 'body' || part.m === 'dark' || part.m === 'accent'}
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
      {/* O LAGO na caldeira: o disco de nove faces com a lava do motor fervendo
          por cima do breu — é dele que o `heavy`+`splash`+`burn` arranca o naco
          voante, então a silhueta do tiro é a silhueta da cratera */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} position={VULCAN_CORE_POS} />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite
        ref={coreGlowRef}
        position={[VULCAN_CORE_POS[0], VULCAN_CORE_POS[1] + 0.22, VULCAN_CORE_POS[2]]}
        scale={0.38}
      >
        <spriteMaterial
          map={circleTexture()}
          color={VULCAN_EMBER}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * BRASAS que SOEM da caldeira (o oposto do pó que desce do Geodo): sobem em
 * espiral que APERTA (a chaminé sugando), nacaradas de creme-escaldado na boca
 * e esfriando para a brasa encarnada no alto — nunca farrapo de vapor nem
 * confete frio. uCharge (a afinação) acelera e alarga a coluna.
 */
const MOTE_VERT = /* glsl */ `
attribute vec3 aRand; // x: angulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.55 + 0.55 * aRand.z;
  float prog = fract(uTime * speed * 0.11 * (1.0 + uCharge * 1.8) + aRand.y);
  // subindo e FECHANDO em funil (a chaminé da montanha), com deriva torta de cinza
  float ang = aRand.x * 6.28318 + prog * (1.3 + 2.1 * aRand.z) + uTime * 0.11;
  float r = (0.52 + 0.3 * aRand.z) * (1.0 - prog * 0.55) + 0.04 * sin(uTime * 2.1 + aRand.x * 7.0);
  float y = 3.92 + prog * (2.3 + 0.9 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // brasa miuda com miolo duro: nunca o fiapo macio do vapor
  float size = (1.6 + 2.6 * aRand.z) * (0.9 + uCharge * 0.7) * uSizeMul * (1.0 - prog * 0.35);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce na boca da caldeira e morre no topo da coluna
  vA = smoothstep(0.0, 0.1, prog) * (1.0 - smoothstep(0.5, 1.0, prog)) * uAlpha;
  // esfriando: creme-escaldado na boca -> brasa encarnada -> brasa morta no alto
  vec3 hot = vec3(1.0, 0.85, 0.55);
  vec3 mid = vec3(1.0, 0.3, 0.07);
  vC = mix(hot, mid, smoothstep(0.05, 0.55, prog));
  vC = mix(vC, vec3(0.42, 0.09, 0.03), smoothstep(0.6, 1.0, prog));
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // miolo duro com halo minimo (brasa, nao puff)
  float m = smoothstep(0.5, 0.14, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.4);
}
`;
