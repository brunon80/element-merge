/**
 * Carregador sob demanda das malhas da linha "modelos 3D" — O FIM DA TROCA
 * COM TRAVA (a lição do spawn: o GLB caía no colo do campo, o figurino antigo
 * subia de fallback, e quando o download terminava o board ENGASGAVA para
 * parsear e trocar o bicho na frente do jogador).
 *
 * As regras da casa:
 *  1. NADA de baixar os 121 MB na abertura — só desce o que o campo vai
 *     mostrar (ou o que a loja/prévia/bestiário AVISAREM que vem, via
 *     `ensureModel`);
 *  2. `readModel(url)` nunca devolve "meio GLB": sem cache, ele THROWS na
 *     promise do download e o `Suspense` do dispatcher segura o buraco com o
 *     SELO PROCEDURAL DE INVOCÇÃO (`scene/SummonFX.tsx`) — nunca o monstro
 *     antigo;
 *  3. a promise arremessada NUNCA rejeita: se a rede cair, este módulo tenta
 *     sozinho (backoff exponencial) e, quando conseguir, o React acorda o
 *     ramo suspenso sozinho também — sem crash de error boundary no meio da
 *     partida;
 *  4. o pedágio do `GLTFLoader.parse` (bloqueia a main thread) é SERIALIZADO
 *     numa fila de promises: dois GLBs nunca são parseados colados no mesmo
 *     frame, e entre um parse e outro o board respira (o yield no fim da
 *     fila deixa o navegador pintar).
 */
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelState = 'loading' | 'parsing' | 'retrying' | 'ready';

interface Entry {
  url: string;
  gltf: GLTF | null;
  state: ModelState;
  bytes: number; // bytes baixados na tentativa atual (para o selo mostrar)
  size: number; // content-length do GLB (0 = desconhecido)
  attempt: number;
  promise: Promise<void>; // resolve só quando gltf != null; NUNCA rejeita
}

const entries = new Map<string, Entry>();

/** fila do pedágio do parse (regra 4): cada parse entra no rabo da anterior */
let parseTail: Promise<unknown> = Promise.resolve();

function queueParse(buf: ArrayBuffer): Promise<GLTF> {
  const run = () =>
    new Promise<GLTF>((resolve, reject) => {
      new GLTFLoader().parse(buf, '', resolve, (ev: { message?: string }) =>
        reject(new Error(ev?.message ?? String(ev))),
      );
    });
  // entra na fila mesmo se o vizinho de cima falhou (senão a fila engargala)
  const task = parseTail.then(run, run);
  parseTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function fetchBytes(
  url: string,
  onBytes: (got: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (res.body && total > 0) {
    // leitura em stream só para o selo encher o arco de invocação com o
    // progresso REAL do download (sem isso o arco seria adivinhação)
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      onBytes(got, total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out.buffer;
  }
  const buf = await res.arrayBuffer();
  onBytes(buf.byteLength, buf.byteLength);
  return buf;
}

async function run(entry: Entry): Promise<void> {
  entry.state = 'loading';
  entry.bytes = 0;
  try {
    const buf = await fetchBytes(entry.url, (got, total) => {
      entry.bytes = got;
      if (total) entry.size = total;
    });
    entry.state = 'parsing';
    entry.gltf = await queueParse(buf);
    entry.state = 'ready';
    entry.bytes = entry.size;
    entry.attempt = 0;
  } catch (err) {
    // NUNCA rejeita (regra 3): o `Suspense` suspenso nesta promise não tem
    // error boundary próprio e a partida morria inteira. Caiu, recomeça com
    // backoff — o selo continua no buraco, só que em ponto de interrogação.
    console.warn(`[malha] download/parse falhou (${entry.url}):`, err);
    entry.state = 'retrying';
    entry.bytes = 0;
    const delay = Math.min(20000, 1500 * 2 ** entry.attempt);
    entry.attempt += 1;
    await new Promise<void>((r) => setTimeout(r, delay));
    return run(entry);
  }
}

function ensure(url: string): Entry {
  let e = entries.get(url);
  if (!e) {
    e = { url, gltf: null, state: 'loading', bytes: 0, size: 0, attempt: 0, promise: Promise.resolve() };
    e.promise = run(e);
    entries.set(url, e);
  }
  return e;
}

/**
 * Pré-baixa avisada: loja, prévia de fusão, bestiário — quem sabe que a malha
 * VEM chama aqui e o download larga na frente. Idempotente e silencioso.
 */
export function ensureModel(url: string): void {
  void ensure(url);
}

/**
 * O figurino lê a malha por aqui (dentro do `Suspense`): sem cache, arremessa
 * a promise do download e o dispatcher segura o buraco com o selo de
 * invocação — quando a promise resolve, o React remonta o figurino em mesh.
 */
export function readModel(url: string): GLTF {
  const e = ensure(url);
  if (e.gltf) return e.gltf;
  throw e.promise;
}

/**
 * Régua do selo: quanto deste GLB já chegou (lida a cada frame pelo
 * `SummonFX`, sem subscription — o selo já gira no useFrame dele).
 */
export function getLoadProgress(url: string): { state: ModelState; fraction: number } {
  const e = ensure(url);
  const fraction = e.gltf ? 1 : e.size > 0 ? Math.min(1, e.bytes / e.size) : 0;
  return { state: e.state, fraction };
}
