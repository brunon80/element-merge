import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeSteamMaterial } from '../scene/steamShaders';
import { makeIceMaterial } from '../scene/iceShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  NEVOA_FROST,
  CLOUD_LOOK,
  MASK_LOOK,
  ICE_LOOK,
  NEVOA_ATTACK_WINDOW,
  NEVOA_WINDUP,
  attackPose,
} from '../scene/NevoaRig';
import { FOG_PLUME_LOOK, FROST_NUB_CRACK } from '../scene/ProjectileField';
import { PANTANO_ATTACK_WINDOW } from '../scene/PantanoRig';
import { VAPOR_ATTACK_WINDOW } from '../scene/VaporRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig da NÉVOA (Nv.7 — água+ar+fogo: o ESPECTRO DA BRUMA), o caçador de linha
 * de frente plantado numa poça de geada. As regras amarradas aqui:
 *  - a GEADA #cfe6ee é ÚNICA entre motor, veios do gelo/coroa, pluma do bafo e
 *    FX (identidade da névoa; a semente do projétil usa a variação miúda
 *    #d2e9f4 só para a sonda do laço de QA achar a peça em voo);
 *  - silhueta de ESPECTRO de túnica larga (cinco cascas de lathe 26–48 radiais
 *    + aro da barra): o funil fino POR DEMAIS virou "casquinha de sorvete" no
 *    print, e uma casca só de frente lia como "gelatina de vidro";
 *  - nuvem SEM tinta de equipe, alfa no teto do shader (0,94) e o fiapo vem do
 *    DESLOCAMENTO, não de buraco no alfa (a lição da poça suja de cinza: o
 *    smokePool é grafite-fuligem e a Névoa não o usa — frio não suja, só geada);
 *  - rosto de SLATE MÉDIO com olhos FENDADOS miúdos (breu puro virava cartucho,
 *    googly mataria o frio) aparafusado NA FRENTE do capuz (a regra da face);
 *  - anti low-poly: casca maior da túnica 36 anéis × 48 radiais (1813 vértices
 *    reais), aro 14×40, poça ico sub 2;
 *  - plantada: sem floatY — a poça de geada ancora o espectro no slot e o aro
 *    da barra é PLANO (o torus em pé afundava 1,08 sob o tabuleiro);
 *  - coreografia de ASPIRAÇÃO E BAFO: a janela fica entre a do Vapor e a do
 *    Pântano (o espectro respira fundo antes de soltar o ar — não é gatilhão).
 */

const NEVOA = getSpecies('nevoa');
const LV = 7 as MonsterLevel;

/** luminância (Rec. 709) — a régua do "isso é GELO ou é FUMIÇA?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const hexDelta = (a: string, b: string) => {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return Math.max(Math.abs(ca.r - cb.r), Math.abs(ca.g - cb.g), Math.abs(ca.b - cb.b));
};

describe('Névoa: espectro da bruma plantado na geada (Nv.7)', () => {
  test('a Névoa tem rig próprio e forma ÚNICA de espectro (Nv.7 fixo)', () => {
    expect(SPECIES_RIGS.nevoa).toBeTruthy();
    expect(NEVOA.levelMin).toBe(7);
    expect(NEVOA.levelMax).toBe(7);
    expect(hasLevelVariants(MODELS.nevoa)).toBe(false);
    expect(partsForLevel(MODELS.nevoa, 7).length).toBe(MODELS.nevoa.parts.length);
    // orçamento denso (a régua anti low-poly da árvore: golem 47, plasma 36+,
    // névoa 36 — aqui a densidade mora nos VÉRTICES das cascas de lathe)
    expect(MODELS.nevoa.parts.length).toBeGreaterThanOrEqual(34);
    // PLANTADA: a poça de geada é a base (nada de espectro boiando no slot)
    expect(MODELS.nevoa.floatY).toBe(0);
    expect(NEVOA.base.moveSpeed).toBe(0);
    // as gotas congeladas em órbita existem (grupo 0 gira devagar)
    expect(MODELS.nevoa.groups?.[0]).toBeTruthy();
    expect(partsForLevel(MODELS.nevoa, 7).filter((p) => p.group === 0).length).toBeGreaterThanOrEqual(3);
  });

  test('silhueta: POÇA de gelo + TÚNICA larga de cinco cascas + aro plano da barra', () => {
    const parts = partsForLevel(MODELS.nevoa, 7);
    // a poça de geada: ico achatado denso + anel de halo rente ao chão (nunca
    // placa espelhada — peça de chão tem envMix/sparkle cortados no rig)
    const pool = parts.filter((p) => p.p[1] < 0.25 && p.m === 'accent');
    expect(pool.length).toBe(2);
    const ico = pool.find((p) => p.g === 'ico')!;
    expect(ico.a[1]).toBeGreaterThanOrEqual(2); // sub 2: relevo de gelo, não prisma
    expect(ico.s![1]).toBeLessThanOrEqual(0.2); // achatada: é poça, não bola
    const halo = pool.find((p) => p.g === 'ring')!;
    expect(Math.abs(halo.r?.[0] ?? 0)).toBeGreaterThan(1.5); // deitada no chão
    expect(halo.a[0]).toBeGreaterThanOrEqual(0.4); // fura no meio: é anel, não disco
    expect(halo.p[1]).toBeLessThanOrEqual(0.05);
    // TÚNICA: cinco cascas de revolução + o aro da barra rasgada. A de fora é
    // a mais larga e a mais alta (a barra desfia em amp alto, não em alfa)
    const robe = parts.filter((p) => p.m === 'robe');
    const shells = robe.filter((p) => p.g === 'vortex');
    expect(shells.length).toBeGreaterThanOrEqual(5);
    const outer = shells.reduce((a, b) => (a.a[1] >= b.a[1] ? a : b));
    expect(outer.a[1]).toBeGreaterThanOrEqual(1.3); // LARGA (a regra anti casquinha)
    expect(outer.a[2]).toBeGreaterThanOrEqual(3.4); // comprida: ombro → poça
    expect(outer.a[0]).toBeLessThanOrEqual(0.1); // fecha no pescoço em fiapo fino
    expect(outer.amp ?? 0).toBeGreaterThanOrEqual(0.1); // o desfie vem do vértice
    // as cascas de dentro somam o volume (de frente há uma superfície só por
    // casca: uma só lia como taça de vidro e dava pra ver o miolo oco)
    expect(shells.length).toBeGreaterThanOrEqual(4);
    for (const s of shells.filter((s) => s !== outer)) expect(s.a[1]).toBeLessThanOrEqual(outer.a[1]);
    // o aro da barra: torus GROSSO e PLANO (sem o X de -1,57 ele fica de pé no
    // plano XY e metade dele afunda 1,08 sob o tabuleiro)
    const hem = robe.find((p) => p.g === 'torus')!;
    expect(Math.abs(hem.r?.[0] ?? 0)).toBeGreaterThan(1.5);
    expect(hem.p[1]).toBeLessThanOrEqual(0.2);
    // manto de nuvem em camadas (corpo largo, não bola de Mickey) + capuz
    const mist = parts.filter((p) => p.m === 'steam');
    expect(mist.length).toBeGreaterThanOrEqual(6);
    const body = mist.filter((p) => p.g === 'sphere');
    for (const b of body) {
      expect(b.a[1]).toBeGreaterThanOrEqual(20); // casca densa: nuvem lisa
      expect(b.a[2]).toBeGreaterThanOrEqual(16);
    }
    const torso = body
      .filter((p) => p.p[1] < 3.2)
      .reduce((a, b) => (a.a[0] * (a.s?.[0] ?? 1) >= b.a[0] * (b.s?.[0] ?? 1) ? a : b));
    expect(torso.a[0] * (torso.s?.[0] ?? 1)).toBeGreaterThanOrEqual(0.9); // OMBRO largo
    // capuz de casca FINA: a máscara tem que SAIR do véu (a regra da face)
    const hood = body.find((p) => p.p[1] > 3.2)!;
    expect(hood.a[0]).toBeLessThanOrEqual(0.42);
    // máscara aparafusada NA FRENTE do capuz, slate e nunca 'dark' de sombra
    const mask = parts.find((p) => p.m === 'dark')!;
    expect(mask.p[2]).toBeGreaterThan(0.3);
    expect(mask.p[2]).toBeGreaterThan(hood.p[2] + hood.a[0] * (hood.s?.[2] ?? 1) * 0.5);
    expect(mask.g).toBe('octa');
    expect(mask.a[1]).toBeGreaterThanOrEqual(1); // facetada densa (nada de prisma)
    // olhos FENDADOS miúdos (googly = cartucho de sorvete): fenda HORIZONTAL
    const eyes = parts.filter((p) => p.m === 'white');
    expect(eyes.length).toBe(2);
    for (const e of eyes) {
      expect(e.a[0]).toBeLessThanOrEqual(0.07); // miúdo: o frio encara, não é fofo
      expect(e.s![1]).toBeLessThan(e.s![0] * 0.7); // mais larga que alta = fenda
      expect(e.p[2]).toBeGreaterThan(mask.p[2]); // sai da superfície da máscara
    }
    expect(Math.abs(eyes[0].p[0] + eyes[1].p[0])).toBeLessThanOrEqual(0.01); // espelhados
    // o kernel glacial no centro da fenda (claro sobre escuro: a régua do contraste)
    expect(parts.filter((p) => p.m === 'glow').length).toBe(2);
    // coroa de icicles PLANTADA no capuz (pino enterrado na nuvem não é coroa:
    // a base afunda no véu e a ponta sai por cima)
    const spikes = parts.filter((p) => p.tag === 'spike');
    expect(spikes.length).toBeGreaterThanOrEqual(5);
    const hoodTop = hood.p[1] + hood.a[0] * (hood.s?.[1] ?? 1);
    for (const s of spikes) {
      expect(s.m).toBe('accent');
      const base = s.p[1] - s.a[1] / 2;
      expect(base).toBeGreaterThan(hood.p[1] - 0.1); // não nasce do peito
      expect(base).toBeLessThan(hoodTop); // afunda no véu do capuz
    }
    const apex = Math.max(...spikes.map((s) => s.p[1] + s.a[1] / 2));
    expect(apex).toBeGreaterThanOrEqual(hoodTop + 0.4); // a coroa coroa
    // ombreiras de gelo CLARO (dark vitrificado virava disco preto nos ombros)
    const pauldrons = parts.filter(
      (p) => p.tag === undefined && p.group === undefined && p.m === 'accent' && p.p[1] > 2.9 && Math.abs(p.p[0]) > 0.7,
    );
    expect(pauldrons.length).toBe(2);
    for (const pd of pauldrons) {
      expect(pd.g).toBe('octa');
      expect(pd.a[1]).toBeGreaterThanOrEqual(1); // facetada densa
      expect(pd.s?.[1] ?? 1).toBeLessThan(pd.s?.[0] ?? 1); // CHATA: lasca, não bola
    }
    // o ÚNICO escuro da espécie é a MÁSCARA (gelo vitrificado escuro nos ombros
    // virava disco preto que engolia a silhueta clara do espectro)
    expect(parts.filter((p) => p.m === 'dark').length).toBe(1);
    // garras de bruma: funil de véu RASO + lasca de gelo no punho (tag arm)
    const arms = parts.filter((p) => p.tag === 'arm');
    expect(arms.length).toBe(4);
    expect(arms.filter((p) => p.g === 'vortex').length).toBe(2);
    expect(arms.filter((p) => p.g === 'octa').length).toBe(2);
    expect(arms.some((p) => p.m === 'armveil')).toBe(true);
  });

  test('ANTI LOW-POLY: casca da túnica 36×48 (1813 vértices), aro 14×40, poça sub 2', () => {
    const robe = partsForLevel(MODELS.nevoa, 7).filter((p) => p.m === 'robe');
    for (const p of robe) {
      if (p.g === 'vortex') {
        expect(p.a[3]).toBeGreaterThanOrEqual(26); // anéis do perfil
        expect(p.a[4]).toBeGreaterThanOrEqual(32); // radiais da revolução
      }
      if (p.g === 'torus') {
        expect(p.a[2]).toBeGreaterThanOrEqual(12); // seção do tubo
        expect(p.a[3]).toBeGreaterThanOrEqual(40); // radiais do aro
      }
    }
    for (const p of partsForLevel(MODELS.nevoa, 7)) {
      if (p.g === 'octa' || p.g === 'ico') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      if (p.g === 'cone') expect(p.a[2]).toBeGreaterThanOrEqual(6); // icicles miúdos
      if (p.g === 'ring') expect(p.a[2]).toBeGreaterThanOrEqual(40);
      if (p.tag === 'arm' && p.g === 'vortex') expect(p.a[3]).toBeGreaterThanOrEqual(18);
    }
    // contagens REAIS da malha (a regra da árvore: casca de lathe é o corpo do
    // espectro — em baixa resolução a túnica seria um cone de papelão)
    const outer = robe.filter((p) => p.g === 'vortex').reduce((a, b) => (a.a[1] >= b.a[1] ? a : b));
    expect(getGeometry('vortex', outer.a).getAttribute('position').count).toBeGreaterThanOrEqual(1700);
    const hem = robe.find((p) => p.g === 'torus')!;
    expect(getGeometry('torus', hem.a).getAttribute('position').count).toBeGreaterThanOrEqual(500);
    expect(getGeometry('ring', [0.55, 1.25, 48]).getAttribute('position').count).toBeGreaterThanOrEqual(95);
    expect(getGeometry('ico', [1.0, 2]).getAttribute('position').count).toBeGreaterThanOrEqual(500);
    expect(getGeometry('drop', [0.52, 0.95, 20, 18]).getAttribute('position').count).toBeGreaterThanOrEqual(350);
    expect(getGeometry('sphere', [0.72, 24, 18]).getAttribute('position').count).toBeGreaterThanOrEqual(400);
    // a semente de geada do projétil também é densa (octa detail 1)
    expect(getGeometry('octa', [0.2, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(90);
  });

  test('invólucro: a barra larga ancora no chão e a coroa respeita o formTop', () => {
    const e = partsEnvelope(partsForLevel(MODELS.nevoa, 7));
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // a túnica LARGA é o que faz o espectro ler como espectro (a casquinha de
    // sorvete tinha meio metro de barra)
    expect(halfX).toBeGreaterThanOrEqual(1.3);
    expect(halfZ).toBeGreaterThanOrEqual(1.3);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantada: o aro plano + a poça achatada não afundam no tabuleiro (o torus
    // em pé afundava 1,08 — este pino é a vigilância daquele bug)
    expect(e.minY).toBeGreaterThanOrEqual(-0.1);
    expect(e.minY).toBeLessThan(0); // mas a poça encosta (o relevo da geada)
    expect(e.maxY).toBeLessThanOrEqual(formTop(NEVOA, 7) + 0.25); // formTop 4,4
    expect(e.maxY).toBeGreaterThanOrEqual(4.0); // a coroa aproveita a altura
  });

  test('nuvem: SEM tinta de equipe, alfa no teto do shader e o fiapo vem do vértice', () => {
    const steam = makeSteamMaterial({
      cool: CLOUD_LOOK.robe.cool,
      warm: CLOUD_LOOK.robe.warm,
      hot: CLOUD_LOOK.robe.hot,
      amp: 0.11,
      alpha: CLOUD_LOOK.robe.alpha,
      swirl: CLOUD_LOOK.robe.swirl,
    });
    expect(steam.blending).toBe(THREE.NormalBlending);
    expect(steam.depthWrite).toBe(false);
    // amarração estrutural: nuvem NUNCA aceita tinta da equipe (o steamShaders
    // nem tem uniform de tint — se um dia entrarem na família que tem, acorda)
    expect(steam.uniforms.uTeamColor).toBeUndefined();
    // alfa no TETO (o clamp do frag é 0,94): o den do ruído ~0,65 come o resto,
    // então alfa raso lia como "gelatina de vidro" no print
    expect(CLOUD_LOOK.robe.alpha).toBeLessThanOrEqual(0.94);
    expect(CLOUD_LOOK.robe.alpha).toBeGreaterThanOrEqual(0.9);
    // a túnica é a peça MAIS opaque da espécie (o corpo), o véu da garma é o
    // mais raso (casca oca vista de lado DOBRA o caminho óptico e fechava em
    // tinta preta) e a poça/halo são mais finos que o manto
    const alphas = Object.values(CLOUD_LOOK).map((c) => c.alpha);
    expect(CLOUD_LOOK.robe.alpha).toBe(Math.max(...alphas));
    expect(CLOUD_LOOK.armveil.alpha).toBeLessThanOrEqual(0.5);
    expect(CLOUD_LOOK.trans.alpha).toBeLessThan(CLOUD_LOOK.steam.alpha);
    // blowout contido: o uHot é a GEADA pálida, nunca #ffffff (o mix do frag
    // acontece antes da luz ×2,4 e as cascas empilham)
    for (const c of Object.values(CLOUD_LOOK)) {
      expect(c.hot.toLowerCase()).not.toBe('#ffffff');
      expect(luma(c.hot)).toBeLessThan(0.95);
      expect(luma(c.cool)).toBeGreaterThan(0.75); // nuvem FRIA é clara
      expect(luma(c.cool)).toBeGreaterThan(luma(c.warm)); // gradiente invertido: embaixo mora a geada
    }
    steam.dispose();
  });

  test('geada ÚNICA: motor = veios do gelo = pluma do bafo = coroa (identidade)', () => {
    expect(NEVOA_FROST).toBe('#cfe6ee');
    expect(NEVOA.base.projectileColor).toBe(NEVOA_FROST);
    expect(VISUALS.nevoa.glow).toBe(NEVOA_FROST);
    expect(MASK_LOOK.crack).toBe(NEVOA_FROST);
    expect(ICE_LOOK.crack).toBe(NEVOA_FROST);
    for (const c of Object.values(CLOUD_LOOK)) expect(c.hot).toBe(NEVOA_FROST);
    expect(FOG_PLUME_LOOK.hot).toBe(NEVOA_FROST);
    // a semente usa a VARIAÇÃO MIÚDA (#d2e9f4): é o que deixa a sonda do laço
    // de QA (qa/probe-nevoa.mjs) achar a peça em voo — mas é a MESMA geada
    expect(FROST_NUB_CRACK).not.toBe(NEVOA_FROST);
    // THREE.Color work em espaço LINEAR (o hex é convertido de sRGB), então a
    // diferença de 6/255 no azul vira ~0,05 aqui: ainda é a MESMA geada
    expect(hexDelta(FROST_NUB_CRACK, NEVOA_FROST)).toBeLessThanOrEqual(0.06);
    // figurino: o corpo do espectro é CLARO (geada), não breu — a paleta da
    // névoa é o contrário da da Obsidiana
    expect(luma(VISUALS.nevoa.body)).toBeGreaterThan(0.6);
  });

  test('gelo: máscara SLATE (nunca cartucho), face opaca sem espelho, icicle claro', () => {
    const mask = makeIceMaterial(MASK_LOOK);
    expect(mask.blending).toBe(THREE.NormalBlending);
    // o gelo tem depthWrite LIGADO (translucidez física da receita), ao
    // contrário da nuvem — é isso que impede a casca de trás de vazar pela poça
    expect(mask.depthWrite).toBe(true);
    mask.dispose();
    // slate MÉDIO: breu absoluto virava cartucho de bala; o rosto lê pela
    // trama de trincas + specular, não pelo preto puro
    expect(luma(MASK_LOOK.iceA)).toBeGreaterThan(0.1);
    expect(luma(MASK_LOOK.iceA)).toBeLessThan(0.5);
    expect(luma(MASK_LOOK.iceA)).toBeLessThan(luma(ICE_LOOK.iceA)); // a máscara ESCURECE contra o gelo claro dos icicles
    // FACE opaca: reflexo contido (0,4 vitrificava a máscara e ela virava
    // espelho da arena no macro)
    expect(MASK_LOOK.envMix).toBeLessThanOrEqual(0.25);
    // gelo claro dos icicles: quase branco e trincas curtas (traço fino gelado)
    expect(ICE_LOOK.crackScale).toBeGreaterThanOrEqual(2);
    expect(ICE_LOOK.crackWidth).toBeLessThanOrEqual(0.06);
    expect(ICE_LOOK.crackGlow).toBeLessThanOrEqual(1.3); // brilho de gelo, não solda
    expect(ICE_LOOK.envMix).toBeLessThanOrEqual(0.6);
    expect(ICE_LOOK.sparkle).toBeLessThanOrEqual(1.4);
    const ice = makeIceMaterial(ICE_LOOK);
    expect(ice.uniforms.uIceA.value.getHexString()).toBe('d7e6f2');
    ice.dispose();
  });

  test('coreografia de ASPIRAÇÃO E BAFO: janela entre o Vapor e o Pântano', () => {
    // o espectro RESPIRA fundo antes de soltar o ar: é mais lento que o Vapor
    // (que ferve sozinho) e mais rápido que o Pântano (que arremessa lodo)
    expect(NEVOA_ATTACK_WINDOW).toBeGreaterThan(VAPOR_ATTACK_WINDOW);
    expect(NEVOA_ATTACK_WINDOW).toBeLessThan(PANTANO_ATTACK_WINDOW);
    expect(NEVOA_WINDUP).toBeLessThan(0.5); // quase metade é o bafo saindo

    const idle = attackPose(-1);
    expect([idle.twist, idle.gather, idle.swing, idle.charge, idle.lift, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const breath = attackPose(NEVOA_ATTACK_WINDOW * NEVOA_WINDUP * 0.95);
    expect(breath.charge).toBeGreaterThan(0.9); // o coração acende na aspiração
    expect(breath.gather).toBeLessThan(-0.8); // o manto CONTRAI sugando o ar
    expect(breath.swing).toBeLessThan(-0.7); // as garras RECUEM
    expect(breath.lift).toBeGreaterThan(0.9); // o espectro SE ERGUE com o fôlego
    expect(breath.flare).toBeGreaterThan(0.5); // coroa e ombreiras eriçam
    expect(breath.stepZ).toBeLessThan(0); // recua antes de soprar
    const blow = attackPose(NEVOA_ATTACK_WINDOW * (NEVOA_WINDUP + 0.3 * (1 - NEVOA_WINDUP)));
    expect(blow.gather).toBeGreaterThan(1.0); // a nuvem ESTUFA no bafo
    expect(blow.swing).toBeGreaterThan(1.0); // as garras VARREM para frente
    expect(blow.stepZ).toBeGreaterThan(0.2); // o corpo empurra o ar para fora
    expect(blow.flare).toBeGreaterThan(1.0); // a coroa arreganha no sopro
    expect(blow.lift).toBeLessThan(breath.lift); // ele desce de volta ao soltar
    const late = attackPose(NEVOA_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // o frio assenta depois do tiro
    expect(late.gather).toBeLessThan(blow.gather); // a nuvem volta a descansar
    const out = attackPose(NEVOA_ATTACK_WINDOW + 0.2);
    expect([out.gather, out.swing, out.charge, out.lift, out.stepZ, out.flare]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('motor: o bafo chega voando e POUSA no alvo em geada (splash + slow)', () => {
    expect(NEVOA.base.damageElement).toBe('water');
    expect(NEVOA.base.targeting).toBe('backmost'); // o espectro caça quem se esconde
    expect(NEVOA.base.projectileSpeed).toBeGreaterThanOrEqual(8); // bruma CAMINHA (não é feixe)
    expect(NEVOA.base.interval).toBeGreaterThanOrEqual(1.2); // o fôlego demora a encher
    const ab = NEVOA.base.abilities;
    const splash = ab.find((a) => a.kind === 'splash');
    expect(splash && 'radius' in splash && splash.radius).toBeGreaterThanOrEqual(2.2);
    const slow = ab.find((a) => a.kind === 'slow');
    expect(slow && 'slowFactor' in slow && slow.slowFactor).toBeLessThanOrEqual(0.6);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 70007 });
    const st = eng.addRetainedUnit('nevoa', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    eng.startBattle();
    // varre o voo em passos miúdos (a pluma é LENTA: 9 un/s, o print de 0,25 s
    // atravessava o voo inteiro sem ver a pluma)
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 40; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles) if (p.species === 'nevoa') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(7);
      expect(p.damageElement).toBe('water');
      expect(p.abilities.some((a) => a.kind === 'splash')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'slow')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'nevoa');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(7);
      expect(f.pos2).toBeDefined(); // o rastro do bafo chegando no alvo (o splash 2,4 no FX)
    }
  });
});
