import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants, type Part } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeStoneMaterial } from '../scene/stoneShaders';
import { makeIceMaterial } from '../scene/iceShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { LEVEL_PROJECTILE_MULT } from '../data/balance';
import { formTop } from '../data/forms';
import { SPECIES, getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  ASHLAR_LOOK,
  type AttackPose,
  BASALT_DEEP_LOOK,
  BASALT_LOOK,
  CORE_LOOK,
  GEODO_ARM_PIVOT,
  GEODO_ATTACK_WINDOW,
  GEODO_AMETHYST,
  GEODO_CORE_POS,
  GEODO_JAW_RIM,
  GEODO_JAW_Y,
  GEODO_LILAC,
  GEODO_WINDUP,
  HEART_LOOK,
  QUARTZ_LOOK,
  VEIN_LOOK,
  attackPose,
} from '../scene/GeodoRig';
import { GEODO_BOULDER_LOOK, GEODO_CHIP_LOOK } from '../scene/ProjectileField';
import { COSMICO_ATTACK_WINDOW, COSMICO_WINDUP } from '../scene/CosmicoRig';
import { CRISTAL_ATTACK_WINDOW } from '../scene/CrystalRig';
import { OBSIDIANA_ATTACK_WINDOW } from '../scene/ObsidianaRig';
import { PLASMA_ATTACK_WINDOW, PLASMA_WINDUP } from '../scene/PlasmaRig';
import { TEMPESTADE_ATTACK_WINDOW } from '../scene/TempestadeRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do GEODO (Nv.8 — obsidiana+cristal: a CATEDRAL DE GEODO), o mais duro dos
 * tanques (`heavy` + `splash 1,8`, alvo `lowestHp`, boulder a 7 un/s). As regras
 * amarradas aqui:
 *  - a AMETISTA ORQUÍDEA #c77dff é ÚNICA entre motor (projectileColor), veio do
 *    basalto/cantaria, núcleo na goela, boulder arremessado e caco do FX
 *    (identidade do motor ao impacto); o lilás quente #e0b3ff é SEMPRE acento
 *    (veio do quartzo, coração da rosácea, halo do núcleo);
 *  - DNA PENTAGONAL EM TUDO: todo `cyl`/`cone` do figurino tem CINCO faces
 *    (zero seis do Cristal-pai, zero oito/doze do Cósmico-irmão), os mamelões
 *    são dodecaedros (doze pentágonos) e zero esfera/toro no modelo inteiro;
 *  - a ASSINATURA é o reliquário ABERTO na copa: aro pentagonal ABERTO com
 *    cinco placas mandibulares DOBRADIÇADAS no aro (girar na dobradiça abre a
 *    goela em flor — a base abaixo do plano do aro é o que faz ser dobradiça e
 *    não peça voando da cabeça) e o boulder de luz esperando na cama de cristais;
 *  - a basalto é CRUA e ameixa clarada (a cobrança do print: com #453a52 o
 *    Geodo lia o preto-vidro da Obsidiana, mãe) e a cantaria clara é maioria —
 *    nenhuma outra espécie da árvore tem pedra clara na maior parte do corpo;
 *  - face de MÁSCARA DE FACHADA (placa clara saltada do crânio, rosácea de
 *    cinco pétalas, sobrancelha/boca escuras sobre placa clara, olhos-pinprick
 *    NA FRENTE das órbitas de breu) e as colunas FLANQUEIAM a face (nunca
 *    atrás dela — a coluna clara apagava a máscara no print);
 *  - coreografia MAIS LENTA da árvore: janela 1,05 s com 68% de afinação (o
 *    pow-wow da rocha) e o pose decai a zero EXATO no fim da janela.
 */

const GEODO = getSpecies('geodo');
const LV = 8 as MonsterLevel;

/** luminância (Rec. 709) no ESPAÇO DE TRABALHO LINEAR do three — a régua do
 *  "isso é basalto CRUA ou é o vidro negro da mãe?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const P8 = () => partsForLevel(MODELS.geodo, 8);

/** raio horizontal de uma peça em relação ao eixo da figura */
const radiusOf = (p: { p: [number, number, number] }) => Math.hypot(p.p[0], p.p[2]);

const phiOf = (p: { p: [number, number, number] }) => Math.atan2(p.p[2], p.p[0]);

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** frente Z REAL de uma peça — o bbox da geometria com escala/rotação/posição
 *  do figurino (MESMA montagem do rig e do `partsEnvelope`): máscara, pétalas,
 *  boss e órbitas têm eixos diferentes, então raio/altura a cru errariam */
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

describe('Geodo: catedral de geodo plantada na própria fundação (Nv.8)', () => {
  test('rig próprio, PLANTADO na fundação, o tanque que não anda (Nv.8 fixo)', () => {
    expect(SPECIES_RIGS.geodo).toBeTruthy();
    expect(GEODO.levelMin).toBe(8);
    expect(GEODO.levelMax).toBe(8);
    expect(hasLevelVariants(MODELS.geodo)).toBe(false);
    expect(P8().length).toBe(MODELS.geodo.parts.length);
    // orçamento denso (a régua anti low-poly: golem 47, cristal 102, cósmico 141)
    expect(MODELS.geodo.parts.length).toBeGreaterThanOrEqual(150);
    // PLANTADO: o tanque mais duro não flutua nem balança — é paisagem que atira
    expect(MODELS.geodo.floatY).toBe(0);
    expect(MODELS.geodo.bob).toBeLessThanOrEqual(0.02);
    expect(GEODO.base.moveSpeed).toBe(0);
    // três órbitas em movimento em três alturas: tocos no peito (0), lascas no
    // degrau (1) e estilhaços altos acima da goela (2)
    const groups = MODELS.geodo.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    const parts = P8();
    expect(parts.filter((p) => p.group === 0).length).toBe(6);
    expect(parts.filter((p) => p.group === 1).length).toBe(7);
    expect(parts.filter((p) => p.group === 2).length).toBe(5); // CINCO na coroa: de novo o pentágono
    // o degrau gira no SENTIDO CONTRÁRIO do peito (a catedral tem dois ritmos)
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[0]));
  });

  test('DNA PENTAGONAL: todo cyl/cone tem CINCO faces — zero seis, zero oito, zero redondo', () => {
    const parts = P8();
    let nCyl = 0;
    let nCone = 0;
    for (const p of parts) {
      if (p.g === 'cyl') {
        nCyl++;
        expect(p.a[3]).toBe(5); // PRISMA DE PEDRA CORTADA em cada coluna, arco, placa e ponta
      }
      if (p.g === 'cone') {
        nCone++;
        expect(p.a[2]).toBe(5);
      }
      if (p.g === 'sphere' || p.g === 'torus' || p.g === 'ring') {
        throw new Error(`redondo proibido no geodo: ${p.g} tag=${p.tag}`);
      }
    }
    expect(nCyl).toBeGreaterThanOrEqual(80); // a catedral inteira é pentagonal
    expect(nCone).toBe(4);
    // os mamelões de rocha são DOZE PENTÁGNOS fechados (o dodecaedro é o único
    // sólido platônico de faces pentagonais — a costela da espécie) e NENHUM
    // pode ser subdividido (sub ≥ 1 arredondaria em bola, o crime do low-poly)
    const dodecas = parts.filter((p) => p.g === 'dodeca');
    expect(dodecas.length).toBeGreaterThanOrEqual(30);
    for (const d of dodecas) expect(d.a[1] ?? 0).toBe(0);
    // octaedro só miudeza acesa (olhos, nódulos de veio, coração): nunca corpo
    const octas = parts.filter((p) => p.g === 'octa');
    expect(octas.length).toBe(6);
    for (const o of octas) expect(o.a[0]).toBeLessThanOrEqual(0.12);
  });

  test('a FUNDAÇÃO: três degraus pentagonais em estrela de dez pontas + entulho cuspidido', () => {
    const parts = P8();
    const steps = parts.filter((p) => p.tag === 'floor' || p.tag === 'dais');
    expect(steps.length).toBe(3);
    const tiers = [...steps].sort((a, b) => a.p[1] - b.p[1]);
    for (const t of tiers) {
      expect(t.g).toBe('cyl');
      expect(t.a[3]).toBe(5); // degrau PENTAGONAL (a planta da catedral)
      expect(t.a[0]).toBeLessThan(t.a[1]); // talude: o topo fecha mais que a base
    }
    expect(tiers[0].p[1] - tiers[0].a[2] / 2).toBeCloseTo(0, 9); // assentado no piso, nunca afunda
    for (let i = 1; i < 3; i++) {
      // cada degraus assenta EXATO no topo do anterior (alvenaria, não float)
      expect(tiers[i].p[1] - tiers[i].a[2] / 2).toBeCloseTo(tiers[i - 1].p[1] + tiers[i - 1].a[2] / 2, 9);
      // cada fase gira 36° = meia face do pentágono → a planta vira ESTRELA DE
      // DEZ PONTAS vista de cima (o degrau escalonado da catedral)
      expect(Math.abs(Math.abs(tiers[i].r![1]) - Math.abs(tiers[i - 1].r![1]))).toBeCloseTo(Math.PI / 5, 2);
    }
    for (let i = 1; i < 3; i++) expect(tiers[i].a[1]).toBeLessThan(tiers[i - 1].a[1] - 0.2);
    // os cinco blocos da cornija do degrau alto (plinthrow) e o entulho de
    // basalto que ele já cuspiu (o `heavy` que apanha é contado na silhueta)
    const throwBlocks = parts.filter((p) => p.tag === 'plinthrow');
    expect(throwBlocks.length).toBe(5);
    for (const b of throwBlocks) {
      expect(radiusOf(b)).toBeGreaterThan(1.4); // por fora do degrau alto
      expect(b.p[1]).toBeGreaterThanOrEqual(0.4); // encostado no degrau alto
    }
    const rubble = parts.filter((p) => p.tag === 'rubble');
    expect(rubble.length).toBeGreaterThanOrEqual(9);
    for (const r of rubble) {
      expect(r.p[1]).toBeLessThan(0.8); // peça de chão
      expect(radiusOf(r)).toBeLessThanOrEqual(2.25); // dentro do slot
    }
    // mamelões de quartzo brotando da fundação e do fundo da ábside: CINCOS de
    // cinco pontas com a base enterrada (a regra do pino enterrado da árvore)
    const clusters = parts.filter((p) => p.tag === 'cluster');
    expect(clusters.length).toBe(15);
    const nests: [number, number, number][] = [
      [1.44, 0.36, 0.44],
      [-1.44, 0.36, 0.44], // o mm espelha SÓ o x — o z do ninho espelhado é o mesmo
      [0, 1.9, -1.14],
    ];
    for (const c of clusters) {
      expect(c.a[3]).toBe(5); // ponta de quartzo PENTAGONAL
      const nest = nests.map((n) => ({ n, d: dist3(c.p, n) })).sort((a, b) => a.d - b.d)[0];
      expect(nest.d).toBeLessThan(0.55); // plantado num mamelon (não flutuando)
    }
  });

  test('o MACIÇO squat + a colunata que FLANQUEIA a face (a cobrança do print)', () => {
    const parts = P8();
    // nódulos dodecaédricos empilhados no eixo SEM tag (o tronco da catedral):
    // o maciço ALARGA a base e fecha para cima (não é bloco de Lego)
    const body = parts.filter(
      (p) => p.g === 'dodeca' && p.m === 'body' && (!p.tag || p.tag === 'chest') && Math.abs(p.p[0]) < 0.02 && Math.abs(p.p[2]) < 0.05,
    ).sort((a, b) => a.p[1] - b.p[1]);
    expect(body.length).toBe(3);
    for (let i = 1; i < body.length; i++) {
      expect(body[i].p[1]).toBeGreaterThan(body[i - 1].p[1]);
      expect(body[i].a[0] * (body[i].s?.[0] ?? 1)).toBeLessThan(body[i - 1].a[0] * (body[i - 1].s?.[0] ?? 1));
    }
    expect(body[0].a[0] * (body[0].s?.[0] ?? 1)).toBeGreaterThanOrEqual(1.3); // volumão da base
    // a ÁBSIDE fica ATRÁS (a cabeceira da catedral, onde moram as torres)
    const apse = parts.find((p) => p.tag === 'apse')!;
    expect(apse.p[2]).toBeLessThan(-0.7);
    // colunata: prismas pentagonais com capital, FLANQUEANDO a frente — a
    // cobrança do print: coluna clara ATRÁS da máscara apagava a face
    const mask = parts.find((p) => p.tag === 'mask')!;
    const columns = parts.filter((p) => p.tag === 'column' && p.g === 'cyl');
    expect(columns.length).toBe(6); // 2 hastes + 2 capitais + 2 plintos (base)
    for (const c of columns) {
      expect(c.a[3]).toBe(5);
      expect(Math.abs(c.p[0])).toBeGreaterThan(mask.a[0] + 0.2); // fora da silhueta da face
      expect(Math.abs(c.p[2])).toBeLessThan(mask.p[2] - 0.3); // e ATRÁS do plano da máscara
    }
    const shaft = columns.reduce((a, b) => (a.a[2] >= b.a[2] ? a : b));
    const capital = columns.find((c) => c !== shaft && c.p[1] > shaft.p[1])!;
    const plinth = columns.find((c) => c !== shaft && c !== capital && c.p[1] < 1)!;
    expect(capital.a[0]).toBeGreaterThan(shaft.a[0]); // capital MAIS largo que a haste
    expect(plinth.a[0]).toBeGreaterThan(shaft.a[0]); // base (plinto) MAIS larga que a haste
    // coluna ALICERÇADA: o plinto assenta EXATO no degrau alto e o pé da haste
    // afunda no plinto (sem o plinto a haste ficava boiando a 0,16 da pedra)
    const daisTop = Math.max(...parts.filter((p) => p.tag === 'dais').map((d) => d.p[1] + d.a[2] / 2));
    expect(plinth.p[1] - plinth.a[2] / 2).toBeCloseTo(daisTop, 6);
    const shaftFoot = Math.min(shaft.p[1] - shaft.a[2] / 2, shaft.p[1] + shaft.a[2] / 2); // a haste é inclinada: o pé é uma das pontas do eixo
    expect(shaftFoot).toBeLessThan(plinth.p[1] + plinth.a[2] / 2); // pé enterrado no plinto
    // costelas de basalto apontando (eriçam na afinação) e os três olhos de
    // ametista que respiram por dentro da pedra
    const spikes = parts.filter((p) => p.tag === 'spike');
    expect(spikes.length).toBe(6);
    const veins = parts.filter((p) => p.tag === 'vein');
    expect(veins.length).toBe(3);
    for (const v of veins) {
      expect(v.m).toBe('glow');
      expect(v.p[2]).toBeGreaterThan(0.78); // na frente do maciço, a luz vazando
    }
  });

  test('face de MÁSCARA DE FACHADA: rosácea de cinco pétalas e pinpricks na frente', () => {
    const parts = P8();
    const skull = parts.find((p) => p.tag === 'skull')!;
    expect(skull.g).toBe('dodeca');
    const skullFront = skull.p[2] + skull.a[0] * (skull.s?.[2] ?? 1);
    // placa pentagonal CLARA aparafusada na frente do crânio, LISA (rosto, não
    // rocha serrilhada) e AVANÇANDO sobre o crânio (máscara de fachada — o
    // traço raso morria a 6 m no print)
    const mask = parts.find((p) => p.tag === 'mask')!;
    expect(mask.g).toBe('cyl');
    expect(mask.a[3]).toBe(5);
    expect(mask.m).toBe('accent');
    expect(mask.amp ?? 1).toBeLessThanOrEqual(0.01);
    const maskFront = mask.p[2] + mask.a[2] / 2;
    expect(maskFront).toBeGreaterThanOrEqual(skullFront + 0.05);
    expect(mask.a[0]).toBeGreaterThanOrEqual(0.5); // larga: cobre o rosto do colosso
    // colar do pescoço de BASALTO ESCURO sob a placa clara (pedra escura sob
    // pedra clara = o único contraste que lê a 6 m — a lição do print)
    const neck = parts.find((p) => p.tag === 'neck')!;
    expect(neck.m).toBe('dark');
    // a ROSÁCEA: cinco pétalas pentagonais em anel no plano da frente (a janela
    // redonda da catedral desenhada em cinco), boss central e coração aceso no
    // olho — tudo saltado PARA FORA da placa
    const petals = parts.filter((p) => p.tag === 'rosette');
    expect(petals.length).toBe(5);
    for (const pet of petals) {
      expect(pet.a[3]).toBe(5);
      expect(pet.p[2]).toBeGreaterThanOrEqual(maskFront); // salta da máscara
      const ring = Math.hypot(pet.p[0], pet.p[1] - mask.p[1]);
      expect(ring).toBeGreaterThan(0.39); // anel de cinco (o pentágono da rosácea)
      expect(ring).toBeLessThan(0.44);
    }
    const boss = parts.find((p) => p.tag === 'boss')!;
    expect(boss.g).toBe('cyl');
    expect(boss.a[3]).toBe(5);
    expect(Math.abs(boss.p[0])).toBeLessThan(0.01); // no olho da rosácea
    const heart = parts.find((p) => p.tag === 'heart')!;
    expect(heart.m).toBe('white');
    const heartFront = zFront(heart);
    // o coração é a peça mais PARA FRENTE de toda a face (a luz no olho da rosácea
    // é o ponto que pega o olhar no card). A régua é a FRENTE REAL de cada peça
    // (bbox transformado — máscara, pétalas e órbitas têm eixos diferentes,
    // raio/altura a cru errariam o eixo de cada um)
    const faceFront = Math.max(
      zFront(mask),
      ...petals.map(zFront),
      zFront(boss),
      ...parts.filter((p) => p.tag === 'eye' || p.tag === 'brow' || p.tag === 'mouth').map(zFront),
    );
    expect(heartFront).toBeGreaterThan(heart.p[2]);
    expect(heartFront).toBeGreaterThanOrEqual(faceFront);
    // sobrancelha e boca em barra ESCURA sobre placa clara (a regra claro/escuro
    // da árvore) — sobrancelha ALTA e larga, boca de queixo estreita
    const brow = parts.find((p) => p.tag === 'brow')!;
    const mouth = parts.find((p) => p.tag === 'mouth')!;
    expect(brow.m).toBe('dark');
    expect(mouth.m).toBe('dark');
    expect(brow.a[0]).toBeGreaterThan(mouth.a[0]); // testa pesada, queixo fino
    // órbitas de BREU + pinpricks NA FRENTE delas (nunca googly — claro sobre
    // escuro é a regra da árvore) e tudo espelhado
    const sockets = parts.filter((p) => p.tag === 'socket');
    const eyes = parts.filter((p) => p.tag === 'eye');
    expect(sockets.length).toBe(2);
    expect(eyes.length).toBe(2);
    for (const e of eyes) expect(e.m).toBe('white');
    for (const e of eyes) {
      const socket = sockets.find((s) => Math.sign(s.p[0]) === Math.sign(e.p[0]))!;
      expect(socket.m).toBe('black');
      expect(Math.abs(e.p[0] - socket.p[0])).toBeLessThan(0.01); // colado na órbita
      expect(e.p[2]).toBeGreaterThan(socket.p[2] + 0.05); // pinprick na FRENTE do breu
      expect(e.a[0]).toBeLessThanOrEqual(0.08); // miúdo: estrela, não bola
    }
    expect(Math.abs(eyes[0].p[0] + eyes[1].p[0])).toBeLessThanOrEqual(0.01);
    // barba de cristais para baixo (DOWN5): cinco tocos todos abaixo do queixo
    const beard = parts.filter((p) => p.tag === 'beard');
    expect(beard.length).toBe(5);
    for (const b of beard) {
      expect(b.p[1]).toBeLessThan(mask.p[1] - 0.2); // pentágono pendurado no queixo
      expect(b.a[3]).toBe(5);
    }
  });

  test('o RELIQUÁRIO: aro ABERTO e cinco placas DOBRADIÇADAS que abrem a goela em flor', () => {
    const parts = P8();
    const collar = parts.find((p) => p.tag === 'jaw.collar')!;
    expect(collar.g).toBe('cyl');
    expect(collar.a[3]).toBe(5); // aro PENTAGONAL
    expect(collar.a[5]).toBe(1); // ABERTO: o geodo é CAVIDADE, não bloco fechado
    // o plano da dobradiça É o topo do aro (a rotação nasce da borda de pedra)
    expect(collar.p[1] + collar.a[2] / 2).toBeCloseTo(GEODO_JAW_Y, 9);
    // cinco placas mandibulares na QUINA do aro, com o centro exato no raio da
    // dobradiça e o corpo ATRAVESSANDO o plano (base abaixo = dobradiça; sem
    // isso a peça voaria solta da cabeça no meio do arremesso)
    const plates = parts.filter((p) => p.tag === 'jaw.plate');
    expect(plates.length).toBe(5);
    for (const pl of plates) {
      expect(radiusOf(pl)).toBeCloseTo(GEODO_JAW_RIM, 10);
      expect(pl.p[1]).toBeGreaterThan(GEODO_JAW_Y);
      expect(pl.p[1] - pl.a[1] / 2).toBeLessThan(GEODO_JAW_Y); // base abaixo do aro
    }
    // simetria PENTAGONAL de cinco em cinco: as sete peças da goela nascem das
    // quinas e das costuras do aro — placas a cada 72°, pontas de quartzo nas
    // costuras (36° deslocadas) e a copa plantada na mesma estrela
    const platePhi = plates.map(phiOf).sort((a, b) => a - b);
    for (let i = 1; i < 5; i++) expect(platePhi[i] - platePhi[i - 1]).toBeCloseTo((2 * Math.PI) / 5, 6);
    const points = parts.filter((p) => p.tag === 'jaw.point');
    expect(points.length).toBe(5);
    for (const pt of points) {
      expect(pt.a[3]).toBe(5);
      expect(radiusOf(pt)).toBeCloseTo(GEODO_JAW_RIM, 10); // nas mesma borda: mesma dobradiça
      const nearest = plates.reduce((a, b) => (Math.abs(phiOf(a) - phiOf(pt)) < Math.abs(phiOf(b) - phiOf(pt)) ? a : b));
      expect(Math.abs(Math.abs(phiOf(pt) - phiOf(nearest)) - Math.PI / 5)).toBeLessThan(0.005); // na COSTURA (36°)
    }
    // A DOBRADIÇA EM SI (a matemática que o rig aplica): eixo TANGENCIAL na
    // borda do aro, no plano do aro. Girar a placa no ângulo aberto do pico
    // joga o TOPO para fora (a FLOR abrindo — a leitura que o QA aprovou: o
    // miolo aparece pela cavidade) e faz o PÉ da placa deslizar para dentro do
    // colarinho — se o eixo fosse errado a placa enterraria na cavidade ou
    // arrancaria da cabeça no meio do arremesso
    const jawOpen = 0.5 * 1 + 0.07; // pico do rig (pose.jaw = 1 + respiração base)
    const hinge = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const pl of plates) {
      const phi = phiOf(pl);
      hinge.set(-Math.sin(phi), 0, Math.cos(phi)); // tangente à borda
      q.setFromAxisAngle(hinge, -jawOpen);
      const rim = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
      const rise = pl.p[1] - GEODO_JAW_Y; // centro da placa, acima do plano do aro
      const top = new THREE.Vector3(0, rise, 0).applyQuaternion(q);
      expect(top.dot(rim)).toBeGreaterThan(0.03); // topo ABRE para fora (flor)
      const foot = new THREE.Vector3(0, rise - pl.a[1] / 2, 0).applyQuaternion(q); // o pé, abaixo do plano
      expect(foot.dot(rim)).toBeLessThan(0); // pé recolhido para dentro do colarinho
    }
    // a taça por baixo (r mais largo que o aro: a goela EVASÉE para fora) e a
    // cama de cristais INCLINADA PARA DENTRO apontando o núcleo que paira nela
    const cups = parts.filter((p) => p.tag === 'jaw.cup');
    expect(cups.length).toBe(5);
    for (const c of cups) {
      expect(radiusOf(c)).toBeGreaterThanOrEqual(GEODO_JAW_RIM + 0.1);
      expect(c.p[1]).toBeLessThan(GEODO_JAW_Y);
    }
    const bed = parts.filter((p) => p.tag === 'bed');
    expect(bed.length).toBe(5);
    for (const b of bed) {
      expect(b.a[3]).toBe(5);
      expect(radiusOf(b)).toBeLessThan(0.56); // DENTRO do aro: a cama forra a cavidade
      const tiltV = new THREE.Vector3(-(b.r?.[2] ?? 0), 0, b.r?.[0] ?? 0);
      const radial = new THREE.Vector3(b.p[0], 0, b.p[2]).normalize();
      expect(tiltV.dot(radial)).toBeLessThan(-0.2); // tomba PARA DENTRO, apontando o miolo
      expect(b.p[1]).toBeLessThan(GEODO_CORE_POS[1]); // o boulder paira ACIMA da cama
    }
    // o boulder-de-luz: no eixo, acima do aro (a silhueta do tiro nasce da
    // goela — amarrado em teste com o projétil do motor)
    expect(GEODO_CORE_POS[0]).toBe(0);
    expect(GEODO_CORE_POS[2]).toBe(0);
    expect(GEODO_CORE_POS[1]).toBeGreaterThan(GEODO_JAW_Y);
    // as TORRES DE ÁPSIDE: três pináculos VERTICAIS plantados nas costuras de
    // trás do aro com nódulo de cantaria na ponta (a cobrança do print: ripas
    // inclinadas lixavam "feixe de varas quebrados", não catedral)
    const towers = parts.filter((p) => p.tag === 'crest' && p.g === 'cyl');
    const caps = parts.filter((p) => p.tag === 'crest' && p.g === 'dodeca');
    expect(towers.length).toBe(3);
    expect(caps.length).toBe(3);
    for (const t of towers) {
      expect(t.a[3]).toBe(5);
      const r = t.r ?? [0, 0, 0];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(r[0], r[1], r[2]));
      expect(ax.y).toBeGreaterThanOrEqual(0.96); // VERTICAL (≤ 16° do prumo): torre alicerçada
      expect(t.p[2]).toBeLessThan(0); // nas costuras de TRÁS (não na frente da coroa)
      expect(radiusOf(t)).toBeGreaterThan(0.55); // plantada na borda do aro
      const top: [number, number, number] = [
        t.p[0] + ax.x * (t.a[2] / 2),
        t.p[1] + ax.y * (t.a[2] / 2),
        t.p[2] + ax.z * (t.a[2] / 2),
      ];
      const cap = caps.map((c) => dist3(c.p, top)).sort((a, b) => a - b)[0];
      expect(cap).toBeLessThan(0.15); // o nódulo coroa a ponta da torre (não flutua)
    }
  });

  test('braços = ARCOBOTANTES: o ombro É o pivô exportado e o contraforte é fundação', () => {
    const parts = P8();
    const arms = parts.filter((p) => (p.tag ?? '').startsWith('arm'));
    expect(arms.length).toBeGreaterThanOrEqual(18);
    for (const side of [1, -1]) {
      const tag = (t: string) => arms.filter((p) => p.tag === t && Math.sign(p.p[0]) === side);
      // o NÓDOULO DO OMBRO é exatamente o pivô que o rig exporta: girar o
      // arcobotante inteiro ali é o que impede o ombro de desarticular
      const shoulder = tag('arm.shoulder');
      expect(shoulder.length).toBe(1);
      expect(shoulder[0].g).toBe('dodeca');
      const dPiv = Math.hypot(
        Math.abs(shoulder[0].p[0]) - GEODO_ARM_PIVOT[0],
        shoulder[0].p[1] - GEODO_ARM_PIVOT[1],
        shoulder[0].p[2] - GEODO_ARM_PIVOT[2],
      );
      expect(dPiv).toBeLessThan(0.01);
      // cadeia contínua: arco de cima liga OMBRO→COTOVELO e arco de baixo
      // COTOVELO→CONTRAFORTE (a midpoint do prisma cai no meio dos nós)
      const elbow = tag('arm.elbow')[0];
      const upper = tag('arm.upper')[0];
      // O PIVO É ESPELHADO por lado (mm espelha posição): o ombro do lado -1
      // mora em x = -0,82 — comparar com o pivô cru dava um desvio de 0,83
      const mid: [number, number, number] = [
        (side * GEODO_ARM_PIVOT[0] + elbow.p[0]) / 2,
        (GEODO_ARM_PIVOT[1] + elbow.p[1]) / 2,
        (GEODO_ARM_PIVOT[2] + elbow.p[2]) / 2,
      ];
      expect(dist3(upper.p, mid)).toBeLessThan(0.06);
      const pier = tag('arm.pier')[0];
      const lower = tag('arm.lower')[0];
      expect(elbow.g).toBe('dodeca');
      expect(lower.p[1] - lower.a[2] / 2).toBeCloseTo(pier.p[1] + pier.a[0] * (pier.s?.[1] ?? 1), 1); // o arco POUSADO no contraforte
      // O CONTRAFORTE é fundação: enterrado no degrau e por fora do maciço —
      // é por isso que o rig o deixa IMÓVEL enquanto o ombro gira
      expect(pier.p[1] - pier.a[0] * (pier.s?.[1] ?? 1)).toBeLessThan(0.42); // afogado no degrau
      expect(radiusOf(pier)).toBeGreaterThan(1.3);
      // o arco ABRE para fora: |x| cresce do ombro ao contraforte (o empuxo da
      // abóbada desce por um A, não por um I)
      expect(Math.abs(elbow.p[0])).toBeGreaterThan(GEODO_ARM_PIVOT[0]);
      expect(Math.abs(pier.p[0])).toBeGreaterThan(Math.abs(elbow.p[0]));
      // o punho de cristal: cinco pontas pentagonais na base enterrada
      const claws = tag('arm.claw');
      expect(claws.length).toBe(5);
      for (const c of claws) {
        expect(c.a[3]).toBe(5);
        expect(dist3(c.p, [Math.sign(pier.p[0]) * 1.5, 1.88, 0])).toBeLessThan(0.45);
      }
    }
  });

  test('três órbitas em alturas que NÃO se tocam: o toco inclina PARA DENTRO', () => {
    const parts = P8();
    const tiltDot = (p: { p: [number, number, number]; r?: [number, number, number] }) => {
      const tiltV = new THREE.Vector3(-(p.r?.[2] ?? 0), 0, p.r?.[0] ?? 0);
      const radial = new THREE.Vector3(p.p[0], 0, p.p[2]).normalize();
      expect(tiltV.clone().cross(radial).length()).toBeLessThan(1e-6); // o tilt do ringAround chega colado na radial
      return tiltV.dot(radial);
    };
    // 0: seis tocos de quartzo no peito — COLADOS à figura e tombando PARA
    // DENTRO (a lição do print: inclinado para fora o toco encurtava e virava
    // "disco de chiclete flutuando")
    const chestRing = parts.filter((p) => p.group === 0);
    for (const p of chestRing) {
      expect(p.a[3]).toBe(5);
      expect(radiusOf(p)).toBeGreaterThanOrEqual(0.9);
      expect(radiusOf(p)).toBeLessThan(1.2);
      expect(Math.abs(p.p[1] - 2.04)).toBeLessThan(0.1);
      expect(tiltDot(p)).toBeLessThan(-0.3); // para DENTRO
    }
    // 1: sete lascas de basalto raspando o degrau, POR FORA da fundação e no
    // sentido contrário (o tanque devolve o que apanhou, rasteiro)
    const floorRing = parts.filter((p) => p.group === 1);
    for (const p of floorRing) {
      expect(p.g).toBe('dodeca');
      expect(p.m).toBe('dark');
      expect(p.p[1]).toBeLessThan(0.5); // rente ao degrau
      expect(radiusOf(p)).toBeGreaterThan(1.78); // fora do piso de pedra
      expect(tiltDot(p)).toBeGreaterThan(0.05);
    }
    // 2: CINCO estilhaços altos acima da goela (de novo o pentágono)
    const highRing = parts.filter((p) => p.group === 2);
    for (const p of highRing) {
      expect(p.a[3]).toBe(5);
      expect(p.p[1]).toBeGreaterThan(4.2); // acima do aro (topo do aro é 3,62)
      expect(radiusOf(p)).toBeLessThanOrEqual(1.2); // colados à copa (longe virava confete no print)
      expect(tiltDot(p)).toBeGreaterThan(0.3);
    }
    // as faixas de altura NUNCA se tocam (era o cacho das primeiras passadas)
    const ys = (g: number) => parts.filter((p) => p.group === g).map((p) => p.p[1]);
    expect(Math.max(...ys(1))).toBeLessThan(Math.min(...ys(0)));
    expect(Math.max(...ys(0))).toBeLessThan(Math.min(...ys(2)));
  });

  test('invólucro: catedral larga de base, colunata no slot, coroa respeitando o formTop', () => {
    const e = partsEnvelope(P8());
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // a fundação escalonada + o entulho cuspidido alargam a silhueta (é a
    // paisagem que atira, não um guerreiro magro)
    expect(halfX).toBeGreaterThanOrEqual(1.9);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(halfZ).toBeGreaterThanOrEqual(1.9);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantado e ASSENTADO: nenhum peça afunda no piso do tabuleiro
    expect(e.minY).toBeGreaterThanOrEqual(-0.01);
    expect(e.minY).toBeLessThan(0.1);
    // as torres e os estilhaços altos usam a altura da forma sem estourar o teto
    expect(e.maxY).toBeLessThanOrEqual(formTop(GEODO, 8) + 0.25);
    expect(e.maxY).toBeGreaterThanOrEqual(formTop(GEODO, 8) - 0.2);
    expect(e.maxY).toBeGreaterThanOrEqual(4.6);
  });

  test('ANTI LOW-POLY: 151 peças, 5,3 mil triângulos e contagens REAIS de malha', () => {
    const parts = P8();
    expect(parts.length).toBeGreaterThanOrEqual(150);
    let drawn = 0;
    let tris = 0;
    for (const p of parts) {
      const geo = getGeometry(p.g, p.a);
      drawn += geo.getAttribute('position').count;
      tris += (geo.index?.count ?? geo.getAttribute('position').count) / 3;
    }
    expect(drawn).toBeGreaterThanOrEqual(8500); // medido: 8.936 vértices de posição desenhados
    expect(tris).toBeGreaterThanOrEqual(5200); // medido: 5.436 triângulos (153 peças)
    // contagens REAIS (medição, sem chute): o aro pentagonal ABERTO do reliquário,
    // o boulder dodecaédrico do tiro e um mamelon de basalto
    expect(getGeometry('cyl', [0.56, 0.7, 0.36, 5, 3, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(20);
    expect(getGeometry('dodeca', [0.34]).getAttribute('position').count).toBeGreaterThanOrEqual(100);
    expect(getGeometry('dodeca', [1.0]).getAttribute('position').count).toBeGreaterThanOrEqual(100);
    expect(getGeometry('cyl', [0.52, 0.54, 0.14, 5, 3]).getAttribute('position').count).toBeGreaterThanOrEqual(30);
    // nenhuma peça pode pedir atalho: todo prisma ≥ 3 anéis verticais
    for (const p of parts) if (p.g === 'cyl') expect(p.a[4] ?? 1).toBeGreaterThanOrEqual(1);
  });

  test('paleta ÚNICA do motor ao caco: a ametista #c77dff; a basalto é CRUA, não o vidro da mãe', () => {
    expect(GEODO_AMETHYST).toBe('#c77dff');
    expect(GEODO.base.projectileColor).toBe(GEODO_AMETHYST);
    expect(VISUALS.geodo.accent).toBe(GEODO_AMETHYST);
    // a identidade atravessa TODOS os materiais: veio do basalto (corpo), do
    // breu (luvas/pilares), da cantaria (graus/máscara/aro), o ouro do núcleo
    // na goela, o corpo dos nódulos-veio e o veio do BOULDER arremessado
    expect(BASALT_LOOK.crack).toBe(GEODO_AMETHYST);
    expect(BASALT_DEEP_LOOK.crack).toBe(GEODO_AMETHYST);
    expect(ASHLAR_LOOK.crack).toBe(GEODO_AMETHYST);
    expect(CORE_LOOK.gold).toBe(GEODO_AMETHYST);
    expect(VEIN_LOOK.gold).toBe(GEODO_AMETHYST);
    expect(GEODO_BOULDER_LOOK.crack).toBe(GEODO_AMETHYST);
    // o lilás QUENTE #e0b3ff é sempre acento: veio do quartzo, coração da
    // rosácea (gold!), acento do núcleo e a crosta do boulder em voo
    expect(GEODO_LILAC).toBe('#e0b3ff');
    expect(VISUALS.geodo.glow).toBe(GEODO_LILAC);
    expect(QUARTZ_LOOK.crack).toBe(GEODO_LILAC);
    expect(CORE_LOOK.cool).toBe(GEODO_LILAC);
    expect(HEART_LOOK.gold).toBe(GEODO_LILAC);
    expect(GEODO_CHIP_LOOK.crack).toBe(GEODO_LILAC);
    // os três violetas da árvore são DISTINTOS (irmão de cor sem plágio: o
    // Cristal é trans lúcido #b7a6ff e a Obsidiana brasa #8f5cff)
    expect(VISUALS.cristal.glow).not.toBe(GEODO_AMETHYST);
    expect(VISUALS.obsidiana.glow).not.toBe(GEODO_AMETHYST);
    // VISUALS = rig (nada de deriva entre o modelo e o figurino): o corpo do
    // figurino É o hex do basalto do shader
    expect(VISUALS.geodo.body).toBe(BASALT_LOOK.rockA);
    expect(VISUALS.geodo.dark).toBe(BASALT_LOOK.rockB);
    // a cobrança do print: com #453a52 o Geodo lia o MESMO preto-vidro da
    // Obsidiana (mãe) ao lado dela — a basalto ameixa tem que valer ≥ 4× a
    // luminância LINEAR do corpo espelhado da mãe; fosco ≠ espelhado também
    expect(luma(BASALT_LOOK.rockA)).toBeGreaterThanOrEqual(luma(VISUALS.obsidiana.body) * 4);
    expect(VISUALS.geodo.roughness).toBeGreaterThanOrEqual(0.85); // CRUA
    expect(VISUALS.geodo.metalness).toBeLessThanOrEqual(0.1); // nunca o espelho da mãe
    expect(VISUALS.obsidiana.metalness).toBeGreaterThanOrEqual(0.5);
    // CONSTRUÇÃO vs mameluco: a cantaria clara vale ≥ 3× o basalto (a única
    // espécie da árvore em que a pedra clara é maioria do figurino) e o breu
    // das luvas é MAIS fundo que o corpo (o escuro das fundações)
    expect(luma(ASHLAR_LOOK.rockA)).toBeGreaterThanOrEqual(luma(BASALT_LOOK.rockA) * 3);
    expect(luma(BASALT_DEEP_LOOK.rockA)).toBeLessThan(luma(BASALT_LOOK.rockA));
    // veio CONTIDO na rocha: quem arde é o interior do geodo, nunca a pedra
    expect(BASALT_LOOK.crackGlow * BASALT_LOOK.crackBoost).toBeLessThanOrEqual(0.27);
    expect(ASHLAR_LOOK.crackGlow * ASHLAR_LOOK.crackBoost).toBeLessThanOrEqual(0.12);
    // o quartzo é TOCO e denso (o trans lúcido é do Cristal-pai): alpha alto,
    // envMix baixo, e o núcleo ferve sem branco puro
    expect(QUARTZ_LOOK.alpha).toBeGreaterThanOrEqual(0.8);
    expect(QUARTZ_LOOK.envMix).toBeLessThanOrEqual(0.45);
    expect(CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(CORE_LOOK.white)).toBeGreaterThan(luma(CORE_LOOK.gold));
    // as réguas chegam NA UNIFORM dos quatro shaders (senão eram enfeite de TS)
    const basalto = makeStoneMaterial({
      rockA: BASALT_LOOK.rockA,
      rockB: BASALT_LOOK.rockB,
      crack: BASALT_LOOK.crack,
      amp: BASALT_LOOK.amp,
      crackGlow: BASALT_LOOK.crackGlow,
      crackScale: BASALT_LOOK.crackScale,
      crackWidth: BASALT_LOOK.crackWidth,
      crackBoost: BASALT_LOOK.crackBoost,
      speck: BASALT_LOOK.speck,
    });
    expect(basalto.transparent).toBe(false); // rocha opaca: peso no tabuleiro
    expect(basalto.depthWrite).toBe(true);
    expect(basalto.uniforms.uCrack.value.getHexString()).toBe(GEODO_AMETHYST.slice(1));
    expect(basalto.uniforms.uCrackGlow.value * basalto.uniforms.uCrackBoost.value).toBeLessThanOrEqual(0.27);
    basalto.dispose();
    const cantaria = makeStoneMaterial({
      rockA: ASHLAR_LOOK.rockA,
      rockB: ASHLAR_LOOK.rockB,
      crack: ASHLAR_LOOK.crack,
      amp: ASHLAR_LOOK.amp,
      crackGlow: ASHLAR_LOOK.crackGlow,
      crackScale: ASHLAR_LOOK.crackScale,
      crackWidth: ASHLAR_LOOK.crackWidth,
      crackBoost: ASHLAR_LOOK.crackBoost,
      speck: ASHLAR_LOOK.speck,
    });
    expect(cantaria.uniforms.uCrack.value.getHexString()).toBe(GEODO_AMETHYST.slice(1));
    cantaria.dispose();
    const quartz = makeIceMaterial({
      iceA: QUARTZ_LOOK.iceA,
      iceB: QUARTZ_LOOK.iceB,
      crack: QUARTZ_LOOK.crack,
      amp: QUARTZ_LOOK.amp,
      crackGlow: QUARTZ_LOOK.crackGlow,
      crackScale: QUARTZ_LOOK.crackScale,
      crackWidth: QUARTZ_LOOK.crackWidth,
      sparkle: QUARTZ_LOOK.sparkle,
      alpha: QUARTZ_LOOK.alpha,
      bump: QUARTZ_LOOK.bump,
      reflPow: QUARTZ_LOOK.reflPow,
      envMix: QUARTZ_LOOK.envMix,
    });
    expect(quartz.uniforms.uCrackCol.value.getHexString()).toBe(GEODO_LILAC.slice(1));
    expect(quartz.uniforms.uAlpha.value).toBeGreaterThanOrEqual(0.8);
    quartz.dispose();
    const core = makeCoreMaterial({
      gold: CORE_LOOK.gold,
      white: CORE_LOOK.white,
      cool: CORE_LOOK.cool,
      amp: CORE_LOOK.amp,
    });
    expect(core.uniforms.uGold.value.getHexString()).toBe(GEODO_AMETHYST.slice(1));
    core.dispose();
    // coração da rosácea: o HOT na frente de tudo — dois cores acesos, um
    // responde pela catedral (ametista), o outro pelo vitral (lilás)
    expect(HEART_LOOK.gold).not.toBe(CORE_LOOK.gold);
  });

  test('o matacão arremessado É o mesmo basalto/quartzo: silhueta do tiro = silhueta do maciço', () => {
    // o projétil-assinatura carrega a MESMA cadeia (motor → corpo → voo →
    // impacto sem trocar de cor): o bloco é o MESMO basalto do corpo...
    expect(GEODO_BOULDER_LOOK.rockA).toBe(BASALT_LOOK.rockA);
    expect(GEODO_BOULDER_LOOK.rockB).toBe(BASALT_LOOK.rockB);
    // ...mas pedra FRESCA arrancada do forno: o veio aceso vale mais que o do
    // corpo parado (0,7 > 0,34) — a luz da cavidade ainda vazando pela quina
    expect(GEODO_BOULDER_LOOK.crackGlow).toBeGreaterThan(BASALT_LOOK.crackGlow);
    // e a crosta arrancada da goela (o splash começando no ar) é o MESMO
    // quartzo orquídea das pontas do figurino, nunca o gelo do Gelo
    expect(GEODO_CHIP_LOOK.iceA).toBe(QUARTZ_LOOK.iceA);
    expect(GEODO_CHIP_LOOK.iceB).toBe(QUARTZ_LOOK.iceB);
    expect(GEODO_CHIP_LOOK.alpha).toBeLessThanOrEqual(0.95);
  });

  test('motor: o mais DURO dos tanques — heavy, splash 1,8, lowestHp, boulder a 7 un/s', () => {
    expect(GEODO.base.damageElement).toBe('earth');
    expect(GEODO.base.targeting).toBe('lowestHp'); // o tanque caça o machucado
    expect(GEODO.base.hp).toBe(128);
    expect(GEODO.base.damage).toBe(22);
    expect(GEODO.base.reload).toBe(1.6);
    expect(GEODO.base.projectileSpeed).toBe(7);
    // entre os Nv.8, o Geodo é o MAIS LENTO dos dois ritmos (recarga e pedra):
    // a cósmica cospe estrela a 14 e o abissal cospe água a 8,5
    const nv8 = Object.values(SPECIES).filter((s) => s.levelMin === 8);
    expect(nv8.length).toBeGreaterThanOrEqual(4);
    for (const s of nv8) {
      if (s.id === 'geodo') continue;
      expect(GEODO.base.interval).toBeGreaterThanOrEqual(s.base.interval);
      expect(GEODO.base.projectileSpeed).toBeLessThan(s.base.projectileSpeed);
    }
    const heavy = GEODO.base.abilities.find((a) => a.kind === 'heavy');
    expect(heavy).toBeTruthy();
    const splash = GEODO.base.abilities.find((a) => a.kind === 'splash');
    expect(splash && 'radius' in splash && splash.radius).toBe(1.8);
    expect(splash && 'factor' in splash && splash.factor).toBe(0.6);
    expect(GEODO.base.resist.earth).toBeGreaterThanOrEqual(0.35);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 90909 });    const st = eng.addRetainedUnit('geodo', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2); // Nv.8 não é convocável a Nv.1 — vai de golem mesmo
    eng.startBattle();
    // varre o voo em passos miúdos: a pedra voa devagar PARA O NÍVEL (base 7
    // × 1,12^7 ≈ 15,5 no Nv.8 — ainda assim o arremesso mais lento dos Nv.8:
    // a cósmica escala a 31, a abissal a 19, a vulcânica a 17,7). O motor é
    // guiado (vel = direção × speed todo tick, magnitude constante)
    const SPEED8 = GEODO.base.projectileSpeed * Math.pow(LEVEL_PROJECTILE_MULT, 7);
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 130; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles)
        if (p.species === 'geodo') {
          inFlight.push(p);
          const v = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
          expect(Math.abs(v - SPEED8)).toBeLessThan(0.01); // o matacão segura a velocidade pesada o voo inteiro
        }
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(8);
      expect(p.damageElement).toBe('earth');
      expect(p.abilities.some((a) => a.kind === 'heavy')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'splash')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'geodo');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(8);
  });

  test('coreografia MAIS LENTA da árvore: 1,05 s com 68% de afinação e pose que ZERA no fim', () => {
    // o pow-wow da rocha: mais lento que a Obsidiana (0,95), o Cósmico (0,86)
    // e o Cristal (0,8); a fração de afinação (0,68) é a maior da árvore
    expect(GEODO_ATTACK_WINDOW).toBeGreaterThan(OBSIDIANA_ATTACK_WINDOW);
    expect(GEODO_ATTACK_WINDOW).toBeGreaterThan(COSMICO_ATTACK_WINDOW);
    expect(GEODO_ATTACK_WINDOW).toBeGreaterThan(CRISTAL_ATTACK_WINDOW);
    expect(GEODO_ATTACK_WINDOW).toBeGreaterThan(TEMPESTADE_ATTACK_WINDOW);
    expect(GEODO_ATTACK_WINDOW).toBeGreaterThan(PLASMA_ATTACK_WINDOW);
    expect(GEODO_WINDUP).toBe(0.68);
    expect(GEODO_WINDUP).toBeGreaterThan(COSMICO_WINDUP); // 0,62 era o teto da árvore
    expect(GEODO_WINDUP).toBeGreaterThan(PLASMA_WINDUP);
    // o tempo absoluto de afinação (0,71 s) é maior que o da mãe Obsidiana
    expect(GEODO_ATTACK_WINDOW * GEODO_WINDUP).toBeGreaterThan(COSMICO_ATTACK_WINDOW * COSMICO_WINDUP);

    const idle = attackPose(-1);
    expect([idle.twist, idle.crouch, idle.heave, idle.jaw, idle.swing, idle.charge, idle.lean, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const tune = attackPose(GEODO_ATTACK_WINDOW * GEODO_WINDUP * 0.95);
    expect(tune.heave).toBeGreaterThanOrEqual(0.88); // o boulder já subiu da cama para a goela
    expect(tune.jaw).toBeGreaterThanOrEqual(0.88); // e a goela de cinco placas está ABERTA
    expect(tune.crouch).toBeLessThanOrEqual(-0.6); // o maciço agacha e comprime as colunas
    expect(tune.swing).toBeGreaterThanOrEqual(0.45); // os arcobotantes escoram para os lados
    expect(tune.charge).toBeGreaterThanOrEqual(0.88);
    expect(tune.lean).toBeLessThan(0); // verga para trás carregando a nota
    expect(tune.flare).toBeGreaterThanOrEqual(0.7); // os estilhaços em órbita se eriçam
    const shot = attackPose(GEODO_ATTACK_WINDOW * (GEODO_WINDUP + 0.22 * (1 - GEODO_WINDUP)));
    expect(shot.heave).toBeLessThanOrEqual(-0.3); // o boulder SAI: a goela fica vazia
    expect(shot.jaw).toBeLessThan(0); // a goela BATE depois de cuspir (dobradiça de volta)
    expect(shot.swing).toBeLessThanOrEqual(-0.6); // os arcobotantes batem de volta
    expect(shot.crouch).toBeGreaterThanOrEqual(0.6); // de agachado a ESTUFADO no coice
    expect(shot.lean).toBeGreaterThan(0.6); // verga para frente no coice
    expect(shot.twist).toBeLessThan(0); // torce no CONTRÁRIO (a rocha quebrou)
    expect(shot.flare).toBeLessThan(0); // os estilhaços achatam no coice
    const late = attackPose(GEODO_ATTACK_WINDOW * 0.98);
    expect(Math.abs(late.heave)).toBeLessThan(Math.abs(shot.heave)); // tudo devolvendo
    expect(Math.abs(late.swing)).toBeLessThan(Math.abs(shot.swing));
    expect(late.charge).toBeLessThan(shot.charge);
    expect(Math.abs(late.flare)).toBeLessThan(Math.abs(shot.flare));
    // a coreografia ZERA exata no fim da janela (decay → 0): nada de pose
    // resvalando para o próximo ciclo — a catedral reassenta POR INTEIRO
    // (`+ 0`: com decay=0 os produtos saem como -0, e toEqual distingue -0 de +0)
    const zeros = (P: AttackPose) =>
      [P.twist, P.crouch, P.heave, P.jaw, P.swing, P.charge, P.lean, P.flare].map((n) => n + 0);
    const settled = attackPose(GEODO_ATTACK_WINDOW);
    expect(zeros(settled)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const out = attackPose(GEODO_ATTACK_WINDOW + 0.2);
    expect([out.jaw, out.heave, out.crouch, out.swing, out.charge, out.lean, out.flare]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // amplitudes coreografadas: nada de membro arrancado (o arcobotante gira
    // 0,17·swing no ombro e a goela abre 0,5 rad na dobradiça)
    for (let s = 0; s <= GEODO_ATTACK_WINDOW; s += 0.02) {
      const P = attackPose(s);
      expect(Math.abs(P.crouch)).toBeLessThanOrEqual(0.85);
      expect(Math.abs(P.swing)).toBeLessThanOrEqual(0.85);
      expect(Math.abs(P.lean)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(P.twist)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(P.heave)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.jaw)).toBeLessThanOrEqual(1);
      expect(Math.abs(P.flare)).toBeLessThanOrEqual(0.85);
      expect(Math.abs(P.charge)).toBeLessThanOrEqual(1);
    }
  });
});
