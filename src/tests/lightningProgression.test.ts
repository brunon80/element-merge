import * as THREE from 'three';
import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  makeArcMaterial,
  makeCoreMaterial,
  makeLightningShellMaterial,
} from '../scene/lightningShaders';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig elétrico do Raio (Nv.6 — primeiro elemento da árvore com shader
 * próprio). Os shaders constroem em jsdom (sem WebGL), o invólucro do modelo
 * amarra o tamanho ao tabuleiro, e o motor entrega os novos campos de FX
 * (espécie no respingo de corrente, origem do projétil no impacto) para a
 * camada visual desenhar o raio que chega e se dispersa.
 */

const RAIO = getSpecies('raio');
const LV = 6 as MonsterLevel;

describe('Raio: rig elétrico próprio da árvore', () => {
  test('o Raio tem rig de shader próprio e forma única de trovoada', () => {
    expect(SPECIES_RIGS.raio).toBeTruthy();
    // espécie da árvore: uma forma só (Nv.6), mas alta como o modelo declara
    expect(hasLevelVariants(MODELS.raio)).toBe(false);
    expect(hasForms(RAIO)).toBe(false);
    expect(formTop(RAIO, 6)).toBeCloseTo(3.8);
    // anéis orbitais que o rig faz girar com o material de arco
    expect(MODELS.raio.groups).toBeTruthy();
    expect(partsForLevel(MODELS.raio, 6).some((p) => p.g === 'torus' && p.group === 0)).toBe(true);
    // assinatura de dados: corrente com respingo e projétil dourado
    expect(RAIO.base.projectileColor).toBe('#ffe14d');
    expect(RAIO.base.abilities.some((a) => a.kind === 'chain')).toBe(true);
  });

  test('o modelo tem corpo, núcleo, anéis e faíscas — tudo com caixa válida', () => {
    const parts = partsForLevel(MODELS.raio, 6);
    const roles = new Set(parts.map((p) => p.m));
    for (const r of roles) {
      expect(['body', 'dark', 'glow', 'accent', 'white', 'black', 'trans', 'steam']).toContain(r);
    }
    // cada peça contribui com uma caixa válida (geometria sem args quebrados)
    for (const p of parts) {
      const e = partsEnvelope([p]);
      expect(e.maxY).toBeGreaterThan(e.minY);
      expect(e.maxX).toBeGreaterThanOrEqual(e.minX);
    }
    expect(parts.length).toBeGreaterThanOrEqual(10);
  });

  test('o invólucro do espírito da trovoada cabe no slot e casa com a altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.raio, 6));
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06);
    expect(e.maxY).toBeLessThanOrEqual(formTop(RAIO, 6) + 0.4);
    // anéis largos: a largura dos arcos orbitais é quase metade da altura
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(0.55);
  });

  test('os três materiais elétricos constroem com o figurino dos puros', () => {
    const shell = makeLightningShellMaterial({
      body: '#ffd23f',
      dark: '#7a5c12',
      vein: '#ffe14d',
      core: '#ffcf4d',
      amp: 0.028,
      coreCut: 0.63,
    });
    // corpo OPACO com luz fake da arena (legível de longe no tabuleiro)
    expect(shell.transparent).toBe(false);
    expect(shell.depthWrite).toBe(true);
    for (const u of ['uCharge', 'uHurt', 'uCoreCut', 'uTeamColor', 'uKeyDir']) {
      expect(shell.uniforms[u]).toBeDefined();
    }

    const arc = makeArcMaterial({ gold: '#ffb31f', white: '#fff3b0', jitter: 1, dash: 20, flow: 6 });
    expect(arc.blending).toBe(THREE.AdditiveBlending);
    expect(arc.depthWrite).toBe(false);
    expect(arc.uniforms.uDash.value).toBe(20);
    expect(arc.uniforms.uFlow.value).toBe(6);

    const core = makeCoreMaterial({ gold: '#ffcf4d', white: '#fff8d6' });
    expect(core.blending).toBe(THREE.AdditiveBlending);
    expect(core.transparent).toBe(true);

    // os materiais de arco/plasma aceitam aSeed (o projétil instanciado usa
    // os MESMOS materiais da criatura — igual bola de fogo e matacão)
    for (const m of [shell, arc, core]) {
      expect(m.vertexShader).toContain('USE_INSTANCING');
      expect(m.vertexShader).toContain('aSeed');
      m.dispose();
    }
  });
});

describe('Raio: motor entrega a assinatura da corrente', () => {
  const summonRaioVsGolems = () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 77 });
    const raio = eng.addRetainedUnit('raio', LV, 0);
    expect(raio.ok).toBe(true);
    const targets = [0, 1, 2].map((t) => mustSummon(eng, 'golem', 'ai', t));
    eng.startBattle();
    return { eng, raio: raio.unitId!, targets };
  };

  test('a corrente sai do peito do espírito da trovoada (muro alto da forma Nv.6)', () => {
    const { eng, raio } = summonRaioVsGolems();
    let shotY = -1;
    for (let i = 0; i < 60 * 10 && shotY < 0; i++) {
      eng.update(1 / 60);
      const pr = eng.world.projectiles.find((p) => p.ownerId === raio);
      if (pr) shotY = pr.pos[1];
    }
    expect(shotY).toBeGreaterThan(0.9);
    const golem = makeEngine({ playerCoins: 500, aiCoins: 500, seed: 77 });
    const rock = mustSummon(golem, 'golem', 'player');
    mustSummon(golem, 'nereia', 'ai', 5);
    golem.startBattle();
    let lowY = -1;
    for (let i = 0; i < 60 * 10 && lowY < 0; i++) {
      golem.update(1 / 60);
      const pr = golem.world.projectiles.find((p) => p.ownerId === rock);
      if (pr) lowY = pr.pos[1];
    }
    expect(lowY).toBeGreaterThan(-1);
    if (lowY >= 0) expect(shotY - lowY).toBeGreaterThan(0.2);
  });

  test('impacto da corrente carrega espécie/nível e a origem do traço', () => {
    const { eng, targets } = summonRaioVsGolems();
    expect(targets).toHaveLength(3);
    runSeconds(eng, 6);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'raio');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('o respingo da corrente carrega a espécie (arco dourado na cena)', () => {
    const { eng } = summonRaioVsGolems();
    let chains = eng.world.fx.filter((f) => f.type === 'chain');
    for (let i = 0; i < 60 * 10 && chains.length === 0; i++) {
      eng.update(1 / 60);
      chains = eng.world.fx.filter((f) => f.type === 'chain');
    }
    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0].species).toBe('raio');
    expect(chains[0].level).toBe(6);
    // o salto tem origem e destino distintos
    expect(chains[0].pos2).toBeDefined();
  });
});
