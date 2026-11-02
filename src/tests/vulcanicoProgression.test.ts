import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants, type Part } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeStoneMaterial } from '../scene/stoneShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { BOARD_PROJECTILE_SCALE, LEVEL_PROJECTILE_MULT } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  BASALT_VULC_DEEP_LOOK,
  BASALT_VULC_LOOK,
  EMBER_HEART_LOOK,
  LAVA_LOOK,
  SCORIA_VULC_LOOK,
  TUFF_VULC_LOOK,
  VULCAN_ARM_PIVOT,
  VULCAN_ATTACK_WINDOW,
  VULCAN_CORE_POS,
  VULCAN_EMBER,
  VULCAN_LAVA,
  VULCAN_VENT_RIM,
  VULCAN_VENT_Y,
  VULCAN_WINDUP,
  type AttackPose,
  attackPose,
} from '../scene/VulcanRig';
import { VULCAN_BOMB_LOOK, VULCAN_HEART_LOOK, VULCAN_SCORIA_LOOK } from '../scene/ProjectileField';
import { ABISSAL_ATTACK_WINDOW, ABISSAL_WINDUP } from '../scene/AbissalRig';
import { COSMICO_ATTACK_WINDOW, COSMICO_WINDUP } from '../scene/CosmicoRig';
import { GEODO_ATTACK_WINDOW, GEODO_WINDUP } from '../scene/GeodoRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do VULCANICO (Nv.8 — obsidiana+plasma: o VULCAO DE NOVE ESTRATOS, a
 * `catástrofe andante`), plantado: `moveSpeed 0`, alvo `closest`, `heavy` +
 * `splash 2,0` + `burn 0,4` — o tiro nasce DA BOCA da montanha. As regras
 * amarradas aqui:
 *  - a lava #ff4d12 é ÚNICA entre motor (projectileColor), VISUALS.glow, uCrack
 *    de TODA a pedra (basalto e tufo), uGold do lago/veias/bomba e o anel de
 *    queimadura no chão; a brasa #ff9d3d é SEMPRE acento (olhos, coração,
 *    fagulhas, escórias, anéis do FX);
 *  - DNA DE NOVE FACES EM TUDO: todo `cyl`/`cone` do figurino tem NOVE faces
 *    (zero cinco do Geodo-irmão, zero seis do Cristal, zero sete do Abissal,
 *    zero oito do Cósmico) e as contagens seguem o nove: nove estratos em
 *    zigue-zague, nove veias, nove pingos, nove fumarolas TAMPADAS, nove
 *    merlões, nove esporões por anel, nove raízes e nove em cada órbita;
 *  - a ASSINATURA é a CALDEIRA ACESA no topo: soalho CLARO de tufo, poço de
 *    BREU (preto) dentro do soalho, saia ABERTA (tubo sem tampa) e nove
 *    fumarolas com tampa de escória dobradiçada no aro — o lago do rig mora no
 *    poço e é a silhueta do projétil;
 *  - a face mora no FLANCO em placa CLARA avançando sobre o estrato ESCURO
 *    (a máscara do Geodo invertida): sobrolho/boca ESCURSOS por cima da placa,
 *    órbitas de breu com pinprick de brasa NA FRENTE e a boca vazando lava;
 *  - diferença dura contra os pais e o tio: Obsidiana é vidro roxo espelhado
 *    (metalness 0,55) e Plasma tem centelha ROSA; Magma é barro cozido (g > b,
 *    r − b grande) com lava em mancha. Aqui a tinta é basalto frio (b > g), o
 *    figurino é CRU (roughness 0,9, zero metal) e a lava é VEIA de nove faces;
 *  - coreografia: janela 0,98 s com 64% de erupção enchendo (o tempo ABSOLUTO
 *    de afinação, 0,63 s, é o segundo maior da árvore atrás do Geodo) e a pose
 *    ZERA no fim — montanha não verga: o `lean` nem existe, o que treme é o chão.
 */

const VULC = getSpecies('vulcanico');
const LV = 8 as MonsterLevel;

/** luminância (Rec. 709) no ESPAÇO DE TRABALHO LINEAR do three — a régua do
 *  "a placa clara lê sobre a montanha escura?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const P8 = () => partsForLevel(MODELS.vulcanico, 8);

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** eixo Y local de uma peça rotacionada (o `aim` dos helpers aponta o +Y do
 *  prisma/cone no rumo do fio/esporão) */
const axisOf = (p: Part): THREE.Vector3 =>
  new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(p.r?.[0] ?? 0, p.r?.[1] ?? 0, p.r?.[2] ?? 0));

/** as DUAS pontas do eixo de um `rod9` (o fio de lava compra +0,03 de folga) */
const rodEnds = (p: Part): [[number, number, number], [number, number, number]] => {
  const u = axisOf(p);
  const half = p.a[2] / 2;
  return [
    [p.p[0] - u.x * half, p.p[1] - u.y * half, p.p[2] - u.z * half],
    [p.p[0] + u.x * half, p.p[1] + u.y * half, p.p[2] + u.z * half],
  ];
};

/** Z frontal REAL do bbox transformado (MESMA montagem do rig) — a régua da
 *  "placa clara sobre pedra escura" e do "pinprick na frente da órbita" */
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

/** raio de um tambor de estrato na altura y (interp. linear entre a boca de
 *  cima `a[0]` e a base `a[1]`) — a régua de quanto a máscara AVANÇA na rocha */
const radiusAt = (p: Part, y: number) => {
  const h = p.a[2];
  const t = (y - (p.p[1] - h / 2)) / h; // 0 na base, 1 no topo
  return p.a[1] + (p.a[0] - p.a[1]) * t;
};

describe('Vulcanico: vulcao de nove estratos com a caldeira acesa no topo (Nv.8)', () => {
  test('rig proprio, PLANTADO na propria escoria (a montanha nao anda), Nv.8 fixo', () => {
    expect(SPECIES_RIGS.vulcanico).toBeTruthy();
    expect(VULC.levelMin).toBe(8);
    expect(VULC.levelMax).toBe(8);
    expect(hasLevelVariants(MODELS.vulcanico)).toBe(false);
    expect(P8().length).toBe(MODELS.vulcanico.parts.length);
    // PLANTADO: nada de flutuar (a regua contra o Abissal-irmao que boia) e
    // quase nada de bob — o que se move aqui embaixo e o tremor, nao o passo
    expect(MODELS.vulcanico.floatY ?? 0).toBeLessThan(0.05);
    expect(MODELS.vulcanico.bob ?? 0).toBeLessThanOrEqual(0.02);
    expect(VULC.base.moveSpeed).toBe(0); // a catatrofe andante nao anda
    // tres cintas em ORBITA de NOVE em faixas de altura que nunca se tocam:
    // brasas acima da caldeira (0), escorias raspando o cone no SENTIDO
    // CONTRARIO (1) e vaga-lumes de lava rente ao sope (2)
    const groups = MODELS.vulcanico.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    const parts = P8();
    expect(parts.filter((p) => p.group === 0).length).toBe(9);
    expect(parts.filter((p) => p.group === 1).length).toBe(9);
    expect(parts.filter((p) => p.group === 2).length).toBe(9);
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[0]));
    const ys = (g: number) => parts.filter((p) => p.group === g).map((p) => p.p[1]);
    expect(Math.max(...ys(2))).toBeLessThan(Math.min(...ys(1)));
    expect(Math.max(...ys(1))).toBeLessThan(Math.min(...ys(0)));
    // as brasas de cima sao LUZ (glow = a lava do motor) e as escorias do meio
    // sao pedra (dark) — claro/escuro em camadas, nunca cinza unico
    for (const p of parts.filter((q) => q.group === 0)) expect(p.m).toBe('glow');
    for (const p of parts.filter((q) => q.group === 1)) expect(p.m).toBe('dark');
    for (const p of parts.filter((q) => q.group === 2)) expect(p.m).toBe('glow');
  });

  test('DNA DE NOVE FACES: todo cyl/cone tem nove faces — o nove e deste vulcao', () => {
    const parts = P8();
    let nCyl = 0;
    let nCone = 0;
    for (const p of parts) {
      if (p.g === 'cyl') {
        nCyl++;
        expect(p.a[3]).toBe(9); // estrato, chamine, poço, fumarola, veia: NOVE
        expect(p.a[4]).toBeGreaterThanOrEqual(1);
      }
      if (p.g === 'cone') {
        nCone++;
        expect(p.a[2]).toBe(9); // esporao, raiz, tampa, pingo, dente: NOVE
      }
    }
    expect(nCyl).toBeGreaterThanOrEqual(35); // 9 estratos + caldeira + veias + fumarolas
    expect(nCone).toBeGreaterThanOrEqual(45); // esporoes, raizes, tampas, pingos
    // o nove MANDA nas contagens tambem (a cobranca do Geodo de cinco / do
    // Abissal de sete): nove em cada serie declarada
    const count = (tag: string) => parts.filter((p) => p.tag === tag).length;
    expect(count('strata')).toBe(9);
    expect(count('vein')).toBe(9);
    expect(count('drip')).toBe(9);
    expect(count('vent')).toBe(9);
    expect(count('vent.cap')).toBe(9);
    expect(count('vent.ember')).toBe(9);
    expect(count('merlon')).toBe(9);
    expect(count('crag')).toBe(9);
    expect(count('toe')).toBe(9);
    expect(count('ember')).toBe(9);
    expect(count('cinder')).toBe(9);
    expect(count('wisp')).toBe(9);
    expect(count('scree')).toBe(18); // DOIS aneis de nove esporoes
    expect(count('rubble')).toBeGreaterThanOrEqual(18); // o entulho que a montanha ja cuspiu
    // e nenhum cinco/seis/sete/oito contrabandeado nas aristas: as pecas de
    // poliedro do vulcao sao dodecaedros (12 faces) e octaedros miudos, nunca
    // prismas de cinco (o Geodo) nem de sete (o Abissal)
    for (const p of parts.filter((q) => q.g === 'dodeca')) expect(p.a[0]).toBeGreaterThanOrEqual(0.08);
    for (const p of parts.filter((q) => q.g === 'octa')) expect(p.a[0]).toBeLessThanOrEqual(0.09);
    // todo tambor de estrato e denso (3-4 aneis verticais) — a montanha aguenta
    // o close sem virar low-poly
    for (const p of parts.filter((q) => q.tag === 'strata')) expect(p.a[4]).toBeGreaterThanOrEqual(3);
  });

  test('a ASSINATURA (caldeira acesa): soalho claro, poço de breu, saia aberta e nove tampas', () => {
    const parts = P8();
    const caldera = parts.find((p) => p.tag === 'caldera')!;
    const pit = parts.find((p) => p.tag === 'pit')!;
    const rim = parts.find((p) => p.tag === 'rim')!;
    const throat = parts.find((p) => p.tag === 'throat')!;
    // a cratera mora no TOPO da montanha, acima do ultimo estrato
    const topStratum = parts.filter((p) => p.tag === 'strata').reduce((a, b) => (a.p[1] > b.p[1] ? a : b));
    expect(caldera.p[1]).toBeGreaterThan(topStratum.p[1]);
    expect(throat.p[1]).toBeGreaterThan(topStratum.p[1]);
    // o soalho e CLARO (tufo) e o poço e BREU puro: a assinatura sao duas
    // manchas de valor, nao uma mancha media (a regra do print miudo)
    expect(caldera.m).toBe('accent');
    expect(pit.m).toBe('black');
    // o poço de breu cabe DENTRO do soalho claro (o buraco e menor que a placa)
    expect(pit.a[0]).toBeLessThan(caldera.a[0] - 0.1);
    expect(pit.p[1]).toBeGreaterThanOrEqual(caldera.p[1]);
    // a saia da borda e um tubo SEM TAMPA (openEnded): a boca da montanha fica
    // aberta para o ceu — e la que o `heavy`+`splash`+`burn` nasce
    expect(rim.a[5]).toBe(1);
    expect(rim.p[1]).toBeGreaterThan(caldera.p[1]);
    // o LAGO DO RIG (o core que vira projetil): no eixo, dentro do poço, sem
    // afogar o soalho nem cobrir a borda — amarrado do figurino ao print
    expect(VULCAN_CORE_POS[0]).toBe(0);
    expect(VULCAN_CORE_POS[2]).toBe(0);
    expect(VULCAN_CORE_POS[1]).toBeGreaterThan(caldera.p[1]);
    expect(Math.abs(VULCAN_CORE_POS[1] - pit.p[1])).toBeLessThanOrEqual(pit.a[2] / 2 + 0.03);
    expect(VULCAN_CORE_POS[1]).toBeLessThan(rim.p[1] + rim.a[2] / 2);
    // NOVE FUMAROLAS no aro da borda, cada uma TAMPADA por uma tampa de escoria
    // e com uma brasa por baixo (a fumarola respira — o rig ergue a tampa)
    const vents = parts.filter((p) => p.tag === 'vent');
    const caps = parts.filter((p) => p.tag === 'vent.cap');
    const ventEmbers = parts.filter((p) => p.tag === 'vent.ember');
    expect(vents.length).toBe(9);
    expect(caps.length).toBe(9);
    expect(ventEmbers.length).toBe(9);
    for (const v of vents) {
      const r = Math.hypot(v.p[0], v.p[2]);
      expect(Math.abs(r - VULCAN_VENT_RIM)).toBeLessThan(0.02); // no aro exportado
    }
    for (const c of caps) {
      expect(Math.abs(Math.hypot(c.p[0], c.p[2]) - VULCAN_VENT_RIM)).toBeLessThan(0.03);
      expect(c.m).toBe('dark'); // tampa de ESCORIA (pedra), nunca luz
    }
    for (const e of ventEmbers) {
      expect(e.m).toBe('glow'); // a brasa por baixo da tampa e lava do motor
      expect(e.p[1]).toBeLessThan(VULCAN_VENT_Y); // escondida dentro do tambor
    }
    // nove merloes na quina da borda + nove esporoes de escoria sob a caldeira
    const merlons = parts.filter((p) => p.tag === 'merlon');
    for (const m of merlons) expect(Math.hypot(m.p[0], m.p[2])).toBeGreaterThan(VULCAN_VENT_RIM);
  });

  test('as NOVE TAMPAS abrem na dobradiça do aro (a mesma receita da goela do Geodo)', () => {
    const parts = P8();
    const caps = parts.filter((p) => p.tag === 'vent.cap');
    expect(caps.length).toBe(9);
    const open = 0.45; // pico do burst do rig
    for (const c of caps) {
      const phi = Math.atan2(c.p[2], c.p[0]);
      const hinge = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
      const pivot = new THREE.Vector3(Math.cos(phi) * VULCAN_VENT_RIM, VULCAN_VENT_Y, Math.sin(phi) * VULCAN_VENT_RIM);
      // A BASE da tampa fica ABAIXO do plano do aro (pino enterrado no aro) e a
      // PONTA acima — por isso girar na tangente e DOBRADICA (a tampa bascula
      // para fora), nao tampa voando solta por cima da cratera
      const u = axisOf(c);
      const half = c.a[1] / 2;
      const tip: [number, number, number] = [c.p[0] + u.x * half, c.p[1] + u.y * half, c.p[2] + u.z * half];
      const butt: [number, number, number] = [c.p[0] - u.x * half, c.p[1] - u.y * half, c.p[2] - u.z * half];
      expect(butt[1]).toBeLessThan(VULCAN_VENT_Y);
      expect(tip[1]).toBeGreaterThan(VULCAN_VENT_Y);
      const q = new THREE.Quaternion().setFromAxisAngle(hinge, -open);
      const rel = new THREE.Vector3(tip[0] - pivot.x, tip[1] - pivot.y, tip[2] - pivot.z).applyQuaternion(q);
      const tipAfter: [number, number, number] = [pivot.x + rel.x, pivot.y + rel.y, pivot.z + rel.z];
      // a tampa BASCULA PARA FORA (a fumarola abre para o céu): a ponta ganha
      // raio e sai de cima da brasa — e a base fica ancorada no aro (o pino no
      // tambor segura; nada de tampa voando solta por cima da cratera)
      const rAfter = Math.hypot(tipAfter[0], tipAfter[2]);
      const rBefore = Math.hypot(tip[0], tip[2]);
      expect(rAfter).toBeGreaterThan(rBefore + 0.03);
      // a ponta sai do prumo da brasa enterrada (a luz fica VISÍVEL quando a
      // tampa abre): a distância horizontal ao eixo do tambor cresce
      const dEmberBefore = Math.abs(Math.hypot(tip[0], tip[2]) - VULCAN_VENT_RIM);
      const dEmberAfter = Math.abs(Math.hypot(tipAfter[0], tipAfter[2]) - VULCAN_VENT_RIM);
      expect(dEmberAfter).toBeGreaterThan(dEmberBefore + 0.03);
      // e a tampa não afunda na montanha nem é arrancada: continua acima do
      // plano do aro, com a base quase parada no pino
      expect(tipAfter[1]).toBeGreaterThan(VULCAN_VENT_Y);
      expect(tipAfter[1]).toBeGreaterThan(tip[1] - 0.12);
      const relB = new THREE.Vector3(butt[0] - pivot.x, butt[1] - pivot.y, butt[2] - pivot.z).applyQuaternion(q);
      expect(Math.hypot(pivot.x + relB.x - butt[0], pivot.y + relB.y - butt[1])).toBeLessThan(0.04);
    }
    // a tampa é TAMPÃO: a base dela entope a boca do tambor (a base da tampa
    // encosta no topo do tambor de fumarola) — por isso a dobra expõe a brasa
    const vents = parts.filter((p) => p.tag === 'vent');
    for (const c of caps) {
      const phi = Math.atan2(c.p[2], c.p[0]);
      const vent = vents.find((v) => Math.abs(Math.atan2(v.p[2], v.p[0]) - phi) < 0.05)!;
      const u = axisOf(c);
      const buttY = c.p[1] - u.y * (c.a[1] / 2);
      const ventTop = vent.p[1] + vent.a[2] / 2;
      expect(buttY).toBeLessThanOrEqual(ventTop + 0.01); // entope a boca
      expect(buttY).toBeGreaterThanOrEqual(ventTop - 0.02); // e afunda no tambo
    }
    // as brasas das fumarolas estao logo ABAIXO das tampas (a luz so aparece
    // quando a tampa ergue): nenhuma brasa acima do plano do aro
    for (const e of parts.filter((p) => p.tag === 'vent.ember'))
      expect(e.p[1]).toBeLessThan(VULCAN_VENT_Y);
  });

  test('os NOVE ESTRATOS em zigue-zague estreitam a montanha sem pescoço solto', () => {
    const parts = P8();
    const strata = parts.filter((p) => p.tag === 'strata');
    expect(strata.length).toBe(9);
    // do sopé para o topo: y sobe e o raio debase DIMINUI (a montanha afunila)
    for (let i = 1; i < strata.length; i++) {
      expect(strata[i].p[1]).toBeGreaterThan(strata[i - 1].p[1]);
      expect(strata[i].a[1]).toBeLessThan(strata[i - 1].a[1]);
      // sem pescoço: a boca de um estrato segura a base do de cima (o degrau
      // encosta no degrau — nada de tambor flutuando no ar)
      expect(strata[i - 1].a[0]).toBeGreaterThanOrEqual(strata[i].a[1] - 1e-9);
    }
    // o ZIGUE-ZAGUE: estratos alternados girados 20° (0,3491 rad) — a silhueta
    // vira estrela de dezoito pontas, nao um cone liso (a leitura a distancia)
    for (let i = 0; i < strata.length; i++) {
      const rz = strata[i].r?.[1] ?? 0;
      if (i % 2 === 0) expect(Math.abs(rz)).toBeLessThan(1e-9);
      else expect(Math.abs(rz - 0.3491)).toBeLessThan(1e-3);
    }
    // o sopé e o degrau mais LARGO da arvore (a base de um vulcao e larga de
    // verdade: 2,22 de raio) e a pedra clara do tufo nunca e maioria no corpo
    expect(strata[0].a[1]).toBeGreaterThanOrEqual(2.1);
    const bodyDark = parts.filter((p) => p.tag === 'strata' && (p.m === 'dark' || p.m === 'body'));
    expect(bodyDark.length).toBe(9);
    // e os estratos sao TODOS pedra crua (body/dark), nunca glow/white: a luz
    // aqui mora na caldeira e nas veias, nao na rocha inteira
    for (const s of strata) expect(['body', 'dark']).toContain(s.m);
  });

  test('a FACE no flanco: placa CLARA avancando sobre o estrato ESCURO, brasa na frente do breu', () => {
    const parts = P8();
    const mask = parts.find((p) => p.tag === 'mask')!;
    expect(mask.m).toBe('accent'); // o tufo claro da mascara
    expect(mask.a[3]).toBe(9); // e ate a placa e de nove faces
    // a mascara AVANCA sobre o estrato em que esta plantada (placa sobre
    // rocha: a leitura de rele a distancia media)
    const host = parts.find(
      (p) => p.tag === 'strata' && Math.abs(p.p[1] - mask.p[1]) <= p.a[2] / 2 + 0.25,
    )!;
    expect(host).toBeTruthy();
    expect(['body', 'dark']).toContain(host.m);
    expect(zFront(mask)).toBeGreaterThanOrEqual(radiusAt(host, mask.p[1]) + 0.08);
    // o CONTRASTE DE VALO que faz a cara ler no card miudo: a placa clara vale
    // quase o dobro da luminancia da rocha que a cerca
    expect(luma(TUFF_VULC_LOOK.rockA)).toBeGreaterThan(luma(BASALT_VULC_LOOK.rockA) * 1.3);
    // sobrolho e BOCA escuros POR CIMA da placa clara (mancha escura sobre
    // mancha clara — o contrario do Geodo, que tem mascara clara na rocha escura)
    const brow = parts.find((p) => p.tag === 'brow')!;
    const mouth = parts.find((p) => p.tag === 'mouth')!;
    expect(brow.m).toBe('dark');
    expect(mouth.m).toBe('dark');
    expect(zFront(brow)).toBeGreaterThan(zFront(mask));
    expect(zFront(mouth)).toBeGreaterThan(zFront(mask));
    // a boca VAZA LAVA na frente do labio escuro (a montanha range com o fogo
    // na garganta) — e a lava da boca e a cor do motor
    const lava = parts.find((p) => p.tag === 'mouth.lava')!;
    expect(lava.m).toBe('glow');
    expect(zFront(lava)).toBeGreaterThan(zFront(mouth));
    // pinprick de brasa NA FRENTE da orbita de breu (nunca o contrario: breu
    // na frente seria buraco cego no print)
    const sockets = parts.filter((p) => p.tag === 'socket');
    const eyes = parts.filter((p) => p.tag === 'eye');
    expect(sockets.length).toBe(2);
    expect(eyes.length).toBe(2);
    for (const s of sockets) expect(s.m).toBe('black');
    for (const e of eyes) {
      expect(e.m).toBe('white');
      const near = sockets.reduce((a, b) =>
        Math.hypot(a.p[0] - e.p[0], a.p[1] - e.p[1]) < Math.hypot(b.p[0] - e.p[0], b.p[1] - e.p[1]) ? a : b,
      );
      expect(zFront(e)).toBeGreaterThan(zFront(near) + 0.02);
    }
    // o coracao da face (a brasa maior, no meio da placa) tambem avanca na placa
    const heart = parts.find((p) => p.tag === 'heart')!;
    expect(zFront(heart)).toBeGreaterThan(zFront(mask));
    // e a face inteira fica NA FRENTE do eixo (no flanco que olha a arena), na
    // faixa media da montanha — nao no topo nem enterrada no sope
    expect(mask.p[2]).toBeGreaterThan(1.0);
    expect(mask.p[1]).toBeGreaterThan(1.4);
    expect(mask.p[1]).toBeLessThan(2.3);
  });

  test('as NOVE VEIAS do motor descem do ombro ao sope sem furar o piso', () => {
    const parts = P8();
    const veins = parts.filter((p) => p.tag === 'vein');
    expect(veins.length).toBe(9);
    for (const v of veins) {
      expect(v.m).toBe('glow'); // lava do motor escorrendo por fora da rocha
      const ends = rodEnds(v);
      const up = ends[0][1] > ends[1][1] ? ends[0] : ends[1];
      const down = up === ends[0] ? ends[1] : ends[0];
      // comeca no OMBRO da caldeira (raio miudo, alto) e termina no SOPE
      // (raio grande, baixo): a veia e o caminho do magma ate a boca
      expect(up[1]).toBeGreaterThanOrEqual(3.5);
      expect(Math.hypot(up[0], up[2])).toBeLessThanOrEqual(0.75);
      expect(down[1]).toBeLessThanOrEqual(1.45);
      expect(Math.hypot(down[0], down[2])).toBeGreaterThanOrEqual(1.3);
      // a veia e achatada contra a pedra (escala nao uniforme: 1,5 na largura,
      // 0,55 na profundidade) — filete de lava colado no flanco, nao espaguete
      expect(v.s?.[0]).toBeGreaterThan((v.s?.[2] ?? 1) + 0.3);
    }
    // NOVE pingos pendurados na frente do pe de cada veia, sem nunca furar o
    // piso nem subir de volta (a lava escorre — gravidade desenhada em silhueta)
    const drips = parts.filter((p) => p.tag === 'drip');
    expect(drips.length).toBe(9);
    for (const d of drips) {
      expect(d.m).toBe('glow');
      expect(d.a[2]).toBe(9);
      const u = axisOf(d);
      const half = d.a[1] / 2;
      const tipY = d.p[1] + u.y * half; // o PINA do cone (o +Y local mirando p/ baixo)
      expect(u.y).toBeLessThan(0); // aponta para baixo
      expect(tipY).toBeGreaterThanOrEqual(0.05); // nao afunda no chao
      expect(d.p[1]).toBeLessThan(1.6); // pendurado no sope da veia
    }
    // as nove veias estao espalhadas ao redor da montanha (nove fusos
    // horarios), nao amontoadas de um lado so
    const phis = veins.map((v) => Math.atan2(v.p[2], v.p[0]));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      expect(phis.some((ph) => Math.abs(((ph - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.45)).toBe(
        true,
      );
    }
  });

  test('braco = CONE PARASITA: o plinto e fundacao e o resto rocks no ombro', () => {
    const parts = P8();
    const plinths = parts.filter((p) => p.tag === 'arm.plinth');
    const rest = parts.filter((p) => (p.tag ?? '').startsWith('arm.') && p.tag !== 'arm.plinth');
    expect(plinths.length).toBe(2);
    expect(rest.length).toBeGreaterThanOrEqual(6); // cone + cratera + bloco de cada lado
    const [pvX, pvY, pvZ] = VULCAN_ARM_PIVOT;
    for (const side of [1, -1]) {
      const pv: [number, number, number] = [side * pvX, pvY, pvZ];
      // o PLINTO esta sentado EM CIMA do pivo: plantado, sem braco de alavanca
      // (e por isso que o rig o deixa imovel — fundacao nao gira)
      const pl = plinths.find((p) => Math.sign(p.p[0]) === side)!;
      expect(dist3(pl.p, pv)).toBeLessThan(0.12);
      // todas as outras pecas do braco estao FORA do braco de alavanca minimo
      // (0,18 do pivo): cone, cratera e bloco rocks juntos no mesmo ombro
      for (const p of rest.filter((q) => Math.sign(q.p[0]) === side))
        expect(dist3(p.p, pv)).toBeGreaterThan(0.18);
    }
    // a cratera do parasita e acesa (glow = lava do motor) e fica no TOPO do
    // cone, acima do plinto — o cone ferve pelos lados da montanha
    for (const c of parts.filter((p) => p.tag === 'arm.crater')) {
      expect(c.m).toBe('glow');
      expect(c.p[1]).toBeGreaterThan(pvY);
    }
    // cinematica: girar +0,16 rad no eixo Z do ombro ergue o cone e o bloco
    // (o empuxo do magma escora o parasita) e o deslocamento cresce com o
    // braco de alavanca — bloco (o mais de fora) se move mais que o cone
    const side = 1;
    const pv = new THREE.Vector3(side * pvX, pvY, pvZ);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.16);
    const lift = (p: Part) => {
      const rel = new THREE.Vector3(p.p[0] - pv.x, p.p[1] - pv.y, p.p[2] - pv.z).applyQuaternion(q);
      return pv.y + rel.y - p.p[1];
    };
    const cone = parts.find((p) => p.tag === 'arm.cone' && Math.sign(p.p[0]) === side)!;
    const block = parts.find((p) => p.tag === 'arm.block' && Math.sign(p.p[0]) === side)!;
    expect(lift(cone)).toBeGreaterThan(0.02);
    expect(lift(block)).toBeGreaterThan(lift(cone) + 0.01);
  });

  test('involucro: montanha larga de base dentro do slot, caldeira usando o formTop', () => {
    const e = partsEnvelope(P8());
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // vulcao de verdade e LARGO de base (as nove raizes + o entulho), mas nao
    // invade o vizinho (measured: halfX 2,51 / halfZ 2,50)
    expect(halfX).toBeGreaterThanOrEqual(2.3);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(halfZ).toBeGreaterThanOrEqual(2.3);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // PLANTADO: nenhum pe afunda no piso e a montanha pisa o chao de verdade
    expect(e.minY).toBeGreaterThanOrEqual(-0.01);
    expect(e.minY).toBeLessThan(0.1);
    // a caldeira + as brasas em orbita usam a forma inteira sem estourar o teto
    expect(e.maxY).toBeLessThanOrEqual(formTop(VULC, 8) + 0.25);
    expect(e.maxY).toBeGreaterThanOrEqual(formTop(VULC, 8) - 0.2);
    expect(e.maxY).toBeGreaterThanOrEqual(4.8);
  });

  test('ANTI LOW-POLY: 183 pecas, 12,4 mil vertices e 10,3 mil triangulos reais', () => {
    const parts = P8();
    expect(parts.length).toBeGreaterThanOrEqual(180);
    let drawn = 0;
    let tris = 0;
    for (const p of parts) {
      const geo = getGeometry(p.g, p.a);
      drawn += geo.getAttribute('position').count;
      tris += (geo.index?.count ?? geo.getAttribute('position').count) / 3;
    }
    expect(drawn).toBeGreaterThanOrEqual(12000); // medido: 12.380 vertices
    expect(tris).toBeGreaterThanOrEqual(10000); // medido: 10.308 triangulos
    // contagens REAIS dos dois workhorses da especie: o tambor de nove faces
    // do estrato e o esporao de nove faces
    expect(getGeometry('cyl', [1.98, 2.22, 0.52, 9, 4]).getAttribute('position').count).toBeGreaterThanOrEqual(50);
    expect(getGeometry('cone', [0.065, 0.3, 9, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(20);
    // nenhum atalho de malha nos workhorses: todo tambor de estrato tem ≥3
    // aneis verticais e toda veia de lava ≥4 (o close le leito de rio, nao prisma)
    for (const p of parts) {
      if (p.tag === 'strata') expect(p.a[4]).toBeGreaterThanOrEqual(3);
      if (p.tag === 'vein') expect(p.a[4]).toBeGreaterThanOrEqual(4);
    }
  });

  test('identidade do motor a cratera: a lava #ff4d12; a brasa #ff9d3d e sempre acento', () => {
    expect(VULCAN_LAVA).toBe('#ff4d12');
    expect(VULC.base.projectileColor).toBe(VULCAN_LAVA);
    expect(VISUALS.vulcanico.glow).toBe(VULCAN_LAVA);
    // a chain atravessa TODOS os materiais: uCrack do basalto e do tufo, uGold
    // do lago/veias/bomba e o miolo do coracao do lago que voa
    expect(BASALT_VULC_LOOK.crack).toBe(VULCAN_LAVA);
    expect(BASALT_VULC_DEEP_LOOK.crack).toBe(VULCAN_LAVA);
    expect(TUFF_VULC_LOOK.crack).toBe(VULCAN_LAVA);
    expect(LAVA_LOOK.gold).toBe(VULCAN_LAVA);
    expect(EMBER_HEART_LOOK.cool).toBe(VULCAN_LAVA);
    expect(VULCAN_BOMB_LOOK.crack).toBe(VULCAN_LAVA);
    expect(VULCAN_HEART_LOOK.gold).toBe(VULCAN_LAVA);
    // a BRASA (#ff9d3d = accent) e SEMPRE acento: olhos/coracao da face, a
    // trinca da escoria e o coracao das cinzas — nunca corpo, nunca o motor
    expect(VULCAN_EMBER).toBe('#ff9d3d');
    expect(VISUALS.vulcanico.accent).toBe(VULCAN_EMBER);
    expect(EMBER_HEART_LOOK.gold).toBe(VULCAN_EMBER);
    expect(SCORIA_VULC_LOOK.crack).toBe(VULCAN_EMBER);
    expect(VULCAN_SCORIA_LOOK.crack).toBe(VULCAN_EMBER);
    // o corpo do figurino E o uCrack do shader (nada de deriva entre TS e GPU)
    expect(VISUALS.vulcanico.body).toBe(BASALT_VULC_LOOK.rockA);
    expect(VISUALS.vulcanico.dark).toBe(BASALT_VULC_LOOK.rockB);
    // réguas chegam NA UNIFORM dos dois shaders (senão eram enfeite de TS)
    const pedra = makeStoneMaterial({
      rockA: BASALT_VULC_LOOK.rockA,
      rockB: BASALT_VULC_LOOK.rockB,
      crack: BASALT_VULC_LOOK.crack,
      amp: BASALT_VULC_LOOK.amp,
      crackGlow: BASALT_VULC_LOOK.crackGlow,
      crackScale: BASALT_VULC_LOOK.crackScale,
      crackWidth: BASALT_VULC_LOOK.crackWidth,
      crackBoost: BASALT_VULC_LOOK.crackBoost,
      speck: BASALT_VULC_LOOK.speck,
    });
    expect(pedra.uniforms.uCrack.value.getHexString()).toBe(VULCAN_LAVA.slice(1));
    expect(pedra.transparent).toBe(false); // pedra OPACA: peso no tabuleiro (iOS-safe)
    expect(pedra.depthWrite).toBe(true);
    // aqui a rocha QUASE arde (e o vulcao da arvore: 0,47), mas o tufo da
    // mascara/caldeira fica CONTIDO (0,11) — senao a cara virava mancha de fogo
    expect(pedra.uniforms.uCrackGlow.value * pedra.uniforms.uCrackBoost.value).toBeLessThanOrEqual(0.55);
    const tufo = makeStoneMaterial({
      rockA: TUFF_VULC_LOOK.rockA,
      rockB: TUFF_VULC_LOOK.rockB,
      crack: TUFF_VULC_LOOK.crack,
      amp: TUFF_VULC_LOOK.amp,
      crackGlow: TUFF_VULC_LOOK.crackGlow,
      crackScale: TUFF_VULC_LOOK.crackScale,
      crackWidth: TUFF_VULC_LOOK.crackWidth,
      crackBoost: TUFF_VULC_LOOK.crackBoost,
      speck: TUFF_VULC_LOOK.speck,
    });
    expect(tufo.uniforms.uCrack.value.getHexString()).toBe(VULCAN_LAVA.slice(1));
    expect(tufo.uniforms.uCrackGlow.value * tufo.uniforms.uCrackBoost.value).toBeLessThanOrEqual(0.15);
    pedra.dispose();
    tufo.dispose();
    const lago = makeCoreMaterial({
      gold: LAVA_LOOK.gold,
      white: LAVA_LOOK.white,
      cool: LAVA_LOOK.cool,
      amp: LAVA_LOOK.amp,
    });
    expect(lago.uniforms.uGold.value.getHexString()).toBe(VULCAN_LAVA.slice(1));
    lago.dispose();
    // o miolo do core nunca branco puro (a régua da árvore inteira) e o creme
    // escaldado vale MAIS que a lava (o lago e quente por dentro)
    expect(LAVA_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(LAVA_LOOK.white)).toBeGreaterThan(luma(LAVA_LOOK.gold));
    // ZERO translucidez no figurino inteiro (a licao do WebKit): pedra, tufo e
    // cores opacos/denso — o calor vem do emissivo, nao do alpha
    for (const L of [BASALT_VULC_LOOK, BASALT_VULC_DEEP_LOOK, TUFF_VULC_LOOK, SCORIA_VULC_LOOK])
      expect('alpha' in L).toBe(false);
  });

  test('contraste duro contra os pais (vidro/centelha rosa) e o tio MAGMA (barro)', () => {
    // tio MAGMA (Nv.6, golem de lava): barro COZIDO — g > b e r-m-b grande.
    // Aqui a tinta e BASALTO frio: b > g e r quase igual a b (zero risco de ler
    // "o mesmo golem de lava com outro nome")
    const magma = rgb(VISUALS.magma.body);
    const vulc = rgb(VISUALS.vulcanico.body);
    expect(magma.g).toBeGreaterThan(magma.b);
    expect(magma.r - magma.b).toBeGreaterThanOrEqual(20);
    expect(vulc.b).toBeGreaterThan(vulc.g);
    expect(vulc.r - vulc.b).toBeLessThanOrEqual(6);
    // nem a lava nem a brasa do vulcao sao as do Magma (as duas ardem diferente)
    expect(VULCAN_LAVA).not.toBe(VISUALS.magma.glow);
    expect(VULCAN_EMBER).not.toBe(VISUALS.magma.accent);
    expect(VULC.base.projectileColor).not.toBe(getSpecies('magma').base.projectileColor);
    // mae OBSIDIANA: vidro roxo ESPELHADO (roughness miuda, metal 0,55). Aqui a
    // pedra e CRUA fosca SEM metal nenhum (a licao do Geodo: quem brilha e a
    // luz do motor, nao o material)
    expect(VISUALS.obsidiana.metalness ?? 0).toBeGreaterThan(0.3);
    expect(VISUALS.vulcanico.metalness ?? 0).toBe(0);
    const roughObsidiana = VISUALS.obsidiana.roughness ?? 1;
    const roughVulc = VISUALS.vulcanico.roughness ?? 0;
    expect(roughObsidiana).toBeLessThan(0.3); // a mãe e vidro polido
    expect(roughVulc).toBeGreaterThanOrEqual(0.85); // aqui a pedra e crua
    expect(roughVulc).toBeGreaterThan(roughObsidiana);
    // pai PLASMA: a centelha e ROSA (#ff9ef5). Aqui a luz e LAVA encarnada:
    // verde e azul muito abaixo do vermelho (zero rosa no figurino)
    const glow = rgb(VULCAN_LAVA);
    expect(glow.g).toBeLessThan(glow.r - 60);
    expect(glow.b).toBeLessThan(glow.g);
    expect(VULCAN_LAVA).not.toBe(VISUALS.plasma.glow);
    // irmao GEODO (tambem Nv.8, tambem macico): CINCO faces em tudo e pedra
    // CLARA maioria. Aqui e NOVE em tudo e o corpo e ESCURO com a placa clara
    // por cima — a regla anti-"mesma especie" da arvore
    expect(VISUALS.geodo.body).not.toBe(VISUALS.vulcanico.body);
    expect(luma(VISUALS.geodo.body)).toBeGreaterThan(luma(VISUALS.vulcanico.body));
    // o tio MAGMA e mais CLARO que a nossa rocha? nao: aqui e o breu de basalto
    expect(luma(VISUALS.vulcanico.dark)).toBeLessThan(luma(VISUALS.magma.dark));
  });

  test('motor: a catástrofe andante — splash 2,0 (o maior da árvore) + burn 0,4 + heavy', () => {
    expect(VULC.base.damageElement).toBe('fire');
    expect(VULC.base.targeting).toBe('closest'); // a montanha soca o mais perto
    expect(VULC.base.hp).toBe(122);
    expect(VULC.base.damage).toBe(23);
    expect(VULC.base.range).toBe(9);
    const splash = VULC.base.abilities.find((a) => a.kind === 'splash');
    expect(splash && 'radius' in splash && splash.radius).toBe(2.0);
    const burn = VULC.base.abilities.find((a) => a.kind === 'burn');
    expect(burn && 'chance' in burn && burn.chance).toBe(0.4);
    expect(VULC.base.abilities.some((a) => a.kind === 'heavy')).toBe(true);
    // o splash do vulcao e o mais LARGO da arvore (o geodo tem 1,8)
    const geodoSplash = getSpecies('geodo').base.abilities.find((a) => a.kind === 'splash');
    expect(geodoSplash && 'radius' in geodoSplash && geodoSplash.radius).toBeLessThan(2.0);
    expect(VULC.base.resist.fire).toBeGreaterThanOrEqual(0.3); // filho da lava
    expect(VULC.base.resist.water).toBeLessThan(0); // agua no magma dói

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 246810 });
    const st = eng.addRetainedUnit('vulcanico', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2);
    eng.startBattle();
    // varre o voo: a bomba e guiada (vel = rumo × speed todo tick) e e a mais
    // RÁPIDA dos tiros Nv.8 pesados (base 8 × 1,12⁷ ≈ 17,72 — a bomba de lava
    // chega mais rápido que o matacão de pedra do Geodo)
    const SPEED8 =
      VULC.base.projectileSpeed * Math.pow(LEVEL_PROJECTILE_MULT, 7) * BOARD_PROJECTILE_SCALE;
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 130; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles)
        if (p.species === 'vulcanico') {
          inFlight.push(p);
          const v = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
          expect(Math.abs(v - SPEED8)).toBeLessThan(0.01); // a bomba não desacelera
        }
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(8);
      expect(p.damageElement).toBe('fire');
      expect(p.abilities.some((a) => a.kind === 'splash')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'burn')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'heavy')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'vulcanico');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(8);
  });

  test('coreografia: 0,98 s com 64% de erupção enchendo e a pose ZERA no coice', () => {
    // a segunda afinação mais LENTA da árvore (a montanha carrega devagar): a
    // janela perde para o Geodo mas o TEMPO ABSOLUTO de carga bate Abissal e
    // Cósmico — Geodo 0,714 s > Vulcânico 0,627 s > Abissal 0,552 > Cósmico 0,533
    expect(VULCAN_ATTACK_WINDOW).toBeLessThan(GEODO_ATTACK_WINDOW);
    expect(VULCAN_ATTACK_WINDOW).toBeGreaterThan(ABISSAL_ATTACK_WINDOW);
    expect(VULCAN_WINDUP).toBe(0.64);
    const load = VULCAN_ATTACK_WINDOW * VULCAN_WINDUP;
    expect(load).toBeLessThan(GEODO_ATTACK_WINDOW * GEODO_WINDUP);
    expect(load).toBeGreaterThan(ABISSAL_ATTACK_WINDOW * ABISSAL_WINDUP);
    expect(load).toBeGreaterThan(COSMICO_ATTACK_WINDOW * COSMICO_WINDUP);

    const zeros = (P: AttackPose) =>
      [P.quake, P.dome, P.heave, P.burst, P.plume, P.flare, P.charge].map((n) => n + 0);
    expect(zeros(attackPose(-1))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // a ERUPÇÃO ENCHENDO: o lago infla acima do poço, o chão treme, as veias
    // acendem e os parasitas escoram — tudo subindo em curva de potência (a
    // montanha perde o controle aos poucos, não de uma vez)
    const tune = attackPose(VULCAN_ATTACK_WINDOW * VULCAN_WINDUP * 0.95);
    expect(tune.dome).toBeGreaterThanOrEqual(0.78); // o lago já boja sobre a borda
    expect(tune.quake).toBeGreaterThanOrEqual(0.5); // o tremor sísmico aperta
    expect(tune.charge).toBeGreaterThanOrEqual(0.9); // veias e olhos acesos
    expect(tune.heave).toBeGreaterThanOrEqual(0.4);
    expect(tune.flare).toBeGreaterThanOrEqual(0.65);
    expect(tune.plume).toBeGreaterThanOrEqual(0.4);
    expect(tune.burst).toBe(0); // nada estourou ainda
    // a curva é de potência 1,5: no meio da afinação a carga vale menos que a
    // metade do pico (a montanha engole seco antes de disparar)
    const mid = attackPose(VULCAN_ATTACK_WINDOW * VULCAN_WINDUP * 0.5);
    expect(mid.charge).toBeLessThan(tune.charge * 0.45);
    // o ESTOURO: o lago esvazia (o naco foi embora), os parasitas socam no
    // coice, a pluma estoura e as nove tampas abrem de vez — a coreografia é
    // CONTÍNUA na fronteira (nada de pulo de pose no instante do tiro)
    const justAfter = attackPose(VULCAN_ATTACK_WINDOW * VULCAN_WINDUP + 0.001);
    for (const k of ['quake', 'dome', 'heave', 'plume', 'flare', 'charge'] as const)
      expect(Math.abs(justAfter[k] - tune[k])).toBeLessThan(0.12);
    const shot = attackPose(VULCAN_ATTACK_WINDOW * (VULCAN_WINDUP + 0.18 * (1 - VULCAN_WINDUP)));
    expect(shot.dome).toBeLessThanOrEqual(-0.3); // o lago esvaziou: o naco voou
    expect(shot.heave).toBeLessThanOrEqual(-0.5); // os parasitas socaram
    expect(shot.burst).toBeGreaterThanOrEqual(0.9); // as nove tampas abriram
    expect(shot.plume).toBeGreaterThanOrEqual(1.8); // a coluna de cinza estourou
    expect(shot.quake).toBeGreaterThan(tune.quake); // a erupção treme mais que a carga
    expect(shot.charge).toBeLessThan(tune.charge); // a luz do lago foi embora com a bomba
    const late = attackPose(VULCAN_ATTACK_WINDOW * 0.985);
    expect(Math.abs(late.dome)).toBeLessThan(Math.abs(shot.dome)); // tudo devolvendo
    expect(Math.abs(late.plume)).toBeLessThan(Math.abs(shot.plume));
    expect(late.charge).toBeLessThan(shot.charge);
    expect(late.burst).toBeLessThan(shot.burst);
    // a coreografia ZERA exata no fim da janela (decay → 0): a montanha
    // reassenta POR INTEIRO antes do próximo round (`+ 0`: decay=0 gera -0)
    expect(zeros(attackPose(VULCAN_ATTACK_WINDOW))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(zeros(attackPose(VULCAN_ATTACK_WINDOW + 0.2))).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // amplitudes coreografadas: nada de montanha se desmontando no escuro (o
    // plume passa de 1 de propósito — é coluna de cinza, não articulação)
    for (let s = 0; s <= VULCAN_ATTACK_WINDOW; s += 0.02) {
      const P = attackPose(s);
      expect(Math.abs(P.quake)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(P.dome)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(P.heave)).toBeLessThanOrEqual(1.8);
      expect(Math.abs(P.burst)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.plume)).toBeLessThanOrEqual(2.2);
      expect(Math.abs(P.flare)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(P.charge)).toBeLessThanOrEqual(1.3);
    }
  });
});
