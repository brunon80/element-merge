import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { makeIceMaterial } from '../scene/iceShaders';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig de GELO (Nv.6 — o golem de cristal), quarto elemento da árvore com
 * figurino próprio. Pedido do usuário: MAIOR, mais BRANCO, translúcido e
 * reflexivo, expelindo FLOCOS de neve parado, e a estaca de gelo do MESMO
 * material que estilhaça no alvo — tudo no padrão físico do golem (nada de
 * energia aditiva). O print do primeiro passe cobrou outro ajuste: na
 * frequência fixa as trincas do cristal ESTICAVAM nas peças grandes (borrachos
 * largos de onda de contorno) — os veios agora têm frequência por porte.
 */

const GELO = getSpecies('gelo');
const LV = 6 as MonsterLevel;

describe('Gelo: golem de cristal branco no padrão do golem', () => {
  test('o Gelo tem rig próprio e forma única de colosso de cristal', () => {
    expect(SPECIES_RIGS.gelo).toBeTruthy();
    expect(hasLevelVariants(MODELS.gelo)).toBe(false);
    expect(partsForLevel(MODELS.gelo, 6).length).toBe(MODELS.gelo.parts.length);
  });

  test('silhueta de golem de gelo: torso largo, braços de icicle e coroa de espinhos', () => {
    const parts = partsForLevel(MODELS.gelo, 6);
    // torso de glaciar: o cristal principal é a peça mais larga do modelo
    const big = parts.reduce((a, b) => (a.a[0] > b.a[0] ? a : b));
    expect(big.g).toBe('octa');
    expect(big.a[0]).toBeGreaterThanOrEqual(1.0);
    // braços de icicle que o rig varre no arremesso + punhos de lasca
    expect(parts.filter((p) => p.tag === 'arm').length).toBe(2);
    expect(parts.filter((p) => p.tag === 'spike').length).toBeGreaterThanOrEqual(4);
    // espinhos para o chão (pernas) e placa de geada no piso
    expect(parts.some((p) => p.g === 'ring' && p.p[1] < 0.1)).toBe(true);
    // fragmentos orbitando (o gelo ao redor respira)
    expect(parts.some((p) => p.group !== undefined)).toBe(true);
    // coroa: a silhueta sobe até perto do formTop (aproveita os 3.9 do Nv.6)
    const e = partsEnvelope(parts);
    expect(e.maxY).toBeGreaterThan(3.4);
  });

  test('invólucro: ombros largos cabem no tabuleiro e na altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.gelo, 6));
    // ombros/braços de icicle quase atravessam o tile (assinatura larga)
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(1.3);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.maxY).toBeLessThanOrEqual(formTop(GELO, 6) + 0.4);
  });

  test('material: cristal branco translúcido, reflexivo, com trincas finas por porte', () => {
    const m = makeIceMaterial({
      iceA: '#f2f9ff',
      iceB: '#9fc4dd',
      crack: '#cfeeff',
      amp: 0.04,
      crackScale: 1.9,
      crackWidth: 0.022,
    });
    // translúcido mas FÍSICO: alpha alto, escreve profundidade, sem aditivo
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(true);
    expect(m.uniforms.uAlpha.value).toBeGreaterThanOrEqual(0.7);
    for (const u of ['uCrackScale', 'uCrackWidth', 'uCrackGlow', 'uCharge', 'uSparkle', 'uTeamColor']) {
      expect(m.uniforms[u]).toBeDefined();
    }
    // mais BRANCO (o pedido): o gelo claro beira o branco puro
    const bright = m.uniforms.uIceA.value;
    expect(Math.min(bright.r, bright.g, bright.b)).toBeGreaterThan(0.85);
    // a lição do print: peça grande pede veio mais denso (scale >1) e FINO
    // (trinca de cristal, não onda larga derretida)
    expect(m.uniforms.uCrackScale.value).toBeGreaterThan(1);
    expect(m.uniforms.uCrackWidth.value).toBeLessThan(0.03);
    // reflexo fake de ambiente presente no frag (key spec + fresnel/teto)
    expect(m.fragmentShader).toContain('reflect');
    expect(m.vertexShader).toContain('USE_INSTANCING');
    expect(m.vertexShader).toContain('aSeed');
    m.dispose();
  });

  test('motor: a estaca chega com espécie/nível/origem no FX', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 55 });
    const gl = eng.addRetainedUnit('gelo', LV, 0);
    expect(gl.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 8);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'gelo');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('a bruma congelante desacelera o alvo (a neve também congela)', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 33 });
    const gl = eng.addRetainedUnit('gelo', LV, 0);
    expect(gl.ok).toBe(true);
    const foeId = mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    let slowed = false;
    for (let i = 0; i < 60 * 10 && !slowed; i++) {
      eng.update(1 / 60);
      const foe = eng.getUnit(foeId);
      if (foe && foe.statuses.some((s) => s.type === 'slow' && s.remaining > 0)) slowed = true;
    }
    expect(slowed).toBe(true);
    expect(eng.getUnit(gl.unitId!)?.alive).toBe(true);
  });
});
