import * as THREE from 'three';
import {
  MODELS,
  VISUALS,
  partsForLevel,
  hasLevelVariants,
  PRIMORDIAL_HORIZON_R,
  PRIMORDIAL_DISK_R,
  PRIMORDIAL_DISK_Y,
  PRIMORDIAL_DISK_TILT,
  PRIMORDIAL_TILT_MAX,
  PRIMORDIAL_SPINDLE_R,
  PRIMORDIAL_HUB_R,
  PRIMORDIAL_TOWER_R,
  PRIMORDIAL_TOWER_K,
  PRIMORDIAL_MUZZLE,
  PRIMORDIAL_QUASAR,
  PRIMORDIAL_ICE,
  PRIMORDIAL_EMBER,
  PRIMORDIAL_FROST,
  PRIMORDIAL_DEEP,
} from '../scene/speciesModels';
import { TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { footprintRadius, slotFit } from '../data/footprints';
import { getGeometry } from '../scene/assets';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  GEOBRUTA_LOOK,
  CANTARIA_DEEP_LOOK,
  ICESTONE_LOOK,
  QUASAR_PLASMA,
  PRIMORDIAL_ATTACK_WINDOW,
  PRIMORDIAL_WINDUP,
  PRIMORDIAL_DISK_PIVOT,
  attackPose,
  primTowerPivot,
} from '../scene/PrimordialRig';
import { ASTRAL_ATTACK_WINDOW, ASTRAL_STARLIGHT, ASTRAL_FROST } from '../scene/AstralRig';
import {
  COLOSSO_ATTACK_WINDOW,
  COLOSSO_DEEP,
  COLOSSO_MAGMA,
  COLOSSO_REGOLITO,
  COLOSSO_TALC,
} from '../scene/ColossoRig';
import {
  PRIMORDIAL_RAY_CORE_LOOK,
  PRIMORDIAL_SPARK_LOOK,
} from '../scene/ProjectileField';
// o TEXTO cru dos dois arquivos do pipeline (vite `?raw`): é assim que o pin
// estático do lesson WebKit lê os shaders sem rodar WebGL (vite/client declara
// `*?raw`)
import RigSource from '../scene/PrimordialRig.tsx?raw';
import GateSource from '../scene/BloomGate.tsx?raw';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do PRIMORDIAL (Nv.10 — Astral+Colosso: a entidade que precede os quatro
 * elementos, um QUASAR SUPERMASSIVO com disco de acreção). As regras amarradas
 * aqui (testes simples, sem auditoria de malha):
 *  * o DNA é o DEZESSETE EM TUDO: todo `cyl`/`cone` tem DEZESSETE faces (Geodo
 *    CINCO, Cristal SEIS, Abissal SETE, Cósmico OITO, Vulcânico NOVE, Astral
 *    ONZE, Colosso TREZE — nenhum outro figurino usa dezessete) e a corte é
 *    dezessete em cada família (almofadas, pilares, arcobotantes, lages);
 *  * a ASSINATURA é o DISCO DE ACREFÃO — UMA só peça `ring` com shader próprio;
 *    o astro NÃO tem geometria: o buraco ρ<0,62 fica vazio e a luz é pintura;
 *  * a FÍSICA DO PLANO VARRIDO manda a planta: com o tilt oscilando até 0,5,
 *    toda peça ou fica toda no furo, ou toda abaixo do arco, ou toda acima do
 *    teto, ou toda fora da borda — com folga ≥ 0,15 do plano varrido;
 *  * as garras moram nas DUAS TORRES (k 4 e 13, o par espelhado no Z de um
 *    polígono de 17 lados) e giram no eixo VERTICAL da torre: mesmo uma volta
 *    completa nunca furaria a borda do disco;
 *  * a paleta é GEOBRUTA (a pedra mais CLARA da árvore) com o veio de azó
 *    (#e8f6ff = projectileColor do motor) em toda pedra, e o breu-roxo mais
 *    FUNDO da árvore por dentro;
 *  * coreografia: janela 0,94 — a cadência do Nv.10 (interval 1,5) fica entre o
 *    astral (0,74 no 1,2) e o colosso (1,25 no 2,5); 60% é só a coleta das
 *    garras e o jato IGNORA do zero, estoura no meio do sopro e assenta no zero;
 *  * motor: `lowestHp`, os QUATRO elementos resistidos (só o Nv.10 precede
 *    todos), `pierce 2` + `chain 3` + o `splash 2,5` mais LARGO da árvore e a
 *    rajada `#e8f6ff` no projétil mais RÁPIDO.
 */

const PRIMORDIAL = getSpecies('primordial');
const COLOSSO = getSpecies('colosso');
const LV = 10 as MonsterLevel;

const P10 = () => partsForLevel(MODELS.primordial, 10);

const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** métricas EXATAS da peça transformada (vértices reais, sem caixa conservadora) */
function exact(p: { g: string; a: number[]; p: number[]; r?: number[]; s?: number[] }) {
  const geo = getGeometry(p.g as never, p.a as never);
  const pos = geo.getAttribute('position');
  const scale = Array.isArray(p.s) ? p.s : [p.s?.[0] ?? 1, 1, 1];
  const r = p.r ?? [0, 0, 0];
  _euler.set(r[0], r[1], r[2], 'XYZ');
  _q.setFromEuler(_euler);
  _m4.compose(new THREE.Vector3(...p.p), _q, new THREE.Vector3(scale[0], scale[1], scale[2]));
  let rhoMin = Infinity;
  let rhoMax = 0;
  let yLo = Infinity;
  let yHi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(_m4);
    const rho = Math.hypot(_v.x, _v.z);
    if (rho < rhoMin) rhoMin = rho;
    if (rho > rhoMax) rhoMax = rho;
    if (_v.y < yLo) yLo = _v.y;
    if (_v.y > yHi) yHi = _v.y;
  }
  return { rhoMin, rhoMax, yLo, yHi };
}

describe('Primordial: quasar supermassivo com disco de acreção (Nv.10)', () => {
  test('rig próprio, plantado, denso, e o invólucro cabe no slot sem afundar', () => {
    expect(SPECIES_RIGS.primordial).toBeTruthy();
    expect(PRIMORDIAL.levelMin).toBe(10);
    expect(PRIMORDIAL.levelMax).toBe(10);
    expect(hasLevelVariants(MODELS.primordial)).toBe(false);
    // PLANTADO: o templo não afunda no piso nem boia (as almofadas flutuam
    // miúdo a ~0,17 — o quasar paira sobre o deck), e o bob é curto senão o
    // UnitView descolaria a corte
    expect(MODELS.primordial.floatY).toBe(0);
    expect(MODELS.primordial.bob ?? 0).toBeLessThanOrEqual(0.02);
    expect(PRIMORDIAL.base.moveSpeed).toBe(0);
    // orçamento denso (a régua da árvore: cósmico 141, COLUSSO 221, e o Nv.10
    // fica no meio: a assinatura é o disco pintado, não mais malha)
    expect(P10().length).toBe(145);
    const env = partsEnvelope(P10());
    const halfX = Math.max(env.maxX, -env.minX);
    const footMax = Math.max(env.maxX, -env.minX, env.maxZ, -env.minZ);
    expect(halfX).toBeGreaterThanOrEqual(2.2);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    // plantado: nunca afunda (as almofadas pairam a ~0,17) e o teto usa a forma
    expect(env.minY).toBeGreaterThanOrEqual(-0.01);
    expect(env.minY).toBeLessThan(0.3);
    expect(env.maxY).toBeGreaterThanOrEqual(5.5);
    expect(env.maxY).toBeLessThanOrEqual(formTop(PRIMORDIAL, 10) + 0.25); // 6,45
    // o MEDIDO da tabela casa com o invólucro real (a régua do board.test)
    expect(Math.abs(footprintRadius('primordial' as never, LV) - footMax)).toBeLessThan(1.2);
    const fit = slotFit('primordial' as never);
    expect(fit).toBeGreaterThan(0.6); // nem miúdo demais
    expect(fit).toBeLessThanOrEqual(1); // o UnitView reduz, nunca estica
  });

  test('DNA DEZESSETE EM TUDO: todo cyl/cone tem dezessete faces e a corte é dezessete em cada família', () => {
    const parts = P10();
    for (const p of parts) {
      if (p.g === 'cyl') expect(p.a[3]).toBe(17);
      if (p.g === 'cone') expect(p.a[2]).toBe(17);
    }
    // a corte: dezessete almofadas + dezessete pilares + dezessete arcobotantes
    // + dezessete lages (as lages do soalho são a família SEM tag)
    for (const tag of ['court.pad', 'court.pylon', 'court.brace'])
      expect(parts.filter((p) => p.tag === tag).length).toBe(17);
    expect(parts.filter((p) => p.tag === undefined).length).toBe(17);
    // as TORRES nos flancos k 4 e k 13 — o ÚNICO par de 17 lados espelhado no Z
    // (k e 17−k): é o berço das garras
    for (const tag of ['court.tower.pad', 'court.tower', 'court.tower.brace'])
      expect(parts.filter((p) => p.tag === tag).length).toBe(2);
    const ks = parts
      .filter((p) => p.tag === 'court.tower.pad')
      .map((p) => Math.round((Math.atan2(p.p[2], p.p[0]) / (Math.PI * 2)) * 17 + 17) % 17)
      .sort();
    expect(ks).toEqual([...PRIMORDIAL_TOWER_K].sort());
    expect(PRIMORDIAL_TOWER_K[0] + PRIMORDIAL_TOWER_K[1]).toBe(17);
    // o DISCO é UMA só peça de pintura: ring do horizonte à borda, e NÃO é
    // grupo — o rig inclina o anel sozinho e o shader gira as bandas
    const disk = parts.filter((p) => p.tag === 'disk.accr');
    expect(disk.length).toBe(1);
    expect(disk[0].g).toBe('ring');
    expect(disk[0].a).toEqual([PRIMORDIAL_HORIZON_R, PRIMORDIAL_DISK_R, 96]);
    expect(disk[0].m).toBe('trans');
    expect(disk[0].group).toBeUndefined();
    // a goela do buraco (5), a coroa ascendente (9), as garras (20 = 10×mz),
    // as cintas de entulho (11+11), o orbe alto (10) e as lunetas dos quatro
    // elementos que ele precede (4)
    for (const t of ['well.collar', 'well.skirt', 'well.spindle', 'well.hub', 'well.cap'])
      expect(parts.filter((p) => p.tag === t).length).toBe(1);
    expect(parts.filter((p) => p.tag === 'crown.mast').length).toBe(1);
    expect(parts.filter((p) => p.tag === 'crown.ring').length).toBe(2);
    expect(parts.filter((p) => p.tag === 'crown.spike').length).toBe(3);
    expect(parts.filter((p) => p.tag === 'crown.lamp').length).toBe(3);
    for (const t of ['arm.drum', 'arm.upper', 'arm.elbow', 'arm.fore', 'arm.wrist', 'arm.core', 'arm.tail'])
      expect(parts.filter((p) => p.tag === t).length).toBe(2);
    expect(parts.filter((p) => p.tag === 'arm.claw').length).toBe(6); // garras-três unhas cada
    expect(parts.filter((p) => p.tag === 'debris.ring').length).toBe(11);
    expect(parts.filter((p) => p.tag === 'debris.court').length).toBe(11);
    expect(parts.filter((p) => p.tag === 'orbital.hub').length).toBe(1);
    expect(parts.filter((p) => p.tag === 'orbital.rock').length).toBe(8);
    expect(parts.filter((p) => p.tag === 'orbital.comet').length).toBe(1);
    for (const t of ['sat.fire', 'sat.water', 'sat.earth', 'sat.air'])
      expect(parts.filter((p) => p.tag === t).length).toBe(1);
    // os CINCO corpos orbitais em velocidades diferentes; o DISCO nunca é grupo
    const groups = MODELS.primordial.groups ?? {};
    expect(Object.keys(groups)).toEqual(['0', '1', '3', '4', '5']);
    expect(groups[0]).toBeCloseTo(0.34, 3);
    expect(groups[1]).toBeCloseTo(-0.62, 3);
    expect(groups[3]).toBeCloseTo(0.5, 3);
    expect(groups[4]).toBeCloseTo(-0.38, 3);
    expect(groups[5]).toBeCloseTo(-0.7, 3);
    expect(Math.sign(groups[0])).not.toBe(Math.sign(groups[1])); // cintas em sentidos opostos
    expect(Math.sign(groups[1])).toBe(Math.sign(groups[4])); // orbe alto com a cinta do meio
    // a régua anti low-poly da árvore nos rod (9 segs/unit) e toros (13×34)
    for (const p of parts) if (p.g === 'torus') expect(p.a[3]).toBeGreaterThanOrEqual(12);
  });

  test('o plano varrido manda a planta: furo vazio, três zonas com folga, torres por fora e a rajada sai do furo', () => {
    const parts = P10();
    const met = parts.map((p) => ({ p, e: exact(p as never) }));

    // o astro NÃO tem geometria: o furo ρ<0,62 é só o poço do fuso — peça com
    // CENTRO na faixa do plano tem que projetar INTEIRA no furo ou INTEIRA fora
    const invadindoFuro: string[] = [];
    for (const { p, e } of met) {
      if (p.tag === 'disk.accr') continue;
      if (Math.abs(p.p[1] - PRIMORDIAL_DISK_Y) >= 0.3) continue;
      if (e.rhoMax >= PRIMORDIAL_HORIZON_R && e.rhoMin <= PRIMORDIAL_DISK_R)
        invadindoFuro.push(`${p.tag ?? p.m} ρ[${e.rhoMin.toFixed(2)},${e.rhoMax.toFixed(2)}]`);
    }
    expect(invadindoFuro).toEqual([]);
    // fuso e cubo SEMPRE dentro do furo (o anel nunca os toca)
    for (const t of ['well.spindle', 'well.hub', 'well.cap']) {
      const q = met.find((x) => x.p.tag === t)!;
      expect(q.e.rhoMax).toBeLessThan(PRIMORDIAL_HORIZON_R);
    }
    expect(PRIMORDIAL_SPINDLE_R).toBeLessThan(PRIMORDIAL_HORIZON_R);
    expect(PRIMORDIAL_HUB_R).toBeLessThan(PRIMORDIAL_HORIZON_R);

    // zona das três casas: com o tilt no MÁXIMO (0,5) toda peça que cruza o
    // anel em ρ tem que passar longe do arco varrido (Y_D ± ρ·tan t) — folga 0,15
    const tan = Math.tan(PRIMORDIAL_TILT_MAX);
    expect(PRIMORDIAL_TILT_MAX).toBeGreaterThan(PRIMORDIAL_DISK_TILT); // o rig oscila mais fundo que o descanso
    for (const { p, e } of met) {
      if (p.tag === 'disk.accr') continue;
      if (e.rhoMax < PRIMORDIAL_HORIZON_R) continue; // toda no furo: imune
      if (e.rhoMin > PRIMORDIAL_DISK_R) continue; // toda fora da borda: imune
      const rhoWorst = Math.min(e.rhoMax, PRIMORDIAL_DISK_R);
      const below = PRIMORDIAL_DISK_Y - rhoWorst * tan - e.yHi; // passa POR BAIXO do arco
      const above = e.yLo - (PRIMORDIAL_DISK_Y + rhoWorst * tan); // passa POR CIMA do teto
      expect(Math.max(below, above)).toBeGreaterThanOrEqual(0.14);
    }

    // as torres do braço ficam POR FORA da borda (ρ 2,62, raio miúdo). O
    // arcobotante da torre (court.tower.brace) ancora na corte a ρ 2,19 — este
    // passa POR BAIXO do arco (zona de baixo), por isso só haste e almofada
    // entram no pino de "por fora"
    for (const p of parts.filter((q) => q.tag === 'court.tower' || q.tag === 'court.tower.pad')) {
      expect(exact(p as never).rhoMin).toBeGreaterThan(PRIMORDIAL_DISK_R);
    }
    expect(PRIMORDIAL_TOWER_R).toBeGreaterThan(PRIMORDIAL_DISK_R); // o eixo da torre já nasce fora da borda
    // as garras giram no eixo VERTICAL da torre (o rig: β = gather·0,26 +
    // respiração 0,012, espelhado por lado). Varrendo β até ±0,3 rad (folga
    // sobre o teto real do rig), NENHUM vértice da garra pode furar a borda do
    // disco — a coleta só varre o exterior
    const BETA_TETO = 0.3;
    let varrido = Infinity;
    for (const side of [1, -1]) {
      const pivot = primTowerPivot(side);
      for (const p of parts.filter((q) => (q.tag ?? '').startsWith('arm.') && Math.sign(q.p[2]) === side)) {
        const geo = getGeometry(p.g as never, p.a as never);
        const pos = geo.getAttribute('position');
        const r = p.r ?? [0, 0, 0];
        _euler.set(r[0], r[1], r[2], 'XYZ');
        _q.setFromEuler(_euler);
        const s = Array.isArray(p.s) ? p.s : [1, 1, 1];
        _m4.compose(new THREE.Vector3(...p.p), _q, new THREE.Vector3(s[0], s[1], s[2]));
        for (let b = 0; b <= 24; b++) {
          const th = -BETA_TETO + (b / 24) * 2 * BETA_TETO;
          const ct = Math.cos(th);
          const st = Math.sin(th);
          for (let i = 0; i < pos.count; i++) {
            _v.fromBufferAttribute(pos, i).applyMatrix4(_m4);
            const dx = _v.x - pivot[0];
            const dz = _v.z - pivot[2];
            varrido = Math.min(varrido, Math.hypot(pivot[0] + dx * ct - dz * st, pivot[2] + dx * st + dz * ct));
          }
        }
      }
    }
    expect(varrido).toBeGreaterThan(PRIMORDIAL_DISK_R);

    // o espelho mz das garras é EXATO (|z| 6 casas): k e 17−k no mesmo `mz`
    const z6 = (v: number) => (Math.round(v * 1e6) / 1e6).toFixed(6);
    const semPar: string[] = [];
    for (const p of parts) {
      if (!(p.tag ?? '').startsWith('arm.')) continue;
      const has = parts.some(
        (q) =>
          q !== p &&
          (q.tag ?? '') === p.tag &&
          z6(q.p[0]) === z6(p.p[0]) &&
          z6(q.p[1]) === z6(p.p[1]) &&
          z6(Math.abs(q.p[2])) === z6(Math.abs(p.p[2])),
      );
      if (!has) semPar.push(`${p.tag} @ ${p.p}`);
    }
    expect(semPar).toEqual([]);

    // o pivô do disco É o centro do anel (o wrapper só inclina; o spin é do
    // shader) e a rajada sai do FURO do horizonte, no plano do disco
    const ring = parts.find((p) => p.tag === 'disk.accr')!;
    expect(PRIMORDIAL_DISK_PIVOT).toEqual([ring.p[0], ring.p[1], ring.p[2]]);
    expect(Math.hypot(PRIMORDIAL_MUZZLE[0], PRIMORDIAL_MUZZLE[2])).toBeLessThan(PRIMORDIAL_HORIZON_R);
    expect(PRIMORDIAL_MUZZLE[1]).toBe(PRIMORDIAL_DISK_Y);
  });

  test('paleta amarrada: geada bruta (a pedra mais clara da árvore) com o azó do motor em toda pedra', () => {
    expect(PRIMORDIAL_QUASAR).toBe('#e8f6ff');
    expect(PRIMORDIAL_ICE).toBe('#9ad0ff');
    expect(PRIMORDIAL_EMBER).toBe('#ff7a3c');
    expect(PRIMORDIAL_FROST).toBe('#d8e4f2');
    expect(PRIMORDIAL_DEEP).toBe('#241f33');
    // a identidade atravessa motor, figurino, rig e projeção: a cor do motor É
    // o veio de toda pedra e o plasma do horizonte
    expect(PRIMORDIAL.base.projectileColor).toBe(PRIMORDIAL_QUASAR);
    expect(VISUALS.primordial.body).toBe(PRIMORDIAL_FROST);
    expect(VISUALS.primordial.dark).toBe(PRIMORDIAL_DEEP);
    expect(VISUALS.primordial.glow).toBe(PRIMORDIAL_QUASAR);
    expect(VISUALS.primordial.accent).toBe(PRIMORDIAL_ICE);
    for (const L of [GEOBRUTA_LOOK, CANTARIA_DEEP_LOOK, ICESTONE_LOOK]) expect(L.crack).toBe(PRIMORDIAL_QUASAR);
    expect(GEOBRUTA_LOOK.rockA).toBe(PRIMORDIAL_FROST);
    expect(CANTARIA_DEEP_LOOK.rockA).toBe(PRIMORDIAL_DEEP);
    expect(QUASAR_PLASMA.gold).toBe(PRIMORDIAL_QUASAR);
    expect(QUASAR_PLASMA.cool).toBe(PRIMORDIAL_ICE); // contorno de gelo, nunca o azul-elétrico do Raio
    // o veio é CONTIDO (com o disco inteiro aceso em HDR, veio solto viraria
    // lanterna): glow·boost < 0,2
    expect(GEOBRUTA_LOOK.crackGlow * GEOBRUTA_LOOK.crackBoost).toBeLessThan(0.2);
    // CONTRASTE DE QUASAR: a geobruta é a pedra mais CLARA da árvore (passa o
    // talco do Colosso — é o que faz o print ler templo de quasar) e o breu
    // roxo é o mais FUNDO (mais escuro que o breu do pai Colosso)
    expect(luma(PRIMORDIAL_FROST)).toBeGreaterThan(luma(COLOSSO_TALC));
    expect(luma(COLOSSO_TALC)).toBeGreaterThan(luma(COLOSSO_REGOLITO));
    expect(luma(PRIMORDIAL_DEEP)).toBeLessThan(luma(COLOSSO_DEEP));
    expect(luma(GEOBRUTA_LOOK.rockB)).toBeLessThan(luma(PRIMORDIAL_FROST)); // a sombra da pedra, nunca a pedra
    // o print separa o filho dos dois pais: nem o âmbar do Astral, nem o magma
    // do Colosso, nem a geada do Astral, nem o regolito do Colosso
    expect(VISUALS.primordial.glow).not.toBe(ASTRAL_STARLIGHT);
    expect(VISUALS.primordial.accent).not.toBe(ASTRAL_FROST);
    expect(VISUALS.primordial.glow).not.toBe(COLOSSO_MAGMA);
    expect(VISUALS.primordial.body).not.toBe(COLOSSO_TALC);
    expect(VISUALS.primordial.body).not.toBe(COLOSSO_REGOLITO);
  });

  test('coreografia: janela 0,94 (60% de coleta), jato ignora do zero, estoura no meio e assenta no zero', () => {
    // a cadência do Nv.10 (interval 1,5) fica ENTRE os pais: astral 0,74 /
    // primordial 0,94 / colosso 1,25
    expect(PRIMORDIAL_ATTACK_WINDOW).toBeGreaterThan(ASTRAL_ATTACK_WINDOW);
    expect(PRIMORDIAL_ATTACK_WINDOW).toBeLessThan(COLOSSO_ATTACK_WINDOW);
    expect(PRIMORDIAL_WINDUP).toBe(0.6); // fração: 0,564 de coleta pra 0,376 de sopro
    const u = PRIMORDIAL_ATTACK_WINDOW;
    const w = u * PRIMORDIAL_WINDUP;
    const keys = ['gather', 'lean', 'charge', 'flare', 'jet', 'recoil', 'quake'] as const;
    const zero = (s: number) => keys.forEach((k) => expect(attackPose(s)[k]).toBe(0));
    zero(-1);
    zero(u + 0.2);
    expect(attackPose(0).gather).toBe(0); // começa do descanso sem solavanco
    // no fim da coleta a garra travou ensacando, o templo tombou pra trás e o
    // disco está no máximo de carga (o cometa segurado murchou todo)
    const wind = attackPose(w - 0.01);
    expect(wind.gather).toBeGreaterThan(0.95);
    expect(wind.lean).toBeLessThan(-0.5);
    expect(wind.charge).toBeGreaterThan(0.9);
    // CONTINUIDADE no frame do tiro: gather/lean/charge não cortam (só o flare
    // da tampa é impulso declarado na ignição — a convenção do poço do Colosso)
    const before = attackPose(w - 0.001);
    const strike = attackPose(w + 0.001);
    for (const k of ['gather', 'lean', 'charge'] as const)
      expect(Math.abs(strike[k] - before[k])).toBeLessThan(0.02);
    expect(strike.flare).toBeGreaterThan(0);
    expect(strike.jet).toBeLessThan(0.02); // o jato IGNORA do zero: aceso em 0 no frame do corte
    // no meio do sopro o jato estoura no máximo com a gravidade cedendo e o
    // recuo afundando o templo no soalho
    const mid = attackPose(w + (u - w) * 0.435);
    expect(mid.jet).toBeGreaterThan(0.99);
    expect(mid.quake).toBeGreaterThan(0.3);
    expect(Math.abs(mid.recoil)).toBeGreaterThan(0.15);
    // e o jato ASSENTA em 0 aos 87% do sopro (nada de jato aceso no fim da pose)
    expect(Math.abs(attackPose(w + (u - w) * 0.87).jet)).toBeLessThan(0.01);
    // TUDO assenta no zero antes do fim da janela
    const late = attackPose(u * 0.999);
    for (const k of keys) expect(Math.abs(late[k])).toBeLessThan(0.05);
    // nenhuma pose ultrapassa as amplitudes coreografadas
    for (let s = 0; s <= u; s += 0.02) {
      const p = attackPose(s);
      expect(Math.abs(p.lean)).toBeLessThanOrEqual(0.65);
      expect(Math.abs(p.gather)).toBeLessThanOrEqual(1);
      expect(p.charge).toBeLessThanOrEqual(1);
      expect(p.jet).toBeLessThanOrEqual(1);
      expect(Math.abs(p.recoil)).toBeLessThanOrEqual(0.65); // jet·(1−r) topa em ~0,62 (r≈0,32 do sopro)
      expect(p.quake).toBeLessThanOrEqual(1);
      expect(p.flare).toBeLessThanOrEqual(1.7);
    }
  });

  test('motor: o Nv.10 precede os quatro elementos, caça o mais fraco e cospe a rajada mais rápida e mais larga da árvore', () => {
    expect(PRIMORDIAL.elements).toEqual(['fire', 'water', 'earth', 'air']);
    expect(PRIMORDIAL.base.targeting).toBe('lowestHp'); // o horizonte só come o que tem menos massa
    expect(PRIMORDIAL.base.damageElement).toBe('water');
    expect(PRIMORDIAL.base.hp).toBe(130);
    expect(PRIMORDIAL.base.damage).toBe(30);
    expect(PRIMORDIAL.base.range).toBe(12);
    expect(PRIMORDIAL.base.projectileSpeed).toBe(12); // o mais RÁPIDO (o colosso cravou o mais lento em ≤7)
    // o único da árvore com os QUATRO elementos resistidos — ele os precede
    for (const el of ['fire', 'water', 'earth', 'air'] as const)
      expect(PRIMORDIAL.base.resist[el]).toBe(0.25);
    const ab = PRIMORDIAL.base.abilities;
    const pierce = ab.find((a) => a.kind === 'pierce');
    const splash = ab.find((a) => a.kind === 'splash');
    const chain = ab.find((a) => a.kind === 'chain');
    expect(pierce && 'factor' in pierce && pierce.factor).toBe(2);
    expect(chain && 'jumps' in chain && chain.jumps).toBe(3);
    // o splash mais LARGO da árvore (colosso 2,2 era o dono da coroa)
    const coSplash = COLOSSO.base.abilities.find((a) => a.kind === 'splash');
    expect(splash && 'radius' in splash && splash.radius).toBe(2.5);
    expect(coSplash && 'radius' in coSplash && coSplash.radius).toBeLessThan(2.5);
    expect(ab.some((a) => a.kind === 'burn' && a.chance === 0.4)).toBe(true);
    expect(ab.some((a) => a.kind === 'slow' && 'slowFactor' in a && a.slowFactor === 0.5)).toBe(true);
    expect(ab.some((a) => a.kind === 'regen' && 'factor' in a && a.factor === 0.05)).toBe(true);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 31110 });
    const st = eng.addRetainedUnit('primordial', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    eng.startBattle();
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 150; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles) if (p.species === 'primordial') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(10);
      expect(p.damageElement).toBe('water');
      // as munições chegam ARMADAS: a rajada é pierce + splash + chain de fábrica
      for (const kind of ['pierce', 'splash', 'chain', 'burn', 'slow'])
        expect(p.abilities.some((a) => a.kind === kind)).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'primordial');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(10);
  });

  test('a rajada arremessada é LUZ-DE-AZO: geobruta em voo com o plasma do horizonte no núcleo e gelo na cauda', () => {
    // o corpo do tiro é a MESMA geobruta do figurino lida em voo com o plasma
    // do MESMO horizonte (a tampa do fuso) — identidade boca→rajada→FX na cor
    // do motor — e o gelo no fresnel (o templo contorna a luz, nunca o azul
    // elétrico do Raio puro)
    expect(PRIMORDIAL_RAY_CORE_LOOK.gold).toBe(PRIMORDIAL_QUASAR);
    expect(PRIMORDIAL_RAY_CORE_LOOK.gold).toBe(PRIMORDIAL.base.projectileColor);
    expect(PRIMORDIAL_RAY_CORE_LOOK.cool).toBe(PRIMORDIAL_ICE);
    // as dezessete fagulhas da cauda são o gelo das lunetas com o veio de azó
    // (o degrau #7fb0dd é o do padrão COLOSSO_BLOCK_LOOK: lasca miúda precisa
    // de um degrau acima da pedra accent para o print ler farpa, não seixo)
    expect(PRIMORDIAL_SPARK_LOOK.crack).toBe(PRIMORDIAL_QUASAR);
    expect(PRIMORDIAL_SPARK_LOOK.rockA).toBe('#7fb0dd');
    expect(luma(PRIMORDIAL_SPARK_LOOK.rockA)).toBeLessThan(luma(QUASAR_PLASMA.white)); // a cauda de gelo nunca clareia mais que o miolo
  });
});

/**
 * LESSON DO "QUADRADO PRETO" (nov/2026, iOS/WebKit — qa/probe-frozen|nansource|blackfix.mjs):
 * `pow(base<0, fração)` em GLSL é INDEFINIDO -> punhado de texels NaN na cena HDR; a
 * escada de mips do UnrealBloomPass AMPLIFICA a contaminação (medido: 6 -> 912 -> 309.132
 * texels) e o compósito somatório devolve a mancha pro buffer da cena — amostrada pela
 * cópia final como PRETO PURO, um quadrado fixo de 560x556 px na tela. O jsdom não roda
 * WebGL, então a rede é o TEXTO da fonte: o rig escreve discard à prova de NaN e base de
 * pow clampada, e o composer segura o cinto de sanificação com o MSAA `samples: 4` vivo.
 */
describe('lesson WebKit: a cena HDR não escreve NaN e o composer tem cinto anti-não-finito', () => {
  const rig = RigSource;
  const gate = GateSource;

  test('discard nenhum do rig é "ao natural" (NaN escapa de `x <= c`; invertido ele captura)', () => {
    expect(rig).not.toMatch(/if \([a-z][\w.]* <= [0-9.]+\) discard/);
    expect(rig).toMatch(/if \(!\(a > 0\.002\)\) discard;/); // jato
    expect(rig.match(/\bdiscard;/g)!.length).toBeGreaterThanOrEqual(2);
  });

  test('as bases de pow do rig têm sinal garantido: o jato CLAMPA o along, o anel quadrado é multiplicação', () => {
    expect(rig).toMatch(/float along = clamp\(vUv\.y, 0\.0, 1\.0\);/);
    expect(rig).toMatch(/exp\(-drho \* drho\)/); // pow(base<0, 2.0) também é INDEFINIDO
    expect(rig).not.toMatch(/exp\(-pow\(/);
  });

  test('o composer tem o cinto de sanificação no slot do resolve e o MSAA continua samples 4', () => {
    expect(gate).toContain('new ShaderPass(SANITIZE_SHADER)');
    expect(gate).toContain('65504.0');
    expect(gate).toContain('samples: 4');
    expect(gate).toContain('composer.renderTarget2.samples = 0');
  });
});
