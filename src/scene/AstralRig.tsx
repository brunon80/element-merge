import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel, ASTRAL_DISK_Y, ASTRAL_TILT } from './speciesModels';
import type { Part } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do ASTRAL (Nv.9 — Cósmico+Abissal: o TITÃO DE ESPIRAL BARRADA, o
 * `titão celestial`), plantado por ONZE raízes de gravidade. A assinatura é o
 * DISCO GIRANDO: bojo, barra e onze braços são um corpo rígido só (grupo 3) e
 * as três cintas orbitais giram cada uma na SUA velocidade — rotação
 * diferencial, o motor visual da espécie (no print/na série de frames o disco
 * borra em espiral e a cauda de maré fica plantada). A cara fica LEVANTADA
 * ACIMA do plano do disco, num pescoço de gravidade, para os braços varrerem
 * POR BAIXO dela.
 *
 * Zero shader novo de pedra: o vazio é o `stoneShaders` lido em GRAFITE-VIOLEU
 * (rocha do nada entre estrelas, com a trinca âmbar do bojo acesa por dentro)
 * e a geada é a mesma rocha em pedra-CLARA-de-estrela-jovem (máscara da cara,
 * nós dos braços, pontas dos jatos); a luz é o `makeCoreMaterial` do Raio lido
 * em âmbar-de-bojo com a geada no lugar do branco-escaldado. Só um shader
 * próprio: o PÓ DE DISCO — motes ORBITANDO no plano do disco com ω ∝ 1/ρ (o
 * gás da galáxia), o oposto do pó que sobe do chão para o peito no pai Cósmico.
 *
 * A coreografia (interval 1,2 — a cadência mais rápida da árvore, então a
 * afinação é a mais CURTA em tempo e a mais LONGA em fração): o disco
 * ENCURRUCA (o plano se inclina sobre o próprio bojo), a cabeça mira, a boca de
 * buraco negro abre o aro âmbar e no estouro o disco DESTORA em contra-rotação
 * e cospe poço, jatos e coroa. O par de cometas (doubleShot 0,5) sai da boca.
 */

const ASTRAL_DEF = getSpecies('astral');

/** janela e afinação. A cadência do astral é a mais rápida da árvore (interval
 *  1,2), então a JANELA é a mais curta da árvore (0,74 — o Cósmico tem 0,86, o
 *  Vulcânico 0,98, o Geodo 1,05) e a FRAÇÃO de afinação é a maior (0,7): o
 *  titã encurca o disco em 0,74·0,7 = 0,52 s e destora no estouro */
export const ASTRAL_ATTACK_WINDOW = 0.74;
export const ASTRAL_WINDUP = 0.7;

/** identidade amarrada em teste: âmbar-de-bojo (= projectileColor do motor =
 *  glow do figurino = uCrack de toda a rocha) e geada quase branca (= accent =
 *  máscara = nós dos braços = rastro do cometa) */
export const ASTRAL_STARLIGHT = '#ffb347';
export const ASTRAL_FROST = '#cfe4ff';
export const ASTRAL_VOID = '#2a2338';

/** a boca do buraco negro (de onde os cometas saem): no eixo da cabeça, na
 *  altura dos olhos, DENTRO do aro âmbar (`core.rim` em z 0,44+0,08) — a boca
 *  abre para a frente, não para dentro do crânio */
export const ASTRAL_CORE_POS: [number, number, number] = [0, 3.96, 0.44];

/** pivô do disco (o eixo da rotação diferencial) e pivô do pescoço (a cabeça
 *  bascula nele, não no chão) */
export const ASTRAL_DISK_PIVOT: [number, number, number] = [0, ASTRAL_DISK_Y, 0];
export const ASTRAL_NECK_PIVOT: [number, number, number] = [0, 3.05, 0.26];

/** a rocha do VAZIO: grafite-violetu, fosca e friorenta (o corpo do titã —
 *  nunca a pedra-lua azul da constelação do pai Cósmico), com a trinca âmbar
 *  do bojo acesa por dentro. O rockA é o mais CLARO da família do vazio de
 *  propósito: no print da arena (câmera longe) é a massa do bojo que tem que
 *  ler, senão sobram só os traços de luz e a galáxia vira lâmpada de lava */
export const VOID_ASTRAL_LOOK = {
  rockA: '#4a3c60',
  rockB: '#241d30',
  crack: ASTRAL_STARLIGHT,
  amp: 0.05,
  crackGlow: 0.5,
  crackScale: 1.15,
  crackWidth: 0.05,
  crackBoost: 1.15,
  speck: 1.45,
};

/** o breu das raízes de gravidade e do lado de fora da lente: a mesma rocha
 *  lida mais funda */
export const VOID_ASTRAL_DEEP_LOOK = {
  ...VOID_ASTRAL_LOOK,
  rockA: '#251d31',
  rockB: '#141019',
  amp: 0.04,
  crackGlow: 0.34,
  speck: 1.1,
};

/** a GEADA das estrelas jovens: pedra CLARA gelada (a máscara da cara, os nós
 *  dos braços, as pontas dos jatos) com o veio âmbar do bojo correndo por
 *  dentro — claro-sobre-escuro é o contraste que lê no card miúdo */
export const FROST_ASTRAL_LOOK = {
  rockA: '#e8f1ff',
  rockB: '#a8c2e2',
  crack: ASTRAL_STARLIGHT,
  amp: 0.026,
  crackGlow: 0.42,
  crackScale: 1.75,
  crackWidth: 0.03,
  crackBoost: 0.9,
  speck: 0.9,
};

/** o núcleo de luz SÓ PARA A BOCA (e o olho): o plasma aditivo do Raio é
 *  translúcido, `depthWrite:false` e DoubleSide — ótimo para uma goela de buraco
 *  negro, péssimo para peça ESTRUTURAL: a vara de 0,055 deixa ver a própria face
 *  de trás e o traço acumula até virar TÁBUA (foi o que afogou os onze braços e
 *  os onze jatos no segundo print). A cor é a mesma; o traje é outro. */
export const GALAXY_LOOK = {
  gold: ASTRAL_STARLIGHT,
  white: '#fff3da',
  cool: ASTRAL_FROST,
  amp: 0.05,
};

/** OS TRAÇOS DE LUZ DO TITÃ (fio dos onze braços, onze jatos, coroa e as duas
 *  cintas de matéria caindo): pedra OPACA escura com o VEIO aceso — a receita
 *  do `glow` do golem pai. Opaca é o ponto: só assim uma vara fina mantém a
 *  largura que o figurino pediu (o plasma do Raio, translúcido e DoubleSide,
 *  mostra a própria face de trás e o traço engorda até virar TÁBUA — foi o que
 *  afogou os onze braços no segundo print). E o âmbar do motor mora no VEIO,
 *  não na pedra: com 78 traços brilhando ao mesmo tempo, pedra âmbar somava no
 *  print da arena e a galáxia lia como LÂMPADA DE LAVA (o terceiro print). Bronze
 *  escuro por fora, #ffb347 por dentro — é assim que o bojo grafite e a geada
 *  voltam a existir na silhueta */
export const STARLIGHT_ASTRAL_LOOK = {
  rockA: '#a4611f',
  rockB: '#3f2410',
  crack: ASTRAL_STARLIGHT,
  crackGlow: 1.5,
  crackScale: 2.4,
  crackWidth: 0.035, // VEIA FINA: numa vara de 0,09, veio largo cobre a peça
  // inteira e o traço lê UMA MANCHA âmbar — o inverso do pedido
  crackBoost: 1.3,
  speck: 0.7,
  amp: 0.04,
};

/** estrela-olho: geada quase branca com o âmbar do bojo no aro */
export const EYE_ASTRAL_LOOK = {
  gold: ASTRAL_FROST,
  white: '#f4f9ff',
  cool: ASTRAL_STARLIGHT,
  amp: 0.012,
};

export interface AstralRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** motes do disco (o gás orbital em rotação diferencial) — TRINTA E TRÊS:
   *  três cintas de onze, o onze do titã até no pó */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o ASTRAL usa — no estouro a boca exala PO DE ESTRELA
   *  morno (heat 0,25: nem a cinza incandescente do Vulcânico (0,6), nem o pó
   *  frio e morto do Geodo (0) e do Abissal (0,03): é poço de galáxia acesa
   *  por dentro) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpWorld2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpAxis = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

const HEAD_TAGS = new Set([
  'head.column',
  'mask',
  'brow',
  'eye',
  'eye.pupil',
  'cheek',
  'chin',
  'core.rim',
  'core.pit',
]);

/**
 * A coreografia do titã: `flinch` é o disco ENCURRUCA (o plano inclina sobre o
 * próprio bojo — a galáxia se dobrando para dentro), `align` é a cabeça mirando
 * o alvo, `charge` é a boca de buraco negro abrindo o aro âmbar, `flare` ergue
 * jatos e coroa, `snap` é o DESTORO do disco em contra-rotação no estouro e
 * `quake` é o coice do eixo. Todos voltam a zero no fim da janela (continuidade
 * amarrada em teste) e os quatro são zero fora dela.
 */
export function attackPose(since: number) {
  const p = { flinch: 0, align: 0, charge: 0, flare: 0, snap: 0, quake: 0 };
  if (since < 0 || since > ASTRAL_ATTACK_WINDOW) return p;
  const u = ASTRAL_ATTACK_WINDOW;
  const w = u * ASTRAL_WINDUP;
  if (since < w) {
    const s = since / w;
    const ease = 1 - Math.pow(1 - s, 3);
    p.flinch = Math.sin(s * Math.PI) * 0.3; // encurca e volta a abrir
    p.align = ease;
    p.charge = Math.pow(s, 1.4);
    // o flare sobe CEDO no primeiro suspiro da afinação (o pow miúdo), senão ele
    // nascia em 0,16 no primeiro frame e o jato dava um solavanco de partida
    p.flare = 0.16 * Math.pow(s, 0.35) + 0.34 * ease;
  } else {
    const r = (since - w) / (u - w);
    const fall = Math.pow(1 - r, 2);
    const relax = 1 - Math.pow(r, 2.2); // a mira DEVOLVE no fim do coice (senão o
    // pescoço parava em 1 e zerava num frame só, cortando a continuidade)
    p.snap = Math.exp(-r * 6.5); // o tranco da contra-rotação
    p.flinch = -Math.sin(r * Math.PI) * 0.26; // o disco rebote para o outro lado
    p.align = relax;
    p.charge = fall;
    p.flare = (0.5 + fall * 1.15) * relax; // jatos e coroa estourando e assentando
    p.quake = fall;
  }
  return p;
}

export function AstralRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: AstralRigProps) {
  const modelDef = MODELS.astral;
  const level = Math.max(
    ASTRAL_DEF.levelMin,
    Math.min(ASTRAL_DEF.levelMax, Math.round(levelProp ?? ASTRAL_DEF.levelMin)),
  );
  const moteCount = embers ?? 33;
  const topY = formTop(ASTRAL_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);
  // giros ACUMULADOS (nunca `t * velocidade`: quando a carga mexe na
  // velocidade, ângulo absoluto daria salto — o disco tem que acelerar suave)
  const spins = useRef<Record<number, number>>({});

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** UMA wrapper por grupo orbital. A lição Contrário: nos rigs irmãos cada
   *  peça orbital ganhava um wrapper próprio e o mesmo ref era sobrescrito,
   *  então SÓ A ÚLTIMA peça do grupo orbitava. Aqui o grupo inteiro é um corpo
   *  rígido só — sem isso a rotação diferencial da galáxia não existe */
  const buckets = useMemo(() => {
    const plain: number[] = [];
    const byGroup = new Map<number, number[]>();
    visParts.forEach((p, i) => {
      if (p.group !== undefined && modelDef.groups?.[p.group] !== undefined) {
        const arr = byGroup.get(p.group) ?? [];
        arr.push(i);
        byGroup.set(p.group, arr);
      } else plain.push(i);
    });
    return { plain, orbitals: [...byGroup.entries()] };
  }, [visParts, modelDef]);

  /** atores da coreografia: a CABEÇA inteira (pescoço, placa, olhos, boca)
   *  bascula no pivô do pescoço; os jatos inflam e crescem no flare, as pontas
   *  de geada e a coroa acendem; as raízes pulsam a pressão */
  const actors = useMemo(() => {
    const head: number[] = [];
    const jets: number[] = [];
    const beads: number[] = [];
    const corona: number[] = [];
    const roots: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (HEAD_TAGS.has(tag)) head.push(i);
      else if (tag === 'jet.rod') jets.push(i);
      else if (tag === 'jet.bead') beads.push(i);
      else if (tag === 'corona') corona.push(i);
      else if (tag.startsWith('root')) roots.push(i);
    });
    return { head, jets, beads, corona, roots };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // A REGUA DO RELEVO (lição cara deste figurino): o shader desloca vértice AO
    // LONGO DA NORMAL e em PATAMAR (ruído `stepped`, borda dura), então uma
    // amplitude da ordem do raio da própria peça não dá "textura" — INFLA a
    // peça. No primeiro print os onze braços (varas de raio 0,085) comendo 0,05
    // de relevo viraram TÁBUAS de madeira e os onze jatos viraram canudos
    // gordos. Por isso a amplitude agora vem do TAMANHO DA PEÇA (meia-
    // dimensão menor da caixa dela), não do humor da espécie nem de uma tabela
    // de tags: peça miúda come relevo miúdo.
    const ampOf = (p: Part, base: number): number => {
      const g = getGeometry(p.g, p.a);
      if (!g.boundingBox) g.computeBoundingBox();
      // sem caixa não há régua e o relevo vem ZERO — liso sempre lê melhor do
      // que estufado (e as geo do catálogo sempre têm caixa, então nunca ocorre)
      const b = g.boundingBox ?? new THREE.Box3();
      const s = p.s ?? [1, 1, 1];
      const rMin =
        Math.min((b.max.x - b.min.x) * s[0], (b.max.y - b.min.y) * s[1], (b.max.z - b.min.z) * s[2]) / 2;
      // o valor entra ARREDONDADO na chave do cache de material (senão a primeira
      // vara vista empresta o seu relevo a todas as outras — a regra do cache: a
      // chave tem que conter tudo que muda o traje)
      return Math.round(Math.min(base, rMin * 0.25) * 200) / 200;
    };
    // o breu do POÇO e das órbitas de breu do olho: claro-sobre-escuro é o
    // único contraste que lê no card miúdo (a regra das manchas brutas da árvore)
    const kernel = new THREE.MeshBasicMaterial({ color: '#0b0812' });
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
        return pick(`eye|${i % 2}`, () =>
          makeCoreMaterial({
            gold: EYE_ASTRAL_LOOK.gold, // = a geada da espécie (a estrela-olho)
            white: EYE_ASTRAL_LOOK.white,
            cool: EYE_ASTRAL_LOOK.cool, // = o âmbar do bojo no aro do olho
            amp: EYE_ASTRAL_LOOK.amp,
            seed: 2.2 + (i % 2) * 2.7,
          }),
        );
      // figurino manda no relevo quando ele deu (`p.amp`), e a régua de tamanho
      // corta o resto — a amplitude vai DENTRO da chave do cache junto
      if (p.m === 'glow') {
        const amp = ampOf(p, p.amp ?? STARLIGHT_ASTRAL_LOOK.amp);
        // A BOCA E O OLHO são plasma de verdade: ali o aditivo é o efeito
        // pedido (goela de buraco negro). Todo o RESTA de `glow` é pedra âmbar
        // opaca com o veio aceso — traço estrutural não pode ser translúcido
        if (tag === 'core.rim')
          return pick(`galaxy|mouth`, () =>
            makeCoreMaterial({
              gold: GALAXY_LOOK.gold, // = a cor do motor (aro âmbar sobre breu)
              white: GALAXY_LOOK.white,
              cool: ASTRAL_VOID, // a boca é poço
              amp: ampOf(p, GALAXY_LOOK.amp),
              seed: 7.3,
            }),
          );
        return pick(`starlight|${amp}|${tag.startsWith('swarm') ? 'belt' : tag.startsWith('jet') ? 'jet' : 'arm'}|${i % 2}`, () =>
          makeStoneMaterial({
            rockA: STARLIGHT_ASTRAL_LOOK.rockA,
            rockB: STARLIGHT_ASTRAL_LOOK.rockB,
            crack: STARLIGHT_ASTRAL_LOOK.crack, // geada correndo no veio âmbar
            crackGlow: STARLIGHT_ASTRAL_LOOK.crackGlow,
            crackScale: STARLIGHT_ASTRAL_LOOK.crackScale,
            crackWidth: STARLIGHT_ASTRAL_LOOK.crackWidth,
            crackBoost: STARLIGHT_ASTRAL_LOOK.crackBoost,
            speck: STARLIGHT_ASTRAL_LOOK.speck,
            amp,
            seed: 7.3 + (i % 2) * 3.2,
            breath: tag.startsWith('arm') ? 0.25 : 0.45, // o disco não respira: gira
            teamColor: TEAM_TINT.neutral,
          }),
        );
      }
      if (p.m === 'accent') {
        const amp = ampOf(p, p.amp ?? FROST_ASTRAL_LOOK.amp);
        return pick(
          `frost|${amp}|${tag === 'mask' || tag === 'cheek' || tag === 'chin' ? 'face' : tag.startsWith('arm') || tag.startsWith('tail') || tag === 'jet.bead' ? 'star' : 'hard'}|${i % 2}`,
          () =>
            makeStoneMaterial({
              rockA: FROST_ASTRAL_LOOK.rockA,
              rockB: FROST_ASTRAL_LOOK.rockB,
              crack: FROST_ASTRAL_LOOK.crack, // = a cor do motor (veio âmbar na geada)
              amp,
              crackGlow: FROST_ASTRAL_LOOK.crackGlow,
              crackScale: tag === 'mask' ? FROST_ASTRAL_LOOK.crackScale * 1.4 : FROST_ASTRAL_LOOK.crackScale,
              crackWidth: FROST_ASTRAL_LOOK.crackWidth,
              crackBoost: FROST_ASTRAL_LOOK.crackBoost,
              speck: FROST_ASTRAL_LOOK.speck,
              seed: seed + (i % 2) * 2.9,
              breath: tag.startsWith('arm') || tag.startsWith('tail') ? 0.25 : 0.5, // o disco não respira: gira
              teamColor: TEAM_TINT.neutral,
            }),
        );
      }
      const deep = p.m === 'dark';
      const L = deep ? VOID_ASTRAL_DEEP_LOOK : VOID_ASTRAL_LOOK;
      const amp = ampOf(p, p.amp ?? L.amp);
      return pick(`void|${deep ? 'deep' : 'rock'}|${amp}|${i % 2}`, () =>
        makeStoneMaterial({
          rockA: L.rockA,
          rockB: L.rockB,
          crack: L.crack, // = a cor do motor (a trinca âmbar do bojo)
          amp,
          crackGlow: L.crackGlow,
          crackScale: tag === 'lens' || tag === 'nucleo' ? L.crackScale : L.crackScale * 1.6, // vara fina não comporta veio largo
          crackWidth: L.crackWidth,
          crackBoost: L.crackBoost,
          speck: L.speck,
          seed: seed + (i % 2) * 3.1,
          breath: 0.42,
          teamColor: TEAM_TINT.neutral,
        }),
      );
    });
    const shaders = [...cache.values()];
    for (const m of shaders) {
      // o traje manda nos uniforms (cascos sem uSpeck não podem ser escritos
      // pelo loop — a regra do guard por uniforme, não por sorte)
      m.userData.kind = m.fragmentShader.includes('uSpeck') ? 'stone' : 'core';
    }
    return { list, uniq: [...cache.values(), kernel], shaders };
  }, [visParts, seed, level]);

  // A BOCA DO BURACO NEGRO: disco de ONZE FACES (o DNA do titã) de breu com o
  // aro âmbar por fora — a silhueta do que cospe os cometas. Fica no eixo da
  // boca, DENTRO do aro (`core.rim`), e infla na afinação.
  const core = useMemo(
    () => ({
      geo: new THREE.CylinderGeometry(0.26, 0.22, 0.09, 11, 2),
      mat: makeCoreMaterial({
        gold: GALAXY_LOOK.gold, // = a cor do motor (identidade boca→cometa→anel)
        white: GALAXY_LOOK.white,
        cool: ASTRAL_VOID, // poço: o miolo é o vazio, não o branco
        amp: 0.055,
        seed: 4.9,
      }),
    }),
    [],
  );

  // PÓ DE DISCO: motes ORBITANDO o plano do disco com ω ∝ 1/ρ (os de dentro
  // dão mais voltas que os de fora — o mesmo motor visual dos onze braços). Um
  // terço escapa para cima rente aos jatos. Quente no bojo (âmbar), frio na
  // ponta dos braços (geada): a curva de cor da galáxia.
  const motes = useMemo(() => {
    const geo = makeMoteGeo(moteCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: DISK_DUST_VERT,
      fragmentShader: DISK_DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
        uSnap: { value: 0 },
        uDiskY: { value: ASTRAL_DISK_Y },
        uTilt: { value: ASTRAL_TILT }, // o gás orbita no PLANO INCLINADO do disco
        uWarm: { value: new THREE.Color(ASTRAL_STARLIGHT) },
        uCool: { value: new THREE.Color(ASTRAL_FROST) },
      },
    });
    return { geo, mat };
  }, [moteCount, emberScale]);

  // rocha/geada/núcleo leem aSeed por vértice (a lição WebKit); clonamos só os
  // que usam
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
      if (demoT.current > ASTRAL_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const dying = 1 - alpha; // morrendo: o disco para, o bojo apaga e a geada racha
    const striking =
      sinceAttack >= ASTRAL_ATTACK_WINDOW * ASTRAL_WINDUP && sinceAttack <= ASTRAL_ATTACK_WINDOW;
    if (!striking) strikeDone.current = false;

    // ---- PO DE ESTRELA morno na boca no instante do arremesso: ONZE
    // baforadas (o onze do titã até na pluma), na direção do tiro ----
    if (striking && !strikeDone.current && smoke) {
      strikeDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + Math.random() * 0.5;
        tmpWorld
          .set(
            ASTRAL_CORE_POS[0] + Math.cos(a) * (0.12 + Math.random() * 0.24),
            ASTRAL_CORE_POS[1] + 0.16 + Math.random() * 0.3,
            ASTRAL_CORE_POS[2] + Math.sin(a) * (0.12 + Math.random() * 0.24),
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.1 + Math.random() * 0.08,
          heat: 0.25, // galáxia acesa por dentro — não cinza de vulcão, não pó morto
          life: 1.0 + Math.random() * 0.6,
          lifeVar: 0.4,
          jitter: 0.26,
          rise: 0.55,
          drag: 2.6,
          vx: (Math.random() - 0.5) * 1.1,
          vy: 0.5 + Math.random() * 0.9,
          vz: 0.2 + Math.random() * 0.7,
        });
      }
    }

    // ---- uniforms: rocha do vazio, geada e núcleos de luz no MESMO loop ----
    const drift =
      Math.sin(t * 0.6 + seed) * 0.3 +
      Math.sin(t * 1.7 + seed * 0.6) * 0.22 +
      Math.sin(t * 0.29 + 1.4) * 0.35; // o titã respira devagar, como maré funda
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'core' ? 0.14 : 0.24);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1.3 : 0.75) + dying * 0.35);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = drift * (0.5 + 0.5 * hpFrac) + pose.quake * 0.3;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: a geada racha e o vazio incha; ferido: quase não muda (a
      // lição do Cristal — uHurt alto com uAmp grande serrilha o figurino)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + dying * 1.7 + pose.snap * 0.3);
      // a afinação acende a trinca âmbar da rocha: o bojo inteiro fica mais
      // dourado conforme a boca enche
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.75);
      }
    }

    // ---- uniforms do PÓ DE DISCO (a boca e a cabeça vêm mais abaixo, depois
    // da quaternión do pescoço — o disco de breu da boca tem que bascular com a
    // cabeça, senão ele descola do aro âmbar no meio da afinação) ----
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 0.8 + pose.snap * 1.4);
    motes.mat.uniforms.uSnap.value = pose.snap;

    // ---- OS QUATRO CORPOS ORBITAIS: rotação diferencial ACUMULADA (o disco 3
    // a 0,62; a cinta externa 0 a 0,48; o halo globular 1 a −0,44; a cinta de
    // queda 2 a −0,95). Na afinação o disco ENCURRUCA (o plano inclina sobre o
    // bojo) e no estouro ele DESTORA (a carga acelera os dois corpos do plano)
    // ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital).map(Number)) {
      const grp = groupRefs.current[gid];
      if (!grp) continue;
      const disk = gid === 3 || gid === 0; // os dois corpos do plano do disco
      const boost = disk ? 1 + pose.charge * 1.5 + pose.snap * 2.2 : 1 + pose.charge * 0.45;
      spins.current[gid] = (spins.current[gid] ?? 0) + dt * orbital[gid] * boost * (1 - dying * 0.85);
      if (disk) {
        // rotação no PIVÔ do disco: q = qTilt·qSpin e posição = pv − q·pv (o
        // filho em p vai para q(p − pv) + pv — sem isso o tilt jogaria o disco
        // inteiro para o lado, porque o pivô não é a origem da unidade)
        // A INCLINAÇÃO DE DESCANSO vem do figurino (ASTRAL_TILT): a câmera da
        // arena olha o tabuleiro a ~18° da horizontal, então um disco deitado
        // lê como uma fatia. Os dois corpos do plano (disco 3 + cinta externa 0)
        // recebem a MESMA inclinação sobre o mesmo pivô — o eixo da rotação
        // diferencial é a normal inclinada, e o disco borra em espiral no print
        const tilt =
          ASTRAL_TILT + pose.flinch * 0.5 + Math.sin(t * 0.34 + seed) * 0.014;
        tmpPivot.set(ASTRAL_DISK_PIVOT[0], ASTRAL_DISK_PIVOT[1], ASTRAL_DISK_PIVOT[2]);
        tmpQ.setFromAxisAngle(tmpAxis.set(1, 0, 0), tilt);
        tmpQ2.setFromAxisAngle(tmpAxis.set(0, 1, 0), spins.current[gid]);
        tmpQ.multiply(tmpQ2);
        grp.quaternion.copy(tmpQ);
        tmpWorld.copy(tmpPivot).applyQuaternion(tmpQ);
        grp.position.set(tmpPivot.x - tmpWorld.x, tmpPivot.y - tmpWorld.y, tmpPivot.z - tmpWorld.z);
      } else {
        grp.quaternion.setFromAxisAngle(tmpAxis.set(0, 1, 0), spins.current[gid]);
        grp.position.set(0, 0, 0);
      }
    }

    // ---- A CABEÇA: o pescoço de gravidade bascula no pivô do pescoço para
    // mirar o alvo e recua no coice. UMA quaternión, o MESMO pivô para todas as
    // peças da cabeça (a receita da coroa do Cósmico e das tampas do Vulcânico)
    // ----
    const pitch = pose.align * 0.1 + pose.snap * 0.075 + Math.sin(t * 0.55 + seed) * 0.016 - pose.quake * 0.05;
    const yaw = pose.align * 0.05 * Math.sin(t * 1.15 + seed * 0.7);
    tmpPivot.set(ASTRAL_NECK_PIVOT[0], ASTRAL_NECK_PIVOT[1], ASTRAL_NECK_PIVOT[2]);
    tmpQ.setFromAxisAngle(tmpAxis.set(1, 0, 0), pitch);
    tmpQ2.setFromAxisAngle(tmpAxis.set(0, 1, 0), yaw);
    tmpQ.multiply(tmpQ2);
    for (const i of actors.head) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      // a peça ORBITA o pivô do pescoço (q·(p − pv) + pv): translação pura
      // seria só um deslize e a cara descolaria do pescoço ao mirar
      tmpWorld2
        .set(part.p[0] - tmpPivot.x, part.p[1] - tmpPivot.y, part.p[2] - tmpPivot.z)
        .applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld2.x, tmpPivot.y + tmpWorld2.y, tmpPivot.z + tmpWorld2.z);
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      // a boca abre (aro âmbar) e o queixo desce na afinação: a goela do poço
      const bs = part.s ?? [1, 1, 1];
      const k = part.tag === 'core.rim' ? 1 + pose.charge * 0.16 : part.tag === 'chin' ? 1 + pose.charge * 0.06 : 1;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- A BOCA DO BURACO NEGRO (o disco de breu de onze faces): infla, gira
    // na própria normal e bascula JUNTO com a cabeça (a mesma quaternión e o
    // mesmo pivô do loop acima — é por isso que ele vem depois dele) ----
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 1.25 + pose.snap * 0.8 + dying * 0.4);
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.95 + 0.06 * Math.sin(t * 2.1 + seed) + 0.03 * Math.sin(t * 4.3 + seed * 1.3);
    coreRef.current.scale.setScalar(Math.max(0.12, boil * (1 + pose.charge * 0.22) * (1 - dying * 0.45)));
    // disco no PLANO da boca (normal +Z, como a placa e o aro) girando em torno
    // da própria normal: Euler XYZ = Rx(π/2)·Ry(φ) — Ry deixa o +Y do cilindro
    // quieto e Rx(π/2) tomba esse +Y em +Z, então as onze faces varrem a vista
    tmpQ2.setFromEuler(tmpEuler.set(Math.PI / 2, t * 0.42 + seed, 0));
    coreRef.current.quaternion.copy(tmpQ).multiply(tmpQ2);
    tmpWorld2
      .set(
        ASTRAL_CORE_POS[0],
        ASTRAL_CORE_POS[1] + Math.sin(t * 2.4 + seed) * 0.012,
        ASTRAL_CORE_POS[2] + pose.charge * 0.03,
      )
      .sub(tmpPivot)
      .applyQuaternion(tmpQ);
    coreRef.current.position.set(tmpPivot.x + tmpWorld2.x, tmpPivot.y + tmpWorld2.y, tmpPivot.z + tmpWorld2.z);
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.28 + pose.charge * 0.34 + pose.snap * 0.3);
    cglow.position.set(
      coreRef.current.position.x,
      coreRef.current.position.y,
      coreRef.current.position.z + 0.09,
    );
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 2.6 + seed) + pose.charge * 0.1 + pose.snap * 0.12) * alpha,
    );

    // ---- JATOS: as varas crescem e afinam no flare (o jato estica quando a
    // galáxia descarrega) e as pontas de geada acendem; a COROA incha no mesmo
    // flare, sem girar (os cones da coroa têm a mira `aim` amarrada) ----
    const bs0 = [1, 1, 1];
    for (const i of actors.jets) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const k = 1 + pose.flare * 0.16 + pose.snap * 0.2;
      mesh.scale.set(bs[0] * (1 + pose.flare * 0.08), bs[1] * k, bs[2] * (1 + pose.flare * 0.08));
    }
    for (const i of [...actors.beads, ...actors.corona]) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      let sc = 1 + 0.09 * Math.sin(t * (3.1 + (i % 5) * 0.7) + i * 1.9 + seed);
      sc *= 1 + pose.flare * 0.26 + pose.snap * 0.34 - dying * 0.5;
      mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      if (!part.r) mesh.rotation.y = t * (0.5 + (i % 3) * 0.3) + i; // só quem não tem mira
    }

    // ---- ONZE RAÍZES DE GRAVIDADE: pulsam a pressão (o titã plantado não
    // anda, mas a gravidade dele respira) ----
    for (const i of actors.roots) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const press = 1 + 0.022 * Math.sin(t * 1.6 + (i % 11) * 0.57 + seed) - dying * 0.3;
      mesh.scale.set(bs[0] * press, bs[1] * press, bs[2] * press);
    }

    // ---- o resto: as estrelas dos braços e da cauda cintilam (o `flick` do
    // figurino) e os fios de luz engrossam na afinação (a galáxia carregada) ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const tag = part.tag ?? '';
      if (
        HEAD_TAGS.has(tag) ||
        tag === 'jet.rod' ||
        tag === 'jet.bead' ||
        tag === 'corona' ||
        tag.startsWith('root')
      )
        continue;
      let sc = 1;
      if (tag === 'arm.rod' || tag === 'tail.rod') {
        // o fio de luz do braço engrossa quando a boca enche (a corrente
        // acelerando as estrelas)
        sc *= 1 + pose.charge * 0.09;
      } else if (tag === 'arm.tip' || tag === 'arm.node' || tag === 'tail.node') {
        // as estrelas jovens acendem na descarga
        sc *= 1 + pose.flare * 0.12;
      }
      if (part.flick) sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      if (sc !== 1) {
        // escala NÃO uniforme preservada (as bochechas achatadas e os octaedros
        // espremidos viravam bolinha pulsando com setScalar)
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }

    // ---- corpo: PLANTADO pelas onze raízes (floatY 0 — o titã não boia, e a
    // bobeira do `bob` do figurino fica em zero para as âncoras não descolarem
    // do piso). Ele não verga nem anda: respira, e no coice o eixo recua ----
    const g = rootRef.current;
    const breathe = Math.sin(t * 0.42 + seed) * 0.005;
    g.scale.set(
      1 + breathe + pose.snap * 0.014 - dying * 0.04,
      1 + breathe - pose.flinch * 0.014 - dying * 0.1,
      1 + breathe + pose.snap * 0.014 - dying * 0.04,
    );
    g.position.x = Math.sin(t * 38 + seed) * 0.022 * pose.quake;
    g.position.z = Math.cos(t * 34 + seed * 0.7) * 0.02 * pose.quake - pose.quake * 0.05;
    g.position.y = 0;
    g.rotation.y = Math.sin(t * 0.21 + seed) * 0.012;
    g.rotation.x = Math.sin(t * 0.3 + seed * 0.5) * 0.004 + pose.flinch * 0.006;
    void topY; // forma única Nv.9 — o topo amarrado nos testes
  });

  return (
    <group ref={rootRef}>
      {buckets.plain.map((i) => (
        <mesh
          key={`p${level}-${i}`}
          ref={(m) => {
            partRefs.current[i] = m;
          }}
          geometry={partGeos[i]}
          material={partMats.list[i]}
          position={visParts[i].p}
          rotation={visParts[i].r ?? [0, 0, 0]}
          scale={visParts[i].s ?? 1}
          // só a rocha (vazio e geada) projeta sombra: os núcleos de luz, o
          // poço e os olhos são luz e virariam bloco preto no piso (a lição do
          // funil da Névoa)
          castShadow={
            visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'
          }
        />
      ))}
      {buckets.orbitals.map(([gid, indices]) => (
        <group
          key={`g${gid}-${level}`}
          ref={(gr) => {
            groupRefs.current[gid] = gr;
          }}
        >
          {indices.map((i) => (
            <mesh
              key={`p${level}-${i}`}
              ref={(m) => {
                partRefs.current[i] = m;
              }}
              geometry={partGeos[i]}
              material={partMats.list[i]}
              position={visParts[i].p}
              rotation={visParts[i].r ?? [0, 0, 0]}
              scale={visParts[i].s ?? 1}
              castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark'}
            />
          ))}
        </group>
      ))}
      {/* a boca do buraco negro: disco de onze faces de breu no plano da boca */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} />
      <sprite ref={coreGlowRef} position={[ASTRAL_CORE_POS[0], ASTRAL_CORE_POS[1], ASTRAL_CORE_POS[2] + 0.06]}>
        <spriteMaterial
          map={circleTexture()}
          color={ASTRAL_STARLIGHT}
          transparent
          opacity={0.06}
          depthWrite={false}
        />
      </sprite>
      {/* o gás do disco orbitando em velocidade diferencial */}
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
    </group>
  );
}

/**
 * PÓ DE DISCO: cada mote escolhe um raio e um ângulo e ORBITA o plano do disco
 * com ω ∝ 1/ρ (rotação diferencial — os de dentro dão mais voltas que os de
 * fora, exatamente como os onze braços). No estouro (`uSnap`) um terço dos
 * motes é ejetado para cima, rente aos jatos. Quente no bojo (âmbar), frio na
 * borda (geada) — a curva de cor da galáia.
 */
const DISK_DUST_VERT = /* glsl */ `
attribute vec3 aRand; // x: angulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uSnap;
uniform float uDiskY;
uniform float uTilt;
uniform vec3 uWarm;
uniform vec3 uCool;
varying float vA;
varying vec3 vC;
void main() {
  const float TAU = 6.28318;
  // um terço dos grãos escapa do plano e raspa os jatos; os demais ficam
  // presos entre o bojo (1,05) e a cinta externa (2,35)
  float band = step(0.68, aRand.z);
  float r = 1.05 + 1.3 * aRand.z;
  float omega = (1.55 / r) * (1.0 + uCharge * 0.9);
  float ang = aRand.y * TAU + uTime * omega * (band > 0.5 ? 0.55 : 1.0);
  float prog = fract(uTime * (0.09 + 0.13 * aRand.z) + aRand.y * 3.7);
  float lift = band * prog * prog * (2.2 + 1.4 * aRand.z + uSnap * 1.6);
  float py = 0.03 + 0.05 * sin(uTime * 1.3 + aRand.y * 9.0) + lift;
  float rr = r * (1.0 + prog * (0.06 + uSnap * 0.22));
  // o grão nasce no plano HORIZONTAL do disco e é caído pela MESMA inclinação
  // que o rig aplica aos corpos do plano (R_x: y' = y·cos - z·sin)
  float px = cos(ang) * rr;
  float pz = sin(ang) * rr;
  vec3 p = vec3(px, uDiskY + py * cos(uTilt) - pz * sin(uTilt), py * sin(uTilt) + pz * cos(uTilt));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // lasca miúda e quase apagada (pó estelar, não papel picado)
  float size = (1.7 + 2.6 * aRand.z) * (0.85 + uCharge * 0.5) * uSizeMul;
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.55 + 0.45 * aRand.z) * (1.0 - prog * 0.55) * uAlpha;
  // curva de cor do disco: âmbar no bojo, geada na ponta dos braços
  vC = mix(uWarm, uCool, smoothstep(1.2, 2.2, r));
  gl_Position = projectionMatrix * mv;
}
`;

const DISK_DUST_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pontinho duro com halo mínimo (grão de luz, nao puff)
  float m = smoothstep(0.5, 0.2, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.34);
}
`;
