import * as THREE from 'three';
import { MODELS, VISUALS, partsForLevel, hasLevelVariants } from '../scene/speciesModels';
import { getGeometry } from '../scene/assets';
import { makeCoreMaterial } from '../scene/lightningShaders';
import { makeSteamMaterial } from '../scene/steamShaders';
import { ROW_DEPTH, TILE_SPACING_X } from '../game/board';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { SPECIES_RIGS } from '../scene/speciesRigs';
import {
  PLASMA_SPARK,
  CAGE_LOOK,
  FORGE_LOOK,
  CORE_LOOK,
  HEAT_LOOK,
  PLASMA_ATTACK_WINDOW,
  PLASMA_WINDUP,
  attackPose,
} from '../scene/PlasmaRig';
import { OBSIDIANA_ATTACK_WINDOW } from '../scene/ObsidianaRig';
import { PANTANO_ATTACK_WINDOW } from '../scene/PantanoRig';
import { TEMPESTADE_ATTACK_WINDOW } from '../scene/TempestadeRig';
import { VAPOR_ATTACK_WINDOW } from '../scene/VaporRig';
import { makeEngine, mustSummon, partsEnvelope, runSeconds } from './helpers';
import type { MonsterLevel, Projectile } from '../game/types';

/**
 * Rig do PLASMA (Nv.7 — fogo+ar+terra: a ESTRELA DE BOLSO), o canhão plantado
 * da árvore: um sol em miniatura acorrentado a uma forja de ferro. Zero shader
 * novo: ferro/gaiola/anéis = stoneShaders do golem (bigorna + três garfos em
 * tripé soldados à bigorna + três anéis de contenção que GIRAM em planos
 * diferentes), núcleo/proeminências/faíscas = plasma do Raio (makeCoreMaterial,
 * não-aditivo) em rosa-vitríolo, manchas solares e olhos = preto puro (preto
 * sobre plasma é o único contraste que lê), bafo = steamShaders do Vapor. As
 * regras amarradas aqui:
 *  - a paleta #ff9ef5 é ÚNICA entre motor, costura da gaiola, plasma, projétil
 *    e FX (identidade da centelha);
 *  - veio CONTIDO e de trama CURTA (a regra do Pântano: crackScale alto =
 *    cicatriz de ferro; glow baixo = brasa, não solda elétrica);
 *  - núcleo não-aditivo, branco cortado (nunca #ffffff), orla ameixa (o azul
 *    elétrico do Raio é de outra espécie);
 *  - bafo/gás NUNCA usa tint de equipe (amarração estrutural);
 *  - anti low-poly: núcleo ico sub 3 (960 verts), anéis com ≥40 radiais,
 *    bigorna em cil 14 radiais × 3 anéis;
 *  - plantada: sem floatY — a jaula se apoia nos garfos que brotam da bigorna
 *    (no print, a gaiola flutuando sobre a forja foi a cobrança da rodada 1);
 *  - coreografia de GATILHO NERVOSO: a janela é a mais rápida da árvore
 *    (plasma é o canhão de feixes, não um tomb).
 */

const PLASMA = getSpecies('plasma');
const LV = 7 as MonsterLevel;
/** centro da estrela (mesmo valor do rig) */
const STAR: [number, number, number] = [0, 2.35, 0];

/** luminância (Rec. 709) — a régua do "isso é FERRO ou é CINZA DE OBRA?" */
const luma = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('Plasma: estrela de bolso plantada (Nv.7)', () => {
  test('o Plasma tem rig próprio e forma ÚNICA de estrela (Nv.7 fixo)', () => {
    expect(SPECIES_RIGS.plasma).toBeTruthy();
    expect(PLASMA.levelMin).toBe(7);
    expect(PLASMA.levelMax).toBe(7);
    expect(hasLevelVariants(MODELS.plasma)).toBe(false);
    // espécie da árvore: uma forma só, montada inteira no Nv. da espécie
    expect(partsForLevel(MODELS.plasma, 7).length).toBe(MODELS.plasma.parts.length);
    // orçamento denso (a régua anti low-poly da árvore: golem 47, pântano 62)
    expect(MODELS.plasma.parts.length).toBeGreaterThanOrEqual(40);
    // PLANTADA: sem floatY (a jaula é segurada pelos garfos soldados à forja,
    // não por flutuação — sombra e volume legíveis no tabuleiro)
    expect(MODELS.plasma.floatY).toBeUndefined();
    expect(PLASMA.base.moveSpeed).toBe(0);
    // os três giros da contenção existem no modelo (grupos 11/12/13)
    for (const g of [11, 12, 13]) expect(MODELS.plasma.groups?.[g]).toBeTruthy();
  });

  test('silhueta: BIGORNA em platôs + TRÊS garfos que nascem da forja + TRÊS giros com grampos', () => {
    const parts = partsForLevel(MODELS.plasma, 7);
    // a forja: bigorna de platôs que afunilam, plantada no chão
    const forge = parts.filter((p) => p.tag === 'forge' && p.g === 'cyl');
    expect(forge.length).toBe(3);
    const stack = [...forge].sort((a, b) => a.p[1] - b.p[1]);
    expect(stack[0].a[1]).toBeGreaterThanOrEqual(1.0); // base larga (ferro que ancora)
    expect(stack[0].a[1]).toBeGreaterThan(stack[1].a[1]); // afunila
    expect(stack[1].a[1]).toBeGreaterThan(stack[2].a[1]);
    // pernas da bigorna (tripé de ferro no chão)
    expect(parts.filter((p) => p.tag === 'leg').length).toBeGreaterThanOrEqual(3);
    // a marca queimada rente ao chão: ANEL de scorch (ferro quente derrete o piso)
    const scorch = parts.find((p) => p.tag === 'scorch')!;
    expect(scorch.g).toBe('ring');
    expect(scorch.p[1]).toBeLessThanOrEqual(0.06);
    expect(Math.abs(scorch.r?.[0] ?? 0)).toBeGreaterThan(1.5);
    expect(scorch.a[0]).toBeGreaterThanOrEqual(1.0); // fura no meio: é anel, não disco
    // três garfos em tripé: LONGOS, encastrados na bigorna — SEM vão entre a
    // forja e a jaula (no print da rodada 1 a gaiola flutuava sobre a forja)
    const prongs = parts.filter((p) => p.tag === 'prong');
    expect(prongs.length).toBe(3);
    for (const pr of prongs) {
      expect(pr.g).toBe('capsule');
      expect(pr.a[1]).toBeGreaterThanOrEqual(1.5); // comprido o bastante p/ descer até a forja
      expect(pr.p[1] - pr.a[1] / 2).toBeLessThanOrEqual(0.62); // base dentro dos platôs
      expect(pr.p[1] + pr.a[1] / 2).toBeGreaterThanOrEqual(2.1); // topo na altura da contenção
    }
    // as bases SOLDADAS na bigorna (colares onde o garfo brota)
    expect(parts.filter((p) => p.tag === 'socket').length).toBeGreaterThanOrEqual(3);
    // garras fechando o topo da jaula
    expect(parts.filter((p) => p.tag === 'claw').length).toBe(3);
    // os três anéis de contenção: UM torus por grupo, ≥2 grampos por grupo —
    // e o grampo (que vende o giro num torus simétrico) anda SOBRE o aro:
    // a distância do grampo ao centro do anel é o raio do anel
    for (const g of [11, 12, 13]) {
      const grp = parts.filter((p) => p.group === g);
      const ring = grp.filter((p) => p.tag === 'ring');
      expect(ring.length).toBe(1);
      expect(grp.filter((p) => p.tag === 'clamp').length).toBeGreaterThanOrEqual(2);
      const r = ring[0].a[0];
      for (const c of grp.filter((p) => p.tag === 'clamp')) {
        const d = Math.hypot(c.p[0] - ring[0].p[0], c.p[1] - ring[0].p[1], c.p[2] - ring[0].p[2]);
        expect(Math.abs(d - r)).toBeLessThanOrEqual(0.15); // colado no aro (não boiando)
      }
    }
    // o anel EXTERNO é maior que a abertura dos garfos: é nele que a jaula se
    // apoia (os garfos atravessam o plano do anel)
    const outer = parts.find((p) => p.tag === 'ring' && p.group === 11)!;
    expect(outer.a[0]).toBeGreaterThanOrEqual(1.1);
    // os três planos da contenção são DIFERENTES (gyro: senão seria um só hula-hoop)
    const axes = [11, 12, 13].map((g) => {
      const ring = parts.find((p) => p.tag === 'ring' && p.group === g)!;
      return new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...(ring.r ?? [0, 0, 0])));
    });
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(Math.abs(axes[i].dot(axes[j]))).toBeLessThan(0.85);
    // os suportes curtos encostam no núcleo (a gaiola TOCA a estrela)
    expect(parts.filter((p) => p.tag === 'strut').length).toBeGreaterThanOrEqual(3);
  });

  test('a ESTRELA legível: núcleo ico sub 3 + MANCHAS SOLARES pretas + olhos fendados', () => {
    const parts = partsForLevel(MODELS.plasma, 7);
    // um único núcleo denso no centro da jaula
    const cores = parts.filter((p) => p.tag === 'core');
    expect(cores.length).toBe(1);
    expect(cores[0].g).toBe('ico');
    expect(cores[0].a[1]).toBeGreaterThanOrEqual(3);
    expect(cores[0].p[1]).toBeCloseTo(STAR[1], 1);
    // manchas solares PRETAS afundadas na superfície (é isso que vende "sol" —
    // sem elas era bolinha rosa de Saturno, a cobrança do baseline)
    const spots = parts.filter((p) => p.tag === 'spot');
    expect(spots.length).toBe(3);
    for (const s of spots) {
      expect(s.m).toBe('black');
      const d = Math.hypot(s.p[0] - STAR[0], s.p[1] - STAR[1], s.p[2] - STAR[2]);
      expect(d).toBeGreaterThanOrEqual(0.35); // na casca do plasma, não flutuando fora
      expect(d).toBeLessThanOrEqual(0.7);
      expect((s.s?.[2] ?? 1)).toBeLessThanOrEqual(0.4); // APARAFUSADA contra a esfera
    }
    // olhos FENDADOS pretos (preto sobre plasma é o único contraste que lê)
    const eyes = parts.filter((p) => p.tag === 'eye');
    expect(eyes.length).toBe(2);
    for (const e of eyes) {
      expect(e.m).toBe('black');
      expect(e.s![1]).toBeGreaterThanOrEqual(e.s![0] * 2); // fenda vertical
      expect(e.p[2]).toBeGreaterThan(0.3); // virados para frente (o canhão mira)
    }
    expect(Math.abs(eyes[0].p[0] + eyes[1].p[0])).toBeLessThanOrEqual(0.02); // espelhados
    // o reflexo nos olhos (fagulha clara, miúda)
    expect(parts.filter((p) => p.tag === 'glint' && p.m === 'white').length).toBeGreaterThanOrEqual(2);
    // proeminências: arcos de plasma saltando da superfície + línguas de coroa
    expect(parts.filter((p) => p.tag === 'loop' && p.m === 'glow').length).toBeGreaterThanOrEqual(4);
    expect(parts.filter((p) => p.tag === 'flare' && p.m === 'glow').length).toBeGreaterThanOrEqual(3);
    // faíscas miúdas orbitando a jaula (o saldo do que a estrela perde)
    const sparks = parts.filter((p) => p.tag === 'spark');
    expect(sparks.length).toBeGreaterThanOrEqual(4);
    for (const s of sparks) expect(s.a[0]).toBeLessThanOrEqual(0.07); // miúdas: brasa grande = vaga-lume
    // o bafo quente da forja (NUNCA tinta de equipe — o teste do gás amarra)
    const heat = parts.filter((p) => p.m === 'steam');
    expect(heat.length).toBeGreaterThanOrEqual(4);
    expect(heat.every((p) => p.p[1] < 1.2)).toBe(true); // o bafo sobe da base, não da coroa
  });

  test('ANTI LOW-POLY: núcleo ico sub 3, anéis com 40+ radiais, bigorna densa', () => {
    for (const p of partsForLevel(MODELS.plasma, 7)) {
      if (p.g === 'ico' || p.g === 'octa' || p.g === 'dodeca') {
        expect(p.a[1] ?? 0).toBeGreaterThanOrEqual(1); // poliedro cru é prisma
      }
      if (p.tag === 'ring') {
        expect(p.a[3]).toBeGreaterThanOrEqual(40); // radiais do aro
        expect(p.a[2]).toBeGreaterThanOrEqual(8); // seção do tubo
      }
      if (p.tag === 'scorch') expect(p.a[2]).toBeGreaterThanOrEqual(40);
      if (p.tag === 'forge' && p.g === 'cyl') {
        expect(p.a[3]).toBeGreaterThanOrEqual(12); // radial
        expect(p.a[4]).toBeGreaterThanOrEqual(2); // anéis de altura
      }
      if (p.tag === 'spot') {
        expect(p.a[1]).toBeGreaterThanOrEqual(12);
        expect(p.a[2]).toBeGreaterThanOrEqual(8);
      }
    }
    // contagens reais da malha (ico sub 3 = 20×(3+1)² faces = 320 faces = 960
    // vértices; é a estrela que ferve — em sub 1 seria uma bola de facetas)
    expect(getGeometry('ico', [0.56, 3]).getAttribute('position').count).toBeGreaterThanOrEqual(900);
    expect(getGeometry('torus', [1.2, 0.06, 10, 44]).getAttribute('position').count).toBeGreaterThanOrEqual(400);
    expect(getGeometry('ring', [1.1, 1.45, 44]).getAttribute('position').count).toBeGreaterThanOrEqual(85);
    expect(getGeometry('cyl', [0.95, 1.12, 0.3, 14, 3]).getAttribute('position').count).toBeGreaterThanOrEqual(100);
    expect(getGeometry('sphere', [0.12, 14, 10]).getAttribute('position').count).toBeGreaterThanOrEqual(150);
  });

  test('invólucro: a estrela cabe no slot e a marca de queimadura ancora no chão', () => {
    const e = partsEnvelope(partsForLevel(MODELS.plasma, 7));
    // o scorch (anel 1,45) é a marca larga no piso — ancora a leitura da forja
    expect(Math.max(e.maxX, -e.minX)).toBeGreaterThanOrEqual(1.4);
    expect(Math.max(e.maxX, -e.minX)).toBeLessThan(TILE_SPACING_X - 0.6);
    expect(Math.max(e.maxZ, -e.minZ)).toBeGreaterThanOrEqual(1.3);
    expect(Math.max(e.maxZ, -e.minZ)).toBeLessThanOrEqual(2 * ROW_DEPTH + 0.02);
    expect(e.minY).toBeGreaterThanOrEqual(-0.1); // plantada: nada afunda no tabuleiro
    expect(e.maxY).toBeLessThanOrEqual(formTop(PLASMA, 7) + 0.25); // respeita o formTop 4,2
    expect(e.maxY).toBeGreaterThanOrEqual(3.0); // a contenção aproveita a altura da forma
  });

  test('ferro da jaula: a costura é a CENTELHA do motor com veio curto e CONTIDO', () => {
    // a amarra estrutural da paleta: motor = costura da gaiola = costura da
    // forja = plasma = projétil (identidade #ff9ef5)
    expect(PLASMA.base.projectileColor).toBe(PLASMA_SPARK);
    expect(VISUALS.plasma.glow).toBe(PLASMA_SPARK);
    expect(CAGE_LOOK.crack).toBe(PLASMA_SPARK);
    expect(FORGE_LOOK.crack).toBe(PLASMA_SPARK);
    expect(CORE_LOOK.gold).toBe(PLASMA_SPARK);
    // VEIO CURTO E DENSO (a regra do Pântano: crackScale ALTO = cicatriz de
    // ferro; escala baixa = rabisco zigue-zague de RELÂMPAGO)
    expect(CAGE_LOOK.crackScale).toBeGreaterThanOrEqual(1.8);
    expect(FORGE_LOOK.crackScale).toBeGreaterThanOrEqual(1.8);
    // GLOW CONTIDO: ferro quente é brasa sob a crosta, não solda elétrica
    expect(CAGE_LOOK.crackGlow).toBeLessThanOrEqual(0.6);
    expect(FORGE_LOOK.crackGlow).toBeLessThanOrEqual(0.45);
    expect(CAGE_LOOK.crackWidth).toBeLessThanOrEqual(0.05);
    expect(FORGE_LOOK.crackWidth).toBeLessThanOrEqual(0.05);
    expect(CAGE_LOOK.speck).toBeLessThanOrEqual(0.25);
    // ferro VIVO: breu puxando para o roxo — nunca cinza de obra; o ferro
    // MORTO da bigorna é mais escuro que a gaiola (quem brilha é a estrela)
    expect(luma(CAGE_LOOK.rockA)).toBeGreaterThan(0.05);
    expect(luma(CAGE_LOOK.rockA)).toBeLessThan(0.6);
    expect(luma(FORGE_LOOK.rockA)).toBeLessThan(luma(CAGE_LOOK.rockA));
    // o albedo do figurino é o ferro (breu), nunca o rosa do plasma
    expect(luma(VISUALS.plasma.body)).toBeLessThan(0.35);
  });

  test('a estrela: plasma não-aditivo, branco cortado, orla AMEIXA (não o azul do Raio)', () => {
    const core = makeCoreMaterial(CORE_LOOK);
    expect(core.blending).toBe(THREE.NormalBlending);
    expect(core.uniforms.uGold.value.getHexString()).toBe('ff9ef5');
    // blowout sempre cortado: o miolo quente é rosa-claro, nunca #ffffff
    expect(CORE_LOOK.white.toLowerCase()).not.toBe('#ffffff');
    expect(luma(CORE_LOOK.white)).toBeLessThan(0.95);
    // orla ameixa queimada: vermelho manda sobre o azul e os dois mandam sobre
    // o verde (o azul elétrico do Raio é b > r — aqui é o contrário)
    const cool = new THREE.Color(CORE_LOOK.cool);
    expect(cool.r).toBeGreaterThan(cool.g);
    expect(cool.b).toBeGreaterThan(cool.g);
    expect(cool.r).toBeGreaterThan(cool.b);
    core.dispose();
  });

  test('o bafo da forja: fumaça quente SEM tint de equipe e SEM bola de neve', () => {
    const steam = makeSteamMaterial({
      cool: HEAT_LOOK.cool,
      warm: HEAT_LOOK.warm,
      hot: HEAT_LOOK.hot,
      amp: 0.12,
      alpha: HEAT_LOOK.alpha,
      swirl: HEAT_LOOK.swirl,
    });
    expect(steam.blending).toBe(THREE.NormalBlending);
    expect(steam.depthWrite).toBe(false);
    // amarração estrutural: nuvem NUNCA aceita tinta da equipe (o steamShaders
    // nem tem uniform de tint — se um dia entrarem na família que tem, acorda)
    expect(steam.uniforms.uTeamColor).toBeUndefined();
    // cinza QUENTE escuro: o bafo claro demais virava bola de neve no macro
    expect(luma(HEAT_LOOK.cool)).toBeLessThan(0.85);
    expect(HEAT_LOOK.hot.toLowerCase()).not.toBe('#ffffff');
    expect(luma(HEAT_LOOK.hot)).toBeLessThan(0.95);
    expect(HEAT_LOOK.alpha).toBeLessThanOrEqual(0.5); // alfa contida: bafo, não parede
    steam.dispose();
  });

  test('coreografia de GATILHO NERVOSO: a janela mais rápida da árvore', () => {
    // plasma é o canhão de feixes: a descarga é mais rápida que a de qualquer
    // espécie revisada (a contenção engata e DESTOA quase instantânea)
    expect(PLASMA_ATTACK_WINDOW).toBeLessThan(TEMPESTADE_ATTACK_WINDOW);
    expect(PLASMA_ATTACK_WINDOW).toBeLessThan(VAPOR_ATTACK_WINDOW);
    expect(PLASMA_ATTACK_WINDOW).toBeLessThan(PANTANO_ATTACK_WINDOW);
    expect(PLASMA_ATTACK_WINDOW).toBeLessThan(OBSIDIANA_ATTACK_WINDOW);
    expect(PLASMA_WINDUP).toBeGreaterThan(0.5); // quase tudo é a jaula APERTANDO

    const idle = attackPose(-1);
    expect([idle.twist, idle.crouch, idle.bulge, idle.bloom, idle.charge, idle.stepZ, idle.flare]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
    const windup = attackPose(PLASMA_ATTACK_WINDOW * PLASMA_WINDUP * 0.95);
    expect(windup.charge).toBeGreaterThan(0.8); // a estrela enche sob a pressão
    expect(windup.bloom).toBeLessThan(-0.4); // os garfos APERTAM a jaula antes de abrir
    expect(windup.bulge).toBeLessThan(-0.3); // esmagada: o núcleo ENCOVA (squash)
    expect(windup.crouch).toBeGreaterThan(0.4); // a forja afunda quando a estrela puxa
    const fire = attackPose(PLASMA_ATTACK_WINDOW * (PLASMA_WINDUP + 0.15 * (1 - PLASMA_WINDUP)));
    expect(fire.bulge).toBeGreaterThan(0.6); // a estrela ESTUFA na descarga
    expect(fire.bloom).toBeGreaterThan(0.3); // os garfos ABREM a jaula para o feixe sair
    expect(fire.twist).toBeLessThan(0); // a gaiola SOLTA o torque acumulado de uma vez
    expect(fire.stepZ).toBeGreaterThan(0.02); // a base empurra (plantada: não anda)
    expect(fire.flare).toBeGreaterThan(1.0); // proeminências esticam, faíscas alçam
    const late = attackPose(PLASMA_ATTACK_WINDOW * 0.98);
    expect(late.charge).toBeLessThan(0.6); // o plasma esfria depois do tiro
    const out = attackPose(PLASMA_ATTACK_WINDOW + 0.2);
    expect([out.charge, out.bloom, out.bulge, out.stepZ]).toEqual([0, 0, 0, 0]);
  });

  test('motor: a lança de plasma chega voando rápido e ATRAVESSA fileiras', () => {
    expect(PLASMA.base.damageElement).toBe('fire');
    expect(PLASMA.base.targeting).toBe('farthest'); // o canhão caça o fundo do campo
    expect(PLASMA.base.projectileSpeed).toBeGreaterThanOrEqual(10); // o feixe é VELOZ (13)
    const ab = PLASMA.base.abilities;
    const pierce = ab.find((a) => a.kind === 'pierce');
    expect(pierce && 'factor' in pierce && pierce.factor).toBeGreaterThanOrEqual(3); // costura fileiras
    expect(ab.some((a) => a.kind === 'burn')).toBe(true); // e incinera o que fura

    const eng = makeEngine({ playerCoins: 5000, aiCoins: 5000, seed: 44007 });
    const st = eng.addRetainedUnit('plasma', LV, 0);
    expect(st.ok).toBe(true);
    mustSummon(eng, 'golem', 'ai', 0);
    eng.startBattle();
    // varre o voo inteiro: a lança carrega o figurino do feixe
    const inFlight: Projectile[] = [];
    for (let i = 0; i < 16; i++) {
      runSeconds(eng, 0.25);
      for (const p of eng.world.projectiles) if (p.species === 'plasma') inFlight.push(p);
    }
    expect(inFlight.length).toBeGreaterThan(0);
    for (const p of inFlight) {
      expect(p.ownerLevel).toBe(7);
      expect(p.damageElement).toBe('fire');
      expect(p.abilities.some((a) => a.kind === 'pierce')).toBe(true);
      expect(p.abilities.some((a) => a.kind === 'burn')).toBe(true);
    }
    const impacts = eng.world.fx.filter((f) => f.type === 'impact' && f.species === 'plasma');
    expect(impacts.length).toBeGreaterThan(0);
    for (const f of impacts) {
      expect(f.level).toBe(7);
      expect(f.pos2).toBeDefined(); // a última posição: o eixo do feixe chegando
    }
  });
});
