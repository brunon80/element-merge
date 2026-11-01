import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeIceMaterial } from '../scene/iceShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  OBS_ROLE_LOOK,
  OBS_CORE_LOOK,
  OBS_GROUND,
  OBSIDIANA_ATTACK_WINDOW,
  OBSIDIANA_WINDUP,
  attackPose,
} from '../scene/ObsidianaRig';
import { ICE_ATTACK_WINDOW } from '../scene/IceRig';
import { TEMPESTADE_ATTACK_WINDOW } from '../scene/TempestadeRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig da OBSIDIANA (Nv.7 — a FORTALEZA DE VIDRO NEGRO), o tanque plantado da
 * árvore: zigurate de três platôs que cria raiz no tabuleiro, torso maciço de
 * vidro grosso, ombreiras-lasca que ela ergue e varre no arremesso pesado,
 * chifrão de coroa, olhos-rasgo na seteira, brasa violeta ENCAPSULADA nas
 * costuras e anel de vidro no chão. O vidro é o MESMO cristal do Gelo (nada de
 * shader novo), lido na paleta preta/violeta. As regras amarradas aqui:
 *  - VIDRO NEGRO SE LÊ POR SPECULAR/REFLEXO/BRASA, nunca por albedo (iceA
 *    claro × luz da arena = fortaleza LAVANDA — a lição do print);
 *  - peça rente ao chão NUNCA é espelho (placa chata refletindo a arena virava
 *    lâmina violeta acesa) e o anel do halo não leva tint da equipe;
 *  - blowout cortado (o branco do plasma nunca é #ffffff) e nada aditivo no
 *    vidro/plasma — o peso da fortaleza é FÍSICO;
 *  - a paleta violeta (#8f5cff) é ÚNICA entre motor, rig, projétil e FX;
 *  - anti low-poly: poliedro deslocado é subdividido, anel com 48 radiais.
 */

const OBSIDIANA = getSpecies('obsidiana');
const LV = 7 as MonsterLevel;
const OBS_VIOLET = '#8f5cff';

/** luminância (Rec. 709) — a régua do "isso é BREU ou é LAVANDA?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('Obsidiana: fortaleza de vidro negro plantada (Nv.7)', () => {
  test('a Obsidiana tem rig próprio e forma ÚNICA de fortaleza (Nv.7 fixo)', () => {
    expect(SPECIES_RIGS.obsidiana).toBeTruthy();
    expect(OBSIDIANA.levelMin).toBe(7);
    expect(OBSIDIANA.levelMax).toBe(7);
    expect(hasLevelVariants(MODELS.obsidiana)).toBe(false);
    // espécie da árvore: uma forma só, montada inteira no Nv. da espécie
    expect(partsForLevel(MODELS.obsidiana, 7).length).toBe(MODELS.obsidiana.parts.length);
    expect(MODELS.obsidiana.parts.length).toBeGreaterThanOrEqual(26);
  });

  test('silhueta: ZIGURATE de três platôs que afunilam + torso maciço de vidro', () => {
    const parts = partsForLevel(MODELS.obsidiana, 7);
    // a fortaleza é LARGA e plantada (o tanque que não anda, moveSpeed 0)
    const e = partsEnvelope(parts);
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThanOrEqual(1.55);
    expect(OBSIDIANA.base.moveSpeed).toBe(0);
    // três platôs EMPILHADOS, cada um mais NARROW que o de baixo (zigurate)
    const terraces = parts.filter(
      (p) =>
        (p.g === 'octa' || p.g === 'dodeca') &&
        Math.abs(p.p[0]) < 0.05 &&
        p.p[1] < 1.7 &&
        (p.s?.[1] ?? 1) <= 0.6,
    );
    expect(terraces.length).toBe(3);
    const sorted = [...terraces].sort((a, b) => a.p[1] - b.p[1]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].p[1]).toBeGreaterThan(sorted[i - 1].p[1]);
      expect(sorted[i].s?.[0] ?? 1).toBeLessThan(sorted[i - 1].s?.[0] ?? 1);
    }
    // torso maciço: o poliedro MAIS GROSSO do modelo, no lugar do "peito"
    const torso = parts.find((p) => p.g === 'dodeca' && p.a[0] >= 0.8 && p.p[1] > 2 && p.p[1] < 2.6)!;
    expect(torso.a[1]).toBeGreaterThanOrEqual(2);
    expect(torso.m).toBe('body');
    // barbatanas-muralha nas laterais (as asas da fortaleza, altas e finas)
    const fins = parts.filter(
      (p) => Math.abs(p.p[0]) >= 1.15 && p.p[1] > 1.5 && p.p[1] < 2 && (p.s?.[1] ?? 1) >= 1.5,
    );
    expect(fins.length).toBe(2);
  });

  test('detalhes legíveis: ombreiras-lasca, chifrão, OLHOS-RASGO na superfície, anel no chão', () => {
    const parts = partsForLevel(MODELS.obsidiana, 7);
    // ombreiras de lasca GROSSA (tag arm — o rig as recua/ergue e varre no
    // arremesso): em X elas atravessam o torso e são CHATAS (lascas de vidro
    // não são ombreiras redondas de boneca)
    const pauldrons = parts.filter((p) => p.tag === 'arm');
    expect(pauldrons.length).toBeGreaterThanOrEqual(2);
    for (const p of pauldrons) {
      expect(Math.abs(p.p[0])).toBeGreaterThanOrEqual(0.9);
      expect(p.p[1]).toBeGreaterThan(2.4);
      expect((p.s?.[1] ?? 1) / (p.s?.[0] ?? 1)).toBeLessThanOrEqual(0.35);
    }
    // coroa: o chifrão central sobe na crista (aproveita o formTop 4,3)
    const horn = parts.find((p) => p.g === 'octa' && Math.abs(p.p[0]) < 0.05 && p.p[1] > 3)!;
    expect(horn.s?.[1] ?? 1).toBeGreaterThanOrEqual(2);
    expect(parts.filter((p) => p.g === 'octa' && Math.abs(p.p[0]) > 0.2 && p.p[1] > 2.7).length).toBe(2);
    // olhos RASGO (a fortaleza encara estreito — sem bolinha de boneca) e a
    // lição do print de frente: o torso é redondo, então o rasgo tem que
    // SAIR da superfície, senão some
    const eyes = parts.filter((p) => p.m === 'white');
    expect(eyes.length).toBe(2);
    for (const p of eyes) {
      expect(p.p[2]).toBeGreaterThanOrEqual(0.7);
      expect(Math.abs(p.p[0])).toBeGreaterThanOrEqual(0.2); // par, não ciclope
      expect(p.a[1]).toBeLessThanOrEqual(p.a[0] * 0.4); // RASGO: mais largo que alto
    }
    const torsoEnv = partsEnvelope(parts.filter((p) => p.g === 'dodeca' && p.a[0] >= 0.8));
    const eyeEnv = partsEnvelope(eyes);
    expect(eyeEnv.maxZ).toBeGreaterThan(torsoEnv.maxZ);
    // brasa ENCAPSULADA: o fogo preso no vidro fica DENTRO do corpo (nunca
    // colado na frente, o padrão das outras espécies)
    const embers = parts.filter((p) => p.m === 'glow' && p.flick === undefined);
    expect(embers.length).toBeGreaterThanOrEqual(3);
    for (const b of embers) {
      expect(b.p[1]).toBeGreaterThan(1.4);
      expect(b.p[1]).toBeLessThan(2.3);
      expect(Math.abs(b.p[2])).toBeLessThan(0.3);
    }
    // limalhas de vidro: farpas FINAS coladas nas ENCOSTAS do torso de baixo
    const grit = parts.filter((p) => p.flick !== undefined);
    expect(grit.length).toBeGreaterThanOrEqual(4);
    for (const g of grit) {
      expect(g.g).toBe('box');
      expect(g.a[0]).toBeLessThanOrEqual(0.05);
      expect(g.p[2]).toBeGreaterThan(0.6); // encostado na superfície
      expect(g.p[2]).toBeLessThan(0.95); // e não palito flutuando fora da silhueta
    }
    // halo de vidro no chão: ANEL PLANO (não disco) rente ao tabuleiro
    const ring = parts.find((p) => p.g === 'ring')!;
    expect(ring.m).toBe('trans');
    expect(ring.p[1]).toBeLessThan(0.06);
    expect(Math.abs(ring.r?.[0] ?? 0)).toBeGreaterThan(1.5);
    expect(ring.a[0]).toBeGreaterThan(0.6); // miolo livre p/ a raiz assentar
    // cacos espalhados na raiz: lascas CHATAS deitadas no piso, largas
    const debris = parts.filter((p) => p.p[1] <= 0.1 && Math.abs(p.p[0]) >= 0.9);
    expect(debris.length).toBeGreaterThanOrEqual(4);
    for (const d of debris) expect((d.s?.[1] ?? 1) / (d.s?.[0] ?? 1)).toBeLessThanOrEqual(0.35);
  });

  test('ANTI LOW-POLY: poliedro deslocado é SUBDIVIDIDO e o anel tem 48 radiais', () => {
    for (const p of partsForLevel(MODELS.obsidiana, 7)) {
      if (p.g === 'octa' || p.g === 'dodeca' || p.g === 'ico') {
        // a regra da árvore inteira vale com força aqui: vidro fratura em
        // facetas, mas faceta de vidro é curva — poliedro cru (sub 0) é prisma
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      }
      if (p.g === 'ring') expect(p.a[2]).toBeGreaterThanOrEqual(48);
    }
    // contagens reais (a medição do print low-poly): os platôs e o torso
    expect(getGeometry('octa', [1.1, 2]).getAttribute('position').count).toBe(216);
    expect(getGeometry('dodeca', [0.82, 2]).getAttribute('position').count).toBe(972);
    expect(getGeometry('ring', [0.85, 1.3, 48]).getAttribute('position').count).toBeGreaterThan(90);
    // a coroa alta não pode ser um prisma de 8 faces (ela é a silhueta da
    // fortaleza de longe)
    const horn = partsForLevel(MODELS.obsidiana, 7).find((p) => p.g === 'octa' && p.p[1] > 3)!;
    expect(horn.a[1]).toBeGreaterThanOrEqual(2);
  });

  test('invólucro: a fortaleza cabe no slot e aproveita o formTop (4,3) sem estourar', () => {
    const e = partsEnvelope(partsForLevel(MODELS.obsidiana, 7));
    // larga, mas nunca invade o centro do vizinho (vão entre colunas = 3,2)
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThanOrEqual(1.55);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X - 0.6);
    // o anel de vidro no chão é a coisa mais funda/comprida da criatura: fica
    // exatamente nas duas linhas de profundidade do slot
    expect(Math.max(e.maxZ, -e.minZ)).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    expect(e.minY).toBeGreaterThanOrEqual(-0.1); // plantada: nada afunda no convés
    expect(e.maxY).toBeGreaterThan(3.8); // chifrão aproveita o formTop
    expect(e.maxY).toBeLessThanOrEqual(formTop(OBSIDIANA, 7) + 0.25);
  });

  test('vidro negro: albedo em BREU, brilho vem do specular/reflexo (nunca lavanda)', () => {
    const body = OBS_ROLE_LOOK.body!;
    // a lição do print: iceA #4a4463 x luz da arena pintava a fortaleza de
    // lavanda e no b-frame do combate ela lia PRATA
    expect(luma(body.iceA)).toBeLessThan(0.3);
    expect(luma(body.iceB)).toBeLessThan(luma(body.iceA));
    // o reflexo tem que ser FORTE (obsidiana é o material mais espelhado da
    // árvore) e o specular apertado — é isso que faz a faceta piscar
    expect(body.env).toBeGreaterThanOrEqual(0.4);
    expect(body.refl).toBeGreaterThanOrEqual(110);
    // glitter alto em corpo escuro é POEIRA, não vidro
    expect(body.sparkle).toBeLessThanOrEqual(1);
    // costura CONTÍNUA e larga: crackScale alto vira linha tracejada
    expect(body.crackScale).toBeLessThanOrEqual(2);
    expect(body.crackWidth).toBeGreaterThanOrEqual(0.05);
    expect(OBS_ROLE_LOOK.dark!.crackScale).toBeLessThanOrEqual(2);
    expect(OBS_ROLE_LOOK.dark!.sparkle).toBeLessThanOrEqual(1);
    // o material de vidro: NUNCA aditivo, com depthWrite (cristal tem peso) e
    // o reflexo real da arena plugado
    const ice = makeIceMaterial({
      iceA: body.iceA,
      iceB: body.iceB,
      crack: body.crack,
      amp: body.amp,
      crackGlow: body.crackGlow,
      crackScale: body.crackScale,
      crackWidth: body.crackWidth,
      alpha: body.alpha,
      bump: body.bump,
      reflPow: body.refl,
      envMix: body.env,
      sparkle: body.sparkle,
    });
    expect(ice.blending).toBe(THREE.NormalBlending);
    expect(ice.depthWrite).toBe(true);
    expect(ice.uniforms.uEnv).toBeDefined();
    expect(ice.uniforms.uEnvMix.value).toBeGreaterThanOrEqual(0.4);
    expect(ice.uniforms.uCrackCol.value.getHexString()).toBe('8f5cff');
    ice.dispose();
  });

  test('chão: o anel do halo é reflexo contido SEM tint e a raiz não é espelho', () => {
    const trans = OBS_ROLE_LOOK.trans!;
    // alfa/reflexo altos viravam LAMA VIOLETA no tabuleiro (a lição do macro)
    expect(trans.alpha).toBeLessThanOrEqual(0.3);
    expect(trans.env).toBeLessThanOrEqual(0.35);
    expect(trans.crackGlow).toBeLessThanOrEqual(0.5);
    // o fio do halo é o violeta da ESPÉCIE (a regra da geada: de raspão o
    // fresnel puxa o tint da equipe para a peça do chão)
    expect(trans.crack).toBe(OBS_VIOLET);
    // regra nova da passada: peça rente ao chão NÃO pode ser espelho — placa
    // chata de frente pro piso espelhava a arena e lia lâmina violeta acesa
    expect(luma(OBS_GROUND.iceA)).toBeLessThan(luma(OBS_ROLE_LOOK.body!.iceA));
    expect(OBS_GROUND.env).toBeLessThan(trans.env);
    expect(OBS_GROUND.env).toBeLessThanOrEqual(0.2);
  });

  test('brasa encapsulada: o plasma violeta NÃO é aditivo e o branco é cortado', () => {
    expect(OBSIDIANA.base.projectileColor).toBe(OBS_VIOLET);
    expect(VISUALS.obsidiana.glow).toBe(OBS_VIOLET);
    const core = makeCoreMaterial(OBS_CORE_LOOK);
    expect(core.blending).toBe(THREE.NormalBlending);
    expect(core.uniforms.uGold.value.getHexString()).toBe('8f5cff');
    // blowout sempre cortado: o miolo quente é lilás-claro, nunca #ffffff
    expect(OBS_CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(OBS_CORE_LOOK.white)).toBeLessThan(0.95);
    // orla VIOLETA-escura (o azul elétrico do Raio é a assinatura de outra
    // espécie): violeta tem mais vermelho que verde
    const cool = new THREE.Color(OBS_CORE_LOOK.cool);
    expect(cool.r).toBeGreaterThan(cool.g);
    expect(cool.b).toBeGreaterThan(cool.r);
    core.dispose();
  });

  test('coreografia PESADA: o vidro enverga devagar, as ombreiras recuam e VARREM', () => {
    // a fortaleza não anda: é o arremesso mais LENTO da árvore (a janela é
    // maior que a do Gelo e que a da Tempestade)
    expect(OBSIDIANA_ATTACK_WINDOW).toBeGreaterThanOrEqual(0.9);
    expect(OBSIDIANA_ATTACK_WINDOW).toBeGreaterThan(ICE_ATTACK_WINDOW);
    expect(OBSIDIANA_ATTACK_WINDOW).toBeGreaterThan(TEMPESTADE_ATTACK_WINDOW);
    expect(OBSIDIANA_WINDUP).toBeGreaterThan(0.5); // a maior parte é carga

    const idle = attackPose(-1);
    expect([idle.twist, idle.crouch, idle.bulge, idle.swing, idle.charge, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const windup = attackPose(OBSIDIANA_ATTACK_WINDOW * OBSIDIANA_WINDUP * 0.95);
    expect(windup.charge).toBeGreaterThan(0.8); // a brasa das costuras enche
    expect(windup.swing).toBeLessThan(-0.5); // ombreiras RECUAM
    expect(windup.bulge).toBeGreaterThan(0.8); // o vidro grosso comprime (squash)
    expect(windup.crouch).toBeGreaterThan(0.8); // as fundações affundam
    expect(windup.flare).toBeGreaterThan(0.4); // barbatanas e chifres eriçam
    const fire = attackPose(OBSIDIANA_ATTACK_WINDOW * (OBSIDIANA_WINDUP + 0.3 * (1 - OBSIDIANA_WINDUP)));
    expect(fire.swing).toBeGreaterThan(0.3); // as ombreiras VARREM para frente
    expect(fire.stepZ).toBeGreaterThan(0.05); // só o tronco empurra (não anda)
    expect(fire.bulge).toBeLessThan(0.2); // o vidro volta (bulge) com impulso
    expect(fire.twist).toBeGreaterThan(0.1); // o corpo destorce no arremesso
    const late = attackPose(OBSIDIANA_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // a brasa esfria depois do tiro
    const out = attackPose(OBSIDIANA_ATTACK_WINDOW + 0.2);
    expect([out.charge, out.swing, out.bulge, out.stepZ]).toEqual([0, 0, 0, 0]);
  });

  test('motor: a lasca chega com espécie/nível/origem e a fortaleza arremessa PESO', () => {
    expect(OBSIDIANA.base.damageElement).toBe('earth');
    expect(OBSIDIANA.base.projectileSpeed).toBeLessThanOrEqual(8); // vidro tem inércia
    expect(OBSIDIANA.base.abilities.some((a) => a.kind === 'heavy')).toBe(true);
    const splash = OBSIDIANA.base.abilities.find((a) => a.kind === 'splash');
    expect(splash).toBeDefined();
    expect(splash!.radius ?? 0).toBeGreaterThanOrEqual(1.5);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 7331 });
    const st = eng.addRetainedUnit('obsidiana', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    // varre o voo inteiro: a LASCA (não bola, não raio) carrega o figurino
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 16; i++) {
      runSeconds(eng, 0.25);
      for (const p of eng.world.projectiles) if (p.species === 'obsidiana') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(7);
      expect(p.damageElement).toBe('earth');
      expect(p.abilities.some((a) => a.kind === 'splash')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'obsidiana');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(7);
      expect(f.pos2).toBeDefined(); // a última posição: o rastro da lasca chegando
    }
  });
});
