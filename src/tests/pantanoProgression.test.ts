import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeWaterMaterial } from '../scene/waterShaders';
import { makeSteamMaterial } from '../scene/steamShaders';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  PANTANO_POISON,
  MUD_ROLE_LOOK,
  CRUST_LOOK,
  IRON_LOOK,
  ROOT_LOOK,
  GAS_LOOK,
  SCUM_LOOK,
  BILE_LOOK,
  PANTANO_ATTACK_WINDOW,
  PANTANO_WINDUP,
  attackPose,
} from '../scene/PantanoRig';
import { OBSIDIANA_ATTACK_WINDOW } from '../scene/ObsidianaRig';
import { TEMPESTADE_ATTACK_WINDOW } from '../scene/TempestadeRig';
import { VAPOR_ATTACK_WINDOW } from '../scene/VaporRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do PÂNTANO (Nv.7 — água+terra+fogo: a HIDRA DO LODO), o tanque venenoso
 * plantado da árvore: poça de lodo que cobre o slot, montículo que ferve, o
 * ancião da Madeira afogado (tronco + raízes + musgo), o caldeirão do Vapor
 * afogado com o caldo borbulhando e TRÊS PESCOÇOS de hidra que cuspem o globo
 * de lodo. Zero shader novo: lodo = waterShaders do brejo, crosta/ferro =
 * stoneShaders, raiz = woodShaders, gás/bolor = steamShaders, bile = plasma
 * do Raio em vitríolo. As regras amarradas aqui:
 *  - a paleta vitríolo (#a8cf4a) é ÚNICA entre motor, crosta, raiz, bile,
 *    projétil e FX (identidade do veneno);
 *  - lodo é OPACO, não-aditivo, com depthWrite — e a espuma (bolor) é contida
 *    (espuma branca em corpo escuro é sabão, não brejo);
 *  - gás e bolor NUNCA aceitam tint de equipe (o steamShaders nem tem uniform
 *    de tint — a amarra é estrutural);
 *  - blowout cortado: o branco do veneno nunca é #ffffff;
 *  - anti low-poly: lodo em ico sub 2 (bolha), anel de bolor com 56 radiais,
 *    pescoços cônicos com ≥18 radiais e ≥6 anéis de altura;
 *  - coreografia de GOSMA: encova elástico, cospe chicoteando (a janela é a
 *    do meio da árvore: mais rápida que a da fortaleza de vidro, mais pesada
 *    que a do vapor).
 */

const PANTANO = getSpecies('pantano');
const LV = 7 as MonsterLevel;

/** luminância (Rec. 709) — a régua do "isso é BREU ou é LAMA DE OBRA?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('Pântano: hidra do lodo plantada (Nv.7)', () => {
  test('o Pântano tem rig próprio e forma ÚNICA de hidra (Nv.7 fixo)', () => {
    expect(SPECIES_RIGS.pantano).toBeTruthy();
    expect(PANTANO.levelMin).toBe(7);
    expect(PANTANO.levelMax).toBe(7);
    expect(hasLevelVariants(MODELS.pantano)).toBe(false);
    // espécie da árvore: uma forma só, montada inteira no Nv. da espécie
    expect(partsForLevel(MODELS.pantano, 7).length).toBe(MODELS.pantano.parts.length);
    // orçamento denso (a régua anti low-poly da árvore: golem 47, vapor 43)
    expect(MODELS.pantano.parts.length).toBeGreaterThanOrEqual(40);
  });

  test('silhueta: POÇA larga + montículo + caldeirão + TRÊS pescoços de hidra', () => {
    const parts = partsForLevel(MODELS.pantano, 7);
    // o brejo é PLANTADO (tanque que não anda)
    expect(PANTANO.base.moveSpeed).toBe(0);
    // poça: o corpo MAIS LARGO do modelo, chato, rente ao chão (a lama escorre
    // para fora do slot — é o que diferencia o Pântano de um boneco num toco)
    const pool = parts.find((p) => p.g === 'ico' && p.p[1] <= 0.1 && p.a[0] >= 1.2)!;
    expect((pool.s?.[1] ?? 1) / (pool.s?.[0] ?? 1)).toBeLessThanOrEqual(0.12); // CHATA
    // filme de bolor na borda: ANEL, não disco
    const scum = parts.find((p) => p.g === 'ring')!;
    expect(scum.m).toBe('trans');
    expect(scum.p[1]).toBeLessThan(0.06);
    expect(Math.abs(scum.r?.[0] ?? 0)).toBeGreaterThan(1.5);
    // três pescoços com maxilar correspondente (a assinatura da hidra): cada
    // grupo de peça (part.group) tem UM pescoço, UMA cabeça e UM maxilar
    for (const g of [1, 2, 3]) {
      const neck = parts.filter((p) => p.tag === 'neck' && p.group === g);
      expect(neck.length).toBe(1); // pescoço de peça ÚNICA (duas juntas viravam fiapos soltos)
      expect(parts.filter((p) => p.tag === 'head' && p.group === g).length).toBe(1);
      expect(parts.filter((p) => p.tag === 'jaw' && p.group === g).length).toBe(1);
      const n = neck[0];
      expect(n.g).toBe('cyl');
      expect(n.a[1]).toBeGreaterThanOrEqual(0.26); // GROSSO (fino, vira broto de brócolis)
      expect(n.a[2]).toBeGreaterThanOrEqual(1.2); // comprido
    }
    // caldeirão afogado MAIOR que o montículo de crosta e LEGÍVEL (enterrado,
    // virava monte de musgo): corpo esférico grande + boca em anel + alças
    const pot = parts.filter((p) => p.tag === 'pot');
    expect(pot.length).toBeGreaterThanOrEqual(4);
    const potBody = pot.find((p) => p.g === 'sphere')!;
    expect(potBody.a[0]).toBeGreaterThanOrEqual(0.45);
    expect(potBody.p[1]).toBeGreaterThan(1.5); // exposto ACIMA da borda do montículo
    // caldo borbulhando na boca do caldeirão (o caldeireiro do Vapor afogado)
    expect(parts.filter((p) => p.tag === 'brew' && p.m === 'glow').length).toBeGreaterThanOrEqual(3);
    // juncos na orla do slot (o pântano tem beirada)
    expect(parts.filter((p) => p.tag === 'reed').length).toBeGreaterThanOrEqual(2);
  });

  test('detalhes legíveis: OLHOS-FENDA na superfície, gosma pingando, bile na goela', () => {
    const parts = partsForLevel(MODELS.pantano, 7);
    // olhos FENDA (2 por hidra = 6): baixos e largos, SEMPRE à frente do centro
    // da cabeça (a regra do print de vidro: peça de face sai da superfície)
    const eyes = parts.filter((p) => p.m === 'white');
    expect(eyes.length).toBe(6);
    for (const e of eyes) {
      expect(e.g).toBe('box');
      expect(e.a[1]).toBeLessThanOrEqual(e.a[0] * 0.75); // FENDA
      const head = parts.find((p) => p.tag === 'head' && p.group === e.group)!;
      expect(e.p[2]).toBeGreaterThan(head.p[2]); // na FRENTE da cabeça
      expect(e.p[2] - head.p[2]).toBeLessThanOrEqual(0.3); // colado nela, não flutuando
      expect(e.p[1]).toBeGreaterThan(parts.find((p) => p.tag === 'jaw' && p.group === e.group)!.p[1]); // acima do maxilar
    }
    // a gosma pingando do queixo do meio (o fio de lodo que estica na carga)
    const drip = parts.find((p) => p.tag === 'drip')!;
    expect(drip.g).toBe('drop');
    const head1 = parts.find((p) => p.tag === 'head' && p.group === 1)!;
    const jaw1 = parts.find((p) => p.tag === 'jaw' && p.group === 1)!;
    expect(drip.p[1]).toBeLessThan(head1.p[1]);
    expect(drip.p[2]).toBeGreaterThan(jaw1.p[2] - 0.1); // pendurado no queixo, para frente
    // bile na goela do pescoço do meio (o veneno que sobe antes do cuspe)
    const gullet = parts.find((p) => p.tag === 'gullet')!;
    expect(gullet.m).toBe('glow');
    const neck1 = parts.find((p) => p.tag === 'neck' && p.group === 1)!;
    expect(Math.abs(gullet.p[0] - neck1.p[0])).toBeLessThanOrEqual(0.1); // no eixo do pescoço
    // fogo-fátuo pairando sobre a poça (o fogo da fusão, miúdo)
    const wisps = parts.filter((p) => p.tag === 'wisp');
    expect(wisps.length).toBeGreaterThanOrEqual(3);
    for (const w of wisps) {
      expect(w.a[0]).toBeLessThanOrEqual(0.06); // miúdo: brasa grande vira vaga-lume
      expect(w.p[1]).toBeLessThan(1.2); // rasteiro, rente ao brejo
    }
    // gás do brejo da boca do caldeirão às bordas da poça
    const gas = parts.filter((p) => p.m === 'steam');
    expect(gas.length).toBeGreaterThanOrEqual(4);
    expect(gas.some((p) => p.p[1] > 2.4)).toBe(true); // bafo alto da boca
    expect(gas.some((p) => p.p[1] < 1 && Math.abs(p.p[0]) > 0.9)).toBe(true); // bolha na borda da poça
  });

  test('ANTI LOW-POLY: lodo em ico sub 2, anel com 56 radiais, pescoço cônico denso', () => {
    for (const p of partsForLevel(MODELS.pantano, 7)) {
      if (p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca') {
        // lodo que bolha precisa de vértice; poliedro cru (sub 0) é prisma
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1);
      }
      if (p.g === 'ring') expect(p.a[2]).toBeGreaterThanOrEqual(48);
      if (p.tag === 'neck') {
        expect(p.a[3]).toBeGreaterThanOrEqual(18); // radial
        expect(p.a[4]).toBeGreaterThanOrEqual(6); // anéis de altura p/ ondular
      }
      if (p.tag === 'pot' && p.g === 'sphere') {
        expect(p.a[1]).toBeGreaterThanOrEqual(24);
        expect(p.a[2]).toBeGreaterThanOrEqual(16);
      }
    }
    // contagens reais da malha (PolyhedronGeometry: ico sub 2 = 20×(2+1)² faces
    // = 540 vértices; é o lodo que bolha — o piso do brejo em poliedro cru seria
    // prisma de 60)
    expect(getGeometry('ico', [1.3, 2]).getAttribute('position').count).toBeGreaterThanOrEqual(500);
    expect(getGeometry('ring', [1.08, 1.62, 56]).getAttribute('position').count).toBeGreaterThan(100);
    expect(getGeometry('cyl', [0.2, 0.32, 1.55, 20, 7]).getAttribute('position').count).toBeGreaterThan(200);
    expect(getGeometry('sphere', [0.5, 24, 18]).getAttribute('position').count).toBeGreaterThanOrEqual(450);
  });

  test('invólucro: a hidra cabe no slot e a poça cobre as duas linhas de profundidade', () => {
    const e = partsEnvelope(partsForLevel(MODELS.pantano, 7));
    // larga (a poça escorre), mas nunca invade o centro do vizinho (vão 3,2)
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThanOrEqual(1.7);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X - 0.6);
    // a poça é o item mais comprido da criatura: fica nas duas linhas do slot
    expect(Math.max(e.maxZ, -e.minZ)).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    expect(Math.max(e.maxZ, -e.minZ)).toBeGreaterThanOrEqual(1.6); // ESCORRADA
    expect(e.minY).toBeGreaterThanOrEqual(-0.1); // plantada: nada afunda no convés
    expect(e.maxY).toBeGreaterThan(3.3); // os pescoços aproveitam a altura da forma
    expect(e.maxY).toBeLessThanOrEqual(formTop(PANTANO, 7) + 0.25);
  });

  test('lodo: OPACO, não-aditivo, com depthWrite e espuma (bolor) CONTIDA', () => {
    const mud = MUD_ROLE_LOOK.body!;
    // o albedo do brejo: fundo escuro, meio legível (apagado, lia BURACO no
    // print) mas longe de lama de obra
    expect(luma(mud.deep)).toBeLessThan(luma(mud.mid));
    expect(luma(mud.mid)).toBeLessThan(0.5);
    // espuma branca demais em corpo escuro = neve/sabão; o bolor é minoritário
    expect(mud.foamAmt).toBeLessThanOrEqual(0.4);
    expect(luma(mud.foam)).toBeLessThan(0.95);
    expect(mud.foam.toLowerCase()).not.toBe('#ffffff');
    const mat = makeWaterMaterial({
      deep: mud.deep,
      mid: mud.mid,
      foam: mud.foam,
      amp: mud.amp,
      foamAmt: mud.foamAmt,
    });
    expect(mat.blending).toBe(THREE.NormalBlending);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true); // lodo tem peso: escreve profundidade
    mat.dispose();
  });

  test('crosta e ferro: o veio é o VITRÍOLO do motor com brilho CONTIDO', () => {
    // a amarra estrutural da paleta: motor = crosta = ferro = seiva = bile
    expect(PANTANO.base.projectileColor).toBe(PANTANO_POISON);
    expect(VISUALS.pantano.glow).toBe(PANTANO_POISON);
    expect(CRUST_LOOK.crack).toBe(PANTANO_POISON);
    expect(IRON_LOOK.crack).toBe(PANTANO_POISON);
    expect(ROOT_LOOK.sap).toBe(PANTANO_POISON);
    expect(BILE_LOOK.gold).toBe(PANTANO_POISON);
    // glow contido: no print o veio acendia feito RELÂMPAGO amarelo cobrindo a
    // crosta inteira — vitríolo é VEIO úmido, não solda elétrica
    expect(CRUST_LOOK.crackGlow).toBeLessThanOrEqual(0.5);
    expect(CRUST_LOOK.crackWidth).toBeLessThanOrEqual(0.06);
    expect(IRON_LOOK.crackGlow).toBeLessThanOrEqual(0.9);
    // glitter de brejo: quase cortado
    expect(CRUST_LOOK.speck).toBeLessThanOrEqual(0.25);
    // madeira encharcada: o tronco NÃO pode ser mais claro que o lodo (no
    // print o ancião afogado virava a estrela do cenário)
    expect(luma(ROOT_LOOK.barkA)).toBeLessThan(luma(MUD_ROLE_LOOK.body!.mid) + 0.08);
    expect(ROOT_LOOK.sapGlow).toBeLessThanOrEqual(0.45);
  });

  test('bile e gás: veneno não-aditivo, branco cortado, gás SEM tint de equipe', () => {
    const bile = makeCoreMaterial(BILE_LOOK);
    expect(bile.blending).toBe(THREE.NormalBlending);
    expect(bile.uniforms.uGold.value.getHexString()).toBe('a8cf4a');
    // blowout sempre cortado: o miolo quente é verde-claro, nunca #ffffff
    expect(BILE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(BILE_LOOK.white)).toBeLessThan(0.95);
    // orla VERDE-escura (o azul elétrico do Raio é de outra espécie):
    // verde tem que mandar nos dois canais vizinhos
    const cool = new THREE.Color(BILE_LOOK.cool);
    expect(cool.g).toBeGreaterThan(cool.r);
    expect(cool.g).toBeGreaterThan(cool.b);
    bile.dispose();
    // gás do brejo e o filme de bolor: NUNCA tint (o steamShaders nem tem
    // uniform de tint — se um dia entrarem na família que tem, o teste acorda)
    const gas = makeSteamMaterial({
      cool: GAS_LOOK.cool,
      warm: GAS_LOOK.warm,
      hot: GAS_LOOK.hot,
      amp: 0.14,
      alpha: GAS_LOOK.alpha,
      swirl: GAS_LOOK.swirl,
    });
    expect(gas.blending).toBe(THREE.NormalBlending);
    expect(gas.depthWrite).toBe(false);
    expect(gas.uniforms.uTeamColor).toBeUndefined();
    expect(GAS_LOOK.alpha).toBeLessThanOrEqual(0.55);
    expect(SCUM_LOOK.alpha).toBeLessThanOrEqual(0.5);
    expect(luma(GAS_LOOK.cool)).toBeLessThan(0.95); // palha doente, nunca branco
    gas.dispose();
  });

  test('coreografia de GOSMA: encova elástico e cospe chicoteando', () => {
    // a hidra é mais rápida que a fortaleza de vidro, mais pesada que o vapor
    expect(PANTANO_ATTACK_WINDOW).toBeGreaterThan(TEMPESTADE_ATTACK_WINDOW);
    expect(PANTANO_ATTACK_WINDOW).toBeGreaterThan(VAPOR_ATTACK_WINDOW);
    expect(PANTANO_ATTACK_WINDOW).toBeLessThan(OBSIDIANA_ATTACK_WINDOW);
    expect(PANTANO_WINDUP).toBeGreaterThan(0.4); // quase metade é carga elástica

    const idle = attackPose(-1);
    expect([idle.twist, idle.crouch, idle.bulge, idle.coil, idle.gape, idle.charge, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const windup = attackPose(PANTANO_ATTACK_WINDOW * PANTANO_WINDUP * 0.95);
    expect(windup.charge).toBeGreaterThan(0.8); // a bile enche a goela e o caldeirão
    expect(windup.coil).toBeLessThan(-0.6); // os pescoços RECOLHEM (encovam)
    expect(windup.gape).toBeLessThan(0.3); // o maxilar fica TRAVADO segurando o globo
    expect(windup.crouch).toBeGreaterThan(0.7); // o montículo afunda no brejo
    expect(windup.bulge).toBeGreaterThan(0.8); // a lama comprime (squash)
    const fire = attackPose(PANTANO_ATTACK_WINDOW * (PANTANO_WINDUP + 0.3 * (1 - PANTANO_WINDUP)));
    expect(fire.coil).toBeGreaterThan(0.5); // os pescoços CHICOTEIAM para frente
    expect(fire.gape).toBeGreaterThan(0.8); // o maxilar ESCANCA (a bica do cuspe)
    expect(fire.stepZ).toBeGreaterThan(0.05); // só o tronco empurra (não anda)
    expect(fire.twist).toBeGreaterThan(0.2); // o corpo destorce no arremesso
    expect(fire.crouch).toBeLessThan(0.2); // a lama estufa (bulge) e afunda menos
    const late = attackPose(PANTANO_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // o veneno esfria depois do tiro
    const out = attackPose(PANTANO_ATTACK_WINDOW + 0.2);
    expect([out.charge, out.coil, out.gape, out.stepZ]).toEqual([0, 0, 0, 0]);
  });

  test('motor: o globo de lodo chega com poison+slow e o impacto marca o brejo', () => {
    expect(PANTANO.base.damageElement).toBe('earth');
    expect(PANTANO.base.projectileSpeed).toBeLessThanOrEqual(8); // gosma tem inércia
    const ab = PANTANO.base.abilities;
    expect(ab.some((a) => a.kind === 'poison')).toBe(true);
    expect(ab.some((a) => a.kind === 'slow')).toBe(true);
    expect(ab.some((a) => a.kind === 'regen')).toBe(true); // a carne que volta

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 112233 });
    const st = eng.addRetainedUnit('pantano', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    // varre o voo inteiro: o GLOBO carrega o figurino do veneno
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 16; i++) {
      runSeconds(eng, 0.25);
      for (const p of eng.world.projectiles) if (p.species === 'pantano') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(7);
      expect(p.damageElement).toBe('earth');
      expect(p.abilities.some((a) => a.kind === 'poison')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'slow')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'pantano');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(7);
      expect(f.pos2).toBeDefined(); // a última posição: o rastro do globo chegando
    }
  });
});
