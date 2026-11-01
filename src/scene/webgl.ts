/**
 * Compatibilidade de WebGL com o iOS (WebKit) — as duas armadilhas do iPhone que
 * o desktop não cobra:
 *
 *  1. **teto de contextos WebGL**: o Safari segura poucos contextos vivos e,
 *     quando estoura, PERDE O MAIS ANTIGO — que é justamente o canvas da
 *     batalha. Cada card do bestiário montava o próprio `<Canvas>`, então abrir
 *     a enciclopédia derrubava a cena 3D no iPhone (parecia que "os shaders
 *     sumiam"). `forceContextLoss` no desmonte + orçamento de slots NÃO
 *     resolveu: a contagem do Safari só cai no GC, e o GC chega tarde demais.
 *     Daí a arquitetura de hoje: DOIS contextos no jogo — o da batalha e um
 *     único palco da enciclopédia (`BestiaryStage`), que desenha cada card numa
 *     janela do próprio framebuffer (scissor). Fechar a enciclopédia já devolve
 *     o contexto sozinho: o `unmountComponentAtNode` do r3f chama
 *     `gl.forceContextLoss()` — e não chamar de novo, porque o WebKit reclama
 *     `loseContext: context already lost`. Sondar o teto com
 *     `qa/probe-context-cap.mjs` não vale: contexto sintético que não desenha o
 *     WebKit nem conta.
 *  2. **WebGL2 obrigatório**: o three r169 não fala mais WebGL1. Em iOS < 15 o
 *     construtor do renderer JOGA — o guard do App (`GLBoundary`) transforma
 *     isso em aviso legível, não em tela preta.
 */

let cachedWebGL2: boolean | null = null;

/**
 * O navegador entrega um contexto WebGL2? (iOS Safari só a partir do iOS 15.)
 * CACHE OBRIGATÓRIO: isto é chamado em todo render de card do bestiário, e cada
 * chamada cria um canvas e pede um contexto — sem cache a página estouraria o
 * teto de contextos do próprio Safari por perguntar demais.
 */
export function hasWebGL2(): boolean {
  if (cachedWebGL2 !== null) return cachedWebGL2;
  try {
    cachedWebGL2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    cachedWebGL2 = false;
  }
  return cachedWebGL2;
}
