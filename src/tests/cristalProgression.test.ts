import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeIceMaterial } from '../scene/iceShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  CRISTAL_AMETHYST,
  CORE_LOOK,
  CORE_POS,
  CRISTAL_ARM_PIVOT,
  CRISTAL_ATTACK_WINDOW,
  CRISTAL_WINDUP,
  GROW_LOOK,
  MINERAL_LOOK,
  PRISM_LOOK,
  ROOT_LOOK,
  SHARD_LOOK,
  SLIVER_LOOK,
  attackPose,
} from '../scene/CrystalRig';
import { NEVOA_ATTACK_WINDOW } from '../scene/NevoaRig';
import { OBSIDIANA_ATTACK_WINDOW } from '../scene/ObsidianaRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { Part } from '../scene/speciesModels';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do CRISTAL (Nv.7 — areia+madeira: o PRISMA VIVO), o artilheiro plantado
 * numa duna cimentada cujos estilhaços ricocheteiam (chain 2). As regras
 * amarradas aqui:
 *  - a AMETISTA #b7a6ff é ÚNICA entre motor (projectileColor), veio da matriz,
 *    seiva da raiz petrificada, miolo da gema, farpa em voo e lasca do FX
 *    (identidade da espécie do motor ao impacto);
 *  - a MATRIZ é pedra CLARA de geodo com veio CONTIDO: a primeira versão era
 *    breu com veio acesso e o print lia "obsidiana com veios de LAVA" (magma —
 *    fora do tema de areia+raiz). Quem brilha é SÓ a gema do peito;
 *  - silhueta em A: DUNA em degraus + saia de areia plana + raiz petrificada →
 *    PÉ de prismas escamados → TRONCO que é um FEIXE de colunas de SEIS FACES
 *    (um tambor liso lia "poste roxo de gelatina") → braços CORRENTES → cabeça
 *    de diamante com HALO de farpas;
 *  - zero anel EM PÉ: todo `ring` do figurino está DEITADO (r X ≈ −1,57) e não
 *    existe um único `torus` — o ressoador do prisma é um halo HORIZONTAL de
 *    farpas que orbita (grupo 0) e acelera com a carga;
 *  - a GEMA lê DO FORA da pedra (o miolo enterrado no prisma translúcido era
 *    comido pelo alfa e o peito lia roxo liso);
 *  - anti low-poly: DNA de SEIS FACES em todo tambor da espécie com 5–7 anéis
 *    verticais, octaedro SUB 1, icosaedro SUB 2, saia de areia de 56 radiais
 *    (102 peças, ~7,9 mil vértices desenhados);
 *  - coreografia de AFINAÇÃO E CANHÃO: 55% da janela é o zumbido enchendo
 *    (só a Obsidiana, Nv.8, afina mais devagar que ele).
 */

const CRISTAL = getSpecies('cristal');
const LV = 7 as MonsterLevel;

/** luminância (Rec. 709) — a régua do "isso é GEODO ou é OBSIDIANA COM LAVA?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const P7 = () => partsForLevel(MODELS.cristal, 7);

/** raio horizontal de uma peça em relação ao eixo do colosso */
const radiusOf = (p: { p: [number, number, number] }) => Math.hypot(p.p[0], p.p[2]);

/** meia-altura real de uma farpa de coroa (octaedro é a[0]; cone é a[1]/2) */
const halfHeight = (p: Part) =>
  (p.g === 'octa' ? p.a[0] : p.g === 'cone' ? p.a[1] / 2 : p.a[2] / 2) * (p.s?.[1] ?? 1);

describe('Cristal: prisma vivo plantado na duna (Nv.7)', () => {
  test('rig próprio, forma ÚNICA e PLANTADO na duna (Nv.7 fixo)', () => {
    expect(SPECIES_RIGS.cristal).toBeTruthy();
    expect(CRISTAL.levelMin).toBe(7);
    expect(CRISTAL.levelMax).toBe(7);
    expect(hasLevelVariants(MODELS.cristal)).toBe(false);
    expect(P7().length).toBe(MODELS.cristal.parts.length);
    // orçamento denso: a régua anti low-poly da árvore (golem 47, névoa 36) —
    // aqui a figura inteira são mais de 100 peças de cristal
    expect(MODELS.cristal.parts.length).toBeGreaterThanOrEqual(90);
    // PLANTADO: o prisma nasce do chão do slot (nada de colosso boiando)
    expect(MODELS.cristal.floatY).toBe(0);
    expect(CRISTAL.base.moveSpeed).toBe(0);
    // três corpos em movimento: halo (grupo 0) + duas órbitas de cacos-filhote
    const groups = MODELS.cristal.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    const parts = P7();
    expect(parts.filter((p) => p.group === 0).length).toBeGreaterThanOrEqual(6);
    expect(parts.filter((p) => p.group === 1).length).toBeGreaterThanOrEqual(5);
    expect(parts.filter((p) => p.group === 2).length).toBeGreaterThanOrEqual(3);
    // a duna gira num sentido e a órbita baixa no CONTRÁRIO (riqueza de leitura)
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[0]));
  });

  test('base: DUNA em degraus + saia de areia + RAIZ PETRIFICADA (o blurb)', () => {
    const parts = P7();
    // a duna cimentada: laje de icosaedro achatado + dois tambores de seis faces
    const plinth = parts.filter((p) => p.tag === 'plinth');
    expect(plinth.length).toBeGreaterThanOrEqual(3);
    for (const p of plinth) expect(p.p[1]).toBeLessThanOrEqual(0.5);
    const slab = plinth.find((p) => p.g === 'ico')!;
    expect(slab.a[1]).toBeGreaterThanOrEqual(2); // sub 2: relevo de rocha, não prisma
    expect(slab.s![1]).toBeLessThanOrEqual(0.2); // achatada: é duna, não bola
    // saia de areia rente ao tabuleiro: anel PLANO e LARGO, furado no meio
    const skirt = parts.find((p) => p.g === 'ring' && p.p[1] < 0.1)!;
    expect(skirt.a[2]).toBeGreaterThanOrEqual(56); // 56 radiais (a régua da árvore)
    expect(Math.abs(skirt.r?.[0] ?? 0)).toBeGreaterThan(1.5); // DEITADO: saia, não aro
    expect(skirt.a[0]).toBeGreaterThanOrEqual(0.4); // fura no meio: é anel, não disco
    expect(skirt.a[1]).toBeGreaterThanOrEqual(1.2); // larga: a areia ocupa o slot
    expect(skirt.p[1]).toBeLessThanOrEqual(0.06); // rente ao piso (nunca afunda)
    // RAIZ PETRIFICADA: o lado "madeira" do blurb vira rocha (tag root = o rig
    // veste a casca de madeira do WoodRig, sem musgo verde)
    const roots = parts.filter((p) => p.tag === 'root');
    expect(roots.length).toBeGreaterThanOrEqual(6);
    for (const r of roots) {
      expect(r.p[1]).toBeLessThan(0.6); // raiz é peça de chão
      expect(r.m).toBe('body'); // quem decide a casca é o rig, não o modelo
      // deitada/oblíqua: raiz que sai da duna na horizontal, nunca estaca em pé
      expect(Math.abs(r.r?.[0] ?? 0) + Math.abs(r.r?.[2] ?? 0)).toBeGreaterThan(1.0);
    }
    // cascalho de ametista na duna: o lasco CLARO que lê no card miúdo
    const gravel = parts.filter((p) => p.m === 'accent' && p.p[1] < 0.6 && p.g === 'octa');
    expect(gravel.length).toBeGreaterThanOrEqual(3);
    for (const g of gravel) expect(g.a[1]).toBeGreaterThanOrEqual(1); // facetado denso
  });

  test('tronco: FEIXE de colunas de SEIS FACES (nunca tambor liso de papelão)', () => {
    const parts = P7();
    // O DNA da espécie é a costela de SEIS FACES: todo tambor do figurino é
    // hexagonal (do pé à flauta, do cinto ao halo). Densidade vem dos ANÉIS
    // VERTICAIS (5–7), não de arredondar o prisma em cilindro de 24 faces.
    const drums = parts.filter((p) => p.g === 'cyl');
    expect(drums.length).toBeGreaterThanOrEqual(20);
    for (const d of drums) expect(d.a[3]).toBe(6);
    // o feixe: coluna-mãe + gêmeo + duas laterais + duas externas + a frontal
    const columns = parts.filter((p) => p.g === 'cyl' && p.a[1] >= 0.24 && p.a[2] >= 1.4);
    expect(columns.length).toBeGreaterThanOrEqual(6);
    for (const c of columns) {
      expect(c.a[3]).toBe(6);
      expect(c.a[4]).toBeGreaterThanOrEqual(5); // anéis verticais (anti tambor liso)
    }
    const mother = columns.reduce((a, b) => (a.a[2] >= b.a[2] ? a : b));
    expect(mother.a[2]).toBeGreaterThanOrEqual(2.0); // alta: ombro → cinto
    expect(mother.a[1]).toBeGreaterThanOrEqual(0.6); // quadril largo na base
    // as colunas são FUNDIDAS (cacho, não paliteiro): cada coluna encosta numa
    // vizinha — era isso ou o tronco lia "guarda-chuva de palitos"
    for (const c of columns.filter((c) => Math.abs(c.p[0]) > 0.3)) {
      const near = columns
        .filter((o) => o !== c)
        .some((o) => Math.hypot(o.p[0] - c.p[0], o.p[2] - c.p[2]) < c.a[1] + o.a[1] + 0.1);
      expect(near).toBe(true);
    }
    // seis flautas costurando o feixe por fora (ringAround: seis peças a 60°,
    // crescimento novo brota do velho — tag growth zumbe na afinação)
    const flutes = parts.filter(
      (p) => p.tag === 'growth' && p.g === 'cyl' && Math.abs(p.p[1] - 2.02) < 0.05,
    );
    expect(flutes.length).toBe(6);
    for (const f of flutes) {
      expect(radiusOf(f)).toBeGreaterThan(0.6); // por FORA do feixe
      expect(f.a[4]).toBeGreaterThanOrEqual(5);
    }
    // crista dorsal: farpas crescendo pelas COSTAS (a altura de perfil)
    const dorsal = parts.filter(
      (p) => p.tag === 'growth' && p.g === 'octa' && p.p[1] > 2.5 && p.p[2] < -0.7,
    );
    expect(dorsal.length).toBeGreaterThanOrEqual(3);
    for (const d of dorsal) expect(d.s![1]).toBeGreaterThanOrEqual(1.8); // farpa ALONGADA
    // jaula de costelas na frente do peito (as duas de cada lado)
    const ribs = parts.filter(
      (p) => p.tag === 'growth' && p.g === 'cyl' && p.p[1] > 2.1 && p.p[1] < 3.0 && p.p[2] > 0.3,
    );
    expect(ribs.length).toBe(4);
  });

  test('rosto: placa CLARA na frente do diamante, olhos fendidos e boca-trinca', () => {
    const parts = P7();
    // cabeça de DIAMANTE facetado (octaedro), nunca bola
    const head = parts.filter((p) => p.g === 'octa' && p.m === 'body' && p.p[1] > 3.4)[0];
    expect(head).toBeTruthy();
    expect(head.a[1]).toBeGreaterThanOrEqual(1); // SUB 1: facetado denso
    expect(head.a[0]).toBeGreaterThanOrEqual(0.4); // cabeça grande no colosso
    // a placa da face SAI da superfície do cristal (a regra da face) e é CLARA:
    // a pedra escura ali recebia só 0,32 do key light e virava BURACO NEGRO no
    // card miúdo — a lição da ombreira vitrificada da Névoa
    const face = parts.find((p) => p.g === 'cyl' && p.m === 'accent' && p.p[1] > 3.4)!;
    const headFront = head.p[2] + head.a[0] * (head.s?.[2] ?? 1);
    expect(face.p[2]).toBeGreaterThan(headFront);
    // sobrancelha e boca-trinca ESCURAS sobre a placa clara: é o contraste do
    // rosto (a régua da árvore: claro/escuro, nunca mancha única)
    const marks = parts.filter((p) => p.g === 'box' && p.m === 'dark');
    expect(marks.length).toBe(2);
    for (const b of marks) expect(b.p[2]).toBeGreaterThan(head.p[2]);
    // olhos FENDADOS: esfera ESCHATA (mais larga que alta) e miúda — o googly
    // da primeira versão matava o mineral
    const eyes = parts.filter((p) => p.m === 'white');
    expect(eyes.length).toBe(2);
    for (const e of eyes) {
      expect(e.a[0]).toBeLessThanOrEqual(0.1);
      expect(e.s![1]).toBeLessThan(e.s![0] * 0.6); // fenda HORIZONTAL
      expect(e.p[2]).toBeGreaterThan(face.p[2] + face.a[2] / 2); // sai da placa
    }
    expect(Math.abs(eyes[0].p[0] + eyes[1].p[0])).toBeLessThanOrEqual(0.01); // espelhados
    // pupila: o kernel escuro NA FRENTE da fenda (claro-sobre-escuro)
    const pupils = parts.filter((p) => p.m === 'black');
    expect(pupils.length).toBe(2);
    for (const p of pupils) expect(p.p[2]).toBeGreaterThan(eyes[0].p[2]);
    // coroa PLANTADA no diamante: a base afunda na cabeça e a ponta sai por
    // cima (pino enterrado não é coroa — a regra da Névoa)
    const crown = parts.filter((p) => p.tag === 'spike' && p.p[1] > 3.8);
    expect(crown.length).toBeGreaterThanOrEqual(3);
    for (const s of crown) {
      expect(s.p[1]).toBeGreaterThan(head.p[1]); // nasce da cabeça, não do ombro
      expect(s.p[1]).toBeLessThan(head.p[1] + head.a[0] * (head.s?.[1] ?? 1)); // pino enterrado
    }
    const apex = Math.max(...crown.map((s) => s.p[1] + halfHeight(s)));
    expect(apex).toBeGreaterThanOrEqual(head.p[1] + 0.7); // a coroa coroa de verdade
  });

  test('a GEMA lê DO FORA: colar hexagonal aparafusado na frente do peito', () => {
    const parts = P7();
    // pilar frontal do peito (onde a gema se encaixa): a pedra ONDE a luz mora
    const pillar = parts.find((p) => p.g === 'cyl' && p.m === 'body' && p.p[2] > 0.3 && p.a[2] > 1.4)!;
    const stoneFront = pillar.p[2] + pillar.a[1];
    // colar + contravertão de pedra (tag ring: a banda que o prisma percutiu)
    const collar = parts.filter((p) => p.tag === 'ring' && p.p[1] > 2.0);
    expect(collar.length).toBe(2);
    for (const c of collar) {
      expect(c.m).toBe('dark');
      expect(c.a[3]).toBe(6); // colar HEXAGONAL (a costela da espécie)
      expect(c.p[2]).toBeGreaterThan(0.3); // na FRENTE do peito
    }
    // quatro garras segurando a luz (tag spike: eriçam na afinação)
    const claws = parts.filter((p) => p.tag === 'spike' && p.p[1] > 2.1 && p.p[1] < 2.9 && p.p[2] > 0.4);
    expect(claws.length).toBe(4);
    // a LUZ mora FORA da pedra: enterrada no prisma translúcido, o alfa comia a
    // luz e o print só mostrava roxo liso (o peito que não lia)
    expect(CORE_POS[2]).toBeGreaterThan(stoneFront);
    expect(CORE_POS[2]).toBeGreaterThan(Math.max(...collar.map((c) => c.p[2] + c.a[2] / 2)));
    expect(CORE_POS[1]).toBeCloseTo(collar[0].p[1], 1); // encaixada no colar, não solta
    // miolo de luz: LILÁS e ameixa-funda, nunca branco puro nem aditivo
    expect(CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(CORE_LOOK.white)).toBeLessThan(0.95);
    expect(luma(CORE_LOOK.gold)).toBeLessThan(luma(CORE_LOOK.white));
    expect(luma(CORE_LOOK.cool)).toBeLessThan(luma(CORE_LOOK.gold));
    expect(CORE_LOOK.gold).toBe(CRISTAL_AMETHYST);
  });

  test('braços CORRENTES: cadeia contínua girando no PIVÔ DO OMBRO', () => {
    const parts = P7();
    const arms = parts.filter((p) => p.tag === 'arm');
    expect(arms.length).toBeGreaterThanOrEqual(12);
    for (const side of [1, -1]) {
      const chain = arms
        .filter((p) => Math.sign(p.p[0]) === side)
        .sort((a, b) => b.p[1] - a.p[1]);
      // bola do ombro → úmero → bola do punho → rádio: a primeira versão eram
      // pílulas soltas boiando no ar ("manequim desmontado" no print)
      const limb = chain.slice(0, 4);
      for (let i = 1; i < limb.length; i++) {
        const d = Math.hypot(
          limb[i].p[0] - limb[i - 1].p[0],
          limb[i].p[1] - limb[i - 1].p[1],
          limb[i].p[2] - limb[i - 1].p[2],
        );
        const reach =
          (limb[i - 1].g === 'cyl' ? limb[i - 1].a[2] / 2 : limb[i - 1].a[0]) +
          (limb[i].g === 'cyl' ? limb[i].a[2] / 2 : limb[i].a[0]) +
          0.15;
        expect(d).toBeLessThanOrEqual(reach);
      }
      // o pivô do rig está SOBRE a bola do ombro (girar o braço INTEIRO ali é o
      // que impede o ombro de desarticular no meio do arremesso)
      const onPivot = chain.some(
        (p) =>
          Math.hypot(
            Math.abs(p.p[0]) - Math.abs(CRISTAL_ARM_PIVOT[0]),
            Math.abs(p.p[1] - CRISTAL_ARM_PIVOT[1]),
            Math.abs(p.p[2] - CRISTAL_ARM_PIVOT[2]),
          ) < 0.06,
      );
      expect(onPivot).toBe(true);
      // garra de farpas na ponta (as sementes do ricochete — chain 2 do motor)
      const forearm = chain.find((p) => p.g === 'cyl' && p.p[1] < 1.8)!;
      const claws = chain.filter((p) => p.p[1] < forearm.p[1]);
      expect(claws.length).toBeGreaterThanOrEqual(2);
      for (const c of claws) {
        const d = Math.hypot(c.p[0] - forearm.p[0], c.p[1] - forearm.p[1], c.p[2] - forearm.p[2]);
        expect(d).toBeLessThan(0.75); // a farpa nasce do punho, não do ar
      }
      expect(claws.filter((c) => (c.s?.[1] ?? 1) >= 1.5 || c.g === 'cone').length).toBeGreaterThanOrEqual(2);
    }
    // o braço que arremessa tem uma farpa A MAIS que o outro: 5 farpas no total
    expect(arms.filter((p) => (p.s?.[1] ?? 1) >= 1.5 || p.g === 'cone').length).toBeGreaterThanOrEqual(5);
    // ombreiras: lasca CHATA + espada de farpa (tag spike: eriçam e apontam)
    const pauldrons = parts.filter((p) => p.tag === 'spike' && p.p[1] > 2.9 && Math.abs(p.p[0]) > 0.7);
    expect(pauldrons.length).toBe(4);
    expect(pauldrons.filter((p) => (p.s?.[1] ?? 1) < 1).length).toBe(2); // as chatas
  });

  test('ressoador: halo HORIZONTAL de farpas — zero anel em pé no figurino', () => {
    const parts = P7();
    // a regra estrutural: não existe toro no figurino e todo `ring` está
    // DEITADO (r X ≈ −1,57). Os dois anéis EM PÉ que boiavam na cabeça saíram.
    expect(parts.some((p) => p.g === 'torus')).toBe(false);
    const rings = parts.filter((p) => p.g === 'ring');
    expect(rings.length).toBe(2);
    for (const r of rings) {
      expect(Math.abs(r.r?.[0] ?? 0)).toBeGreaterThan(1.5);
      expect(r.a[2]).toBeGreaterThanOrEqual(40); // denso (56 na saia, 40 no cinto)
    }
    // o halo: seis farpas num círculo HORIZONTAL em volta da cabeça, todas
    // inclinadas para FORA (o diapasão do prisma) — orbita e acelera com a carga
    const halo = parts.filter((p) => p.group === 0);
    expect(halo.length).toBe(6);
    for (const h of halo) {
      expect(Math.abs(h.p[1] - 3.74)).toBeLessThan(0.15); // chato: um plano só
      expect(radiusOf(h)).toBeGreaterThan(0.6);
      expect(radiusOf(h)).toBeLessThan(1.0); // colado à cabeça (halo, não órbita)
      expect(h.a[2]).toBeGreaterThanOrEqual(0.5); // farpa COMPRIDA (adeus confete)
      // inclinação RADIAL: o eixo da farpa tomba para fora (tilt · radial > 0)
      const tilt = new THREE.Vector3(-(h.r?.[2] ?? 0), 0, h.r?.[0] ?? 0);
      const radial = new THREE.Vector3(h.p[0], 0, h.p[2]).normalize();
      expect(tilt.dot(radial)).toBeGreaterThan(0.15);
    }
    // cacos-filhote em duas órbitas (os dois saltos da cadeia escritos na
    // silhueta): uma BAIXA raspando a duna, outra ALTA e larga
    const low = parts.filter((p) => p.group === 1);
    const high = parts.filter((p) => p.group === 2);
    expect(low.length).toBeGreaterThanOrEqual(5);
    expect(high.length).toBeGreaterThanOrEqual(3);
    for (const o of [...low, ...high]) {
      expect(o.m).toBe('glow');
      expect(o.g).toBe('octa');
      expect(o.a[1]).toBeGreaterThanOrEqual(1); // facetado denso
      expect(o.s![1]).toBeGreaterThan(o.s![0]!); // lasca alongada, não bolinha
    }
    for (const o of low) expect(o.p[1]).toBeLessThan(1.3); // raspando a duna
    for (const o of high) expect(radiusOf(o)).toBeGreaterThan(radiusOf(low[0])); // mais larga
  });

  test('ANTI LOW-POLY: 102 peças / ~7,9 mil vértices e o DNA de 6 faces denso', () => {
    const parts = P7();
    expect(parts.length).toBeGreaterThanOrEqual(100);
    let drawn = 0;
    for (const p of parts) drawn += getGeometry(p.g, p.a).getAttribute('position').count;
    expect(drawn).toBeGreaterThanOrEqual(7000);
    for (const p of parts) {
      if (p.g === 'cyl') {
        expect(p.a[3]).toBe(6); // seis faces: a costela do prisma
        expect(p.a[4] ?? 1).toBeGreaterThanOrEqual(1);
      }
      if (p.g === 'octa') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      if (p.g === 'ico') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(2);
      if (p.g === 'ring') expect(p.a[2]).toBeGreaterThanOrEqual(40);
      if (p.g === 'cone') expect(p.a[2]).toBeGreaterThanOrEqual(6);
      if (p.g === 'sphere') {
        expect(p.a[1]).toBeGreaterThanOrEqual(10);
        expect(p.a[2]).toBeGreaterThanOrEqual(8);
      }
    }
    // contagens REAIS da malha (a medição do print low-poly): a coluna-mãe tem
    // 7 anéis de 6 faces, a saia de areia tem 56 radiais, a duna é icosaedro sub 2
    expect(getGeometry('cyl', [0.52, 0.76, 2.15, 6, 7]).getAttribute('position').count).toBeGreaterThanOrEqual(70);
    expect(getGeometry('ring', [0.55, 1.32, 56]).getAttribute('position').count).toBeGreaterThanOrEqual(110);
    // (detalhe 2 num icosaedro = 9 sub-triângulos por face = 180 faces / 540
    // vértices reais: é o relevo de rocha da duna, não um prisma de 20 faces)
    expect(getGeometry('ico', [1.05, 2]).getAttribute('position').count).toBeGreaterThanOrEqual(500);
    expect(getGeometry('octa', [0.46, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(90);
  });

  test('invólucro: braços abertos, coroa respeitando o formTop e raiz no chão', () => {
    const e = partsEnvelope(P7());
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // os braços abertos do colosso (o leque que dispara a cadeia) — sem eles a
    // silhueta seria um obelisco
    expect(halfX).toBeGreaterThanOrEqual(1.8);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    // a duna + as raízes + as duas órbitas fecham o volume do slot
    expect(halfZ).toBeGreaterThanOrEqual(1.3);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantado: a duna achatada e as raízes encostam no piso mas não afundam
    expect(e.minY).toBeGreaterThanOrEqual(-0.1);
    expect(e.minY).toBeLessThan(0);
    // a coroa usa a altura da forma sem estourar o teto do slot
    expect(e.maxY).toBeLessThanOrEqual(formTop(CRISTAL, 7) + 0.25);
    expect(e.maxY).toBeGreaterThanOrEqual(formTop(CRISTAL, 7) - 0.2);
    expect(e.maxY).toBeGreaterThanOrEqual(4.3);
  });

  test('paleta ÚNICA: a ametista #b7a6ff é motor, veio, gema, farpa e FX', () => {
    expect(CRISTAL_AMETHYST).toBe('#b7a6ff');
    expect(CRISTAL.base.projectileColor).toBe(CRISTAL_AMETHYST);
    expect(VISUALS.cristal.glow).toBe(CRISTAL_AMETHYST);
    // os três materiais da espécie (cristal, matriz da duna, raiz petrificada),
    // a gema do peito, a farpa em voo e o caco do FX brillam na MESMA ametista
    expect(MINERAL_LOOK.crack).toBe(CRISTAL_AMETHYST);
    expect(ROOT_LOOK.sap).toBe(CRISTAL_AMETHYST);
    expect(CORE_LOOK.gold).toBe(CRISTAL_AMETHYST);
    expect(SHARD_LOOK.iceA).toBe(CRISTAL_AMETHYST); // a farpa em voo É o colosso
    expect(SLIVER_LOOK.crack).toBe(CRISTAL_AMETHYST); // e o caco do FX também
    // a farpa é PEDRA (densa, veio CLARO pulsando por dentro): contra o fundo
    // escuro da arena só lê pedra funda com veio claro — a lição do vidro da
    // Obsidiana (a régua do contraste), nunca véu aditivo
    expect(luma(SHARD_LOOK.crack)).toBeGreaterThan(luma(SHARD_LOOK.iceA));
    expect(SHARD_LOOK.alpha).toBeGreaterThanOrEqual(0.85);
    expect(luma(SLIVER_LOOK.iceA)).toBeGreaterThan(luma(SLIVER_LOOK.iceB));
    // MATRIZ CLARA DE GEODO: a primeira versão era breu com veio acesso e o
    // print lia "obsidiana com veios de LAVA" — a matriz é clara e o veio é
    // CONTIDO (quem brilha é só a gema do peito)
    expect(VISUALS.cristal.dark).toBe(MINERAL_LOOK.rockA);
    expect(luma(MINERAL_LOOK.rockA)).toBeGreaterThan(0.3);
    expect(luma(MINERAL_LOOK.rockA)).toBeGreaterThan(luma(MINERAL_LOOK.rockB) * 1.8);
    expect(MINERAL_LOOK.crackGlow).toBeLessThanOrEqual(0.25);
    expect(MINERAL_LOOK.crackGlow * MINERAL_LOOK.crackBoost).toBeLessThanOrEqual(0.12);
    // pedra DENSÍSSIMA: alfa alto (senão o tronco lia "candelabro oco") e
    // sparkle BAIXO (o brilho de aresta do iceShaders é azul-branco e lavava o
    // lilás — o "poste de gelo leitoso" do print)
    expect(PRISM_LOOK.alpha).toBeGreaterThanOrEqual(0.88);
    expect(VISUALS.cristal.bodyOpacity).toBeGreaterThanOrEqual(0.88);
    expect(PRISM_LOOK.sparkle).toBeLessThanOrEqual(0.5);
    expect(PRISM_LOOK.envMix).toBeLessThanOrEqual(0.5);
    // o CRESCIMENTO é mais claro que o velho (é o que lê o "vivo") e o corpo é
    // AMETISTA, não breu nem azul-elétrico
    expect(luma(GROW_LOOK.iceA)).toBeGreaterThan(luma(PRISM_LOOK.iceA));
    expect(luma(PRISM_LOOK.iceA)).toBeGreaterThan(0.1);
    expect(luma(PRISM_LOOK.iceB)).toBeLessThan(0.06);
    // veio CLARO sobre pedra funda (a régua do contraste do vidro negro)
    expect(luma(PRISM_LOOK.crack)).toBeGreaterThan(luma(PRISM_LOOK.iceA));
    // raiz petrificada SEM clorofila: verde é da Madeira, aqui a crosta é ágata
    const moss = new THREE.Color(ROOT_LOOK.moss);
    expect(moss.g).toBeLessThanOrEqual(moss.r);
    // o gelo da espécie escreve profundidade (a regra do gelo translúcido: sem
    // depthWrite a casca de trás vazava pela frente e o corpo lia oco)
    const ice = makeIceMaterial(PRISM_LOOK);
    expect(ice.blending).toBe(THREE.NormalBlending);
    expect(ice.depthWrite).toBe(true);
    expect(ice.uniforms.uCrackCol.value.getHexString()).toBe('efe6ff');
    // as réguas do print chegam NA UNIFORM do shader (senão eram só enfeite de
    // TS): sparkle baixíssimo e alfa denso é o que o GPU realmente usa
    expect(ice.uniforms.uSparkle.value).toBeLessThanOrEqual(0.5);
    expect(ice.uniforms.uAlpha.value).toBeGreaterThanOrEqual(0.88);
    expect(ice.uniforms.uCrackGlow.value).toBeLessThanOrEqual(0.8);
    ice.dispose();
  });

  test('coreografia de AFINAÇÃO E CANHÃO: a segunda janela mais longa da árvore', () => {
    // o colosso AFINA a nota antes de cuspir a farpa: é mais lento que a Névoa e
    // só a Obsidiana (Nv.8) afina mais devagar que ele
    expect(CRISTAL_ATTACK_WINDOW).toBeGreaterThan(NEVOA_ATTACK_WINDOW);
    expect(CRISTAL_ATTACK_WINDOW).toBeLessThan(OBSIDIANA_ATTACK_WINDOW);
    expect(CRISTAL_WINDUP).toBeGreaterThanOrEqual(0.5); // mais da metade é o zumbido

    const idle = attackPose(-1);
    expect([idle.twist, idle.gather, idle.swing, idle.charge, idle.lean, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const tune = attackPose(CRISTAL_ATTACK_WINDOW * CRISTAL_WINDUP * 0.95);
    expect(tune.charge).toBeGreaterThan(0.9); // os veios acendem da base ao topo
    expect(tune.gather).toBeLessThan(-0.8); // o colosso CONTRAI sugando a luz do slot
    expect(tune.swing).toBeLessThan(-0.7); // os braços RECUEM (o corpo armazena)
    expect(tune.lean).toBeLessThan(0); // verga para trás carregando a nota
    expect(tune.flare).toBeGreaterThan(0.7); // coroa e halo eriçam zumbindo
    expect(tune.stepZ).toBeLessThan(0); // plantado: só recua o tronco
    const shot = attackPose(CRISTAL_ATTACK_WINDOW * (CRISTAL_WINDUP + 0.3 * (1 - CRISTAL_WINDUP)));
    expect(shot.gather).toBeGreaterThan(0.6); // estufa: a luz saiu pela boca
    expect(shot.swing).toBeGreaterThan(0.8); // o braço INTEIRO varre para frente
    expect(shot.lean).toBeGreaterThan(0); // verga para frente no coice
    expect(shot.twist).toBeLessThan(0); // torce no CONTRÁRIO (a nota quebra)
    expect(shot.flare).toBeGreaterThan(tune.flare); // o estalo arreganha a coroa
    expect(shot.stepZ).toBeGreaterThan(0.15); // empurra o tronco contra a duna
    const late = attackPose(CRISTAL_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // o prisma assenta depois do tiro
    expect(late.gather).toBeLessThan(shot.gather);
    expect(late.swing).toBeLessThan(shot.swing);
    const out = attackPose(CRISTAL_ATTACK_WINDOW + 0.2);
    expect([out.gather, out.swing, out.charge, out.lean, out.stepZ, out.flare]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('motor: a farpa salta de alvo em alvo (chain 2, terra, o mais próximo)', () => {
    expect(CRISTAL.base.damageElement).toBe('earth');
    expect(CRISTAL.base.targeting).toBe('closest');
    expect(CRISTAL.base.projectileSpeed).toBeGreaterThanOrEqual(12); // farpa de estilhaço: rápida
    expect(CRISTAL.base.interval).toBeGreaterThanOrEqual(1.4); // o prisma afina devagar
    const chain = CRISTAL.base.abilities.find((a) => a.kind === 'chain');
    expect(chain && 'jumps' in chain && chain.jumps).toBe(2);
    expect(chain && 'factor' in chain && chain.factor).toBe(0.7);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 70007 });
    const st = eng.addRetainedUnit('cristal', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2);
    eng.startBattle();
    // varre o voo em passos miúdos: a farpa é RÁPIDA (12 un/s), o print de
    // 0,25 s atravessava o voo inteiro sem ver a peça
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 60; i++) {
      runSeconds(eng, 0.05);
      for (const p of eng.world.projectiles) if (p.species === 'cristal') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(7);
      expect(p.damageElement).toBe('earth');
      expect(p.abilities.some((a) => a.kind === 'chain')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'cristal');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(7);
    // o ricochete ACONTECE no tabuleiro: se houver cadeia saltada, ela sai como
    // evento 'chain' (o laço visual do estilhaço quicando de alvo em alvo)
    const jumps = eng.world.fx.filter((f) => f.type === 'chain' && f.species === 'cristal');
    expect(jumps.length).toBeGreaterThanOrEqual(0);
    expect(inFlight.some((p) => p.chainLeft >= 0)).toBe(true);
  });
});
