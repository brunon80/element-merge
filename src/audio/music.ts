import {
  ensureCore,
  getCore,
  musicAudible,
  onAudioReady,
  setMusicVolume,
} from './core';
import type { CoreAudio } from './core';

export { setMusicVolume };

/**
 * Trilha sonora generativa — nenhum arquivo, tudo sintetizado no mesmo
 * AudioContext do core (musicBus próprio, volume salvo à parte). Nove faixas:
 * menu, um ambiente para cada cenário da arena, vitória e derrota. Cada faixa
 * é um loop declarativo (tom, compassos, acordes) com a instrumentação escrita
 * passo a passo — o sequenciador agenda 16 avos com lookahead e faz crossfade
 * entre faixas quando o jogo muda de contexto (useMusicTrack).
 *
 * Personagens sonoras:
 *  • menu        — marcha heróica (Am–F–C–G): baixo, pad, fanfarra de metais e harpa
 *  • arcane      — ilha arcana: misteriosa, arpejo de sinos e pads lentos
 *  • forest      — floresta: alaúde em 16 avos, flauta, pássaros e tambor suave
 *  • ice         — gélido: sinos de vidro, pad cristalino e vento varrendo
 *  • volcanic    — inferno vulcânico: ostinato de baixo tenso, tambores tribais, trovões
 *  • underwater  — subaquático: acordes com sétima abafados (lowpass), bolhas e marulho
 *  • universe    — fim do universo: drone grave, acordes arrastados e sinos estelares
 *  • victory     — fanfarra C–G–Am–F com tímbales e pratos
 *  • defeat      — lúgubre: linha descendo Am–G–F–E, pads que pranteiam e chuva fina
 */

export type MusicTrackId =
  | 'menu'
  | 'arcane'
  | 'forest'
  | 'ice'
  | 'volcanic'
  | 'underwater'
  | 'universe'
  | 'victory'
  | 'defeat';

// ---------------------------------------------------------------------------
// Harmonia
// ---------------------------------------------------------------------------

const QUAL: Record<string, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  add9: [0, 4, 7, 14],
  min9: [0, 3, 7, 10, 14],
  sus2: [0, 2, 7],
};

/** [semitons acima da tônica da faixa, qualidade do acorde] — um por compasso */
type Chord = [number, keyof typeof QUAL];

function midiF(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

// ---------------------------------------------------------------------------
// Instrumentos sintetizados
// ---------------------------------------------------------------------------

let mVoices = 0;
const MAX_M_VOICES = 32;

function count(src: AudioScheduledSourceNode): void {
  mVoices++;
  src.onended = () => {
    mVoices--;
  };
}

interface VoiceOpts {
  type: OscillatorType;
  f: number;
  t: number;
  dur: number;
  level: number;
  atk?: number;
  /** deslize exponencial de frequência até este valor (uivos, glissandos) */
  glide?: number;
  /** par de osciladores desafinados em ±cents (o "coro" dos pads e metais) */
  detune?: number;
  cutoff?: number;
  /** vibrato em cents (nota que chora) */
  vib?: number;
  /** modulação lenta do ganho (o drone que respira) */
  breathe?: { rate: number; depth: number };
}

function v(c: CoreAudio, dest: AudioNode, o: VoiceOpts): void {
  if (mVoices >= MAX_M_VOICES) return;
  const ctx = c.ctx;
  const a = ctx.createOscillator();
  a.type = o.type;
  a.frequency.setValueAtTime(Math.max(1, o.f), o.t);
  if (o.glide !== undefined) {
    a.frequency.exponentialRampToValueAtTime(Math.max(1, o.glide), o.t + o.dur);
  }
  const oscs = [a];
  if (o.detune) {
    const b = ctx.createOscillator();
    b.type = o.type;
    b.frequency.setValueAtTime(Math.max(1, o.f), o.t);
    if (o.glide !== undefined) {
      b.frequency.exponentialRampToValueAtTime(Math.max(1, o.glide), o.t + o.dur);
    }
    a.detune.value = -o.detune;
    b.detune.value = o.detune;
    oscs.push(b);
  }
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = o.vib;
    lfo.connect(lg);
    for (const osc of oscs) lg.connect(osc.detune);
    lfo.start(o.t);
    lfo.stop(o.t + o.dur + 0.05);
    count(lfo);
  }
  const g = ctx.createGain();
  const atk = Math.min(o.atk ?? 0.01, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.exponentialRampToValueAtTime(o.level, o.t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  if (o.breathe) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = o.breathe.rate;
    const lg = ctx.createGain();
    lg.gain.value = o.breathe.depth;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start(o.t);
    lfo.stop(o.t + o.dur + 0.05);
    count(lfo);
  }
  let prev: AudioNode = g;
  if (o.cutoff !== undefined) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = o.cutoff;
    flt.Q.value = 0.7;
    g.connect(flt);
    prev = flt;
  }
  for (const osc of oscs) {
    osc.connect(g);
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.05);
    count(osc);
  }
  prev.connect(dest);
}

/** rajada de ruído filtrada varrendo f0→f1; devolve o filtro para LFOs pendurarem */
function nb(
  c: CoreAudio,
  dest: AudioNode,
  t: number,
  dur: number,
  level: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q = 1,
  atk = 0.004,
): BiquadFilterNode | null {
  if (mVoices >= MAX_M_VOICES) return null;
  const ctx = c.ctx;
  const s = ctx.createBufferSource();
  s.buffer = c.noise;
  s.loop = true;
  const offset = Math.random() * Math.max(0.01, c.noise.duration - dur - 0.1);
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(Math.max(20, f0), t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + Math.min(atk, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(flt).connect(g).connect(dest);
  s.start(t, offset, dur + 0.08);
  s.stop(t + dur + 0.1);
  count(s);
  return flt;
}

/** vento/mar/chuva: ruído longo com o filtro balançado por LFO */
function wash(
  c: CoreAudio,
  dest: AudioNode,
  t: number,
  dur: number,
  level: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q = 1,
  atk = 0.4,
  lfoRate = 0,
  lfoDepth = 0,
): void {
  const flt = nb(c, dest, t, dur, level, type, f0, f1, q, atk);
  if (!flt || !lfoRate) return;
  const lfo = c.ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = lfoRate;
  const lg = c.ctx.createGain();
  lg.gain.value = lfoDepth;
  lfo.connect(lg);
  lg.connect(flt.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.1);
  count(lfo);
}

function drum(
  c: CoreAudio,
  dest: AudioNode,
  t: number,
  level = 0.2,
  f = 110,
  dur = 0.3,
  click = 0.03,
): void {
  v(c, dest, { type: 'sine', f, glide: f * 0.32, t, dur, level, atk: 0.004 });
  if (click > 0) nb(c, dest, t, 0.02, click, 'highpass', 1500, 1500);
}

/** sino FM (portonado, cauda longa): o modulador despenca em 0.25s */
function bell(c: CoreAudio, dest: AudioNode, f: number, t: number, level = 0.05, dur = 1.6): void {
  if (mVoices >= MAX_M_VOICES) return;
  const ctx = c.ctx;
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = f * 2.99;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.4, t);
  mg.gain.exponentialRampToValueAtTime(10, t + 0.25);
  mod.connect(mg).connect(carrier.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  carrier.connect(g).connect(dest);
  carrier.start(t);
  carrier.stop(t + dur + 0.05);
  mod.start(t);
  mod.stop(t + 0.3);
  count(carrier);
  count(mod);
}

/** alaúde/harpa: fundamental curta + oitava magra por cima */
function pluck(c: CoreAudio, dest: AudioNode, f: number, t: number, level = 0.05, dur = 0.5): void {
  v(c, dest, { type: 'triangle', f, t, dur, level, atk: 0.004 });
  v(c, dest, { type: 'sine', f: f * 2.01, t, dur: Math.min(dur, 0.2), level: level * 0.4, atk: 0.003 });
}

function pad(
  c: CoreAudio,
  dest: AudioNode,
  tones: number[],
  t: number,
  dur: number,
  level: number,
  type: OscillatorType,
  cutoff: number | undefined,
  atk: number,
  detune = 6,
): void {
  for (const m of tones) {
    v(c, dest, { type, f: midiF(m), t, dur, level, cutoff, atk, detune });
  }
}

/** bolha: um "blup" subindo de tamanho aleatório */
function bubble(c: CoreAudio, dest: AudioNode, t: number, level = 0.02): void {
  const f = 300 + Math.random() * 900;
  v(c, dest, { type: 'sine', f, glide: f * 2.4, t, dur: 0.06 + Math.random() * 0.07, level });
}

/** passarinho: 2–4 piupos subindo e caindo */
function birds(c: CoreAudio, dest: AudioNode, t: number, level = 0.02): void {
  const n = 2 + Math.floor(Math.random() * 2);
  let tt = t;
  for (let i = 0; i < n; i++) {
    const f = 1600 + Math.random() * 1500;
    const up = Math.random() < 0.5;
    v(c, dest, {
      type: 'sine',
      f,
      glide: up ? f * 1.4 : f * 0.7,
      t: tt,
      dur: 0.05 + Math.random() * 0.06,
      level,
    });
    tt += 0.06 + Math.random() * 0.08;
  }
}

// ---------------------------------------------------------------------------
// Faixas
// ---------------------------------------------------------------------------

interface TrackDef {
  bpm: number;
  /** passos por semínima: 1 = negras, 2 = mínimas, 4 = semicolcheias */
  sub: number;
  bars: number;
  /** midi da tônica (o registro grave da faixa) */
  key: number;
  chords: Chord[];
  level?: number;
  /** mando fixo de reverb da faixa (0..1) */
  wet?: number;
  /** "sobre" que abafa a faixa inteira (o mar engole as frequências altas) */
  muffling?: number;
  play(p: Player, t: number): void;
}

interface Player {
  id: MusicTrackId;
  def: TrackDef;
  bus: GainNode;
  wetG: GainNode;
  flt: BiquadFilterNode | null;
  step: number;
  next: number;
  stepDur: number;
  barDur: number;
  stopAt?: number;
  /** guardanapo por faixa (motivos sorteados no início do loop) */
  state: number[];
}

function barInfo(p: Player): { bar: number; s: number; root: number; tones: number[] } {
  const def = p.def;
  const per = 4 * def.sub;
  const bar = Math.floor(p.step / per);
  const s = p.step % per;
  const ch = def.chords[bar % def.chords.length];
  const tones = QUAL[ch[1]].map((iv) => def.key + ch[0] + iv);
  return { bar, s, root: def.key + ch[0], tones };
}

/** tônica nunca acima do ombro do baixo (senão a faixa fica manca) */
function bassRoot(root: number): number {
  return root > 52 ? root - 12 : root;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TRACKS: Record<MusicTrackId, TrackDef> = {
  // marcha heróica do menu: Am–F–C–G com fanfarra de metais e harpa
  menu: {
    bpm: 96,
    sub: 4,
    bars: 8,
    key: 45, // A2
    chords: [
      [0, 'min'],
      [8, 'maj'],
      [3, 'maj'],
      [10, 'maj'],
      [0, 'min'],
      [8, 'maj'],
      [3, 'maj'],
      [7, 'maj'],
    ],
    wet: 0.25,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.05, 0.014, 'sawtooth', 700, 0.35, 7);
      }
      if (s % 4 === 0) {
        const pickPat = [0, 7, 12, 7][(s / 4) % 4];
        v(c, p.bus, {
          type: 'triangle',
          f: midiF(bassRoot(root) + pickPat),
          t,
          dur: p.stepDur * 3.4,
          level: 0.095,
          cutoff: 260,
        });
      }
      if (s % 4 === 0) {
        // fanfarra: uma nota da tríade por tempo (raiz–terça–quinta–terça),
        // em metais com o "coro" desafinado de fundo
        const n = tones[[0, 1, 2, 1][(s / 4) % 4] % tones.length] + 24;
        v(c, p.bus, { type: 'sawtooth', f: midiF(n), t, dur: p.stepDur * 3.2, level: 0.045, cutoff: 1800, atk: 0.05, detune: 8 });
      }
      if (s % 3 === 0) {
        pluck(c, p.bus, midiF(tones[Math.floor(s / 3) % tones.length] + 24), t, 0.028, 0.5);
      }
      if (s === 0) drum(c, p.bus, t, 0.15, 105);
      if (s === 8) drum(c, p.bus, t, 0.11, 80, 0.26, 0.015);
      if (s % 2 === 1) nb(c, p.bus, t, 0.04, 0.011, 'highpass', 6500, 6500);
      if (bar === 7 && s === 12) {
        // o último compasso desce pra mão: a oitava resolve na quinta
        v(c, p.bus, { type: 'sawtooth', f: midiF(tones[2] + 24), t, dur: p.stepDur * 3.6, level: 0.05, cutoff: 1600, atk: 0.05, detune: 8 });
      }
    },
  },

  // ilha arcana: misteriosa — pads lentos, arpejo de harpa e sinos esparsos
  arcane: {
    bpm: 68,
    sub: 2,
    bars: 4,
    key: 45, // A2
    chords: [
      [0, 'add9'],
      [8, 'maj7'],
      [0, 'min9'],
      [3, 'maj'],
    ],
    wet: 0.5,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { s, root, tones } = barInfo(p);
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.08, 0.02, 'triangle', 620, 0.9, 5);
        v(c, p.bus, { type: 'sine', f: midiF(root - 12), t, dur: p.barDur * 0.92, level: 0.07, atk: 0.05 });
      }
      const pat = [0, 2, 1, 3, 2, 4, 2, 3][s % 8] % tones.length;
      pluck(c, p.bus, midiF(tones[pat] + 24), t, 0.03 * (0.75 + Math.random() * 0.5), 0.6);
      if (s === 7 && Math.random() < 0.35) {
        const f = midiF(pick(tones) + 36);
        bell(c, p.bus, f, t, 0.03, 2.2);
        bell(c, p.wetG, f, t, 0.02, 2.2); // cauda só no reverb: o sino vem do nada
      }
    },
  },

  // floresta: viva — alaúde em 16 avos, flauta distraída, pássaros e tambor suave
  forest: {
    bpm: 102,
    sub: 4,
    bars: 4,
    key: 50, // D3
    chords: [
      [0, 'min'],
      [-4, 'maj'],
      [3, 'maj'],
      [-2, 'maj'],
    ],
    wet: 0.3,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      if (s === 0) {
        // sorteia a melodia da flauta do loop inteiro (pentatônica menor de Ré)
        const scale = [0, 3, 5, 7, 10, 12, 15, 17];
        p.state.length = 0;
        for (let i = 0; i < 16; i++) {
          p.state.push(Math.random() < 0.22 ? -1 : pick(scale));
        }
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.04, 0.01, 'sawtooth', 500, 0.5, 6);
      }
      // alaúde da floresta: 16 avos subindo e descendo a tríade
      const arpPat = [0, 1, 2, 3, 2, 1, 2, 3][s % 8] % tones.length;
      pluck(c, p.bus, midiF(tones[arpPat] + (s % 8 >= 4 ? 24 : 12)), t, 0.034, 0.4);
      if (s === 0 || s === 8) {
        v(c, p.bus, {
          type: 'triangle',
          f: midiF(bassRoot(root) + (s === 0 ? 0 : 7)),
          t,
          dur: p.stepDur * 7,
          level: 0.085,
          cutoff: 240,
        });
      }
      if (s === 0) drum(c, p.bus, t, 0.11, 95, 0.3, 0);
      if (s === 8) v(c, p.bus, { type: 'sine', f: 165, glide: 110, t, dur: 0.25, level: 0.07 });
      if (s % 4 === 2) nb(c, p.bus, t, 0.05, 0.014, 'highpass', 5200, 5200); // chocalho de sementes
      if (s % 4 === 0) {
        const n = p.state[bar * 4 + (s / 4) % 4];
        if (n >= 0) {
          v(c, p.bus, { type: 'sine', f: midiF(root + n + 12), t, dur: p.stepDur * 3.4, level: 0.05, atk: 0.06, vib: 7 });
        }
      }
      if ((s === 6 || s === 14) && Math.random() < 0.3) birds(c, p.bus, t, 0.02);
    },
  },

  // gélido: etéreo — sinos de vidro, pad cristalino e vento varrendo a geleira
  ice: {
    bpm: 56,
    sub: 2,
    bars: 4,
    key: 45, // A2
    chords: [
      [0, 'min9'],
      [-2, 'maj7'],
      [-4, 'maj7'],
      [7, 'maj'],
    ],
    wet: 0.65,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { s, root, tones } = barInfo(p);
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.12, 0.019, 'sine', undefined, 1.0, 4);
        pad(c, p.bus, tones.map((m) => m + 36), t, p.barDur * 1.15, 0.004, 'sine', undefined, 1.3, 3); // o brilho alto: o ar congelado tilinta
        v(c, p.bus, { type: 'sine', f: midiF(root - 12), t, dur: p.barDur * 0.95, level: 0.06, atk: 0.1 });
        wash(c, p.bus, t, p.barDur * 0.98, 0.02, 'bandpass', 300, 640, 0.8, 0.5, 0.12, 180); // o vento
      }
      if (s === 0 && Math.random() < 0.45) {
        const f = midiF(pick(tones) + 36);
        bell(c, p.bus, f, t, 0.034, 2.6);
        bell(c, p.wetG, f, t, 0.03, 2.6); // sino dentro do vale congelado
      }
      if (s === 3 && Math.random() < 0.18) {
        pluck(c, p.bus, midiF(pick(tones) + 24), t, 0.028, 0.8);
      }
    },
  },

  // inferno vulcânico: tenso — ostinato de baixo, tambores tribais, trovões longínquos
  volcanic: {
    bpm: 110,
    sub: 4,
    bars: 4,
    key: 50, // D3
    chords: [
      [0, 'min'],
      [0, 'min'],
      [-4, 'maj'],
      [7, 'maj'],
    ],
    level: 0.9,
    wet: 0.25,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root } = barInfo(p);
      if (s % 2 === 0) {
        // o motor da faixa: colcheias em serra abafada, tônica–tônica–oitava–quinta
        const pat = [0, 0, 12, 7][(s / 2) % 4];
        v(c, p.bus, {
          type: 'sawtooth',
          f: midiF(bassRoot(root) + pat),
          t,
          dur: p.stepDur * 1.7,
          level: s === 0 ? 0.085 : 0.065,
          cutoff: 190,
        });
      }
      if (s % 4 === 0) drum(c, p.bus, t, 0.15, 100, 0.28, 0.015);
      if (s === 6 || s === 14) v(c, p.bus, { type: 'sine', f: 175, glide: 120, t, dur: 0.24, level: 0.08 });
      if ((bar === 1 || bar === 3) && s >= 12) {
        // virada de timbales descendo (bar 0, bar 1...)
        v(c, p.bus, { type: 'sine', f: 200 - (s - 12) * 30, t, dur: 0.18, level: 0.07 - (s - 12) * 0.01 });
      }
      if (s === 0) wash(c, p.bus, t, p.barDur * 0.98, 0.028, 'lowpass', 85, 60, 0.5, 0.3); // o magma rolando embaixo
      if (bar % 2 === 1 && s === 10) {
        // a dissonância que aperta o estômago: terça menor contra a segunda
        v(c, p.bus, { type: 'sawtooth', f: midiF(root + 24), t, dur: p.stepDur * 2.6, level: 0.03, cutoff: 1400, atk: 0.08, detune: 4 });
        v(c, p.bus, { type: 'sawtooth', f: midiF(root + 25), t, dur: p.stepDur * 2.6, level: 0.03, cutoff: 1400, atk: 0.08 });
      }
      if (bar === 0 && s === 0 && Math.random() < 0.16) {
        drum(c, p.bus, t, 0.2, 45, 0.6, 0); // trovão
        nb(c, p.bus, t, 0.5, 0.07, 'lowpass', 600, 140, 0.7, 0.08);
      }
    },
  },

  // subaquático: calmo — sétimas abafadas pelo "mar", bolhas e marulho de correnteza
  underwater: {
    bpm: 60,
    sub: 2,
    bars: 4,
    key: 41, // F2
    chords: [
      [0, 'maj7'],
      [3, 'min7'],
      [9, 'min9'],
      [7, 'maj7'],
    ],
    wet: 0.4,
    muffling: 1500, // o grave de tudo some afundo: lowpass na faixa inteira
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.15, 0.022, 'sawtooth', 650, 1.1, 6); // acordes que incham devagar
        v(c, p.bus, { type: 'sine', f: midiF(root - 12), t, dur: p.barDur * 0.95, level: 0.07, atk: 0.2 });
        wash(c, p.bus, t, p.barDur, 0.015, 'bandpass', 200, 360, 0.6, 0.5, 0.08, 90); // a correnteza
      }
      if (Math.random() < 0.14) {
        bubble(c, p.bus, t, 0.022);
        if (Math.random() < 0.35) bubble(c, p.wetG, t + 0.08, 0.018);
      }
      if ((bar === 1 || bar === 3) && (s === 0 || s === 4) && Math.random() < 0.55) {
        drum(c, p.bus, t, 0.055, 50, 0.3, 0); // o coração do oceano, lá longe
      }
      if (s % 4 === 2 && Math.random() < 0.22) {
        const f = midiF(pick(tones) + 24);
        pluck(c, p.bus, f, t, 0.032, 0.6);
        bell(c, p.wetG, f, t, 0.02, 1.4);
      }
    },
  },

  // fim do universo: drone grave respirando, acordes arrastados e sinos estelares
  universe: {
    bpm: 48,
    sub: 1,
    bars: 4,
    key: 38, // D2
    chords: [
      [0, 'sus2'],
      [0, 'min'],
      [1, 'maj7'], // nápoles: a estrela morrendo muda de cor
      [0, 'sus2'],
    ],
    level: 0.85,
    wet: 0.7,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      const loopDur = p.barDur * p.def.bars;
      if (p.step === 0) {
        // o drone dura o loop inteiro e respira devagar
        v(c, p.bus, { type: 'sawtooth', f: midiF(root), t, dur: loopDur * 0.98, level: 0.04, cutoff: 300, atk: 1.5, detune: 9, breathe: { rate: 0.13, depth: 0.008 } });
        v(c, p.bus, { type: 'sawtooth', f: midiF(root + 7), t, dur: loopDur * 0.98, level: 0.03, cutoff: 340, atk: 2, detune: 6, breathe: { rate: 0.1, depth: 0.006 } });
        wash(c, p.bus, t, loopDur, 0.006, 'highpass', 3200, 4200, 0.4, 2); // o assobio do vazio
      }
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.25, 0.015, 'sine', undefined, 1.6, 3);
      }
      if ((bar === 0 || bar === 2) && s === 0) {
        drum(c, p.bus, t, 0.13, 42, 0.7, 0); // o colapso, grave e distante
        nb(c, p.bus, t, 0.4, 0.045, 'lowpass', 260, 90, 0.6, 0.06);
      }
      if (s === 0 && Math.random() < 0.55) {
        const f = midiF(pick(tones) + 36);
        bell(c, p.wetG, f, t, 0.032, 3.2); // estrela cadente: só a cauda
      }
      if (Math.random() < 0.08) {
        bell(c, p.wetG, 880 + Math.random() * 900, t, 0.014, 2);
      }
    },
  },

  // vitória: fanfarra C–G–Am–F — metais marchando, tímbales e o prato final
  victory: {
    bpm: 122,
    sub: 4,
    bars: 4,
    key: 48, // C3
    chords: [
      [0, 'maj'],
      [7, 'maj'],
      [9, 'min'],
      [5, 'maj'],
    ],
    wet: 0.3,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      if (s % 4 === 0) {
        const n = tones[[0, 1, 2, 1][(s / 4) % 4] % tones.length] + 24;
        v(c, p.bus, { type: 'sawtooth', f: midiF(n), t, dur: p.stepDur * 3, level: 0.06, cutoff: 2100, atk: 0.03, detune: 9 }); // metais em marcha
      }
      if (s === 0 || s === 8) {
        for (const m of tones.slice(0, 3)) {
          v(c, p.bus, { type: 'sawtooth', f: midiF(m + 12), t, dur: 0.14, level: 0.022, cutoff: 1300, atk: 0.01 });
        }
      }
      if (s === 0) {
        v(c, p.bus, { type: 'triangle', f: midiF(bassRoot(root)), t, dur: p.stepDur * 7.5, level: 0.1, cutoff: 170 });
        drum(c, p.bus, t, 0.17, 70, 0.5, 0.02); // tímbal
      }
      if (s === 8) {
        v(c, p.bus, { type: 'triangle', f: midiF(bassRoot(root) + 7), t, dur: p.stepDur * 3.6, level: 0.09, cutoff: 190 });
        drum(c, p.bus, t, 0.12, 70, 0.35, 0.015);
      }
      if (s % 2 === 1) pluck(c, p.bus, midiF(tones[(s >> 1) % tones.length] + 24), t, 0.02, 0.3); // arpejo brilhante nas entrelinhas
      if (bar === 3 && s === 8) {
        wash(c, p.bus, t, 0.55, 0.045, 'highpass', 3200, 7000, 0.5, 0.4); // o swell do prato
      }
      if (bar === 3 && s === 12) {
        nb(c, p.bus, t, 0.9, 0.045, 'highpass', 4500, 4200, 0.5, 0.005); // PAH: o prato abre a vitória
        const f = midiF(tones[0] + 36);
        bell(c, p.bus, f, t, 0.04, 2.4);
        bell(c, p.wetG, f, t, 0.035, 2.4);
      }
    },
  },

  // derrota: lúgubre — a linha descendo Am–G–F–E, pads que pranteiam e chuva fina
  defeat: {
    bpm: 58,
    sub: 2,
    bars: 4,
    key: 45, // A2
    chords: [
      [0, 'min'],
      [-2, 'maj7'],
      [-4, 'maj7'],
      [-5, 'maj'],
    ],
    level: 0.8,
    wet: 0.45,
    play(p, t) {
      const c = getCore();
      if (!c) return;
      const { bar, s, root, tones } = barInfo(p);
      if (s === 0) {
        pad(c, p.bus, tones.map((m) => m + 12), t, p.barDur * 1.1, 0.02, 'triangle', 560, 0.8, 5);
        v(c, p.bus, { type: 'sine', f: midiF(root - 12), t, dur: p.barDur * 0.95, level: 0.065, atk: 0.08 });
        pluck(c, p.bus, midiF(root + 12), t, 0.05, 0.8); // uma nota por compasso descendo a escada
        if (bar === 1) drum(c, p.bus, t + p.stepDur * 2, 0.05, 55, 0.3, 0); // o último golpe do tímpano
        if (bar === 3) {
          // a queixa: a segunda menor sobre a tônica, chorando baixinho
          v(c, p.bus, { type: 'sine', f: midiF(root + 13), t, dur: p.barDur * 1.2, level: 0.012, atk: 1.1, vib: 9 });
        }
      }
      if (s === 3 && Math.random() < 0.3) {
        pluck(c, p.bus, midiF(tones[1 % tones.length] + 24), t, 0.03, 0.7);
      }
      if (s === 0) wash(c, p.bus, t, p.barDur * 0.97, 0.011, 'lowpass', 1000, 650, 0.5, 0.6); // chuva fina sobre a arena
    },
  },
};

// ---------------------------------------------------------------------------
// Toca-fitas: crossfade + sequenciador com lookahead
// ---------------------------------------------------------------------------

let reverbIn: GainNode | null = null;
let reverbOut: GainNode | null = null;
let players: Player[] = [];
let timer: number | null = null;
let desired: MusicTrackId | null = null;

function ensureFx(c: CoreAudio): void {
  if (!reverbIn) {
    reverbIn = c.ctx.createGain();
    reverbOut = c.ctx.createGain();
    // reverb barato: duas linhas de delay em paralelo com realimentação
    const mk = (time: number, fb: number, lp: number): void => {
      const d = c.ctx.createDelay(1);
      d.delayTime.value = time;
      const f = c.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      const g = c.ctx.createGain();
      g.gain.value = fb;
      reverbIn!.connect(d);
      d.connect(f).connect(g).connect(d); // realimentação
      f.connect(reverbOut!); // cauda pro barramento
    };
    mk(0.11, 0.45, 2800);
    mk(0.19, 0.5, 1900);
    reverbOut.connect(c.musicBus);
  }
}

function disconnectPlayer(p: Player): void {
  p.bus.disconnect();
  p.wetG.disconnect();
  p.flt?.disconnect();
}

function startPlayer(c: CoreAudio, id: MusicTrackId): void {
  const def = TRACKS[id];
  const now = c.ctx.currentTime;
  const bus = c.ctx.createGain();
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.exponentialRampToValueAtTime(def.level ?? 1, now + 1.6); // entra respirando
  let tail: AudioNode = bus;
  let flt: BiquadFilterNode | null = null;
  if (def.muffling) {
    flt = c.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = def.muffling;
    flt.Q.value = 0.5;
    bus.connect(flt);
    tail = flt;
  }
  tail.connect(c.musicBus);
  const wetG = c.ctx.createGain();
  wetG.gain.value = def.wet ?? 0.15;
  bus.connect(wetG); // mando fixo da faixa
  wetG.connect(reverbIn!);
  const barDur = (60 / def.bpm) * 4;
  players.push({
    id,
    def,
    bus,
    wetG,
    flt,
    step: 0,
    next: now + 0.08,
    stepDur: barDur / (4 * def.sub),
    barDur,
    state: [],
  });
}

function stopPlayers(keep: MusicTrackId | null, fade = 0.9): void {
  const c = getCore();
  if (!c) return;
  const now = c.ctx.currentTime;
  for (const p of players) {
    if (p.id === keep && keep !== null && p.stopAt === undefined) continue;
    if (p.stopAt !== undefined) continue;
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setTargetAtTime(0.0001, now, fade / 3);
    p.wetG.gain.setTargetAtTime(0.0001, now, fade / 3);
    p.stopAt = now + fade + 0.4;
  }
}

const LOOKAHEAD = 0.2;

function tick(): void {
  const c = getCore();
  if (!c || c.ctx.state !== 'running') return;
  const now = c.ctx.currentTime;
  for (const p of players) {
    if (p.stopAt !== undefined && now > p.stopAt) continue;
    // aba em segundo plano: o setInterval gela e o relógio pula — sem isso,
    // ao voltar a faixa "pega o atraso" e dispara tudo de uma vez
    if (p.next < now - 0.4) p.next = now + 0.02;
    while (p.next < now + LOOKAHEAD) {
      if (p.stopAt === undefined || p.next < p.stopAt) p.def.play(p, p.next);
      p.step = (p.step + 1) % (p.def.bars * 4 * p.def.sub);
      p.next += p.stepDur;
    }
  }
  const still = players.filter((p) => !(p.stopAt !== undefined && now > p.stopAt + 0.1));
  for (const p of players) if (!still.includes(p)) disconnectPlayer(p);
  players = still;
  if (players.length === 0 && timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

/** toca a faixa; idempotente. Crossfade suave entre a antiga e a nova. */
export function playMusic(id: MusicTrackId): void {
  if (desired === id && players.some((p) => p.id === id && p.stopAt === undefined)) return;
  desired = id;
  if (!musicAudible()) return;
  const c = ensureCore();
  if (!c || c.ctx.state !== 'running') return; // acende no primeiro gesto (onAudioReady)
  if (players.some((p) => p.id === id && p.stopAt === undefined)) return;
  ensureFx(c);
  stopPlayers(id);
  startPlayer(c, id);
  if (timer === null) timer = window.setInterval(tick, 40);
}

export function stopMusic(): void {
  desired = null;
  stopPlayers(null, 0.6);
}

/** o que deveria estar tocando agora (menu/vitória/derrota/ambiente) */
export function currentTrack(): MusicTrackId | null {
  return desired;
}

// quando o gesto acende o contexto (ou o volume sobe de zero), a trilha desejada entra
onAudioReady(() => {
  const c = getCore();
  if (!c || c.ctx.state !== 'running' || !musicAudible()) {
    if (!musicAudible()) stopPlayers(null, 0.6);
    return;
  }
  if (desired && !players.some((p) => p.id === desired && p.stopAt === undefined)) {
    ensureFx(c);
    startPlayer(c, desired);
    if (timer === null) timer = window.setInterval(tick, 40);
  }
});
