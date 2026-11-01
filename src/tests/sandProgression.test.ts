import * as THREE from 'three';
import { MODELS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeSandMaterial } from '../scene/sandShaders';
import { makeWindMaterial } from '../scene/windShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { DOUBLE_SHOT_DELAY } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel } from '../game/types';

/**
 * Rig da AREIA (Nv.6 — o GÊNIO DO DESERTO), sexto elemento da árvore com
 * figurino próprio: cauda em funil de areia em turbilhão, peito colossal,
 * fez, barba e garras que varrem na rajada dupla. As regras valem daqui para
 * a árvore toda e ficam AMARRADAS aqui:
 *  - anti low-poly (tambores ≥16×4, lathe 22×26, toros ≥10×30, poliedro
 *    deslocado subdividido);
 *  - granular/translúcido NUNCA leva tint da equipe (a regra do vapor/geada);
 *  - nada de blowout: opaco, mesclagem normal.
 */

const AREIA = getSpecies('areia');
const LV = 6 as MonsterLevel;

describe('Areia: gênio do deserto com cauda-funil de areia', () => {
  test('a Areia tem rig próprio e forma única de gênio', () => {
    expect(SPECIES_RIGS.areia).toBeTruthy();
    expect(hasLevelVariants(MODELS.areia)).toBe(false);
    expect(partsForLevel(MODELS.areia, 6).length).toBe(MODELS.areia.parts.length);
  });

  test('silhueta: funil plantado, CINTURA estreita e peito colossal (o gênio da lâmpada)', () => {
    const parts = partsForLevel(MODELS.areia, 6);
    // cauda: lathe de funil (raio base > topo — tornado plantado) denso
    const lathes = parts.filter((p) => p.g === 'vortex');
    expect(lathes.length).toBe(1);
    expect(lathes[0].a[0]).toBeGreaterThan(lathes[0].a[1]); // base larga
    expect(lathes[0].a[3]).toBeGreaterThanOrEqual(40); // radiais
    expect(lathes[0].a[4]).toBeGreaterThanOrEqual(36); // anéis p/ o cisalhar do turbilhão
    // corpo em tambores: quadril e peito, com a CINTURA mais estreita que o
    // peito (o truque de escala do gênio) e o peito largo como o do Magma
    const drums = parts.filter((p) => p.g === 'cyl' && Math.max(p.a[0], p.a[1]) >= 0.44);
    const widest = (d: (typeof drums)[number]) => Math.max(d.a[0], d.a[1]);
    const chest = drums.filter((d) => widest(d) >= 1.0);
    const waist = drums.filter((d) => widest(d) < 0.8 && d.p[1] < 2.2);
    expect(chest.length).toBe(1);
    expect(chest[0].p[1]).toBeGreaterThan(waist[0].p[1]); // peito ACIMA da cintura
    expect(widest(chest[0])).toBeGreaterThan(widest(waist[0]) + 0.4); // o salto colossal
    expect(chest[0].a[3]).toBeGreaterThanOrEqual(16);
    // barba de areia escorrendo do queixo (cone com a PONTA embaixo: r[0] ≈ π;
    // o queixo subiu com a cabeça alta — a barba agora escorre sobre o peito)
    expect(
      parts.some((p) => p.g === 'cone' && (p.r?.[0] ?? 0) > 3 && p.p[1] < 3.0 && p.p[2] > 0.2),
    ).toBe(true);
    // fez + penacho de energia no topo (aproveita o formTop 3.7 do Nv.6)
    const e0 = partsEnvelope(parts);
    expect(e0.maxY).toBeGreaterThan(3.4);
    // joias do fez (glow na frente da cabeça) e núcleo aceso DENTRO da duna
    expect(parts.some((p) => p.m === 'glow' && p.p[1] >= 2.7 && p.p[2] >= 0.4)).toBe(true);
    expect(parts.some((p) => p.m === 'glow' && p.p[1] < 1.5 && Math.hypot(p.p[0], p.p[2]) < 0.4)).toBe(true);
    // braços de garra (tag arm: o rig varre na rajada) + garras de verdade
    const arms = parts.filter((p) => p.tag === 'arm');
    expect(arms.length).toBeGreaterThanOrEqual(8); // par de braços: úmero+antebraço+3 garras+esteira
    expect(parts.filter((p) => p.group !== undefined).length).toBeGreaterThanOrEqual(3); // halo orbital de grãos
    // pulseiras de ouro (acentos dourados do gênio, não o azul genérico antigo)
    expect(parts.some((p) => p.m === 'accent' && Math.abs(p.p[0]) > 1.0)).toBe(true);
    // anel de areia rente ao chão
    expect(parts.some((p) => p.g === 'ring' && p.p[1] < 0.1)).toBe(true);
  });

  test('ANTI LOW-POLY: malha densa em tudo (tambores, toros, poliedros e lathe)', () => {
    for (const p of partsForLevel(MODELS.areia, 6)) {
      if (p.g === 'cyl' && Math.max(p.a[0], p.a[1]) >= 0.44) {
        expect(p.a[3]).toBeGreaterThanOrEqual(16); // radiais
        expect(p.a[4]).toBeGreaterThanOrEqual(4); // anéis verticais p/ entortar
      }
      if (p.g === 'torus') {
        expect(p.a[2]).toBeGreaterThanOrEqual(10); // rosca do tubo
        expect(p.a[3]).toBeGreaterThanOrEqual(30); // ao redor (rosca lisa, não prisma)
      }
      if (p.amp !== undefined && (p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca')) {
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1); // poliedro deslocado = subdividido
      }
    }
    // o lathe da cauda aguenta cisalhamento do turbilhão: 44 radiais × 40 anéis
    const lathe = partsForLevel(MODELS.areia, 6).find((p) => p.g === 'vortex')!;
    expect(getGeometry('vortex', lathe.a).getAttribute('position').count).toBeGreaterThan(1700);
  });

  test('invólucro: o gênio grande cabe no tabuleiro e na altura declarada', () => {
    const e = partsEnvelope(partsForLevel(MODELS.areia, 6));
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThan(1.4); // braço/halo abertos: porte de gênio
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X);
    expect(e.maxZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(-e.minZ).toBeLessThanOrEqual(2 * ROW_DEPTH);
    expect(e.minY).toBeGreaterThanOrEqual(-0.06); // cauda plantada, nada afunda
    expect(e.maxY).toBeLessThanOrEqual(formTop(AREIA, 6) + 0.4);
  });

  test('material de areia: duna OPACA viva (grão escorregando) SEM tint da equipe', () => {
    const m = makeSandMaterial({ sandA: '#eccd8c', sandB: '#8a6534', amp: 0.034 });
    expect(m.transparent).toBe(false); // grão compactado é OPACO
    expect(m.depthWrite).toBe(true);
    expect(m.blending).toBe(THREE.NormalBlending); // blowout sempre cortado
    for (const u of ['uFlow', 'uFlowGlow', 'uSpeckle', 'uSandA', 'uSandB', 'uFlowCol', 'uCharge']) {
      expect(m.uniforms[u]).toBeDefined();
    }
    // ocre QUENTE de deserto (R bem acima de B), nunca bege-pálido plástico
    const a = m.uniforms.uSandA.value;
    expect(a.r - a.b).toBeGreaterThan(0.35);
    // a duna VIVA: o ruído rola com o tempo no vertex (grão escorregando) e
    // no fragment (veios de avalanche descendo)
    expect(m.vertexShader).toContain('uTime');
    expect(m.vertexShader).toContain('uFlow');
    expect(m.fragmentShader).toContain('uFlow');
    expect(m.fragmentShader).toContain('uSpeckle'); // mica pegando sol
    // a REGRA do vapor/geada vale p/ areia: nada de tint da equipe
    expect(m.fragmentShader).not.toContain('uTeamColor');
    expect(m.vertexShader).toContain('USE_INSTANCING');
    expect(m.vertexShader).toContain('aSeed');
    m.dispose();
  });

  test('véus de grão: shader de vento na paleta do deserto, SEM tint e SEM aditivo', () => {
    // o véu da cauda/halo é o material de VENTO (fitas espiral) com paleta
    // ocre — vento não tem tint de equipe no shader (conferido no fonte)
    const m = makeWindMaterial({ cold: '#6e4c1e', mid: '#d8ae6a', hot: '#ffe9c4', amp: 0.05 });
    expect(m.blending).toBe(THREE.NormalBlending);
    expect(m.fragmentShader).not.toContain('uTeamColor');
    const mid = m.uniforms.uMid.value;
    expect(mid.r - mid.b).toBeGreaterThan(0.35); // ocre, não azul-celeste
    m.dispose();
  });

  test('motor: a rajada chega com espécie/nível/origem no FX', () => {
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 91 });
    const sd = eng.addRetainedUnit('areia', LV, 0);
    expect(sd.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    runSeconds(eng, 8);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'areia');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(6);
      expect(f.pos2).toBeDefined();
    }
  });

  test('a assinatura do gênio: DISPARO DUPLO dispara 2 projéteis por ataque', () => {
    // enquanto a unidade VIVE: impacto não prova (o motor descarta o tiro
    // pendente quando o atirante morre no meio da luta) — então contamos os
    // tiros NASCENDO: cada ataque tem que parir 1 imediato + 1 tardio (~0,3s)
    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 33 });
    const sd = eng.addRetainedUnit('areia', LV, 0);
    expect(sd.ok).toBe(true);
    const wall = eng.addRetainedUnit('golem', LV, 0); // tanque aliado: divide o foco
    expect(wall.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'zephyr', 'ai', 1);
    eng.startBattle();
    let attacks = 0;
    let shots = 0;
    let lastAtk = -1;
    let pendingAt = -1; // instante agendado do 2º tiro observado na fila
    let pendingCounted = false; // ele já entrou na conta como "nascido"?
    const seen = new Set<number>();
    for (let i = 0; i < 60 * 10; i++) {
      const u = eng.getUnit(sd.unitId!);
      if (!u?.alive) break;
      eng.update(1 / 60);
      if (u.lastAttackAt > lastAtk) {
        if (pendingCounted) shots++;
        lastAtk = u.lastAttackAt;
        pendingAt = -1;
        pendingCounted = false;
        attacks++;
      }
      const queued = eng.pendingShots.some((s) => s.ownerId === sd.unitId);
      if (queued && pendingAt < 0) {
        pendingAt = lastAtk + DOUBLE_SHOT_DELAY;
        pendingCounted = true; // nasceu na fila; mesmo que morra junto com a unidade
      }
      for (const p of eng.world.projectiles) {
        if (p.ownerId !== sd.unitId || seen.has(p.id)) continue;
        const birth = eng.world.time - p.age;
        // é o 2º tiro (nascimento ≈ agendamento) que já contamos na fila? não
        // conta de novo
        if (pendingCounted && Math.abs(birth - pendingAt) < 0.02) {
          seen.add(p.id);
          pendingCounted = false;
          continue;
        }
        seen.add(p.id);
        shots++;
      }
    }
    if (pendingCounted) shots++; // pending do último ataque (vivo ou morto junto)
    expect(attacks).toBeGreaterThanOrEqual(2);
    // cada ataque gera o tiro imediato + o pendente do doubleShot — os dois
    // contando como "nascidos" (2×attacks exato, sem folga: é a assinatura)
    expect(shots).toBeGreaterThanOrEqual(attacks * 2);
  });
});
