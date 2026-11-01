import * as THREE from 'three';
import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeSteamMaterial } from '../scene/steamShaders';
import { makeWindMaterial } from '../scene/windShaders';
import { makeArcMaterial, makeCoreMaterial } from '../scene/lightningShaders';
import { makeIceMaterial } from '../scene/iceShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { attackPose, TEMPESTADE_ATTACK_WINDOW, TEMPESTADE_WINDUP } from '../scene/TempestadeRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig da TEMPESTADE (Nv.7 — a MURALHA DE RAIOS), primeira espécie Nv.7 da
 * árvore com figurino próprio: muro largo de supercélula plantado no chão,
 * rolo de frente de tempestade, bigornas, mastros para-raios com curto-
 * circuito na crista (a assinatura do chain 3×), cortinas de chuva e granizo.
 * As regras amarradas aqui valem para a árvore toda:
 *  - anti low-poly (tambores ≥16×4, cascas de cortina ≥20×5, toros ≥10×30,
 *    nuvem em ico sub ≥2 deslocada);
 *  - nuvem/granizo NUNCA leva tint da equipe (a regra do vapor/areia);
 *  - o ARCO é o único aditivo permitido; clarões têm teto (blowout cortado);
 *  - a paleta lilássa (#d0b6ff) é ÚNICA entre motor, rig e projétil.
 */

const TEMPESTADE = getSpecies('tempestade');
const LV = 7 as MonsterLevel;
const STORM_LILAC = '#d0b6ff';

describe('Tempestade: muralha de raios (supercélula plantada)', () => {
  test('a Tempestade tem rig próprio e forma única de muralha (Nv.7)', () => {
    expect(SPECIES_RIGS.tempestade).toBeTruthy();
    expect(hasLevelVariants(MODELS.tempestade)).toBe(false);
    expect(partsForLevel(MODELS.tempestade, 7).length).toBe(MODELS.tempestade.parts.length);
  });

  test('silhueta: MURO LARGO plantado, rolo na frente, bigornas e 4 mastros na crista', () => {
    const parts = partsForLevel(MODELS.tempestade, 7);
    // a muralha é a criatura mais LARGA da árvore (atravessa o próprio slot —
    // é frente de tempestade), mas nunca invade o centro do vizinho
    const e = partsEnvelope(parts);
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThanOrEqual(2.3);
    // rolo da frente de tempestade (shelf cloud): tambor DEITADO no eixo X,
    // longo — nenhuma outra espécie tem isso (o invólucro da peça prova que
    // ele está tombado: o comprimento vira envergadura em X)
    const roller = parts.find((p) => p.g === 'cyl' && Math.abs(p.a[2]) > 1.5 && (p.r?.[2] ?? 0) > 1.5);
    expect(roller).toBeDefined();
    const re = partsEnvelope([roller!]);
    expect(re.maxX - re.minX).toBeGreaterThanOrEqual(3.5); // tombado: o eixo longo vira X
    expect(roller!.p[1]).toBeGreaterThan(0.7); // rolo BAIXO (a base do muro)
    expect(roller!.p[1]).toBeLessThan(1.4);
    // bigorna de cumulonimbus: nuvens ESCALACHADAS para os lados no topo
    const anvil = parts.filter((p) => p.g === 'ico' && Math.abs(p.p[0]) > 1.2 && p.p[1] > 3.1);
    expect(anvil.length).toBeGreaterThanOrEqual(2);
    for (const a of anvil) expect((a.s?.[1] ?? 1) / (a.s?.[0] ?? 1)).toBeLessThanOrEqual(0.35);
    // 4 mastros para-raios na crista (tag arm — o rig os flexiona no disparo)
    const masts = parts.filter((p) => p.tag === 'arm' && p.g === 'cyl');
    expect(masts.length).toBe(4);
    for (const m of masts) expect(m.p[1]).toBeGreaterThan(3.5);
    // curto-circuito na crista: arcos ENTRE os mastros (a assinatura do
    // chain 3× saltos escrita na silhueta) + o anel orbital + o anel de chão
    const crestArcs = parts.filter((p) => p.g === 'torus' && p.m === 'accent' && p.p[1] > 3.7);
    expect(crestArcs.length).toBeGreaterThanOrEqual(3);
    expect(parts.some((p) => p.group !== undefined)).toBe(true); // corrente orbitando o muro
    expect(
      parts.some((p) => p.g === 'torus' && p.p[1] < 0.12 && p.m === 'accent' && p.a[0] >= 1.8),
    ).toBe(true); // frente de rajada rente ao chão
    // brasa lilás presa DENTRO do muro (relâmpago intra-nuvem — nunca colada
    // na frente do corpo como as outras espécies)
    const ember = parts.filter((p) => p.m === 'glow');
    expect(ember.length).toBeGreaterThanOrEqual(2);
    for (const b of ember) {
      expect(b.p[1]).toBeGreaterThan(1.2);
      expect(b.p[1]).toBeLessThan(2.3);
    }
    // cortinas de chuva PLANTADAS (role veil — casca aberta, o vendaval em
    // cinza-ardósia) e granizo pendurado na beirada do rolo (trans = gelo)
    const veils = parts.filter((p) => p.m === 'veil');
    expect(veils.length).toBeGreaterThanOrEqual(3); // 1 central + par espelhado
    for (const v of veils) expect(v.p[1] - v.a[2] / 2).toBeLessThanOrEqual(0.06);
    const hail = parts.filter((p) => p.m === 'trans');
    expect(hail.length).toBeGreaterThanOrEqual(2);
    for (const h of hail) {
      expect(h.p[1]).toBeGreaterThan(0.5); // pendurado, não enterrado
      expect(h.p[1]).toBeLessThan(1.2);
    }
  });

  test('ANTI LOW-POLY: malha densa em tudo (nuvem, rolo, cortinas, toros e mastros)', () => {
    for (const p of partsForLevel(MODELS.tempestade, 7)) {
      if (p.g === 'cyl') {
        expect(p.a[3]).toBeGreaterThanOrEqual(12); // radiais (mastros inclusos)
        expect(p.a[4]).toBeGreaterThanOrEqual(3); // anéis p/ entortar
        if (p.m === 'veil') {
          expect(p.a[3]).toBeGreaterThanOrEqual(20); // cortina aguenta o cisalhamento do vendaval
          expect(p.a[4]).toBeGreaterThanOrEqual(5);
        }
      }
      if (p.g === 'torus') {
        expect(p.a[2]).toBeGreaterThanOrEqual(10); // rosca do tubo
        expect(p.a[3]).toBeGreaterThanOrEqual(30); // ao redor (rosca lisa, não prisma)
      }
      if (p.amp !== undefined && (p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca')) {
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1); // poliedro deslocado = subdividido
      }
    }
    // a nuvem da MURALHA não pode facetear: laje e torres em ico sub 2
    const slab = partsForLevel(MODELS.tempestade, 7).find(
      (p) => p.g === 'ico' && p.a[0] >= 1.0 && p.p[1] < 1.5,
    )!;
    expect(slab.a[1]).toBeGreaterThanOrEqual(2);
    expect(getGeometry('ico', slab.a).getAttribute('position').count).toBeGreaterThan(500);
    // o rolo frontal (a peça que mais mostra curvatura) é denso
    const roller = partsForLevel(MODELS.tempestade, 7).find(
      (p) => p.g === 'cyl' && Math.abs(p.a[2]) > 1.5,
    )!;
    expect(roller.a[3]).toBeGreaterThanOrEqual(16);
    expect(roller.a[4]).toBeGreaterThanOrEqual(4);
  });

  test('invólucro: a muralha larga cabe no tabuleiro e no topo declarado (4.5)', () => {
    const e = partsEnvelope(partsForLevel(MODELS.tempestade, 7));
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X); // nunca o centro do vizinho
    // a folga p/ o deslocamento do shader (nuvem respira, cortina cisalha) é
    // o vão entre colunas MENOS a envergadura medida — e o vão é de 3.2
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06); // plantada: nada afunda
    expect(e.maxY).toBeGreaterThan(4.4); // crista + mastros aproveitam o formTop
    expect(e.maxY).toBeLessThanOrEqual(formTop(TEMPESTADE, 7) + 0.25);
  });

  test('nuvem da muralha: vapor ESCURO de trovoada com o lilás acendendo por dentro', () => {
    // o rig pinta a nuvem com o steamShaders (a mesma receita do Vapor, SEM
    // tint): ardósia ESCURA (nuvem de tempestade, não vapor escaldante)
    const m = makeSteamMaterial({
      cool: '#46536f',
      warm: '#7b7299',
      hot: STORM_LILAC,
      amp: 0.085,
      alpha: 0.86,
      swirl: 0.5,
      hotY: 1.05, // brasa no VENTRE (o miolo esquenta embaixo, a bigorna esfria)
    });
    expect(m.transparent).toBe(true);
    expect(m.blending).toBe(THREE.NormalBlending); // a nuvem NUNCA é aditiva
    for (const u of ['uCharge', 'uSwirl', 'uHotY', 'uCool', 'uWarm', 'uHot']) {
      expect(m.uniforms[u]).toBeDefined();
    }
    const cool = m.uniforms.uCool.value;
    expect(cool.b).toBeGreaterThan(cool.r); // ardósia AZULADA (tempestade, não poeira)
    const hot = m.uniforms.uHot.value;
    expect(hot.b - hot.r).toBeGreaterThan(0.1); // o clarão é o LILÁS da espécie
    // a regra da nuvem do vapor vale p/ a muralha: NUNCA tint de equipe
    expect(m.fragmentShader).not.toContain('uTeamColor');
    expect(m.vertexShader).toContain('uTime'); // a nuvem rola/ferve sozinha
    m.dispose();
  });

  test('cortinas de chuva: o vendaval na paleta da trovoada, SEM tint e SEM aditivo', () => {
    const m = makeWindMaterial({
      cold: '#2f3a52',
      mid: '#5f6c8c',
      hot: '#aebfd9', // perolado (a lição do véu da areia: nunca branco-toalha)
      amp: 0.05,
    });
    expect(m.blending).toBe(THREE.NormalBlending);
    expect(m.fragmentShader).not.toContain('uTeamColor');
    const mid = m.uniforms.uMid.value;
    expect(mid.b).toBeGreaterThan(mid.r); // cinza-ARDÓSIA (chuva), não ocre
    const hot = m.uniforms.uHot.value;
    expect(1 - hot.r).toBeGreaterThan(0.3); // teto perolado (nunca #ffffff puro)
    m.dispose();
  });

  test('corrente da muralha: arco LILÁS (o único aditivo) com plasma e granizo não-aditivos', () => {
    const proj = TEMPESTADE.base.projectileColor;
    expect(proj).toBe(STORM_LILAC); // a paleta da espécie é a cor do tiro do motor
    // dardo/projetil e mastros: o MESMO arco lilás (coolAmt alto: o ouro é
    // só ponta de faísca — no raio o traço é azul; aqui é LILÁSS)
    const arc = makeArcMaterial({
      gold: '#ffe9c4',
      white: '#f6f1ff',
      cool: STORM_LILAC,
      coolAmt: 0.85,
      jitter: 0.07, // jitter em unidades de mundo: cabe no corpo do fio
                    // (regra anti-ouriço do print 3)
      dash: 30,
      flow: 11,
    });
    expect(arc.blending).toBe(THREE.AdditiveBlending); // o ÚNICO aditivo permitido
    const cool = arc.uniforms.uCool.value;
    expect(cool.getHexString()).toBe('d0b6ff');
    expect(arc.uniforms.uCoolAmt.value).toBeGreaterThanOrEqual(0.75);
    arc.dispose();
    // plasma lilás na cabeça do dardo e no miolo do muro: NÃO-aditivo
    const core = makeCoreMaterial({ gold: '#d8b2ff', white: '#f6f0ff', cool: '#8f9cff' });
    expect(core.blending).toBe(THREE.NormalBlending);
    core.dispose();
    // granizo: o MESMO gelo do Gelo na paleta da trovoada — veios LILÁSS
    // acesos, reflexo real da arena, depthWrite (cristal tem peso)
    const ice = makeIceMaterial({
      iceA: '#e2ecff',
      iceB: '#93aed6',
      crack: STORM_LILAC,
      amp: 0.018,
      envMix: 0.5,
    });
    expect(ice.blending).toBe(THREE.NormalBlending);
    expect(ice.depthWrite).toBe(true);
    expect(ice.uniforms.uEnv).toBeDefined();
    const crack = ice.uniforms.uCrackCol.value;
    expect(crack.getHexString()).toBe('d0b6ff');
    ice.dispose();
  });

  test('coreografia da descarga: o muro INSPIRA (mastros para trás) e ESTALA para frente', () => {
    const idle = attackPose(-1);
    expect([idle.twist, idle.swell, idle.lean, idle.charge, idle.stepZ, idle.flare, idle.gust]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const windup = attackPose(TEMPESTADE_ATTACK_WINDOW * TEMPESTADE_WINDUP * 0.9);
    expect(windup.charge).toBeGreaterThan(0.8); // o ventre enche de lilás
    expect(windup.lean).toBeLessThan(-0.2); // mastros FLEXIONADOS para trás
    expect(windup.swell).toBeGreaterThan(0.8); // o muro incha inspirando
    expect(windup.gust).toBeLessThan(0); // o ar é SUGADO para dentro antes do estalo
    const fire = attackPose(TEMPESTADE_ATTACK_WINDOW * (TEMPESTADE_WINDUP + 0.3 * (1 - TEMPESTADE_WINDUP)));
    expect(fire.lean).toBeGreaterThan(0.1); // os mastros ESTALAM para a frente
    expect(fire.gust).toBeGreaterThan(0.8); // a cortina de chuva VARRE com o vendaval
    expect(fire.stepZ).toBeGreaterThan(0.1); // a frente de tempestade AVANÇA
    const late = attackPose(TEMPESTADE_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // a corrente ESFRIA depois do estalo
    expect(attackPose(TEMPESTADE_ATTACK_WINDOW + 0.2).charge).toBe(0); // fora da janela: idle
  });

  test('motor: o dardo chega com espécie/nível/origem no FX e acende a TEMPESTADE', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 512 });
    const st = eng.addRetainedUnit('tempestade', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 8);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'tempestade');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(7);
      expect(f.pos2).toBeDefined();
    }
  });

  test('a assinatura da muralha: a cadeia de 3 saltos acende o FX com espécie tempestade', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 934 });
    const st = eng.addRetainedUnit('tempestade', LV, 0);
    expect(st.ok).toBe(true);
    const v1 = mustSummon(eng, 'golem', 'ai', 0);
    const v2 = mustSummon(eng, 'golem', 'ai', 1);
    const v3 = mustSummon(eng, 'golem', 'ai', 2);
    for (const id of [v1, v2, v3]) {
      const u = eng.getUnit(id)!;
      u.maxHp = 500000;
      u.hp = 500000;
    }
    eng.startBattle();
    runSeconds(eng, 10);
    const chains = eng.world.fx.filter((f) => f.type === 'chain' && f.species === 'tempestade');
    expect(chains.length).toBeGreaterThan(0);
    for (const c of chains) expect(c.pos2).toBeDefined();
  });
});
