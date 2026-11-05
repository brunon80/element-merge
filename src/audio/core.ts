/**
 * Núcleo de áudio compartilhado: UM único AudioContext para os efeitos
 * (src/audio/sfx.ts) e a música (src/audio/music.ts), com dois barramentos
 * independentes — sfxBus e musicBus — porque o volume de cada um é salvo à
 * parte. O contexto nasce suspenso (política de autoplay): unlockAudio() o
 * acende no primeiro gesto do usuário, e onAudioReady() deixa a música
 * retomar a trilha desejada assim que o som fica vivo. Sem Web Audio (jsdom
 * nos testes) o módulo inteiro é um no-op seguro.
 *
 * iOS/WebKit (lição de 05/nov — NÃO reverter): só `resume()` dentro do gesto
 * já foi insuficiente em várias versões do iOS — o contexto resolve a promessa
 * e CONTINUA suspenso se nada tocou dentro do gesto. Daí o warmUp: uma amostra
 * muda disparada dentro do pointerdown. E o WebKit tem o estado extra
 * 'interrupted' (chamada, Siri, app em segundo plano): o código antigo só
 * olhava para 'suspended', nunca reabria depois de uma interrupção, e o jogo
 * ficava mudo para sempre. As camadas (sfx/música) tentam `resumeCore()` quando
 * encontram o bus fechado; destravado uma vez, a reabertura dispensa gesto novo.
 */

export interface CoreAudio {
  ctx: AudioContext;
  sfxBus: GainNode;
  musicBus: GainNode;
  /** ruído branco de 1s compartilhado por rajadas, washes e chiados */
  noise: AudioBuffer;
  /** ruído rosa (aprox. Kellet): a base "cara" de whoosh, vento e explosões */
  pink: AudioBuffer;
  /** ruído marrom (integrado): o ribombar grave de trovões e magmas */
  brown: AudioBuffer;
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

/** cria o núcleo de áudio sob demanda. A PRIMEIRA chamada deve vir de dentro
 *  de um gesto (unlockAudio garante); as camadas de som só leem o core já
 *  criado via getCore — criar contexto fora de gesto é o caminho que o iOS
 *  antigo punitava com suspensão eterna. */
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
    // ruído rosa (Kellet): agudos e graves com a mesma energia — quem soa
    // "natural" na natureza; o branco puro é o que soa a chiado de 8 bits
    const pink = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const pk = pink.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < pk.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      pk[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    // ruído marrom: integrado e vazado — o peito dos trovões
    const brown = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const br = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < br.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) * 0.995;
      br[i] = last * 3.0;
    }
    core = { ctx, sfxBus, musicBus, noise, pink, brown };
    applyBuses();
    // o iOS anuncia por statechange tanto a reabertura após uma interrupção
    // (chamada, Siri, segundo plano) quanto qualquer 'running' tardio: o ready
    // sai sempre do estado real do contexto, nunca de palpite.
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') fireReady();
    });
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

// ---------------------------------------------------------------------------
// Destravamento (política de autoplay + interrupções do iOS)
// ---------------------------------------------------------------------------

/** 'interrupted' é estado REAL do WebKit iOS (chamada, Siri, aba em segundo
 *  plano) mas não está na spec — o lib.dom do TS não o conhece, daí o cast. */
function isBlocked(ctx: AudioContext): boolean {
  const s = ctx.state as string;
  return s === 'suspended' || s === 'interrupted';
}

/** WebKit só abre a porteira de um contexto suspenso quando ALGO TOCA dentro
 *  do gesto: resume() sozinho já resolve e deixa o contexto suspenso em várias
 *  versões do iOS. Uma amostra muda disparada no gesto é o aquecimento
 *  clássico; em Chromium é supérfluo, mas inofensivo. */
function warmUp(c: CoreAudio): void {
  try {
    const buf = c.ctx.createBuffer(1, 1, c.ctx.sampleRate);
    const src = c.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(c.ctx.destination);
    src.start(0);
  } catch {
    /* jsdom sem Web Audio, ou contexto fechado no meio do gesto */
  }
}

let lastResumeAt = -1e9;

function arm(c: CoreAudio, fromGesture = false): void {
  if (c.ctx.state === 'running') {
    fireReady();
    return;
  }
  if (c.ctx.state === 'closed') return;
  const now = performance.now();
  // o tick da música insiste a cada 40 ms; sem spam de promessa. O gesto do
  // usuário NUNCA é bloqueado pelo throttle — destravar é sempre na hora.
  if (!fromGesture && now - lastResumeAt < 300) return;
  lastResumeAt = now;
  c.ctx
    .resume()
    .then(() => {
      if (c.ctx.state === 'running') fireReady();
    })
    .catch(() => {
      // interrupção ainda ativa: o iOS recusa (InvalidStateError). O
      // statechange ou o próximo gesto reabrem; as camadas só não agendam
      // enquanto o bus está morto.
    });
}

/** As camadas de sfx/música chamam isto ao encontrar o contexto suspenso ou
 *  interrompido: destravado uma vez pela política de autoplay, a reabertura
 *  dispensa gesto novo — o que salva o som no iOS após segundo plano/chamada. */
export function resumeCore(): void {
  if (core) arm(core);
}

/** destrava o áudio no primeiro gesto (política de autoplay); devolve o cleanup */
export function unlockAudio(): () => void {
  const gestures = ['pointerdown', 'touchend', 'keydown'] as const;
  const onGesture = () => {
    const c = ensureCore(); // criar o contexto DENTRO do gesto é o caminho estrito do WebKit
    if (!c) return;
    if (isBlocked(c.ctx)) {
      warmUp(c);
      arm(c, true);
    } else {
      fireReady();
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') resumeCore();
  };
  // touchend pela memória antiga do iOS (9–11 só destravavam nele); pointerdown
  // é o gatilho de user activation que vale hoje. resume é idempotente.
  gestures.forEach((ev) => document.addEventListener(ev, onGesture));
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    gestures.forEach((ev) => document.removeEventListener(ev, onGesture));
    document.removeEventListener('visibilitychange', onVisible);
  };
}
