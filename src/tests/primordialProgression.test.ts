import * as THREE from 'three';
import {
  MODELS,
  VISUALS,
  partsForLevel,
  hasLevelVariants,
  PRIMORDIAL_HORIZON_R,
  PRIMORDIAL_DISK_IN,
  PRIMORDIAL_DISK_R,
  PRIMORDIAL_DISK_Y,
  PRIMORDIAL_DISK_TILT,
  PRIMORDIAL_TILT_MAX,
  PRIMORDIAL_LENS_TOP_R,
  PRIMORDIAL_LENS_TOP_TUBE,
  PRIMORDIAL_LENS_TOP_ARC,
  PRIMORDIAL_LENS_BOT_R,
  PRIMORDIAL_LENS_BOT_TUBE,
  PRIMORDIAL_LENS_BOT_ARC,
  PRIMORDIAL_PHOTON_R,
  PRIMORDIAL_MUZZLE,
  PRIMORDIAL_QUASAR,
  PRIMORDIAL_GOLD,
  PRIMORDIAL_EMBER,
  PRIMORDIAL_DEEP,
} from '../scene/speciesModels';
import { TILE_SPACING_X } from '../game/board';
import { formMuzzleY, formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { footprintRadius, slotFit } from '../data/footprints';
import { getGeometry } from '../scene/assets';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  SINTER_LOOK,
  QUASAR_PLASMA,
  PRIMORDIAL_ATTACK_WINDOW,
  PRIMORDIAL_WINDUP,
  PRIMORDIAL_SPIN,
  PRIMORDIAL_DISK_PIVOT,
  attackPose,
} from '../scene/PrimordialRig';
import { ASTRAL_ATTACK_WINDOW, ASTRAL_STARLIGHT, ASTRAL_FROST } from '../scene/AstralRig';
import {
  COLOSSO_ATTACK_WINDOW,
  COLOSSO_DEEP,
  COLOSSO_MAGMA,
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
 * elementos). Desde o rework artístico de 03/nov o monstro é APENAS o QUASAR
 * (pedido pelo usuário): o templo dos dezessete pilares caiu e não sobrou uma
 * pedra. As regras amarradas aqui (testes simples, sem auditoria de malha):
 *  * CINCO peças só: a ESFERA NEGRA do horizonte (agora COM geometria — o
 *    buraco é `black`, breu puro), o DISCO DE ACREÇÃO (UMA peça `ring`, ρ
 *    0,96→3,0 — nasce EMBUTIDO na esfera, 32% mais largo que o desenho
 *    antigo), o ANEL DE FÓTONS e os DOIS ARCOS DE LENTE (a silhueta SUPERIOR
 *    e INFERIOR do disco sobre o breu — o look Gargantua do Interestelar);
 *  * o DNA DEZESSETE sobrevive nas COSTURAS das curvas: esfera cortada em
 *    34(=2×17)×17, disco 6×17=102 segmentos, toros do céu com 17×34 — e NÃO
 *    sobrou nenhum cyl/cone (as varas e pontas do templo morreram);
 *  * o par de lentes mora no plano VERTICAL de frente (XY do modelo, só rotação
 *    em Z) e arqueia por CIMA e por BAIXO da esfera: o pino da silhueta é
 *    yHi(lens.top) > Y_D + r_horizonte e yLo(lens.bottom) < Y_D − r_horizonte;
 *  * o quasar PAIRA: com o tilt no máximo o disco desce a Y_D − ρ·sen(0,5) ≈
 *    0,95 na borda e a lente de baixo para 0,91 — nada encosta no deck;
 *  * a rotação é ALTA (PRIMORDIAL_SPIN.base ≥ 2, era 0,5 no desenho lento);
 *  * a paleta é OURO-QUASAR: #ffeccb (motor/anél/veio) + #ffd66b (disco) +
 *    #ff7a3c (borda esfriando) sobre #0e0a16 (breu), amarrada motor↔figurino↔
 *    rig↔projétil↔FX pela MATÉRIA VITRIFICADA;
 *  * coreografia: janela 0,94 — a cadência do Nv.10 (1,5) fica entre o astral
 *    (0,74) e o colosso (1,25); o jato IGNORA do zero, estoura no meio do
 *    sopro e assenta no zero (sem `gather`: as garras morreram);
 *  * motor: `lowestHp`, os QUATRO elementos resistidos, `pierce 2` + `chain 3`
 *    + o `splash 2,5` mais LARGO da árvore e a rajada #ffeccb no projétil mais
 *    RÁPIDO.
 */

const PRIMORDIAL = getSpecies('primordial');
const COLOSSO = getSpecies('colosso');
const LV = 10 as MonsterLevel;

const P10 = () => partsForLevel(MODELS.primordial, 10);

const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
/** quente de verdade: o canal azul da cor fica ABAIXO do verde (ouro, não gelo) */
const warm = (hex: string) => {
  const c = new THREE.Color(hex);
  return c.b < c.g;
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

describe('Primordial: quasar puro — esfera negra, disco largo e silhueta de lente (Nv.10)', () => {
  test('rig próprio, parando, quasar PURO: cinco peças e o invólucro cabe no slot sem afundar', () => {
    expect(SPECIES_RIGS.primordial).toBeTruthy();
    expect(PRIMORDIAL.levelMin).toBe(10);
    expect(PRIMORDIAL.levelMax).toBe(10);
    expect(hasLevelVariants(MODELS.primordial)).toBe(false);
    // PARANDO: o quasar não afunda no deck nem boia no céu (o pivô do disco é o
    // plantio) e o bob é curto senão o UnitView descolaria o envelope
    expect(MODELS.primordial.floatY).toBe(0);
    expect(MODELS.primordial.bob ?? 0).toBeLessThanOrEqual(0.02);
    expect(PRIMORDIAL.base.moveSpeed).toBe(0);
    // QUASAR PURO: o figurino inteiro são CINCO peças de céu (era 145 com o
    // templo; o rework de 03/nov derrubou cada pedra)
    expect(P10().length).toBe(5);
    // nenhum grupo orbital: sem lua, coroa nem entulho — disco e céu têm
    // wrapper próprio no rig
    expect(MODELS.primordial.groups).toBeUndefined();
    const env = partsEnvelope(P10());
    const halfX = Math.max(env.maxX, -env.minX);
    const footMax = Math.max(env.maxX, -env.minX, env.maxZ, -env.minZ);
    // largo (o disco de ρ 3,0 manda a meia-envergadura) mas nunca come o slot
    expect(halfX).toBeGreaterThanOrEqual(2.8);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    // parando: o ponto mais baixo do figurino (a lente de baixo, 0,91) nunca
    // encosta no deck
    expect(env.minY).toBeGreaterThanOrEqual(0.5);
    // o topo: o arco de lente limpa a cabeça da esfera negra (Y_D + r) e fica
    // dentro do topo autoral
    expect(env.maxY).toBeGreaterThan(PRIMORDIAL_DISK_Y + PRIMORDIAL_HORIZON_R);
    expect(env.maxY).toBeLessThanOrEqual(formTop(PRIMORDIAL, 10) + 0.25);
    // o MEDIDO da tabela casa com o invólucro real (a régua do board.test)
    expect(Math.abs(footprintRadius('primordial' as never, LV) - footMax)).toBeLessThan(1.2);
    const fit = slotFit('primordial' as never);
    expect(fit).toBeGreaterThan(0.6); // nem miúdo demais
    expect(fit).toBeLessThanOrEqual(1); // o UnitView reduz, nunca estica
  });

  test('DNA DEZESSETE nas costuras das curvas: esfera 34×17, disco 6×17=102, toros 17×34 — e zero vara de templo', () => {
    const parts = P10();
    // o templo era feito de varas e pontas de 17 faces; rework: NÃO sobrou
    // nenhum cyl/cone — a planta nova é esfera, anel e toros
    expect(parts.filter((p) => p.g === 'cyl' || p.g === 'cone').length).toBe(0);
    // a ESFERA NEGRA é cortada em 34(=2×17) meridianos × 17 paralelos
    const sphere = parts.find((p) => p.tag === 'hole.horizon')!;
    expect(sphere.g).toBe('sphere');
    expect(sphere.a).toEqual([PRIMORDIAL_HORIZON_R, 34, 17]);
    // o DISCO é UMA só peça de pintura: ring da boca embutida na esfera até a
      // borda larga, com 6×17 = 102 segmentos — e NÃO é grupo
    const disk = parts.filter((p) => p.tag === 'disk.accr');
    expect(disk.length).toBe(1);
    expect(disk[0].g).toBe('ring');
    expect(disk[0].a).toEqual([PRIMORDIAL_DISK_IN, PRIMORDIAL_DISK_R, 102]);
    expect(disk[0].a[2]).toBe(6 * 17);
    expect(disk[0].m).toBe('trans');
    expect(disk[0].group).toBeUndefined();
    // o disco é MAIS LARGO que o desenho antigo (2,28) — o pedido foi maior
    expect(PRIMORDIAL_DISK_R).toBeGreaterThan(2.6);
    // e nasce EMBUTIDO na superfície da esfera negra (o furo pintado morreu)
    expect(PRIMORDIAL_DISK_IN).toBeLessThan(PRIMORDIAL_HORIZON_R);
    // os TRÊS toros do céu (anel de fótons + dois arcos de lente) vêm no corte
    // 17×34 (o dezessete na volta do tubo); os arcos só existem porque o `arc`
    // do toro foi exposto no `torus` dos assets
    const tori = parts.filter((p) => p.g === 'torus');
    expect(tori.length).toBe(3);
    for (const t of tori) {
      expect(t.a[2]).toBe(17);
      expect(t.a[3]).toBe(34);
    }
    for (const t of tori.filter((p) => (p.tag ?? '').startsWith('lens.')))
      expect(t.a.length).toBe(5); // o quinto argumento é o ARCO (rad)
    // contagens exatas das cinco peças e NENHUMA tag do templo sobrevivente
    for (const tag of ['hole.horizon', 'hole.photon', 'disk.accr', 'lens.top', 'lens.bottom'])
      expect(parts.filter((p) => p.tag === tag).length).toBe(1);
    const permitido = new Set(['hole.horizon', 'hole.photon', 'disk.accr', 'lens.top', 'lens.bottom']);
    for (const p of parts) expect(permitido.has(p.tag ?? '')).toBe(true);
    for (const extinto of ['court.', 'arm.', 'well.', 'crown.', 'sat.', 'debris.', 'orbital.'])
      expect(parts.some((p) => (p.tag ?? '').startsWith(extinto))).toBe(false);
  });

  test('Gargantua: esfera negra no plano do disco, silhueta de lente por cima e por baixo, quasar pairando, rajada no ventre e rotação alta', () => {
    const parts = P10();
    const met = parts.map((p) => ({ p, e: exact(p as never) }));
    const byTag = (t: string) => met.find((x) => x.p.tag === t)!;

    // A ESFERA NEGRA mora no plano do disco, centrada no pivô, e É geometria —
    // o buraco do desenho antigo era vazio pintado; agora é breu puro com `m`
    const horizon = byTag('hole.horizon');
    expect(horizon.p.m).toBe('black');
    expect(horizon.p.p).toEqual([0, PRIMORDIAL_DISK_Y, 0]);
    expect(horizon.e.rhoMax).toBeLessThanOrEqual(PRIMORDIAL_HORIZON_R + 1e-6);
    expect(horizon.e.rhoMax).toBeGreaterThan(PRIMORDIAL_HORIZON_R * 0.99);
    expect(horizon.e.yHi).toBeCloseTo(PRIMORDIAL_DISK_Y + PRIMORDIAL_HORIZON_R, 3);
    expect(horizon.e.yLo).toBeCloseTo(PRIMORDIAL_DISK_Y - PRIMORDIAL_HORIZON_R, 3);

    // O ANEL DE FÓTONS veste o ombro da esfera (rentes, sem enterrar): a volta
    // de luz ancora o horizonte na tela
    expect(PRIMORDIAL_PHOTON_R).toBeGreaterThan(PRIMORDIAL_HORIZON_R);
    expect(PRIMORDIAL_PHOTON_R).toBeLessThan(PRIMORDIAL_HORIZON_R + 0.1);
    expect(byTag('hole.photon').p.p).toEqual([0, PRIMORDIAL_DISK_Y, 0]);

    // A SILHUETA DE LENTE (o look Gargantua do usuário): os arcos moram no
    // plano VERTICAL de frente (XY do modelo: só rotação em Z) e um arqueia
    // por CIMA, o outro por BAIXO da esfera negra
    const top = byTag('lens.top');
    const bot = byTag('lens.bottom');
    for (const l of [top, bot]) {
      expect(l.p.r?.[0]).toBe(0);
      expect(l.p.r?.[1]).toBe(0); // só Z: o arco fica no plano XY frontal
      expect(l.p.p).toEqual([0, PRIMORDIAL_DISK_Y, 0]);
    }
    // pino da silhueta: o arco de cima SAI da cabeça da esfera e o de baixo
    // pendura por baixo dela — é isso que o olho lê como o anel lensado
    expect(top.e.yHi).toBeGreaterThan(PRIMORDIAL_DISK_Y + PRIMORDIAL_HORIZON_R);
    expect(bot.e.yLo).toBeLessThan(PRIMORDIAL_DISK_Y - PRIMORDIAL_HORIZON_R);
    // cada arco também NUNCA cruza o plano do disco (o de cima fica acima, o de
    // baixo abaixo — as pontas param na banda, esmaecidas no shader LENS_FRAG)
    expect(top.e.yLo).toBeGreaterThan(PRIMORDIAL_DISK_Y);
    expect(bot.e.yHi).toBeLessThan(PRIMORDIAL_DISK_Y);
    // os tubos das lentes nunca tocam a esfera (folga miúda desenhada)
    expect(PRIMORDIAL_LENS_TOP_R - PRIMORDIAL_LENS_TOP_TUBE).toBeGreaterThan(PRIMORDIAL_HORIZON_R);
    expect(PRIMORDIAL_LENS_BOT_R - PRIMORDIAL_LENS_BOT_TUBE).toBeGreaterThan(PRIMORDIAL_HORIZON_R);
    // e os arcos param ANTES de virar circunferência (arc < π: as pontas morrem
    // onde a banda do disco assume)
    for (const t of parts.filter((p) => (p.tag ?? '').startsWith('lens.')))
      expect(t.a[4]).toBeLessThan(Math.PI);

    // O QUASAR PAIRA: com o tilt no MÁXIMO (o rig oscila [0,42, 0,50]) a
    // superfície do disco desce a Y_D − ρ·sen(t) ≈ 0,96 na borda larga e a
    // lente de baixo para 0,91 — nada encosta no deck
    expect(PRIMORDIAL_TILT_MAX).toBeGreaterThan(PRIMORDIAL_DISK_TILT);
    const bottomDisk =
      PRIMORDIAL_DISK_Y - PRIMORDIAL_DISK_R * Math.sin(PRIMORDIAL_TILT_MAX);
    expect(bottomDisk).toBeGreaterThan(0.5);
    expect(bot.e.yLo).toBeGreaterThan(0.5);

    // a rajada sai do VENTRE da esfera (h > raio — fura a casca frontal, como
    // o jato relativístico furando o disco), no plano do disco; e o motor
    // (formMuzzleY com o topo autoral 4,9) cospe QUASE exatamente na altura do
    // ventre — amarrado aqui porque o motor calcula a origem por fora do rig
    expect(Math.hypot(PRIMORDIAL_MUZZLE[0], PRIMORDIAL_MUZZLE[2])).toBeGreaterThan(
      PRIMORDIAL_HORIZON_R,
    );
    expect(PRIMORDIAL_MUZZLE[1]).toBe(PRIMORDIAL_DISK_Y);
    expect(Math.abs(formMuzzleY(PRIMORDIAL, 10) - PRIMORDIAL_DISK_Y)).toBeLessThan(0.06);
    // o pivô do disco É o centro do anel (o wrapper só inclina; o spin é do
    // shader)
    const ring = parts.find((p) => p.tag === 'disk.accr')!;
    expect(PRIMORDIAL_DISK_PIVOT).toEqual([ring.p[0], ring.p[1], ring.p[2]]);

    // A ROTAÇÃO ALTA (03/nov — "está muito lento agora"): o ângulo acumulado
    // do rig sobe a ≥2,4 rad/s no descanso (era 0,5) e carga/jato quase
    // dobram; o pó orbita a 5,2/ρ no frag (pin de texto no pino rig)
    expect(PRIMORDIAL_SPIN.base).toBeGreaterThanOrEqual(2);
    expect(PRIMORDIAL_SPIN.charge).toBeGreaterThan(0);
    expect(PRIMORDIAL_SPIN.jet).toBeGreaterThan(0);
    // os ARCOS de lente param antes de fechar o círculo nos ângulos da planta
    expect(PRIMORDIAL_LENS_TOP_ARC).toBeLessThan(Math.PI);
    expect(PRIMORDIAL_LENS_BOT_ARC).toBeLessThan(Math.PI);
    // o PÓ DE QUASAR (shader do rig) também acelerou: a régua do ω novo vive
    // no texto do arquivo — o 5,2/ρ substituiu o 1,4/ρ antigo
    expect(RigSource).toContain('5.2 / r');
    expect(RigSource).not.toContain('1.4 / r');
  });

  test('paleta OURO-QUASAR amarrada: branco-quasar do motor no veio, ouro no disco, ember esfriando na borda, breu NEGRO', () => {
    expect(PRIMORDIAL_QUASAR).toBe('#ffeccb');
    expect(PRIMORDIAL_GOLD).toBe('#ffd66b');
    expect(PRIMORDIAL_EMBER).toBe('#ff7a3c');
    expect(PRIMORDIAL_DEEP).toBe('#0e0a16');
    // a identidade atravessa motor, figurino, rig e projeção: a cor do motor É
    // o anel de fótons, o veio da rajada e o miolo do jato
    expect(PRIMORDIAL.base.projectileColor).toBe(PRIMORDIAL_QUASAR);
    expect(VISUALS.primordial.body).toBe(PRIMORDIAL_GOLD); // o ouro do disco é o corpo
    expect(VISUALS.primordial.dark).toBe(PRIMORDIAL_DEEP);
    expect(VISUALS.primordial.glow).toBe(PRIMORDIAL_QUASAR);
    expect(VISUALS.primordial.accent).toBe(PRIMORDIAL_EMBER); // o ember esfriando na borda
    // o plasma do horizonte e a MATÉRIA VITRIFICADA (única "pedra" que sobrou —
    // corpo da rajada e farpas do impacto) bebem da mesma fonte
    expect(QUASAR_PLASMA.gold).toBe(PRIMORDIAL_QUASAR);
    expect(QUASAR_PLASMA.cool).toBe(PRIMORDIAL_GOLD); // contorno OURO: o azó frio morreu com o templo
    expect(SINTER_LOOK.crack).toBe(PRIMORDIAL_QUASAR);
    // amarelo~esbranquiçado de verdade: em toda a luz da espécie o azul fica
    // ABAIXO do verde (a luz antiga — #e8f6ff/#9ad0ff — era o contrário)
    for (const c of [PRIMORDIAL_QUASAR, PRIMORDIAL_GOLD, SINTER_LOOK.rockA, SINTER_LOOK.rockB])
      expect(warm(c)).toBe(true);
    // CONTRASTE DE QUASAR: o breu do horizonte é o mais FUNDO da árvore (mais
    // escuro que o breu do pai Colosso) e a sombra da escória nunca clareia
    expect(luma(PRIMORDIAL_DEEP)).toBeLessThan(luma(COLOSSO_DEEP));
    expect(luma(SINTER_LOOK.rockB)).toBeLessThan(luma(SINTER_LOOK.rockA));
    // o print separa o filho dos dois pais e dos rivais de luz: nem o âmbar/geada
    // do Astral, nem o magma do Colosso — nem o gelo azulado de outros figurinos
    expect(VISUALS.primordial.glow).not.toBe(ASTRAL_STARLIGHT);
    expect(VISUALS.primordial.glow).not.toBe(ASTRAL_FROST);
    expect(VISUALS.primordial.body).not.toBe(ASTRAL_STARLIGHT);
    expect(VISUALS.primordial.body).not.toBe(COLOSSO_MAGMA);
    expect(PRIMORDIAL_GOLD).not.toBe(ASTRAL_STARLIGHT); // #ffd66b ≠ #ffb347: ouro ≠ âmbar
  });

  test('coreografia: janela 0,94 (60% de afinação), jato ignora do zero, estoura no meio e assenta no zero', () => {
    // a cadência do Nv.10 (interval 1,5) fica ENTRE os pais: astral 0,74 /
    // primordial 0,94 / colosso 1,25
    expect(PRIMORDIAL_ATTACK_WINDOW).toBeGreaterThan(ASTRAL_ATTACK_WINDOW);
    expect(PRIMORDIAL_ATTACK_WINDOW).toBeLessThan(COLOSSO_ATTACK_WINDOW);
    expect(PRIMORDIAL_WINDUP).toBe(0.6); // fração: 0,564 de afinação pra 0,376 de sopro
    const u = PRIMORDIAL_ATTACK_WINDOW;
    const w = u * PRIMORDIAL_WINDUP;
    // SEM o `gather`: o canal da coleta era das garras nas torres — morreu com
    // o templo; a pose do quasar puro é disco/fótons/jato
    const keys = ['lean', 'charge', 'flare', 'jet', 'recoil', 'quake'] as const;
    const zero = (s: number) => keys.forEach((k) => expect(attackPose(s)[k]).toBe(0));
    zero(-1);
    zero(u + 0.2);
    expect(attackPose(0).charge).toBe(0); // começa do descanso sem solavanco
    expect(attackPose(0).flare).toBe(0);
    // no fim da afinação o quasar tombou pra trás e o disco está no máximo de
    // carga (as bandas aceleraram junto — PRIMORDIAL_SPIN.charge)
    const wind = attackPose(w - 0.01);
    expect(wind.lean).toBeLessThan(-0.5);
    expect(wind.charge).toBeGreaterThan(0.9);
    // CONTINUIDADE no frame do tiro: lean/charge não cortam (só o flare do
    // anel de fótons é impulso declarado na ignição — a convenção do poço)
    const before = attackPose(w - 0.001);
    const strike = attackPose(w + 0.001);
    for (const k of ['lean', 'charge'] as const)
      expect(Math.abs(strike[k] - before[k])).toBeLessThan(0.02);
    expect(strike.flare).toBeGreaterThan(0);
    expect(strike.jet).toBeLessThan(0.02); // o jato IGNORA do zero: aceso em 0 no frame do corte
    // no meio do sopro o jato estoura no máximo com a gravidade cedendo e o
    // recuo afundando o quasar
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

  test('a rajada arremessada é LUZ-DE-QUASAR: matéria vitrificada em voo com o plasma do anel de fótons no núcleo e ouro na cauda', () => {
    // o corpo do tiro é a MESMA MATÉRIA VITRIFICADA lida em voo com o plasma
    // do MESMO anel de fótons — identidade boca→rajada→FX na cor do motor —
    // e o OURO do disco no fresnel (nunca o azó antigo, nunca o azul do Raio)
    expect(PRIMORDIAL_RAY_CORE_LOOK.gold).toBe(PRIMORDIAL_QUASAR);
    expect(PRIMORDIAL_RAY_CORE_LOOK.gold).toBe(PRIMORDIAL.base.projectileColor);
    expect(PRIMORDIAL_RAY_CORE_LOOK.cool).toBe(PRIMORDIAL_GOLD);
    // as dezessete fagulhas da cauda são escória dourada com o veio
    // branco-quasar (o degrau #f2dcae é um acima da escória do corpo: lasca
    // miúda precisa de degrau acima da pedra para o print ler farpa, não seixo)
    expect(PRIMORDIAL_SPARK_LOOK.crack).toBe(PRIMORDIAL_QUASAR);
    expect(PRIMORDIAL_SPARK_LOOK.rockA).toBe('#f2dcae');
    expect(warm(PRIMORDIAL_SPARK_LOOK.rockA)).toBe(true);
    expect(luma(PRIMORDIAL_SPARK_LOOK.rockA)).toBeLessThan(luma(QUASAR_PLASMA.white)); // a cauda de ouro nunca clareia mais que o miolo
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
 * O rework de 03/nov reescreveu o rig INTEIRO — estes pins blindam os três shaders
 * novos (disco, lente, jato, pó) contra a volta do bug.
 */
describe('lesson WebKit: a cena HDR não escreve NaN e o composer tem cinto anti-não-finito', () => {
  const rig = RigSource;
  const gate = GateSource;

  test('discard nenhum do rig é "ao natural" (NaN escapa de `x <= c`; invertido ele captura)', () => {
    expect(rig).not.toMatch(/if \([a-z][\w.]* <= [0-9.]+\) discard/);
    expect(rig).toMatch(/if \(!\(a > 0\.002\)\) discard;/); // jato/disco/lente
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
