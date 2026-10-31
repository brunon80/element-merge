import type { SpeciesDef, SpeciesId } from '../game/types';

/**
 * Catálogo central de espécies. Novas criaturas podem ser adicionadas aqui
 * sem tocar no motor de combate ou nas regras de fusão.
 */

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  // -------------------------------------------------------------------------
  // Elementos puros (base da árvore de evolução)
  // -------------------------------------------------------------------------
  ignis: {
    id: 'ignis',
    name: 'Ignis',
    elements: ['fire'],
    modelKey: 'ignis',
    blurb: 'Salamandra de magma vivo. Cuspe bolas de fogo que queimam por tempo limitado.',
    // fusões do mesmo elemento crescem a criatura: faísca → dragão de fogo
    formTops: [1.95, 2.5, 3.2, 3.9, 4.45],
    formNames: ['faísca', 'tocha viva', 'salamandra de fogo', 'serpente alada', 'dragão de fogo'],
    base: {
      hp: 130,
      damage: 14,
      range: 9.5,
      interval: 1.5,
      projectileSpeed: 9,
      reload: 1.0,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'fire',
      resist: { fire: 0.25, water: -0.15 },
      abilities: [
        { kind: 'burn', chance: 0.35, duration: 3, dpsFraction: 0.22 },
      ],
    },
  },
  nereia: {
    id: 'nereia',
    name: 'Nereia',
    elements: ['water'],
    modelKey: 'nereia',
    blurb: 'Espírito das marés. Dispara lanças aquáticas que desaceleram os inimigos.',
    base: {
      hp: 150,
      damage: 11,
      range: 10.5,
      interval: 1.6,
      projectileSpeed: 8.5,
      reload: 1.1,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'water',
      resist: { water: 0.25, air: -0.15 },
      abilities: [
        { kind: 'slow', chance: 0.5, duration: 3, slowFactor: 0.6 },
      ],
    },
    // fusões do mesmo elemento levantam a maré: gotinha → tsunami
    formTops: [1.4, 2.15, 2.8, 3.45, 4.3],
    formNames: ['gotinha', 'gota viva', 'ondina', 'cavalo de onda', 'tsunami'],
  },
  golem: {
    id: 'golem',
    name: 'Gólem',
    elements: ['earth'],
    modelKey: 'golem',
    blurb: 'Colosso de pedra antiga. Projéteis rochosos devastadores, porém lentos. Caça o alvo mais ferido.',
    base: {
      hp: 220,
      damage: 20,
      range: 8,
      interval: 2.1,
      projectileSpeed: 7,
      reload: 1.4,
      moveSpeed: 0,
      targeting: 'lowestHp',
      damageElement: 'earth',
      resist: { earth: 0.25, fire: -0.15 },
      abilities: [{ kind: 'heavy' }],
    },
    // fusões do mesmo elemento levantam a montanha: penedo → montanha muscular
    formTops: [1.5, 2.1, 2.45, 3.05, 4.15],
    formNames: ['penedo', 'rocha viva', 'golem de pedra', 'colosso de pedra', 'montanha muscular'],
  },
  zephyr: {
    id: 'zephyr',
    name: 'Zéfiro',
    elements: ['air'],
    modelKey: 'zephyr',
    blurb: 'Wisp dos vendavais. Lâminas de vento ultrarrápidas e cadência altíssima.',
    // fusões do mesmo elemento crescem o vendaval: sopro → tornado
    formTops: [1.75, 2.45, 3.2, 3.85, 4.5],
    formNames: ['sopro', 'redemoinho', 'funil vivo', 'ciclone', 'tornado'],
    base: {
      hp: 110,
      damage: 9,
      range: 9.5,
      interval: 1.1,
      projectileSpeed: 14,
      reload: 0.8,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'air',
      resist: { air: 0.25, earth: -0.15 },
      abilities: [{ kind: 'swift' }],
    },
  },

  // -------------------------------------------------------------------------
  // Híbridos (descobertos fundindo dois elementos puros diferentes no nível 1)
  // Híbridos valem cerca de 2,5 monstros puros: mais caros de montar,
  // porém com sinergias de habilidades e melhor eficiência de slot.
  // -------------------------------------------------------------------------
  vulcane: {
    id: 'vulcane',
    name: 'Vulcane',
    elements: ['fire', 'earth'],
    modelKey: 'vulcane',
    blurb: 'Golem vulcânico. Blocos de lava explodem em área e incendeiam o terreno.',
    base: {
      hp: 300,
      damage: 28,
      range: 8.5,
      interval: 2.2,
      projectileSpeed: 7.5,
      reload: 1.3,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'fire',
      projectileColor: '#ff8a2a',
      resist: { fire: 0.2, earth: 0.2, water: -0.15, air: -0.15 },
      abilities: [
        { kind: 'splash', radius: 1.8, factor: 0.6 },
        { kind: 'burn', chance: 0.2, duration: 3, dpsFraction: 0.25 },
      ],
    },
  },
  tempest: {
    id: 'tempest',
    name: 'Tempest',
    elements: ['water', 'air'],
    modelKey: 'tempest',
    blurb: 'Nimbo elétrico. Raios saltam entre inimigos e retarda toda a linha de frente.',
    base: {
      hp: 200,
      damage: 17,
      range: 11.5,
      interval: 1.45,
      projectileSpeed: 13,
      reload: 0.9,
      moveSpeed: 0,
      targeting: 'farthest',
      damageElement: 'air',
      projectileColor: '#aef2ff',
      resist: { water: 0.2, air: 0.2, fire: -0.15, earth: -0.15 },
      abilities: [
        { kind: 'chain', factor: 0.5 },
        { kind: 'slow', chance: 0.3, duration: 3, slowFactor: 0.5 },
      ],
    },
  },
  verdan: {
    id: 'verdan',
    name: 'Verdan',
    elements: ['water', 'earth'],
    modelKey: 'verdan',
    blurb: 'Ancião do pântano. Nova de lama que esmaga e enraíza inimigos em área.',
    base: {
      hp: 340,
      damage: 19,
      range: 8.5,
      interval: 2.0,
      projectileSpeed: 7,
      reload: 1.3,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'earth',
      projectileColor: '#9fbb6a',
      resist: { water: 0.2, earth: 0.2, fire: -0.15, air: -0.15 },
      abilities: [
        { kind: 'splash', radius: 2.0, factor: 0.5 },
        { kind: 'slow', chance: 0.3, duration: 3, slowFactor: 0.5 },
      ],
    },
  },
  solaris: {
    id: 'solaris',
    name: 'Solaris',
    elements: ['fire', 'air'],
    modelKey: 'solaris',
    blurb: 'Serafim solar. Feixos de chama celestial atravessam vários inimigos.',
    base: {
      hp: 210,
      damage: 16,
      range: 10,
      interval: 1.35,
      projectileSpeed: 12,
      reload: 0.9,
      moveSpeed: 0,
      targeting: 'farthest',
      damageElement: 'fire',
      projectileColor: '#ffd23f',
      resist: { fire: 0.2, air: 0.2, water: -0.15, earth: -0.15 },
      abilities: [
        { kind: 'pierce', factor: 2 },
        { kind: 'burn', chance: 0.3, duration: 3, dpsFraction: 0.25 },
      ],
    },
  },
  vaporis: {
    id: 'vaporis',
    name: 'Vaporis',
    elements: ['fire', 'water'],
    modelKey: 'vaporis',
    blurb: 'Caldeiro vivo. Jatos de vapor fervente queimam e abrandam ao mesmo tempo.',
    base: {
      hp: 260,
      damage: 16,
      range: 9.5,
      interval: 1.6,
      projectileSpeed: 9,
      reload: 1.0,
      moveSpeed: 0,
      targeting: 'closest',
      damageElement: 'fire',
      projectileColor: '#ffc37a',
      resist: { fire: 0.2, water: 0.2, air: -0.15 },
      abilities: [
        { kind: 'splash', radius: 1.5, factor: 0.4 },
        { kind: 'burn', chance: 0.25, duration: 3, dpsFraction: 0.2 },
        { kind: 'slow', chance: 0.25, duration: 3, slowFactor: 0.5 },
      ],
    },
  },
  duna: {
    id: 'duna',
    name: 'Duna',
    elements: ['earth', 'air'],
    modelKey: 'duna',
    blurb: 'Gênio do deserto. Rajadas de areia cortante em disparo duplo.',
    base: {
      hp: 280,
      damage: 12,
      range: 10.5,
      interval: 1.9,
      projectileSpeed: 11,
      reload: 1.0,
      moveSpeed: 0,
      targeting: 'farthest',
      damageElement: 'earth',
      projectileColor: '#e8d49a',
      resist: { earth: 0.2, air: 0.2, fire: -0.15, water: -0.15 },
      abilities: [{ kind: 'doubleShot', factor: 0.6 }],
    },
  },
};

export const ALL_SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
export const PURE_SPECIES_IDS = ALL_SPECIES_IDS.filter(
  (id) => SPECIES[id].elements.length === 1,
);
export const HYBRID_SPECIES_IDS = ALL_SPECIES_IDS.filter(
  (id) => SPECIES[id].elements.length === 2,
);

export function getSpecies(id: SpeciesId): SpeciesDef {
  return SPECIES[id];
}
