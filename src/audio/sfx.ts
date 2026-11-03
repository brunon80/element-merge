import type { ElementId, FxEvent, SpeciesId } from '../game/types';
import { ensureCore, getCore, setSfxVolume, sfxAudible } from './core';

export { setSfxVolume };

/**
 * Camada de som procedural (efeitos): nenhum arquivo, tudo sintetizado na
 * hora sobre o AudioContext compartilhado (src/audio/core.ts). O ponto de
 * entrada é playFx — a MESMA fila de FxEvents que alimenta as partículas
 * (Effects.tsx) também toca os sons: 'launch' (lançamento do tiro), 'impact'
 * (colisão), 'chain' (salto da corrente), 'summon' (invocação) e 'mergeDone'
 * (fusão); todo o resto passa mudo.
 *
 * Mixagem: cada categoria tem um curto interval de repetição (metralhadora de
 * projéteis não vira chiado), o teto de vozes evita estouro, e o compressor
 * do core doma os impactos simultâneos. O pan sai do x da arena — o ouvido
 * acompanha o olho.
 */

let voices = 0;
const MAX_VOICES = 14;
const lastAt = new Map<string, number>();

function track(src: AudioScheduledSourceNode): void {
  voices++;
  src.onended = () => {
    voices--;
  };
}

/** pan do tabuleiro: x / 12 aparafusado em ±0.7 (nunca 100% de um lado só) */
function panOf(x: number): number {
  return Math.max(-0.7, Math.min(0.7, x / 12));
}

/** tonalidade que desliza de f0 → f1 com ataque curto e decaimento exponencial */
function tone(
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  peak: number,
  pan = 0,
): void {
  const c = getCore();
  if (!c) return;
  const o = c.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = c.ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(c.sfxBus);
  track(o);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** rajada de ruído branco filtrada varrendo f0 → f1 (offset aleatório: duas
 *  rajadas iguais nunca soam idênticas) */
function noise(
  t0: number,
  dur: number,
  peak: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q = 1,
  pan = 0,
): void {
  const c = getCore();
  if (!c) return;
  const s = c.ctx.createBufferSource();
  s.buffer = c.noise;
  s.loop = true;
  const offset = Math.random() * Math.max(0.01, c.noise.duration - dur - 0.1);
  const f = c.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, f0), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = c.ctx.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(c.sfxBus);
  track(s);
  s.start(t0, offset, dur + 0.06);
  s.stop(t0 + dur + 0.08);
}

// ---------------------------------------------------------------------------
// Desenhos de som
// ---------------------------------------------------------------------------

/** lançamento: todo tiro empurra o ar (whoosh subindo) e cada elemento empresta a voz */
function sLaunch(x: number, element?: ElementId, species?: SpeciesId, level = 1): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  const j = 0.9 + Math.random() * 0.2; // sem jitter, a metralhadora vira ruído estático
  const deep = 1 - Math.min(0.3, (level - 1) * 0.035); // o dragão Nv.5 cospe mais grave que o Nv.1
  noise(t, 0.16, 0.1, 'bandpass', 700 * j, 2100 * j, 1.1, pan);
  switch (element) {
    case 'fire':
      tone('sawtooth', 210 * j * deep, 80 * deep, t, 0.14, 0.1, pan); // toco de fogo
      break;
    case 'water':
      tone('sine', 760 * j, 300 * j, t, 0.12, 0.09, pan); // bolha que afunda
      break;
    case 'earth':
      tone('triangle', 150 * j * deep, 70 * deep, t, 0.13, 0.12, pan); // pedrada lançada
      break;
    case 'air':
      noise(t + 0.05, 0.1, 0.05, 'highpass', 1600, 900, 0.7, pan); // o sopro que termina
      break;
  }
  if (species === 'raio' || species === 'tempestade') {
    tone('square', 1900 * j, 950, t, 0.05, 0.045, pan); // estalo elétrico por cima
  }
}

/** colisão: o peito grave de todo impacto + o estilhaço filtrado, e o elemento tempera */
function sImpact(x: number, element?: ElementId, species?: SpeciesId, level = 1): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  const j = 0.92 + Math.random() * 0.16;
  const big = 1 + Math.min(0.5, (level - 1) * 0.06); // impacto cresce com o nível, igual à bola de fogo na tela
  const thump = (190 * j) / big;
  tone('sine', thump, 48, t, 0.2, 0.28, pan);
  noise(t, 0.17, 0.16, 'lowpass', 2600 * j, 380, 0.9, pan);
  switch (element) {
    case 'fire':
      tone('sawtooth', 140 / big, 40, t, 0.3, 0.12, pan); // cauda da explosão
      break;
    case 'water':
      tone('sine', 900 * j, 170, t, 0.18, 0.09, pan); // splash: bolha afundando
      noise(t + 0.02, 0.12, 0.07, 'bandpass', 1400, 2400, 2.2, pan); // respingo
      break;
    case 'earth':
      tone('triangle', 120 / big, 36, t + 0.015, 0.26, 0.14, pan); // pedra: mais fundo, mais seco
      break;
    case 'air':
      noise(t + 0.01, 0.12, 0.08, 'bandpass', 1500, 500, 1.4, pan); // lufada
      break;
  }
  if (species === 'raio' || species === 'tempestade') {
    // chiado elétrico: faíscas quadradas em alturas aleatórias
    for (let i = 0; i < 4; i++) {
      tone('square', 1200 + Math.random() * 1500, 600, t + 0.012 * i, 0.03, 0.035, pan);
    }
  } else if (species === 'gelo' || species === 'cristal') {
    tone('triangle', 1500 * j, 1180, t, 0.28, 0.09, pan); // ping metálico de gelo
    tone('triangle', 2250 * j, 1800, t + 0.02, 0.18, 0.05, pan);
  } else if (species === 'primordial') {
    tone('sine', thump * 0.5, 30, t + 0.09, 0.35, 0.2, pan); // o segundo peito: a coisa é enorme
  }
}

/** invocação: o portal abre (ruído subindo), a chamada sobe e o sino anuncia a chegada */
function sSummon(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  noise(t, 0.3, 0.07, 'bandpass', 400, 1700, 1.2, pan);
  tone('triangle', 200, 760, t, 0.34, 0.13, pan);
  tone('sine', 1180, 1170, t + 0.3, 0.22, 0.07, pan);
}

/** fusão: duas vozes a quinta convergem para a mesma nota (é assim que fundir soa) e o clarão resolve no sino */
function sMerge(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  tone('sine', 330, 550, t, 0.3, 0.11, pan - 0.25);
  tone('sine', 495, 550, t, 0.3, 0.11, pan + 0.25);
  noise(t + 0.22, 0.2, 0.1, 'highpass', 900, 3200, 0.7, pan);
  tone('triangle', 1100, 1650, t + 0.3, 0.24, 0.13, pan);
  tone('sine', 1650, 1640, t + 0.36, 0.3, 0.08, pan);
}

/** salto da corrente: zap curto (é um lançamento que já nasce em trânsito) */
function sChain(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  noise(t, 0.09, 0.07, 'bandpass', 2600, 1100, 1.6, pan);
  tone('square', 2000, 1200, t, 0.05, 0.03, pan);
}

// ---------------------------------------------------------------------------
// Porta de entrada
// ---------------------------------------------------------------------------

/** interval mínimo entre sons da mesma categoria, em segundos do clock do áudio */
function throttled(key: string, gap: number): boolean {
  const c = getCore();
  if (!c) return true;
  const t = c.ctx.currentTime;
  const prev = lastAt.get(key);
  if (prev !== undefined && t - prev < gap) return true;
  lastAt.set(key, t);
  return false;
}

/** Effects.tsx despeja aqui cada FxEvent drenado; só as quatro famílias pedidas (e o zap da corrente) toca */
export function playFx(ev: FxEvent): void {
  if (!sfxAudible()) return;
  const c = ensureCore();
  if (!c || c.ctx.state !== 'running' || voices >= MAX_VOICES) return;
  const x = ev.pos[0];
  switch (ev.type) {
    case 'launch':
      if (!throttled('launch', 0.045)) sLaunch(x, ev.element, ev.species, ev.level);
      break;
    case 'impact':
      if (!throttled('impact', 0.04)) sImpact(x, ev.element, ev.species, ev.level);
      break;
    case 'chain':
      if (!throttled('chain', 0.06)) sChain(ev.pos2 ? (x + ev.pos2[0]) / 2 : x);
      break;
    case 'summon':
      if (!throttled('summon', 0.07)) sSummon(x);
      break;
    case 'mergeDone':
      if (!throttled('merge', 0.15)) sMerge(x);
      break;
  }
}

/** demonstração do menu de configurações: invocação → disparo → colisão → fusão */
export function testSfx(): void {
  if (!sfxAudible()) return;
  const c = ensureCore();
  if (!c || c.ctx.state !== 'running') return;
  sSummon(0);
  window.setTimeout(() => sLaunch(-2, 'fire', 'ignis', 3), 350);
  window.setTimeout(() => sImpact(2, 'fire', 'ignis', 3), 750);
  window.setTimeout(() => sMerge(0), 1250);
}
