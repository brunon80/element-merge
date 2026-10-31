import * as THREE from 'three';

/**
 * Sonda de reflexo REAL para o cristal de gelo — adaptada da receita clássica
 * do three (`envMap: scene.background` + `combine: THREE.MixOperation` +
 * `reflectivity: .5`, stackoverflow.com/a/59530709). O detalhe: nosso
 * background é COR SOLID (#0b1020) — refletir só ele não acrescenta nada. A
 * adaptação é o envMap amostrar a ARENA inteira: um CubeCamera renderiza a
 * cena 6× em cubemap 128px e o shader do gelo mixa o cubemap no reflexo com
 * peso uEnvMix (~0.5, o "reflectivity" da receita), misturado (não
 * substituindo) o ambiente fake procedural que já ilumina as bordas.
 *
 * Cuidados:
 *  - UM TIRO POR CONTEXTO WebGL: a arena é estática (tabuleiro, arquibancada,
 *    luzes), então o primeiro Gelo captura e os demais cristais só plugam a
 *    mesma textura. Recapturar sempre criaria FEEDBACK inválido no WebGL
 *    (o material amostrando o cubemap que está sendo renderizado agora);
 *  - quem dispara a captura ESCONDE a si mesmo no instante do tiro: uma
 *    unidade capturada a partir do próprio centro viria embaçada refletindo
 *    a si mesma (blob gigante no cubemap);
 *  - um probe por renderer (batalha e bestiário são contextos WebGL
 *    diferentes; WeakMap libera a GPU junto com o renderer);
 *  - `blackCubeTexture()` é o placeholder pré-captura — mantém o sampler do
 *    shader válido sem afetar a imagem (o fake procedural cobre o mix).
 */

const ENV_SIZE = 128;

interface Probe {
  rt: THREE.WebGLCubeRenderTarget;
  cam: THREE.CubeCamera;
}

const probes = new WeakMap<THREE.WebGLRenderer, Probe>();

/** textura capturada (null até a primeira captura neste contexto WebGL) */
export function arenaEnvTexture(gl: THREE.WebGLRenderer): THREE.Texture | null {
  return probes.get(gl)?.rt.texture ?? null;
}

/**
 * Captura a arena ao redor de `at` (altura do peito de quem reflete) — mas
 * só se ainda não houver tiro neste contexto. Barato: 6 draws em 128px,
 * uma vez por cena WebGL; todos os cristais (rig, estaca, cacos) plugam a
 * MESMA textura (cubemap é a aproximação "ao infinito", basta a origem
 * estar no tabuleiro).
 */
export function captureArenaEnv(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  at: THREE.Vector3,
): THREE.Texture {
  const had = probes.get(gl);
  if (had) return had.rt.texture;
  const rt = new THREE.WebGLCubeRenderTarget(ENV_SIZE);
  const p = { rt, cam: new THREE.CubeCamera(0.35, 70, rt) };
  probes.set(gl, p);
  p.cam.position.copy(at);
  p.cam.update(gl, scene);
  return rt.texture;
}

/**
 * Pluga o cubemap capturado nos materiais de cristal que ainda só têm o
 * placeholder (idempotente; pode ser chamado a cada frame — o teste de
 * identidade ignora o resto).
 */
export function plugArenaEnv(gl: THREE.WebGLRenderer, mats: THREE.ShaderMaterial[]): void {
  const tex = arenaEnvTexture(gl);
  if (!tex) return;
  for (const m of mats) {
    const u = m.uniforms?.uEnv;
    if (u && u.value !== tex) u.value = tex;
  }
}

// placeholder pré-captura: cubo 2px azul-escuro (o fundo da arena). Só vira
// reflexo de verdade quando plugArenaEnv/captura trocam a textura.
let blackCube: THREE.CubeTexture | null = null;
export function blackCubeTexture(): THREE.CubeTexture {
  if (!blackCube) {
    const faces = Array.from({ length: 6 }, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#04070d';
        ctx.fillRect(0, 0, 2, 2);
      } // jsdom sem canvas: uploada preto mesmo, o sampler segue válido
      return c;
    });
    blackCube = new THREE.CubeTexture(faces);
    blackCube.needsUpdate = true;
  }
  return blackCube;
}
