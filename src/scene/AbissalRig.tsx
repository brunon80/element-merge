import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeCoreMaterial } from './lightningShaders';
import { makeIceMaterial } from './iceShaders';
import { makeWaterMaterial } from './waterShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do ABISSAL (Nv.8 — pântano+névoa: o TAMBORIL DAS MARÉS MORTAS), o
 * ladrão de vida (`drain 0,4` + `slow` + `poison`, alvo `lowestHp`). Zero
 * shader novo: a massa de água do fundo é o `makeWaterMaterial` da Nereia
 * lido em AZUL DO FUNDO (onda pouca — maré MORTA não espuma), o osso molhado
 * (vara da isca, dentes, costelas de afogado, guelras) é o `makeIceMaterial`
 * em osso PÁLIDO com trinca da cor do motor, e a vida roubada — a lanterna
 * da esca, o núcleo na jaula do peito e a brasa da garganta — é o
 * `makeCoreMaterial` do Plasma/Raio em verde-água. A identidade é UMA cor do
 * motor ao impacto: `#3f6f8f` = projectileColor do motor = VISUALS.abissal.
 * body = uMid da água do corpo = uCrack do osso = a farpa arremessada = o
 * anel do impacto. A segunda cor, `#5fe0c8` (= VISUALS.abissal.glow = a vida
 * roubada), é SEMPRE acento: lanterna, núcleo, fotoóforos, fendas da guelra
 * e as fagulhas de vida que CONVERGEM para o peito (o `drain` escrito em
 * partícula).
 *
 * Diferença dura contra os dois pais e a água da árvore:
 *  - PÂNTANO (mãe, Nv.7): lODO marrom-opaco plantado na poça, três pescoços
 *    que cospem. Aqui a água é AZUL ESCURO do fundo do mar, o bicho NADA
 *    (flutua e varre as barbatanas) e o veneno vem da ISCA, não de cuspe;
 *  - NÉVOA (mãe, Nv.7): bruma CLARA quase branca, translúcida. Aqui é o
 *    ESCURO absoluto do abismo — toda a luz é bioluminescência própria;
 *  - NEREIA (água pura Nv.2): ondas brancas violentas. Aqui `foamAmt` é
 *    0,24 — maré morta, sem cavalo de onda; espuma pálida, nunca branca de
 *    cachoeira.
 *
 * A ASSINATURA é a ESCA: a vara de osso nasce na testa, faz arco para trás e
 * curva para a frente — a lanterna de vida roubada pende SOBRE a goela e
 * balança no escuro. A goela é uma DOBRADIÇA no osso da bochecha (a mandíbula
 * INTEIRA — queixo, gengivas, presas de baixo e barbilho — rocks no pivô
 * exportado; a maxila de cima com as presas de cima NUNCA gira: entrelaçam
 * quando fecha, a armadilha fecha). Coreografia (janela 0,92 s, 60% de
 * sucção): o bicho ENCOLHE a massa, a isca DESCE na frente da goela aberta, a
 * vida roubada SOBE do peito para a garganta (a sucção), as barbatanas se
 * recolhem; no tiro a goela BATE, a isca estica para trás, a vida ROUBADA
 * MERGULHA de volta para o peito (o `drain 0,4` pago em coreografia: o núcleo
 * INCHA depois do acerto) e o coice estufa a barriga.
 */

export const ABISSAL_ATTACK_WINDOW = 0.92;
/** fração da janela em que o tamboril SUGA (a isca desce, a goela abre) */
export const ABISSAL_WINDUP = 0.6;

/** A maré do abissal: a cor do MOTOR (identidade do projétil ao impacto), o
 *  meio da água do corpo, a trinca do osso e o anel do FX — uma só chain */
export const ABISSAL_TIDE = '#3f6f8f';
/** a vida roubada (glow da espécie): lanterna, núcleo, fotoóforos, fagulhas
 *  do dreno — SEMPRE acento, nunca o corpo */
export const ABISSAL_LIFE = '#5fe0c8';

const ABISSAL_DEF = getSpecies('abissal');

/**
 * A LANTERNA da esca (amarrado em teste): o core do rig nasce exatamente
 * aqui e é a peça MAIS PARA FRENTE de toda a cabeça — o print tem que ler a
 * isca acesa pendurada na vara antes de ler qualquer olho.
 */
export const ABISSAL_LURE_POS: [number, number, number] = [0, 4.62, 1.05];
/** pivô da vara (amarrado em teste): a ilicium INTEIRA — vara, nós, berço e
 *  jaula de ganchos — rocks na testa; girar no +X é a isca DESGER na frente
 *  da goela (a armadilha atraindo mais perto) */
export const ABISSAL_LURE_PIVOT: [number, number, number] = [0, 3.08, -0.2];

/**
 * A DOBRADIÇA da goela (amarrado em teste): a MANDÍBULA inteira (queixo,
 * gengivas, presas de baixo, barbilho) gira no eixo X passado por este ponto
 * — o osso da bochecha, ATRÁS e ABAIXO da maxila. Toda peça `jaw.*` está à
 * FRENTE do pivô (z > -0,14): tombar no +X derruba o queixo e a goela abre
 * como um balde — nenhuma peça solta voando da cabeça no arremesso. As
 * presas de cima (`fang.up`, maxila fixa) ficam: fechadas, os dois dentes
 * ENTRELAÇAM na escuridão da goela.
 */
export const ABISSAL_JAW_PIVOT: [number, number, number] = [0, 2.34, -0.14];

/** pivô da barbatana peitoral (amarrado em teste): o ombro inteiro (nódulo,
 *  raios, ponteira acesa) rocks aqui; a membrana ('arm.membrane') é translúcida
 *  e acompanha por escala, mas a régua do pivô vale para o arco todo */
export const ABISSAL_ARM_PIVOT: [number, number, number] = [0.62, 2.02, -0.02];

/**
 * O NÚCLEO DE VIDA ROUBADA na jaula do peito (amarrado em teste): na sucção
 * ele SOBE para a garganta (a vida sendo pasteurizada para o tiro); no tiro
 * a vida ROUBADA do alvo MERGULHA de volta e o núcleo INCHA — o `drain 0,4`
 * escrito em coreografia.
 */
export const ABISSAL_CORE_POS: [number, number, number] = [0, 1.97, 0.34];

export interface AttackPose {
  lure: number; // 0..1: a vara tomba e a isca desce na frente da goela
  gape: number; // 0..1 a goela abre; negativo = a mordida BATENDO depois do tiro
  suck: number; // 0..1 a vida sobe do peito para a garganta; negativo = mergulha de volta
  inhale: number; // negativo = massa encolhendo; positivo = barriga ESTUFADA de vida
  stream: number; // barbatanas/tentáculos recolhidos para trás (positivo) e varridos (negativo)
  flare: number; // bioluminescência sobe: fotoóforos, fendas das guelras, órbitas aceleram
  charge: number; // 0..1: a carga inteira acesa (veios do osso, garganta, lanterna)
  lean: number; // verga para trás na sucção / mergulha para frente no coice
  surge: number; // a água do corpo: negativo = puxando a maré, positivo = jorrando no tiro
}

/**
 * A sucção do tamboril: 60% da janela é o bicho FICANDO IMÓVEL no escuro com
 * a isca acesa na frente da goela (a calma mais lenta da árvore antes do
 * golpe — comparação: Geodo 0,68 de carga, Cósmico 0,62, Cristal 0,55). O
 * tiro é MORDIDA, não cuspe: a goela bate, a isca recua do susto e a vida
 * roubada desaba no peito.
 */
export function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    lure: 0,
    gape: 0,
    suck: 0,
    inhale: 0,
    stream: 0,
    flare: 0,
    charge: 0,
    lean: 0,
    surge: 0,
  };
  if (since < 0 || since > ABISSAL_ATTACK_WINDOW) return P;
  const p = since / ABISSAL_ATTACK_WINDOW;
  if (p < ABISSAL_WINDUP) {
    // o tamboril congela: potências altas quase param o tempo (a isca desce
    // devagarzinho — peixe não assusta presa com pressa)
    const k = (p / ABISSAL_WINDUP) ** 1.5;
    P.lure = k;
    P.gape = 0.9 * k; // a goela abre em balde, SEMBARULHO
    P.suck = k; // a vida do peito sobe para a garganta (a sede)
    P.inhale = -0.7 * k; // a massa encolhe para caber no escuro
    P.stream = 0.55 * k; // barbatanas e tentáculos recolhidos (silêncio)
    P.flare = k;
    P.charge = k;
    P.lean = -0.28 * k;
    P.surge = -0.5 * k; // a maré sendo puxada para dentro
    return P;
  }
  const r = (p - ABISSAL_WINDUP) / (1 - ABISSAL_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.18)) ** 2; // a mordida é INSTANTÂNEA
  const decay = 1 - Math.max(0, (r - 0.4) / 0.6);
  P.lure = (1 - 1.3 * a) * decay; // a isca toma o susto da própria mordida
  P.gape = (0.9 - 1.15 * a) * decay; // a goela BATE (-0,25 = a mandíbula estalou)
  P.suck = (1 - 1.6 * a) * decay; // -0,6: a vida ROUBADA MERGULHA no peito (drain pago)
  P.inhale = (-0.7 + 1.55 * a) * decay; // de encolhido a ESTUFADO de vida
  P.stream = (0.55 - 1.55 * a) * decay; // as barbatanas varrem para trás no coice
  P.flare = (1 - 1.15 * a) * decay;
  P.charge = (1 - 0.85 * a) * decay;
  P.lean = (-0.28 + 1.25 * a) * decay; // o mergulho do bote
  P.surge = (-0.5 + 1.6 * a) * decay; // a maré jorra para fora no tiro
  return P;
}

/**
 * A ÁGUA DO FUNDO (o corpo, a barriga, o cabo da cauda, as luas de maré):
 * azul do motor com o fundo de breu e espuma PÁLIDA e POUCA (foamAmt 0,24 —
 * maré morta não tem cavalo de onda; a Nereia pura usa mais e a lama do
 * Pântano, mais branca ainda é bolor). Ondulação contida: a massa é grande e
 * redonda, o relevo não pode comer a silhueta.
 */
export const WATER_TIDE_LOOK = {
  deep: '#142b38', // = VISUALS.abissal.dark (o breu do fundo)
  mid: ABISSAL_TIDE, // = VISUALS.abissal.body = a cor do MOTOR (identidade)
  foam: '#bfe9ff', // espuma pálida = VISUALS.abissal.accent (nunca #ffffff)
  foamAmt: 0.24, // maré MORTA: onda pouca (a régua contra a Nereia, que cavalga)
  amp: 0.038, // relevo contido: sete esferas sobrepostas não viram couve-flor
  swell: 0.042,
  bend: 0.032,
};

/** a maré mais funda (barriga, lábios, gotas, tentáculos, luas): o breu que
 *  engole — espuma quase nenhuma (0,18) */
export const WATER_TIDE_DEEP_LOOK = {
  ...WATER_TIDE_LOOK,
  deep: '#10202f',
  mid: '#35637f', // um degrau abaixo do corpo (o breu engole, mas não some no print)
  foam: '#8fb4c9',
  foamAmt: 0.16,
  amp: 0.034,
};

/**
 * O OSSO MOLHADO do abissal (vara da isca, jaula de ganchos, dentes,
 * costelas de afogado, tampa das guelras, barbilho, barbatana dorsal): osso
 * PÁLIDO quase gelo (#bfe9ff = VISUALS.accent) com a TRINCA da cor do motor
 * (#3f6f8f — identidade osso→projétil) e `amp` 0,008: a aresta do osso é
 * dura (a lição do quartzo do Geodo — relevo nenhum pode arredondar).
 */
export const BONE_LOOK = {
  iceA: '#bfe9ff', // = VISUALS.abissal.accent
  iceB: '#16324a', // osso encharcado de água do fundo
  crack: ABISSAL_TIDE, // = a cor do motor (identidade no osso)
  crackGlow: 0.75,
  crackScale: 1.4,
  crackWidth: 0.05,
  sparkle: 0.4, // osso molhado não pisca como quartzo: brilho contido
  alpha: 0.94, // osso denso, quase opaco
  bump: 0.6,
  reflPow: 100,
  envMix: 0.32,
  amp: 0.008,
};

/** a membrana translúcida das barbatanas: pele de peixe de abismo fina e
 *  azulada com a VIDA ROUBADA correndo nas nervuras (crack = #5fe0c8, SEMPRE
 *  acento) — a única translucidez do figurino, e só aqui */
export const MEMBRANE_LOOK = {
  iceA: '#6fa8c8',
  iceB: '#123043',
  crack: ABISSAL_LIFE,
  crackGlow: 0.5,
  crackScale: 1.1,
  crackWidth: 0.06,
  sparkle: 0.25,
  alpha: 0.45,
  bump: 0.4,
  reflPow: 70,
  envMix: 0.25,
  amp: 0.02,
};

/** o NÚCLEO DE VIDA ROUBADA na jaula do peito: verde-água da espécie, miolo
 *  quase branco-frio (nunca #ffffff puro), aro da maré do corpo */
export const CORE_LOOK = {
  gold: ABISSAL_LIFE,
  white: '#d9fff2',
  cool: ABISSAL_TIDE,
  amp: 0.05,
};

/** a LANTERNA da esca: a mesma vida, mais acesa (é o que atrai) — miolo
 *  branco-frio quente, aro da maré (a presa vé o azul do abismo em volta) */
export const LANTERN_LOOK = {
  gold: ABISSAL_LIFE,
  white: '#e9fff8',
  cool: ABISSAL_TIDE,
  amp: 0.03,
};

/** a brasa da GARGANTA (o 'white' do figurino): a vida sendo pasteurizada na
 *  goela antes do tiro — acesa, mas miúda, engolida pelo breu da boca */
export const THROAT_LOOK = {
  gold: ABISSAL_LIFE,
  white: '#e9fff8',
  cool: '#7fe3cf',
  amp: 0.02,
};

/** os FOTOÓFOROS e as fendas da guelra: a vida roubada respirando por dentro
 *  da maré escura */
export const PHOTOPHORE_LOOK = {
  gold: ABISSAL_LIFE,
  white: '#c9f7ea',
  cool: ABISSAL_TIDE,
  amp: 0.02,
};

export interface AbissalRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado: o ABISSAL usa — a jorrada fria da boca no arremesso */
  smoke?: SmokePool;
}

const tmpEuler = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3(1, 0, 0);
const tmpWorld = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();

export function AbissalRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: AbissalRigProps) {
  const modelDef = MODELS.abissal;
  const level = Math.max(
    ABISSAL_DEF.levelMin,
    Math.min(ABISSAL_DEF.levelMax, Math.round(levelProp ?? ABISSAL_DEF.levelMin)),
  );
  const moteCount = embers ?? 26;
  const topY = formTop(ABISSAL_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const lanternRef = useRef<THREE.Mesh>(null!);
  const lanternGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sprayDone = useRef(false);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** peças semânticas: a MANDÍBULA inteira rocks na dobradiça da bochecha
   *  (mesmo ângulo para queixo, gengiva, presa e barbilho = a goela fecha sem
   *  desencaixar e os dois dentes entrelaçam); a VARA DA ISCA inteira rocks na
   *  testa; as barbatanas no ombro; os tentáculos e a cauda esvoaçam; as
   *  guelras abrem com a sucção; fotoóforos e garganta pulsam com a carga. As
   *  três órbitas (cardume, luas de maré, farpas) não são atores */
  const actors = useMemo(() => {
    const jaw: number[] = [];
    const lure: number[] = [];
    const arms: { i: number; side: 1 | -1 }[] = [];
    const tentacles: { i: number; side: 1 | -1 }[] = [];
    const tails: number[] = [];
    const spikes: { i: number; side: 1 | -1 }[] = [];
    const gills: number[] = [];
    const nest: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      if (tag.startsWith('jaw.')) jaw.push(i);
      else if (tag.startsWith('lure.') && tag !== 'lure.mote' && tag !== 'lure.base') lure.push(i);
      else if (tag === 'lure.base') lure.push(i); // no próprio pivô: gira no lugar, não solta
      else if (tag === 'arm' || tag === 'arm.membrane') arms.push({ i, side });
      else if (tag === 'tentacle') tentacles.push({ i, side });
      else if (tag === 'tail') tails.push(i);
      else if (tag === 'spike') spikes.push({ i, side });
      else if (tag === 'gill') gills.push(i);
      else if (tag === 'throat' || tag === 'cavity' || tag === 'photophore') nest.push(i);
    });
    return { jaw, lure, arms, tentacles, tails, spikes, gills, nest };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // o breu da GOELA engole tudo: claro-sobre-escuro é o único contraste que
    // lê no card miúdo (a regra das manchas brutas da árvore — a face aqui é
    // a isca acesa PENDURADA na frente, nunca um olho)
    const kernel = new THREE.MeshBasicMaterial({ color: '#040a12' });
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
        return pick(`throat|${i % 2}`, () =>
          makeCoreMaterial({
            ...THROAT_LOOK,
            seed: 2.7 + (i % 2) * 2.2,
          }),
        );
      if (p.m === 'glow')
        return pick(`photo|${tag}|${i % 2}`, () =>
          makeCoreMaterial({
            ...PHOTOPHORE_LOOK,
            amp: tag === 'lure.mote' ? PHOTOPHORE_LOOK.amp * 1.4 : PHOTOPHORE_LOOK.amp,
            seed: 6.1 + (i % 2) * 2.9,
          }),
        );
      if (p.m === 'trans')
        return pick(`membrane|${i % 3}`, () =>
          makeIceMaterial({
            ...MEMBRANE_LOOK,
            seed: seed + (i % 3) * 2.4,
            breath: 0.7,
            teamColor: '#bfe9ff',
          }),
        );
      if (p.m === 'accent')
        return pick(`bone|${tag}|${i % 2}`, () =>
          makeIceMaterial({
            ...BONE_LOOK,
            amp: tag === 'lure.rod' || tag === 'rib' ? BONE_LOOK.amp : BONE_LOOK.amp * 1.4,
            sparkle: tag === 'fang.up' || tag === 'jaw.fang' ? BONE_LOOK.sparkle * 1.6 : BONE_LOOK.sparkle,
            seed: seed + (i % 2) * 2.8,
            breath: tag === 'barnacle' ? 0.3 : 0.55,
            teamColor: '#bfe9ff',
          }),
        );
      const deep = p.m === 'dark';
      const L = deep ? WATER_TIDE_DEEP_LOOK : WATER_TIDE_LOOK;
      // SEM cache para a maré: o gradiente vertical do shader (uYOff/uModelH) é
      // POR PEÇA — a onda percorre o modelo inteiro sem quebrar na emenda (a
      // receita da Nereia e do Pântano). `soft: 0`: tudo aqui é volume fechado
      // (bolas, gotas, cabos), nenhuma casca aberta para sumir na borda.
      return makeWaterMaterial({
        deep: L.deep,
        mid: L.mid, // = a cor do motor (identidade água→projétil→FX)
        foam: L.foam,
        foamAmt: tag === 'moon' || tag === 'drip' ? L.foamAmt * 0.7 : L.foamAmt,
        amp: tag === 'moon' || tag === 'drip' || tag === 'tentacle' ? L.amp * 0.7 : L.amp,
        swell: L.swell,
        bend: L.bend,
        soft: 0,
        yOff: p.p[1],
        modelH: topY,
        seed: seed + (i % 2) * 3.3,
        phase: 0,
      });
    });
    // a maré é material por peça (uYOff próprio); osso/vidas/brasa vêm do cache.
    // O loop de uniforms escreve os compartilhados uma vez a mais — inofensivo.
    const shaders = Array.from(
      new Set(list.filter((m): m is THREE.ShaderMaterial => m instanceof THREE.ShaderMaterial)),
    );
    for (const m of shaders) {
      // o traje manda nos uniforms (cascos sem uSparkle/uFoamAmt não podem ser
      // escritos pelo loop — a regra do guard por uniforme, não por sorte)
      const fs = m.fragmentShader;
      m.userData.kind = fs.includes('uFoamAmt') ? 'tide' : fs.includes('uSparkle') ? 'bone' : 'core';
    }
    return { list, uniq: [...new Set(list), kernel], shaders };
  }, [visParts, seed, level, topY]);

  // O NÚCLEO DE VIDA na jaula do peito (esfera 20×16 — densa, aguenta o close):
  // é ELE que sobe para a garganta na sucção e INCHA quando a vida do alvo é drenada.
  const core = useMemo(
    () => ({
      geo: new THREE.SphereGeometry(0.24, 20, 16),
      mat: makeCoreMaterial({ ...CORE_LOOK, seed: 5.3 }),
    }),
    [],
  );

  // A LANTERNINHA acesa no berço da esca (o print: a isca tem que ler ANTES
  // da cara) — silhueta do core do projétil-irmão e o ponto mais frontal da cabeça
  const lantern = useMemo(
    () => ({
      geo: new THREE.SphereGeometry(0.14, 16, 12),
      mat: makeCoreMaterial({ ...LANTERN_LOOK, seed: 8.9 }),
    }),
    [],
  );

  // FAGULHAS DE VIDA CONVERGINDO para o peito (o `drain 0,4` em partícula):
  // entram redondo pela maré e AfUNDEM no núcleo — ao carregar o tiro a
  // corrente APERTA. É o oposto do pó que cai do Geodo: aqui a luz entra.
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

  // água/osso/núcleo leem aSeed por peça; clonamos só os que usam
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
      lantern.geo.dispose();
      lantern.mat.dispose();
      motes.geo.dispose();
      motes.mat.dispose();
    };
  }, [partMats, core, lantern, motes]);

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
      if (demoT.current > ABISSAL_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const crumble = 1 - alpha; // morrendo: a maré se desfaz e a vida apaga
    const striking =
      sinceAttack >= ABISSAL_ATTACK_WINDOW * ABISSAL_WINDUP &&
      sinceAttack <= ABISSAL_ATTACK_WINDOW;
    if (!striking) sprayDone.current = false;

    // ---- jorrada fria da boca no instante da mordida (a maré que o bote
    // empurra; heat 0,03 = névoa fria do abismo, nunca fuligem) ----
    if (striking && !sprayDone.current && smoke) {
      sprayDone.current = true;
      rootRef.current?.updateWorldMatrix(true, false);
      for (let i = 0; i < 8; i++) {
        tmpWorld
          .set(
            (Math.random() - 0.5) * 0.9,
            2.1 + (Math.random() - 0.5) * 0.7,
            0.85 + Math.random() * 0.35,
          )
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.06 + Math.random() * 0.05,
          heat: 0.03, // névoa fria de abismo (a jorrada quente é do vulcão)
          life: 0.55 + Math.random() * 0.4,
          lifeVar: 0.3,
          jitter: 0.2,
          rise: 0.4,
          drag: 3.2,
          vx: (Math.random() - 0.5) * 1.2,
          vy: 0.4 + Math.random() * 0.7,
          vz: 1.3 + Math.random() * 1.4, // a maré jorra PARA FRENTE, na direção do bote
        });
      }
    }

    // ---- uniforms: maré, osso e vidas no MESMO loop ----
    const hum =
      Math.sin(t * 0.7 + seed) * 0.4 + Math.sin(t * 1.7 + seed * 0.7) * 0.3 +
      Math.sin(t * 0.33 + 2.1) * 0.3; // o tamboril respira devagar (peixe que espera)
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * (kind === 'bone' ? 0.2 : 0.3);
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'core' ? 1.1 : 0.7) + crumble * 0.4);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = hum * (0.5 + 0.5 * hpFrac) + pose.flare * 0.3;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: a maré agita e se desfaz (a lição do rig da Nereia — água
      // OPACA não fade por alfa, o corpo DESMANCHA no uAmp)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * (kind === 'tide' ? 0.25 : 0.08) + crumble * (kind === 'tide' ? 2.4 : 1.9));
      // a sucção acende os veios do osso (a maré puxando a luz para dentro)
      if (m.uniforms.uCrackGlow) {
        if (m.userData.baseGlow === undefined) m.userData.baseGlow = m.uniforms.uCrackGlow.value;
        m.uniforms.uCrackGlow.value = (m.userData.baseGlow as number) * (1 + pose.charge * 0.55);
      }
      // a maré morta quase não espuma: na sucção a espuma MINGUA (o mar é de
      // vidro antes da maré baixar) e no tiro ela volta
      if (m.uniforms.uFoamAmt) {
        if (m.userData.baseFoam === undefined) m.userData.baseFoam = m.uniforms.uFoamAmt.value;
        m.uniforms.uFoamAmt.value = (m.userData.baseFoam as number) * (1 - pose.suck * 0.4 + pose.surge * 0.3);
      }
      if (m.uniforms.uSurge) m.uniforms.uSurge.value = pose.surge;
      if (m.uniforms.uFlare) m.uniforms.uFlare.value = pose.flare;
      if (m.uniforms.uSparkle) {
        if (m.userData.baseSparkle === undefined) m.userData.baseSparkle = m.uniforms.uSparkle.value;
        m.uniforms.uSparkle.value = (m.userData.baseSparkle as number) * (1 + pose.charge * 0.3);
      }
    }

    // ---- O NÚCLEO NA JAULA: sobe para a garganta na sucção e MERGULHA de
    // volta inchando quando a vida do alvo é drenada (o `drain 0,4` pago) ----
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = Math.min(1, pose.suck * 1.1 + crumble * 0.5);
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.92 + 0.08 * Math.sin(t * 2.0 + seed) + pose.suck * 0.1 + Math.max(0, -pose.suck) * 0.18;
    coreRef.current.scale.setScalar(Math.max(0.12, boil * (1 - crumble * 0.5)));
    coreRef.current.rotation.y = t * 0.4 + seed;
    coreRef.current.position.set(
      ABISSAL_CORE_POS[0],
      ABISSAL_CORE_POS[1] + pose.suck * 0.42 + Math.sin(t * 1.3 + seed) * 0.015,
      ABISSAL_CORE_POS[2] + pose.suck * 0.18,
    );
    const cglow = coreGlowRef.current;
    cglow.position.copy(coreRef.current.position);
    cglow.position.y += 0.3;
    cglow.scale.setScalar(0.34 + pose.charge * 0.26 + pose.suck * 0.14);
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.02 * Math.sin(t * 1.9 + seed) + pose.charge * 0.1) * alpha,
    );

    // ---- A LANTERNA DA ESCA: balança na vara (idle) e DESCE na frente da
    // goela ao carregar — no mesmo ângulo da vara, amarrado no pivô ----
    lantern.mat.uniforms.uTime.value = t;
    lantern.mat.uniforms.uCharge.value = Math.min(1, pose.charge * 1.15 + crumble * 0.5);
    lantern.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const lureA = lureAngle(pose, t, seed);
    tmpQ.setFromAxisAngle(tmpAxis, lureA);
    tmpWorld
      .set(
        ABISSAL_LURE_POS[0] - ABISSAL_LURE_PIVOT[0],
        ABISSAL_LURE_POS[1] - ABISSAL_LURE_PIVOT[1],
        ABISSAL_LURE_POS[2] - ABISSAL_LURE_PIVOT[2],
      )
      .applyQuaternion(tmpQ);
    lanternRef.current.position.set(
      ABISSAL_LURE_PIVOT[0] + tmpWorld.x,
      ABISSAL_LURE_PIVOT[1] + tmpWorld.y,
      ABISSAL_LURE_PIVOT[2] + tmpWorld.z,
    );
    const lboil = 0.95 + 0.05 * Math.sin(t * 3.1 + seed) + pose.charge * 0.12;
    lanternRef.current.scale.setScalar(Math.max(0.1, lboil * (1 - crumble * 0.6)));
    lanternRef.current.rotation.y = t * 0.5 + seed;
    const lglow = lanternGlowRef.current;
    lglow.position.copy(lanternRef.current.position);
    lglow.position.y += 0.06;
    // o halo da isca é o FAROL do print: maior e mais aceso que o núcleo do
    // peito (a presa vê a isca antes de ver qualquer coisa)
    lglow.scale.setScalar(0.4 + pose.charge * 0.44);
    (lglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.11 + 0.03 * Math.sin(t * 2.4 + seed) + pose.charge * 0.18) * alpha,
    );

    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: NADANDO parado (o wrapper já dá floatY/bob; aqui é o
    // mergulho, o encolher e o jorrar da maré) ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.5 + seed) * 0.018 + Math.sin(t * 0.83 + 1.4) * 0.008;
    const breathe = Math.sin(t * 0.6 + seed) * 0.006;
    g.scale.set(
      1 - pose.inhale * 0.05 + breathe + crumble * 0.05, // estufado: alarga para os lados
      1 + pose.inhale * 0.07 + breathe - crumble * 0.12, // estufado de vida: sobe
      1 + pose.inhale * 0.03 + breathe + crumble * 0.05,
    );
    g.rotation.y = sway;
    g.rotation.z = Math.sin(t * 0.31 + seed * 0.5) * 0.012 + crumble * 0.12; // morrendo: tomba de lado
    g.rotation.x = pose.lean * 0.09 + Math.sin(t * 0.45 + seed) * 0.01;

    // ---- as três órbitas em alturas que nunca se tocam: cardume alto (0),
    // luas de maré no corpo no SENTIDO CONTRÁRIO (1) e farpas na cabeça (2).
    // A afinação aqui é VELOCIDADE (o cardume sentindo a isca), não tremor ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.flare * 0.9);
    }

    // ---- A MANDÍBULA: a ASSINATURA da armadilha. Queixo, gengivas, presas
    // de baixo e barbilho giram no MESMO eixo X da dobradiça (osso da
    // bochecha) — é por isso que a goela abre como balde e fecha entrelaçando
    // os dentes, sem nenhuma peça solta voando da cabeça ----
    const gapeA = 0.62 * pose.gape + 0.05 + 0.03 * Math.sin(t * 1.05 + seed);
    for (const i of actors.jaw) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      tmpQ.setFromAxisAngle(tmpAxis, gapeA);
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      tmpPivot.set(ABISSAL_JAW_PIVOT[0], ABISSAL_JAW_PIVOT[1], ABISSAL_JAW_PIVOT[2]);
      tmpWorld
        .set(
          part.p[0] - ABISSAL_JAW_PIVOT[0],
          part.p[1] - ABISSAL_JAW_PIVOT[1],
          part.p[2] - ABISSAL_JAW_PIVOT[2],
        )
        .applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
      const bs = part.s ?? [1, 1, 1];
      const k = 1 + Math.abs(pose.gape) * 0.02;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- A VARA DA ISCA: a ilicium inteira (base, vara, nós, berço e jaula)
    // rocks no osso da testa; a LANTERNA do rig segue o MESMO ângulo (amarrado
    // em teste). O berço da lanterna e a vara são ossos: giram POUCO (0,75 no
    // pico — a isca desengonçando na frente da goela, não um braço de borracha) ----
    for (const i of actors.lure) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      tmpQ.setFromAxisAngle(tmpAxis, lureA);
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      tmpPivot.set(ABISSAL_LURE_PIVOT[0], ABISSAL_LURE_PIVOT[1], ABISSAL_LURE_PIVOT[2]);
      tmpWorld
        .set(
          part.p[0] - ABISSAL_LURE_PIVOT[0],
          part.p[1] - ABISSAL_LURE_PIVOT[1],
          part.p[2] - ABISSAL_LURE_PIVOT[2],
        )
        .applyQuaternion(tmpQ);
      mesh.position.set(tmpPivot.x + tmpWorld.x, tmpPivot.y + tmpWorld.y, tmpPivot.z + tmpWorld.z);
      const bs = part.s ?? [1, 1, 1];
      const k = 1 + pose.charge * 0.02;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- BARBATAS: o ombro inteiro rocks no nódulo [0.62, 2.02, -0.02]
    // (pivô exportado); na sucção COLHEM para silêncio, no coice VARREM ----
    const armA = 0.5 * pose.stream + 0.03 * Math.sin(t * 1.4 + seed);
    for (const a of actors.arms) {
      const mesh = partRefs.current[a.i];
      if (!mesh) continue;
      const part = visParts[a.i];
      tmpEuler.set(armA, 0, 0);
      tmpQ.setFromEuler(tmpEuler);
      tmpQ2.setFromEuler(tmpEuler.set(...(part.r ?? [0, 0, 0])));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld
        .set(part.p[0] - ABISSAL_ARM_PIVOT[0], part.p[1] - ABISSAL_ARM_PIVOT[1], part.p[2] - ABISSAL_ARM_PIVOT[2])
        .applyQuaternion(tmpQ);
      mesh.position.set(
        ABISSAL_ARM_PIVOT[0] + tmpWorld.x,
        ABISSAL_ARM_PIVOT[1] + tmpWorld.y,
        ABISSAL_ARM_PIVOT[2] + tmpWorld.z,
      );
      const k = 1 + pose.charge * 0.03;
      const bs = part.s ?? [1, 1, 1];
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- peças comuns: tentáculos e cauda esvoaçam (o nado parado), guelras
    // abrem com a sucção, fotoóforos/garganta/jaula pulsam com a carga ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      if (
        part.tag?.startsWith('jaw.') ||
        (part.tag?.startsWith('lure.') && part.tag !== 'lure.mote') ||
        part.tag === 'arm' ||
        part.tag === 'arm.membrane'
      )
        continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const tent = actors.tentacles.find((x) => x.i === i);
      const tail = actors.tails.includes(i);
      if (tent) {
        // tentáculo: ondinha de corrente + varrida para trás no coice (os nós
        // dos segmentos escondem a emenda — a oscilação é miúda de propósito)
        const wob = Math.sin(t * (0.8 + (i % 3) * 0.22) + i * 1.9) * 0.05;
        mesh.rotation.set(
          base[0] + pose.stream * 0.12 + wob,
          base[1],
          base[2] + tent.side * (0.06 * pose.stream + wob * 1.4),
        );
        sc *= 1 + pose.charge * 0.03;
      } else if (tail) {
        // cauda: o leme batendo devagar (o tamboril NÃO anda — moveSpeed 0 —
        // mas a cauda corrige o corpo na corrente: um balanço de relógio)
        mesh.rotation.set(
          base[0] + Math.sin(t * 1.15 + seed) * 0.05 + pose.lean * 0.1,
          base[1] + Math.sin(t * 0.9 + seed * 1.3) * 0.04,
          base[2],
        );
        sc *= 1 + pose.charge * 0.03;
      } else {
        const spike = actors.spikes.find((x) => x.i === i);
        if (spike) {
          const shimmer = Math.sin(t * (1.0 + (i % 3) * 0.3) + i * 2.3) * 0.02;
          mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.1));
          sc *= 1 + pose.flare * 0.04;
        }
        if (actors.gills.includes(i)) {
          // guelra respirando a sucção: no recolher fecha, no tiro ESTUFCA
          sc *= 1 + pose.inhale * 0.07 + pose.charge * 0.02;
          mesh.rotation.set(base[0], base[1], base[2] + pose.inhale * 0.06);
        }
        if (actors.nest.includes(i)) {
          // garganta, moldura da jaula e fotoóforos: a luz subindo pelo corpo
          sc *= 1 + pose.charge * 0.1 + Math.sin(t * (4.4 + (i % 4) * 1.2) + i * 1.8) * 0.03 * pose.charge;
        }
      }

      if (part.flick) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 2.1 + seed));
      }
      if (sc !== 1) {
        // escala NÃO uniforme preservada (os ovais achatados da maré não viram bolinha)
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
            // só a maré e o osso projetam sombra: membrana, vidas acesas e o
            // breu da goela são translúcidos/luz e viravam bloco preto no piso
            // (a lição do funil da Névoa)
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
      {/* O NÚCLEO DE VIDA na jaula do peito: sobe para a garganta na sucção e
          MERGULHA inchando quando o alvo é drenado — o `drain 0,4` do motor
          escrito na coreografia do corpo */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} position={ABISSAL_CORE_POS} />
      {/* A LANTERNA da esca: a vida roubada no berço da vara — a peça mais
          PARA FRENTE da cabeça (o print lê a isca antes da cara) */}
      <mesh ref={lanternRef} geometry={lantern.geo} material={lantern.mat} position={ABISSAL_LURE_POS} />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite
        ref={coreGlowRef}
        position={[ABISSAL_CORE_POS[0], ABISSAL_CORE_POS[1] + 0.3, ABISSAL_CORE_POS[2]]}
        scale={0.36}
      >
        <spriteMaterial
          map={circleTexture()}
          color={ABISSAL_LIFE}
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={lanternGlowRef} position={[ABISSAL_LURE_POS[0], ABISSAL_LURE_POS[1] + 0.06, ABISSAL_LURE_POS[2]]} scale={0.3}>
        <spriteMaterial
          map={circleTexture()}
          color={ABISSAL_LIFE}
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/** o ângulo da vara da isca (compartilhado entre as peças `lure.*` e a
 *  lanterna do rig): idle balança sozinha no escuro (a isca trabalha); na
 *  sucção DESCE 0,75 rad na frente da goela */
function lureAngle(pose: AttackPose, t: number, seed: number): number {
  return 0.75 * pose.lure + 0.05 * Math.sin(t * 0.9 + seed) + 0.02 * Math.sin(t * 1.9 + seed * 1.7);
}

/**
 * FAGULHAS DE VIDA CONVERGINDO para o peito (o `drain 0,4` escrito em
 * partícula): entram pela maré num raio grande e AFUNDEM em espiral para
 * dentro, na altura do núcleo (y ~1,9), esfriando do pálido da presa (#bfe9ff
 * na borda) para o verde-água absorvido (#5fe0c8) antes de apagar no casco.
 * É o INVERSO do pó que cai do Geodo: aqui a luz ENTRa — e uCharge aperta a
 * corrente quando o tiro está sendo carregado.
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
  float speed = 0.5 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.11 * (1.0 + uCharge * 1.6) + aRand.y);
  // convergindo em espiral para DENTRO: o raio fecha (a presa entrando na
  // armadilha) e o giro APERTA perto do núcleo
  float ang = aRand.x * 6.28318 + prog * (2.2 + 3.2 * aRand.z) + uTime * 0.1;
  float r = 0.24 + (1.0 - prog) * (1.3 + 0.7 * aRand.z);
  float y = 1.9 + (aRand.y - 0.5) * 1.1 * (1.0 - prog) + prog * 0.15;
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r + 0.34 * prog);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // fagulha MIÚDA e fria (a vida não é brasa): nunca confete aceso
  float size = (1.3 + 2.2 * aRand.z) * (0.9 + uCharge * 0.5) * uSizeMul * (1.0 - prog * 0.35);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce na borda da maré e morre absorvida no casco
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.5, 1.0, prog)) * uAlpha;
  // esfriando ao ser absorvida: pálido de presa -> verde-água -> some
  vC = mix(vec3(0.749, 0.914, 1.0), vec3(0.373, 0.878, 0.784), prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // halo miúdo com caroço frio (a vida não é fogo)
  float m = smoothstep(0.5, 0.12, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.32);
}
`;
