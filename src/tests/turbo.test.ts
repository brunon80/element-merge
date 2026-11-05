// ⏩ Turbo de combate (05/nov/2026): a cadência da troca de ataques acelera 3×
// com o cooldown drenando mais rápido, preservando a cadência relativa de cada
// monstro (intervalo 2 s → 0,6 s; 3 s → 1 s). Pinos no motor, na store e nos
// arquivos da feature.
import { getEngine, useGameStore } from '../store/gameStore';
import { makeEngine, mustSummon } from './helpers';
import type { GameEngine } from '../game/engine/engine';
import EngineSource from '../game/engine/engine.ts?raw';
import TurboFabSource from '../components/TurboFab.tsx?raw';
import AppSource from '../app/App.tsx?raw';

const DT = 1 / 60;

function armUnit(eng: GameEngine, id: number, interval: number): void {
  const u = eng.getUnit(id)!;
  u.interval = interval;
  u.reload = interval;
  u.cooldown = interval;
  u.hp = 1_000_000;
  u.maxHp = 1_000_000; // ninguém morre durante a medição de cadência
}

/** Registra o instante (world.time) de cada tiro de cada unidade monitorada. */
function attackTimes(
  eng: GameEngine,
  unitIds: number[],
  seconds: number,
  dt = DT,
): Map<number, number[]> {
  const out = new Map(unitIds.map((id) => [id, [] as number[]]));
  const last = new Map(unitIds.map((id) => [id, -10]));
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    eng.update(dt);
    for (const id of unitIds) {
      const u = eng.getUnit(id);
      if (u && u.lastAttackAt > (last.get(id) ?? -10) + 1e-6) {
        last.set(id, u.lastAttackAt);
        out.get(id)!.push(u.lastAttackAt);
      }
    }
  }
  return out;
}

const meanGap = (times: number[]): number =>
  times.length < 2 ? 0 : (times[times.length - 1] - times[0]) / (times.length - 1);

/** o motor clampa cada passo a 0,05 s; drenar 1–2 s de cooldown é a conta de
 *  muitos passinhos, não um update(1) */
function advance(eng: GameEngine, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) eng.update(DT);
}

/** ignis vs ignis nos espelhos um do outro: os dois lados atiram (o range do
 *  ignis atravessa a arena — comprovado no teste 1 de combat.test). */
function makeDuel(seed: number): { eng: GameEngine; pId: number; aId: number } {
  const eng = makeEngine({ seed });
  const pId = mustSummon(eng, 'ignis', 'player', 1);
  const aId = mustSummon(eng, 'ignis', 'ai', 1);
  armUnit(eng, pId, 2); // X: cadência 2 s
  armUnit(eng, aId, 3); // Y: cadência 3 s
  return { eng, pId, aId };
}

describe('Turbo de combate no motor', () => {
  test('1×: a cadência é o intervalo de cada monstro (X dispara a cada 2 s, Y a cada 3 s)', () => {
    const { eng, pId, aId } = makeDuel(11);
    eng.startBattle();
    const times = attackTimes(eng, [pId, aId], 30);
    const p = times.get(pId)!;
    const a = times.get(aId)!;
    expect(p.length).toBeGreaterThanOrEqual(10);
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(meanGap(p)).toBeCloseTo(2, 1);
    expect(meanGap(a)).toBeCloseTo(3, 1);
  });

  test('3×: cada cadência encolhe exatamente para um terço (2 s → 0,67 s; 3 s → 1 s)', () => {
    const { eng, pId, aId } = makeDuel(11); // mesmo seed: mesmo duelo
    eng.setTurbo(true);
    eng.startBattle();
    const times = attackTimes(eng, [pId, aId], 30);
    const p = times.get(pId)!;
    const a = times.get(aId)!;
    expect(meanGap(p)).toBeCloseTo(2 / 3, 1);
    expect(meanGap(a)).toBeCloseTo(1, 1);
    expect(p.length).toBeGreaterThan(35); // ~3× os tiros do caso 1×
  });

  test('apertar o botão no meio do combate muda a cadência na hora; desligar restaura', () => {
    const { eng, pId, aId } = makeDuel(11);
    eng.startBattle();
    const windowA = attackTimes(eng, [pId, aId], 10).get(pId)!;
    expect(meanGap(windowA)).toBeCloseTo(2, 1);

    eng.setTurbo(true);
    advance(eng, 1); // drena o cooldown em curso antes de medir
    const windowB = attackTimes(eng, [pId, aId], 10).get(pId)!;
    expect(meanGap(windowB)).toBeCloseTo(2 / 3, 1);

    eng.setTurbo(false);
    advance(eng, 2); // drena o último cooldown herdado do 3×
    const windowC = attackTimes(eng, [pId, aId], 10).get(pId)!;
    expect(meanGap(windowC)).toBeCloseTo(2, 1);
  });

  test('turbo só acelera o relógio de tiro: dano e vida não mudam de natureza', () => {
    // o mesmo duelo 3× ainda resolve por acertos de projétil — um terço do
    // tempo de cadência não converte tiro em dano maior
    const { eng, aId } = makeDuel(11);
    const target = eng.getUnit(aId)!;
    target.hp = 100; // alvo frágil o bastante para morrer de tiros
    eng.setTurbo(true);
    eng.startBattle();
    let killed = false;
    for (let i = 0; i < 60 * 60 && !killed; i++) {
      eng.update(DT);
      const u = eng.getUnit(aId);
      if (!u || !u.alive) killed = true;
    }
    expect(killed).toBe(true); // o dano por acerto continua matando — só que mais cedo
  });
});

describe('Turbo na store (botão → motor)', () => {
  beforeEach(() => {
    // jsdom deste ambiente não traz localStorage (saveGame é toda resguardada;
    // só o clear direto é que precisa do guarda)
    globalThis.localStorage?.clear();
    useGameStore.getState().initFromSave();
  });

  test('startNewMatch começa em 1×; setTurbo liga/desliga o motor junto', () => {
    useGameStore.getState().startNewMatch();
    const eng = getEngine()!;
    expect(useGameStore.getState().turbo).toBe(false);
    expect(eng.turbo).toBe(1);

    useGameStore.getState().startBattle();
    useGameStore.getState().setTurbo(true);
    expect(useGameStore.getState().turbo).toBe(true);
    expect(eng.turbo).toBe(3);

    useGameStore.getState().setTurbo(false);
    expect(useGameStore.getState().turbo).toBe(false);
    expect(eng.turbo).toBe(1);
  });

  test('partida nova zera o turbo (motor novo nasce em 1× e a store acompanha)', () => {
    useGameStore.getState().startNewMatch();
    useGameStore.getState().startBattle();
    useGameStore.getState().setTurbo(true);
    useGameStore.getState().startNewMatch();
    expect(useGameStore.getState().turbo).toBe(false);
    expect(getEngine()!.turbo).toBe(1);
  });
});

describe('pinos estáticos da feature', () => {
  test('motor: o dreno do cooldown é o único ponto escalado pelo turbo', () => {
    expect(EngineSource).toContain('unit.cooldown -= dt * this.turboScale');
  });

  test('TurboFab: só existe no combate, alterna 1×/3× e é aria-pressed', () => {
    expect(TurboFabSource).toContain("if (phase !== 'combat') return null");
    expect(TurboFabSource).toContain('data-on');
    expect(TurboFabSource).toContain('aria-pressed');
    expect(TurboFabSource).toContain('ClockIcon');
    expect(TurboFabSource).toContain('data-testid="turbo-fab"');
  });

  test('App monta o FAB junto do codex dentro da partida', () => {
    expect(AppSource).toContain('<TurboFab />');
  });

  test('styles: o pino visual mora na sonda do navegador real', () => {
    // vitest stubbeia CSS (?raw devolve vazio), então o pino de conteúdo/visual
    // do turbo mora em qa/probe-turbo.mjs: ele busca styles.css?raw do dev
    // server e mede o FAB vivo (data-on, gradiente de ouro, alternância 1×↔3×)
    // num WebKit/Chromium real.
    expect(TurboFabSource).toContain('className="turbo-fab"');
    expect(AppSource).toContain('TurboFab');
  });
});
