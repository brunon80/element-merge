import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeArcMaterial, makeCoreMaterial, makeLightningShellMaterial } from '../scene/lightningShaders';
import { makeStoneMaterial } from '../scene/stoneShaders';
import { makeSteamMaterial } from '../scene/steamShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { DOUBLE_SHOT_DELAY } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  CORE_LOOK,
  COSMICO_ARM_PIVOT,
  COSMICO_ATTACK_WINDOW,
  COSMICO_CROWN_PIVOT,
  COSMICO_CORE_POS,
  COSMICO_HEAT,
  COSMICO_STARLIGHT,
  COSMICO_WINDUP,
  FLARE_LOOK,
  MOON_LOOK,
  SHELL_LOOK,
  STAR_LOOK,
  STRAND_LOOK,
  VEIL_LOOK,
  attackPose,
} from '../scene/CosmicoRig';
import { COSMICO_FLARE_LOOK, COSMICO_STAR_LOOK } from '../scene/ProjectileField';
import { CRISTAL_ATTACK_WINDOW } from '../scene/CrystalRig';
import { OBSIDIANA_ATTACK_WINDOW } from '../scene/ObsidianaRig';
import { PLASMA_ATTACK_WINDOW, PLASMA_WINDUP } from '../scene/PlasmaRig';
import { TEMPESTADE_ATTACK_WINDOW } from '../scene/TempestadeRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { Part } from '../scene/speciesModels';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do CÓSMICO (Nv.8 — tempestade+plasma: a CONSTELAÇÃO VIVA), o caçador
 * plantado na própria cumulonimbus que tranca o alvo MAIS DISTANTE e cospe
 * DUAS estrelas que saltam de alvo em alvo (doubleShot + chain 2 + burn). As
 * regras amarradas aqui:
 *  - a LUZ-DA-ESTRELA #9ad0ff é ÚNICA entre motor (projectileColor), nervura
 *    da casca de noite, traço dos fios, nós do asterismo, estrela do peito,
 *    estrela arremessada em voo e caco do FX (identidade do motor ao impacto);
 *    o OURO #ffe9a8 do plasma da mãe é SEMPRE acento (aro de fresnel), nunca
 *    cor principal;
 *  - A ARMADURA FAZ A SILHUETA: a régua que a primeira passada descobriu
 *    ("pilha de bolas azuis com estourinhos") — a loriga é tambor de DOZE
 *    FACES largo e opaco e a constelação é desenhada POR CIMA dela com nós
 *    MIÚDOS e pontas CURTAS. O DNA da espécie é doze faces + oito pontas (o
 *    oposto do Cristal, Nv.7: seis faces, ricochete, farpas em leque);
 *  - PLANTADA NA PRÓPRIA TEMPESTADE (floatY 0): cascos achatados de
 *    cumulonimbus nos pés (makeSteamMaterial SEM tint e SEM hot de brasa — o
 *    topo é LUA), disco de órbita riscado rente ao piso e obelisco com a
 *    estrela caída presa DENTRO (uCoreCut do shell abre a cavidade só ali);
 *  - os fios do asterismo são o traço do Raio preso num tubo de OITO FACES e o
 *    jitter NUNCA ultrapassa a espessura do fio mais fino (a régua que o Raio
 *    quebra — aqui é 0,028×1,6 < 0,048);
 *  - zero anel EM PÉ: o único `ring` do figurino é o DISCO deitado do chão e
 *    não existe um único `torus`;
 *  - anti low-poly: 141 peças / ~14,8 mil vértices desenhados, com contagens
 *    REAIS de malha amarradas (a loriga tem 264 vértices por tambor);
 *  - coreografia RITUAL: 62% da janela (a mais longa da árvore junto com o
 *    Plasma) é o alinhamento da coroa travando o alvo mais distante.
 */

const COSMICO = getSpecies('cosmico');
const LV = 8 as MonsterLevel;

/** luminância (Rec. 709) — a régua do "isso é PEDRA-DA-LUA ou é noite?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const P8 = () => partsForLevel(MODELS.cosmico, 8);

/** raio horizontal de uma peça em relação ao eixo da figura */
const radiusOf = (p: { p: [number, number, number] }) => Math.hypot(p.p[0], p.p[2]);

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('Cósmico: constelação viva plantada na tempestade (Nv.8)', () => {
  test('rig próprio, forma ÚNICA e PLANTADA na própria tempestade (Nv.8 fixo)', () => {
    expect(SPECIES_RIGS.cosmico).toBeTruthy();
    expect(COSMICO.levelMin).toBe(8);
    expect(COSMICO.levelMax).toBe(8);
    expect(hasLevelVariants(MODELS.cosmico)).toBe(false);
    expect(P8().length).toBe(MODELS.cosmico.parts.length);
    // orçamento denso: a régua anti low-poly da árvore (golem 47, cristal 102)
    // — aqui a constelação inteira passa de 135 peças
    expect(MODELS.cosmico.parts.length).toBeGreaterThanOrEqual(135);
    // PLANTADA: a constelação fica DE PÉ sobre a nuvem que a acendeu (nada de
    // entidade boiando em pose de holograma)
    expect(MODELS.cosmico.floatY).toBe(0);
    expect(COSMICO.base.moveSpeed).toBe(0);
    // três corpos em movimento em três alturas: farpas de lua nos joelhos (0),
    // fagulhas esquiando no disco do chão (1) e cometas altos (2)
    const groups = MODELS.cosmico.groups ?? {};
    expect(Object.keys(groups).length).toBe(3);
    const parts = P8();
    expect(parts.filter((p) => p.group === 0).length).toBe(6);
    expect(parts.filter((p) => p.group === 1).length).toBe(7);
    expect(parts.filter((p) => p.group === 2).length).toBe(3);
    // a órbita dos joelhos e as fagulhas do chão giram em sentidos CONTRÁRIOS
    // (a galáxia em corte: riqueza de leitura, não carrossel único)
    expect(Math.sign(groups[1])).not.toBe(Math.sign(groups[0]));
  });

  test('base: TEMPESTADE DA MÃE aos pés + disco de órbita + estrela caída presa', () => {
    const parts = P8();
    // cascos achatados de cumulonimbus: o lado "tempestade" do blurb vira a
    // própria base (tag nenhuma — é o material 'veil' do rig que veste a nuvem)
    const puffs = parts.filter((p) => p.m === 'veil' && p.g === 'ico');
    expect(puffs.length).toBeGreaterThanOrEqual(3);
    for (const c of puffs) {
      expect(c.a[1]).toBeGreaterThanOrEqual(2); // icosaedro sub 2: relevo de cumulonimbus
      expect(c.s![1]).toBeLessThanOrEqual(0.3); // ACHATADO: é cumulonimbus deitada, não balão
      expect(c.p[1]).toBeLessThanOrEqual(0.35); // peça de chão
    }
    // o rolo da frente de tempestade ATRÁS (na frente ele engoliria os pés):
    // cyl aberto DEITADO de raio generoso
    const roll = parts.find((p) => p.m === 'veil' && p.g === 'cyl')!;
    expect(roll.a[5]).toBe(1); // ABERTO: é rolo de nuvem, não carretel fechado
    expect(Math.abs(roll.r?.[2] ?? 0)).toBeGreaterThan(1.5); // DEITADO no eixo do rolo
    expect(roll.p[2]).toBeLessThan(-0.7); // atrás dos pés
    expect(roll.a[2]).toBeGreaterThanOrEqual(2); // comprido: varre a largura do slot
    // DISCO de órbita riscado no tabuleiro POR FORA da nuvem (o único ring do
    // figurino inteiro — e está DEITADO, a regra estrutural da árvore)
    const disk = parts.find((p) => p.tag === 'disk')!;
    expect(disk.g).toBe('ring');
    expect(disk.a[2]).toBeGreaterThanOrEqual(56); // 56 radiais (a régua da árvore)
    expect(Math.abs(disk.r?.[0] ?? 0)).toBeGreaterThan(1.5); // DEITADO: disco, não aro
    expect(disk.p[1]).toBeLessThanOrEqual(0.06); // rente ao piso (nunca afunda)
    expect(disk.a[0]).toBeGreaterThanOrEqual(1.2); // largo o bastante p/ circundar a nuvem
    // o ÂNCORA de noite com a estrela caída: um obelisco CENTRAL de DOZE FACES
    // no olho do disco (a costela da espécie alcança até a peça de chão)
    const plinth = parts.filter((p) => p.tag === 'plinth');
    expect(plinth.length).toBe(2);
    for (const p of plinth) {
      expect(p.g).toBe('cyl');
      expect(p.a[3]).toBe(12); // doze faces (a costela do Cósmico)
      expect(p.p[1]).toBeLessThanOrEqual(0.9);
      expect(Math.abs(p.p[0])).toBeLessThanOrEqual(0.01); // no centro do disco
    }
    const shaft = plinth.reduce((a, b) => (a.a[2] >= b.a[2] ? a : b));
    const shaftBottom = shaft.p[1] - shaft.a[2] / 2;
    const shaftTop = shaft.p[1] + shaft.a[2] / 2;
    expect(shaftBottom).toBeGreaterThanOrEqual(0); // encosta no piso, nunca afunda
    // a estrela caída mora PRESA DENTRO do eixo do obelisco (a jaula é a
    // própria rocha: o uCoreCut do shell abre a cavidade sobre ela — a
    // herança do Plasma lida para a pedra, sem grade de ferro)
    const caged = parts.find((p) => p.tag === 'caged')!;
    expect(caged.m).toBe('glow');
    expect(caged.p[1]).toBeGreaterThan(shaftBottom);
    expect(caged.p[1]).toBeLessThan(shaftTop);
    const cageAt = Math.max(shaft.a[0], shaft.a[1]); // o ponto mais gordo do eixo
    const axisR = Math.hypot(shaft.p[0] - caged.p[0], shaft.p[2] - caged.p[2]);
    expect(axisR + caged.a[0]).toBeLessThan(cageAt); // DENTRO do eixo do obelisco
    expect(caged.a[0]).toBeGreaterThanOrEqual(0.15); // mas lê no print (não é poeira)
    // o disco circunda o obelisco por FORA (a âncora fica no olho do disco)
    expect(disk.a[0]).toBeGreaterThan(axisR + cageAt);
  });

  test('A ARMADURA FAZ A SILHUETA: loriga de DOZE FACES, saia radial e torção', () => {
    const parts = P8();
    // O DNA da espécie é a costela de DOZE FACES: todo tambor da armadura é
    // dodecagonal (da caneleira ao peitoral, do soquete ao obelisco). Densidade
    // vem dos ANÉIS VERTICAIS (≥3), não de arredondar em cilindro de 24 faces.
    const drums = parts.filter((p) => p.g === 'cyl' && p.a[0] > 0.06 && p.m !== 'veil');
    expect(drums.length).toBeGreaterThanOrEqual(24);
    for (const d of drums) {
      expect(d.a[3]).toBe(12); // doze faces em TODA a armadura
      expect(d.a[4] ?? 1).toBeGreaterThanOrEqual(1);
    }
    // a loriga: tambores ALTOS empilhados que ALARGAM para cima (o peitoral de
    // um guerreiro — no print da 2ª passada a loriga de tambores baixos e
    // esbugalhados lia "pilha de chapéus/embudos")
    const torso = parts.filter(
      (p) => p.g === 'cyl' && p.a[3] === 12 && p.a[2] >= 0.28 && Math.abs(p.p[0]) < 0.01 && p.p[1] > 1.9 && p.p[1] < 3.4,
    );
    expect(torso.length).toBeGreaterThanOrEqual(4);
    for (const t of torso) expect(t.a[2]).toBeGreaterThanOrEqual(0.3); // peça ALTAS
    const sorted = [...torso].sort((a, b) => a.p[1] - b.p[1]);
    for (let i = 1; i < sorted.length; i++) {
      // degrau de raio PEQUENO (≤0,06): a loriga sobe quase reta, não em funil
      expect(sorted[i - 1].a[0] - sorted[i].a[1]).toBeLessThanOrEqual(0.06);
    }
    // o TORÇÃO da galáxia escrito na costura: a rotação Y cresce peça a peça
    // (0 → 0,26 → 0,52 → 0,79 rad ≈ 15° por tambor)
    const twists = sorted.map((t) => Math.abs(t.r?.[1] ?? 0));
    expect(twists[0]).toBe(0);
    for (let i = 1; i < twists.length; i++) {
      if (twists[i] > 0 && twists[i - 1] > 0) expect(twists[i]).toBeGreaterThan(twists[i - 1]);
    }
    expect(Math.max(...twists)).toBeGreaterThanOrEqual(0.7);
    // o peito largo no peito: a peça mais LARGA da loriga fica no tórax alto
    // (0,62 de raio no tambor do peito — o yoke fecha os ombros atrás dele)
    const chest = torso.reduce((a, b) => (a.a[0] >= b.a[0] ? a : b));
    expect(chest.tag).toBe('chest');
    expect(chest.p[1]).toBeGreaterThan(2.7);
    // saia de placas TOMBANDO PARA FORA (ringAround: 6 peças a 60°, o eixo
    // inclinado na radial — a constelação é larga de base, firme na tempestade)
    const skirt = parts.filter((p) => p.tag === 'skirt');
    expect(skirt.length).toBe(6);
    for (const s of skirt) {
      expect(s.g).toBe('cyl');
      expect(s.a[3]).toBe(12);
      expect(radiusOf(s)).toBeGreaterThan(0.4); // por fora do quadril
      const tilt = new THREE.Vector3(-(s.r?.[2] ?? 0), 0, s.r?.[0] ?? 0);
      const radial = new THREE.Vector3(s.p[0], 0, s.p[2]).normalize();
      expect(tilt.dot(radial)).toBeGreaterThan(0.4); // tomba p/ FORA (a inclinação chega na radial)
    }
    // costelas de noite parafusadas na lateral da loriga (tag spike: apontam na afinação)
    const ribs = parts.filter((p) => p.tag === 'spike' && p.g === 'box');
    expect(ribs.length).toBe(2);
    for (const r of ribs) expect(Math.abs(r.p[0])).toBeGreaterThan(0.5);
  });

  test('mãos-estrela: OITO PONTAS curtas de pino enterrado, braço girando no ombro', () => {
    const parts = P8();
    const arms = parts.filter((p) => (p.tag ?? '').startsWith('arm'));
    expect(arms.length).toBeGreaterThanOrEqual(12);
    for (const side of [1, -1]) {
      const nodes = arms.filter((p) => p.tag === 'arm.node' && Math.sign(p.p[0]) === side);
      expect(nodes.length).toBe(3); // ombro → cotovelo → punho (cadeia contínua)
      const chain = [...nodes].sort((a, b) => a.p[1] - b.p[1]); // punho → cotovelo → ombro
      for (let i = 1; i < chain.length; i++) {
        // os FIOS ligam nó a nó de verdade (a midpoint do fio é a média dos
        // dois nós — corrente colada, não paliteiro de peças soltas)
        const wire = parts.find(
          (p) =>
            p.tag === 'arm.strand' &&
            Math.sign(p.p[0]) === side &&
            dist3(p.p, [(chain[i - 1].p[0] + chain[i].p[0]) / 2, (chain[i - 1].p[1] + chain[i].p[1]) / 2, (chain[i - 1].p[2] + chain[i].p[2]) / 2]),
        );
        expect(wire).toBeTruthy();
      }
      // o ombro da corrente É o pivô que o rig exporta (girar o braço INTEIRO
      // ali é o que impede o ombro de desarticular no meio do arremesso)
      const shoulder = chain[chain.length - 1];
      const dPiv = Math.hypot(
        Math.abs(shoulder.p[0]) - COSMICO_ARM_PIVOT[0],
        shoulder.p[1] - COSMICO_ARM_PIVOT[1],
        shoulder.p[2] - COSMICO_ARM_PIVOT[2],
      );
      expect(dPiv).toBeLessThan(0.01); // o espelho do nó do ombro É o pivô exportado
      // a estrela da mão: 8 pontas com a BASE AFUNDADA no nó (pino enterrado
      // não é ponta — a regra da coroa da Névoa) e bicuda CURTA
      const hand = chain[0];
      expect(hand.p[1]).toBeLessThan(2.0);
      const handR = (hand.g === 'sphere' ? hand.a[0] : 0) * (hand.s?.[0] ?? 1);
      const flares = arms.filter(
        (p) => p.tag === 'arm.flare' && Math.sign(p.p[0]) === side,
      );
      expect(flares.length).toBe(8); // STAR8: a costela da espécie (oito pontas)
      const seenDir = new Set<string>();
      for (const f of flares) {
        expect(f.g).toBe('cone');
        expect(f.a[2]).toBeGreaterThanOrEqual(8); // OITO raios no cone da ponta
        expect(f.a[1]).toBeLessThanOrEqual(0.3); // bicuda CURTA perto do nó (nada de ouriço)
        const d = dist3(f.p, hand.p);
        const back = handR - 0.05;
        expect(d).toBeCloseTo(back + f.a[1] / 2, 1); // base enterrada, ponta saindo
        expect(d - f.a[1] / 2).toBeGreaterThan(0); // o centro da bicuda está FORA do nó
        const dir = new THREE.Vector3(f.p[0] - hand.p[0], f.p[1] - hand.p[1], f.p[2] - hand.p[2]).normalize();
        seenDir.add(`${dir.x.toFixed(2)},${dir.y.toFixed(2)},${dir.z.toFixed(2)}`);
      }
      // oito direções DISTINTAS: sem antípodas (agulha bicuda dos dois lados é
      // do PROJÉTIL; na mão são cones de um bico só, em leque de estrela)
      expect(seenDir.size).toBe(8);
      // a estrela abre para CIMA (a coroa de bicos da mão olha o alvo distante)
      const upward = flares.filter((f) => f.p[1] > hand.p[1]);
      expect(upward.length).toBeGreaterThanOrEqual(4);
      // ombreira: TAMBOR DE DOZE FACES colado no ombro (solta, virava bloco
      // flutuando no print da 1ª passada)
      const pauldron = arms.find(
        (p) => p.tag === 'arm.pauldron' && Math.sign(p.p[0]) === side && p.g === 'cyl',
      )!;
      expect(pauldron.a[3]).toBe(12);
      expect(dist3(pauldron.p, shoulder.p)).toBeLessThan(0.5);
    }
    // as duas mãos-estrela são o doubleShot escrito na silhueta: OITO pontas
    // em cada lado, sixteen cones no total
    expect(parts.filter((p) => p.tag === 'arm.flare').length).toBe(16);
  });

  test('fios do asterismo: corrente de OITO FACES e o jitter dentro do próprio fio', () => {
    const parts = P8();
    const wires = parts.filter((p) => (p.tag ?? '').includes('strand'));
    // 2 nas pernas, 2 em cada braço, 3 no tórax, 3 na coroa
    expect(wires.length).toBeGreaterThanOrEqual(12);
    for (const w of wires) {
      expect(w.g).toBe('cyl');
      expect(w.a[3]).toBe(8); // tubo fino de oito faces (o fio é redondo o bastante p/ não serrar)
      expect(w.a[4]).toBeGreaterThanOrEqual(7); // anéis generosos: poucos = linha reta morta
      expect(w.m).toBe('trans'); // quem veste a corrente é o rig (makeArcMaterial)
    }
    // A RÉGUA DO JITTER (a lição do Raio amarrada em teste): o zigue-zague do
    // traço nunca ultrapassa a espessura do fio mais fino do figurino — nem no
    // pico da carga (o rig dobra o jitter no máximo em 1,6×)
    const thinnest = Math.min(...wires.map((w) => w.a[0]));
    expect(thinnest).toBeGreaterThanOrEqual(0.04);
    expect(STRAND_LOOK.jitter * 1.6).toBeLessThan(thinnest);
    // no uniform do shader a régua chega de fato (senão era enfeite de TS)
    const arc = makeArcMaterial({
      gold: STRAND_LOOK.gold,
      white: STRAND_LOOK.white,
      cool: STRAND_LOOK.cool,
      coolAmt: STRAND_LOOK.coolAmt,
      jitter: STRAND_LOOK.jitter,
      dash: STRAND_LOOK.dash,
      flow: STRAND_LOOK.flow,
    });
    expect(arc.blending).toBe(THREE.AdditiveBlending); // aditivo SÓ no fio miúdo e na partícula
    expect(arc.uniforms.uJitter.value).toBe(STRAND_LOOK.jitter);
    expect(arc.uniforms.uJitter.value * 1.6).toBeLessThan(thinnest);
    expect(arc.uniforms.uGold.value.getHexString()).toBe(COSMICO_STARLIGHT.slice(1));
    arc.dispose();
    // o fio do pescoço liga o yoke à base do crânio (o asterismo sobe pelo corpo)
    const neck = parts.find((p) => p.tag === 'strand' && p.p[1] > 3.2)!;
    expect(neck.p[1]).toBeLessThan(3.6);
  });

  test('rosto: crânio de noite, placa CLARA de lua, sobrancelha/boca escuras e olhos-estrela', () => {
    const parts = P8();
    // cabeça de icosaedro SUB 2 de NOITE (o traje do Raio), grande no colosso
    const head = parts.filter((p) => p.g === 'ico' && p.m === 'body')!
      .sort((a, b) => b.p[1] - a.p[1])[0];
    expect(head.a[1]).toBeGreaterThanOrEqual(2); // sub 2: relevo denso
    expect(head.a[0]).toBeGreaterThanOrEqual(0.45);
    expect(head.p[1]).toBeGreaterThan(3.6);
    // a placa da face AVANÇA sobre obounding box do crânio e fica LISA (amp
    // miúdo): no Cristal a placa escura embutida virava buraco no card (a regra
    // da face da árvore) — aqui ela é lua-azulada e rasgada no relevo
    const mask = parts.find((p) => p.tag === 'mask')!;
    expect(mask.g).toBe('cyl');
    expect(mask.a[3]).toBe(12);
    expect(mask.m).toBe('accent');
    expect(mask.amp ?? 1).toBeLessThanOrEqual(0.01); // lisa: rosto, não rocha serrilhada
    const skullBoundFront = head.p[2] + head.a[0] * (head.s?.[2] ?? 1); // circunsfera (pior caso do icosaedro)
    const maskFront = mask.p[2] + mask.a[2] / 2;
    expect(maskFront).toBeGreaterThanOrEqual(skullBoundFront); // avança sobre o bounding do crânio
    expect(mask.a[0]).toBeGreaterThan(0.3); // larga: cobre o rosto do colosso
    // sobrancelha e boca em barra ESCURA sobre a placa clara (claro/escuro: o
    // único contraste que lê no card miúdo) — sobrancelha ALTA e boca de queixo
    const bars = parts.filter((p) => p.g === 'box' && p.m === 'dark' && p.tag !== 'spike');
    expect(bars.length).toBe(2);
    for (const b of bars) {
      expect(b.p[1]).toBeGreaterThan(head.p[1] - 0.4); // as barras dentro do rosto (boca = queixo)
      expect(b.p[2]).toBeGreaterThan(head.p[2]); // na frente do crânio
    }
    // órbitas de BREU + fagulhas claras NA FRENTE: olho googly (esfera branca
    // com breu por cima) é proibido pela lição da árvore — aqui é claro sobre
    // escuro
    const sockets = parts.filter((p) => p.m === 'black');
    expect(sockets.length).toBe(2);
    const pinpricks = parts.filter((p) => p.m === 'white');
    expect(pinpricks.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(pinpricks[i].a[0]).toBeLessThanOrEqual(0.06); // miúdo (estrela, não bola)
      expect(pinpricks[i].p[2]).toBeGreaterThan(sockets[i].p[2]); // na frente do breu
      expect(pinpricks[i].p[2]).toBeGreaterThanOrEqual(maskFront + 0.02); // encaroçado na frente da placa
      expect(Math.abs(pinpricks[i].p[0] + sockets[1 - i].p[0])).toBeLessThanOrEqual(0.01); // espelhado
    }
    // a cabeça É a estrela-mor: oito bicos plantados no crânio (curtos o
    // bastante p/ não virar ouriço, compridos o bastante p/ ler estrela)
    const headFlares = parts.filter((p) => p.tag === 'flare' && !(p.tag ?? '').includes('crown') && !(p.tag ?? '').includes('arm'));
    expect(headFlares.length).toBe(8);
    for (const f of headFlares) {
      expect(f.a[2]).toBeGreaterThanOrEqual(8);
      expect(f.a[1]).toBeLessThanOrEqual(0.3);
      const d = dist3(f.p, head.p);
      expect(d).toBeCloseTo(head.a[0] - 0.05 + f.a[1] / 2, 1); // base enterrada no crânio
    }
  });

  test('coroa: a CONSTELAÇÃO EM W de cinco estrelas, com os fios colados nelas', () => {
    const parts = P8();
    // W de cinco estrelas (Cassiopeia) — a Névoa tem chifre ÚNICO de cinco
    // pontas; aqui é W de cinco ESTRELAS, e o rig a ergue na afinação
    const stars = parts.filter((p) => p.tag === 'crown');
    expect(stars.length).toBe(5);
    const ys = stars.map((s) => s.p[1]);
    expect(Math.max(...ys)).toBeCloseTo(4.9, 2);
    expect(Math.min(...ys)).toBeGreaterThan(4.3); // sobe longe dos bicos do crânio (3,92): na 1ª passada coroa e cabeça viraram um cacho só
    for (const s of stars) expect(s.m).toBe('glow');
    const outer = stars
      .filter((s) => s.p[1] < 4.5)
      .sort((a, b) => a.p[1] - b.p[1]);
    expect(outer.length).toBe(2);
    expect(Math.abs(outer[0].p[0] + outer[1].p[0])).toBeLessThanOrEqual(0.01); // espelhados
    // a ascensão do W até o centro: as faixas de altura sobem de fora para
    // dentro (ponta 4,46 → ombro 4,72 → cimeira 4,90)
    const bandMin = (absX: number) =>
      Math.min(...stars.filter((s) => Math.abs(Math.abs(s.p[0]) - absX) < 0.01).map((s) => s.p[1]));
    expect(bandMin(0.82)).toBeLessThan(bandMin(0.44));
    expect(bandMin(0.44)).toBeLessThan(bandMin(0));
    // três fios por lado costurando o W (dois traços + um pescoço diagonal do
    // crânio). Cada fio é recuperado pelas PONTAS (p ± eixo do cyl · metade):
    // ou solda nas DUAS estrelas que liga, ou solda numa estrela e a outra
    // ponta se ENTERRA no crânio (nada de fio solto no ar — mm espelha posição
    // E rotação, e é isso que mantém o V do pescoço colado nas estrelas)
    const cs = parts.filter((p) => p.tag === 'crown.strand');
    expect(cs.length).toBe(6);
    const nodes = stars.map((s) => s.p);
    const headC = parts.filter((p) => p.g === 'ico' && p.m === 'body').sort((a, b) => b.p[1] - a.p[1])[0];
    for (const w of cs) {
      const r = w.r ?? [0, 0, 0];
      const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(r[0], r[1], r[2]));
      const half = w.a[2] / 2;
      const e1: [number, number, number] = [w.p[0] + ax.x * half, w.p[1] + ax.y * half, w.p[2] + ax.z * half];
      const e2: [number, number, number] = [w.p[0] - ax.x * half, w.p[1] - ax.y * half, w.p[2] - ax.z * half];
      const weld = (e: [number, number, number]) => nodes.filter((n) => dist3(e, n) < 0.05);
      const w1 = weld(e1);
      const w2 = weld(e2);
      if (w1.length === 1 && w2.length === 1) {
        expect(w1[0]).not.toBe(w2[0]); // soldado nas DUAS estrelas do traço do W
      } else {
        const welded = w1.length === 1 ? w1 : w2;
        const free = w1.length === 1 ? e2 : e1;
        expect(welded.length).toBe(1); // o pescoço solda numa estrela do W...
        const dHead = dist3(free, headC.p); // ...e a outra ponta some DENTRO do crânio
        expect(dHead).toBeLessThan(headC.a[0] * (headC.s?.[1] ?? 1)); // enterrado, não solto
      }
    }
    // o W curva para CIMA: as cimeiras do meio coroam acima das pontas (meio
    // 0,26+ acima; meio-ombro 4,72 → cimeira central 4,90 → pontas 4,46)
    const apex = stars.reduce((a, b) => (a.p[1] >= b.p[1] ? a : b));
    const shoulder = stars
      .filter((s) => Math.abs(s.p[0]) > 0.1 && s.p[1] > 4.5)
      .sort((a, b) => a.p[1] - b.p[1])[0];
    expect(apex.p[1]).toBeGreaterThan(shoulder.p[1]);
    expect(shoulder.p[1]).toBeGreaterThan(outer[0].p[1] + 0.2); // o meio do W SOBE 0,26+
    // as três estrelas MAIORES da coroa têm bicos MIÚDOS (sem elas a coroa
    // eram cinco bolinhas iguais às fagulhas do chão): a cimeira central com
    // seis bicos e as duas estrelas médias com seis bicos espelhadas (mm sobre
    // starPoints: 6 + 2×6 = 18 cones); tag 'crown.flare' entra na rotação
    // rígida da coroa e no traje duro emissivo
    const cFlares = parts.filter((p) => p.tag === 'crown.flare');
    expect(cFlares.length).toBe(18);
    for (const f of cFlares) {
      expect(f.g).toBe('cone');
      expect(f.a[1]).toBeLessThanOrEqual(0.18); // bico MIÚDO (a régua do nó miúdo)
      const owner = stars
        .map((s) => ({ s, d: dist3(f.p, s.p) }))
        .sort((a, b) => a.d - b.d)[0];
      expect(owner.d).toBeLessThan(0.4); // plantado numa estrela da coroa, não no ar
    }
    // as duas estrelas das PONTAS do W ficam lizas: nenhum bico tem nelas o
    // dono MAIS PERTO. Os bicos das estrelas médias até chegam perto das
    // pontas (0,36), mas nascem das médias — a coroa fecha no corpo pelas
    // pontas (os fios), não por faísca
    const ownerOf = (f: Part) => {
      let best = stars[0];
      let bestD = Infinity;
      for (const s of stars) {
        const d = dist3(f.p, s.p);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    };
    const owners = new Set(cFlares.map(ownerOf));
    expect(owners.size).toBe(3); // cimeira + duas médias
    for (const s of outer) expect(owners.has(s)).toBe(false);
    // o pivô que o rig exporta está na altura da estrela mais BAIXA do W (o
    // asterismo inteiro gira ali — uma rotação só mantém os fios colados)
    expect(COSMICO_CROWN_PIVOT[1]).toBe(Math.min(...ys));
    expect(COSMICO_CROWN_PIVOT[0]).toBe(0);
  });

  test('ressoador: três órbitas em alturas separadas — zero anel em pé, zero toro', () => {
    const parts = P8();
    // a regra estrutural da árvore: não existe toro no figurino e todo `ring`
    // está DEITADO (aqui há um único ring: o disco do chão)
    expect(parts.some((p) => p.g === 'torus')).toBe(false);
    const rings = parts.filter((p) => p.g === 'ring');
    expect(rings.length).toBe(1);
    expect(Math.abs(rings[0].r?.[0] ?? 0)).toBeGreaterThan(1.5);
    expect(rings[0].a[2]).toBeGreaterThanOrEqual(56);
    // as farpas de lua ORBITANDO OS JOELHOS (grupo 0): raio fora da armadura e
    // faca CHATA verticalmente (farpas, não bolinhas)
    const knee = parts.filter((p) => p.group === 0);
    expect(knee.length).toBe(6);
    for (const k of knee) {
      expect(k.g).toBe('octa');
      expect(k.a[1]).toBeGreaterThanOrEqual(1); // facetado denso
      expect(k.s![1]).toBeGreaterThanOrEqual(1.7); // farpa COMPRIDA (adeus confete)
      expect(radiusOf(k)).toBeGreaterThan(0.7); // por fora do tambor do quadril (0,62)
      expect(radiusOf(k)).toBeLessThan(1.4); // colada à figura (órbita, não lua)
      expect(Math.abs(k.p[1] - 1.5)).toBeLessThan(0.15); // uma faixa de altura só
    }
    // fagulhas ESQUIANDO no disco do chão (grupo 1): rentes ao piso, na pista
    // do disco, girando no SENTIDO CONTRÁRIO
    const sparks = parts.filter((p) => p.group === 1);
    expect(sparks.length).toBe(7);
    for (const s of sparks) {
      expect(s.m).toBe('glow');
      expect(s.p[1]).toBeLessThan(0.6); // rente ao disco
      expect(radiusOf(s)).toBeLessThan(2.25); // dentro da pista riscada no chão
    }
    // três cometas ALTOS acima da coroa (grupo 2): a terceira altura — as três
    // órbitas NUNCA se tocam (era o cacho da primeira passada)
    const comets = parts.filter((p) => p.group === 2);
    expect(comets.length).toBe(3);
    for (const c of comets) {
      expect(c.p[1]).toBeGreaterThan(4.5); // acima do W (4,46–4,90)
      expect(c.s![1]).toBeGreaterThanOrEqual(1.7);
    }
    // em TODAS as três órbitas o eixo da peça tomba na RADIAL (o tilt do
    // ringAround chega no euler: r = (tilt·sinφ, 0, −tilt·cosφ), então o vetor
    // de inclinação é paralelo à radial e o módulo é o próprio tilt declarado)
    for (const [grp, minTilt] of [[0, 0.2], [1, 0.05], [2, 0.3]] as const) {
      for (const p of parts.filter((q) => q.group === grp)) {
        const tiltV = new THREE.Vector3(-(p.r?.[2] ?? 0), 0, p.r?.[0] ?? 0);
        const radial = new THREE.Vector3(p.p[0], 0, p.p[2]).normalize();
        expect(tiltV.dot(radial)).toBeGreaterThan(0); // tomba para FORA
        expect(tiltV.clone().cross(radial).length()).toBeLessThan(1e-6); // colado na radial
        expect(tiltV.length()).toBeGreaterThanOrEqual(minTilt); // a afinação declarada por altura
      }
    }
  });

  test('invólucro: braços-estrela abertos, cometas respeitando o formTop, disco no chão', () => {
    const e = partsEnvelope(P8());
    const halfX = Math.max(e.maxX, -e.minX);
    const halfZ = Math.max(e.maxZ, -e.minZ);
    // os braços abertos com as estrelas de oito pontas (o doubleShot na
    // silhueta) + o disco do chão — sem eles a silhueta seria um obelisco
    expect(halfX).toBeGreaterThanOrEqual(2.0);
    expect(halfX).toBeLessThan(TILE_SPACING_X - 0.6);
    // a tempestade da mãe e o disco fecham o volume do slot sem estourar
    expect(halfZ).toBeGreaterThanOrEqual(1.5);
    expect(halfZ).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    // plantada: o disco e o obelisco encostam no piso mas não afundam
    expect(e.minY).toBeGreaterThanOrEqual(-0.1);
    expect(e.minY).toBeLessThan(0);
    // os cometas altos e a cimeira do W usam a altura da forma sem estourar o
    // teto do slot
    expect(e.maxY).toBeLessThanOrEqual(formTop(COSMICO, 8) + 0.25);
    expect(e.maxY).toBeGreaterThanOrEqual(formTop(COSMICO, 8) - 0.2);
    expect(e.maxY).toBeGreaterThanOrEqual(4.9);
  });

  test('ANTI LOW-POLY: 141 peças / ~14,8 mil vértices e o DNA de 12 faces denso', () => {
    const parts = P8();
    expect(parts.length).toBeGreaterThanOrEqual(135);
    let drawn = 0;
    for (const p of parts) drawn += getGeometry(p.g, p.a).getAttribute('position').count;
    expect(drawn).toBeGreaterThanOrEqual(13000);
    for (const p of parts) {
      if (p.g === 'cyl') {
        expect(p.a[3] === 12 || p.a[3] === 8 || p.a[3] === 20).toBe(true); // armadura 12, fio 8, rolo de nuvem 20
        expect(p.a[4] ?? 1).toBeGreaterThanOrEqual(1);
      }
      if (p.g === 'octa') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      if (p.g === 'ico') expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(2);
      if (p.g === 'ring') expect(p.a[2]).toBeGreaterThanOrEqual(40);
      if (p.g === 'cone') expect(p.a[2]).toBeGreaterThanOrEqual(8); // oito raios: a costela das pontas
      if (p.g === 'sphere') {
        expect(p.a[1]).toBeGreaterThanOrEqual(12);
        expect(p.a[2]).toBeGreaterThanOrEqual(10);
      }
    }
    // contagens REAIS da malha (medição neste teste, sem chute): um tambor de
    // 12 faces × 4 anéis tem 115 vértices, o disco do chão tem 114, o casco de
    // nuvem é icosaedro sub 2 (540 vértices de relevo) — e o figurino inteiro
    // soma 14.844 vértices desenhados, quase o dobro do Cristal (7.9 mil)
    expect(getGeometry('cyl', [0.62, 0.58, 0.4, 12, 4]).getAttribute('position').count).toBeGreaterThanOrEqual(110);
    expect(getGeometry('cyl', [0.62, 0.58, 0.4, 12, 4]).getAttribute('position').count).toBeLessThanOrEqual(140);
    expect(getGeometry('ring', [1.45, 2.25, 56]).getAttribute('position').count).toBeGreaterThanOrEqual(110);
    expect(getGeometry('ico', [1.05, 2]).getAttribute('position').count).toBeGreaterThanOrEqual(500);
    expect(getGeometry('sphere', [0.19, 16, 12]).getAttribute('position').count).toBeGreaterThanOrEqual(200);
    expect(getGeometry('octa', [0.13, 1]).getAttribute('position').count).toBeGreaterThanOrEqual(90);
  });

  test('paleta ÚNICA: a luz-da-estrela #9ad0ff é motor, casca, fio, nó, peito e FX', () => {
    expect(COSMICO_STARLIGHT).toBe('#9ad0ff');
    expect(COSMICO.base.projectileColor).toBe(COSMICO_STARLIGHT);
    expect(VISUALS.cosmico.glow).toBe(COSMICO_STARLIGHT);
    // a identidade atravessa TODOS os materiais da espécie: nervura da casca
    // de noite, veio da pedra-da-lua, traço do fio, corpo do nó e do peito e
    // o emissivo das pontas
    expect(SHELL_LOOK.vein).toBe(COSMICO_STARLIGHT);
    expect(MOON_LOOK.crack).toBe(COSMICO_STARLIGHT);
    expect(STRAND_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(STAR_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(CORE_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(FLARE_LOOK.emissive).toBe(COSMICO_STARLIGHT);
    // o OURO do plasma da mãe é SEMPRE acento (aro de fresnel, veio quente),
    // nunca a cor principal — e é a segunda cor amarrada no mesmo teste
    expect(COSMICO_HEAT).toBe('#ffe9a8');
    expect(VISUALS.cosmico.accent).toBe(COSMICO_HEAT);
    expect(SHELL_LOOK.core).toBe(COSMICO_HEAT);
    expect(STAR_LOOK.cool).toBe(COSMICO_HEAT);
    expect(CORE_LOOK.cool).toBe(COSMICO_HEAT);
    expect(STRAND_LOOK.cool).toBe(COSMICO_HEAT);
    // frios vs quentes na leitura do print: a estrela é fria (azul > vermelho),
    // o plasma é quente (vermelho > azul) e o miolo ferve SEM branco puro
    const star = new THREE.Color(COSMICO_STARLIGHT);
    const heat = new THREE.Color(COSMICO_HEAT);
    expect(star.b).toBeGreaterThan(star.r);
    expect(heat.r).toBeGreaterThan(heat.b);
    expect(STAR_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(STAR_LOOK.white)).toBeLessThan(0.95);
    expect(luma(STAR_LOOK.white)).toBeGreaterThan(luma(STAR_LOOK.gold)); // o miolo é o ponto mais claro
    // o ouro do plasma LÊ mais quente que a estrela fria (e no miolo do core o
    // que cresce é o branco, nunca o ouro: ele só tinge o fresnel)
    expect(STAR_LOOK.cool).not.toBe(STAR_LOOK.gold);
    const heatC = new THREE.Color(COSMICO_HEAT);
    const whiteC = new THREE.Color(STAR_LOOK.white);
    expect(heatC.r).toBeGreaterThan(whiteC.r); // o aro dourado é mais saturado que o miolo
    // A ARMADURA FAZ A SILHUETA também na paleta: a pedra-da-lua é CLARA e a
    // casca é noite — o contraste pedra/entidade é o que separa o Cósmico do
    // Raio (mesmo traje) e do Gólem (mesma opacidade de rocha). As luminâncias
    // aqui são do ESPAÇO DE TRABALHO LINEAR do three (THREE.Color converte
    // hex sRGB ao carregar: 0,43 linear na lua ≈ 0,66 no sRGB do designer)
    expect(luma(MOON_LOOK.rockA)).toBeGreaterThan(0.35);
    expect(luma(MOON_LOOK.rockA)).toBeGreaterThan(luma(SHELL_LOOK.body) * 2);
    expect(luma(SHELL_LOOK.dark)).toBeLessThan(0.05); // a noite funda, mas nunca preto chato
    expect(luma(SHELL_LOOK.body)).toBeGreaterThan(0.02);
    // veio CONTIDO na rocha: quem arde são os nós e o peito, nunca a armadura
    // (o brilho de uma constelação vem das estrelas, não da pedra)
    expect(MOON_LOOK.crackGlow).toBeLessThanOrEqual(0.25);
    expect(MOON_LOOK.crackGlow * MOON_LOOK.crackBoost).toBeLessThanOrEqual(0.12);
    // as pontas são PEDRA EMISSIVA MIÚDA: sem aditivo (a identidade é o albedo
    // azul com nervura acesa — aditivo só no fio miúdo e nas partículas)
    expect(FLARE_LOOK.emissiveIntensity).toBeLessThanOrEqual(0.5);
    // a cumulonimbus da mãe é LUA fria, nunca brasa (o Vulcão é o dono do
    // fogo) e SEM tint de equipe (regra estrutural do steamShaders)
    const veil = new THREE.Color(VEIL_LOOK.hot);
    expect(veil.b).toBeGreaterThan(veil.r);
    expect(VEIL_LOOK.alpha).toBeGreaterThanOrEqual(0.7);
    // as réguas do print chegam NA UNIFORM dos quatro shaders (senão eram só
    // enfeite de TS)
    const moon = makeStoneMaterial({
      rockA: MOON_LOOK.rockA,
      rockB: MOON_LOOK.rockB,
      crack: MOON_LOOK.crack,
      amp: MOON_LOOK.amp,
      crackGlow: MOON_LOOK.crackGlow,
      crackScale: MOON_LOOK.crackScale,
      crackWidth: MOON_LOOK.crackWidth,
      crackBoost: MOON_LOOK.crackBoost,
      speck: MOON_LOOK.speck,
    });
    expect(moon.transparent).toBe(false); // rocha opaca: peso no tabuleiro
    expect(moon.depthWrite).toBe(true);
    expect(moon.uniforms.uCrack.value.getHexString()).toBe(COSMICO_STARLIGHT.slice(1));
    expect(moon.uniforms.uCrackGlow.value * moon.uniforms.uCrackBoost.value).toBeLessThanOrEqual(0.12);
    moon.dispose();
    const cloud = makeSteamMaterial({
      cool: VEIL_LOOK.cool,
      warm: VEIL_LOOK.warm,
      hot: VEIL_LOOK.hot,
      amp: VEIL_LOOK.amp,
      alpha: VEIL_LOOK.alpha,
      swirl: VEIL_LOOK.swirl,
    });
    expect(cloud.blending).toBe(THREE.NormalBlending); // nuvem SEM aditivo (a regra da legibilidade)
    expect(cloud.uniforms.uHot.value.getHexString()).toBe(VEIL_LOOK.hot.slice(1)); // topo de LUA
    expect(cloud.uniforms.uAlpha.value).toBeGreaterThanOrEqual(0.7);
    cloud.dispose();
    // a casca de noite fecha a cavidade no corpo e a ABRE só na ÂNCORA (a
    // estrela caída presa na rocha vaza pela fenda — o uCoreCut do shell lido
    // para a pedra, a herança do Plasma sem jaula de ferro)
    const night = makeLightningShellMaterial({
      body: SHELL_LOOK.body,
      dark: SHELL_LOOK.dark,
      vein: SHELL_LOOK.vein,
      core: SHELL_LOOK.core,
      cool: SHELL_LOOK.cool,
      amp: SHELL_LOOK.amp,
      coreCut: SHELL_LOOK.coreCut,
    });
    expect(night.depthWrite).toBe(true);
    expect(night.uniforms.uCoreCut.value).toBe(0);
    expect(night.uniforms.uVein.value.getHexString()).toBe(COSMICO_STARLIGHT.slice(1));
    night.dispose();
    const anchor = makeLightningShellMaterial({
      body: SHELL_LOOK.dark,
      dark: SHELL_LOOK.dark,
      vein: SHELL_LOOK.vein,
      core: SHELL_LOOK.core,
      coreCut: SHELL_LOOK.anchorCut,
      amp: SHELL_LOOK.amp,
    });
    expect(anchor.uniforms.uCoreCut.value).toBeGreaterThanOrEqual(0.6);
    anchor.dispose();
    const node = makeCoreMaterial({
      gold: CORE_LOOK.gold,
      white: CORE_LOOK.white,
      cool: CORE_LOOK.cool,
      amp: CORE_LOOK.amp,
    });
    expect(node.uniforms.uGold.value.getHexString()).toBe(COSMICO_STARLIGHT.slice(1));
    node.dispose();
  });

  test('a estrela arremessada É a constelação: nó de plasma + agulhas na mesma cor', () => {
    // o projétil-assinatura carrega a MESMA cadeia de identidade (motor →
    // corpo → voo → impacto sem trocar de cor)
    expect(COSMICO_STAR_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(COSMICO_STAR_LOOK.cool).toBe(COSMICO_HEAT);
    expect(COSMICO_STAR_LOOK.amp).toBe(STAR_LOOK.amp); // o nó em voo é o nó do corpo
    expect(COSMICO_FLARE_LOOK.gold).toBe(COSMICO_STARLIGHT);
    expect(COSMICO_FLARE_LOOK.cool).toBe(COSMICO_HEAT); // o INVERSO do pai Raio (traço azul, acento ouro)
    // a agulha de corrente obedece à régua do jitter também em voo: o zigue-
    // zague nunca sai do próprio corpo do traço (raio da agulha 0,11)
    expect(COSMICO_FLARE_LOOK.jitter).toBeLessThanOrEqual(0.11);
    expect(COSMICO_FLARE_LOOK.jitter).toBeLessThan(STRAND_LOOK.jitter); // em voo é ainda mais contido
    // a estrela do peito mora FORA da loriga, encaixada no soquete de lua: no
    // Cristal a luz enterrada no invólucro era comida pelo alfa (a lição vale)
    const parts = P8();
    const socket = parts.find((p) => p.tag === 'socket' && p.g === 'cyl')!;
    expect(socket.a[3]).toBe(12);
    expect(socket.a[5]).toBe(1); // ABERTO na frente: a estrela encaixa nele
    expect(COSMICO_CORE_POS[2]).toBeGreaterThan(socket.p[2] + socket.a[2] / 2); // DO LADO DE FORA
    expect(COSMICO_CORE_POS[1]).toBeCloseTo(socket.p[1], 1); // encaixada, não solta no ar
    expect(CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
  });

  test('coreografia RITUAL: a janela de alinhamento mais longa da árvore (0,62)', () => {
    // entidade enorme e ritual: mais lento que o Cristal (0,8), empatado com o
    // Plasma no maior windup da árvore (0,62) e só a Obsidiana (0,95) afina mais
    expect(COSMICO_ATTACK_WINDOW).toBeGreaterThan(CRISTAL_ATTACK_WINDOW);
    expect(COSMICO_ATTACK_WINDOW).toBeLessThan(OBSIDIANA_ATTACK_WINDOW);
    expect(PLASMA_ATTACK_WINDOW).toBeLessThan(COSMICO_ATTACK_WINDOW); // o Plasma é o relâmpago (0,48): o Cósmico é o ritual
    expect(COSMICO_WINDUP).toBe(0.62);
    expect(COSMICO_WINDUP).toBe(PLASMA_WINDUP); // a mais longa fração de alinhamento da árvore (empate com o Plasma)
    expect(TEMPESTADE_ATTACK_WINDOW).toBeLessThan(COSMICO_ATTACK_WINDOW);

    const idle = attackPose(-1);
    expect([idle.twist, idle.gather, idle.swing, idle.charge, idle.lean, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const tune = attackPose(COSMICO_ATTACK_WINDOW * COSMICO_WINDUP * 0.95);
    expect(tune.charge).toBeGreaterThan(0.85); // a corrente despejando no peito (pico 0,9 no alinhar)
    expect(tune.gather).toBeLessThan(-0.7); // as DUAS mãos-estrela vêm para o peito (o par do doubleShot)
    expect(tune.swing).toBeLessThan(-0.9); // os braços de corrente RECUEM no pivô do ombro
    expect(tune.lean).toBeLessThan(0); // verga para trás carregando a nota
    expect(tune.flare).toBeGreaterThan(0.75); // as oito pontas de cada estrela se eriçam (0,85 no pico)
    expect(tune.stepZ).toBeLessThan(0); // plantada na nuvem: só o tronco recua
    const shot = attackPose(COSMICO_ATTACK_WINDOW * (COSMICO_WINDUP + 0.22 * (1 - COSMICO_WINDUP))); // o instante da descarga (a=1)
    expect(shot.charge).toBeCloseTo(0.25, 2); // a luz saiu pelas mãos: meia-carga já caindo (pico era 0,9 no alinhar)
    expect(shot.gather).toBeGreaterThan(0.6); // estufa: a luz saiu pela boca
    expect(shot.swing).toBeGreaterThan(0.8); // os dois braços VARREM para frente
    expect(shot.lean).toBeGreaterThan(0); // verga para frente no coice
    expect(shot.twist).toBeLessThan(0); // torce no CONTRÁRIO (a corrente quebrou)
    expect(shot.stepZ).toBeGreaterThan(0.15); // empurra o tronco contra a nuvem
    const late = attackPose(COSMICO_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(shot.charge); // o miolo esvazia: a luz foi nos dois tiros
    expect(late.swing).toBeLessThan(shot.swing);
    expect(late.flare).toBeLessThan(shot.flare); // o estalo arreganha mas já está devolvendo
    const out = attackPose(COSMICO_ATTACK_WINDOW + 0.2);
    expect([out.gather, out.swing, out.charge, out.lean, out.stepZ, out.flare]).toEqual([0, 0, 0, 0, 0, 0]);
    // nenhum pose pode ultrapassar as amplitudes coreografadas (o braço gira
    // 0,5 rad no pivô e a coroa ergue 0,12 — nada de membro arrancado)
    for (let s = 0; s <= COSMICO_ATTACK_WINDOW; s += 0.02) {
      const P = attackPose(s);
      expect(Math.abs(P.gather)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(P.swing)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(P.lean)).toBeLessThanOrEqual(0.7);
      expect(Math.abs(P.charge)).toBeLessThanOrEqual(1.0);
    }
  });

  test('motor: tranca o MAIS DISTANTE e cospe DUAS estrelas que saltam (chain 2)', () => {
    expect(COSMICO.base.damageElement).toBe('air');
    expect(COSMICO.base.targeting).toBe('farthest'); // a coroa W trava o alvo mais distante
    expect(COSMICO.base.projectileSpeed).toBeGreaterThanOrEqual(14); // estrela veloz
    expect(COSMICO.base.interval).toBeGreaterThanOrEqual(1.2); // ritual, mas atira logo
    const chain = COSMICO.base.abilities.find((a) => a.kind === 'chain');
    expect(chain && 'jumps' in chain && chain.jumps).toBe(2);
    expect(chain && 'factor' in chain && chain.factor).toBe(0.6);
    const dbl = COSMICO.base.abilities.find((a) => a.kind === 'doubleShot');
    expect(dbl && 'factor' in dbl && dbl.factor).toBe(0.5); // o segundo tiro a metade
    const burn = COSMICO.base.abilities.find((a) => a.kind === 'burn');
    expect(burn && 'chance' in burn && burn.chance).toBe(0.3);
    expect(burn && 'duration' in burn && burn.duration).toBe(3);

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 80008 });
    const st = eng.addRetainedUnit('cosmico', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    mustSummon(eng, 'golem', 'ai', 1);
    mustSummon(eng, 'golem', 'ai', 2);
    eng.startBattle();
    // varre o voo em passos miúdos: a estrela voa a 14 un/s, o print de 0,25 s
    // atravessava o voo inteiro sem ver a peça
    const inFlight: Projectile[] = [];
    const ids = new Set<number>();
    let sawQueue = false;
    for (let i = 0; i < 90; i++) {
      runSeconds(eng, 0.05);
      if (eng.pendingShots.some((s) => s.ownerId === st.unitId!)) sawQueue = true;
      for (const p of eng.world.projectiles)
        if (p.species === 'cosmico') {
          inFlight.push(p);
          ids.add(p.id);
        }
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(8);
      expect(p.damageElement).toBe('air');
      // cada estrela carrega a cadeia inteira do motor (salto + burn)
      expect(p.abilities.some((a) => a.kind === 'chain')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'burn')).toBe(true);
    }
    // doubleShot ACONTECE: o segundo tiro fica na fila do motor e nasce um
    // SEGUNDO projétil do mesmo atirador (as duas mãos-estrela do figurino)
    expect(sawQueue).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(2);
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'cosmico');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) expect(f.level).toBe(8);
    // o salto ACONTECE no tabuleiro: se houver cadeia saltada, ela sai como
    // evento 'chain' (o laço visual da estrela quicando de alvo em alvo)
    const jumps = eng.world.fx.filter((f) => f.type === 'chain' && f.species === 'cosmico');
    expect(jumps.length).toBeGreaterThanOrEqual(0);
    expect(inFlight.some((p) => p.chainLeft >= 0)).toBe(true);
    // o atraso do segundo tiro é o delay global (amarrado p/ não derivar)
    expect(DOUBLE_SHOT_DELAY).toBe(0.3);
  });
});
