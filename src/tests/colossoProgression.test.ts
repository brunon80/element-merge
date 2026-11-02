import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants, COLOSSO_RING_R, COLOSSO_RING_Y, COLOSSO_ARM_PIVOT, COLOSSO_CORE_POS } from '../scene/speciesModels';
import { TILE_SPACING_X, ROW_DEPTH } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  ABISSAL_ATTACK_WINDOW,
} from '../scene/AbissalRig';
import { COSMICO_ATTACK_WINDOW } from '../scene/CosmicoRig';
import { CRISTAL_ATTACK_WINDOW } from '../scene/CrystalRig';
import { GEODO_ATTACK_WINDOW } from '../scene/GeodoRig';
import { VULCAN_ATTACK_WINDOW } from '../scene/VulcanRig';
import {
  COLOSSO_AMETHYST,
  COLOSSO_ATTACK_WINDOW,
  COLOSSO_DEEP,
  COLOSSO_MAGMA,
  COLOSSO_REGOLITO,
  COLOSSO_TALC,
  COLOSSO_WINDUP,
  HEARTH_COLOSSO_LOOK,
  MAGMA_COLOSSO_LOOK,
  AMETHYST_COLOSSO_LOOK,
  REGOLITO_COLOSSO_DEEP_LOOK,
  REGOLITO_COLOSSO_LOOK,
  attackPose,
} from '../scene/ColossoRig';
import { COLOSSO_BLOCK_LOOK, COLOSSO_CHIP_LOOK, COLOSSO_LAMP_LOOK } from '../scene/ProjectileField';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do COLOSSO (Nv.9 — Geodo+Vulcânico: a montanha eterna que virou LUA), o
 * titã PLANTADO por treze contrafortes com anel de matacões inclinado. As
 * regras amarradas aqui (testes simples, sem auditoria de malha):
 *  * o DNA é o TREZE EM TUDO: todo `cyl`/`cone` tem TREZE faces (Geodo CINCO,
 *    Cristal SEIS, Abissal SETE, Cósmico OITO, Vulcânico NOVE, Astral ONZE) e
 *    as famílias contam treze — raízes, menires, crateras, anel, brasas,
 *    entulho, trincas, coroa — mais treze peças na cara e dois braços;
 *  * o invólucro cabe no slot e nunca afunda (treze almofadas pousam no piso);
 *  * a paleta é regolito CLARO com o veio âmbar do motor (#d98c4a = a cor do
 *    motor = a trinca de TODA pedra) e a ametista herdeira do pai Geodo;
 *  * coreografia: a janela de arremesso mais LONGA da árvore (1,25 — o bloco
 *    pesado exige a afinação mais lenta) e o pose assenta no zero;
 *  * motor: `closest`, terra, `heavy` + o `splash` mais largo da árvore (2,2)
 *    e o tambor arremessado é PEDRA CLARA de lua (talco #cfc9d6), nunca brasa.
 */

const COLOSSO = getSpecies('colosso');
const GEODO = getSpecies('geodo');
const VULCAN = getSpecies('vulcanico');
const LV = 9 as MonsterLevel;

const P9 = () => partsForLevel(MODELS.colosso, 9);

const FAMILY13 = [
  'root', 'root.pad', 'menhir', 'menhir.cap',
  'crater.rim', 'crater.pit', 'crater.gem', 'crater.lamp',
  'ring.rock', 'ring.plate', 'ring.chip',
  'swarm.ember', 'debris', 'crack', 'corona',
];

const FACE_TAGS = new Set([
  'mask', 'mask.rim', 'brow', 'chin', 'nose', 'core.rim', 'core.pit',
  'eye', 'eye.pupil', 'cheek',
]);

const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const rhoOf = (p: { p: [number, number, number] }) => Math.hypot(p.p[0], p.p[2]);

describe('Colosso: montanha eterna que virou lua, com anel de treze matacões (Nv.9)', () => {
  test('rig próprio, plantado, denso, e o invólucro cabe no slot sem afundar', () => {
    expect(SPECIES_RIGS.colosso).toBeTruthy();
    expect(COLOSSO.levelMin).toBe(9);
    expect(COLOSSO.levelMax).toBe(9);
    expect(hasLevelVariants(MODELS.colosso)).toBe(false);
    // PLANTADO: treze almofadas pousam no piso e o bob é miúdo senão o UnitView
    // descolaria/soterraria as raízes
    expect(MODELS.colosso.floatY).toBe(0);
    expect(MODELS.colosso.bob ?? 0).toBeLessThanOrEqual(0.02);
    expect(COLOSSO.base.moveSpeed).toBe(0);
    // orçamento denso (a régua anti low-poly da árvore: cósmico 141, astral 228)
    expect(P9().length).toBe(221);
    const env = partsEnvelope(P9());
    const halfX = Math.max(env.maxX, -env.minX);
    const halfZ = Math.max(env.maxZ, -env.minZ);
    // o anel (ρ 2,08 + matacão na tangente) preenche o slot sem tocar o vizinho
    expect(halfX).toBeGreaterThanOrEqual(2.2);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantado: as almofadas pousam (0,01 acima do piso) e NUNCA afundam
    expect(env.minY).toBeGreaterThanOrEqual(-0.01);
    expect(env.minY).toBeLessThan(0.15);
    // a coroa e as crateras usam a altura da forma sem estourar o teto
    expect(env.maxY).toBeGreaterThanOrEqual(4.0);
    expect(env.maxY).toBeLessThanOrEqual(formTop(COLOSSO, 9) + 0.25);
    // a goela de onde o bloco sai vive DENTRO do invólucro e do furo do anel
    expect(COLOSSO_CORE_POS[1]).toBeGreaterThan(env.minY);
    expect(COLOSSO_CORE_POS[1]).toBeLessThan(env.maxY);
    expect(rhoOf({ p: COLOSSO_CORE_POS })).toBeLessThan(COLOSSO_RING_R - 0.35);
    // três corpos orbitais: entulho no chão (1), brasas da coroa (0, ao CONTRÁRIO)
    // e o anel de matacões (3) — o anel é o mais rápido (é o que faz a lua girar)
    const groups = MODELS.colosso.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    expect(groups[0]).toBeCloseTo(-0.3, 3);
    expect(groups[1]).toBeCloseTo(0.52, 3);
    expect(groups[3]).toBeCloseTo(0.7, 3);
    expect(Math.sign(groups[0])).not.toBe(Math.sign(groups[3]));
    expect(Math.abs(groups[3])).toBeGreaterThan(Math.abs(groups[1]));
    expect(P9().filter((p) => p.group === 3).length).toBe(39); // anel: 13×3
    expect(P9().filter((p) => p.group === 1).length).toBe(13);
    expect(P9().filter((p) => p.group === 0).length).toBe(13);
  });

  test('DNA TREZE EM TUDO: todo cyl/cone tem treze faces e as contagens seguem o treze', () => {
    const parts = P9();
    for (const p of parts) {
      if (p.g === 'cyl') expect(p.a[3]).toBe(13);
      if (p.g === 'cone') expect(p.a[2]).toBe(13);
    }
    // nenhuma das famílias do treze ficou de fora
    for (const tag of FAMILY13) expect(parts.filter((p) => p.tag === tag).length).toBe(13);
    // a cara tem TREZE peças (caloura escura, aro, sobrolho, nariz, queixo, duas
    // bochechas, dois olhos claros com pupila, aro da goela e poço de breu)
    expect(parts.filter((p) => p.tag && FACE_TAGS.has(p.tag)).length).toBe(13);
    // e os dois braços de arremesso (quatro peças cada um)
    expect(parts.filter((p) => (p.tag ?? '').startsWith('arm')).length).toBe(8);
    for (const t of ['arm.shoulder', 'arm.upper', 'arm.fist', 'arm.block'])
      expect(parts.filter((p) => p.tag === t).length).toBe(2);
    // o maciço fecha o total: body + mascon + três lóbulos do sopé
    expect(parts.filter((p) => p.tag === 'body').length).toBe(1);
    expect(parts.filter((p) => p.tag === 'mascon').length).toBe(1);
    expect(parts.filter((p) => p.tag === 'lobe').length).toBe(3);
    // o corpo do planetóide É o do figurino: circunsfera e altura amarradas
    const body = parts.find((p) => p.tag === 'body')!;
    expect(body.p[1]).toBe(2.62);
    expect(body.a[0]).toBe(1.3);
  });

  test('a cara e os braços: caloura escura com olhos CLAROS, goela exata no eixo e braços no furo do anel', () => {
    const parts = P9();
    const face = parts.filter((p) => p.tag && FACE_TAGS.has(p.tag));
    // a caloura é ESCURA (o escuro da montanha) e fica DEITADA encarando a frente
    const mask = face.find((p) => p.tag === 'mask')!;
    expect(mask.m).toBe('dark');
    expect(Math.abs(mask.r?.[0] ?? 0)).toBeGreaterThan(1.5);
    expect(mask.p[2]).toBeGreaterThan(1.0);
    // olho CLARO sobre a caloura escura + pupila de breu NA FRENTE (olho escuro
    // em pedra escura não lê — a lição do print)
    const eyes = face.filter((p) => p.tag === 'eye');
    const pupils = face.filter((p) => p.tag === 'eye.pupil');
    expect(eyes.length).toBe(2);
    expect(pupils.length).toBe(2);
    for (const e of eyes) expect(e.m).toBe('body');
    for (const p of pupils) expect(p.m).toBe('black');
    expect(Math.abs(eyes[0].p[0])).toBeCloseTo(Math.abs(eyes[1].p[0]), 6); // mm espelhado
    // a goela: o aro (glow) e o poço de breu DENTRO dele, no eixo da boca
    const rim = face.find((p) => p.tag === 'core.rim')!;
    expect(rim.m).toBe('glow');
    expect(rim.a[3]).toBe(13);
    const pit = face.find((p) => p.tag === 'core.pit')!;
    expect(pit.m).toBe('black');
    expect(pit.a[0]).toBeLessThan(rim.a[1]); // o poço cabe dentro do aro
    // o rig cospe de COLOSSO_CORE_POS: é o centro EXATO do aro da goela
    expect(COLOSSO_CORE_POS).toEqual(rim.p);
    // os braços penduram na cova do ombro (a constante do rig É a peça do
    // figurino) e moram todos DENTRO do furo do anel — o arremesso não vara as
    // pedras do anel (ρ máx 1,65 contra o furo em 1,85)
    for (const sh of parts.filter((p) => p.tag === 'arm.shoulder'))
      expect(Math.hypot(Math.abs(sh.p[0]) - COLOSSO_ARM_PIVOT[0], sh.p[1] - COLOSSO_ARM_PIVOT[1], sh.p[2] - COLOSSO_ARM_PIVOT[2])).toBeLessThan(0.02);
    for (const a of parts.filter((p) => (p.tag ?? '').startsWith('arm')))
      expect(rhoOf(a)).toBeLessThan(1.7);
    // o bloco segurado pendura FRENTE e ABAIXO do punho (é assim que o print lê
    // "segurando um pedaço da montanha", não "punho fechado")
    for (const sgn of [1, -1]) {
      const fist = parts.find((p) => p.tag === 'arm.fist' && Math.sign(p.p[0]) === sgn)!;
      const block = parts.find((p) => p.tag === 'arm.block' && Math.sign(p.p[0]) === sgn)!;
      expect(block.p[1]).toBeLessThan(fist.p[1]);
      expect(rhoOf(block)).toBeGreaterThan(rhoOf(fist));
      expect(block.a[3]).toBe(13);
    }
    // crateras: aro CLARO, poço ESCURO, gema de ametista e lâmpada acesa —
    // todas no topo do planetóide (a cara fica intocada)
    for (const c of parts.filter((p) => (p.tag ?? '').startsWith('crater')))
      expect(c.p[1]).toBeGreaterThan(2.9);
    expect(parts.filter((p) => p.tag === 'crater.rim').every((p) => p.m === 'body')).toBe(true);
    expect(parts.filter((p) => p.tag === 'crater.pit').every((p) => p.m === 'black')).toBe(true);
    expect(parts.filter((p) => p.tag === 'crater.gem').every((p) => p.m === 'accent')).toBe(true);
    expect(parts.filter((p) => p.tag === 'crater.lamp').every((p) => p.m === 'glow')).toBe(true);
    // o anel: matacões ESCUROS (anel claro sobre planetóide claro desaparecia),
    // ρ exato na constante do rig, alternando dois dedos acima/abaixo do plano
    for (const r of parts.filter((p) => p.tag === 'ring.rock')) {
      expect(r.m).toBe('dark');
      expect(rhoOf(r)).toBeCloseTo(COLOSSO_RING_R, 3);
      expect(Math.abs(r.p[1] - COLOSSO_RING_Y)).toBeLessThanOrEqual(0.07);
    }
    // a lasca clara é o ÚNICO claro do anel (o reflexo do regolito no ombro)
    expect(parts.filter((p) => p.tag === 'ring.chip').every((p) => p.m === 'body')).toBe(true);
    // coroa e gems: a ametista herdada do pai Geodo em toda a pedra de acento
    expect(parts.filter((p) => p.tag === 'corona').every((p) => p.m === 'accent')).toBe(true);
  });

  test('paleta amarrada: regolito claro + veio âmbar do motor em TODA pedra, herança ametista do Geodo', () => {
    expect(COLOSSO_MAGMA).toBe('#d98c4a');
    expect(COLOSSO_AMETHYST).toBe('#c77dff');
    expect(COLOSSO_REGOLITO).toBe('#9a95a3');
    expect(COLOSSO_DEEP).toBe('#2b2636');
    expect(COLOSSO_TALC).toBe('#cfc9d6');
    // a identidade atravessa figurino, motor e projeção: a cor do motor É o
    // veio de toda pedra (regolito cru, breu, magma, ametista) e o plasma da goela
    expect(COLOSSO.base.projectileColor).toBe(COLOSSO_MAGMA);
    expect(VISUALS.colosso.body).toBe(COLOSSO_REGOLITO);
    expect(VISUALS.colosso.dark).toBe(COLOSSO_DEEP);
    expect(VISUALS.colosso.glow).toBe(COLOSSO_MAGMA);
    expect(VISUALS.colosso.accent).toBe(COLOSSO_AMETHYST);
    for (const L of [REGOLITO_COLOSSO_LOOK, REGOLITO_COLOSSO_DEEP_LOOK, MAGMA_COLOSSO_LOOK, AMETHYST_COLOSSO_LOOK])
      expect(L.crack).toBe(COLOSSO_MAGMA);
    expect(HEARTH_COLOSSO_LOOK.gold).toBe(COLOSSO_MAGMA);
    // CONTRASTE DE LUA: o regolito é a pedra mais CLARA da família das montanhas
    // (é o que faz o print da arena ler lua e não fogueira) e o breu é o mais FUNDO
    expect(luma(COLOSSO_TALC)).toBeGreaterThan(luma(COLOSSO_REGOLITO));
    expect(luma(COLOSSO_REGOLITO)).toBeGreaterThan(luma(COLOSSO_DEEP) * 2);
    expect(luma(MAGMA_COLOSSO_LOOK.rockA)).toBeLessThan(luma(COLOSSO_MAGMA) * 0.6); // pedra do veio é bronzita escura: veio É a luz, não a pedra
    // a herança da família: a ametista do pai Geodo é a MESMA pedra de acento do
    // filho (gemas, coroa), mas o corpo/glow são outros — o print separa os dois
    expect(VISUALS.colosso.accent).toBe(VISUALS.geodo.accent);
    expect(VISUALS.colosso.body).not.toBe(VISUALS.geodo.body);
    expect(VISUALS.colosso.glow).not.toBe(VISUALS.geodo.glow);
    expect(VISUALS.colosso.glow).not.toBe(VISUALS.vulcanico.glow); // o outro pai é a fogueira #ff4d12
    expect(COLOSSO_MAGMA).not.toBe('#ff4d12');
  });

  test('coreografia: a janela de arremesso mais LONGA da árvore (1,25) e o pose assenta no zero', () => {
    // o bloco mais pesado da árvore exige a afinação mais longa (astral 0,74 /
    // cósmico 0,86 / vulcânico 0,98 / geodo 1,05 / colosso 1,25)
    expect(COLOSSO_ATTACK_WINDOW).toBeGreaterThan(GEODO_ATTACK_WINDOW);
    expect(COLOSSO_ATTACK_WINDOW).toBeGreaterThan(VULCAN_ATTACK_WINDOW);
    expect(COLOSSO_ATTACK_WINDOW).toBeGreaterThan(CRISTAL_ATTACK_WINDOW);
    expect(COLOSSO_ATTACK_WINDOW).toBeGreaterThan(COSMICO_ATTACK_WINDOW);
    expect(COLOSSO_ATTACK_WINDOW).toBeGreaterThan(ABISSAL_ATTACK_WINDOW);
    expect(COLOSSO_WINDUP).toBe(0.66); // dois terços da janela é só o braço indo atrás
    const keys: (keyof ReturnType<typeof attackPose>)[] = ['brace', 'cock', 'lean', 'charge', 'flare', 'hurl', 'quake'];
    const zero = (s: number) => keys.forEach((k) => expect(attackPose(s)[k]).toBe(0));
    zero(-1);
    zero(COLOSSO_ATTACK_WINDOW + 0.2);
    expect(attackPose(0).cock).toBe(0); // começa do descanso sem solavanco
    // no fim da afinação o braço travou atrás, o planetóide inteiro tombou para
    // trás e a goela/bloco segurado estão no máximo de carga
    const wind = attackPose(COLOSSO_ATTACK_WINDOW * COLOSSO_WINDUP - 0.01);
    expect(wind.cock).toBeGreaterThan(0.95);
    expect(Math.abs(wind.lean)).toBeGreaterThan(0.8);
    expect(wind.charge).toBeGreaterThan(0.9);
    // no meio do arremesso a varredura do braço passa pela frente (hurl ~1) com o
    // chão cedendo (quake) e a carga caindo
    const hurling = attackPose(COLOSSO_ATTACK_WINDOW * COLOSSO_WINDUP + 0.16);
    expect(hurling.hurl).toBeGreaterThan(0.9);
    expect(hurling.quake).toBeGreaterThan(0.4);
    expect(hurling.charge).toBeLessThan(wind.charge);
    // CONTINUIDADE no frame do tiro: cock/lean/charge/brace não cortam (só o
    // flare do poço é impulso declarado)
    const w = COLOSSO_ATTACK_WINDOW * COLOSSO_WINDUP;
    const before = attackPose(w - 0.001);
    const strike = attackPose(w + 0.001);
    for (const k of ['cock', 'lean', 'charge', 'brace'] as const)
      expect(Math.abs(strike[k] - before[k])).toBeLessThan(0.02);
    // e TUDO assenta no zero antes do fim da janela (nada de braço/poço cortando
    // num frame só no fim do coice)
    const late = attackPose(COLOSSO_ATTACK_WINDOW * 0.999);
    for (const k of keys) expect(Math.abs(late[k])).toBeLessThan(0.05);
    // nenhuma pose ultrapassa as amplitudes coreografadas
    for (let s = 0; s <= COLOSSO_ATTACK_WINDOW; s += 0.02) {
      const p = attackPose(s);
      expect(Math.abs(p.lean)).toBeLessThanOrEqual(0.9);
      expect(p.hurl).toBeLessThanOrEqual(1);
      expect(p.charge).toBeLessThanOrEqual(1);
      expect(p.flare).toBeLessThanOrEqual(1.66);
      expect(p.quake).toBeLessThanOrEqual(1);
    }
  });

  test('motor: o MAIS PESADO da árvore tranca o mais próximo e cospe splash 2,2 no chão mais perto', () => {
    expect(COLOSSO.base.damageElement).toBe('earth');
    expect(COLOSSO.base.targeting).toBe('closest'); // o titã de pedra só alcança o que está perto
    expect(COLOSSO.base.projectileSpeed).toBeLessThanOrEqual(7); // o projétil mais LENTO da árvore
    expect(COLOSSO.base.hp).toBe(132);
    expect(COLOSSO.base.damage).toBe(27);
    expect(COLOSSO.base.resist.earth).toBe(0.35);
    expect(COLOSSO.base.resist.water).toBe(-0.25); // a montanha teme a chuva
    const heavy = COLOSSO.base.abilities.find((a) => a.kind === 'heavy');
    expect(heavy).toBeTruthy();
    const splash = COLOSSO.base.abilities.find((a) => a.kind === 'splash');
    const geSplash = GEODO.base.abilities.find((a) => a.kind === 'splash');
    const vuSplash = VULCAN.base.abilities.find((a) => a.kind === 'splash');
    // a escada do estouro: geodo 1,8 < vulcânico 2,0 < COLOSSO 2,2 (o maior)
    expect(splash && 'radius' in splash && splash.radius).toBe(2.2);
    expect(geSplash && 'radius' in geSplash && geSplash.radius).toBeLessThan(2.2);
    expect(vuSplash && 'radius' in vuSplash && vuSplash.radius).toBeLessThan(2.2);
    const regen = COLOSSO.base.abilities.find((a) => a.kind === 'regen');
    expect(regen && 'factor' in regen && regen.factor).toBe(0.04);
    // sem chain/pierce/doubleShot: é UM bloco só, o mais pesado
    expect(COLOSSO.base.abilities.some((a) => a.kind === 'chain' || a.kind === 'pierce')).toBe(false);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 90909 });
    const st = eng.addRetainedUnit('colosso', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    eng.startBattle();
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 150; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles) if (p.species === 'colosso') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(9);
      expect(p.damageElement).toBe('earth');
      // as munições chegam ARMADAS no bloco: heavy + o splash 2,2 do motor
      expect(p.abilities.some((a) => a.kind === 'heavy')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'splash')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'colosso');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(9);
  });

  test('o tambor arremessado é LUA: talco claro com veia fina do motor, lâmpada de poço e cauda de lascas', () => {
    // o bloco é o MESMO talco claro do anel do figurino (a pedra mais clara da
    // arena é o tiro — é isso que faz o voo ler lua e não brasa), com a MESMA
    // trinca âmbar do motor e o veio FINO e CONTIDO (pedra clara com veio largo
    // vira lanterna de lava)
    expect(COLOSSO_BLOCK_LOOK.rockA).toBe(COLOSSO_TALC);
    expect(COLOSSO_BLOCK_LOOK.crack).toBe(COLOSSO_MAGMA);
    expect(COLOSSO_BLOCK_LOOK.crackGlow * COLOSSO_BLOCK_LOOK.crackBoost).toBeLessThan(0.2);
    expect(COLOSSO_BLOCK_LOOK.moon).toBeGreaterThan(1); // lua cheia no ar: sky/amb do tambor sobem no voo
    // a lâmpada sentada na boca do topo é a cor do motor com o poço ESCURO
    // (poço aceso, não sol transbordando — é o que separa o Colosso do Vulcânico)
    expect(COLOSSO_LAMP_LOOK.gold).toBe(COLOSSO_MAGMA);
    expect(COLOSSO_LAMP_LOOK.cool).toBe(HEARTH_COLOSSO_LOOK.cool);
    expect(luma(COLOSSO_LAMP_LOOK.cool)).toBeLessThan(0.05);
    // a cauda é a trilha de talco CLARO (nunca pedra escura: um colar escuro no
    // tambor engolia a silhueta e copiava o anel do dono)
    expect(COLOSSO_CHIP_LOOK.rockA).toBe(COLOSSO_TALC);
    expect(COLOSSO_CHIP_LOOK.crack).toBe(COLOSSO_MAGMA);
    expect(luma(COLOSSO_CHIP_LOOK.rockA)).toBeGreaterThan(luma(VISUALS.colosso.dark) * 2);
  });
});
