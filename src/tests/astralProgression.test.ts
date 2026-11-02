import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants, ASTRAL_ARM_FOOT, ASTRAL_ARM_TIP, ASTRAL_DISK_Y, ASTRAL_TILT } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { makeStoneMaterial } from '../scene/stoneShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { DOUBLE_SHOT_DELAY } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  ASTRAL_ATTACK_WINDOW,
  ASTRAL_CORE_POS,
  ASTRAL_DISK_PIVOT,
  ASTRAL_FROST,
  ASTRAL_NECK_PIVOT,
  ASTRAL_STARLIGHT,
  ASTRAL_VOID,
  ASTRAL_WINDUP,
  EYE_ASTRAL_LOOK,
  FROST_ASTRAL_LOOK,
  GALAXY_LOOK,
  STARLIGHT_ASTRAL_LOOK,
  VOID_ASTRAL_DEEP_LOOK,
  VOID_ASTRAL_LOOK,
  attackPose,
} from '../scene/AstralRig';
import { ASTRAL_COMET_CORE_LOOK, ASTRAL_COMET_LOOK, ASTRAL_SPARK_LOOK } from '../scene/ProjectileField';
import { ABISSAL_ATTACK_WINDOW, ABISSAL_WINDUP } from '../scene/AbissalRig';
import { CORE_LOOK, COSMICO_ATTACK_WINDOW, COSMICO_HEAT, COSMICO_STARLIGHT, COSMICO_WINDUP } from '../scene/CosmicoRig';
import { CRISTAL_ATTACK_WINDOW } from '../scene/CrystalRig';
import { GEODO_ATTACK_WINDOW, GEODO_WINDUP } from '../scene/GeodoRig';
import { OBSIDIANA_WINDUP } from '../scene/ObsidianaRig';
import { PLASMA_WINDUP } from '../scene/PlasmaRig';
import { TEMPESTADE_WINDUP } from '../scene/TempestadeRig';
import { VULCAN_ATTACK_WINDOW, VULCAN_WINDUP } from '../scene/VulcanRig';
import { makeEngine, mustSummon, runSeconds } from './helpers';
import type { Part } from '../scene/speciesModels';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do ASTRAL (Nv.9 — Cósmico+Abissal: o TITÃO DE ESPIRAL BARRADA, o `titão
 * celestial`), o titã PLANTADO por onze raízes de gravidade que segura a própria
 * galáxia no slot. As regras amarradas aqui:
 *  * o DNA da espécie é o ONZE EM TUDO: todo `cyl`/`cone` do figurino tem ONZE
 *    faces (o Geodo é CINCO, o Cristal SEIS, o Abissal SETE, o Cósmico OITO, o
 *    Vulcânico NOVE) e as contagens seguem o onze — ONZE braços de espiral,
 *    ONZE peças na barra, ONZE na cara, ONZE raios de coroa, ONZE jatos + ONZE
 *    pontas de geada, ONZE varas de gravidade + ONZE âncoras, ONZE nós de cauda
 *    de maré e TRÊS cintas de ONZE girando em QUATRO velocidades (a rotação
 *    diferencial, o motor visual da espécie);
 *  * a ASSINATURA é o DISCO DE ESPIRAL BARRADA: a lente elíptica com a BARRA
 *    cavalgada no equador e onze braços em log-espiral arrigados ao bojo; os
 *    braços varrem POR BAIXO da cara (a cabeça inteira sobe num pescoço de
 *    gravidade) e a cinta externa fecha a borda por FORA da ponta dos braços;
 *  * a LUZ DO TITÃ tem dois trajes: os traços ESTRUTURAIS (fio dos braços,
 *    jatos, coroa, cintas) são pedra bronze OPACA com o VEIO âmbar do motor —
 *    plasma aditivo translúcido numa vara fina mostra a própria face de trás e
 *    o traço engorda até virar tábua, e pedra âmbar nos 78 traços somava no
 *    print da arena e a galáxia virava lâmpada de lava — e o aditivo só existe
 *    na boca (goela de buraco negro) e no olho. E o relevo vem do TAMANHO DA PEÇA (≤ ¼ da menor meia-
 *    dimensão dela), senão a casca desloca a vara pela normal e o braço de
 *    0,09 vira pá;
 *  * a PALETA é o Cósmico do avesso: motor âmbar #ffb347 com acento geada
 *    #cfe4ff sobre corpo grafite-violetu — é como um print separa os dois Nv.9
 *    (o Cósmico é azul-com-ouro);
 *  * coreografia: a janela MAIS CURTA dos Nv.7-9 (0,74 — a cadência de 1,2 s é
 *    a mais rápida da árvore) e a FRAÇÃO de alinhamento mais LONGA (0,7).
 */

const ASTRAL = getSpecies('astral');
const COSMICO = getSpecies('cosmico');
const LV = 9 as MonsterLevel;

const P9 = () => partsForLevel(MODELS.astral, 9);

const FACE_TAGS = new Set(['mask', 'brow', 'eye', 'eye.pupil', 'cheek', 'chin', 'core.rim', 'core.pit']);

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** meia-extensão da caixa da peça (escala inclusa) — o "raio de desenho" dela */
function halfExtent(p: Part): number {
  const geo = getGeometry(p.g, p.a);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox ?? new THREE.Box3();
  const s = p.s ?? [1, 1, 1];
  return (
    Math.max((b.max.x - b.min.x) * s[0], (b.max.y - b.min.y) * s[1], (b.max.z - b.min.z) * s[2]) / 2
  );
}
const rhoOf = (p: { p: [number, number, number] }) => Math.hypot(p.p[0], p.p[2]);

/**
 * Invólucro REAL em cena. O `partsEnvelope` dos helpers só conhece a matriz da
 * própria peça; aqui entram também as quatro rotações do rig: os corpos do
 * plano (disco 3 + cinta externa 0) giram sobre o pivô do disco INCLINADOS no
 * ângulo de descanso (o disco deitado leria como uma fatia na câmera da arena),
 * e as duas cintas globulares (1 e 2) giram no eixo vertical. Varre fases de
 * spin e usa a inclinação PIOR (descanso + a respiração do rig, ±0,014).
 */
function astralEnvelope(parts: Part[], tilt = ASTRAL_TILT + 0.014, samples = 16) {
  const box = new THREE.Box3();
  const pivot = new THREE.Vector3(ASTRAL_DISK_PIVOT[0], ASTRAL_DISK_PIVOT[1], ASTRAL_DISK_PIVOT[2]);
  const orbital = MODELS.astral.groups ?? {};
  const partM = new THREE.Matrix4();
  const grpM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const inv = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  const fwd = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
  for (const p of parts) {
    const geo = getGeometry(p.g, p.a);
    geo.computeBoundingBox();
    const b = geo.boundingBox ?? new THREE.Box3();
    pos.set(p.p[0], p.p[1], p.p[2]);
    q.setFromEuler(new THREE.Euler(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0));
    scl.set(p.s?.[0] ?? 1, p.s?.[1] ?? 1, p.s?.[2] ?? 1);
    partM.compose(pos, q, scl);
    const gid = p.group;
    if (gid === undefined || orbital[gid] === undefined) {
      box.union(b.clone().applyMatrix4(partM));
      continue;
    }
    const disk = gid === 3 || gid === 0; // os dois corpos do plano inclinado
    for (let s = 0; s < samples; s++) {
      q.set(0, 0, 0, 1);
      if (disk) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
      q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s / samples) * Math.PI * 2);
      q.multiply(q2); // q = qTilt · qSpin (a rotação do grupo, como no rig)
      grpM.compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
      if (disk) {
        // p -> q(p - pv) + pv: o eixo da rotação diferencial NÃO é a origem
        grpM.premultiply(fwd).multiply(inv);
      }
      box.union(b.clone().applyMatrix4(grpM.clone().multiply(partM)));
    }
  }
  return box;
}

const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
/** r>quente / b>frio no hex cru do designer (o THREE.Color converte sRGB) */
const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

describe('Astral: titã de espiral barrada plantado por onze raízes (Nv.9)', () => {
  test('rig próprio, forma ÚNICA e PLANTADO pelas raízes (Nv.9 fixo)', () => {
    expect(SPECIES_RIGS.astral).toBeTruthy();
    expect(ASTRAL.levelMin).toBe(9);
    expect(ASTRAL.levelMax).toBe(9);
    expect(hasLevelVariants(MODELS.astral)).toBe(false);
    expect(P9().length).toBe(MODELS.astral.parts.length);
    // orçamento denso (a régua anti low-poly da árvore: golem 47, cristal 102,
    // cósmico 141) — a galáxia inteira são 228 peças
    expect(MODELS.astral.parts.length).toBeGreaterThanOrEqual(220);
    // PLANTADO: onze âncoras rentes ao piso (o Abissal boia, o Cósmico planta
    // cascos de nuvem — este planta GRAVIDADE) e o bob é miúdo senão o UnitView
    // descolaria/soterraria as âncoras (a base delas fica a só 0,04 do chão)
    expect(MODELS.astral.floatY).toBe(0);
    expect(MODELS.astral.bob ?? 0).toBeLessThanOrEqual(0.02);
    expect(ASTRAL.base.moveSpeed).toBe(0);
    // QUATRO corpos orbitais em alturas e sentidos diferentes (a rotação
    // diferencial): o disco 3, a cinta externa 0, o halo globular 1 e a cinta
    // de queda 2 — com o disco e a cinta externa MAIS RÁPIDOS que as globulares
    const groups = MODELS.astral.groups ?? {};
    expect(Object.keys(groups).length).toBe(4);
    expect(groups[0]).toBeCloseTo(0.48, 3);
    expect(groups[1]).toBeCloseTo(-0.44, 3);
    expect(groups[2]).toBeCloseTo(-0.95, 3);
    expect(groups[3]).toBeCloseTo(0.62, 3);
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[3])); // o halo ao CONTRÁRIO do disco
    expect(Math.sign(groups[2])).not.toBe(Math.sign(groups[3])); // a queda ao CONTRÁRIO
    expect(groups[3]).toBeGreaterThan(groups[0]); // a cinta externa é mais DELEVADA que o disco
    const parts = P9();
    expect(parts.filter((p) => p.group === 3).length).toBe(110); // 11 braços × 9 + a barra de 11
    expect(parts.filter((p) => p.group === 0).length).toBe(11);
    expect(parts.filter((p) => p.group === 1).length).toBe(11);
    expect(parts.filter((p) => p.group === 2).length).toBe(11);
    // o pivô que o rig exporta É o plano do disco do figurino
    expect(ASTRAL_DISK_PIVOT[1]).toBe(ASTRAL_DISK_Y);
    expect(ASTRAL_NECK_PIVOT[1]).toBeGreaterThan(ASTRAL_DISK_Y);
  });

  test('DNA ONZE EM TUDO: todo cyl/cone do figurino tem ONZE faces e as contagens seguem o onze', () => {
    const parts = P9();
    for (const p of parts) {
      if (p.g === 'cyl') expect(p.a[3]).toBe(11); // onze faces em TODA vara
      if (p.g === 'cone') expect(p.a[2]).toBe(11); // onze raios em TODA ponta
      if (p.g === 'ico') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      if (p.g === 'sphere') {
        expect(p.a[1]).toBeGreaterThanOrEqual(10); // nada de esfera de 1 segmento (a higiene da árvore)
        expect(p.a[2]).toBeGreaterThanOrEqual(8);
      }
    }
    // nenhuma das famílias do onze ficou de fora
    const count = (t: string) => parts.filter((p) => p.tag === t).length;
    const start = (t: string) => parts.filter((p) => (p.tag ?? '').startsWith(t)).length;
    expect(start('arm')).toBe(99); // onze braços × NOVE peças
    expect(count('arm.node')).toBe(44); // quatro nós de estrela jovem por braço
    expect(count('arm.rod')).toBe(33); // três varas de onze faces ligando os nós
    expect(count('arm.spoke')).toBe(11); // um espichão arrigando cada pé de braço
    expect(count('arm.tip')).toBe(11); // e uma ponta de geada por braço
    expect(count('bar.node')).toBe(6); // a BARRA da espiral barrada: seis nós...
    expect(count('bar.rod')).toBe(5); // ...e cinco varas = ONZE peças
    expect(count('corona')).toBe(11); // onze raios de auréola no ombro do bojo
    expect(count('jet.rod')).toBe(11); // onze jatos para cima
    expect(count('jet.bead')).toBe(11); // ONZE pontas de geada na ponta dos jatos
    expect(count('root.rod')).toBe(11); // onze varas de gravidade para baixo
    expect(count('root.pad')).toBe(11); // onze âncoras no piso
    expect(count('tail.node')).toBe(11); // onze nós de cauda de maré
    expect(start('swarm')).toBe(33); // três cintas orbitais de ONZE
    // a cara tem ONZE peças (placa, sobrolho, dois olhos, duas órbitas, duas
    // bochechas, queixo, aro âmbar da boca e o poço de breu)
    expect(parts.filter((p) => p.tag && FACE_TAGS.has(p.tag)).length).toBe(11);
    // e o todo fecha com o onze: 11×9 braços + barra 11 + coroa 11 + jatos 22 +
    // raízes 22 + cauda 16 + cintas 33 + cara 11 = 228 peças (lente+núcleo+coluna fecham)
    expect(parts.length).toBeGreaterThanOrEqual(226);
  });

  test('a assinatura: DISCO DE ESPIRAL BARRADA — lente, barra cavalgada e onze braços em log-espiral', () => {
    const parts = P9();
    // o bojo é uma LENTE achatada (espiral vista de topo) com o núcleo redondo
    // por cima — é ali que a barra e os onze espichões se enterram
    const lens = parts.find((p) => p.tag === 'lens')!;
    expect(lens.g).toBe('ico');
    expect(lens.s![1]).toBeLessThanOrEqual(0.5); // ACHATADA: é disco, não bola
    expect(lens.s![0]).toBeGreaterThan(lens.s![1] * 2); // larga no plano
    expect(lens.p[1]).toBeCloseTo(ASTRAL_DISK_Y, 3); // no plano do disco
    const nucleus = parts.find((p) => p.tag === 'nucleo')!;
    expect(nucleus.g).toBe('ico');
    expect(nucleus.a[1]).toBeGreaterThanOrEqual(2); // sub 2: relevo denso no close
    expect(nucleus.p[1]).toBeCloseTo(ASTRAL_DISK_Y, 3);
    // A BARRA (a SB da espiral BARRADA): ONZE peças cavalgadas ACIMA do equador
    // da lente (senão a barra fica soterrada na barriga e o print mostra uma
    // bola lisa) e no MESMO corpo rígido dos braços (grupo 3)
    const bar = parts.filter((p) => (p.tag ?? '').startsWith('bar'));
    expect(bar.length).toBe(11);
    for (const b of bar) {
      expect(b.group).toBe(3);
      expect(b.p[1]).toBeGreaterThan(ASTRAL_DISK_Y); // acima do equador
      expect(b.p[1]).toBeLessThan(ASTRAL_DISK_Y + 0.4); // mas ainda dentro do bojo
      expect(Math.abs(b.p[2])).toBeLessThan(0.02); // a barra é reta, atravessando o núcleo
    }
    const barNodes = bar.filter((p) => p.tag === 'bar.node');
    const xs = barNodes.map((p) => Math.abs(p.p[0])).sort((a, b) => a - b);
    expect(xs.length).toBe(6); // mm espelhado: três nós de cada lado
    expect(xs[1]).toBeCloseTo(xs[0], 6); // e os três são ESPelhados (mm do figurino)
    expect(xs[3]).toBeCloseTo(xs[2], 6);
    expect(xs[5]).toBeCloseTo(xs[4], 6);
    // de dentro para fora: 0,24 → 0,66 → 1,02 — a barra INTEIRA fica dentro da
    // circunsfera da lente (1,196), senão ela sairia do bojo e viraria antena
    expect(xs[0]).toBeGreaterThan(0.2);
    expect(xs[5]).toBeLessThan(1.1);
    // cada vara da barra liga NÓS vizinhos (a midpoint é a média das esferas —
    // corrente colada, não paliteiro de peças soltas)
    for (const rod of bar.filter((p) => p.tag === 'bar.rod')) {
      const near = barNodes
        .map((n) => ({ n, d: dist3(rod.p, n.p) }))
        .sort((a, b) => a.d - b.d);
      expect(near[0].d).toBeLessThan(0.26); // soldada num nó...
      expect(Math.abs(near[0].d - near[1].d)).toBeLessThan(0.02); // ...e no seguinte, no meio exato
      expect(near[1].n).not.toBe(near[0].n);
    }
    // ONZE BRAÇOS em log-espiral r(θ) = 1,4·e^(0,2θ): o pé solda no ombro do
    // bojo (ρ = ASTRAL_ARM_FOOT) e a ponta morre em ASTRAL_ARM_TIP; todos os
    // nós ficam FORA da meia-largura da cara (0,795) e do leque dos jatos
    const foot = parts.filter((p) => p.tag === 'arm.node').sort((a, b) => rhoOf(a) - rhoOf(b));
    expect(foot.length).toBe(44);
    for (const k of foot) {
      expect(rhoOf(k)).toBeGreaterThan(1.24); // nada de braço nascendo em cima do rosto
      expect(Math.abs(k.p[1] - ASTRAL_DISK_Y)).toBeLessThan(0.2); // os nós vivem no plano do disco
    }
    // as constantes que o rig lê SÃO as do figurino: pé e ponta batem exato
    expect(Math.min(...foot.map((p) => rhoOf(p)))).toBeCloseTo(ASTRAL_ARM_FOOT, 6);
    expect(Math.max(...foot.map((p) => rhoOf(p)))).toBeCloseTo(ASTRAL_ARM_TIP, 6);
    // o espichão: o punho morre ENTERRADO no núcleo (ρ 0,6 < raio do núcleo)
    // e o pé no primeiro nó — sem ele o pé do braço ficaria flutuando
    for (const spoke of parts.filter((p) => p.tag === 'arm.spoke')) {
      expect(spoke.group).toBe(3);
      expect(spoke.m).toBe('dark'); // é haste de gravidade, não traço de luz
      expect(rhoOf(spoke)).toBeCloseTo(1, 6); // o meio exato entre punho (0,6) e pé (1,4)
      const dir = new THREE.Vector3(spoke.p[0], 0, spoke.p[2]).normalize();
      const wrist: [number, number, number] = [
        spoke.p[0] - dir.x * 0.4,
        ASTRAL_DISK_Y - 0.07,
        spoke.p[2] - dir.z * 0.4,
      ];
      expect(Math.hypot(wrist[0], wrist[2])).toBeCloseTo(0.6, 6); // enterrado no núcleo
      const knot = foot
        .map((n) => ({ n, d: dist3(spoke.p, n.p) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(knot.d).toBeLessThan(0.5); // e soldado no pé do braço
    }
    // a barra e os braços são um SÓ corpo rígido: giram juntos, e o que muda de
    // velocidade são as cintas (o padrão rígido de uma galáxia de verdade)
    expect(parts.filter((p) => p.group === 3 && (p.tag ?? '').startsWith('arm')).length).toBe(99);
  });

  test('braço a braço: quatro nós afinando, varas soldadas nó a nó e a ponta de geada enterrada', () => {
    const parts = P9();
    const nodes = parts.filter((p) => p.tag === 'arm.node');
    const tips = parts.filter((p) => p.tag === 'arm.tip');
    expect(tips.length).toBe(11);
    // os nós afinam da raiz para a ponta (0,15 → 0,13 → 0,11 → 0,09) e as varas
    // também (0,09 → 0,078 → 0,066): o braço é um fiamento, não uma escada igual.
    // ONZE braços: cada espichão define a azimute φ do braço e os nós dele
    // obedecem à MESMA lei do figurino (azimute = φ + θ, ρ = 1,4·e^(0,2θ)). Agrupar
    // pela azimute sozinha misturava braços vizinhos (só 0,57 rad de passo).
    const spokes = parts.filter((p) => p.tag === 'arm.spoke');
    expect(spokes.length).toBe(11);
    const spokePhi = spokes.map((s) => Math.atan2(s.p[2], s.p[0]));
    const thetaOf = (p: Part) => Math.log(rhoOf(p) / ASTRAL_ARM_FOOT) / 0.2;
    const angGap = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const byArm = new Map<number, Part[]>();
    for (const n of nodes) {
      const phi = Math.atan2(n.p[2], n.p[0]) - thetaOf(n);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < spokePhi.length; i++) {
        const d = angGap(phi, spokePhi[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      expect(best).toBeGreaterThanOrEqual(0);
      expect(bestD).toBeLessThan(0.01); // o nó pertence MESMO a esse espichão
      byArm.set(best, [...(byArm.get(best) ?? []), n]);
    }
    expect(byArm.size).toBe(11); // os onze espichões, um braço cada um
    for (const arm of byArm.values()) {
      expect(arm.length).toBe(4);
      const sorted = [...arm].sort((a, b) => rhoOf(a) - rhoOf(b));
      expect(sorted.map((p) => p.a[0])).toEqual([0.15, 0.13, 0.11, 0.09]); // afinando para fora
      expect(rhoOf(sorted[0])).toBeCloseTo(ASTRAL_ARM_FOOT, 6); // pé no ombro do bojo
      expect(rhoOf(sorted[3])).toBeCloseTo(ASTRAL_ARM_TIP, 6); // ponta na constante do rig
    }
    // varas: corrente colada — PARA CADA PAR de nós vizinhos de um braço existe
    // UMA vara com o centro no meio exato dos dois (senão a peça ficava solta no
    // vão). A espessura afina da raiz para a ponta (0,09 → 0,078 → 0,066)
    const taper = [0.09, 0.078, 0.066];
    const rods = parts.filter((p) => p.tag === 'arm.rod');
    expect(rods.length).toBe(33); // três varas por braço
    for (const arm of byArm.values()) {
      const sorted = [...arm].sort((a, b) => rhoOf(a) - rhoOf(b));
      for (let i = 0; i < 3; i++) {
        const mid: [number, number, number] = [
          (sorted[i].p[0] + sorted[i + 1].p[0]) / 2,
          (sorted[i].p[1] + sorted[i + 1].p[1]) / 2,
          (sorted[i].p[2] + sorted[i + 1].p[2]) / 2,
        ];
        const hit = rods.filter((r) => dist3(r.p, mid) < 0.02);
        expect(hit.length).toBe(1); // exatamente uma vara nesse par de nós
        expect(hit[0].a[1]).toBeCloseTo(taper[i], 4); // e ela afina com o braço
        expect(Math.abs(thetaOf(sorted[i + 1]) - thetaOf(sorted[i]))).toBeGreaterThan(0.5); // vizinhos, não pulados
      }
    }
    // cada vara de braço é o TRAÇO DE LUZ da espécie (pedra âmbar opaca do rig) e
    // é densa nos anéis verticais: `rod11` dá ≥ 7 anéis por unidade de comprimento
    for (const rod of rods) {
      expect(rod.m).toBe('glow'); // quem veste é a pedra âmbar OPACA do rig (não plasma)
      expect(rod.a[1]).toBeGreaterThan(rod.a[0]); // afinando para a ponta
      expect(rod.a[3]).toBe(11);
      expect(rod.a[4]).toBe(Math.max(4, Math.round((rod.a[2] - 0.04) * 7)));
    }
    // a ponta de geada: cone de ONZE faces com a BASE AFUNDADA no nó (pino
    // enterrado não é ponta solta — a regra da coroa da Névoa) e bicuda CURTA
    for (const tip of tips) {
      expect(tip.g).toBe('cone');
      expect(tip.a[2]).toBe(11);
      expect(tip.a[1]).toBeLessThanOrEqual(0.3);
      const owner = nodes
        .map((n) => ({ n, d: dist3(tip.p, n.p) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(owner.d).toBeCloseTo(owner.n.a[0] - 0.05 + tip.a[1] / 2, 1); // base enterrada
      expect(tip.m).toBe('accent'); // geada na ponta (o acento da espécie)
      // a ponta EMENDA na direção da própria log-espiral: ela mal abre para
      // fora (20%) e sobe pouco — senão o braço virava anzol
      const dir = new THREE.Vector3(
        tip.p[0] - owner.n.p[0],
        tip.p[1] - owner.n.p[1],
        tip.p[2] - owner.n.p[2],
      ).normalize();
      const radial = new THREE.Vector3(owner.n.p[0], 0, owner.n.p[2]).normalize();
      // a ponta EMENDA na TANGENTE da própria log-espiral: o tangente é
      // r·eφ + (dr/dθ)·eρ com dr/dθ = 0,2·r → só 0,2/√1,04 ≈ 0,196 de componente
      // radial. É isso que faz o braço CONTINUAR o traço em vez de virar anzol
      const wr = dir.dot(radial);
      expect(wr).toBeGreaterThan(0.15);
      expect(wr).toBeLessThan(0.3);
      expect(dir.y).toBeGreaterThan(0.1); // e quase no plano do disco (não empina)
      expect(dir.y).toBeLessThan(0.25);
    }
  });

  test('a cara LEVANTADA: boca de buraco negro (aro âmbar aberto + poço de breu) e olhos de buraco com faísca', () => {
    const parts = P9();
    const face = parts.filter((p) => p.tag && FACE_TAGS.has(p.tag));
    expect(face.length).toBe(11);
    // a cabeça sobe num pescoço de gravidade para os onze braços varrerem por
    // BAIXO dela: a base da cara fica acima do topo dos nós do disco
    const column = parts.find((p) => p.tag === 'head.column')!;
    expect(column.g).toBe('cyl');
    expect(column.a[3]).toBe(11);
    expect(column.p[1] + column.a[2] / 2).toBeGreaterThan(ASTRAL_DISK_Y + 1.0); // pescoço COMPRIDO
    const topKnot = Math.max(...parts.filter((p) => p.tag === 'arm.node').map((p) => p.p[1] + p.a[0]));
    const faceBottom = Math.min(...face.map((p) => p.p[1])) - 0.16;
    expect(faceBottom).toBeGreaterThan(topKnot); // a cara INTEIRA acima dos nós
    // a placa é CLARA (geada), LISA (amp miúdo: rosto, não rocha serrilhada) e
    // de ONZE faces; o sobrolho ESCURO por cima dá o contraste claro/escuro
    const mask = face.find((p) => p.tag === 'mask')!;
    expect(mask.g).toBe('cyl');
    expect(mask.a[3]).toBe(11);
    expect(mask.m).toBe('accent');
    expect(mask.amp ?? 1).toBeLessThanOrEqual(0.01);
    expect(Math.abs(mask.r?.[0] ?? 0)).toBeGreaterThan(1.5); // DEITADA encarando a frente
    expect(mask.p[2]).toBeGreaterThan(0.2); // no frente da cabeça
    const brow = face.find((p) => p.tag === 'brow')!;
    expect(brow.g).toBe('box');
    expect(brow.m).toBe('dark');
    expect(brow.p[1]).toBeGreaterThan(mask.p[1]); // sobrancelha ALTA sobre a placa
    // A BOCA É O PRÓPRIO BURACO: um tubo ABERTO de onze faces (aro âmbar) com o
    // disco de breu do poço DENTRO, visto pela abertura — é por onde os cometas
    // saem (a silhueta do que cospe o `pierce` do motor)
    const rim = face.find((p) => p.tag === 'core.rim')!;
    expect(rim.g).toBe('cyl');
    expect(rim.a[3]).toBe(11);
    expect(rim.a[5]).toBe(1); // ABERTO: é goela, não carretel fechado
    expect(rim.m).toBe('glow'); // e o ÚNICO `glow` estrutural que veste plasma aditivo
    const pit = face.find((p) => p.tag === 'core.pit')!;
    expect(pit.m).toBe('black');
    expect(pit.a[0]).toBeLessThan(rim.a[1]); // o poço cabe DENTRO do aro
    expect(pit.p[1]).toBeCloseTo(rim.p[1], 3); // coaxial com a boca
    expect(pit.p[2]).toBeLessThan(rim.p[2]); // no FUNDO da boca (o breu atrás do aro)
    // a boca do motor: o rig cospe de ASTRAL_CORE_POS — no eixo da boca, dentro
    // do aro, aberta para a FRENTE (não para dentro do crânio)
    expect(ASTRAL_CORE_POS[1]).toBeCloseTo(rim.p[1], 3);
    expect(ASTRAL_CORE_POS[2]).toBeGreaterThan(rim.p[2] - rim.a[2] / 2);
    expect(ASTRAL_CORE_POS[2]).toBeLessThan(rim.p[2] + rim.a[2] / 2);
    // olho = BURACO de breu com a faísca de geada NA FRENTE: olho-branco-em-
    // placa-branca desaparecia no print (a lição que custou a cara no 1º QA)
    const eyes = face.filter((p) => p.tag === 'eye');
    const pupils = face.filter((p) => p.tag === 'eye.pupil');
    expect(eyes.length).toBe(2);
    expect(pupils.length).toBe(2);
    for (const e of eyes) {
      expect(e.m).toBe('black');
      expect(e.g).toBe('sphere');
      const pupil = pupils.find((p) => Math.abs(Math.abs(p.p[0]) - Math.abs(e.p[0])) < 0.01)!;
      expect(pupil.p[2]).toBeGreaterThan(e.p[2]); // a faísca na frente do buraco
      expect(pupil.a[0]).toBeLessThan(e.a[0]); // miúda: estrela, não bola
      expect(pupil.p[1]).toBeCloseTo(e.p[1], 3); // no mesmo olho
      expect(Math.abs(e.p[0])).toBeGreaterThan(0.1); // fora do eixo: dois olhos
      expect(Math.sign(eyes[0].p[0])).not.toBe(Math.sign(eyes[1].p[0])); // mm espelhado
      expect(Math.abs(eyes[0].p[0])).toBeCloseTo(Math.abs(eyes[1].p[0]), 6);
      expect(Math.abs(e.p[1] - mask.p[1])).toBeLessThan(0.3); // dentro do rosto
    }
    // queixo e bochechas de geada fecham a cara de onze faces
    expect(face.find((p) => p.tag === 'chin')!.p[1]).toBeLessThan(mask.p[1]);
    expect(face.filter((p) => p.tag === 'cheek').length).toBe(2);
  });

  test('jatos varridos para TRÁS, coroa intercalada e onze raízes plantando o titã', () => {
    const parts = P9();
    // os onze jatos abrem ATRÁS da cara (a cara fica no frente z +0,3): o topo
    // de cada vara mora em z NEGATIVO e nenhum jato passa na frente do rosto
    for (const j of parts.filter((p) => p.tag === 'jet.rod')) {
      const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(j.r?.[0] ?? 0, j.r?.[1] ?? 0, j.r?.[2] ?? 0));
      expect(dir.z).toBeLessThan(-0.2); // varrido para trás
      expect(j.a[1]).toBeLessThanOrEqual(0.06); // FINO: vara grossa com relevo vira canudo/pá
      expect(j.p[1]).toBeGreaterThan(ASTRAL_DISK_Y + 0.5); // acima do plano
    }
    const beads = parts.filter((p) => p.tag === 'jet.bead');
    const jets = parts.filter((p) => p.tag === 'jet.rod');
    expect(beads.length).toBe(11);
    for (const b of beads) {
      expect(b.m).toBe('accent'); // geada na ponta do jato
      // a ponta de geada mora na BOCA do jato, não boiando: compara com o TOPO DO
      // EIXO da vara (a caixa dela espicharia para cima por a vara ser inclinada)
      const near = jets
        .map((j) => {
          const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(j.r?.[0] ?? 0, j.r?.[1] ?? 0, j.r?.[2] ?? 0));
          const half = (j.a[2] - 0.04) * 0.5;
          const axisTop: [number, number, number] = [
            j.p[0] + dir.x * half,
            j.p[1] + dir.y * half,
            j.p[2] + dir.z * half,
          ];
          return { axisTop, d: dist3(b.p, axisTop) };
        })
        .sort((a, c) => a.d - c.d)[0];
      expect(near.d).toBeLessThan(0.12); // colada na boca do jato...
      expect(b.p[1]).toBeGreaterThan(near.axisTop[1]); // ...e um dedo ACIMA, marcando a chama
    }
    // ONZE raios de coroa nascem enterrados no ombro do bojo (ρ 0,62 < lente
    // 1,196) e são CURTOS/FINOS (competiam com os braços no print anterior)
    const corona = parts.filter((p) => p.tag === 'corona');
    expect(corona.length).toBe(11);
    for (const c of corona) {
      expect(c.g).toBe('cone');
      expect(c.a[2]).toBe(11);
      expect(c.a[1]).toBeLessThanOrEqual(0.24);
      expect(c.a[0]).toBeLessThanOrEqual(0.06);
      const baseRho = Math.hypot(c.p[0], c.p[2]) - c.a[1] / 2;
      expect(baseRho).toBeGreaterThan(0.4); // ...mas não somem dentro do núcleo
      expect(baseRho).toBeLessThan(0.7);
    }
    // a coroa alternam âmbar/geada (o onze ÍMPAR nunca fecha em par) e ficam
    // INTERCALADA aos jatos: nenhuma coroa divide a azimute com um jato (elas
    // nascem em π/11 + k·2π/11 contra k·2π/11 dos jatos — meio passo de 11)
    const ms = new Set(corona.map((c) => c.m));
    expect(ms.size).toBe(2);
    expect(corona.filter((c) => c.m === 'glow').length).toBe(6);
    expect(corona.filter((c) => c.m === 'accent').length).toBe(5);
    const az = (x: number, z: number) => Math.atan2(z, x);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // a azimute do JATO é a do PÉ dele (a vara é varrida para trás, então o
    // centro e o topo estão deslocados em z e mentiriam sobre o fã)
    const jetFeet = jets.map((j) => {
      const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(j.r?.[0] ?? 0, j.r?.[1] ?? 0, j.r?.[2] ?? 0));
      const half = (j.a[2] - 0.04) * 0.5;
      return az(j.p[0] - dir.x * half, j.p[2] - dir.z * half);
    });
    for (const c of corona) {
      const dmin = Math.min(...jetFeet.map((a) => Math.abs(wrap(az(c.p[0], c.p[2]) - a))));
      expect(dmin).toBeGreaterThan(Math.PI / 11 - 0.02); // o intercalado é o meio passo
      expect(dmin).toBeLessThan(Math.PI / 11 + 0.02);
    }
    // ONZE raízes de gravidade descem do núcleo para FORA e pousam em ONZE
    // almofadas rentes ao piso: é assim que o titã fica plantado sem ser montanha
    const roots = parts.filter((p) => p.tag === 'root.rod');
    expect(roots.length).toBe(11);
    for (const r of roots) {
      expect(r.g).toBe('cyl');
      expect(r.m).toBe('body');
      const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(r.r?.[0] ?? 0, r.r?.[1] ?? 0, r.r?.[2] ?? 0));
      expect(dir.y).toBeLessThan(-0.5); // aponta para BAIXO
      expect(r.p[1] - r.a[2] / 2).toBeGreaterThan(0); // encosta no piso, nunca afunda
      expect(r.p[1] + r.a[2] / 2).toBeLessThan(ASTRAL_DISK_Y); // nasce abaixo do plano do disco
    }
    const pads = parts.filter((p) => p.tag === 'root.pad');
    expect(pads.length).toBe(11);
    for (const pd of pads) {
      expect(pd.g).toBe('cyl');
      expect(pd.a[3]).toBe(11);
      expect(pd.a[2]).toBeLessThanOrEqual(0.08); // almofada CHATA
      expect(pd.p[1] - pd.a[2] / 2).toBeGreaterThanOrEqual(0); // pousada, nunca afundada
      expect(pd.p[1] - pd.a[2] / 2).toBeLessThan(0.12); // rente ao chão
    }
  });

  test('ressoador: QUATRO velocidades (rotação diferencial) e a cauda de maré plantada no fundo', () => {
    const parts = P9();
    // zero toro e zero `ring` em pé (a regra estrutural da árvore): o astral não
    // usa nenhum dos dois — o "anel" dele são três cintas de peças soltas
    expect(parts.some((p) => p.g === 'torus')).toBe(false);
    expect(parts.some((p) => p.g === 'ring')).toBe(false);
    // a cinta EXTERNA fecha a borda da galáxia no MESMO plano dos braços e
    // sempre por FORA da ponta deles (no mesmo plano, raio que não se sobrepõe)
    const rim = parts.filter((p) => p.tag === 'swarm.rim');
    expect(rim.length).toBe(11);
    const armMax = Math.max(...parts.filter((p) => p.tag === 'arm.tip').map((p) => rhoOf(p) + halfExtent(p)));
    for (const r of rim) {
      expect(r.group).toBe(0);
      expect(r.g).toBe('octa');
      expect(r.m).toBe('glow');
      expect(rhoOf(r) - halfExtent(r)).toBeGreaterThan(armMax); // nunca encostam
      expect(Math.abs(r.p[1] - ASTRAL_DISK_Y)).toBeLessThan(0.01); // no plano do disco
    }
    // as duas cintas GLOBULARES (halo acima, matéria caindo abaixo) ficam no
    // plano HORIZONTAL — é isso que permite deitar o disco sem que elas cruzem
    // a faixa varrida pelos braços
    const halo = parts.filter((p) => p.tag === 'swarm.halo');
    const fall = parts.filter((p) => p.tag === 'swarm.fall');
    expect(halo.length).toBe(11);
    expect(fall.length).toBe(11);
    for (const h of halo) {
      expect(h.group).toBe(1);
      expect(h.p[1]).toBeGreaterThan(ASTRAL_DISK_Y + 1.0); // acima do bojo
      expect(rhoOf(h)).toBeGreaterThan(1.5); // e por fora do leque dos jatos
    }
    for (const f of fall) {
      expect(f.group).toBe(2);
      expect(f.p[1]).toBeLessThan(ASTRAL_DISK_Y - 1.0); // abaixo do bojo
      expect(f.m).toBe('glow'); // o anel de acreção: âmbar miúdo (era escura sobre escura)
    }
    // a CAUDA DE MARÉ é a esteira plantada: ONZE nós saindo da borda do disco
    // (ρ 1,98) e subindo até ρ ~2,98 para o FUNDO do tabuleiro — não gira com
    // nada, e é ela que estica a pegada do titã
    const tail = parts.filter((p) => (p.tag ?? '').startsWith('tail'));
    expect(tail.length).toBe(16); // 11 nós + 5 varas ligando nós alternados
    const nodes = tail.filter((p) => p.tag === 'tail.node');
    expect(nodes.length).toBe(11);
    for (const n of nodes) expect(n.group).toBeUndefined();
    const rhos = nodes.map((n) => rhoOf(n));
    expect(Math.min(...rhos)).toBeGreaterThanOrEqual(1.9);
    expect(Math.max(...rhos)).toBeGreaterThanOrEqual(2.8); // fundo do slot
    const ys = nodes.map((n) => n.p[1]);
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 1.0); // a maré SAI do plano e sobe
    expect(nodes[nodes.length - 1].p[2]).toBeLessThan(-2.0); // aponta para o fundo (−z)
    // as varas ligam nós ALTERNADOS (o fio emendado só nos nós mais firmes)
    for (const rod of tail.filter((p) => p.tag === 'tail.rod')) {
      const near = nodes
        .map((n) => ({ n, d: dist3(rod.p, n.p) }))
        .sort((a, b) => a.d - b.d);
      expect(near[0].d).toBeLessThan(0.9);
      expect(near[1].d).toBeLessThan(0.9);
      expect(near[0].n).not.toBe(near[1].n);
    }
  });

  test('invólucro: os braços abertos e as quatro rotações cabem no slot, com a cauda no fundo', () => {
    const box = astralEnvelope(P9());
    const halfX = Math.max(box.max.x, -box.min.x);
    const halfZ = Math.max(box.max.z, -box.min.z);
    // a galáxia aberta preenche o slot sem encostar no vizinho (a cinta externa
    // em ρ 2,42 + o octaedro dela é o que manda na largura)
    expect(halfX).toBeGreaterThanOrEqual(2.4);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    // a cauda de maré estica a pegada para o FUNDO: a meia-profundidade é MAIOR
    // que a meia-largura (a régua do titã deitado no tabuleiro) e fica longe do
    // teto de duas linhas
    expect(halfZ).toBeGreaterThanOrEqual(2.6);
    expect(halfZ).toBeGreaterThan(halfX);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantado: as onze âncoras pousam no piso e NUNCA afundam (mesmo com o bob
    // miúdo do UnitView somando)
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(box.min.y).toBeLessThan(0.15);
    // os jatos e as pontas de geada usam a altura da forma sem estourar o teto
    // — e ainda sobra folga para o flare do estouro (as varas crescem ~46%)
    expect(box.max.y).toBeGreaterThanOrEqual(4.6);
    expect(box.max.y).toBeLessThanOrEqual(formTop(ASTRAL, 9) + 0.25);
    expect(box.max.y + 0.4).toBeLessThanOrEqual(formTop(ASTRAL, 9) + 0.25); // o flare cabe na folga
    // a boca do motor fica DENTRO do invólucro (o ponto de onde os cometas
    // saem nunca some do corpo) e a cara nunca é atravessada pelos braços
    expect(ASTRAL_CORE_POS[1]).toBeGreaterThan(box.min.y);
    expect(ASTRAL_CORE_POS[1]).toBeLessThan(box.max.y);
    const parts = P9();
    const faceBottom = Math.min(...parts.filter((p) => p.tag && FACE_TAGS.has(p.tag)).map((p) => p.p[1]));
    // varridos e inclinados, os corpos do plano param ABAIXO da cara no lado de
    // FRENTE (é atrás que a borda do disco sobe — por isso a cara fica no frente)
    let frontMax = -Infinity;
    for (const p of parts) {
      if (p.group !== 3 && p.group !== 0) continue;
      const geo = getGeometry(p.g, p.a);
      if (!geo.boundingBox) geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const s = p.s ?? [1, 1, 1];
      const pivot = new THREE.Vector3(ASTRAL_DISK_PIVOT[0], ASTRAL_DISK_PIVOT[1], ASTRAL_DISK_PIVOT[2]);
      for (let i = 0; i < 16; i++) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ASTRAL_TILT + 0.014);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i / 16) * Math.PI * 2));
        for (const cx of [b.min.x, b.max.x])
          for (const cy of [b.min.y, b.max.y])
            for (const cz of [b.min.z, b.max.z]) {
              const v = new THREE.Vector3(cx * s[0] + p.p[0], cy * s[1] + p.p[1], cz * s[2] + p.p[2])
                .sub(pivot)
                .applyQuaternion(q)
                .add(pivot);
              if (v.z > 0.2) frontMax = Math.max(frontMax, v.y);
            }
      }
    }
    expect(frontMax).toBeLessThan(faceBottom - 0.15); // os braços passam POR BAIXO da cara
  });

  test('ANTI LOW-POLY: 228 peças / ~34 mil vértices e o onze denso por dentro', () => {
    const parts = P9();
    expect(parts.length).toBeGreaterThanOrEqual(220);
    let drawn = 0;
    for (const p of parts) drawn += getGeometry(p.g, p.a).getAttribute('position').count;
    expect(drawn).toBeGreaterThanOrEqual(30000); // quase o dobro do Cósmico (14,8 mil)
    // densidade vem dos ANÉIS VERTICAIS das varas (rod11: ≥ 7 por unidade) e não
    // de arredondar o cano — o onze continua sendo o onze
    // densidade vem dos ANÉIS VERTICAIS das varas (o contrato do `rod11`: ≥ 7
    // anéis por unidade de comprimento, mínimo de 4) e não de arredondar o cano —
    // o onze continua sendo o onze em TODA vara do figurino
    const varas = parts.filter(
      (p) => p.g === 'cyl' && ((p.tag ?? '').includes('rod') || (p.tag ?? '') === 'head.column'),
    );
    expect(varas.length).toBe(66); // 33 de braço + 5 da barra + 11 de jato + 11 de raiz + 5 de cauda + 1 de coluna
    for (const p of varas) {
      expect(p.a[3]).toBe(11);
      expect(p.a[4]).toBe(Math.max(4, Math.round((p.a[2] - 0.04) * 7)));
    }
    // as varas COMPRIDAS levam os anéis todos (o close não pode serrilhar o
    // pescoço nem o jato: 9 e 7 anéis respectivamente)
    const col = parts.find((p) => p.tag === 'head.column')!;
    expect(col.a[2]).toBeGreaterThan(1.3);
    expect(col.a[4]).toBeGreaterThanOrEqual(9);
    for (const j of parts.filter((p) => p.tag === 'jet.rod')) expect(j.a[4]).toBeGreaterThanOrEqual(7);
    // contagens REAIS de malha por FAMÍLIA (o que sai do cache de geometria, não
    // chute): nada de peça de 20 triângulos num close — o nó de estrela jovem é
    // icosaedro sub 1 (42+), o fuso de onze faces tem 30+, a vara 60+ e o olho
    // de esfera tem 100+
    let worstIco = Infinity;
    let worstCone = Infinity;
    let worstCyl = Infinity;
    let worstSphere = Infinity;
    for (const p of parts) {
      const n = getGeometry(p.g, p.a).getAttribute('position').count;
      if (p.g === 'ico') worstIco = Math.min(worstIco, n);
      if (p.g === 'cone') worstCone = Math.min(worstCone, n);
      if (p.g === 'cyl') worstCyl = Math.min(worstCyl, n);
      if (p.g === 'sphere') worstSphere = Math.min(worstSphere, n);
    }
    expect(worstIco).toBeGreaterThanOrEqual(42);
    expect(worstCone).toBeGreaterThanOrEqual(30);
    expect(worstCyl).toBeGreaterThanOrEqual(30); // a almofada da raiz (7 mm de altura) é o pior caso e ainda tem as ONZE faces + 4 anéis
    expect(worstSphere).toBeGreaterThanOrEqual(90); // o pior caso é a faísca do olho (10×8 = 99 vértices)
    // nada de esfera low-poly de 1 segmento no figurino novo (a higiene da árvore)
    for (const p of parts) if (p.g === 'sphere') expect(p.a[1]).toBeGreaterThanOrEqual(8);
  });

  test('paleta ÚNICA: âmbar-de-bojo #ffb347 é motor, casca, traço, boca e FX — o Cósmico do avesso', () => {
    expect(ASTRAL_STARLIGHT).toBe('#ffb347');
    expect(ASTRAL_FROST).toBe('#cfe4ff');
    expect(ASTRAL.base.projectileColor).toBe(ASTRAL_STARLIGHT);
    expect(VISUALS.astral.glow).toBe(ASTRAL_STARLIGHT);
    expect(VISUALS.astral.accent).toBe(ASTRAL_FROST);
    expect(ASTRAL_VOID).toBe(VISUALS.astral.body);
    // a identidade atravessa TODOS os trajes: a trinca da rocha do vazio, a
    // trinca do breu, a trinca da geada, a pedra dos traços de luz, o plasma da
    // boca e o veio das fagulhas do rastro
    expect(VOID_ASTRAL_LOOK.crack).toBe(ASTRAL_STARLIGHT);
    expect(VOID_ASTRAL_DEEP_LOOK.crack).toBe(ASTRAL_STARLIGHT);
    expect(FROST_ASTRAL_LOOK.crack).toBe(ASTRAL_STARLIGHT);
    expect(STARLIGHT_ASTRAL_LOOK.crack).toBe(ASTRAL_STARLIGHT); // a identidade mora no VEIO do traço
    expect(GALAXY_LOOK.gold).toBe(ASTRAL_STARLIGHT);
    expect(ASTRAL_COMET_LOOK.crack).toBe(ASTRAL_STARLIGHT);
    // e a geada é sempre a SEGUNDA cor: o fresnel do plasma, o aro do olho e o
    // cool do núcleo do cometa
    expect(GALAXY_LOOK.cool).toBe(ASTRAL_FROST);
    expect(EYE_ASTRAL_LOOK.gold).toBe(ASTRAL_FROST);
    expect(ASTRAL_COMET_CORE_LOOK.cool).toBe(ASTRAL_FROST);
    // A FAMÍLIA DO AVESSO: o Cósmico (Nv.9) é estrela FRIA com fio de OURO; o
    // Astral é motor QUENTE com acento de GEADA. É assim que um print separa os
    // dois Nv.9 da árvore.
    expect(rgb(ASTRAL_STARLIGHT).r).toBeGreaterThan(rgb(ASTRAL_STARLIGHT).b); // âmbar quente
    expect(rgb(ASTRAL_FROST).b).toBeGreaterThan(rgb(ASTRAL_FROST).r); // geada fria
    expect(rgb(COSMICO_STARLIGHT).b).toBeGreaterThan(rgb(COSMICO_STARLIGHT).r); // e o tio é o contrário
    expect(ASTRAL_STARLIGHT).not.toBe(COSMICO_STARLIGHT);
    expect(ASTRAL_FROST).not.toBe(COSMICO_HEAT);
    expect(ASTRAL_COMET_CORE_LOOK.gold).toBe(ASTRAL_STARLIGHT); // motor QUENTE no miolo...
    // ...e o miolo do tio é o INVERSO exato: estrela fria com o fresnel de ouro
    expect(CORE_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(CORE_LOOK.cool).toBe(COSMICO_HEAT);
    // o corpo é GRAFITE-VIOLEU de vazio (nunca a pedra-lua azul da constelação)
    expect(luma(VOID_ASTRAL_LOOK.rockA)).toBeGreaterThan(0.02); // rocha com corpo, não preto chato
    expect(luma(VOID_ASTRAL_LOOK.rockA)).toBeLessThan(0.2); // e sempre ESCURA: o vazio entre estrelas
    expect(luma(VOID_ASTRAL_DEEP_LOOK.rockA)).toBeLessThan(luma(VOID_ASTRAL_LOOK.rockA)); // o breu das raízes é mais fundo
    expect(VISUALS.astral.dark).toBe(VOID_ASTRAL_DEEP_LOOK.rockB);
    // A LÂMPADA DE LAVA QUE NINGUÉM QUER: com setenta e oito traços acesos ao
    // mesmo tempo, PEDRA âmbar somava na câmera da arena e a silhueta lia só
    // tubos de fogo (o bojo grafite e a geada sumiam). Então a pedra do traço é
    // BRONZE ESCURO e o âmbar fica só no veio: a pedra do traço é mais escura
    // que a cor do motor e o veio é que é a luz
    expect(luma(STARLIGHT_ASTRAL_LOOK.rockA)).toBeLessThan(luma(ASTRAL_STARLIGHT) * 0.6);
    expect(luma(STARLIGHT_ASTRAL_LOOK.rockA)).toBeGreaterThan(0.05); // bronze com corpo, não preto chato
    expect(luma(STARLIGHT_ASTRAL_LOOK.rockB)).toBeLessThan(luma(STARLIGHT_ASTRAL_LOOK.rockA));
    expect(luma(ASTRAL_STARLIGHT)).toBeGreaterThan(luma(VOID_ASTRAL_LOOK.rockA) * 4); // motor sobre o vazio
    // claro/escuro: a geada (máscara, nós, pontas) lê MUITO mais clara que o
    // vazio — é o único contraste que sobrevive no card miúdo
    expect(luma(FROST_ASTRAL_LOOK.rockA)).toBeGreaterThan(0.6);
    expect(luma(FROST_ASTRAL_LOOK.rockA)).toBeGreaterThan(luma(VOID_ASTRAL_LOOK.rockA) * 3);
    // A LIÇÃO CARA DESTA ESPÉCIE: os traços ESTRUTURAIS são pedra OPACA com o
    // veio aceso — o plasma aditivo (translúcido, depthWrite:false, DoubleSide)
    // numa vara de 0,055 deixa ver a própria face de trás e engorda o traço até
    // virar TÁBUA. A régua fica no uniforme: opaco, escreve fundo, veio FINO e
    // a luz vem do VEIO (glow alto), nunca da pedra inteira
    const stroke = makeStoneMaterial({
      rockA: STARLIGHT_ASTRAL_LOOK.rockA,
      rockB: STARLIGHT_ASTRAL_LOOK.rockB,
      crack: STARLIGHT_ASTRAL_LOOK.crack,
      amp: STARLIGHT_ASTRAL_LOOK.amp,
      crackGlow: STARLIGHT_ASTRAL_LOOK.crackGlow,
      crackScale: STARLIGHT_ASTRAL_LOOK.crackScale,
      crackWidth: STARLIGHT_ASTRAL_LOOK.crackWidth,
      crackBoost: STARLIGHT_ASTRAL_LOOK.crackBoost,
      speck: STARLIGHT_ASTRAL_LOOK.speck,
    });
    expect(stroke.transparent).toBe(false); // OPAQUE: é o que segura a largura do traço
    expect(stroke.depthWrite).toBe(true);
    expect(stroke.uniforms.uCrackGlow.value).toBeGreaterThanOrEqual(1.2); // o veio É a luz
    expect(stroke.uniforms.uCrackGlow.value * stroke.uniforms.uCrackBoost.value).toBeGreaterThan(1.5);
    expect(stroke.uniforms.uCrackScale.value).toBeLessThan(3); // veio largo o suficiente para ler de longe
    expect(stroke.uniforms.uCrack.value.getHexString()).toBe(STARLIGHT_ASTRAL_LOOK.crack.slice(1)); // o âmbar do motor no veio
    // a veia tem que caber DENTRO da vara mais fina do figurino (o jato de
    // 0,0396 de raio na boca): veio largo cobre a peça e o traço lê BRANCO com
    // borda âmbar — o inverso do pedido
    const thinnest = Math.min(
      ...P9().filter((p) => p.m === 'glow' && p.g === 'cyl').map((p) => p.a[0]),
    );
    expect(STARLIGHT_ASTRAL_LOOK.crackWidth).toBeLessThanOrEqual(thinnest);
    stroke.dispose();
    // SÓ a boca e o olho são plasma de verdade (goela de buraco negro): o
    // aditivo é o efeito pedido ali, e o miolo nunca é branco puro
    const mouth = makeCoreMaterial({
      gold: GALAXY_LOOK.gold,
      white: GALAXY_LOOK.white,
      cool: ASTRAL_VOID, // poço: o miolo da boca é o vazio
      amp: GALAXY_LOOK.amp,
    });
    expect(mouth.transparent).toBe(true); // plasma do Raio: translúcido,
    expect(mouth.depthWrite).toBe(false); // não escreve fundo e
    expect(mouth.side).toBe(THREE.DoubleSide); // mostra os dois lados — o traje da GOELA
    expect(mouth.uniforms.uGold.value.getHexString()).toBe(ASTRAL_STARLIGHT.slice(1));
    expect(GALAXY_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(GALAXY_LOOK.white)).toBeLessThan(0.95);
    expect(luma(GALAXY_LOOK.white)).toBeGreaterThan(luma(GALAXY_LOOK.gold)); // o miolo é o ponto mais claro
    mouth.dispose();
    // A RÉGUA DO RELEVO (a outra lição cara): o shader desloca vértice AO LONGO
    // DA NORMAL, então amplitude da ordem do raio da peça INFLA a peça (os onze
    // braços viraram tábuas e os onze jatos viraram canudos gordos). A
    // amplitude vem do tamanho da peça (¼ da menor meia-dimensão), e o figurino
    // amplitude vem do TAMANHO da peça (¼ da menor meia-dimensão dela), e o
    // figurino todo obedece: nenhum traço come relevo maior que isso
    const rMinOf = (p: Part): number => {
      const g = getGeometry(p.g, p.a);
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox ?? new THREE.Box3();
      const s = p.s ?? [1, 1, 1];
      return (
        Math.min((b.max.x - b.min.x) * s[0], (b.max.y - b.min.y) * s[1], (b.max.z - b.min.z) * s[2]) / 2
      );
    };
    const ampOf = (p: Part, base: number): number =>
      Math.round(Math.min(base, rMinOf(p) * 0.25) * 200) / 200;
    for (const p of P9()) {
      if (p.m === 'glow' && p.tag !== 'core.rim') {
        const amp = ampOf(p, STARLIGHT_ASTRAL_LOOK.amp);
        // a régua do rig: relevo de no máximo ¼ da menor meia-dimensão da peça
        expect(amp).toBeLessThanOrEqual(rMinOf(p) * 0.25 + 0.005);
        // e nos fiamentos (todos os traços do titã têm menos de 0,18 de
        // espessura) isso significa nada de tábua: ≤ 0,02
        expect(rMinOf(p)).toBeLessThan(0.12);
        expect(amp).toBeLessThanOrEqual(0.025);
      }
    }
    // e as amplitudes DECLARADAS do figurino são todas contidas (a casca do
    // titã é rocha lida, não relevo de 0,1): o teto medido é 0,022
    const amps = P9().filter((p) => p.amp !== undefined).map((p) => p.amp as number);
    expect(amps.length).toBeGreaterThanOrEqual(30);
    expect(Math.max(...amps)).toBeLessThanOrEqual(0.025);
    // e o traje base do traço nunca pede mais que o uniforme manda
    expect(STARLIGHT_ASTRAL_LOOK.amp).toBeLessThanOrEqual(0.04);
  });

  test('o cometa arremessado é um pedaço do titã: breu com trinca âmbar, miolo aceso e rastro de geada', () => {
    // cometa = o MESMO breu do bojo (o fuso é gravidade partida do próprio
    // titã) com a trinca do MOTOR, recém-saído da boca: mais aceso que o corpo
    expect(ASTRAL_COMET_LOOK.rockA).toBe(VOID_ASTRAL_DEEP_LOOK.rockA);
    expect(ASTRAL_COMET_LOOK.rockB).toBe(VOID_ASTRAL_DEEP_LOOK.rockB);
    expect(ASTRAL_COMET_LOOK.crack).toBe(ASTRAL_STARLIGHT);
    expect(ASTRAL_COMET_LOOK.crackGlow).toBeGreaterThan(VOID_ASTRAL_DEEP_LOOK.crackGlow);
    // o caroço de estrela jovem dentro do fuso é o `chain 3` escrito em
    // silhueta: âmbar do MESMO motor com a geada no fresnel — de novo o
    // inverso exato do Cósmico (estrela azul com fio de ouro)
    expect(ASTRAL_COMET_CORE_LOOK.gold).toBe(ASTRAL_STARLIGHT);
    expect(ASTRAL_COMET_CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(ASTRAL_COMET_CORE_LOOK.cool).toBe(ASTRAL_FROST);
    // o rastro é a GEADA (o acento), nunca o âmbar do motor — senão o rastro e
    // a cabeça viravam a mesma mancha laranja no print
    expect(ASTRAL_SPARK_LOOK.rockA).toBe(FROST_ASTRAL_LOOK.rockA);
    expect(ASTRAL_SPARK_LOOK.rockB).toBe(FROST_ASTRAL_LOOK.rockB);
    expect(ASTRAL_SPARK_LOOK.crack).toBe(ASTRAL_STARLIGHT); // o motor puxa a geada
    // e o traje do cometa obedece às mesmas duas réguas do corpo: casca OPACA
    // (cometa é pedra, não holograma) e relevo miúdo (0,42 de diâmetro por 0,62
    // de corpo afilado — a silhueta do `pierce 2` e da espécie mais rápida)
    const comet = makeStoneMaterial({
      rockA: ASTRAL_COMET_LOOK.rockA,
      rockB: ASTRAL_COMET_LOOK.rockB,
      crack: ASTRAL_COMET_LOOK.crack,
      amp: 0.016,
      crackGlow: ASTRAL_COMET_LOOK.crackGlow,
      crackScale: ASTRAL_COMET_LOOK.crackScale,
      crackWidth: ASTRAL_COMET_LOOK.crackWidth,
      crackBoost: ASTRAL_COMET_LOOK.crackBoost,
      speck: ASTRAL_COMET_LOOK.speck,
    });
    expect(comet.transparent).toBe(false);
    expect(comet.depthWrite).toBe(true);
    expect(comet.uniforms.uAmp.value).toBeLessThanOrEqual(0.02); // aguda não arredonda
    expect(comet.uniforms.uCrack.value.getHexString()).toBe(ASTRAL_STARLIGHT.slice(1));
    comet.dispose();
    const core = makeCoreMaterial({
      gold: ASTRAL_COMET_CORE_LOOK.gold,
      white: ASTRAL_COMET_CORE_LOOK.white,
      cool: ASTRAL_COMET_CORE_LOOK.cool,
      amp: ASTRAL_COMET_CORE_LOOK.amp,
    });
    expect(core.transparent).toBe(true); // o miolo é PLASMA (a cabeça acesa):
    expect(core.depthWrite).toBe(false); // translúcido, sem fundo, dos dois lados
    expect(core.side).toBe(THREE.DoubleSide); // — o traje do caroço de estrela
    expect(core.uniforms.uCool.value.getHexString()).toBe(ASTRAL_FROST.slice(1));
    core.dispose();
  });

  test('coreografia: a janela mais curta dos Nv.7-9 e a afinação mais LONGA (o disco encurca e destora)', () => {
    // cadência de 1,2 s (empatada com a do tio Cósmico como a mais rápida dos
    // Nv.7-9) pede afinação CURTA em tempo...
    expect(ASTRAL_ATTACK_WINDOW).toBeLessThan(COSMICO_ATTACK_WINDOW);
    expect(ASTRAL_ATTACK_WINDOW).toBeLessThan(VULCAN_ATTACK_WINDOW);
    expect(ASTRAL_ATTACK_WINDOW).toBeLessThan(GEODO_ATTACK_WINDOW);
    expect(ASTRAL_ATTACK_WINDOW).toBeLessThan(ABISSAL_ATTACK_WINDOW);
    expect(ASTRAL_ATTACK_WINDOW).toBeLessThan(CRISTAL_ATTACK_WINDOW);
    expect(ASTRAL_ATTACK_WINDOW).toBeGreaterThan(0.5); // mas o titã não é relâmpago
    // ...e a fração de alinhamento mais LONGA da árvore (0,7): o titã encurca o
    // disco sobre o próprio bojo antes de destorá-lo
    expect(ASTRAL_WINDUP).toBe(0.7);
    for (const other of [COSMICO_WINDUP, GEODO_WINDUP, VULCAN_WINDUP, ABISSAL_WINDUP, PLASMA_WINDUP, OBSIDIANA_WINDUP, TEMPESTADE_WINDUP])
      expect(other).toBeLessThan(ASTRAL_WINDUP);
    const keys: (keyof ReturnType<typeof attackPose>)[] = ['flinch', 'align', 'charge', 'flare', 'snap', 'quake'];
    const zero = (s: number) => keys.forEach((k) => expect(attackPose(s)[k]).toBe(0));
    zero(-1);
    zero(ASTRAL_ATTACK_WINDOW + 0.2);
    // começa do descanso SEM solavanco (o flare não nasce em 0,16 no primeiro
    // frame: isso erguia os jatos num tranco de partida)
    expect(attackPose(0).flare).toBe(0);
    expect(attackPose(0.02).flare).toBeLessThan(0.2);
    const wind = attackPose(ASTRAL_ATTACK_WINDOW * ASTRAL_WINDUP * 0.95);
    expect(wind.align).toBeGreaterThan(0.95); // a cabeça travou o alvo mais distante
    expect(wind.charge).toBeGreaterThan(0.9); // a boca de buraco negro abrindo o aro
    expect(wind.flare).toBeGreaterThan(0.4); // jatos e coroa eriçados
    expect(Math.abs(wind.flinch)).toBeLessThan(0.06); // o encurca JÁ devolveu (sen(π)=0)
    // no estouro o disco DESTORA: o tranco chega a 1 (o snap é impulso — ele
    // nasce a 1 no frame do tiro por desenho) e o disco rebote para o outro lado
    const strike = attackPose(ASTRAL_ATTACK_WINDOW * ASTRAL_WINDUP + 0.001);
    expect(strike.snap).toBeGreaterThan(0.95); // exp(-6,5r): o impulso já começa quase no topo
    expect(strike.quake).toBeGreaterThan(0.98); // o coice do eixo
    expect(strike.flinch).toBeLessThan(0); // o disco rebate ao CONTRÁRIO do encurca
    expect(strike.align).toBeGreaterThan(0.9); // e o pescoço ainda segura a mira
    expect(strike.flare).toBeGreaterThan(wind.flare + 0.8); // os jatos estouram
    // CONTINUIDADE (a régua da árvore): flinch/align/charge são contínuos no
    // frame do tiro — só snap/quake/flare são impulso declarado
    const before = attackPose(ASTRAL_ATTACK_WINDOW * ASTRAL_WINDUP - 0.001);
    expect(Math.abs(strike.flinch - before.flinch)).toBeLessThan(0.02);
    expect(Math.abs(strike.align - before.align)).toBeLessThan(0.02);
    expect(Math.abs(strike.charge - before.charge)).toBeLessThan(0.02);
    // e TUDO assenta no zero ANTES do fim da janela (foi o bug consertado desta
    // espécie: o `align` parava em 1 e o `flare` em 0,5 no último frame do coice
    // e a cabeça/jatos cortavam num frame só, dando um pulo a cada tiro)
    const late = attackPose(ASTRAL_ATTACK_WINDOW * 0.999);
    expect(Math.abs(late.flinch)).toBeLessThan(0.02);
    expect(late.align).toBeLessThan(0.05);
    expect(late.charge).toBeLessThan(0.02);
    expect(late.flare).toBeLessThan(0.15);
    expect(late.quake).toBeLessThan(0.02);
    expect(late.snap).toBeLessThan(0.01); // exp(-6,5) ≈ 0,0015
    const shot = attackPose(ASTRAL_ATTACK_WINDOW * (ASTRAL_WINDUP + 0.05 * (1 - ASTRAL_WINDUP)));
    expect(shot.charge).toBeGreaterThan(late.charge); // o miolo esvazia monotonicamente
    expect(shot.flare).toBeGreaterThan(late.flare);
    // nenhum pose ultrapassa as amplitudes coreografadas (o disco encurca 0,3 e
    // rebate 0,26; a boca abre 1 e a coroa/jatos estouram a 1,65)
    for (let s = 0; s <= ASTRAL_ATTACK_WINDOW; s += 0.01) {
      const p = attackPose(s);
      expect(Math.abs(p.flinch)).toBeLessThanOrEqual(0.31);
      expect(p.align).toBeGreaterThanOrEqual(0);
      expect(p.align).toBeLessThanOrEqual(1);
      expect(p.charge).toBeGreaterThanOrEqual(0);
      expect(p.charge).toBeLessThanOrEqual(1);
      expect(p.flare).toBeGreaterThanOrEqual(0);
      expect(p.flare).toBeLessThanOrEqual(1.66);
      expect(p.snap).toBeGreaterThanOrEqual(0);
      expect(p.snap).toBeLessThanOrEqual(1);
      expect(p.quake).toBeGreaterThanOrEqual(0);
      expect(p.quake).toBeLessThanOrEqual(1);
    }
    // os pivôs que o rig exporta vivem no corpo: o do disco no plano do disco e
    // o do pescoço entre o bojo e a cara (a cabeça bascula ali, não no chão)
    expect(ASTRAL_DISK_PIVOT[0]).toBe(0);
    expect(ASTRAL_DISK_PIVOT[2]).toBe(0);
    expect(ASTRAL_NECK_PIVOT[1]).toBeLessThan(ASTRAL_CORE_POS[1]);
    expect(ASTRAL_NECK_PIVOT[1]).toBeGreaterThan(ASTRAL_DISK_Y);
  });

  test('motor: tranca o MAIS DISTANTE e cospe o par de cometas que ATRAVESSA e salta 3', () => {
    expect(ASTRAL.base.damageElement).toBe('air');
    expect(ASTRAL.base.targeting).toBe('farthest'); // a coroa/alinhamento trava o alvo mais distante
    expect(ASTRAL.base.projectileSpeed).toBeGreaterThanOrEqual(15); // a espécie mais rápida da árvore
    expect(ASTRAL.base.projectileSpeed).toBeGreaterThan(COSMICO.base.projectileSpeed);
    expect(ASTRAL.base.range).toBeGreaterThan(COSMICO.base.range);
    expect(ASTRAL.base.interval).toBeLessThanOrEqual(1.3); // a cadência mais rápida dos Nv.7-9
    const chain = ASTRAL.base.abilities.find((a) => a.kind === 'chain');
    expect(chain && 'jumps' in chain && chain.jumps).toBe(3); // salta TRÊS (oCósmico salta 2)
    expect(chain && 'factor' in chain && chain.factor).toBe(0.55);
    const pierce = ASTRAL.base.abilities.find((a) => a.kind === 'pierce');
    expect(pierce && 'factor' in pierce && pierce.factor).toBe(2); // o cometa ATRAVESSA
    const dbl = ASTRAL.base.abilities.find((a) => a.kind === 'doubleShot');
    expect(dbl && 'factor' in dbl && dbl.factor).toBe(0.5); // o par sai pela boca de buraco negro
    expect(DOUBLE_SHOT_DELAY).toBe(0.3);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 90009 });
    const st = eng.addRetainedUnit('astral', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2);
    eng.startBattle();
    // varre o voo em passos miúdos: o cometa voa a 15 u/s (≈19 u/s com a
    // aceleração da arena) e o voo dura < 1 s — em passos de 0,05 s ele nunca
    // atravessa o tabuleiro inteiro num passo só, então a PRIMEIRA vez que ele
    // aparece ainda traz as munições do motor armadas
    const inFlight: Projectile[] = [];
    const ids = new Set<number>();
    let sawQueue = false;
    let maxPierce = 0;
    let maxChain = 0;
    for (let i = 0; i < 90; i++) {
      runSeconds(eng, 0.05);
      if (eng.pendingShots.some((s) => s.ownerId === st.unitId!)) sawQueue = true;
      for (const p of eng.world.projectiles)
        if (p.species === 'astral') {
          inFlight.push(p);
          ids.add(p.id);
          maxPierce = Math.max(maxPierce, p.pierceLeft);
          maxChain = Math.max(maxChain, p.chainLeft);
        }
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(9);
      expect(p.damageElement).toBe('air');
      // cada cometa carrega a cadeia inteira do motor (atravessa + salta 3)
      expect(p.abilities.some((a) => a.kind === 'chain')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'pierce')).toBe(true);
      expect(p.chainLeft).toBeGreaterThanOrEqual(0);
    }
    // as munições chegam ARMADAS no projétil: o `pierce 2` e o `chain 3` do
    // motor escritos no voo (o cometa não para no primeiro alvo e salta três)
    expect(maxPierce).toBe(2);
    expect(maxChain).toBe(3);
    // doubleShot ACONTECE: o segundo cometa fica na fila do motor (a boca do
    // poço cospe o par, o `doubleShot 0,5` do figurino de ONZE jatos)
    expect(sawQueue).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(2);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'astral');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(9);
  });
});
