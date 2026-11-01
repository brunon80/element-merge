import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeArcMaterial, makeCoreMaterial, makeLightningShellMaterial } from './lightningShaders';
import { makeSteamMaterial } from './steamShaders';
import { makeStoneMaterial, TEAM_TINT } from './stoneShaders';
import { circleTexture, getGeometry, setSeedAttribute } from './assets';
import { MODELS, partsForLevel } from './speciesModels';
import { makeMoteGeo } from './NevoaRig';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig do CÓSMICO (Nv.8 — tempestade+plasma: a CONSTELAÇÃO VIVA), o caçador que
 * tranca o alvo MAIS DISTANTE e cospe DUAS estrelas que saltam de alvo em alvo
 * (doubleShot + chain 2 + burn). Zero shader novo: o corpo é o traje do RAIO
 * (`lightningShaders`, a mesma casca elétrica do pai) lido em NOITE — body/dark/
 * vein/core amarrados às quatro cores do motor em `VISUALS.cosmico`; os NÓS da
 * constelação e a estrela do peito são o plasma do Plasma/Raio (`makeCore-
 * Material`, e por isso a espécie é a única que HERDA o plasma da mãe sem jaula
 * de ferro); os FIOS do asterismo são o traço do Raio (`makeArcMaterial`) preso
 * num tubo (jitter ≤ raio do fio — a régua da árvore); a cumulonimbus nos pés é
 * o `makeSteamMaterial` da Tempestade (SEM tint de equipe: regra estrutural da
 * nuvem) e a armadura/máscara/discos são o `stoneShaders` em PEDRA-DA-LUA
 * clara. A identidade é amarrada do motor ao impacto numa única cor:
 * `#9ad0ff` = projectileColor do motor = uVein da casca = uGold do fio = uGold
 * do nó = sprite da estrela do peito.
 *
 * Figurino (o que o placeholder [0.9s, dodecaedro + 2 toros + drop] não dizia):
 *  1. PLANTADA NA PRÓPRIA TEMPESTADE (floatY 0, bob 0,025): a constelação fica
 *     DE PÉ sobre a cumulonimbus que a acendeu (três cascas abertas de vapor),
 *     com uma ÂNCORA de estrela caída no piso (rocha escura com a cavidade do
 *     `uCoreCut` do shell aberta SOBRE a estrela presa dentro — a herança do
 *     Plasma lida para a pedra) e um DISCO de órbita riscado rente ao chão do
 *     slot; a nuvem da mãe respira e o pó estelar sobe do disco para dentro do
 *     peito (o funil invertido: largo no chão, apertado na figura);
 *  2. O CORPO É UM DESENHO, NÃO UMA SILHUETA: um asterismo de NÓS DE PLASMA
 *     costurado por FIOS DE CORRENTE (braços e pernas SÃO fios, com caneleiras
 *     de doze faces por cima) e cada mão é uma ESTRELA — os dois tiros do
 *     doubleShot escritos na silhueta;
 *  3. A COSTELA DA ESPÉCIE É DEZ FACES + OITO PONTAS: a loriga é tambor de
 *     DOZE FACES (`cyl` a[3]=12 em todo body/dark/accent), as estrelas têm
 *     OITO PONTAS (`cone` a[2]≥8 com a base enterrada no nó) e o halo tem
 *     OITO farpas e três órbitas em alturas separadas que giram em sentidos
 *     CONTRÁRIOS (a galáxia
 *     em corte). O CRISTAL é o vizinho mais próximo (seis FACES, ricochete,
 *     farpas em LEQUE) — e aqui é o oposto: doze faces, oito pontas, órbitas;
 *  4. A COROA É A CONSTELAÇÃO DE CINCO ESTRELAS EM W que o rig ERGUIE e faz
 *     BRILHAR na afinação (o alvo mais distante travado) — a Névoa usa chifre
 *     ÚNICO de cinco pontas, aqui é W de cinco ESTRELAS com a coroa E a cabeça
 *     irradiando oito pontas cada;
 *  5. CABEÇA legível na escala do card (a regra do Cristal): crânio escuro,
 *     PLACA CLARA DA FACE de pedra-da-lua na frente, sobrancelha/boca em barra
 *     escura, e os OLHOS SÃO ESTRELAS (dois nós de plasma miúdos com o breu na
 *     frente — claro sobre escuro, nunca googly).
 *
 * Coreografia: a figura ENCOLHE (a mola), os dois braços de corrente RECUAM no
 * pivô do ombro, as pontas das estrelas se eriçam, os fios correm mais rápido e
 * as três órbitas aceleram; no tiro o corpo ESTUFA, os dois braços VARREM para
 * frente e a luz sai pelas mãos. Morte = a loriga esfarela (uAmp sobe), as
 * estrelas apagam e o corpo tomba.
 */

export const COSMICO_ATTACK_WINDOW = 0.86;
/** fração da janela em que a constelação alinha (fios aceleram, coroa ergue) */
export const COSMICO_WINDUP = 0.62;

/** a LUZ-DA-ESTRELA da espécie: é UMA cor só do motor ao impacto — projectile-
 *  Color do motor = uVein da casca = uGold dos fios = uGold dos nós = sprite */
export const COSMICO_STARLIGHT = '#9ad0ff';
/** o CALOR do Plasma (mãe): aro dourado das estrelas e o veio da âncora —
 *  sempre acento, nunca a cor principal (a regra da Névoa/Obsidiana) */
export const COSMICO_HEAT = '#ffe9a8';

const COSMICO_DEF = getSpecies('cosmico');

/**
 * A ESTRELA do peito: encaixada NO SOQUETE de lua (o `cyl` aberto do modelo em
 * [0, 2.54, 0.62]) e DO LADO DE FORA da loriga — no Cristal a luz enterrada no
 * invólucro era comida pelo alfa e o peito lia liso (a lição vale aqui). Ama-
 * rrado em teste.
 */
export const COSMICO_CORE_POS: [number, number, number] = [0, 2.54, 0.88];

/**
 * Pivô do ombro (amarrado em teste): o braço INTEIRO — fio do ombro ao cotovelo,
 * nó do cotovelo, caneleira, pulso, a estrela da mão e suas oito pontas — gira
 * na BOLA DO OMBRO (o nó em [0.92, 3.02, 0.08]), NÃO no próprio centro: girar
 * cada peça no próprio centro desarticularia o braço de corrente no meio do
 * arremesso (a lição do braço do Cristal).
 */
export const COSMICO_ARM_PIVOT: [number, number, number] = [0.92, 3.02, 0.08];

/** pivô da coroa em W (amarrado em teste): o asterismo inteiro gira AQUI — uma
 *  única rotação rígida para todas as peças da coroa (mesmo pivô, mesmo ângulo)
 *  é o que mantém os fios colados nas cinco estrelas */
export const COSMICO_CROWN_PIVOT: [number, number, number] = [0, 4.46, 0];

export interface AttackPose {
  twist: number; // a constelação torce ao alinhar (e devolve no tiro)
  gather: number; // negativo = encolhe juntando as duas mãos-estrela; positivo = estufa na descarga
  swing: number; // braços de corrente (negativo = recuam, positivo = varrem para frente)
  charge: number; // 0..1: nervuras acendem, fios correm, coroa ergue, órbitas aceleram
  lean: number; // verga para trás ao alinhar / para frente no coice
  stepZ: number; // plantada na tempestade: só o tronco empurra contra a nuvem
  flare: number; // as oito pontas de cada estrela eriçam e a coroa brilha
}

/** Coreografia da constelação: alinha (o alvo mais distante é travado pela
 *  coroa) e cospe o PAR de estrelas. Menos nervosa que o Plasma (0,48) e mais
 *  lenta que a Tempestade (0,55): é uma entidade enorme e ritual. */
export function attackPose(since: number): AttackPose {
  const P: AttackPose = { twist: 0, gather: 0, swing: 0, charge: 0, lean: 0, stepZ: 0, flare: 0 };
  if (since < 0 || since > COSMICO_ATTACK_WINDOW) return P;
  const p = since / COSMICO_ATTACK_WINDOW;
  if (p < COSMICO_WINDUP) {
    // o alinhamento ENCHE e segura (a corrente despejando no peito)
    const k = (p / COSMICO_WINDUP) ** 1.25;
    P.twist = 0.18 * k;
    P.gather = -0.82 * k; // as duas mãos-estrela vêm para o peito (o par do doubleShot)
    P.swing = -1.0 * k; // os dois braços de corrente RECUEM no pivô do ombro
    P.charge = k;
    P.lean = -0.4 * k;
    P.stepZ = -0.05 * k; // plantada na nuvem: só o tronco recua
    P.flare = 0.85 * k; // as oito pontas de cada estrela se eriçam
    return P;
  }
  const r = (p - COSMICO_WINDUP) / (1 - COSMICO_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.22)) ** 2; // o par de estrelas sai quase junto
  const decay = 1 - Math.max(0, (r - 0.5) / 0.5);
  P.twist = (0.18 - 0.42 * a) * decay; // torce no CONTRÁRIO (a corrente quebrou)
  P.gather = (-0.82 + 1.62 * a) * decay; // de juntinho a estufado (a luz saiu pelas mãos)
  P.swing = (-1.0 + 2.1 * a) * decay; // os dois braços varrem para frente
  P.charge = (1 - 0.75 * a) * decay; // o miolo esvazia: a luz foi nos dois tiros
  P.lean = (-0.4 + 1.0 * a) * decay;
  P.stepZ = (-0.05 + 0.26 * a) * decay;
  P.flare = (0.85 + 0.45 * a) * decay; // o estalo arreganha as pontas
  return P;
}

/**
 * A CASCA DE NOITE (o corpo): as QUATRO cores do motor lidas direto no traje do
 * Raio (body/dark/vein/core = VISUALS.cosmico). A nervura é a LUZ-DA-ESTRELA
 * (fria: sobre azul-indigo escuro ela lê estrela, nunca magma — a regra do veio
 * contido, e o aro frio de corrente segura o contorno) e a cavidade do shell
 * (`uCoreCut`) só abre na ÂNCORA, sobre a estrela caída presa na rocha.
 */
export const SHELL_LOOK = {
  body: '#2b3560', // a noite do corpo (luma ~0,2: azul profundo, nunca preto chato)
  dark: '#141a33', // a noite funda (fendas, saia, placas da frente)
  vein: COSMICO_STARLIGHT, // a nervura elétrica = a identidade da espécie
  core: COSMICO_HEAT, // o aro dourado da descarga (o plasma da mãe)
  cool: '#4fa8ff', // o aro frio da corrente
  amp: 0.026,
  coreCut: 0, // corpo fechado
  anchorCut: 0.72, // só a ÂNCORA abre a fenda sobre a estrela caída
};

/**
 * PEDRA-DA-LUA (máscara da face, soquete da estrela, garras, ombreiras, disco
 * de órbita, farpas do halo): CLARA de propósito — no Cristal a placa escura da
 * face recebia só 0,32 do key light da arena e virava buraco; aqui a face é
 * lua-azulada (luma ~0,6). Veio CONTIDO: glow 0,16 × boost 0,4 = 0,064 — quem
 * arde são os nós e a estrela do peito, nunca a armadura (o brilho de uma
 * constelação vem das estrelas, não da rocha).
 */
export const MOON_LOOK = {
  rockA: '#a2b0d4', // lua clara (luma ~0,68: a loriga inteira é pedra no print)
  rockB: '#4a5578', // a mesma noite, um degrau acima
  crack: COSMICO_STARLIGHT,
  crackGlow: 0.16,
  crackScale: 1.7, // veio curto e denso: as peças de lua são miúdas
  crackWidth: 0.05,
  crackBoost: 0.4,
  speck: 0.5,
  amp: 0.014,
};

/**
 * O NÓ DE PLASMA (cada estrela do asterismo, a estrela do peito, a estrela
 * caída presa na âncora e as estrelas-olho): o `CORE` do Raio/Plasma lido FRIO
 * — corpo azul-estrela, miolo fervendo quase branco e o OURO do Plasma como
 * aro de fresnel. É o contraste (frio no corpo, ouro na borda) que faz a
 * estrela ler quente dentro da noite SEM virar brasa.
 */
export const STAR_LOOK = {
  gold: COSMICO_STARLIGHT, // = a cor do motor (identidade do nó ao projétil)
  white: '#e6f1ff', // o miolo fervendo (nunca #ffffff puro: some no flash)
  cool: COSMICO_HEAT, // aro dourado = a herança do plasma da mãe
  amp: 0.03,
};

/** A ESTRELA DO PEITO (a maior delas, solta no soquete): mesma receita, fervura
 *  mais alta — é o nó onde toda a corrente do corpo deságua antes do disparo */
export const CORE_LOOK = {
  gold: COSMICO_STARLIGHT,
  white: '#eaf3ff',
  cool: COSMICO_HEAT,
  amp: 0.05,
};

/**
 * OS FIOS DA CONSTELAÇÃO (braços, pernas, tórax, coroa): a corrente do Raio
 * presa num tubo de oito faces. A receita do PAI é ouro com acento azul; aqui é
 * o INVERSO — traço AZUL-ESTRELA (a identidade) com acento OURO (o plasma da
 * mãe): é assim que um print separa o pai do filho.
 * jitter 0,028 e no pico da carga o multiplicador do rig é ≤1,6 (0,0448 <
 * 0,048 — o fio mais fino do figurino): o fio NUNCA sai do próprio corpo — a
 * régua que o Raio quebra e amargou na lição da árvore (ficou amarrada em teste).
 */
export const STRAND_LOOK = {
  gold: COSMICO_STARLIGHT,
  white: '#e6f1ff',
  cool: COSMICO_HEAT,
  coolAmt: 0.34,
  jitter: 0.028,
  dash: 3.4,
  flow: 4.2,
};

/** A CUMULONIMBUS AOS PÉS (a Tempestade mãe): cinza-ardósia fria, SEM tint de
 *  equipe (regra estrutural do steamShaders) e SEM hot de brasa — o topo claro
 *  é lua, nunca fogueira (o Vulcão é fogo e não tem nuvem quente nos pés) */
export const VEIL_LOOK = {
  cool: '#38456a',
  warm: '#5d6f96',
  hot: '#9fb6da', // topo de LUA (nunca brasa: o Vulcão é o dono do fogo)
  alpha: 0.82, // opaco demais virava balão azul (o print da segunda passada)
  swirl: 0.5,
  amp: 0.1,
};

/** AS OITO PONTAS (os cones que irradiam de cada nó): material DURO emissivo
 *  MIÚDO — nada de aditivo aqui (a identidade da espécie é o albedo azul com
 *  nervura acesa; aditivo só nos fios e nas partículas, a regra da árvore) */
export const FLARE_LOOK = {
  color: '#c3d5f2',
  emissive: COSMICO_STARLIGHT,
  emissiveIntensity: 0.42,
  roughness: 0.34,
};

export interface CosmicoRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — o CÓSMICO NÃO o usa: a fumaça do shader é grafite
   *  quente e a tempestade da espécie já é as cascas de nuvem do próprio rig */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpAxis = new THREE.Vector3(0, 0, 1);

export function CosmicoRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
}: CosmicoRigProps) {
  const modelDef = MODELS.cosmico;
  const level = Math.max(
    COSMICO_DEF.levelMin,
    Math.min(COSMICO_DEF.levelMax, Math.round(levelProp ?? COSMICO_DEF.levelMin)),
  );
  const moteCount = embers ?? 30;
  const topY = formTop(COSMICO_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreRef = useRef<THREE.Mesh>(null!);
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const currents = useRef(0); // os fios acelerando até o estalo

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  /** peças semânticas: o braço INTEIRO gira no pivô do ombro; a coroa em W
   *  gira inteira no pivô da coroa (mesmo pivô + mesmo ângulo = os fios ficam
   *  colados nas cinco estrelas); as pontas eriçam; garras/ombreiras apontam.
   *  As farpas em órbita NÃO são atoras: são os três grupos orbitais */
  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1 }[] = [];
    const crown: number[] = [];
    const spikes: { i: number; side: 1 | -1 }[] = [];
    const flares: number[] = [];
    const nodes: number[] = [];
    visParts.forEach((p, i) => {
      const tag = p.tag ?? '';
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      if (tag.startsWith('arm')) arms.push({ i, side });
      else if (tag.startsWith('crown')) crown.push(i);
      else if (tag === 'spike') spikes.push({ i, side });
      else if (tag.includes('flare')) flares.push(i);
      else if (tag.includes('node') || tag === 'caged') nodes.push(i);
    });
    return { arms, crown, spikes, flares, nodes };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // o breu NA FRENTE da estrela-olho: claro-sobre-escuro é o único contraste
    // que lê no card miúdo (a regra das manchas brutas do Plasma)
    const kernel = new THREE.MeshBasicMaterial({ color: '#080c18' });
    // as pontas ditas pelo modelo: duro, emissivo MIÚDO, facetado
    const flare = new THREE.MeshStandardMaterial({
      color: FLARE_LOOK.color,
      emissive: new THREE.Color(FLARE_LOOK.emissive),
      emissiveIntensity: FLARE_LOOK.emissiveIntensity,
      roughness: FLARE_LOOK.roughness,
      metalness: 0.12,
      flatShading: true,
    });
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
      // estrela-olho: miúda, mais clara que os nós (encara o alvo)
      if (p.m === 'white')
        return pick(`eye|${i % 2}`, () =>
          makeCoreMaterial({
            gold: '#cfe3fb',
            white: STAR_LOOK.white,
            cool: STAR_LOOK.cool,
            amp: 0.012,
            seed: 3.1 + (i % 2) * 2.7,
          }),
        );
      if (tag.includes('strand'))
        return pick(`arc|${tag}|${i % 3}`, () =>
          makeArcMaterial({
            gold: STRAND_LOOK.gold,
            white: STRAND_LOOK.white,
            cool: STRAND_LOOK.cool,
            coolAmt: STRAND_LOOK.coolAmt,
            jitter: STRAND_LOOK.jitter,
            dash: STRAND_LOOK.dash,
            flow: STRAND_LOOK.flow,
            seed: seed + (i % 3) * 4.1,
          }),
        );
      if (tag.includes('flare')) return flare;
      if (p.m === 'glow')
        return pick(`star|${p.tag === 'caged' ? 'caged' : String(i % 3)}`, () =>
          makeCoreMaterial({
            gold: STAR_LOOK.gold,
            white: STAR_LOOK.white,
            cool: STAR_LOOK.cool,
            amp: p.tag === 'caged' ? 0.016 : STAR_LOOK.amp,
            seed: seed + (i % 3) * 3.9,
          }),
        );
      if (p.m === 'veil')
        return pick(`steam|${i % 2}`, () =>
          makeSteamMaterial({
            cool: VEIL_LOOK.cool,
            warm: VEIL_LOOK.warm,
            hot: VEIL_LOOK.hot,
            amp: VEIL_LOOK.amp * (i % 2 === 0 ? 1 : 0.8),
            alpha: VEIL_LOOK.alpha,
            swirl: VEIL_LOOK.swirl,
            seed: seed + (i % 2) * 3.7,
            breath: 0.7,
          }),
        );
      if (p.m === 'accent')
        return pick(`moon|${p.tag === 'mask' ? 'face' : 'hard'}|${i % 2}`, () =>
          makeStoneMaterial({
            rockA: MOON_LOOK.rockA,
            rockB: MOON_LOOK.rockB,
            crack: MOON_LOOK.crack,
            amp: p.tag === 'mask' ? 0.008 : MOON_LOOK.amp, // a MÁSCARA é lisa: rosto
            crackGlow: MOON_LOOK.crackGlow, // face serrilhada = mancha no print
            crackScale: MOON_LOOK.crackScale,
            crackWidth: MOON_LOOK.crackWidth,
            crackBoost: MOON_LOOK.crackBoost,
            speck: MOON_LOOK.speck,
            seed: seed + (i % 2) * 2.9,
            breath: p.tag === 'disk' ? 0.3 : 0.55, // o disco do chão não respira
            teamColor: TEAM_TINT.neutral,
          }),
        );
      // casca de noite: o corpo fecha a cavidade; a ÂNCORA abre (a estrela
      // caída arde por dentro e vaza pela fenda irregular da rocha)
      const anchor = p.tag === 'plinth';
      return pick(
        `shell|${anchor ? 'anchor' : 'night'}|${p.m === 'dark' ? 'd' : 'b'}|${i % 2}`,
        () =>
          makeLightningShellMaterial({
            body: SHELL_LOOK.body,
            dark: SHELL_LOOK.dark,
            vein: SHELL_LOOK.vein,
            core: SHELL_LOOK.core,
            cool: SHELL_LOOK.cool,
            amp: p.tag === 'limb' || p.tag === 'arm.bracer' ? 0.018 : SHELL_LOOK.amp,
            coreCut: anchor ? SHELL_LOOK.anchorCut : SHELL_LOOK.coreCut,
            seed: seed + (i % 2) * 3.1,
            teamColor: TEAM_TINT.neutral,
          }),
        );
    });
    const shaders = [...cache.values()];
    for (const m of shaders) {
      // o tipo do traje manda nos uniforms (cascos que não têm uJitter/uBreath
      // não podem ser escritos pelo loop — a regra do try/catch sem exceção)
      const vs = m.vertexShader;
      m.userData.kind = vs.includes('uJitter')
        ? 'strand'
        : vs.includes('uSwirl')
          ? 'veil'
          : m.fragmentShader.includes('uCoreCut')
            ? 'shell'
            : 'star';
    }
    return { list, uniq: [...cache.values(), kernel, flare], shaders, flare, kernel };
  }, [visParts, seed, level]);

  // a ESTRELA do peito: o plasma do Raio/Plasma lido FRIO (azul-estrela com o
  // ouro do Plasma no fresnel). ICOSAEDRO SUB 2 (180 faces: redondo e denso) —
  // aqui a leitura é PLASMA FERVENDO segurado pelo soquete, não gema facetada
  // (a do Cristal era octaedro pontudo porque era PEDRA; esta é estrela)
  const core = useMemo(
    () => ({
      geo: new THREE.IcosahedronGeometry(0.26, 2),
      mat: makeCoreMaterial({
        gold: CORE_LOOK.gold, // = a cor do motor (identidade do peito ao FX)
        white: CORE_LOOK.white,
        cool: CORE_LOOK.cool,
        amp: CORE_LOOK.amp,
        seed: 5.9,
      }),
    }),
    [],
  );

  // PÓ DE ESTRELA que sobe do disco riscado no chão e é ENGOLIDO pelo peito (a
  // corrente entrando na figura). Ao alinhar o tiro a sucção acelera e o funil
  // APERTA: a constelação está bebendo o próprio campo.
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

  // casca/pedra/névoa/núcleo leem aSeed por peça; clonamos só as que os usam
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
      if (demoT.current > COSMICO_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const crumble = 1 - alpha; // morrendo: a loriga esfarela e as estrelas apagam

    // ---- uniforms: casca, lua, nuvem, plasma e corrente no MESMO loop ----
    const hum =
      Math.sin(t * 1.4 + seed) * 0.4 +
      Math.sin(t * 3.1 + seed * 0.7) * 0.3 +
      Math.sin(t * 0.55 + 2.1) * 0.3; // a tempestade da mãe respira devagar
    currents.current += (1 + pose.charge * 1.5 - currents.current) * Math.min(1, dt * 4);
    for (const m of partMats.shaders) {
      const kind = m.userData.kind as string;
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp?.value;
      if (baseAmp !== undefined) m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      if (m.uniforms.uHurt) m.uniforms.uHurt.value = hurt * 0.45;
      if (m.uniforms.uCharge)
        m.uniforms.uCharge.value = Math.min(1, pose.charge * (kind === 'strand' ? 1 : 0.75) + crumble * 0.5);
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = hum * (0.55 + 0.45 * hpFrac) + pose.flare * 0.35;
      if (m.uniforms.uAlpha) {
        if (m.userData.baseAlpha === undefined) m.userData.baseAlpha = m.uniforms.uAlpha.value;
        m.uniforms.uAlpha.value = (m.userData.baseAlpha as number) * Math.max(0, alpha);
      }
      // morrendo: a loriga esfarela; ferido: a casca quase não muda (a lição
      // do Cristal — uHurt alto com uAmp grande serrilha o figurino inteiro)
      if (baseAmp !== undefined && m.uniforms.uAmp)
        m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.1 + crumble * 2.2);
      // a CORRENTE: na afinação o zigue-zague agita e a corrente corre mais
      // rápido (os fios estão despejando no peito). JITTER SEMPRE ≤ RAIO DO
      // FIO: base 0,028 × ≤1,6 = 0,0448 < 0,05 (o fio mais fino do figurino)
      if (m.uniforms.uJitter) {
        if (m.userData.baseJitter === undefined) m.userData.baseJitter = m.uniforms.uJitter.value;
        m.uniforms.uJitter.value = (m.userData.baseJitter as number) * (1 + pose.charge * 0.6);
      }
      if (m.uniforms.uFlow) m.uniforms.uFlow.value = STRAND_LOOK.flow * currents.current;
      // a nuvem da mãe gira mais na descarga (a tempestade sentindo o tiro)
      if (m.uniforms.uSwirl) m.uniforms.uSwirl.value = VEIL_LOOK.swirl * (1 + pose.charge * 0.7);
    }
    // as pontas duras acendem com a carga (emissivo MIÚDO: 0,42 → 1,17 no pico)
    partMats.flare.emissiveIntensity =
      FLARE_LOOK.emissiveIntensity + pose.charge * 0.75 + crumble * 0.3;

    // a ESTRELA do peito: arde na afinação e APAGA quase junto no tiro (a luz
    // saiu pelas duas mãos — é o que vende o doubleShot saindo do peito)
    core.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uCharge.value = pose.charge;
    core.mat.uniforms.uAlpha.value = Math.max(0, alpha);
    const boil = 0.94 + 0.06 * Math.sin(t * 2.9 + seed) + pose.charge * 0.18;
    coreRef.current.scale.setScalar(Math.max(0.3, boil * (1 - crumble * 0.45)));
    // gira DEVAGAR: é redonda (a fervura do shader já é o movimento) — giro
    // rápido faria a estrela virar borrão no print
    coreRef.current.rotation.y = t * 0.35 + seed;
    coreRef.current.rotation.x = pose.lean * 0.25;
    const cglow = coreGlowRef.current;
    cglow.scale.setScalar(0.22 + pose.charge * 0.16); // halo MIÚDO (a lição do carimbo)
    (cglow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + 0.02 * Math.sin(t * 2.3 + seed) + pose.charge * 0.1) * alpha,
    );
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = alpha;
    motes.mat.uniforms.uCharge.value = pose.charge;

    // ---- corpo: plantado na própria tempestade (a constelação não anda) ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.32 + seed) * 0.016 + Math.sin(t * 0.85 + 1.4) * 0.007;
    const breathe = Math.sin(t * 0.65 + seed) * 0.009;
    g.scale.set(
      1 - pose.gather * 0.03 + breathe + crumble * 0.06,
      1 + pose.gather * 0.045 + breathe - crumble * 0.12,
      1 - pose.gather * 0.03 + breathe,
    );
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.26 + seed * 0.5) * 0.01 + crumble * 0.1; // morrendo: tomba
    g.rotation.x = pose.lean * 0.05;
    g.position.z = pose.stepZ;

    // ---- três corpos em movimento: halo de farpas na cabeça (0), cacos de
    // estrela raspando o disco do chão no sentido CONTRÁRIO (1) e três cometas
    // altos (2). A afinação aqui é VELOCIDADE, não tremor de arame ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.charge * 1.7);
    }

    // ---- braços: o BRAÇO INTEIRO (fio + nó do cotovelo + caneleira + pulso +
    // estrela da mão + oito pontas) gira no PIVÔ DO OMBRO ----
    const [pvX, pvY, pvZ] = COSMICO_ARM_PIVOT;
    const armX = -pose.swing * 0.5; // recua ao alinhar, varre para frente no tiro
    for (const a of actors.arms) {
      const mesh = partRefs.current[a.i];
      if (!mesh) continue;
      const part = visParts[a.i];
      const base = part.r ?? [0, 0, 0];
      tmpEuler.set(armX, 0, a.side * (pose.twist * 0.14 + pose.flare * 0.05));
      tmpQ.setFromEuler(tmpEuler);
      tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2]));
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2);
      tmpWorld
        .set(part.p[0] - pvX * a.side, part.p[1] - pvY, part.p[2] - pvZ)
        .applyQuaternion(tmpQ);
      mesh.position.set(pvX * a.side + tmpWorld.x, pvY + tmpWorld.y, pvZ + tmpWorld.z);
      const k = 1 + pose.charge * 0.12;
      const bs = part.s ?? [1, 1, 1];
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- a coroa em W: uma ÚNICA rotação rígida no pivô da coroa (mesmo ângulo
    // para todas as peças é o que mantém os três fios colados nas cinco
    // estrelas) + a coroa ERGUIE e brilha = o alvo mais distante travado ----
    const [cx, cy, cz] = COSMICO_CROWN_PIVOT;
    const crownAng = 0.13 * pose.flare + Math.sin(t * 0.7 + seed) * (0.02 + pose.flare * 0.01);
    const crownLift = 0.12 * pose.flare;
    tmpQ.setFromAxisAngle(tmpAxis, crownAng);
    for (const i of actors.crown) {
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const part = visParts[i];
      const base = part.r ?? [0, 0, 0];
      mesh.quaternion.copy(tmpQ).multiply(tmpQ2.setFromEuler(tmpEuler.set(base[0], base[1], base[2])));
      tmpWorld.set(part.p[0] - cx, part.p[1] - cy, part.p[2] - cz).applyQuaternion(tmpQ);
      mesh.position.set(cx + tmpWorld.x, cy + tmpWorld.y + crownLift, cz + tmpWorld.z);
      const bs = part.s ?? [1, 1, 1];
      const k = 1 + pose.flare * 0.1;
      mesh.scale.set(bs[0] * k, bs[1] * k, bs[2] * k);
    }

    // ---- peças: garras/ombreiras apontam, as oito pontas eriçam, os nós
    // pulsam, farpas orbitais giram no próprio eixo (braços e coroa já foram) ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh || part.tag?.startsWith('arm') || part.tag?.startsWith('crown')) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const spike = actors.spikes.find((x) => x.i === i);
      if (spike) {
        const shimmer = Math.sin(t * (1.2 + (i % 3) * 0.3) + i * 1.9) * 0.03;
        mesh.rotation.set(base[0], base[1], base[2] + spike.side * (shimmer + pose.flare * 0.16));
        sc *= 1 + pose.flare * 0.06;
      } else if (part.tag?.includes('flare')) {
        // as oito pontas de cada estrela crescem na afinação (a estrela irradia)
        sc *= 1 + pose.charge * 0.16 + Math.sin(t * (7.5 + (i % 5) * 1.9) + i * 1.3) * 0.02 * pose.charge;
      } else if (part.tag?.includes('node') || part.tag === 'caged') {
        // nós: a fervura é do shader; aqui só o tamanho respira com a carga
        sc *= 1 + pose.charge * 0.08;
      } else if (part.tag === 'dart') {
        sc *= 1 + pose.charge * 0.09;
        mesh.rotation.y += dt * 0.6;
      }

      if (part.flick) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 2.1 + seed));
      }
      if (sc !== 1) {
        // escala NÃO uniforme preservada: as farpas orbitais são alongadas de
        // propósito (setScalar numa peça com `s` virava bolinha pulsando)
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
            // só a pedra da lua e as placas de DOZE FACES da loriga projetam
            // sombra: plasma, fio de corrente e nuvem são translúcidos e
            // viravam bloco preto no piso (a lição do funil da Névoa)
            castShadow={
              part.m === 'body' || part.m === 'dark' || (part.m === 'accent' && !part.tag?.includes('dart'))
            }
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
      {/* a ESTRELA do peito: DO FORA da loriga, encaixada no soquete de lua
          segurado por quatro garras (a lição do Cristal: luz enterrada no
          invólucro não lê). Redonda e fervendo — é plasma, não gema */}
      <mesh ref={coreRef} geometry={core.geo} material={core.mat} position={COSMICO_CORE_POS} />
      <points geometry={motes.geo} material={motes.mat} frustumCulled={false} />
      <sprite
        ref={coreGlowRef}
        position={[COSMICO_CORE_POS[0], COSMICO_CORE_POS[1] + 0.08, COSMICO_CORE_POS[2] + 0.16]}
        scale={0.24}
      >
        <spriteMaterial
          map={circleTexture()}
          color={COSMICO_STARLIGHT}
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
 * Pó de estrela que SOBE do disco riscado no chão do slot e é engolido pelo
 * peito da constelação (a corrente entrando na figura): sobe em espiral que
 * APERTA (o funil invertido da Areia: largo no chão, apertado na figura),
 * tremula como lasca miúda e esquenta do azul-estrela (no chão) para o ouro do
 * Plasma (chegando ao peito). uCharge acelera a sucção ao alinhar o tiro.
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
  float speed = 0.55 + 0.5 * aRand.z;
  float prog = fract(uTime * speed * 0.14 * (1.0 + uCharge * 1.4) + aRand.y);
  // funil INVERTIDO: largo no disco do chão, apertado no peito da figura
  float ang = aRand.x * 6.28318 + prog * (1.4 + 2.6 * aRand.z) + uTime * 0.22;
  float r = 1.45 - prog * (0.9 + 0.5 * aRand.z);
  float y = 0.08 + prog * (2.5 + 0.4 * aRand.z);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // lasca miúda e DURA (caco de estrela, não o fiapo macio do vapor) e MIÚDA
  // demais para virar confete (o print da terceira passada: pontos grandes e
  // acesos demais liam papel picado — pó estelar é quase apagado)
  float size = (2.0 + 3.2 * aRand.z) * (0.85 + uCharge * 0.55) * uSizeMul * (1.0 - prog * 0.35);
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  // nasce no disco e morre engolido pelo peito
  vA = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.6, 1.0, prog)) * uAlpha;
  // esquentando: azul-estrela no chão -> ouro do Plasma no peito
  vC = mix(vec3(0.60, 0.81, 1.0), vec3(1.0, 0.91, 0.66), prog * prog);
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // pontinho duro com halo minimo (caco de luz, nao puff)
  float m = smoothstep(0.5, 0.22, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.4);
}
`;
