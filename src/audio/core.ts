/**
 * Núcleo de áudio compartilhado: UM único AudioContext para os efeitos
 * (src/audio/sfx.ts) e a música (src/audio/music.ts), com dois barramentos
 * independentes — sfxBus e musicBus — porque o volume de cada um é salvo à
 * parte. O contexto nasce suspenso (política de autoplay): unlockAudio() o
 * acende no primeiro gesto do usuário, e onAudioReady() deixa a música
 * retomar a trilha desejada assim que o som fica vivo. Sem Web Audio (jsdom
 * nos testes) o módulo inteiro é um no-op seguro.
 */

export interface CoreAudio {
  ctx: AudioContext;
  sfxBus: GainNode;
  musicBus: GainNode;
  /** ruído branco de 1s compartilhado por rajadas, washes e chiados */
  noise: AudioBuffer;
}

let core: CoreAudio | null = null;
let sfxPct = 80;
let musicPct = 60;
const readyCbs = new Set<() => void>();

export function sfxAudible(): boolean {
  return sfxPct > 0;
}

export function musicAudible(): boolean {
  return musicPct > 0;
}

/** curva perceptual: 20% ainda é audível, 0% é silêncio absoluto */
function curve(pct: number): number {
  const v = Math.max(0, Math.min(100, pct)) / 100;
  return v === 0 ? 0 : Math.pow(v, 1.6);
}

function applyBuses(): void {
  if (!core) return;
  const now = core.ctx.currentTime;
  core.sfxBus.gain.setTargetAtTime(curve(sfxPct), now, 0.03);
  core.musicBus.gain.setTargetAtTime(curve(musicPct), now, 0.05);
}

export function setSfxVolume(pct: number): void {
  sfxPct = Math.max(0, Math.min(100, pct));
  applyBuses();
}

export function setMusicVolume(pct: number): void {
  musicPct = Math.max(0, Math.min(100, pct));
  applyBuses();
  // sobe o volume → a trilha desejada acende; zera → apaga em fade
  fireReady();
}

type AudioCtor = typeof AudioContext;

export function ensureCore(): CoreAudio | null {
  if (core) return core;
  const g = globalThis as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    const sfxBus = ctx.createGain();
    sfxBus.connect(master);
    const musicBus = ctx.createGain();
    musicBus.connect(master);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    core = { ctx, sfxBus, musicBus, noise };
    applyBuses();
  } catch {
    core = null;
  }
  return core;
}

export function getCore(): CoreAudio | null {
  return core;
}

export function onAudioReady(cb: () => void): void {
  readyCbs.add(cb);
}

function fireReady(): void {
  readyCbs.forEach((cb) => {
    try {
      cb();
    } catch {
      /* camada de música nunca pode derrubar o gesto do usuário */
    }
  });
}

/** destrava o áudio no primeiro gesto (política de autoplay); devolve o cleanup */
export function unlockAudio(): () => void {
  const resume = () => {
    const c = ensureCore();
    if (!c) return;
    if (c.ctx.state === 'suspended') {
      void c.ctx.resume().then(fireReady).catch(() => undefined);
    } else {
      fireReady();
    }
  };
  document.addEventListener('pointerdown', resume);
  document.addEventListener('keydown', resume);
  return () => {
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
  };
}
