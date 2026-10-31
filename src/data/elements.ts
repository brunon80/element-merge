import type { ElementId } from '../game/types';

export interface ElementInfo {
  id: ElementId;
  name: string;
  /** Cor principal (material / UI). */
  color: string;
  /** Cor escura (base do corpo). */
  dark: string;
  /** Cor emissiva (projéteis / runas). */
  glow: string;
  description: string;
}

export const ELEMENT_ORDER: readonly ElementId[] = ['fire', 'water', 'earth', 'air'];

export const ELEMENTS: Record<ElementId, ElementInfo> = {
  fire: {
    id: 'fire',
    name: 'Fogo',
    color: '#ff7a3d',
    dark: '#8f2d12',
    glow: '#ff4d12',
    description: 'Ofensivo. Bolas de fogo e queimadura contínua.',
  },
  water: {
    id: 'water',
    name: 'Água',
    color: '#4db4ff',
    dark: '#1b4f8f',
    glow: '#2f8dff',
    description: 'Versátil. Lanças aquáticas que desaceleram inimigos.',
  },
  earth: {
    id: 'earth',
    name: 'Terra',
    color: '#c9a86a',
    dark: '#5f4a2f',
    glow: '#e0b96a',
    description: 'Resistente. Projéteis rochosos de alto impacto.',
  },
  air: {
    id: 'air',
    name: 'Ar',
    color: '#bfe9ff',
    dark: '#6d94ad',
    glow: '#9fe4ff',
    description: 'Ágil. Lâminas de vento velozes e cadência alta.',
  },
};

/** Chave canônica e determinística para pares de elementos (ordem fixa). */
export function elementPairKey(a: ElementId, b: ElementId): string {
  const ia = ELEMENT_ORDER.indexOf(a);
  const ib = ELEMENT_ORDER.indexOf(b);
  return ia <= ib ? `${a}+${b}` : `${b}+${a}`;
}
