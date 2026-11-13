/**
 * Ponte entre o MUNDO 3D e os pixels da janela, nos dois sentidos.
 *
 * A câmera só existe dentro do `<Canvas>`, então é a cena (`BattleScene`) que
 * registra aqui a ponte e o lado DOM a consome. Assim quem é HTML — a prévia de
 * fusões e a luvinha do tutorial — enxerga onde um corpo do tabuleiro mora na
 * tela (e para onde um ponto da tela cai no chão) sem precisar de um segundo
 * canal de estado no store.
 */
export interface WorldBridge {
  /** mundo → pixels da janela; null quando a projeção não vale (fora da câmera) */
  toScreen: (x: number, y: number, z: number) => { x: number; y: number } | null;
  /** pixels da janela → chão do tabuleiro (x, z); null quando o raio não bate */
  toGround: (clientX: number, clientY: number) => [number, number] | null;
}

let bridge: WorldBridge | null = null;

/** chamado pela cena (montagem/desmontagem) */
export function registerWorldBridge(b: WorldBridge | null): void {
  bridge = b;
}

/** null enquanto a cena não está montada (menu sem canvas, jsdom dos testes) */
export function worldToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
  return bridge ? bridge.toScreen(x, y, z) : null;
}

/** onde o ponto (clientX, clientY) da janela cai no chão da arena */
export function screenToGround(clientX: number, clientY: number): [number, number] | null {
  return bridge ? bridge.toGround(clientX, clientY) : null;
}
