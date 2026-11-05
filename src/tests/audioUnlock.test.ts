// Pinos da correção de áudio no iOS/WebKit (05/nov/2026 — NÃO reverter).
// jsdom não tem Web Audio, então o harness abaixo fornece um AudioContext
// fake na POLÍTICA DO WEBKIT: resume() sozinho resolve mas NÃO abre o
// contexto — só abre quando algo tocou dentro do gesto (o warmUp de amostra
// muda); resume durante 'interrupted' é recusado; e 'interrupted' (estado que
// não está na spec) existe. É o comportamento exato do iPhone que o código
// antigo não tratava.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SfxSource from '../audio/sfx.ts?raw';
import MusicSource from '../audio/music.ts?raw';
import CoreSource from '../audio/core.ts?raw';

class FakeParam {
  value = 0;
  setValueAtTime(): FakeParam {
    return this;
  }
  setTargetAtTime(): FakeParam {
    return this;
  }
  exponentialRampToValueAtTime(): FakeParam {
    return this;
  }
  cancelScheduledValues(): FakeParam {
    return this;
  }
}

const fakeNode = () => ({
  connect(target: unknown): unknown {
    return target;
  },
  disconnect(): void {},
});

class FakeAudioContext {
  state = 'suspended';
  sampleRate = 48000;
  currentTime = 0;
  /** quantas fontes começaram: no iOS isso é o que libera o contexto */
  started = 0;
  resumes = 0;
  destination = fakeNode();
  private cbs: Array<() => void> = [];

  addEventListener(type: string, cb: () => void): void {
    if (type === 'statechange') this.cbs.push(cb);
  }
  createGain(): unknown {
    return { ...fakeNode(), gain: new FakeParam() };
  }
  createDynamicsCompressor(): unknown {
    return { ...fakeNode(), threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam() };
  }
  createBuffer(ch: number, len: number, sr: number): unknown {
    const data = new Float32Array(len);
    return {
      length: len,
      duration: len / sr,
      sampleRate: sr,
      numberOfChannels: ch,
      getChannelData: (): Float32Array => data,
    };
  }
  createBufferSource(): unknown {
    const ctx = this;
    return {
      ...fakeNode(),
      buffer: null,
      loop: false,
      onended: null as (() => void) | null,
      playbackRate: new FakeParam(),
      start(): void {
        ctx.started++;
      },
      stop(): void {},
    };
  }
  resume(): Promise<void> {
    this.resumes++;
    if (this.state === 'interrupted') return Promise.reject(new Error('InvalidStateError'));
    // a política do iOS: sem fonte tocando, resume resolve mas o contexto CONTINUA suspenso
    if (this.started > 0) {
      this.state = 'running';
      for (const cb of this.cbs) cb();
    }
    return Promise.resolve();
  }
  interrupt(): void {
    this.state = 'interrupted';
    for (const cb of this.cbs) cb();
  }
  endInterruption(): void {
    this.state = this.started > 0 ? 'running' : 'suspended';
    for (const cb of this.cbs) cb();
  }
  suspendByBrowser(): void {
    // aba escondida: o browser congela um bus que JÁ estava destravado
    this.state = 'suspended';
    for (const cb of this.cbs) cb();
  }
}

let contexts: FakeAudioContext[] = [];

beforeEach(() => {
  contexts = [];
  const Registered = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  (globalThis as Record<string, unknown>).AudioContext = Registered;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).AudioContext;
});

/** o core é um singleton de módulo; cada teste precisa do módulo recém-importado */
async function freshCore() {
  vi.resetModules();
  return import('../audio/core');
}

const lastCtx = (): FakeAudioContext => contexts[contexts.length - 1];
const settle = (): Promise<void> => new Promise((r) => window.setTimeout(r, 10));

describe('unlock de áudio na política do WebKit/iOS', () => {
  it('o contexto só nasce dentro do gesto, e a amostra muda (warmUp) é o que o abre', async () => {
    const core = await freshCore();
    expect(contexts.length).toBe(0); // nada de contexto criado fora de gesto
    let ready = 0;
    core.onAudioReady(() => ready++);
    const cleanup = core.unlockAudio();

    document.dispatchEvent(new Event('pointerdown'));
    const ctx = lastCtx();
    expect(contexts.length).toBe(1);
    expect(ctx.started).toBeGreaterThanOrEqual(1); // warmUp: a fonte muda tocou DENTRO do gesto
    await settle();
    expect(ctx.state).toBe('running'); // só abriu porque started > 0 (política do fake)
    expect(ready).toBeGreaterThanOrEqual(1);
    cleanup();
  });

  it('resume() SEM warmUp não abre o iOS: o contexto segue suspenso até a amostra mudar tocar', async () => {
    const core = await freshCore();
    const c = core.ensureCore(); // simula o fluxo antigo: contexto criado fora de gesto
    expect(c).not.toBeNull();
    const ctx = lastCtx();
    core.resumeCore();
    await settle();
    expect(ctx.resumes).toBe(1);
    expect(ctx.started).toBe(0); // nada tocou dentro de um gesto…
    expect(ctx.state).toBe('suspended'); // … e resume sozinho não abriu (a armadilha do iOS)

    const cleanup = core.unlockAudio();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(ctx.started).toBeGreaterThanOrEqual(1); // a amostra do gesto abriu a porteira
    expect(ctx.state).toBe('running');
    cleanup();
  });

  it('estado "interrupted" (chamada/Siri/segundo plano): recusa resume durante a interrupção e reabre sem gesto novo', async () => {
    const core = await freshCore();
    let ready = 0;
    core.onAudioReady(() => ready++);
    const cleanup = core.unlockAudio();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    const ctx = lastCtx();
    expect(ctx.state).toBe('running');
    const afterUnlock = ready; // o gesto inicial já deu ready

    ctx.interrupt(); // iOS: liga/Siri/segundo plano derrubam o contexto
    core.resumeCore();
    await settle();
    expect(ctx.state).toBe('interrupted'); // durante a interrupção o iOS recusa (InvalidStateError)
    expect(ready).toBe(afterUnlock); // bus morto: nada de "pronto" novo

    ctx.endInterruption(); // a chamada terminou: o WebKit avisa por statechange
    await settle();
    expect(ctx.state).toBe('running');
    expect(ready).toBeGreaterThan(afterUnlock); // ready reaceso: música/sfx remarcam sem gesto novo
    cleanup();
  });

  it('gesture rearma: touchend destrava e visibilitychange reabre o bus suspenso', async () => {
    const core = await freshCore();
    const c = core.ensureCore(); // contexto existe, suspenso (criado fora de gesto a título de teste)
    expect(c).not.toBeNull();
    expect(lastCtx().state).toBe('suspended');
    const cleanup = core.unlockAudio();
    document.dispatchEvent(new Event('touchend'));
    await settle();
    expect(lastCtx().started).toBeGreaterThanOrEqual(1); // touchend aquece destrava (memória do iOS antigo)
    expect(lastCtx().state).toBe('running');
    cleanup();

    // volta de segundo plano: o browser suspendeu um bus JÁ destravado;
    // visibilitychange reabre sem toque novo
    const core2 = await freshCore();
    const cleanup2 = core2.unlockAudio();
    document.dispatchEvent(new Event('pointerdown'));
    await settle();
    const ctx2 = lastCtx();
    expect(ctx2.state).toBe('running');
    ctx2.suspendByBrowser(); // o browser congela a aba escondida
    expect(ctx2.state).toBe('suspended');
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER); // fora do janela de throttle
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    nowSpy.mockRestore();
    expect(ctx2.state).toBe('running'); // reaberto sem gesto novo
    cleanup2();
  });
});

describe('pinos estáticos da lição do iOS', () => {
  it('core: warmUp (fonte muda), touchend e o estado interrupted estão presentes', () => {
    expect(CoreSource).toContain('interrupted');
    expect(CoreSource).toContain('touchend');
    expect(CoreSource).toContain('visibilitychange');
    const warm = CoreSource.indexOf('function warmUp');
    expect(warm).toBeGreaterThan(0);
    expect(CoreSource.slice(warm, warm + 800)).toContain('createBufferSource');
    expect(CoreSource.slice(warm, warm + 800)).toContain('start(0)');
  });

  it('sfx e música NUNCA criam o AudioContext — só leem o core e tentam reabrir', () => {
    expect(SfxSource).not.toContain('ensureCore');
    expect(MusicSource).not.toContain('ensureCore');
    expect(SfxSource).toContain('resumeCore()');
    expect(MusicSource).toContain('resumeCore()');
  });
});
