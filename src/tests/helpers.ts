import * as THREE from 'three';
import { getGeometry } from '../scene/assets';
import { GameEngine } from '../game/engine/engine';
import { checkFusion } from '../game/fusion/fusionRules';
import type { Part } from '../scene/speciesModels';
import type { EngineEvent, MonsterLevel, SpeciesId } from '../game/types';

export const DT = 1 / 30;

/**
 * Invólucro (bounding box) real de um conjunto de peças do modelo procedural,
 * nas mesmas condições da cena: geometria + posição/rotação/escala de cada
 * parte. Usado pelos testes para amarrar o tamanho das formas ao tabuleiro.
 */
export function partsEnvelope(parts: Part[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  const box = new THREE.Box3();
  const mat = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const p of parts) {
    const geo = getGeometry(p.g, p.a);
    geo.computeBoundingBox();
    const b = geo.boundingBox ?? new THREE.Box3();
    pos.set(p.p[0], p.p[1], p.p[2]);
    euler.set(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0);
    quat.setFromEuler(euler);
    scl.set(p.s?.[0] ?? 1, p.s?.[1] ?? 1, p.s?.[2] ?? 1);
    mat.compose(pos, quat, scl);
    box.union(b.clone().applyMatrix4(mat));
  }
  if (box.isEmpty()) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
}

/**
 * makeEngine: por padrão NÃO gera exército inimigo no startBattle
 * (testes montam os dois lados manualmente). fullMatch/ui/store usam
 * generateTeam: true — comportamento real do jogo.
 */
export function makeEngine(opts?: {
  playerCoins?: number;
  aiCoins?: number;
  maxBattleTime?: number;
  seed?: number;
  matchId?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  generateTeam?: boolean;
}): GameEngine {
  const eng = new GameEngine({
    playerCoins: opts?.playerCoins ?? 500,
    aiCoins: opts?.aiCoins ?? 500,
    maxBattleTime: opts?.maxBattleTime ?? 160,
    difficulty: opts?.difficulty ?? 'normal',
    seed: opts?.seed ?? 1234,
    generateEnemyTeam: opts?.generateTeam ?? false,
    ...(opts?.matchId ? { matchId: opts.matchId } : {}),
  });
  return eng;
}

export function collectEvents(eng: GameEngine): EngineEvent[] {
  const events: EngineEvent[] = [];
  eng.setEventCallback((e) => events.push(e));
  return events;
}

export function mustSummon(eng: GameEngine, species: SpeciesId, side: 'player' | 'ai' = 'player', tile?: number): number {
  const res = eng.summon(side, species, tile);
  if (!res.ok || res.unitId === undefined) {
    throw new Error(`summon failed: ${res.reason}`);
  }
  return res.unitId;
}

export function mustMerge(eng: GameEngine, aId: number, bId: number): number[] {
  const res = eng.tryMerge(aId, bId);
  if (!res.ok) throw new Error(`merge failed: ${res.reason}`);
  return res.createdIds ?? [];
}

/**
 * Soma moedas gastas e convoca até `totalL1` unidades Nv.1, fundindo pares
 * disponíveis continuamente (respeitando os 12 slots do tabuleiro).
 * Devolve os IDs por nível final.
 */
export function autoGrow(
  eng: GameEngine,
  species: SpeciesId,
  totalL1: number,
  side: 'player' | 'ai' = 'player',
  maxMergeLevel = 4,
): Map<number, number[]> {
  const byLevel = new Map<number, number[]>();
  for (let l = 1; l <= 5; l++) byLevel.set(l, []);
  let toSummon = totalL1;
  const place = (id: number, level: number) => byLevel.get(level)!.push(id);

  let guard = 0;
  while (guard++ < 1000) {
    while (toSummon > 0 && !eng.boardFull(side)) {
      place(mustSummon(eng, species, side), 1);
      toSummon -= 1;
    }
    const lvl = [1, 2, 3, 4].find(
      (l) => l <= maxMergeLevel && (byLevel.get(l) ?? []).length >= 2,
    );
    if (lvl === undefined) break;
    const list = byLevel.get(lvl)!;
    const a = list.shift()!;
    const b = list.shift()!;
    const r = eng.tryMerge(a, b);
    if (!r.ok) throw new Error(`autoGrow merge failed: ${r.reason}`);
    for (const cid of r.createdIds!) place(cid, lvl + 1);
  }
  return byLevel;
}

export function runSeconds(eng: GameEngine, seconds: number, dt = DT): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) eng.update(dt);
}

export function snapshotUnits(eng: GameEngine): string[] {
  return eng.world.units
    .map((u) => `${u.id}|${u.side}|${u.species}|${u.level}|${u.tile}|${u.hp.toFixed(3)}|${u.alive}`)
    .sort();
}

export function assertPairFusionValid(
  a: { species: SpeciesId; level: MonsterLevel },
  b: { species: SpeciesId; level: MonsterLevel },
): void {
  const check = checkFusion(a.species, a.level, b.species, b.level);
  expect(check.ok).toBe(true);
}
