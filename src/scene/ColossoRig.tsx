import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import {
  MODELS,
  partsForLevel,
  COLOSSO_BODY_Y,
  COLOSSO_RING_Y,
  COLOSSO_RING_TILT,
  COLOSSO_ARM_PIVOT,
  COLOSSO_CORE_POS,
} from './speciesModels';
import type { Part } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do COLOSSO (Nv.9 — Geodo+Vulcânico: a MONTANHA ETERNA QUE VIROU LUA),
 * plantada por TREZE contrafortes grossos. A assinatura é o PLANETÓIDE CRATERADO
 * com ANEL DE MATACÕES INCLINADO e a cara DELE — o homem da lua: a caloura chata
 * de basalto (maria!) segura a cara, porque placa chata colada na circunsfera
 * seria engolida pelo relevo deslocado do corpo. Os três corpos orbitais giram em
 * velocidades DIFERENTES (anel 3 a 0,70, enxame alto 0 ao contrário a −0,30,
 * entulho rasteiro 1 a 0,52) e a montanha em si NÃO gira: ela gira o anel.
 *
 * Zero shader novo de pedra: o regolito é o `stoneShaders` lido em CINZA-CLARA de
 * poeira sem atmosfera (nunca o barro cozido do pai Vulcânico nem o basalto
 * ameixa do pai Geodo) com o veio de magma aceso por dentro; a ametista é o
 * cristal herdado do Geodo crescendo DENTRO dos treze ferimentos; a luz é o
 * `makeCoreMaterial` do Raio lido em magma-esfriado na goela de treze faces. Só
 * um shader próprio: o PÓ DE ANEL — grãos de regolito orbitando o plano inclinado
 * do anel com ω ∝ 1/ρ (o mesmo motor da poeira do filho Astral, aqui em pedra
 * morta e não em gás de estrela).
 *
 * A coreografia (interval 2,5 — a cadência mais LENTA da árvore, então a JANELA é
 * a mais LONGA: 1,25 s, e 0,66 dela é afinação): o colosso ESCAVA os pés no chão
 * (brace), puxa o braço INTEIRO para trás no ombro (cock), inclina o planetóide
 * para trás (lean) e a goela e o matacão segurado acendem (charge); no estouro o
 * braço VARRE para frente (hurl), o planetóide mergulha na direção do arremesso
 * e o QUAKE é o chão cedendo — o mais forte da árvore, porque o arremesso é o de
 * um planetóide e o splash do motor é de 2,2. Todos os canais assentam em ~0
 * antes do fim da janela (continuidade amarrada em teste).
 */

const COLOSSO_DEF = getSpecies('colosso');

/** janela e afinação: a cadência do colosso é a mais lenta da árvore (interval
 *  2,5, o dobro do astral), então a JANELA é a mais LONGA da árvore — 1,25 s
 *  (Astral 0,74, Cósmico 0,86, Vulcânico 0,98, Geodo 1,05) — e a afinação come
 *  0,82 s dela: a montanha leva quase um segundo para carregar o braço porque o
 *  boulder que ela arremessa é um planetóide (dano 27, splash 2,2) */
export const COLOSSO_ATTACK_WINDOW = 1.25;
export const COLOSSO_WINDUP = 0.66;

/** identidade amarrada em teste: magma-que-esfria #d98c4a (= projectileColor do
 *  motor = glow do figurino = uCrack de TODA a pedra) e ametista orquídea
 *  #c77dff (= accent = herança do pai Geodo: gema dos treze ferimentos, coroa
 *  polar e lascas do anel) */
export const COLOSSO_MAGMA = '#d98c4a';
export const COLOSSO_AMETHYST = '#c77dff';
/** o regolito pálido e o breu do cercado (= body e dark do figurino, amarrados) */
export const COLOSSO_REGOLITO = '#9a95a3';
export const COLOSSO_DEEP = '#2b2636';
/** a poeira fria do anel (nunca a geada do Astral: aqui é talco de pedra morta) */
export const COLOSSO_TALC = '#cfc9d6';

/** pivô da INCLINAÇÃO do planetóide: o mascon (a serra do sopé) fica PLANTADO e
 *  o planetóide inteiro (corpo, crateras, fissuras, coroa, cara e braços) bascula
 *  nesse ponto, um grau de cada vez — os treze contrafortes não descolam do piso */
export const COLOSSO_TILT_PIVOT: [number, number, number] = [0, 1.7, 0];

/** pivô do ACENO da cara: o centro da caloura (a mask vive a 0,16 acima do centro
 *  do planetóide, encostada na circunsfera) — a cara, o aro dela e a goela acenam
 *  em volta desse ponto, porque a boca é da cara, não do planetóide */
export const COLOSSO_FACE_PIVOT: [number, number, number] = [0, COLOSSO_BODY_Y + 0.16, 1.3];

/** o regolito CRU do planetóide morto: cinza-azulada CLARA, fosca, salpicada de
 *  seixo (a mais clara da família das montanhas — é o que faz o print da arena
 *  ler LUA e não fogueira), com o veio de magma do motor correndo por dentro.
 *  O VEIO É CONTIDO (glow 0,34 × boost 0,62 = 0,21): no primeiro print o corpo
 *  inteiro comia veio aceso e a montanha lia FOGUEIRA riscada de laranja, não
 *  lua. Veio largo demais (crackWidth 0,05 em corpo de montanha) tambem é pior:
 *  serra a pedra em vez de veiá-la */
export const REGOLITO_COLOSSO_LOOK = {
  rockA: COLOSSO_REGOLITO,
  rockB: '#5b5566',
  crack: COLOSSO_MAGMA,
  amp: 0.045,
  crackGlow: 0.34,
  crackScale: 1.3,
  crackWidth: 0.042,
  crackBoost: 0.62,
  speck: 0.9,
};

/** O BREU DA CANTARIA ESCURA: os treze menires e suas lages, as almofadas do
 *  sopé, o curso de dentro do anel, o úmero e o punho que arremessa, os seixos
 *  do entulho e a caloura da cara. É a pedra lida mais FUNDA, e o veio nela é
 *  quase apagado (0,12): o escuro tem que ser ESCURO, não brasa fria — foi o que
 *  fez o primeiro print ler pilha de brasas em vez de montanha de pedra */
export const REGOLITO_COLOSSO_DEEP_LOOK = {
  ...REGOLITO_COLOSSO_LOOK,
  rockA: COLOSSO_DEEP,
  rockB: '#191524',
  amp: 0.03,
  crackGlow: 0.12,
  speck: 0.5,
};

/** O MAGMA NAS FISSURAS (as treze trinca da barriga, as treze lâmpadas de
 *  cratera, as treze brasas do enxame alto): pedra OPACA bronze-escuro com o
 *  VEIO aceso — a lição do print do Astral. Com treze fissuras + treze lâmpadas
 *  + treze brasas + goela acesas ao mesmo tempo, PEDRA laranja acumula no print
 *  da arena e a lua vira LÂMPADA DE LAVA; a identidade mora só no veio, e o veio
 *  é FINO (0,026) porque a peça que o carrega é miúda */
export const MAGMA_COLOSSO_LOOK = {
  rockA: '#6b4322',
  rockB: '#2c1a0f',
  crack: COLOSSO_MAGMA,
  crackGlow: 0.8,
  crackScale: 2.6,
  crackWidth: 0.026, // veia FINA: numa barbatana de 0,032 veio largo come a peça
  crackBoost: 0.95,
  speck: 0.5,
  amp: 0.02,
};

/** a AMETISTA do pai Geodo, agora minerando lua: orquídea com o veio de magma
 *  do filho correndo na fratura do cristal (é assim que o print separa o filho
 *  do pai: o Geodo tem orquídea com veio orquídea, o Colosso tem orquídea com
 *  veio âmbar) */
export const AMETHYST_COLOSSO_LOOK = {
  rockA: '#8a5cc0',
  rockB: '#39275a',
  crack: COLOSSO_MAGMA,
  amp: 0.02,
  crackGlow: 1.0,
  crackScale: 1.9,
  crackWidth: 0.03,
  crackBoost: 1.1,
  speck: 1.2,
};

/** plasma SÓ na goela e no olho (pedra estrutural nunca é plasma: translúcido e
 *  DoubleSide, o plasma deixa ver a face de trás e o traço engorda) */
export const HEARTH_COLOSSO_LOOK = {
  gold: COLOSSO_MAGMA,
  white: '#ffe6c2',
  cool: '#120c14', // a goela é POÇO, não sol: é um buraco aceso, não uma estrela
  amp: 0.05,
};

/** olho: faísca âmbar sobre POÇO de breu (olho claro sobre pedra clara não lê) */
export const EYE_COLOSSO_LOOK = {
  gold: COLOSSO_MAGMA,
  white: '#fff1d8',
  cool: '#4a2a12',
  amp: 0.012,
};

export interface ColossoRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** grãos do anel (o talco de regolito em rotação diferencial) — TRINTA E
   *  NOVE: três cintas de treze, o treze da montanha-eterna até no pó */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o COLOSSO exala PÓ DE REGOLITO FRIO (heat 0,06: nem a
   *  cinza incandescente do pai Vulcânico (0,6), nem o pó morto do Geodo (0) —
   *  poeira de pedra recém-quebrada, ainda morna na goela) */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpAxis = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

/** peças da CARA (a caloura e o que vive nela): a cara inteira também faz o seu
 *  próprio aceno de pontaria, SOBRE a basculação do planetóide. Tudo o que está
 *  PARAFUSADO na lua (corpo, mamelons, os quatro acessórios das treze crateras,
 *  as treze fissuras, a coroa polar e a cara) bascula junto no mascon; o mascon,
 *  os treze contrafortes com almofada e o cercado megalítico ficam FORA — a
 *  fundação plantada, e é por isso que a montanha pode se debruçar sem descolar
 *  os pés do chão */
const FACE_TAGS = new Set([
  'mask',
  'mask.rim',
  'brow',
  'eye',
  'eye.pupil',
  'cheek',
  'chin',
  'nose',
  'core.rim',
  'core.pit',
]);

/**
 * A coreografia do planetóide: `brace` é o peso AFFONDO nos treze contrafortes
 * (a montanha agacha um dedo antes de arremessar), `cock` é o BRAÇO INTEIRO
 * puxado para trás no ombro, `lean` é o planetóide inteiro tombado para trás,
 * `charge` é a goela e o matacão segurado acendendo, `flare` acende as treze
 * lâmpadas de cratera e a coroa, `hurl` é a VARREDURA do braço para frente no
 * estouro e `quake` é o chão CEDENDO (o mais forte da árvore). Todos voltam a
 * zero no fim da janela e são zero fora dela.
 */
export function attackPose(since: number) {
  const p = { brace: 0, cock: 0, lean: 0, charge: 0, flare: 0, hurl: 0, quake: 0 };
  if (since < 0 || since > COLOSSO_ATTACK_WINDOW) return p;
  const u = COLOSSO_ATTACK_WINDOW;
  const w = u * COLOSSO_WINDUP;
  if (since < w) {
    const s = since / w;
    const ease = 1 - Math.pow(1 - s, 3);
    p.brace = ease * 0.9; // os pés afundam e o corpo agacha um dedo
    p.cock = ease; // o braço vai atrás, devagar, com o peso do mundo
    p.lean = -0.85 * ease; // o planetóide INTEIRO tomba para TRÁS (o rig lê
    // lean·0,1 sobre o eixo X: negativo = para trás, positivo = mergulho)
    p.charge = Math.pow(s, 1.4); // a goela e o bloco segurado esquentando
    // o flare sobe CEDO no primeiro suspiro da afinação (o pow miúdo), senão ele
    // nascia em 0,16 no primeiro frame e a lâmpada dava um solavanco de partida
    p.flare = 0.16 * Math.pow(s, 0.35) + 0.34 * ease;
  } else {
    const r = (since - w) / (u - w);
    const fall = Math.pow(1 - r, 2);
    const relax = 1 - Math.pow(r, 2.2); // a mira DEVOLVE no fim do coice (senão o
    // braço parava em 1 e zerava num frame só, cortando a continuidade)
    p.hurl = Math.sin(Math.min(1, r * 1.35) * Math.PI); // a varredura: sobe, passa
    // pela frente e ASSENTA no fim do gesto (nada de braço esmagado no alvo)
    p.cock = Math.pow(Math.max(0, 1 - r * 1.9), 2); // o braço largado volta a cair
    // o planetóide mergulha NA DIREÇÃO do arremesso (hurl) e a réstia do recuo
    // devolve (o pow gordo): em r=0 vale −0,85, o MESMO valor com que a afinação
    // terminou, e no fim da janela é zero
    p.lean = p.hurl * (1 - r) - 0.85 * Math.pow(1 - r, 2.4);
    p.charge = fall;
    p.flare = (0.5 + fall * 1.15) * relax;
    p.brace = Math.max(0, 1 - r * 2.4) * 0.9; // o agachamento vira impulso e some
    p.quake = Math.pow(1 - r, 1.35); // o chão cede no estouro e levanta devagar
  }
  return p;
}

export function ColossoRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: ColossoRigProps) {
  const modelDef = MODELS.colosso;
  const level = Math.max(
    COLOSSO_DEF.levelMin,
    Math.min(COLOSSO_DEF.levelMax, Math.round(levelProp ?? COLOSSO_DEF.levelMin)),
  );
  const moteCount = embers ?? 39;
  const topY = formTop(COLOSSO_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const tiltRef = useRef<THREE.Group>(null!);
  const armRefs = useRef<(THREE.Group | null)[]>([]);
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(false);
  // giros ACUMULADOS (nunca `t * velocidade`: quando a carga mexe na
  // velocidade, ângulo absoluto daria salto — o anel tem que acelerar suave)
  const spins = useRef<Record<number, number>>({});

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** UMA wrapper por grupo orbital (a lição do Astral: um wrapper por PEÇA faz o
   *  mesmo ref ser sobrescrito e só a última peça orbita). Aqui os três corpos
   *  orbitais são três corpos RÍGIDOS: anel 3, enxame alto 0, entulho 1 */
  const buckets = useMemo(() => {
    const planted: number[] = []; // pés: mascon, treze raízes, treze almofadas
    const menhirs: number[] = []; // o cercado megalítico (também plantado)
    const onBody: number[] = []; // parafusado no planetóide (bascula com ele)
    const arms: { i: number; side: number }[] = [];
    const byGroup = new Map<number, number[]>();
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (p.group !== undefined && modelDef.groups?.[p.group] !== undefined) {
        const arr = byGroup.get(p.group) ?? [];
        arr.push(i);
        byGroup.set(p.group, arr);
      } else if (tag.startsWith('arm')) arms.push({ i, side: p.p[0] < 0 ? -1 : 1 });
      else if (tag === 'mascon' || tag === 'root' || tag === 'root.pad') planted.push(i);
      else if (tag.startsWith('menhir')) menhirs.push(i);
      else onBody.push(i);
    });
    return { planted, menhirs, onBody, arms, orbitals: [...byGroup.entries()] };
  }, [visParts, modelDef]);

  /** atores da coreografia */
  const actors = useMemo(() => {
    const face: number[] = [];
    const lamps: number[] = [];
    const gems: number[] = [];
    const cracks: number[] = [];
    const corona: number[] = [];
    const roots: number[] = [];
    const swarms: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      if (FACE_TAGS.has(tag)) face.push(i);
      else if (tag === 'crater.lamp') lamps.push(i);
      else if (tag === 'crater.gem') gems.push(i);
      else if (tag === 'crack') cracks.push(i);
      else if (tag === 'corona') corona.push(i);
      else if (tag === 'root' || tag === 'root.pad') roots.push(i);
      else if (tag === 'swarm.ember') swarms.push(i);
    });
    return { face, lamps, gems, cracks, corona, roots, swarms };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // A REGUA DO RELEVO (herança da lição do Astral): o shader desloca vértice
    // AO LONGO DA NORMAL e em PATAMAR, então amplitude da ordem do raio da peça
    // INFLA a peça em vez de texturizá-la. Aqui o figurino é GROSSO (pilares de
    // 0,24), então a régua solta deixaria o relevo comer milímetros: amplitude
    // vem do TAMANHO DA PEÇA, peça miúda come relevo miúdo.
    const ampOf = (p: Part, base: number): number => {
      const g = getGeometry(p.g, p.a);
      if (!g.boundingBox) g.computeBoundingBox();
      // sem caixa não há régua e o relevo vem ZERO — liso sempre lê melhor do
      // que estufado (e as geo do catálogo sempre têm caixa, então nunca ocorre)
      const b = g.boundingBox ?? new THREE.Box3();
      const s = p.s ?? [1, 1, 1];
      const rMin =
        Math.min(
          (b.max.x - b.min.x) * s[0],
          (b.max.y - b.min.y) * s[1],
          (b.max.z - b.min.z) * s[2],
        ) / 2;
      // o valor entra ARREDONDADO na chave do cache de material (senão a primeira
      // pedra vista empresta o seu relevo a todas as outras)
      return Math.round(Math.min(base, rMin * 0.25) * 200) / 200;
    };
    // o breu dos POÇOS de cratera, da órbita do olho e da goela: ferimento aberto
    // sobre regolito CLARO é o contraste que lê no card miúdo
    const kernel = new THREE.MeshBasicMaterial({ color: '#0d0a12' });
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
            gold: EYE_COLOSSO_LOOK.gold, // = a cor do motor (a faísca no poço)
            white: EYE_COLOSSO_LOOK.white,
            cool: EYE_COLOSSO_LOOK.cool,
            amp: EYE_COLOSSO_LOOK.amp,
            seed: 2.2 + (i % 2) * 1.9,
          }),
        );
      // figurino manda no relevo quando ele deu (`p.amp`), e a régua de tamanho
      // corta o resto — a amplitude vai DENTRO da chave do cache junto
      if (p.m === 'glow') {
        const amp = ampOf(p, p.amp ?? MAGMA_COLOSSO_LOOK.amp);
        // a GOELA é plasma de verdade (poço aceso); todo o RESTO de `glow` é
        // pedra opaca com o veio aceso — traço estrutural não pode ser translúcido
        if (tag === 'core.rim')
          return pick('hearth|mouth', () =>
            makeCoreMaterial({
              gold: HEARTH_COLOSSO_LOOK.gold, // = a cor do motor (aro de magma)
              white: HEARTH_COLOSSO_LOOK.white,
              cool: HEARTH_COLOSSO_LOOK.cool, // a goela é POÇO
              amp: ampOf(p, HEARTH_COLOSSO_LOOK.amp),
              seed: 5.1,
            }),
          );
        return pick(
          `magma|${amp}|${tag.startsWith('swarm') ? 'swarm' : tag === 'crater.lamp' ? 'lamp' : 'fin'}|${i % 2}`,
          () =>
            makeStoneMaterial({
              rockA: MAGMA_COLOSSO_LOOK.rockA,
              rockB: MAGMA_COLOSSO_LOOK.rockB,
              crack: MAGMA_COLOSSO_LOOK.crack, // = a cor do motor no veio
              crackGlow: MAGMA_COLOSSO_LOOK.crackGlow,
              crackScale: MAGMA_COLOSSO_LOOK.crackScale,
              crackWidth: MAGMA_COLOSSO_LOOK.crackWidth,
              crackBoost: MAGMA_COLOSSO_LOOK.crackBoost,
              speck: MAGMA_COLOSSO_LOOK.speck,
              amp,
              seed: 5.1 + (i % 2) * 3.4,
              breath: tag === 'crack' ? 0.55 : 0.3, // as fissuras respiram; as
              // brasas do enxame só giram
              teamColor: TEAM_TINT.neutral,
            }),
        );
      }
      if (p.m === 'accent') {
        const amp = ampOf(p, p.amp ?? AMETHYST_COLOSSO_LOOK.amp);
        return pick(
          `amethyst|${amp}|${tag === 'corona' ? 'crown' : tag === 'ring.chip' ? 'chip' : 'gem'}|${i % 2}`,
          () =>
            makeStoneMaterial({
              rockA: AMETHYST_COLOSSO_LOOK.rockA,
              rockB: AMETHYST_COLOSSO_LOOK.rockB,
              crack: AMETHYST_COLOSSO_LOOK.crack, // = a cor do motor na fratura
              amp,
              crackGlow: AMETHYST_COLOSSO_LOOK.crackGlow,
              crackScale: tag === 'corona' ? AMETHYST_COLOSSO_LOOK.crackScale * 1.3 : AMETHYST_COLOSSO_LOOK.crackScale,
              crackWidth: AMETHYST_COLOSSO_LOOK.crackWidth,
              crackBoost: AMETHYST_COLOSSO_LOOK.crackBoost,
              speck: AMETHYST_COLOSSO_LOOK.speck,
              seed: seed + (i % 2) * 2.7,
              breath: 0.4,
              teamColor: TEAM_TINT.neutral,
            }),
        );
      }
      const deep = p.m === 'dark';
      const L = deep ? REGOLITO_COLOSSO_DEEP_LOOK : REGOLITO_COLOSSO_LOOK;
      const amp = ampOf(p, p.amp ?? L.amp);
      return pick(`regolith|${deep ? 'deep' : 'rock'}|${amp}|${tag === 'body' || tag === 'lobe' ? 'mass' : tag === 'mask' ? 'mask' : tag.startsWith('arm') ? 'arm' : 'hard'}|${i % 2}`, () =>
        makeStoneMaterial({
          rockA: L.rockA,
          rockB: L.rockB,
          crack: L.crack, // = a cor do motor (o veio de magma de toda a pedra)
          amp,
          crackGlow: L.crackGlow,
          crackScale: tag === 'body' || tag === 'mascon' || tag === 'lobe' ? L.crackScale : L.crackScale * 1.7, // vara e placa miúdas não comportam veio largo
          crackWidth: L.crackWidth,
          crackBoost: L.crackBoost,
          speck: L.speck,
          seed: seed + (i % 2) * 3.1,
          breath: 0.45,
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

  // A GOELA DE TREZE FACES: o poço aceso de onde os blocos saem cuspindo pó de
  // regolito. Fica no eixo da boca, DENTRO do aro (`core.rim`), e infla na
  // afinação — é a silhueta do arremesso pesado do motor (`heavy` + `splash`).
  const core = useMemo(
    () => ({
      geo: new THREE.CylinderGeometry(0.2, 0.16, 0.1, 13, 2),
      mat: makeCoreMaterial({
        gold: HEARTH_COLOSSO_LOOK.gold, // = a cor do motor (boca→bloco→impacto)
        white: HEARTH_COLOSSO_LOOK.white,
        cool: HEARTH_COLOSSO_LOOK.cool, // goela: o miolo é o poço, não o branco
        amp: 0.045,
        seed: 3.7,
      }),
    }),
    [],
  );

  // PÓ DE ANEL: grãos de regolito ORBITANDO o plano inclinado do anel com
  // ω ∝ 1/ρ (os de dentro dão mais voltas que os de fora). No estouro (`uSnap`)
  // um terço deles é ejetado para cima, rento às lascas. Quente no aro interno
  // (magma), frio na borda (talco): a curva de cor da lua.
  const motes = useMemo(() => {
    const geo = makeMoteGeo(moteCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RING_DUST_VERT,
      fragmentShader: RING_DUST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
        uSnap: { value: 0 },
        uRingY: { value: COLOSSO_RING_Y },
        uTilt: { value: COLOSSO_RING_TILT }, // o pó orbita no MESMO plano inclinado
        uWarm: { value: new THREE.Color(COLOSSO_MAGMA) },
        uCool: { value: new THREE.Color(COLOSSO_TALC) },
      },
    });
    return { geo, mat };
  }, [moteCount, emberScale]);

  // rocha/ametista/magma/núcleos leem aSeed por vértice (a lição WebKit);
  // clonamos só os que usam
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
      if (demoT.current > COLOSSO_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const dying = 1 - alpha; // morrendo: o anel para, a goela apaga e a poeira racha
    const striking =
      sinceAttack >= COLOSSO_ATTACK_WINDOW * COLOSSO_WINDUP && sinceAttack <= COLOSSO_ATTACK_WINDOW;
    if (!striking) strikeDone.current = false;

    // ---- PÓ DE REGOLITO FRIO na goela no instante do arremesso: TREZE
    // baforadas (o treze da montanha-eterna até na pluma), na direção do tiro.
    // heat 0,06: talco de pedra recém-quebrada, quase frio — a poeira de uma lua
    // sem atmosfera, o oposto da cinza incandescente do pai Vulcânico ----
    if (striking && !strikeDone.current && smoke) {
      strikeDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * Math.PI * 2 + Math.random() * 0.5;
        tmpWorld
          .set(
            COLOSSO_CORE_POS[0] + Math.cos(a) * (0.14 + Math.random() * 0.26),
            COLOSSO_CORE_POS[1] + 0.18 + Math.random() * 0.3,
            COLOSSO_CORE_POS[2] + Math.sin(a) * (0.14 + Math.random() * 0.26),
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.13 + Math.random() * 0.1,
          heat: 0.06, // talco frio quase branco, com o miolo ainda morno
          life: 1.3 + Math.random() * 0.7,
          lifeVar: 0.5,
          jitter: 0.3,
          rise: 0.4,
          drag: 2.2,
          vx: (Math.random() - 0.5) * 1.2,
          vy: 0.35 + Math.random() * 0.8,
          vz: 0.3 + Math.random() * 0.9, // a pluma vai JUNTO com o arremesso
        });
      }
    }

    // ---- uniforms: regolito, ametista, magma e núcleos de luz no MESMO loop ----
    const drift =
      Math.sin(t * 0.5 + seed) * 0.3 +
      Math.sin(t * 1.5 + seed * 0.6) * 0.22 +
      Math.sin(t * 0.23 + 1.4) * 0.35; // a montanha respira como maré funda: devagar
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'core' ? 0.14 : 0.24);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1.3 : 0.8) + pose.quake * 0.2 + dying * 0.35);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = drift * (0.5 + 0.5 * hpFrac) + pose.quake * 0.45;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: o veio racha e o planetóide incha; ferido: quase não muda (a
      // lição do Cristal — uHurt alto com uAmp grande serrilha o figurino)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.08 + dying * 1.7 + pose.quake * 0.35);
      // a afinação acende o veio de magma da rocha: a montanha inteira fica mais
      // acesa conforme o braço carrega e o chão cede
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.7 + pose.quake * 0.5);
      }
    }

    // ---- uniforms do PÓ DE ANEL ----
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 0.8 + pose.hurl * 0.9);
    motes.mat.uniforms.uSnap.value = pose.quake;

    // ---- OS TRÊS CORPOS ORBITAIS: rotação diferencial ACUMULADA (o anel 3 a
    // 0,70; o enxame alto 0 ao CONTRÁRIO a −0,30; o entulho rasteiro 1 a 0,52).
    // Na afinação o anel ACELERA (a montanha carregando o planetóide puxa o anel
    // pelo ombro) e no estouro ele DESTORA e inclina um dedo ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital).map(Number)) {
      const grp = groupRefs.current[gid];
      if (!grp) continue;
      const ring = gid === 3;
      const boost = ring ? 1 + pose.charge * 0.8 + pose.quake * 2.4 : 1 + pose.charge * 0.35 + pose.quake * 0.6;
      spins.current[gid] = (spins.current[gid] ?? 0) + dt * orbital[gid] * boost * (1 - dying * 0.85);
      if (ring) {
        // rotação no PIVÔ do anel: q = qTilt·qSpin e posição = pv − q·pv (o
        // filho em p vai para q(p − pv) + pv — sem isso o tilt jogaria o anel
        // inteiro para o lado, porque o pivô não é a origem da unidade)
        // A INCLINAÇÃO DE DESCANSO vem do figurino (COLOSSO_RING_TILT): a câmera
        // da arena olha o tabuleiro a ~18° e um anel deitado leria uma fatia (a
        // lição do disco do Astral; aqui 0,34 porque o anel é mais fechado)
        const tilt =
          COLOSSO_RING_TILT + pose.lean * 0.1 + pose.quake * 0.05 + Math.sin(t * 0.34 + seed) * 0.014;
        tmpPivot.set(0, COLOSSO_RING_Y, 0);
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

    // ---- O PLANETÓIDE INTEIRO BASCULA no mascon plantado: `lean` tomba a lua
    // para trás na afinação e a mergulha na direção do arremesso no estouro. Os
    // treze contrafortes e o cercado megalítico ficam FORA desta quaternión — é
    // por isso que a montanha pode se debruçar sem descolar os pés do chão ----
    const tilt =
      pose.lean * 0.1 + pose.quake * 0.012 + Math.sin(t * 0.3 + seed * 0.5) * 0.006 - dying * 0.05;
    tmpPivot.set(COLOSSO_TILT_PIVOT[0], COLOSSO_TILT_PIVOT[1], COLOSSO_TILT_PIVOT[2]);
    tmpQ.setFromAxisAngle(tmpAxis.set(1, 0, 0), tilt);
    if (tiltRef.current) {
      tiltRef.current.quaternion.copy(tmpQ);
      tmpWorld.copy(tmpPivot).applyQuaternion(tmpQ);
      tiltRef.current.position.set(tmpPivot.x - tmpWorld.x, tmpPivot.y - tmpWorld.y, tmpPivot.z - tmpWorld.z);
    }
    // a cara faz o seu próprio aceno de pontaria (pitch/yaw) SOBRE a basculação
    // do grupo-pai: as peças da cara já são filhas do grupo que tomba, então aqui
    // entra SÓ a quaternión da cara (compor a do corpo de novo tombaria a lua
    // duas vezes). É um aceno miúdo: a cara é pedra parafusada, não máscara solta
    const faceYaw = Math.sin(t * 0.42 + seed) * 0.008;
    const facePitch = pose.lean * 0.05 + pose.quake * 0.02 + Math.sin(t * 0.55 + seed) * 0.012;
    tmpPivot.set(COLOSSO_FACE_PIVOT[0], COLOSSO_FACE_PIVOT[1], COLOSSO_FACE_PIVOT[2]);
    tmpQ.setFromEuler(tmpEuler.set(facePitch, faceYaw, 0));
    for (const i of actors.face) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const base = part.r ?? [0, 0, 0];
      tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2]));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld
        .set(part.p[0] - tmpPivot.x, part.p[1] - tmpPivot.y, part.p[2] - tmpPivot.z)
        .applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
    }

    // ---- A GOELA: infla e acende na afinação e o aro de treze faces gira no
    // plano da boca (normal +Z): Euler XYZ = Rx(π/2)·Ry(φ) — Ry deixa o +Y do
    // cilindro quieto e Rx(π/2) tomba esse +Y em +Z, então as treze faces varrem
    // a vista. Ela é filha do grupo que bascula (o mergulho vem daí) e ainda
    // acena com a CARA: a boca é da caloura, não do planetóide ----
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 1.25 + pose.quake * 0.9 + dying * 0.4);
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.95 + 0.06 * Math.sin(t * 1.9 + seed) + 0.03 * Math.sin(t * 3.9 + seed * 1.3);
    coreRef.current.scale.setScalar(Math.max(0.12, boil * (1 + pose.charge * 0.3 + pose.hurl * 0.1) * (1 - dying * 0.45)));
    tmpQ2.setFromEuler(tmpEuler.set(Math.PI / 2, t * 0.38 + seed, 0));
    coreRef.current.quaternion.copy(tmpQ).multiply(tmpQ2); // tmpQ ainda é o aceno da cara
    tmpWorld
      .set(COLOSSO_CORE_POS[0] - tmpPivot.x, COLOSSO_CORE_POS[1] - tmpPivot.y, COLOSSO_CORE_POS[2] - tmpPivot.z)
      .applyQuaternion(tmpQ);
    coreRef.current.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.3 + pose.charge * 0.4 + pose.quake * 0.34);
    cglow.position.set(COLOSSO_CORE_POS[0], COLOSSO_CORE_POS[1], COLOSSO_CORE_POS[2] + 0.1);
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + 0.02 * Math.sin(t * 2.4 + seed) + pose.charge * 0.11 + pose.quake * 0.13) * alpha,
    );

    // ---- OS DOIS BRAÇOS DE ARREMESSO: o braço INTEIRO (ombro, úmero, punho e o
    // matacão segurado) gira no PIVÔ DA COVA DO OMBRO, uma quaternión só (a
    // receita do pescoço do Astral e das arcobotantes do Geodo). `cock` leva o
    // braço para trás na afinação; `hurl` varre ele pela frente no estouro e o
    // braço ASSENTA no fim do gesto (nada esmagado no alvo) ----
    const [pvX, pvY, pvZ] = COLOSSO_ARM_PIVOT;
    // sinal: girar sobre +X com ângulo POSITIVO leva o punho (que pende ABAIXO do
    // ombro) para TRÁS — `cock` (o braço armado) é positivo e `hurl` varre para
    // frente com negativo. Os dois ombros usam a MESMA quaternión (espelhados só
    // no x do pivô), porque o plano do arremesso é o YZ dos dois lados.
    // A AMPLITUDE vem da régua do anel: o braço inteiro mora dentro do furo
    // (ρ 1,82) e nenhuma peça dele passa de ρ 1,65. Com a cova no flanco
    // (1,0; 3,0), o `cock` de 0,62 leva o punho a (1,40; 1,87; −0,54) e o matacão
    // a (1,45; 1,47; −0,76) — folga de sobra para o arco de TRÁS do anel, que
    // sobe a 2,9 no matacão mais próximo; o `hurl` de 0,30 leva o punho a
    // (1,40; 1,86; 0,56) e o matacão a (1,45; 1,45; 0,75), o mais perto que o
    // punho chega de um matacão do anel: 0,82 de centro a centro contra 0,56 de
    // soma de raios. Balanceio mais largo que isso vara o anel (round 2).
    const armX = pose.cock * 0.62 - pose.hurl * 0.3 + Math.sin(t * 0.5 + seed) * 0.012;
    for (const side of [-1, 1]) {
      const grp = armRefs.current[side + 1];
      if (!grp) continue;
      tmpQ.setFromAxisAngle(tmpAxis.set(1, 0, 0), armX);
      grp.quaternion.copy(tmpQ);
      tmpWorld.set(pvX * side, pvY, pvZ).applyQuaternion(tmpQ);
      grp.position.set(pvX * side - tmpWorld.x, pvY - tmpWorld.y, pvZ - tmpWorld.z);
    }

    // ---- as TREZE LÂMPADAS DE CRATERA, as treze fissuras da barriga, a coroa
    // polar e as treze brasas do enxame ACENDEM no flare (a montanha inteira fica
    // mais acesa conforme o chão cede) ----
    const bs0 = [1, 1, 1];
    for (const i of [...actors.lamps, ...actors.cracks, ...actors.corona, ...actors.gems, ...actors.swarms]) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      let sc = 1 + 0.08 * Math.sin(t * (2.6 + (i % 5) * 0.6) + i * 1.7 + seed);
      sc *= 1 + pose.flare * 0.22 + pose.quake * 0.3 - dying * 0.5;
      mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
    }

    // ---- os TREZE CONTRAFORTES: afundam no `brace` (o peso engrossa a perna e
    // a almofada esparrama no chão) e pulsam a pressão no resto do tempo ----
    for (const i of actors.roots) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const bs = part.s ?? bs0;
      const isPad = (part.tag ?? '') === 'root.pad';
      const press =
        1 +
        0.02 * Math.sin(t * 1.4 + (i % 13) * 0.48 + seed) +
        pose.brace * (isPad ? 0.09 : 0.03) + // a almofada ESPARRAMA no chão
        pose.quake * (isPad ? 0.06 : 0.02) -
        dying * 0.3;
      mesh.scale.set(bs[0] * press, bs[1] * (isPad ? 1 : press), bs[2] * press);
    }

    // ---- o resto: os seixos do entulho cintilam (o `flick` do figurino), o
    // matacão segurado ENGROSSA na afinação (o bloco sendo comprimido antes do
    // arremesso) e as placas do anel e os menires não ganham escala nenhuma ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const tag = part.tag ?? '';
      if (
        FACE_TAGS.has(tag) ||
        tag === 'crater.lamp' ||
        tag === 'crater.gem' ||
        tag === 'crack' ||
        tag === 'corona' ||
        tag === 'swarm.ember' ||
        tag === 'root' ||
        tag === 'root.pad' ||
        tag === 'core.rim'
      )
        continue;
      let sc = 1;
      if (tag === 'arm.block') sc *= 1 + pose.charge * 0.14;
      else if (tag === 'arm.fist') sc *= 1 + pose.charge * 0.06;
      if (part.flick) sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1 + seed));
      if (sc !== 1) {
        // escala NÃO uniforme preservada (as placas chatas do anel e as bochechas
        // espremidas viravam bolinha pulsando com setScalar)
        const bs = part.s ?? [1, 1, 1];
        mesh.scale.set(bs[0] * sc, bs[1] * sc, bs[2] * sc);
      }
    }

    // ---- corpo: PLANTADO NOS TREZE CONTRAFORTES (floatY 0 — o planetóide não
    // boia nem anda, e a bobeira do `bob` do figurino fica em zero para as
    // almofadas não descolarem do piso). Ele não verga nem anda: respira, agacha
    // no brace e no coice o QUAKE é o chão cedendo — o mais forte da árvore ----
    const g = rootRef.current;
    const breathe = Math.sin(t * 0.38 + seed) * 0.004;
    const squat = 1 - pose.brace * 0.022 - dying * 0.1;
    g.scale.set(
      1 + breathe + pose.brace * 0.016 + pose.quake * 0.012 - dying * 0.05,
      1 + breathe - pose.brace * 0.022 - dying * 0.1 * 1,
      1 + breathe + pose.brace * 0.016 + pose.quake * 0.012 - dying * 0.05,
    );
    void squat;
    // o coice do planetóide arremessando: a montanha inteira treme no lugar
    g.position.x = Math.sin(t * 33 + seed) * 0.055 * pose.quake;
    g.position.z = Math.cos(t * 29 + seed * 0.7) * 0.05 * pose.quake - pose.quake * 0.07;
    g.position.y = -pose.brace * 0.03 + Math.sin(t * 27 + seed) * 0.012 * pose.quake;
    g.rotation.y = Math.sin(t * 0.19 + seed) * 0.01 + pose.hurl * 0.05;
    g.rotation.x = pose.brace * 0.012;
    void topY; // forma única Nv.9 — o topo amarrado nos testes
  });

  return (
    <group ref={rootRef}>
      {buckets.planted.map((i) => (
        <mesh
          key={`pl${level}-${i}`}
          ref={(m) => {
            partRefs.current[i] = m;
          }}
          geometry={partGeos[i]}
          material={partMats.list[i]}
          position={visParts[i].p}
          rotation={visParts[i].r ?? [0, 0, 0]}
          scale={visParts[i].s ?? 1}
          castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'}
        />
      ))}
      {buckets.menhirs.map((i) => (
        <mesh
          key={`mn${level}-${i}`}
          ref={(m) => {
            partRefs.current[i] = m;
          }}
          geometry={partGeos[i]}
          material={partMats.list[i]}
          position={visParts[i].p}
          rotation={visParts[i].r ?? [0, 0, 0]}
          scale={visParts[i].s ?? 1}
          castShadow
        />
      ))}
      {/* tudo o que está PARAFUSADO no planetóide bascula junto no mascon */}
      <group ref={tiltRef}>
        {buckets.onBody.map((i) => (
          <mesh
            key={`ob${level}-${i}`}
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={visParts[i].p}
            rotation={visParts[i].r ?? [0, 0, 0]}
            scale={visParts[i].s ?? 1}
            castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'}
          />
        ))}
        {/* os dois braços, cada um no seu pivô de ombro (a quaternión vem do
            rig; o grupo só existe para o braço INTEIRO girar como um corpo) */}
        {[-1, 1].map((side) => (
          <group
            key={`arm${side}-${level}`}
            ref={(gr) => {
              armRefs.current[side + 1] = gr;
            }}
          >
            {buckets.arms
              .filter((a) => a.side === side)
              .map(({ i }) => (
                <mesh
                  key={`al${level}-${i}`}
                  ref={(m) => {
                    partRefs.current[i] = m;
                  }}
                  geometry={partGeos[i]}
                  material={partMats.list[i]}
                  position={visParts[i].p}
                  rotation={visParts[i].r ?? [0, 0, 0]}
                  scale={visParts[i].s ?? 1}
                  castShadow={visParts[i].m !== 'glow' && visParts[i].m !== 'black'}
                />
              ))}
          </group>
        ))}
        {/* a goela de treze faces: poço aceso no eixo da boca, dentro do aro */}
        <mesh
          ref={coreRef}
          geometry={core.geo}
          material={core.mat}
          position={COLOSSO_CORE_POS}
        />
        <sprite
          ref={coreGlowRef}
          position={[COLOSSO_CORE_POS[0], COLOSSO_CORE_POS[1], COLOSSO_CORE_POS[2] + 0.1]}
        >
          <spriteMaterial
            map={circleTexture()}
            color={COLOSSO_MAGMA}
            transparent
            opacity={0.06}
            depthWrite={false}
          />
        </sprite>
      </group>
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
              // só a rocha (regolito e cantaria) projeta sombra: as brasas do
              // enxame são luz e virariam bloco preto no piso (a lição do funil
              // da Névoa)
              castShadow={visParts[i].m === 'body' || visParts[i].m === 'dark' || visParts[i].m === 'accent'}
            />
          ))}
        </group>
      ))}
      {/* o talco do anel orbitando em velocidade diferencial */}
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
    </group>
  );
}

/**
 * PÓ DE ANEL: cada grão escolhe um raio e um ângulo e ORBITA o plano inclinado
 * do anel com ω ∝ 1/ρ (rotação diferencial — os de dentro dão mais voltas que os
 * de fora, o MESMO motor do pó de disco do irmão Astral). No estouro (`uSnap`) um
 * terço dos grãos é ejetado para cima, rento às lascas. Quente no aro interno
 * (magma #d98c4a), frio na borda (talco #cfc9d6): a curva de cor da lua.
 */
const RING_DUST_VERT = /* glsl */ `
attribute vec3 aRand; // x: angulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uSnap;
uniform float uRingY;
uniform float uTilt;
uniform vec3 uWarm;
uniform vec3 uCool;
varying float vA;
varying vec3 vC;
void main() {
  const float TAU = 6.28318;
  // os grãos nascem NA FAIXA do anel (matacões de ρ 1,84 a 2,31): poeira de pedra
  // que levanta do lastro e orbita junto, não nuvem solta boiando no escuro (a
  // falta do print do round 2). Um terço deles escapa do plano, mas sobe POUCO —
  // poeira rasteira de lua morta, não geyser
  float band = step(0.68, aRand.z);
  float r = 1.84 + 0.46 * aRand.z;
  float omega = (1.7 / r) * (1.0 + uCharge * 0.6 + uSnap * 1.6);
  float ang = aRand.y * TAU + uTime * omega * (band > 0.5 ? 0.55 : 1.0);
  float prog = fract(uTime * (0.08 + 0.12 * aRand.z) + aRand.y * 3.7);
  float lift = band * prog * prog * (0.5 + 0.4 * aRand.z + uSnap * 1.1);
  float py = 0.02 + 0.04 * sin(uTime * 1.1 + aRand.y * 9.0) + lift;
  float rr = r * (1.0 + prog * (0.05 + uSnap * 0.2));
  // o grão nasce no plano HORIZONTAL e é caído pela MESMA inclinação que o rig
  // aplica aos matacões do anel (R_x: y' = y·cos - z·sin)
  float px = cos(ang) * rr;
  float pz = sin(ang) * rr;
  vec3 p = vec3(px, uRingY + py * cos(uTilt) - pz * sin(uTilt), py * sin(uTilt) + pz * cos(uTilt));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // grão duro e quase apagado (talco de pedra morta, não faísca de foguete)
  float size = (1.6 + 2.4 * aRand.z) * (0.85 + uCharge * 0.4) * uSizeMul;
  gl_PointSize = min(80.0, size * (28.0 / max(0.5, -mv.z)));
  vA = (0.5 + 0.5 * aRand.z) * (1.0 - prog * 0.6) * uAlpha;
  // curva de cor do anel: o grão quente é o que raspa o aro de dentro, o de fora
  // é talco de regolito (a faixa toda é 1,9-2,4, então quase tudo é frio)
  vC = mix(uWarm, uCool, smoothstep(1.86, 2.26, r));
  gl_Position = projectionMatrix * mv;
}
`;

const RING_DUST_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pontinho duro com halo mínimo (grão de pedra em suspensão, nao puff)
  float m = smoothstep(0.5, 0.2, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.3);
}
`;
