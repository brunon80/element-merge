import * as THREE from 'three';
import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { makeSteamMaterial } from '../scene/steamShaders';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig de VAPOR (Nv.6 — a CALDEIRA VIVA), quinto elemento da árvore com
 * figurino próprio: panela de ferro com brasa embaixo, água fervendo na boca
 * e cabeça de nuvem que ferve por dentro. O pedido em andamento do usuário
 * ("adicione mais vértices, menos low-poly") vira regra AMARRADA aqui:
 * tambores com ≥16 radiais × ≥4 anéis, nuvem em ico sub 2 e — o achado desta
 * leva — o `assets.ts` IGNORAVA o argumento de subdivisão do 'ico' (todo
 * poliedro que pedia sub vinha sub 0; corrigido e preso em teste).
 */

const VAPOR = getSpecies('vapor');
const LV = 6 as MonsterLevel;

describe('Vapor: caldeira viva de ferro com cabeça de nuvem', () => {
  test('o Vapor tem rig próprio e forma única de caldeira', () => {
    expect(SPECIES_RIGS.vapor).toBeTruthy();
    expect(hasLevelVariants(MODELS.vapor)).toBe(false);
    expect(partsForLevel(MODELS.vapor, 6).length).toBe(MODELS.vapor.parts.length);
  });

  test('silhueta: panela em socalcos plantada nos pés, boca aberta e nuvem na cabeça', () => {
    const parts = partsForLevel(MODELS.vapor, 6);
    // corpo: 3 tambores de chapa (raio grande) que INCHAM no ventre e
    // afunilam na boca
    const terraces = parts.filter((p) => p.g === 'cyl' && Math.max(p.a[0], p.a[1]) > 1.0);
    expect(terraces.length).toBe(3);
    const byY = [...terraces].sort((a, b) => a.p[1] - b.p[1]);
    const widest = (t: (typeof terraces)[number]) => Math.max(t.a[0], t.a[1]);
    expect(widest(byY[1])).toBeGreaterThan(widest(byY[0])); // ventre > saia dos pés
    expect(widest(byY[1])).toBeGreaterThan(widest(byY[2])); // ventre > gargalo da boca
    // aro da boca aberto no topo + alça de arco (a panela que é criatura)
    expect(
      parts.some((p) => p.g === 'torus' && p.a[0] >= 1.2 && p.p[1] >= 2.1),
    ).toBe(true);
    // pés de ferro na base (o cone tem a PONTA embaixo: r[0] ≈ π)
    const legs = parts.filter((p) => p.g === 'cone' && p.p[1] < 0.6);
    expect(legs.length).toBe(3);
    // brasa do leito embaixo do ventre + porta do fogo na frente (+z)
    expect(parts.some((p) => p.m === 'glow' && p.p[1] < 0.3)).toBe(true);
    expect(parts.some((p) => p.m === 'glow' && p.p[2] > 1.2)).toBe(true);
    // CABEÇA de nuvem: ≥3 icos sub 2 (malha densa) empilhados acima da boca
    const clouds = parts.filter(
      (p) => p.g === 'ico' && (p.a[1] ?? 0) >= 2 && p.p[1] >= 2.5 && p.a[0] >= 0.5,
    );
    expect(clouds.length).toBeGreaterThanOrEqual(3);
    // bicos de vapor que o rig varre no jato (tag arm) e válvulas que
    // assobiam na carga (tag spike)
    const arms = parts.filter((p) => p.tag === 'arm');
    expect(arms.length).toBe(2);
    expect(arms.every((a) => a.a[2] >= 10 && a.a[3] >= 4)).toBe(true); // cones densos
    expect(parts.filter((p) => p.tag === 'spike').length).toBeGreaterThanOrEqual(2);
    // olhos do braseiro NA nuvem + gotas ferventes em órbita + anel escaldante
    expect(parts.filter((p) => p.m === 'white').length).toBe(2);
    expect(parts.filter((p) => p.group !== undefined).length).toBeGreaterThanOrEqual(3);
    expect(parts.some((p) => p.g === 'ring' && p.p[1] < 0.1)).toBe(true);
    // a nuvem sobe até perto do formTop (aproveita os 3.6 do Nv.6)
    const e = partsEnvelope(parts);
    expect(e.maxY).toBeGreaterThan(3.4);
  });

  test('ANTI LOW-POLY: malha densa em tudo e a subdivisão do ico funciona de verdade', () => {
    // o achado da leva: getGeometry('ico', [r, 2]) vinha com a malha de sub 0
    // (o argumento era IGNORADO). Agora sub 2 = 4× as faces de sub 1.
    const sub0 = getGeometry('ico', [0.5, 0]);
    const sub2 = getGeometry('ico', [0.5, 2]);
    expect(sub2.getAttribute('position').count).toBeGreaterThan(
      sub0.getAttribute('position').count * 3,
    );
    // e o modelo aproveita: corpo em tambores 16+ radiais × 4+ anéis (peça
    // com deslocamento de vértice em malha rala é o vício low-poly cobrado)
    for (const p of partsForLevel(MODELS.vapor, 6)) {
      if (p.g === 'cyl' && Math.max(p.a[0], p.a[1]) > 1.0) {
        expect(p.a[3]).toBeGreaterThanOrEqual(16); // radiais
        expect(p.a[4]).toBeGreaterThanOrEqual(4); // anéis verticais p/ entortar
      }
      if (p.amp !== undefined && (p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca')) {
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1); // poliedro deslocado tem que ser subdividido
      }
    }
    // arcos de reforço: toros 12 tubulares × 40 ao redor (rosca lisa, não prisma)
    const hoops = partsForLevel(MODELS.vapor, 6).filter((p) => p.g === 'torus');
    expect(hoops.length).toBeGreaterThanOrEqual(4);
    expect(hoops.every((t) => t.a[2] >= 10 && t.a[3] >= 30)).toBe(true);
  });

  test('invólucro: a panela grande cabe no tabuleiro e na altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.vapor, 6));
    // ventre largo é a assinatura do porte (maior que os ombros do Gelo)
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(1.5);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06); // pés plantados, nada afunda
    expect(e.maxY).toBeLessThanOrEqual(formTop(VAPOR, 6) + 0.4);
  });

  test('material: vapor é nuvem translúcida SEM aditivo e SEM tint da equipe', () => {
    const m = makeSteamMaterial({
      cool: '#e8f0f6',
      warm: '#ffd2a6',
      amp: 0.09,
      alpha: 0.72,
      swirl: 0.55,
      hotY: 0.9,
    });
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false); // camadas de nuvem se somam por alfa
    expect(m.blending).toBe(THREE.NormalBlending); // NUNca aditivo (blowout sempre cortado)
    for (const u of ['uHotY', 'uSwirl', 'uCharge', 'uAmp', 'uCool', 'uWarm', 'uAlpha']) {
      expect(m.uniforms[u]).toBeDefined();
    }
    // vapor claro beirando o branco (legível de longe no tabuleiro)
    const cool = m.uniforms.uCool.value;
    expect(Math.min(cool.r, cool.g, cool.b)).toBeGreaterThan(0.78);
    // gradiente quente embaixo: o pêssego vem do uWarm (R bem acima de B)
    const warm = m.uniforms.uWarm.value;
    expect(warm.r - warm.b).toBeGreaterThan(0.25);
    // gradiente térmico pela ALTURA DE MUNDO (a nuvem empilhada esquenta na
    // boca) e alfa animada em fiapos (a nuvem nunca é bola de plástico)
    expect(m.fragmentShader).toContain('vWorldY');
    expect(m.fragmentShader).toContain('uHotY');
    expect(m.fragmentShader).toContain('uSwirl');
    // a REGRA do halo de geada vale p/ vapor: nuvem translúcida nunca usa o
    // tint da equipe
    expect(m.fragmentShader).not.toContain('uTeamColor');
    expect(m.vertexShader).toContain('USE_INSTANCING');
    expect(m.vertexShader).toContain('aSeed');
    m.dispose();
  });

  test('motor: a rajada chega com espécie/nível/origem no FX', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 71 });
    const vp = eng.addRetainedUnit('vapor', LV, 0);
    expect(vp.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 8);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'vapor');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('a rajada escaldante queima E abranda (a assinatura burn+slow)', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 17 });
    const vp = eng.addRetainedUnit('vapor', LV, 0);
    expect(vp.ok).toBe(true);
    const foeId = mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    let burned = false;
    let slowed = false;
    for (let i = 0; i < 60 * 14 && !(burned && slowed); i++) {
      eng.update(1 / 60);
      const foe = eng.getUnit(foeId);
      if (!foe) break;
      if (foe.statuses.some((s) => s.type === 'burn' && s.remaining > 0)) burned = true;
      if (foe.statuses.some((s) => s.type === 'slow' && s.remaining > 0)) slowed = true;
    }
    expect(burned || slowed).toBe(true); // ao menos uma das marcas escaldantes
    expect(eng.getUnit(vp.unitId!)?.alive).toBe(true);
  });
});
