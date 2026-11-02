import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants, type Part } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeWaterMaterial } from '../scene/waterShaders';
import { makeIceMaterial } from '../scene/iceShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { BOARD_PROJECTILE_SCALE, LEVEL_PROJECTILE_MULT } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  ABISSAL_ARM_PIVOT,
  ABISSAL_ATTACK_WINDOW,
  ABISSAL_CORE_POS,
  ABISSAL_JAW_PIVOT,
  ABISSAL_LIFE,
  ABISSAL_LURE_PIVOT,
  ABISSAL_LURE_POS,
  ABISSAL_TIDE,
  ABISSAL_WINDUP,
  BONE_LOOK,
  CORE_LOOK,
  LANTERN_LOOK,
  MEMBRANE_LOOK,
  PHOTOPHORE_LOOK,
  THROAT_LOOK,
  WATER_TIDE_DEEP_LOOK,
  WATER_TIDE_LOOK,
  type AttackPose,
  attackPose,
} from '../scene/AbissalRig';
import { ABISSAL_CORE_LOOK, ABISSAL_GLOB_LOOK, ABISSAL_HOOK_LOOK } from '../scene/ProjectileField';
import { COSMICO_ATTACK_WINDOW, COSMICO_WINDUP } from '../scene/CosmicoRig';
import { GEODO_ATTACK_WINDOW, GEODO_WINDUP } from '../scene/GeodoRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do ABISSAL (Nv.8 — pântano+névoa: o TAMBORIL DAS MARÉS MORTAS), o ladrão
 * de vida (`drain 0,4` + `slow` + `poison`, alvo `lowestHp`, maré a 8,5×1,12⁷).
 * As regras amarradas aqui:
 *  - a maré #3f6f8f é ÚNICA entre motor (projectileColor), corpo d'água (uMid),
 *    trinca do osso, globo arremessado e anel do FX; a vida #5fe0c8 é SEMPRE
 *    acento (lanterna, núcleo, fotoóforos, fendas da guelra, fagulhas do dreno);
 *  - DNA DE SETE FACES EM TUDO: todo `cyl`/`cone` do figurino tem SETE faces
 *    (zero cinco do Geodo-irmão, zero seis do Cristal), sete presas em cada
 *    fila, sete gotas, sete ganchos na jaula da lanterna e da cavidade, sete
 *    farpas na cabeça e SETE vidas cativas em órbita (4+3);
 *  - a ASSINATURA é a ESCA: vara de osso arqueada na testa com a lanterna de
 *    vida roubada pendendo SOBRE a goela — a lanterna é a peça mais PARA FRENTE
 *    da cabeça (o print lê a isca antes de qualquer olho) e a jaula de ganchos
 *    aponta PARA DENTRO (a presa entra, não sai);
 *  - a goela é DOBRADIÇA no osso da bochecha: a mandíbula inteira (jaw.*) rocks
 *    no pivô exportado e a maxila (fang.up) nunca gira — fechadas, as duas
 *    fileiras ENTRELAÇAM;
 *  - diferença dura contra os pais: Pântano é lODO marrom plantado, Névoa é
 *    bruma CLARA; aqui é o AZUL-DO-FUNDO escuro com bioluminescência própria
 *    (luma do corpo < luma da Névoa; matiz azul b>g contra o verde do Pântano);
 *  - coreografia: janela 0,92 s com 60% de sucção silenciosa e a pose ZERA no
 *    fim — a mordida é instantânea (a<0,18 da janela de tiro).
 */

const ABISSAL = getSpecies('abissal');
const LV = 8 as MonsterLevel;

/** luminância (Rec. 709) no ESPAÇO DE TRABALHO LINEAR do three — a régua do
 *  "é o breu do abismo ou a bruma clara da mãe Névoa?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const P8 = () => partsForLevel(MODELS.abissal, 8);

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** eixo Y local de uma peça rotacionada (o `aim` dos helpers aponta o +Y do
 *  prisma/cone na direção do fio/presa) */
const axisOf = (p: Part): THREE.Vector3 =>
  new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0));

/** as DUAS pontas do eixo de um `rod7` (o cyl termina em +len/2 e −len/2) */
const rodEnds = (p: Part): [[number, number, number], [number, number, number]] => {
  const u = axisOf(p);
  const half = (p.a[2] - 0.04) / 2; // o rod7 compra +0,04 de folga na junta
  return [
    [p.p[0] - u.x * half, p.p[1] - u.y * half, p.p[2] - u.z * half],
    [p.p[0] + u.x * half, p.p[1] + u.y * half, p.p[2] + u.z * half],
  ];
};

/** frente Z REAL do bbox transformado (MESMA montagem do rig) — a régua do
 *  "a isca lê antes do olho" */
const zFront = (p: Part) => {
  const geo = getGeometry(p.g, p.a);
  geo.computeBoundingBox();
  const b = geo.boundingBox ?? new THREE.Box3();
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0),
  );
  const sx = p.s?.[0] ?? 1;
  const sy = p.s?.[1] ?? 1;
  const sz = p.s?.[2] ?? 1;
  let z = -Infinity;
  for (const cx of [b.min.x, b.max.x])
    for (const cy of [b.min.y, b.max.y])
      for (const cz of [b.min.z, b.max.z]) {
        const v = new THREE.Vector3(cx * sx, cy * sy, cz * sz).applyQuaternion(q);
        if (p.p[2] + v.z > z) z = p.p[2] + v.z;
      }
  return z;
};

describe('Abissal: tamboril das marés mortas flotando na própria maré (Nv.8)', () => {
  test('rig próprio, FLUTUANDO (o tamboril não pisa o tabuleiro), Nv.8 fixo', () => {
    expect(SPECIES_RIGS.abissal).toBeTruthy();
    expect(ABISSAL.levelMin).toBe(8);
    expect(ABISSAL.levelMax).toBe(8);
    expect(hasLevelVariants(MODELS.abissal)).toBe(false);
    expect(P8().length).toBe(MODELS.abissal.parts.length);
    // NADA: boia e balança (a régua contra o tanque plantado do Geodo, floatY 0)
    expect(MODELS.abissal.floatY).toBeGreaterThanOrEqual(0.1);
    expect(MODELS.abissal.bob).toBeLessThanOrEqual(0.12);
    expect(ABISSAL.base.moveSpeed).toBe(0); // mas não persegue: emboscada
    // três órbitas em alturas que nunca se tocam: cardume alto (0), luas rasantes
    // (1) e farpas da cabeça (2) — e o cardume é SETE vidas cativas (4+3)
    const groups = MODELS.abissal.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    const parts = P8();
    expect(parts.filter((p) => p.group === 0).length).toBe(7);
    expect(parts.filter((p) => p.group === 1).length).toBe(9);
    expect(parts.filter((p) => p.group === 2).length).toBe(7); // SETE farpas
    // as luas varrem no SENTIDO CONTRÁRIO do cardume (a maré tem dois ritmos)
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[0]));
  });

  test('DNA DE SETE FACES: todo cyl/cone tem sete faces — o sete do abismo', () => {
    const parts = P8();
    let nCyl = 0;
    let nCone = 0;
    for (const p of parts) {
      if (p.g === 'cyl') {
        nCyl++;
        expect(p.a[3]).toBe(7); // todo fio de osso/tentáculo é prisma de SETE
        expect(p.a[4] ?? 1).toBeGreaterThanOrEqual(3); // anéis p/ o close
      }
      if (p.g === 'cone') {
        nCone++;
        expect(p.a[2]).toBe(7); // presa, gancho, gota e farpa: sete faces
      }
    }
    expect(nCyl).toBeGreaterThanOrEqual(30); // varas, costelas, tentáculos, cabos
    expect(nCone).toBeGreaterThanOrEqual(50); // presas, ganchos, raios, gotas
    // o sete governa até as contagens: sete presas de cima, sete de baixo, sete
    // gotas escorrendo, sete ganchos na lanterna, sete na jaula do peito
    expect(parts.filter((p) => p.tag === 'fang.up').length).toBe(7);
    expect(parts.filter((p) => p.tag === 'jaw.fang').length).toBe(7);
    expect(parts.filter((p) => p.tag === 'drip').length).toBe(7);
    expect(parts.filter((p) => p.tag === 'lure.hook').length).toBe(7);
    expect(parts.filter((p) => p.tag === 'cavity').length).toBe(7);
    // octaedro só miudeza (nódulo do ombro 0,12 é o maior): NUNCA corpo — corpo
    // é esfera DENSE (água é massa redonda: ≥12 segmentos a partir de r 0,1)
    for (const o of parts.filter((p) => p.g === 'octa')) expect(o.a[0]).toBeLessThanOrEqual(0.13);
    for (const s of parts.filter((p) => p.g === 'sphere' && p.a[0] >= 0.1)) {
      expect(s.a[1]).toBeGreaterThanOrEqual(12);
      expect(s.a[2]).toBeGreaterThanOrEqual(8);
    }
  });

  test('a ASSINATURA (esca): vara arqueada na testa e lanterna pendendo na frente', () => {
    const parts = P8();
    // a base da vara É o pivô exportado (gira na testa, não desarticula)
    const base = parts.find((p) => p.tag === 'lure.base')!;
    expect(dist3(base.p, ABISSAL_LURE_PIVOT)).toBeLessThan(0.01);
    // a cadeia da vara: quatro nós de osso contínuos, do pivô ao berço
    const rods = parts.filter((p) => p.tag === 'lure.rod');
    expect(rods.length).toBe(4);
    const ends0 = rodEnds(rods[0]);
    expect(Math.min(dist3(ends0[0], ABISSAL_LURE_PIVOT), dist3(ends0[1], ABISSAL_LURE_PIVOT))).toBeLessThan(0.05);
    for (let i = 1; i < rods.length; i++) {
      const prev = rodEnds(rods[i - 1]);
      const cur = rodEnds(rods[i]);
      const join = Math.min(
        dist3(prev[0], cur[0]), dist3(prev[0], cur[1]),
        dist3(prev[1], cur[0]), dist3(prev[1], cur[1]),
      );
      expect(join).toBeLessThan(0.05); // junta com junta, sem elo solto no escuro
    }
    // o ARCO: sobe PARA TRÁS (nó do meio atrás do crânio) e curva para a FRENTE
    // no topo — a lanterna pende ABAIXO da ponta e À FRENTE dela (balançando
    // sobre a goela aberta: o `drain 0,4` do motor desenhado em silhueta)
    const nodes = parts.filter((p) => p.tag === 'lure.node');
    expect(nodes.length).toBe(3);
    const apex = nodes.reduce((a, b) => (a.p[1] >= b.p[1] ? a : b));
    expect(apex.p[1]).toBeGreaterThanOrEqual(4.8);
    expect(apex.p[2]).toBeLessThan(ABISSAL_LURE_POS[2] - 0.4); // pende para frente
    expect(apex.p[1]).toBeGreaterThan(ABISSAL_LURE_POS[1]); // e para baixo
    // o berço da lanterna mora EXATAMENTE no LURE_POS exportado (o core do rig
    // nasce ali — amarrado do figurino ao print)
    const cup = parts.find((p) => p.tag === 'lure.cup')!;
    expect(dist3(cup.p, ABISSAL_LURE_POS)).toBeLessThan(0.01);
    // a JAULA da lanterna: sete ganchos no aro, a PONTA mais FECHADA (perto do
    // eixo da lanterna) que a base — a presa entra, não sai. O tilt abre a boca
    // da armadilha para cima (o berço fecha sobre a luz por baixo e pelos lados)
    const hooks = parts.filter((p) => p.tag === 'lure.hook');
    for (const h of hooks) {
      expect(h.g).toBe('cone');
      expect(h.a[2]).toBe(7);
      const u = axisOf(h);
      const half = h.a[1] / 2;
      const rTip = Math.hypot(h.p[0] + u.x * half, h.p[2] + u.z * half - ABISSAL_LURE_POS[2]);
      const rButt = Math.hypot(h.p[0] - u.x * half, h.p[2] - u.z * half - ABISSAL_LURE_POS[2]);
      expect(rTip).toBeLessThan(rButt - 0.01); // o gancho FECHA para dentro
      expect(rButt).toBeGreaterThan(0.14); // base sentada no aro do berço (0,16)
      expect(rTip).toBeLessThan(0.14); // e a ponta invade o vão da luz
    }
    // o print: a lanterna é a peça MAIS PARA FRENTE da cabeça — a isca é a
    // vista do tamboril e o olhar do jogador cai nela antes de qualquer olho
    const face = parts.filter((p) =>
      ['socket', 'eye', 'brow', 'fang.up', 'jaw.barbel', 'throat'].includes(p.tag ?? ''),
    );
    const zCup = zFront(cup);
    for (const f of face) expect(zCup).toBeGreaterThan(zFront(f));
  });

  test('a GOELA é dobradiça: mandíbula inteira rocks no osso da bochecha e as presas entrelaçam', () => {
    const parts = P8();
    // o maciço da dobradiça está EXATAMENTE no pivô exportado
    const hinge = parts.find((p) => p.g === 'sphere' && dist3(p.p, ABISSAL_JAW_PIVOT) < 0.01)!;
    expect(hinge).toBeTruthy();
    // TODA peça jaw.* está à FRENTE do pivô (a mandíbula pendurada na frente da
    // bochecha) — e girar +X no pico do gape derruba TODAS elas (a goela vira
    // balde): nenhuma peça voa solta ou sobe pela cara no meio do arremesso
    const jaw = parts.filter((p) => (p.tag ?? '').startsWith('jaw.'));
    expect(jaw.length).toBeGreaterThanOrEqual(15);
    const gape = 0.9 * 1 + 0.03; // pico do pose + respiração
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), gape);
    for (const j of jaw) {
      expect(j.p[2]).toBeGreaterThan(ABISSAL_JAW_PIVOT[2]);
      const rel = new THREE.Vector3(
        j.p[0] - ABISSAL_JAW_PIVOT[0],
        j.p[1] - ABISSAL_JAW_PIVOT[1],
        j.p[2] - ABISSAL_JAW_PIVOT[2],
      ).applyQuaternion(q);
      expect(rel.y).toBeLessThan(j.p[1] - ABISSAL_JAW_PIVOT[1] - 0.05); // cai, todas
    }
    // o queixo despenca > 0,25 (o balde aberto que a QA leu no print)
    const chin = parts.find((p) => p.tag === 'jaw.chin' && p.p[0] === 0)!;
    const rel = new THREE.Vector3(
      chin.p[0] - ABISSAL_JAW_PIVOT[0],
      chin.p[1] - ABISSAL_JAW_PIVOT[1],
      chin.p[2] - ABISSAL_JAW_PIVOT[2],
    ).applyQuaternion(q);
    expect(rel.y - (chin.p[1] - ABISSAL_JAW_PIVOT[1])).toBeLessThan(-0.25);
    // maxila FIXA (fang.up) aponta para baixo, mandíbula (jaw.fang) para cima:
    // fechadas, as duas fileiras se ENTRELAÇAM (a armadilha fecha) — e a fileira
    // de baixo fica um dedo ATRÁS da de cima
    const up = parts.filter((p) => p.tag === 'fang.up');
    const down = parts.filter((p) => p.tag === 'jaw.fang');
    for (const f of up) expect(axisOf(f).y).toBeLessThan(-0.9);
    for (const f of down) expect(axisOf(f).y).toBeGreaterThan(0.9);
    const zUp = up.map((f) => f.p[2]).sort((a, b) => a - b)[3];
    const zDown = down.map((f) => f.p[2]).sort((a, b) => a - b)[3];
    expect(zDown).toBeLessThan(zUp - 0.1); // atrás: entrelaçam, não colidem
    // o barbilho (a "terceira antena") desce do queixo com nódulo aceso na ponta
    const barbel = parts.filter((p) => p.tag === 'jaw.barbel');
    expect(barbel.length).toBeGreaterThanOrEqual(7);
    const lit = barbel.find((p) => p.m === 'glow')!;
    expect(lit.p[1]).toBeLessThan(ABISSAL_JAW_PIVOT[1] - 1); // pendurado, caído
    // o breu da goela e a vida fervendo na garganta: ESCURO atrás, LUZ na frente
    const pit = parts.find((p) => p.m === 'black')!;
    const throat = parts.find((p) => p.tag === 'throat')!;
    expect(throat.m).toBe('white');
    expect(zFront(throat)).toBeGreaterThan(zFront(pit)); // luz na frente do breu
  });

  test('a JAULA DO PEITO: costelas de afogado emolduram o núcleo de vida exportado', () => {
    const parts = P8();
    const ribs = parts.filter((p) => p.tag === 'rib');
    expect(ribs.length).toBeGreaterThanOrEqual(20); // espelhadas: 4 arcos × 2 × mm
    const sternum = ribs.filter((p) => p.g === 'box');
    expect(sternum.length).toBe(2);
    // a moldura da cavidade: SETE ganchos em anel VERTICAL (plano xy) em volta
    // do núcleo — a jaula abre para o espectador, a luz é o que se vê
    const cage = parts.filter((p) => p.tag === 'cavity');
    for (const h of cage) {
      expect(h.a[2]).toBe(7);
      const r = Math.hypot(h.p[0], h.p[1] - ABISSAL_CORE_POS[1]);
      expect(r).toBeGreaterThan(0.25); // no aro (raio 0,33, meio gancho dentro)
      expect(r).toBeLessThan(0.45);
    }
    // o CORE_POS exportado: no eixo, DENTRO da jaula (atrás do esterno, na
    // faixa de y das costelas) — é ele que sobe na sucção e INCHA no dreno
    expect(ABISSAL_CORE_POS[0]).toBe(0);
    expect(ABISSAL_CORE_POS[1]).toBeGreaterThan(1.4);
    expect(ABISSAL_CORE_POS[1]).toBeLessThan(2.3);
    expect(ABISSAL_CORE_POS[2]).toBeGreaterThan(-0.4);
    expect(ABISSAL_CORE_POS[2]).toBeLessThan(sternum[0].p[2] - 0.1); // atrás do esterno
    // os ombros das barbatanas: o nódulo de cada lado É o ARM_PIVOT espelhado
    for (const side of [1, -1]) {
      const knot = parts.find(
        (p) => p.tag === 'arm' && p.g === 'octa' && Math.sign(p.p[0]) === side,
      )!;
      expect(dist3([side * ABISSAL_ARM_PIVOT[0], ABISSAL_ARM_PIVOT[1], ABISSAL_ARM_PIVOT[2]], knot.p)).toBeLessThan(0.01);
    }
  });

  test('três órbitas em FAIXAS DE ALTURA que nunca se tocam (a régua do Geodo)', () => {
    const parts = P8();
    const ys = (g: number) => parts.filter((p) => p.group === g).map((p) => p.p[1]);
    // luas rasteiras (0,85–1,25) < farpas da cabeça (3,15) < cardume alto (3,42+)
    expect(Math.max(...ys(1))).toBeLessThan(Math.min(...ys(2)));
    expect(Math.max(...ys(2))).toBeLessThan(Math.min(...ys(0)));
    // o cardume é VIDA CATIVA (glow #5fe0c8): as presas já giram em volta da
    // isca antes de morrer — o `drain` escrito em partícula ambiente
    for (const m of parts.filter((p) => p.group === 0)) expect(m.m).toBe('glow');
    // luas de maré: corpo d'água raspando o bicho, POR FORA da massa (raio do
    // corpo ~0,8) em duas cintas que nunca se encostam (y 1,25 vs 0,85)
    const moons = parts.filter((p) => p.group === 1);
    for (const p of moons) {
      expect(p.tag).toBe('moon');
      expect(Math.hypot(p.p[0], p.p[2])).toBeGreaterThanOrEqual(1.0);
    }
    const moonYs = new Set(moons.map((p) => p.p[1].toFixed(2)));
    expect(moonYs.size).toBe(2);
    // farpas da cabeça (grupo 2): rosba no maciço (raio ≤ 1,0 — longe do corpo
    // virava agulha solta no escuro, a cobrança do print)
    for (const p of parts.filter((p) => p.group === 2)) {
      expect(p.tag).toBe('hook');
      expect(Math.hypot(p.p[0], p.p[2])).toBeLessThanOrEqual(1.0);
    }
  });

  test('invólucro: boia com os tentáculos ROÇANDO o piso e a esca usa o formTop inteiro', () => {
    const e = partsEnvelope(P8());
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // barbeta aberta + cauda longa: o tamboril varre o slot (e não sai dele)
    expect(halfX).toBeGreaterThanOrEqual(1.3);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(halfZ).toBeGreaterThanOrEqual(2.8); // o cabo + leme da cauda vaza para trás
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // BOIA, mas PESCA: nenhum peça afunda no piso e a ponta luminosa do
    // tentáculo roça a 0,05 do chão (minY quase zero SEM furar)
    expect(e.minY).toBeGreaterThanOrEqual(-0.01);
    expect(e.minY).toBeLessThan(0.05);
    // a esca usa a altura da forma sem estourar o teto (formTop 5,1)
    expect(e.maxY).toBeLessThanOrEqual(formTop(ABISSAL, 8) + 0.25);
    expect(e.maxY).toBeGreaterThanOrEqual(formTop(ABISSAL, 8) - 0.2);
    expect(e.maxY).toBeGreaterThanOrEqual(4.8);
  });

  test('ANTI LOW-POLY: 213 peças, 13 mil vértices e 14,8 mil triângulos reais', () => {
    const parts = P8();
    expect(parts.length).toBeGreaterThanOrEqual(200);
    let drawn = 0;
    let tris = 0;
    for (const p of parts) {
      const geo = getGeometry(p.g, p.a);
      drawn += geo.getAttribute('position').count;
      tris += (geo.index?.count ?? geo.getAttribute('position').count) / 3;
    }
    expect(drawn).toBeGreaterThanOrEqual(12000); // medido: 13.323 vértices
    expect(tris).toBeGreaterThanOrEqual(13000); // medido: 14.866 triângulos
    // contagens REAIS (medição, sem chute): a maciça do corpo, o gancho de sete
    // faces e o fio de osso da vara
    expect(getGeometry('sphere', [0.66, 20, 14]).getAttribute('position').count).toBeGreaterThanOrEqual(300);
    expect(getGeometry('cone', [0.026, 0.15, 7, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(20);
    expect(getGeometry('cyl', [0.075, 0.0585, 0.784, 7, 5]).getAttribute('position').count).toBeGreaterThanOrEqual(30);
    // nenhum atalho: toda gota/tentáculo é densa (cone de gota ≥ 7 faces já
    // garantido no DNA; aqui cobra os anéis verticais dos prismas de osso)
    for (const p of parts) if (p.g === 'cyl') expect(p.a[4] ?? 1).toBeGreaterThanOrEqual(3);
  });

  test('identidade do motor ao anel: a maré #3f6f8f; a vida #5fe0c8 é sempre acento', () => {
    expect(ABISSAL_TIDE).toBe('#3f6f8f');
    expect(ABISSAL.base.projectileColor).toBe(ABISSAL_TIDE);
    expect(VISUALS.abissal.body).toBe(ABISSAL_TIDE);
    // a chain atravessa TODOS os materiais: uMid da água do corpo, trinca do
    // osso (vara/dente/costela/guelra), miolo frio dos cores e o globo arremessado
    expect(WATER_TIDE_LOOK.mid).toBe(ABISSAL_TIDE);
    expect(BONE_LOOK.crack).toBe(ABISSAL_TIDE);
    expect(CORE_LOOK.cool).toBe(ABISSAL_TIDE);
    expect(LANTERN_LOOK.cool).toBe(ABISSAL_TIDE);
    expect(PHOTOPHORE_LOOK.cool).toBe(ABISSAL_TIDE);
    expect(ABISSAL_GLOB_LOOK.mid).toBe(ABISSAL_TIDE);
    expect(ABISSAL_HOOK_LOOK.crack).toBe(ABISSAL_TIDE);
    // a VIDA ROUBADA (#5fe0c8 = glow): lanterna, núcleo, garganta, fotoóforos,
    // nervuras da membrana e o miolo do projétil — SEMPRE acento, nunca corpo
    expect(ABISSAL_LIFE).toBe('#5fe0c8');
    expect(VISUALS.abissal.glow).toBe(ABISSAL_LIFE);
    expect(CORE_LOOK.gold).toBe(ABISSAL_LIFE);
    expect(LANTERN_LOOK.gold).toBe(ABISSAL_LIFE);
    expect(THROAT_LOOK.gold).toBe(ABISSAL_LIFE);
    expect(PHOTOPHORE_LOOK.gold).toBe(ABISSAL_LIFE);
    expect(MEMBRANE_LOOK.crack).toBe(ABISSAL_LIFE);
    expect(ABISSAL_CORE_LOOK.gold).toBe(ABISSAL_LIFE);
    // o osso pálido é o ACENTO do catálogo e a espuma pálida nunca #ffffff
    expect(VISUALS.abissal.accent).toBe('#bfe9ff');
    expect(WATER_TIDE_LOOK.foam).toBe(VISUALS.abissal.accent);
    expect(BONE_LOOK.iceA).toBe(VISUALS.abissal.accent);
    expect(ABISSAL_HOOK_LOOK.iceA).toBe(VISUALS.abissal.accent);
    expect(WATER_TIDE_LOOK.deep).toBe(VISUALS.abissal.dark);
    // VISUALS = rig (nada de deriva): o corpo do figurino É o uMid do shader
    expect(luma(VISUALS.abissal.dark)).toBeLessThan(luma(ABISSAL_TIDE)); // o breu engole
    // réguas chegam NA UNIFORM dos três shaders (senão eram enfeite de TS)
    const agua = makeWaterMaterial({
      deep: WATER_TIDE_LOOK.deep,
      mid: WATER_TIDE_LOOK.mid,
      foam: WATER_TIDE_LOOK.foam,
      amp: WATER_TIDE_LOOK.amp,
      swell: WATER_TIDE_LOOK.swell,
      bend: WATER_TIDE_LOOK.bend,
      foamAmt: WATER_TIDE_LOOK.foamAmt,
      soft: 0,
    });
    expect(agua.transparent).toBe(false); // água OPACA: peso no tabuleiro (iOS-safe)
    expect(agua.depthWrite).toBe(true);
    expect(agua.uniforms.uMid.value.getHexString()).toBe(ABISSAL_TIDE.slice(1));
    expect(agua.uniforms.uFoamAmt.value).toBeLessThanOrEqual(0.25); // maré MORTA
    agua.dispose();
    const osso = makeIceMaterial({
      iceA: BONE_LOOK.iceA,
      iceB: BONE_LOOK.iceB,
      crack: BONE_LOOK.crack,
      amp: BONE_LOOK.amp,
      crackGlow: BONE_LOOK.crackGlow,
      sparkle: BONE_LOOK.sparkle,
      alpha: BONE_LOOK.alpha,
    });
    expect(osso.uniforms.uCrackCol.value.getHexString()).toBe(ABISSAL_TIDE.slice(1));
    expect(osso.uniforms.uAlpha.value).toBeGreaterThanOrEqual(0.9); // osso denso
    osso.dispose();
    const core = makeCoreMaterial({
      gold: LANTERN_LOOK.gold,
      white: LANTERN_LOOK.white,
      cool: LANTERN_LOOK.cool,
      amp: LANTERN_LOOK.amp,
    });
    expect(core.uniforms.uGold.value.getHexString()).toBe(ABISSAL_LIFE.slice(1));
    core.dispose();
    // a ÚNICA translucidez do figurino é a membrana de barbatana; osso denso,
    // água opaca (zero empilhamento — a lição do WebKit)
    expect(MEMBRANE_LOOK.alpha).toBeLessThanOrEqual(0.5);
    expect(BONE_LOOK.amp).toBeLessThanOrEqual(0.01); // aresta dura (lição do quartzo)
    // o miolo do core nunca branco puro (a régua da árvore inteira)
    expect(CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(CORE_LOOK.white)).toBeGreaterThan(luma(ABISSAL_LIFE));
  });

  test('contraste duro contra os pais: Pântano é lODO marrom, Névoa é bruma clara', () => {
    // névoa: corpo do abissal vale < metade da luminância da bruma da mãe
    expect(luma(VISUALS.abissal.body)).toBeLessThan(luma(VISUALS.nevoa.body) * 0.5);
    // pântano: verde-lodo (g domina); aqui é azul-do-fundo (b domina) — matizes
    // em famílias OPOSTAS, zero risco de ler "o pai submerso"
    const pant = new THREE.Color(VISUALS.pantano.body);
    const abis = new THREE.Color(VISUALS.abissal.body);
    expect(pant.g).toBeGreaterThan(pant.b);
    expect(abis.b).toBeGreaterThan(abis.g);
    // e a maré do abissal NÃO é a azul-clara da Nereia (água pura Nv.2): a
    // Nereia cavalga branca, aqui é o breu com espuma pálida e pouca
    expect(VISUALS.nereia.body).not.toBe(ABISSAL_TIDE);
    expect(luma(VISUALS.nereia.body)).toBeGreaterThan(luma(ABISSAL_TIDE));
    expect(WATER_TIDE_LOOK.foamAmt).toBeLessThan(0.35);
    // e o marrom zero: nenhum look do figurino carrega r > g (a peia do Pântano)
    for (const L of [WATER_TIDE_LOOK, WATER_TIDE_DEEP_LOOK, BONE_LOOK, MEMBRANE_LOOK]) {
      const body = 'mid' in L ? new THREE.Color(L.mid) : new THREE.Color(L.iceA);
      expect(body.b).toBeGreaterThan(body.r);
    }
  });

  test('motor: o ladrão de vida — drain 0,4 + slow + poison, lowestHp, maré a 18,8 un/s', () => {
    expect(ABISSAL.base.damageElement).toBe('water');
    expect(ABISSAL.base.targeting).toBe('lowestHp'); // o tamboril caça o machucado
    expect(ABISSAL.base.hp).toBe(116);
    expect(ABISSAL.base.damage).toBe(15);
    expect(ABISSAL.base.range).toBe(10); // emboscada: alcance curto de emboscada
    const drain = ABISSAL.base.abilities.find((a) => a.kind === 'drain');
    expect(drain && 'factor' in drain && drain.factor).toBe(0.4); // a vida roubada
    expect(ABISSAL.base.abilities.some((a) => a.kind === 'slow')).toBe(true);
    expect(ABISSAL.base.abilities.some((a) => a.kind === 'poison')).toBe(true); // o veneno da isca
    expect(ABISSAL.base.resist.water).toBeGreaterThanOrEqual(0.3);
    expect(ABISSAL.base.resist.fire).toBeLessThan(0); // do fundo: o fogo dói

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 424242 });
    const st = eng.addRetainedUnit('abissal', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2);
    eng.startBattle();
    // varre o voo: a maré é guiada (vel = rumo × speed todo tick) e é a mais
    // RÁPIDA dos arremessos Nv.8 (base 8,5 × 1,12⁷ ≈ 18,8 — o tiro da água do
    // abismo chega antes da pedra do Geodo e da estrela do Cósmico)
    const SPEED8 =
      ABISSAL.base.projectileSpeed * Math.pow(LEVEL_PROJECTILE_MULT, 7) * BOARD_PROJECTILE_SCALE;
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 130; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles)
        if (p.species === 'abissal') {
          inFlight.push(p);
          const v = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
          expect(Math.abs(v - SPEED8)).toBeLessThan(0.01); // a maré não desacelera
        }
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(8);
      expect(p.damageElement).toBe('water');
      expect(p.abilities.some((a) => a.kind === 'drain')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'slow')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'poison')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'abissal');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(8);
  });

  test('o tiro é o corpo: globo da MESMA maré, vida roubada no bojo, sete ganchos colados', () => {
    // a gota arremessada é a MESMA água do corpo (identidade corpo→voo sem
    // trocar de cor) — só agitada (o arremesso arranca onda da casca)
    expect(ABISSAL_GLOB_LOOK.mid).toBe(WATER_TIDE_LOOK.mid);
    expect(ABISSAL_GLOB_LOOK.deep).toBe(WATER_TIDE_LOOK.deep);
    expect(ABISSAL_GLOB_LOOK.foam).toBe(WATER_TIDE_LOOK.foam);
    expect(ABISSAL_GLOB_LOOK.foamAmt).toBe(WATER_TIDE_LOOK.foamAmt); // maré morta voa sem cavalo de onda
    expect(ABISSAL_GLOB_LOOK.amp).toBeGreaterThanOrEqual(WATER_TIDE_LOOK.amp); // gota fresca: casca agitada
    // a VIDA ROUBADA no bojo (o `drain 0,4` desenhado: a presa vai dentro do
    // tiro, verde-água brilhando por baixo da casca escura) — a MESMA vida do
    // núcleo/lanterna do corpo, sempre acento
    expect(ABISSAL_CORE_LOOK.gold).toBe(CORE_LOOK.gold);
    expect(ABISSAL_CORE_LOOK.cool).toBe(CORE_LOOK.cool);
    // os ganchos colados na massa são o MESMO osso pálido do figurino com a
    // MESMA trinca da cor do motor — e sete faces (o splash começa no ar)
    expect(ABISSAL_HOOK_LOOK.iceA).toBe(BONE_LOOK.iceA);
    expect(ABISSAL_HOOK_LOOK.iceB).toBe(BONE_LOOK.iceB);
    expect(ABISSAL_HOOK_LOOK.crack).toBe(BONE_LOOK.crack);
  });

  test('coreografia: 0,92 s com 60% de sucção silenciosa e a mordida que ZERA no fim', () => {
    // a segunda calma da árvore (o Geodo ainda manda): janela menor que a
    // catedral, mas o tempo ABSOLUTO de afinação bate o Cósmico
    expect(ABISSAL_ATTACK_WINDOW).toBeLessThan(GEODO_ATTACK_WINDOW);
    expect(ABISSAL_ATTACK_WINDOW).toBeGreaterThan(COSMICO_ATTACK_WINDOW);
    expect(ABISSAL_WINDUP).toBe(0.6);
    expect(ABISSAL_WINDUP).toBeLessThan(GEODO_WINDUP);
    expect(ABISSAL_ATTACK_WINDOW * ABISSAL_WINDUP).toBeGreaterThan(COSMICO_ATTACK_WINDOW * COSMICO_WINDUP);

    const zeros = (P: AttackPose) =>
      [P.lure, P.gape, P.suck, P.inhale, P.stream, P.flare, P.charge, P.lean, P.surge].map((n) => n + 0);
    const idle = attackPose(-1);
    expect(zeros(idle)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // a sucção: o bicho CONGELA com a isca descendo na frente da goela aberta,
    // encolhe a massa, a vida sobe do peito para a garganta, a maré é puxada
    const tune = attackPose(ABISSAL_ATTACK_WINDOW * ABISSAL_WINDUP * 0.95);
    expect(tune.lure).toBeGreaterThanOrEqual(0.88); // a vara tombou até a vertical da goela
    expect(tune.gape).toBeGreaterThanOrEqual(0.8); // balde aberto SEMBARULHO
    expect(tune.suck).toBeGreaterThanOrEqual(0.88); // a sede: a vida subiu
    expect(tune.inhale).toBeLessThanOrEqual(-0.6); // a massa encolheu p/ caber no escuro
    expect(tune.stream).toBeGreaterThanOrEqual(0.5); // barbatanas recolhidas (silêncio)
    expect(tune.charge).toBeGreaterThanOrEqual(0.88);
    expect(tune.lean).toBeLessThan(0); // verga para trás na sucção
    expect(tune.surge).toBeLessThan(-0.4); // a maré sendo puxada para dentro
    // a MORDIDA é instantânea (a atinge o pico antes de 18% da janela de tiro):
    // goela bate, isca leva o susto, a vida ROUBADA mergulha no peito (o
    // `drain 0,4` pago em coreografia) e a barriga estufa
    const shot = attackPose(ABISSAL_ATTACK_WINDOW * (ABISSAL_WINDUP + 0.22 * (1 - ABISSAL_WINDUP)));
    expect(shot.gape).toBeLessThanOrEqual(-0.2); // -0,25: a mandíbula ESTALOU
    expect(shot.suck).toBeLessThanOrEqual(-0.4); // a vida roubada desabou no peito
    expect(shot.inhale).toBeGreaterThanOrEqual(0.6); // de encolhido a ESTUFADO
    expect(shot.lure).toBeLessThan(0); // a isca recua do próprio susto
    expect(shot.surge).toBeGreaterThanOrEqual(0.9); // a maré jorrou para fora
    expect(shot.lean).toBeGreaterThanOrEqual(0.8); // o mergulho do bote
    expect(shot.stream).toBeLessThanOrEqual(-0.9); // as barbatanas varreram para trás
    const late = attackPose(ABISSAL_ATTACK_WINDOW * 0.98);
    expect(Math.abs(late.gape)).toBeLessThan(Math.abs(shot.gape)); // tudo devolvendo
    expect(Math.abs(late.inhale)).toBeLessThan(Math.abs(shot.inhale));
    expect(late.charge).toBeLessThan(shot.charge);
    expect(Math.abs(late.lean)).toBeLessThan(Math.abs(shot.lean));
    // a coreografia ZERA exata no fim da janela (decay → 0): o tamboril
    // reassenta POR INTEIRO antes do próximo round (`+ 0`: decay=0 gera -0)
    expect(zeros(attackPose(ABISSAL_ATTACK_WINDOW))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(zeros(attackPose(ABISSAL_ATTACK_WINDOW + 0.2))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // amplitudes coreografadas: nada de membro arrancado no escuro
    for (let s = 0; s <= ABISSAL_ATTACK_WINDOW; s += 0.02) {
      const P = attackPose(s);
      expect(Math.abs(P.lure)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.gape)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.suck)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.inhale)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(P.stream)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.flare)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.charge)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.lean)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.surge)).toBeLessThanOrEqual(1.1);
    }
  });
});
