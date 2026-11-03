import { applyStatus } from '../game/combat/status';
import { DEFEAT_REWARD } from '../game/types';
import { getEngine, getSave, useGameStore } from '../store/gameStore';

/**
 * Regra anti-softlock: quem perde a partida com o tabuleiro zerado não pode
 * ficar sem exército e sem carteira — comprar 5 monstros na primeira rodada
 * (5×100) e perdê-los todos deixaria o jogador só com as +50 moedas da
 * recompensa de derrota: sem nenhuma criatura guardada e sem nem pagar a
 * invocação mais barata (100), o jogo não teria como recomeçar.
 *
 * A regra: se o jogador quiser continuar jogando, o time INTEIRO daquela
 * rodada volta (o mesmo restoredRoster da vitória — vivas e mortas em
 * combate; fundidos e vendidos seguem de fora), mas o prejuízo financeiro
 * fica: nenhuma moeda é devolvida além da recompensa padrão da derrota. Com
 * o time de volta, dá para trocar de dificuldade, vender criaturas na
 * lixeira (o valor delas vira moeda) e remontar a estratégia sem ser
 * severamente penalizado.
 *
 * Empate com sobreviventes mantém a regra antiga (só os vivos voltam); o
 * empate que zera o tabuleiro do jogador cai no mesmo resgate da derrota.
 */

function freshMatch(): void {
  localStorage.clear();
  useGameStore.getState().initFromSave(); // default: 500 moedas, time vazio, normal
  useGameStore.getState().startNewMatch();
}

function runUntilSummary(maxTicks = 20_000): void {
  const eng = getEngine();
  if (!eng) throw new Error('sem engine: chame freshMatch primeiro');
  let guard = 0;
  while (!eng.world.summary && guard++ < maxTicks) eng.update(1 / 30);
  expect(eng.world.summary).not.toBeNull();
}

describe('Time que volta na derrota (regra anti-softlock)', () => {
  test('tabuleiro zerado na primeira rodada: o time inteiro volta e o prejuizo fica', () => {
    freshMatch();
    const st = useGameStore.getState();
    for (let i = 0; i < 5; i++) st.summon('ignis');
    const eng = getEngine()!;
    expect(eng.world.playerCoins).toBe(0); // 5 convocações × 100

    eng.startBattle();
    // derrota garantida e sem sorteio: o inimigo acerta forte, o jogador não
    eng.aliveUnits('ai').forEach((u) => (u.damage = 999_999));
    eng.aliveUnits('player').forEach((u) => (u.damage = 0));
    runUntilSummary();
    expect(eng.world.summary!.result).toBe('defeat');

    // o time inteiro volta: 5 caíram em combate e as 5 voltam Nv.1
    expect(getSave().retainedRoster).toHaveLength(5);
    expect(
      getSave().retainedRoster.every((r) => r.species === 'ignis' && r.level === 1),
    ).toBe(true);
    expect(useGameStore.getState().retainedCount).toBe(5);

    // prejuizo financeiro fica: só a recompensa padrão de derrota entra,
    // as 500 moedas investidas na rodada não voltam
    expect(eng.world.summary!.reward).toBe(DEFEAT_REWARD);
    expect(eng.world.summary!.balanceAfter).toBe(DEFEAT_REWARD);
    expect(useGameStore.getState().coins).toBe(DEFEAT_REWARD);

    // o caminho de volta: nova partida com o time guardado de graça, vende-se
    // uma criatura na lixeira e o jogador volta a poder invocar (sem softlock)
    useGameStore.getState().startNewMatch();
    const eng2 = getEngine()!;
    expect(eng2.aliveUnits('player')).toHaveLength(5);
    const vendida = eng2.aliveUnits('player')[0].id;
    expect(eng2.sellUnit(vendida).ok).toBe(true); // +100 do valor dela
    expect(eng2.summon('player', 'ignis').ok).toBe(true); // voltou a jogar
  });

  test('derrota com sobreviventes: quem caiu em combate tambem volta', () => {
    freshMatch();
    const st = useGameStore.getState();
    st.summon('golem');
    st.summon('golem');
    const eng = getEngine()!;
    eng.startBattle();
    eng.aliveUnits('ai').forEach((u) => (u.damage = 0)); // ninguém morre a pancada
    eng.aliveUnits('player').forEach((u) => (u.damage = 0));

    // a queimadura mata UMA das duas (morte determinística, sem sorteio de alvo)
    const fallen = eng.aliveUnits('player')[0];
    const walker = eng.aliveUnits('player')[1];
    fallen.hp = 5;
    applyStatus(fallen, 'burn', 10, { dps: 100_000 });
    walker.hp = 200_000;
    walker.maxHp = 1_000_000; // meia-sangue: perde a comparação de vida no relógio
    eng.world.maxBattleTime = 2.5;
    runUntilSummary(Math.ceil(2.5 * 60));
    expect(eng.world.summary!.result).toBe('defeat'); // pf 0,2 < af ~1
    expect(fallen.alive).toBe(false); // cadáver já pode ter saído do byId; a referência vale

    // pela regra antiga só 1 voltaria; pela nova, os 2 (a sobrevivente + a que
    // queimou até morrer) — é isso que separa esta derrota do empate de resgate
    expect(getSave().retainedRoster).toHaveLength(2);
  });

  test('empate com sobreviventes: so os vivos voltam (regra antiga preservada)', () => {
    freshMatch();
    const st = useGameStore.getState();
    st.summon('zephyr'); // morre queimado antes do relógio: no empate com vivos, não volta
    st.summon('golem'); // chega inteiro no relógio: sobrevive
    const eng = getEngine()!;
    eng.startBattle();
    eng.aliveUnits('ai').forEach((u) => (u.damage = 0));
    eng.aliveUnits('player').forEach((u) => (u.damage = 0));

    const zephyr = eng.aliveUnits('player').find((u) => u.species === 'zephyr')!;
    zephyr.hp = 5;
    applyStatus(zephyr, 'burn', 10, { dps: 100_000 });
    eng.world.maxBattleTime = 2.5; // vida dos dois lados ~inteira: |pf-af| < 0,05
    runUntilSummary(Math.ceil(2.5 * 60));
    expect(eng.world.summary!.result).toBe('draw');
    expect(zephyr.alive).toBe(false); // idem: referência viva mesmo após o purge

    const roster = getSave().retainedRoster;
    expect(roster).toHaveLength(1);
    expect(roster).toContainEqual({ species: 'golem', level: 1 });
    expect(roster).not.toContainEqual({ species: 'zephyr', level: 1 });
  });
});
