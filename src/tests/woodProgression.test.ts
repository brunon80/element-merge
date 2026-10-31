import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { makeWoodMaterial } from '../scene/woodShaders';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig de MADEIRA (Nv.6 — o ancião das raízes), segundo elemento da árvore com
 * figurino próprio, no PADRÃO DO GOLÉM: casca opaca com luz fake da arena,
 * projétil-assinatura cambalhota (semente de casca e seiva) e estilhaços
 * físicos no impacto — sem energia aditiva. As esmeraldas e asas-leque de
 * cristal da referência entram como geometria + material de gema.
 */

const MADEIRA = getSpecies('madeira');
const LV = 6 as MonsterLevel;

describe('Madeira: rig de tronco no padrão do golem', () => {
  test('a Madeira tem rig próprio e forma única de ancião', () => {
    expect(SPECIES_RIGS.madeira).toBeTruthy();
    expect(hasLevelVariants(MODELS.madeira)).toBe(false);
    expect(partsForLevel(MODELS.madeira, 6).length).toBe(MODELS.madeira.parts.length);
  });

  test('silhueta com joias e asas-leque da referência', () => {
    const parts = partsForLevel(MODELS.madeira, 6);
    // asas de cristal: dois frouxos de gema por lado, animados pelo rig
    expect(parts.filter((p) => p.tag === 'wing').length).toBe(4);
    // esmeralda-mãe embutida na barriga (joya grande na frente do torso)
    expect(
      parts.some((p) => p.g === 'octa' && p.m === 'glow' && p.p[1] < 1.5 && p.p[2] > 0.4),
    ).toBe(true);
    // joia da testa + esmeraldas nos ombros
    expect(parts.some((p) => p.g === 'octa' && p.p[1] > 2.4 && p.p[2] > 0.2)).toBe(true);
    expect(parts.filter((p) => p.g === 'octa' && p.m === 'glow').length).toBeGreaterThanOrEqual(4);
    // galhos que o rig varre no arremesso
    expect(parts.filter((p) => p.tag === 'arm').length).toBe(2);
  });

  test('invólucro: asas largas cabem no tabuleiro e na altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.madeira, 6));
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    // as asas quase atravessam o tile (assinatura larga da silhueta)
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(1.1);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.maxY).toBeLessThanOrEqual(formTop(MADEIRA, 6) + 0.4);
  });

  test('o material de casca é opaco, instanciado e pulsa com a seiva', () => {
    const m = makeWoodMaterial({
      barkA: '#8a6a3f',
      barkB: '#3c2c1a',
      moss: '#4f7a3d',
      sap: '#3ee27f',
      amp: 0.075,
    });
    // casca sólida como a pedra do golem (peso/legibilidade no tabuleiro)
    expect(m.transparent).toBe(false);
    expect(m.depthWrite).toBe(true);
    for (const u of ['uSap', 'uSapGlow', 'uCharge', 'uHurt', 'uSapCol', 'uMoss', 'uTeamColor']) {
      expect(m.uniforms[u]).toBeDefined();
    }
    // o projétil-semente usa o MESMO shader (instância com aSeed por arremesso)
    expect(m.vertexShader).toContain('USE_INSTANCING');
    expect(m.vertexShader).toContain('aSeed');
    expect(m.fragmentShader).toContain('uSap');
    m.dispose();
  });

  test('motor: a semente da Madeira chega com espécie/nível/origem no FX', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 91 });
    const md = eng.addRetainedUnit('madeira', LV, 0);
    expect(md.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 6);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'madeira');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('a regeneração da Madeira a mantém de pé contra pedreiros', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 13 });
    const md = eng.addRetainedUnit('madeira', LV, 0);
    expect(md.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    eng.startBattle();
    runSeconds(eng, 8);
    const unit = eng.getUnit(md.unitId!);
    // regen contínua: o ancião absorve o castigo de pedra e segue de pé
    expect(unit?.alive).toBe(true);
    expect(unit ? unit.hp : 0).toBeGreaterThan((unit?.maxHp ?? 1) * 0.5);
  });
});
