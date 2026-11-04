import type { ElementId, FxEvent, SpeciesId } from '../game/types';
import { ensureCore, getCore, setSfxVolume, sfxAudible } from './core';
import type { CoreAudio } from './core';

export { setSfxVolume };

/**
 * Camada de som procedural (efeitos) sobre o AudioContext compartilhado
 * (src/audio/core.ts). playFx consome a MESMA fila de FxEvents das partículas:
 * 'launch' (lançamento), 'impact' (colisão), 'chain' (salto da corrente),
 * 'summon' (invocação) e 'mergeDone' (fusão); o resto passa mudo.
 *
 * Realismo: nada de oscilador cru varrendo (o timbre do 8 bits). Cada ataque
 * é uma ORQUESTRA DE CAMADAS: ruído rosa/marrom filtrado em varredura (o
 * corpo do whoosh e da explosão), grãos de ruído miúdos em tempos aleatórios
 * (faíscas, pedras caindo, crackle da chama), sub-bass senoidal longo (o
 * peito grave) e parciais inarmônicos (o badalo de vidro/gelo). A espécie
 * escolhe a FAMÍLIA sonora; sem espécie, o elemento de dano escolhe.
 */

type Buf = 'white' | 'pink' | 'brown';

let voices = 0;
const MAX_VOICES = 26;
const lastAt = new Map<string, number>();

const jr = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

function bufOf(c: CoreAudio, b: Buf): AudioBuffer {
  return b === 'pink' ? c.pink : b === 'brown' ? c.brown : c.noise;
}

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

/** tonalidade que desliza de f0 → f1 com ataque curto e decaimento exponencial;
 *  atk maior = ataque LENTO (o "whump" do impacto de bola de fogo incha no
 *  peito em ~50 ms em vez de estalar) */
function tone(
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  peak: number,
  pan = 0,
  atk = 0.015,
): void {
  const c = getCore();
  if (!c) return;
  const o = c.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(atk, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = c.ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(c.sfxBus);
  track(o);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

/** rajada de ruído filtrada varrendo f0 → f1; atk curto = transiente, offset
 *  aleatório: duas rajadas iguais nunca soam idênticas */
function noise(
  t0: number,
  dur: number,
  peak: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q = 1,
  pan = 0,
  atk = 0.008,
  buf: Buf = 'pink',
): void {
  const c = getCore();
  if (!c) return;
  const s = c.ctx.createBufferSource();
  s.buffer = bufOf(c, buf);
  s.loop = true;
  const offset = Math.random() * Math.max(0.01, s.buffer.duration - dur - 0.1);
  const f = c.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, f0), t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(atk, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = c.ctx.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(c.sfxBus);
  track(s);
  s.start(t0, offset, dur + 0.06);
  s.stop(t0 + dur + 0.08);
}

/** chuva de estilhaços: n rajadas miúdas em tempos e alturas aleatórias —
 *  é assim que faíscas, pedras e cacos soam de verdade (nunca um "blip") */
function grains(
  t0: number,
  n: number,
  spread: number,
  level: number,
  type: BiquadFilterType,
  fLo: number,
  fHi: number,
  dLo: number,
  dHi: number,
  pan: number,
  buf: Buf = 'white',
): void {
  for (let i = 0; i < n; i++) {
    const dur = jr(dLo, dHi);
    noise(
      t0 + Math.random() * spread,
      dur,
      level * jr(0.55, 1.3),
      type,
      jr(fLo, fHi),
      jr(fLo, fHi),
      1.2,
      Math.max(-0.85, Math.min(0.85, pan + jr(-0.18, 0.18))),
      0.001,
      buf,
    );
  }
}

/** parciais inarmônicos (razões de barra de metal / copo de cristal): o
 *  "tlim" de gelo e cristal — as parciais de cima morrem mais rápido */
function glass(t0: number, f: number, pan: number, level: number, dur = 0.7): void {
  const ratios = [1, 2.76, 5.4, 8.93];
  ratios.forEach((r, i) => {
    tone('sine', f * r, f * r * (0.985 - r * 0.006), t0 + i * 0.004, dur / (1 + r * 0.4), level / (1 + r * 0.9), pan + jr(-0.1, 0.1));
  });
}

// ---------------------------------------------------------------------------
// Famílias sonoras por espécie (o resto cai no elemento de dano)
// ---------------------------------------------------------------------------

type Family =
  | 'flame'
  | 'frost'
  | 'storm'
  | 'steam'
  | 'abyss'
  | 'rock'
  | 'wind'
  | 'verdant'
  | 'void';

const SPECIES_FAMILY: Partial<Record<SpeciesId, Family>> = {
  ignis: 'flame',
  magma: 'flame',
  vulcanico: 'flame',
  gelo: 'frost',
  cristal: 'frost',
  raio: 'storm',
  tempestade: 'storm',
  vapor: 'steam',
  nereia: 'abyss',
  abissal: 'abyss',
  pantano: 'abyss',
  golem: 'rock',
  obsidiana: 'rock',
  areia: 'rock',
  geodo: 'rock',
  colosso: 'rock',
  zephyr: 'wind',
  nevoa: 'wind',
  madeira: 'verdant',
  plasma: 'void',
  cosmico: 'void',
  astral: 'void',
  primordial: 'void',
};

const ELEMENT_FAMILY: Record<ElementId, Family> = {
  fire: 'flame',
  water: 'abyss',
  earth: 'rock',
  air: 'wind',
};

function familyOf(species?: SpeciesId, element?: ElementId): Family {
  if (species && SPECIES_FAMILY[species]) return SPECIES_FAMILY[species];
  if (element) return ELEMENT_FAMILY[element];
  return 'wind';
}

// ---------------------------------------------------------------------------
// Desenhos de som — lançamento (o canho cospe) e colisão (o peito pega)
// ---------------------------------------------------------------------------

/** lançamento: todo tiro empurra o ar; a família dá a voz, o nível engrossa */
function sLaunch(x: number, element?: ElementId, species?: SpeciesId, level = 1): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  const fam = familyOf(species, element);
  const deep = 1 - Math.min(0.3, (level - 1) * 0.035); // o dragão Nv.5 cospe mais grave que o Nv.1
  switch (fam) {
    case 'flame': {
      // o foguete de chama (estilo da referencia de bola de fogo): o corpo e
      // GRAVE — o whoosh nao assobia, ele arrasta peito, e as brasas vao atras
      noise(t, 0.36, 0.13, 'bandpass', 320 * deep, 2100, 1.5, pan, 0.06, 'pink');
      noise(t, 0.4, 0.09, 'lowpass', 260, 100, 0.7, pan, 0.03, 'brown');
      tone('sine', 95 * deep, 45 * deep, t, 0.3, 0.09, pan, 0.02); // bucho de ignicao
      grains(t, 6, 0.2, 0.016, 'highpass', 2800, 5600, 0.012, 0.04, pan); // brasas
      break;
    }
    case 'storm': {
      // whoosh eletrico (referencia electric-whoosh): corpo largo passando —
      // centroid cai de 2k para 1k e sobe de novo ate ~5k ao morrer, o
      // zumbido de arco (parciais ~640/1900 Hz) e crackles miudos a cada
      // ~0,2 s; o peito grave vem do marrom, nao do estalo agudo
      noise(t, 0.7, 0.065, 'lowpass', 170, 90, 0.7, pan, 0.1, 'brown'); // peito (menos que o corpo largo)
      noise(t, 0.6, 0.45, 'bandpass', 240, 520, 0.8, pan, 0.12, 'pink'); // corpo de 120–400 Hz (a referencia tem 30% aqui)
      noise(t, 0.55, 0.14, 'bandpass', 1900, 900, 1.8, pan, 0.1, 'pink'); // descida (centroid 2k → 1k)
      noise(t + 0.4, 0.5, 0.13, 'bandpass', 900, 4600, 2.2, pan, 0.1, 'pink'); // subida que morre
      tone('sawtooth', 640, 1150, t + 0.2, 0.5, 0.045, pan, 0.1); // zumbido do arco
      tone('sawtooth', 1900, 2500, t + 0.3, 0.45, 0.026, pan, 0.09); // a segunda palheta da descarga
      grains(t + 0.15, 8, 0.45, 0.055, 'highpass', 3000, 7000, 0.004, 0.02, pan); // zaps ritmados
      break;
    }
    case 'frost': {
      // lasca de gelo arremessada: tlim de vidro e lufada gelada
      noise(t, 0.1, 0.09, 'bandpass', 3200, 1500, 3.5, pan, 0.002, 'white');
      glass(t, 1150 * deep, pan, 0.028, 0.45);
      noise(t, 0.16, 0.05, 'lowpass', 600, 240, 0.9, pan, 0.01, 'pink');
      break;
    }
    case 'abyss': {
      // jato d'água: whoosh abafado, gota na saída e bojo grave
      noise(t, 0.2, 0.11, 'bandpass', 520, 1500, 2.2, pan, 0.015, 'pink');
      tone('sine', 1600, 520, t, 0.09, 0.05, pan); // a gota que sai na boca do cano
      tone('sine', 150 * deep, 75 * deep, t, 0.16, 0.08, pan);
      break;
    }
    case 'rock': {
      // pedra lançada: atrito de areia/granada e bucho de funda
      noise(t, 0.22, 0.12, 'bandpass', 300, 950, 1.1, pan, 0.02, 'pink');
      grains(t, 5, 0.14, 0.025, 'highpass', 900, 2200, 0.02, 0.05, pan);
      tone('triangle', 120 * deep, 62 * deep, t, 0.16, 0.1, pan);
      break;
    }
    case 'wind': {
      // golpe de ar: o clássico whoosh com doppler (sobe e cai do lado oposto)
      noise(t, 0.26, 0.13, 'bandpass', 1500, 430, 1.15, pan, 0.04, 'pink');
      noise(t, 0.26, 0.04, 'lowpass', 320, 140, 0.6, pan, 0.04, 'brown');
      tone('sine', 780, 420, t, 0.22, 0.02, pan); // o assobio que quase não se ouve
      break;
    }
    case 'steam': {
      // vapor solto: chiado agudo de panela de pressão e bolhas na saída
      noise(t, 0.24, 0.1, 'bandpass', 3900, 1500, 2.4, pan, 0.01, 'pink');
      tone('sine', 1400, 420, t, 0.06, 0.035, pan);
      tone('sine', 2000, 600, t + 0.09, 0.05, 0.025, pan);
      tone('sine', 180, 90, t, 0.14, 0.05, pan);
      break;
    }
    case 'verdant': {
      // cipó/fuste de madeira: "thock" seco e casca estalando
      tone('triangle', 250 * deep, 95 * deep, t, 0.12, 0.09, pan);
      noise(t, 0.22, 0.08, 'bandpass', 800, 320, 1.3, pan, 0.008, 'pink');
      grains(t, 2, 0.1, 0.02, 'highpass', 1300, 2400, 0.015, 0.03, pan);
      break;
    }
    case 'void': {
      // o cosmo cospe escuridão: buraco grave e brilhar de estrelas morrendo
      tone('sine', 105 * deep, 48 * deep, t, 0.24, 0.07, pan);
      noise(t, 0.28, 0.08, 'lowpass', 1400, 380, 0.8, pan, 0.05, 'pink');
      glass(t, 1320, pan, 0.018, 0.5);
      break;
    }
  }
}

/** colisão: peito grave (sub longo) + corpo filtrado + estilhaços temporais;
 *  o nível aumenta o corpo — o mesmo Nv.5 que cresce na tela cresce no ouvido */
function sImpact(x: number, element?: ElementId, species?: SpeciesId, level = 1): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  const fam = familyOf(species, element);
  const big = 1 + Math.min(0.5, (level - 1) * 0.06);
  switch (fam) {
    case 'flame': {
      // a bola de fogo DETONA no peito (referencia fireball-impact: 80% da
      // energia abaixo de 120 Hz, swell de ~0,5 s, sem medios): o impacto NAO
      // estala — ele INCHA: sub grave longo de ataque lento, corpo escuro de
      // ruído marrom, whumps secundarios desfasados (a bola ainda floresce,
      // por isso o ribombar e irregular) e chiado 5–8k quase inaudivel na fumaca
      tone('sine', 88 / big, 30, t, 0.9, 0.2, pan, 0.08); // o peito longo, swell lento
      tone('triangle', 190 / big, 70, t, 0.6, 0.16, pan, 0.06); // rosnado de 120–400 Hz (a referencia tem 17% da energia aqui)
      noise(t, 0.4, 0.12, 'lowpass', 420, 140, 0.9, pan, 0.05, 'pink'); // corpo medio-escuro
      noise(t, 0.5, 0.14, 'lowpass', 260, 70, 0.8, pan, 0.05, 'brown'); // corpo escuro
      noise(t, 0.15, 0.09, 'lowpass', 900, 260, 0.7, pan, 0.03, 'white'); // a porta do baque
      tone('sine', jr(70, 95) / big, jr(26, 34), t + 0.2 + jr(0, 0.08), 0.55, 0.12, pan, 0.05); // whump 2
      tone('sine', jr(55, 75) / big, jr(22, 28), t + 0.44 + jr(0, 0.12), 0.5, 0.08, pan, 0.06); // whump 3, mais grave
      noise(t + 0.3, 0.7, 0.045, 'lowpass', 120, 55, 0.6, pan, 0.08, 'brown'); // rastro de fumaca
      noise(t + 0.05, 0.5, 0.06, 'bandpass', 5200, 2800, 1.4, pan, 0.06, 'white'); // chiado que queima
      grains(t + 0.1, 8, 0.5, 0.05, 'highpass', 4500, 8000, 0.015, 0.05, pan); // sizzle miudo
      break;
    }
    case 'storm': {
      // a chegada eletrica: o crack abre a porta (6,5k), o estalo pega no
      // peito, e sobra o arco — zumbido de serra descendo que morre num
      // chiado claro ASCENDENTE (2,2k → 6k) cortado seco, do final da referencia
      noise(t, 0.08, 0.2, 'bandpass', 6500, 2200, 2.6, pan, 0.001, 'white'); // crack
      tone('sine', 105 / big, 40, t, 0.16, 0.13, pan, 0.008); // estalo no peito
      tone('sawtooth', 1250, 460, t + 0.03, 0.3, 0.038, pan, 0.02); // pos-brilho do arco
      noise(t + 0.08, 0.26, 0.085, 'bandpass', 2200, 6000, 2.4, pan, 0.04, 'white'); // chiado que sobe e cessa
      grains(t, 9, 0.18, 0.032, 'highpass', 2500, 7000, 0.003, 0.011, pan); // crackle de fasca
      break;
    }
    case 'frost': {
      // gelo estilhaca no vidro, mas o baque pega no peito: o "tlim" de
      // taca quebrada assenta num sub macio — o mesmo peso do de bola de fogo
      noise(t, 0.09, 0.11, 'bandpass', 5200, 2200, 3, pan, 0.001, 'white');
      tone('sine', 90 / big, 38, t, 0.32, 0.07, pan, 0.03); // o tronco grave (so o bastante p/ pesar no peito)
      glass(t, 1250, pan, 0.055, 0.8);
      glass(t + 0.03, 890, pan, 0.038, 0.6);
      grains(t + 0.02, 6, 0.3, 0.028, 'highpass', 3800, 8000, 0.006, 0.024, pan);
      break;
    }
    case 'abyss': {
      // splash com whump de massa por baixo: o bucho abafado fecha primeiro,
      // a agua sobe em frequencia, o bojo embola e as gotas pingam depois
      noise(t, 0.14, 0.09, 'lowpass', 200, 90, 0.7, pan, 0.02, 'brown'); // o whump
      noise(t, 0.16, 0.13, 'bandpass', 700, 3000, 1.6, pan, 0.01, 'white');
      noise(t, 0.22, 0.1, 'lowpass', 1300, 420, 0.9, pan, 0.015, 'pink');
      tone('sine', 125 / big, 58, t, 0.3, 0.17, pan, 0.02);
      for (let i = 0; i < 4; i++) {
        tone('sine', jr(1500, 2600), jr(300, 600), t + jr(0.05, 0.43), 0.07, 0.035, pan + jr(-0.25, 0.25));
      }
      break;
    }
    case 'rock': {
      // a pedra PIFA: slam de swell lento, toco seco e a cauda longa de
      // detritos rolando — as pedrinhas continuam caindo DEPOIS do baque
      tone('sine', 78 / big, 31, t, 0.52, 0.3, pan, 0.035);
      tone('triangle', 190 / big, 62, t, 0.14, 0.1, pan);
      noise(t, 0.3, 0.15, 'bandpass', 320, 1100, 1.2, pan, 0.006, 'pink');
      noise(t + 0.18, 0.6, 0.04, 'lowpass', 140, 70, 0.7, pan, 0.1, 'brown'); // ribombar de rolamento
      grains(t + 0.05, 8, 0.5, 0.07, 'highpass', 900, 2400, 0.02, 0.07, pan); // pedrinhas caindo
      grains(t + 0.1, 4, 0.4, 0.03, 'highpass', 3000, 6500, 0.008, 0.03, pan); // lascar pedras
      break;
    }
    case 'wind': {
      // o golpe de ar fecha no alvo: whoosh que sobe e eco que desce
      noise(t, 0.2, 0.12, 'bandpass', 480, 1400, 1.3, pan, 0.01, 'pink');
      noise(t + 0.06, 0.18, 0.07, 'bandpass', 1900, 650, 1.1, pan, 0.01, 'pink');
      tone('sine', 140 / big, 75, t, 0.16, 0.06, pan);
      break;
    }
    case 'steam': {
      // a nuvem DETONA em chiado: banda alta, bolhas e um bucho curto
      noise(t, 0.3, 0.11, 'bandpass', 4200, 1600, 2.2, pan, 0.008, 'pink');
      for (let i = 0; i < 3; i++) {
        tone('sine', jr(1200, 2000), jr(350, 700), t + jr(0.02, 0.32), 0.06, 0.03, pan + jr(-0.2, 0.2));
      }
      tone('sine', 150 / big, 70, t, 0.18, 0.09, pan);
      break;
    }
    case 'verdant': {
      // madeira racha: thud macio, tronco oco e farpas partindo
      tone('triangle', 210 / big, 78, t, 0.2, 0.13, pan);
      noise(t, 0.26, 0.1, 'bandpass', 900, 330, 1.4, pan, 0.008, 'pink');
      grains(t, 4, 0.18, 0.02, 'highpass', 1200, 2600, 0.015, 0.03, pan);
      break;
    }
    case 'void': {
      // impacto do nada: buraco que engole o grave e o brilhar que sobra
      tone('sine', 72 / big, 29, t, 0.48, 0.24, pan);
      if (species === 'primordial') {
        tone('sine', 64 / big, 25, t + 0.12, 0.5, 0.18, pan); // o segundo peito: a coisa é enorme
      }
      noise(t, 0.34, 0.09, 'lowpass', 900, 220, 0.8, pan, 0.03, 'pink');
      glass(t, 1320, pan, 0.03, 0.7);
      break;
    }
  }
}

/** salto da corrente: mini-arco em trânsito — crack curto, zumbido de serra
 *  subindo (a descarga "fala") e estalo no peito, no estilo do whoosh eletrico */
function sChain(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  noise(t, 0.07, 0.13, 'bandpass', 3200, 1000, 3, pan, 0.001, 'white');
  tone('sawtooth', 950, 2100, t, 0.12, 0.026, pan, 0.01); // a voz do arco no salto
  grains(t, 5, 0.06, 0.022, 'highpass', 3000, 6500, 0.003, 0.01, pan);
  tone('sine', 110, 48, t, 0.07, 0.07, pan, 0.004);
}

/** invocação: o portal abre (sopro subindo), a chamada sobe e o sino anuncia a chegada */
function sSummon(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  noise(t, 0.34, 0.09, 'bandpass', 300, 1800, 1.1, pan, 0.06, 'pink');
  tone('triangle', 200, 760, t, 0.34, 0.09, pan);
  glass(t + 0.3, 1180, pan, 0.03, 0.9); // o sino de chegada é de vidro, não de chip
}

/** fusão: duas vozes a quinta CONVERGEM para a mesma nota (é assim que fundir
 *  soa), o respiro abre no estouro e o sino de cristal resolve */
function sMerge(x: number): void {
  const c = getCore();
  if (!c) return;
  const t = c.ctx.currentTime;
  const pan = panOf(x);
  tone('sine', 330, 550, t, 0.3, 0.1, pan - 0.25);
  tone('sine', 495, 550, t, 0.3, 0.1, pan + 0.25);
  noise(t + 0.22, 0.22, 0.11, 'highpass', 700, 3400, 0.7, pan, 0.02, 'white');
  noise(t + 0.42, 0.12, 0.05, 'bandpass', 2400, 800, 1.4, pan, 0.004, 'pink'); // o baque do novo corpo
  tone('sine', 550, 548, t + 0.4, 0.4, 0.07, pan); // o unison que segura
  glass(t + 0.42, 1100, pan, 0.05, 1.1);
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
      if (!throttled('launch', 0.05)) sLaunch(x, ev.element, ev.species, ev.level);
      break;
    case 'impact':
      if (!throttled('impact', 0.04)) sImpact(x, ev.element, ev.species, ev.level);
      break;
    case 'chain':
      if (!throttled('chain', 0.06)) sChain(ev.pos2 ? (x + ev.pos2[0]) / 2 : x);
      break;
    case 'summon':
      if (!throttled('summon', 0.08)) sSummon(x);
      break;
    case 'mergeDone':
      if (!throttled('merge', 0.15)) sMerge(x);
      break;
  }
}

/** demonstração do menu de configurações: invocação → chama dispara e detona
 *  → raio estala e rasga → fusão fecha a conta */
export function testSfx(): void {
  if (!sfxAudible()) return;
  const c = ensureCore();
  if (!c || c.ctx.state !== 'running') return;
  sSummon(0);
  window.setTimeout(() => sLaunch(-2, 'fire', 'ignis', 3), 350);
  window.setTimeout(() => sImpact(2, 'fire', 'ignis', 3), 780);
  window.setTimeout(() => sLaunch(-1, 'air', 'raio', 5), 1450);
  window.setTimeout(() => sImpact(1, 'air', 'raio', 5), 1780);
  window.setTimeout(() => sMerge(0), 2450);
}
