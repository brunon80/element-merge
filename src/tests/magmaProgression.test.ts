import * as THREE from 'three';
import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { makeStoneMaterial } from '../scene/stoneShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig de MAGMA (Nv.6 — o colosso de lava), terceiro elemento da árvore com
 * figurino próprio, no PADRÃO DO GOLÉM: corpo de rocha OPACA (basalto quase
 * preto com rios largos de lava), projétil-assinatura física (bloco de lava
 * com coração de plasma) e cacos físicos no impacto. A forma agora é um
 * VULCÃO em socalcos com cratera — a cabeça pequena na beirada vende o porte
 * de montanha (formTop Nv.6 = 3.9).
 */

const MAGMA = getSpecies('magma');
const LV = 6 as MonsterLevel;

describe('Magma: vulcão de basalto no padrão do golem', () => {
  test('o Magma tem rig próprio e forma única de colosso', () => {
    expect(SPECIES_RIGS.magma).toBeTruthy();
    expect(hasLevelVariants(MODELS.magma)).toBe(false);
    expect(partsForLevel(MODELS.magma, 6).length).toBe(MODELS.magma.parts.length);
  });

  test('silhueta de vulcão em socalcos com cratera e cabeça pequena', () => {
    const parts = partsForLevel(MODELS.magma, 6);
    // três socalcos empilhados (base larga → cone → socalco da cratera)
    const cones = parts.filter((p) => p.g === 'cyl');
    expect(cones.length).toBe(3);
    expect(Math.max(...cones.map((p) => Math.max(p.a[0], p.a[1])))).toBeGreaterThan(1.0);
    // base (primeiro socalco) é mais larga que o topo
    const base = cones.reduce((a, b) => (a.p[1] < b.p[1] ? a : b));
    const top = cones.reduce((a, b) => (a.p[1] > b.p[1] ? a : b));
    expect(Math.max(base.a[0], base.a[1])).toBeGreaterThan(Math.max(top.a[0], top.a[1]) * 1.5);
    // MALHA DENSA: corpo do porte de montanha com deslocamento de vértice
    // exige malha subdividida (regra do golem Nv.5) — senão a textura de
    // fissuras rasga/estica nas encostas
    for (const c of cones) {
      expect(c.a[3]).toBeGreaterThanOrEqual(20); // segmentos radiais
      expect(c.a[4]).toBeGreaterThanOrEqual(4); // segmentos verticais
    }
    expect(parts.filter((p) => p.g === 'dodeca').every((p) => (p.a[1] ?? 0) >= 1)).toBe(true);
    // borda da cratera (torus deitado) — o núcleo de lava do rig ferve dentro
    expect(parts.some((p) => p.g === 'torus' && p.p[1] > 2.5)).toBe(true);
    // cabeça PEQUENA na beirada (o truque de escala da montanha): dodeca com
    // raio <= 0.3 acima de 3.0
    expect(parts.some((p) => p.g === 'dodeca' && p.p[1] > 3.0 && p.a[0] <= 0.3)).toBe(true);
    // braços de bloco (o rig arremessa) e ombros espigados
    expect(parts.filter((p) => p.tag === 'arm').length).toBe(2);
    expect(parts.filter((p) => p.tag === 'spike').length).toBe(2);
  });

  test('invólucro: pé largo de montanha cabe no tabuleiro e na altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.magma, 6));
    // pé do vulcão é largo (a assinatura da silhueta), mas cabe no tile
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(1.3);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.maxY).toBeLessThanOrEqual(formTop(MAGMA, 6) + 0.4);
  });

  test('materiais: basalto opaco/instanciado para a rocha, plasma quente p/ o núcleo', () => {
    const rock = makeStoneMaterial({
      rockA: '#42322e',
      rockB: '#140f10',
      crack: '#ff6a1f',
      amp: 0.075,
      crackGlow: 1.15,
      crackScale: 1.6,
      crackWidth: 0.03,
    });
    // rocha sólida como a do golem (peso/legibilidade no tabuleiro)
    expect(rock.transparent).toBe(false);
    expect(rock.depthWrite).toBe(true);
    for (const u of ['uCharge', 'uCrackGlow', 'uCrackScale', 'uCrackWidth', 'uCrackBoost', 'uHurt', 'uTeamColor']) {
      expect(rock.uniforms[u]).toBeDefined();
    }
    // corpo de montanha: os veios apertados (scale >1) e a faixa larga o
    // bastante para não serrar na encosta (o "esticado" do print)
    expect(rock.uniforms.uCrackScale.value).toBeGreaterThan(1);
    expect(rock.uniforms.uCrackWidth.value).toBeGreaterThanOrEqual(0.025);
    // o bloco-assinatura usa o MESMO shader (instância com aSeed por arremesso)
    expect(rock.vertexShader).toContain('USE_INSTANCING');
    expect(rock.vertexShader).toContain('aSeed');
    rock.dispose();

    // núcleo de lava da cratera: o plasma do Raio repaleta para a lava, na
    // leitura NÃO-aditiva do ajuste fino (sem blowout) com orla QUENTE
    const core = makeCoreMaterial({ gold: '#ff5a1f', white: '#ffd08a', cool: '#ffcf7a' });
    expect(core.blending).toBe(THREE.NormalBlending);
    expect(core.uniforms.uCool.value.getHexString()).toBe('ffcf7a');
    core.dispose();
  });

  test('motor: o bloco de lava chega com espécie/nível/origem no FX', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 42 });
    const mg = eng.addRetainedUnit('magma', LV, 0);
    expect(mg.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 8);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'magma');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('o Magma absorve o castigo de pedra e incinera os pedreiros', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 21 });
    const mg = eng.addRetainedUnit('magma', LV, 0);
    expect(mg.ok).toBe(true);
    const foeId = mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 10);
    const unit = eng.getUnit(mg.unitId!);
    // tanque Nv.6 com resist de terra: aguenta o matacão e o golem apanha/queima
    expect(unit?.alive).toBe(true);
    const enemy = eng.getUnit(foeId);
    expect(!enemy || !enemy.alive || enemy.hp < enemy.maxHp).toBe(true);
  });
});
