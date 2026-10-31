import type { GameEngine } from '../game/engine/engine';
import { EVOLUTION_RECIPES, recipeOf } from '../data/fusionRecipes';
import { TREE_SPECIES_IDS, getSpecies } from '../data/monsters';
import { checkFusion } from '../game/fusion/fusionRules';
import { MAX_LEVEL, type MonsterLevel, type SpeciesId } from '../game/types';
import { autoGrow, makeEngine, mustMerge, mustSummon, snapshotUnits } from './helpers';

/**
 * Monta (pelas regras, sem injeção) uma unidade da espécie no nível dado,
 * recursivamente: puros sobem por fusão vertical; espécies da árvore usam
 * exatamente a sua receita. Ocupa no máximo ~9 slots em qualquer momento
 * (profundidade da árvore), cabe nos 12 do tabuleiro.
 */
function growTo(eng: GameEngine, species: SpeciesId, level: MonsterLevel): number {
  if (level === 1) return mustSummon(eng, species);
  const def = getSpecies(species);
  if (def.levelMin === def.levelMax) {
    if (level !== def.levelMin) throw new Error(`${species} só existe no Nv.${def.levelMin}`);
    const r = recipeOf(species);
    if (!r) throw new Error(`${species} não tem receita`);
    const a = growTo(eng, r.a, (level - 1) as MonsterLevel);
    const b = growTo(eng, r.b, (level - 1) as MonsterLevel);
    return mustMerge(eng, a, b)[0];
  }
  const a = growTo(eng, species, (level - 1) as MonsterLevel);
  const b = growTo(eng, species, (level - 1) as MonsterLevel);
  return mustMerge(eng, a, b)[0];
}

/**
 * Testes obrigatórios de fusão da ÁRVORE ELEMENTAL (documento de design §14.1).
 * Regra central: duas criaturas do MESMO nível → exatamente uma do próximo;
  * a ordem dos ingredientes nunca muda o resultado; fusões inválidas não
 * consomem nada; fusões são gratuitas; não existe fusão acima do Nv.10;
 * fusões entre espécies DIFERENTES só a partir do Nv.5.
 */

describe('Regras de fusão vertical (puras, 2→1)', () => {
  test('1) dois monstros Nv.1 geram exatamente um monstro Nv.2', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    const a = mustSummon(eng, 'ignis');
    const b = mustSummon(eng, 'ignis');
    expect(eng.aliveCount('player')).toBe(2);

    const res = eng.tryMerge(a, b);
    expect(res.ok).toBe(true);
    expect(res.outcome).toEqual({ kind: 'vertical', species: 'ignis', level: 2, outputCount: 1 });

    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1); // exatamente uma unidade
    expect(alive[0].level).toBe(2);
    expect(alive[0].species).toBe('ignis');
    expect(eng.getUnit(a)).toBeUndefined();
    expect(eng.getUnit(b)).toBeUndefined();
  });

  test('2) dois monstros Nv.2 geram exatamente um monstro Nv.3', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    const [c] = mustMerge(eng, mustSummon(eng, 'nereia'), mustSummon(eng, 'nereia'));
    const [d] = mustMerge(eng, mustSummon(eng, 'nereia'), mustSummon(eng, 'nereia'));
    expect(eng.getUnit(c)!.level).toBe(2);
    expect(eng.getUnit(d)!.level).toBe(2);

    const res = eng.tryMerge(c, d);
    expect(res.ok).toBe(true);
    expect(res.outcome!.outputCount).toBe(1);
    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1);
    expect(alive[0].level).toBe(3);
    expect(alive[0].species).toBe('nereia');
  });

  test('3) dois monstros Nv.3 geram exatamente um monstro Nv.4', () => {
    const eng = makeEngine({ playerCoins: 5000 });
    const l2: number[] = [];
    for (let i = 0; i < 4; i++) {
      l2.push(mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0]);
    }
    const l3a = mustMerge(eng, l2[0], l2[1])[0];
    const l3b = mustMerge(eng, l2[2], l2[3])[0];

    const res = eng.tryMerge(l3a, l3b);
    expect(res.ok).toBe(true);
    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1);
    expect(alive[0].level).toBe(4);
  });

  test('4) dois monstros Nv.4 geram exatamente um monstro Nv.5', () => {
    const eng = makeEngine({ playerCoins: 100000 });
    const byLevel = autoGrow(eng, 'golem', 16, 'player', 3);
    expect(byLevel.get(4)!.length).toBe(2);
    expect(byLevel.get(5)!.length).toBe(0);

    const res = eng.tryMerge(byLevel.get(4)![0], byLevel.get(4)![1]);
    expect(res.ok).toBe(true);
    const l5 = eng.aliveUnits('player').filter((u) => u.level === 5);
    expect(l5).toHaveLength(1); // exatamente um
    expect(l5[0].species).toBe('golem');
  });

  test('5) puros Nv.5 não fundem mais entre si (e nada é consumido)', () => {
    const eng = makeEngine({ playerCoins: 100000 });
    const byLevel = autoGrow(eng, 'ignis', 32);
    const l5a = byLevel.get(5)![0];
    const l5b = byLevel.get(5)![1];
    expect(l5a).toBeDefined();
    expect(l5b).toBeDefined();

    const before = snapshotUnits(eng);
    const res = eng.tryMerge(l5a, l5b);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('MAX_LEVEL');
    expect(snapshotUnits(eng)).toEqual(before);
  });

  test('6) monstros de níveis diferentes não podem ser fundidos', () => {
    const eng = makeEngine({ playerCoins: 2000 });
    const a = mustSummon(eng, 'ignis');
    const a2 = mustSummon(eng, 'ignis');
    const [c] = mustMerge(eng, a, a2); // Nv.2 vivo
    const d = mustSummon(eng, 'ignis'); // Nv.1 vivo

    const before = snapshotUnits(eng);
    const res = eng.tryMerge(c, d);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('DIFFERENT_LEVEL');
    expect(snapshotUnits(eng)).toEqual(before);

    const e = mustSummon(eng, 'golem');
    const res2 = eng.tryMerge(e, c);
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe('DIFFERENT_LEVEL');
  });

  test('7) puras DIFERENTES abaixo do Nv.5 não fundem (regra nova da árvore)', () => {
    // a regra antiga "dois Nv.1 de elementos diferentes → híbrido Nv.1" NÃO existe mais
    const eng = makeEngine({ playerCoins: 2000 });
    const fire2 = [
      mustMerge(eng, mustSummon(eng, 'ignis'), mustSummon(eng, 'ignis'))[0],
      mustMerge(eng, mustSummon(eng, 'ignis'), mustSummon(eng, 'ignis'))[0],
    ];
    const earth2 = [
      mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0],
      mustMerge(eng, mustSummon(eng, 'golem'), mustSummon(eng, 'golem'))[0],
    ];
    const before = snapshotUnits(eng);

    expect(eng.tryMerge(fire2[0], earth2[0]).reason).toBe('MIN_LEVEL');
    expect(eng.tryMerge(fire2[1], earth2[1]).reason).toBe('MIN_LEVEL');
    expect(snapshotUnits(eng)).toEqual(before);

    // Nv.1 puros de elementos diferentes: também bloqueado por nível
    expect(checkFusion('ignis', 1, 'golem', 1)).toEqual({ ok: false, reason: 'MIN_LEVEL' });
    expect(checkFusion('nereia', 3, 'zephyr', 3)).toEqual({ ok: false, reason: 'MIN_LEVEL' });
    // Nv.4 (ainda abaixo do Nv.5)
    expect(checkFusion('ignis', 4, 'nereia', 4)).toEqual({ ok: false, reason: 'MIN_LEVEL' });
    // checagem pura da regra em Nv.3
    expect(checkFusion('ignis', 3, 'golem', 3)).toEqual({ ok: false, reason: 'MIN_LEVEL' });
  });

  test('8) fusão inválida não altera o estado do jogo', () => {
    const eng = makeEngine({ playerCoins: 1500 });
    const a = mustSummon(eng, 'zephyr');
    const aiUnit = mustSummon(eng, 'zephyr', 'ai');
    mustSummon(eng, 'golem');
    const coinsBefore = eng.world.playerCoins;
    const aiCoinsBefore = eng.world.aiCoins;
    const before = snapshotUnits(eng);

    const self = eng.tryMerge(a, a);
    expect(self.ok).toBe(false);
    expect(self.reason).toBe('SAME_UNIT');

    const cross = eng.tryMerge(a, aiUnit);
    expect(cross.ok).toBe(false);
    expect(cross.reason).toBe('DIFFERENT_SIDE');

    expect(snapshotUnits(eng)).toEqual(before);
    expect(eng.world.playerCoins).toBe(coinsBefore);
    expect(eng.world.aiCoins).toBe(aiCoinsBefore);
  });

  test('9) fusão não consome nem duplica unidades', () => {
    const eng = makeEngine({ playerCoins: 5000 });
    const ids = [
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
      mustSummon(eng, 'golem'),
    ];
    const beforeTotal = eng.world.units.length; // 4

    const [out1] = mustMerge(eng, ids[0], ids[1]);
    expect(eng.world.units.length).toBe(beforeTotal - 1); // -2 +1
    const [out2] = mustMerge(eng, ids[2], ids[3]);
    expect(eng.world.units.length).toBe(beforeTotal - 2);

    const again = eng.tryMerge(ids[0], ids[1]);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('UNIT_GONE');
    expect(eng.world.units.length).toBe(beforeTotal - 2);

    const allIds = eng.world.units.map((u) => u.id);
    expect(new Set(allIds).size).toBe(allIds.length);

    const l3 = mustMerge(eng, out1, out2);
    expect(l3).toHaveLength(1);
    const unitsAfter = eng.aliveUnits('player');
    expect(unitsAfter).toHaveLength(1);
    expect(unitsAfter[0].level).toBe(3);
  });
});

describe('Receitas da árvore elemental (Nv.6–10)', () => {
  test('a árvore tem exatamente 19 receitas e cobre todas as espécies da árvore', () => {
    expect(EVOLUTION_RECIPES).toHaveLength(19);
    for (const id of TREE_SPECIES_IDS) {
      expect(recipeOf(id), `${id} tem receita`).not.toBeNull();
    }
    // nenhuma receita produz espécie de nível errado
    for (const r of EVOLUTION_RECIPES) {
      const inLevel = getSpecies(r.a).levelMax; // puros: Nv.5; árvore: nível fixo
      const def = getSpecies(r.result);
      expect(def.levelMin).toBe(inLevel + 1);
      expect(getSpecies(r.b).levelMax).toBe(inLevel);
    }
  });

  test('TODA receita funciona nos DOIS pedidos (ordem irrelevante) e gera 1 do próximo nível', () => {
    for (const r of EVOLUTION_RECIPES) {
      const inLevel = (getSpecies(r.result).levelMin - 1) as MonsterLevel;
      const c1 = checkFusion(r.a, inLevel, r.b, inLevel);
      const c2 = checkFusion(r.b, inLevel, r.a, inLevel);
      expect(c1.ok, `${r.a}+${r.b}@${inLevel}`).toBe(true);
      expect(c2.ok, `${r.b}+${r.a}@${inLevel}`).toBe(true);
      if (c1.ok && c2.ok) {
        expect(c1.outcome).toEqual(c2.outcome);
        expect(c1.outcome.species).toBe(r.result);
        expect(c1.outcome.level).toBe(inLevel + 1);
        expect(c1.outcome.outputCount).toBe(1);
      }
    }
  });

  test('motor executa receitas Nv.6 (puras Nv.5) de verdade, consumindo exatamente 2', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    for (const r of EVOLUTION_RECIPES.slice(0, 6)) {
      const [a, b] = r.a === r.b ? [r.a, r.a] : [r.a, r.b];
      const ia = eng.addRetainedUnit(a, 5);
      const ib = eng.addRetainedUnit(b, 5);
      expect(ia.ok).toBe(true);
      expect(ib.ok).toBe(true);
      const total = eng.world.units.length;
      const res = eng.tryMerge(ia.unitId!, ib.unitId!);
      expect(res.ok, `${a}+${b}`).toBe(true);
      expect(res.createdIds).toHaveLength(1); // exatamente uma saída
      expect(eng.world.units.length).toBe(total - 1); // -2 +1
      const unit = eng.getUnit(res.createdIds![0])!;
      expect(unit.species).toBe(r.result);
      expect(unit.level).toBe(getSpecies(r.result).levelMin);
      expect(eng.world.playerCoins).toBe(1000); // fusões são gratuitas
    }
  });

  test('motor executa receitas Nv.7–Nv.10 (inclusive o Primordial)', () => {
    const eng = makeEngine({ playerCoins: 1000 });
    for (const r of EVOLUTION_RECIPES.slice(6)) {
      const inLevel = (getSpecies(r.result).levelMin - 1) as MonsterLevel;
      const ia = eng.addRetainedUnit(r.a, inLevel);
      const ib = eng.addRetainedUnit(r.b, inLevel);
      expect(ia.ok, `${r.a}@${inLevel}`).toBe(true);
      expect(ib.ok, `${r.b}@${inLevel}`).toBe(true);
      const coinsBefore = eng.world.playerCoins;
      const res = eng.tryMerge(ia.unitId!, ib.unitId!);
      expect(res.ok, `${r.a}+${r.b}`).toBe(true);
      const unit = eng.getUnit(res.createdIds![0])!;
      expect(unit.species).toBe(r.result);
      expect(unit.level).toBe(inLevel + 1);
      expect(eng.world.playerCoins).toBe(coinsBefore); // fusão é grátis
      // limpa o slot: a próxima receita precisa de espaço no tabuleiro
      eng.sellUnit(res.createdIds![0]);
    }
    // o Primordial nasceu e gerou o FX épico
    const primordialFx = eng.world.fx.filter((f) => f.type === 'primordial');
    expect(primordialFx).toHaveLength(1);
    expect(primordialFx[0].species).toBe('primordial');
    expect(primordialFx[0].level).toBe(10);
  });

  test('receita exige os ingredientes NO NÍVEL EXATO (Nv.6 ≠ Nv.7)', () => {
    // gelo+raio fazem Tempestade no Nv.6...
    expect(checkFusion('gelo', 6, 'raio', 6).ok).toBe(true);
    // ...mas NÃO funcionam no Nv.7 (e espécies da árvore não existem lá)
    expect(checkFusion('gelo', 7, 'raio', 7)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    // puros Nv.6+ não existem
    expect(checkFusion('ignis', 6, 'golem', 6)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    expect(checkFusion('ignis', 10, 'golem', 10)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
  });

  test('pares sem receita são recusados mesmo a partir do Nv.5', () => {
    // ignis + gelo não é par de receita (gelo é Nv.6; ignis só existe até Nv.5)
    expect(checkFusion('magma', 6, 'gelo', 6)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    expect(checkFusion('raio', 6, 'vapor', 6)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    expect(checkFusion('tempestade', 7, 'pantano', 7)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    // espécies de níveis diferentes de árvore (nunca coexistem no mesmo nível)
    expect(checkFusion('magma', 6, 'tempestade', 6)).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
  });

  test('espécie da árvore jamais funde com a própria espécie', () => {
    for (const id of TREE_SPECIES_IDS) {
      const lv = getSpecies(id).levelMin as MonsterLevel;
      expect(checkFusion(id, lv, id, lv), id).toEqual({ ok: false, reason: 'INCOMPATIBLE_SPECIES' });
    }
  });

  test('não existe fusão acima do Nv.10 (Nv.10+Nv.10 recusado)', () => {
    expect(MAX_LEVEL).toBe(10);
    const eng = makeEngine({ playerCoins: 500 });
    const a = eng.addRetainedUnit('primordial', 10);
    const b = eng.addRetainedUnit('primordial', 10);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const before = snapshotUnits(eng);
    const res = eng.tryMerge(a.unitId!, b.unitId!);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INCOMPATIBLE_SPECIES'); // mesma espécie da árvore: sem vertical, sem receita
    expect(snapshotUnits(eng)).toEqual(before);
    // e mesmo para um par hipotético Nv.10+Nv.10 de espécies diferentes: MAX_LEVEL
    expect(checkFusion('primordial' as SpeciesId, 10, 'primordial' as SpeciesId, 9)).toEqual({
      ok: false,
      reason: 'DIFFERENT_LEVEL',
    });
  });

  test('invocação direta de espécie da árvore é bloqueada (só nasce por fusão)', () => {
    const eng = makeEngine({ playerCoins: 50000 });
    for (const id of TREE_SPECIES_IDS) {
      const res = eng.summon('player', id, 0);
      expect(res.ok, id).toBe(false);
    }
    // só puros Nv.1 podem ser invocados
    expect(eng.summon('player', 'ignis', 0).ok).toBe(true);
  });

  test('motor recita receitas em série na ordem da árvore sem estado inválido', () => {
    // cada passo consome exatamente as duas unidades pedidas e nada mais
    const eng = makeEngine({ playerCoins: 100 });
    const magma = eng.tryMerge(
      eng.addRetainedUnit('golem', 5).unitId!,
      eng.addRetainedUnit('ignis', 5).unitId!,
    ).createdIds![0];
    const raio = eng.tryMerge(
      eng.addRetainedUnit('ignis', 5).unitId!,
      eng.addRetainedUnit('zephyr', 5).unitId!,
    ).createdIds![0];
    // plasma (Nv.7) usa exatamente as duas criaturas criadas acima
    const res = eng.tryMerge(magma, raio);
    expect(res.ok).toBe(true);
    expect(eng.aliveUnits('player')).toHaveLength(1); // plasma sobrou sozinho
    expect(eng.getUnit(res.createdIds![0])!.level).toBe(7);
    expect(eng.getUnit(res.createdIds![0])!.species).toBe('plasma');
  });
});

describe('Cadeia completa Nv.1 → Nv.10 (512 sementes, tudo pelas regras)', () => {
  test('montar o Primordial apenas invocando e fundindo, sem burlar regra nenhuma', () => {
    const eng = makeEngine({ playerCoins: 512 * 100, seed: 7777 });

    // caminho 100% legal: só summon (100 moedas) e tryMerge (2→1) — a mesma
    // recursão das receitas da árvore, do Primordial até as 512 sementes Nv.1.
    const topId = growTo(eng, 'primordial', 10);

    const top = eng.getUnit(topId)!;
    expect(top.species).toBe('primordial');
    expect(top.level).toBe(10);
    const alive = eng.aliveUnits('player');
    expect(alive).toHaveLength(1); // tudo foi consumido na coroa da árvore

    // todas as 512 sementes foram pagas (100 moedas cada) — nada de graça
    expect(eng.world.playerCoins).toBe(0);
    // evento épico do primordial emitido exatamente uma vez
    expect(eng.world.fx.filter((f) => f.type === 'primordial')).toHaveLength(1);
    // e o motor recusaria qualquer fusão acima daqui
    expect(MAX_LEVEL).toBe(10);
  });
});

describe('Paridade regra × motor', () => {
  test('motor aceita exatamente o que checkFusion aceita (amostras de todos os níveis)', () => {
    const eng = makeEngine({ playerCoins: 100000 });
    const samples: [SpeciesId, MonsterLevel][] = [
      ['ignis', 1],
      ['ignis', 4],
      ['ignis', 5],
      ['golem', 5],
      ['nereia', 5],
      ['magma', 6],
      ['raio', 6],
      ['tempestade', 7],
      ['plasma', 7],
      ['cosmico', 8],
      ['abissal', 8],
      ['astral', 9],
      ['colosso', 9],
      ['primordial', 10],
    ];
    for (const [a, la] of samples) {
      for (const [b, lb] of samples) {
        const check = checkFusion(a, la, b, lb);
        const ia = eng.addRetainedUnit(a, la);
        const ib = eng.addRetainedUnit(b, lb);
        if (!ia.ok || !ib.ok) continue; // tabuleiro cheio: amostra pulada
        const res = eng.tryMerge(ia.unitId!, ib.unitId!);
        expect(res.ok, `${a}@${la} + ${b}@${lb}`).toBe(check.ok);
        if (check.ok && res.ok) {
          expect(res.outcome!.species).toBe(check.outcome.species);
          expect(res.outcome!.level).toBe(check.outcome.level);
          expect(res.createdIds).toHaveLength(1);
        }
      }
    }
  });
});
