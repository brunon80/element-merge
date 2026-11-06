import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { useGameStore } from '../store/gameStore';
import { MAX_BLOOM_INTENSITY } from '../persistence/saveGame';

export const SCENERY_BLOOM_LAYER = 1;

/**
 * Pós-processamento bloom da arena. A intensidade é controlada pelo jogador;
 * quando está em zero, o compositor é contornado para dispensar o custo extra.
 * O disco do Primordial continua usando HDR e recebe o mesmo efeito global.
 *
 * ## O compositor é criado uma vez e usado enquanto o bloom está ativo
 *
 * Com o pipeline ativo, o `UnrealBloomPass` sobe e desce suavemente conforme a
 * configuração muda. Ao desligá-lo, o render direto preserva o caminho de cor
 * da arena sem pós-processamento.
 *
 * ## A armadilha de cor (three r169) — e por que o pass final NÃO codifica
 *
 * Quase tudo aqui é ShaderMaterial cru (pedra, gelo, plasma, pó, anéis): esses
 * shaders são afinados print a print DISPLAY-REFERRED e escrevem `gl_FragColor`
 * cru no framebuffer sRGB do canvas (ShaderMaterial não recebe o chunk
 * `colorspace_fragment`). Materiais embutidos (Arena padrão, sprites, halos
 * basic) são o caminho color-managed: linear + tone map ACES + sRGB aplicados
 * pelo three NA HORA de desenhar no canvas. O problema: quando o three desenha
 * num RENDER TARGET, ele FORÇA os dois passos a virarem identidade —
 * `toneMapping` só vale se `_currentRenderTarget === null` e `outputColorSpace`
 * do RT não-XR é cravado em LinearSRGB (three.module.js: o `setProgram` decide
 * isso no draw de cada material). Então no pipeline do composer:
 *
 *  - ShaderMaterials crus: continuam escrevendo o valor display-referred cru
 *    (ninguém mexe neles) → no RT eles JÁ chegam no formato do framebuffer;
 *  - materiais EMBUTIDOS: chegariam LINEAR no RT (sem ACES, sem sRGB) e a arena
 *    escureceria inteira ao ativar o bloom. Daí o
 *    `patchBuiltins`: enquanto o composer é o caminho, a codificação que o three
 *    faria no canvas é devolvida MATERIAL A MATERIAL, no instante da escrita no
 *    RT — o `onBeforeCompile` troca os includes `tonemapping_fragment`/
 *    `colorspace_fragment` pelos mesmos ACESFilmic/sRGBTransferOETF do three,
 *    colados verbatim do chunk (exposure 1, o default que o R3F nunca mudou).
 *  - o fundo: com `scene.background` setado, o `WebGLBackground` limpa o RT com
 *    valor LINEAR (mesma regra do target). Por isso o App não anexa mais
 *    `background` no scene: este componente crava `scene.background = null` e o
 *    `RenderPass.clearColor` assume o `ARENA_BG` — como o `RenderPass` chama
 *    `setClearColor` ANTES de vincular o RT, o three codifica esse clear pro
 *    espaço do canvas (getUnlitUniformColorSpace) e o RT recebe o hex cru
 *    display-referred, exatamente como o framebuffer recebe hoje.
 *
 * Com os três pedaços compensados, o buffer do composer vale "o que o
 * framebuffer mostra" e o pass final é uma CÓPIA PURA (ShaderPass do
 * CopyShader, sem `OutputPass` — OutputPass codificaria de novo e estouraria os
 * ~90% da cena que já chega display-referred). O bloom ainda extrai pelo limiar
 * de luminância: pixels acima do limiar acendem, incluindo valores HDR do disco
 * de fótons do Primordial. O RT HalfFloat preserva esses valores; no
 * display-referred, 0,8 é perto do branco.
 *
 * ## O gate
 *
 * A intensidade positiva ativa o composer e o bloom. O RT HalfFloat + MSAA
 * `samples: 4` (o canvas nu tinha MSAA nativo; sem samples o composer trocaria
 * serrilhado bom por serrilhado pior) são usados enquanto o efeito estiver
 * ativo. Em intensidade zero, a cena volta ao render direto.
 * O palco da enciclopédia (outro contexto, outro Canvas) fica intocado: o
 * print do card do primordial não floresce, igual ao resto da árvore.
 */

/** fundo oficial da arena (era o `args={['#0b1020']}` do `<color attach>` no
 *  App; mora aqui agora porque é o clearColor do RenderPass — e é LIDO pelo App
 *  para o `<fog>`, mantendo os dois no mesmo tom) */
export const ARENA_BG = '#0b1020';

/** Teto visual: o bloom não deve exceder o nível que era usado em 50%. */
const BLOOM_MAX_STRENGTH = 0.62;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.8;

/**
 * DESVIOS DE QA (só dev, por URL): bisectar pipeline sem picotar o fonte.
 * `?qtNoBloom=1` liga o pass de bloom pra nunca (o resto do composer fica);
 * `?qtNoComposer=1` tira o composer do caminho e devolve o `gl.render` nu de
 * sempre (fundo pelo `WebGLBackground`, sem patch de cor) — é o A/B de pixel da
 * arena e a sonda de bug de pós (`qa/probe-blackfix.mjs` usa os dois).
 */
const QA_FLAGS = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
const QA_NO_BLOOM = !!import.meta.env.DEV && QA_FLAGS?.get('qtNoBloom') === '1';
const QA_NO_COMPOSER = !!import.meta.env.DEV && QA_FLAGS?.get('qtNoComposer') === '1';
/** Suaviza mudanças rápidas no controle para evitar pop visual. */
const BLOOM_RAMP = 2.5;

/**
 * O CINTO ANTI-NÃO-FINITO (2026/11, lesson do "quadrado preto" no iOS/WebKit).
 * O `renderTarget1` é HDR (HalfFloat): o anel de fótons escreve >1 ali de
 * propósito. Qualquer texel NaN/Inf que caia nesse buffer é pescado pelo
 * highpass do bloom e CADA borrão da escada de mips MULTIPLICA a contaminação
 * (medido: 6 texels -> 91 -> 912 -> 6.992 -> 48.096 -> 309.132), o compósito
 * somatório devolve a mancha pro buffer da cena e a cópia final amostra NaN como
 * PRETO PURO — foi assim que o Primordial inteiro virou um quadrado preto de
 * 560x556 px no iPhone. A raiz foi consertada no fonte (clamp + discard à prova
 * de NaN no JET_FRAG/DISK_FRAG do rig — qa/probe-nansource.mjs provou o
 * paralelismo 1:1 `cenaNaN>0 ⟺ BLOCO`), mas este pass fica de cinto: ele é o
 * primeiro leitura-depois-da-cena do pipeline, então zerar não-finito AQUI
 * custa um texel a texel numa passada só e protege a cadeia inteira de qualquer
 * rig futuro. O teto 65504 é o máx do HalfFloat: acima disso o texel já seria
 * Inf no próprio buffer.
 */
const SANITIZE_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec4 c = texture2D( tDiffuse, vUv );
  // comparação invertida de propósito: NaN não passa em NENHUMA comparação de
  // "maior-igual", então um canal podre derruba o texel inteiro pra zero (texel
  // podre não tem cor digna de guardar metade)
  vec3 rgb = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 ? c.rgb : vec3( 0.0 );
  float a = c.a >= 0.0 && c.a <= 1.0 ? c.a : 0.0;
  gl_FragColor = vec4( min( rgb, vec3( 65504.0 ) ), a );
}
`,
};

const SCENERY_COMPOSITE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uScenerySource: { value: null as THREE.Texture | null },
    uSceneryBloom: { value: null as THREE.Texture | null },
    uSceneryIntensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D uScenerySource;
uniform sampler2D uSceneryBloom;
uniform float uSceneryIntensity;
varying vec2 vUv;
void main() {
  vec4 base = texture2D( tDiffuse, vUv );
  if ( uSceneryIntensity > 0.0 ) {
    vec3 source = texture2D( uScenerySource, vUv ).rgb;
    vec3 bloomed = texture2D( uSceneryBloom, vUv ).rgb;
    base.rgb += max( bloomed - source, vec3( 0.0 ) ) * uSceneryIntensity;
  }
  gl_FragColor = base;
}
`,
};

/** os dois pedaços de GLSL que devolvem ao material embutido a conta que o
 *  three faria se estivesse desenhando no canvas (verbatim dos chunks r169,
 *  exposure 1) */
const ENCODE_HEAD = /* glsl */ `
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
vec4 qtSRGBEncode( in vec4 value ) {
  return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec3 qtRRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 qtACESFilmic( vec3 color ) {
  const mat3 ACESInputMat = mat3(
    vec3( 0.59719, 0.07600, 0.02840 ),   vec3( 0.35458, 0.90834, 0.13383 ),
    vec3( 0.04823, 0.01566, 0.83777 )
  );
  const mat3 ACESOutputMat = mat3(
    vec3(  1.60475, -0.10208, -0.00327 ),  vec3( -0.53108,  1.10813, -0.07276 ),
    vec3( -0.07367, -0.00605,  1.07602 )
  );
  color /= 0.6;
  color = ACESInputMat * color;
  color = qtRRTAndODTFit( color );
  color = ACESOutputMat * color;
  return saturate( color );
}
`;

interface PatchableShader {
  fragmentShader: string;
}
interface Patchable {
  userData: Record<string, unknown>;
  onBeforeCompile?: (shader: PatchableShader) => void;
  customProgramCacheKey?: () => string;
}

/**
 * Devolve aos materiais EMBUTIDOS (tudo que não é ShaderMaterial cru — a
 * cantaria padrão da Arena, sprites, halos) a codificação ACES+sRGB que o three
 * pula quando desenha num render target. Idempotente e barato: o traverse por
 * frame só troca material novo (rig que spawnou no meio da partida é o único
 * caso), todo o resto já vem com o carimbo no userData.
 */
function patchBuiltins(scene: THREE.Scene) {
  scene.traverse((o) => {
    const any = o as unknown as { material?: THREE.Material | THREE.Material[] };
    const m = any.material;
    if (!m) return;
    if (Array.isArray(m)) {
      for (const mm of m) patchOne(mm);
    } else {
      patchOne(m);
    }
  });
}

function patchOne(m: THREE.Material) {
  if ((m as { isShaderMaterial?: boolean }).isShaderMaterial) return; // cru: já escreve display-referred, intocado
  const p = m as unknown as Patchable;
  if (p.userData.qtBloom) return;
  p.userData.qtBloom = true;
  const tone = m.toneMapped; // false = o próprio traço já pedia zero tone map nos dois caminhos
  p.onBeforeCompile = (shader) => {
    let f = shader.fragmentShader;
    if (tone && f.includes('#include <tonemapping_fragment>')) {
      f = f.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = qtACESFilmic( gl_FragColor.rgb );');
    }
    if (f.includes('#include <colorspace_fragment>')) {
      f = f.replace('#include <colorspace_fragment>', 'gl_FragColor = qtSRGBEncode( gl_FragColor );');
    }
    shader.fragmentShader = ENCODE_HEAD + '\n' + f;
  };
  p.customProgramCacheKey = () => 'qtBloomEncode';
  m.needsUpdate = true;
}

function unpatchBuiltins(scene: THREE.Scene) {
  scene.traverse((o) => {
    const any = o as unknown as { material?: THREE.Material | THREE.Material[] };
    const m = any.material;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    for (const mm of list) {
      const p = mm as unknown as Patchable;
      if (!p.userData.qtBloom) continue;
      p.userData.qtBloom = false;
      // de volta ao no-op do prototype do three (o setProgram chama sem checar)
      delete p.onBeforeCompile;
      delete p.customProgramCacheKey;
      mm.needsUpdate = true;
    }
  });
}

export function BloomGate({ backgroundColor = ARENA_BG }: { backgroundColor?: string }) {
  const { gl, scene, camera, size } = useThree();
  const bloomIntensity = useGameStore((s) => s.bloomIntensity);
  const sceneryBloomIntensity = useGameStore((s) => s.sceneryBloomIntensity);
  // 🔋 modo econômico: a bateria vence — mesmo com bloom configurado o
  // compositor (RT HalfFloat MSAA + escada de mips do UnrealBloom + cópia,
  // ~6 passes fullscreen) fica desligado; a cena volta ao render direto.
  const ecoActive = useGameStore((s) => s.ecoActive);
  const useComposer = !QA_NO_COMPOSER && !ecoActive && (bloomIntensity > 0 || sceneryBloomIntensity > 0);

  const stack = useMemo(() => {
    // RT do composer: HalfFloat segura o HDR do anel de fótons (o highpass lê
    // >1 e o bloom pesca); samples 4 devolve o MSAA que o canvas nu tinha nativo
    const dpr = gl.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(size.width * dpr)),
      Math.max(1, Math.round(size.height * dpr)),
      { type: THREE.HalfFloatType, samples: 4 },
    );
    const composer = new EffectComposer(gl, rt);
    composer.renderToScreen = false;
    // Higiene de plumbing (NÃO é o conserto do quadrado preto — esse conserto
    // é o NaN na raiz dos shaders do rig + o cinto logo abaixo; ver lesson no
    // HANDOFF): o `EffectComposer` clona o RT do construtor, então o
    // `renderTarget2` herdaria `samples: 4`, e o `UnrealBloomPass` compõe de
    // volta DE FORMA aditiva no `readBuffer` — escrevendo num framebuffer
    // multisample que o three teria que resolver de novo pra cópia final ler
    // (resolve duplo no mesmo frame). Com o rt2 simples, o buffer multisample
    // é lido UMA vez e o bloom só mexe num HalfFloat simples.
    composer.renderTarget2.samples = 0;
    // fundo pelo RenderPass: o setClearColor dele roda com o canvas ainda
    // vinculado, então o three codifica pro espaço do framebuffer e o RT
    // recebe o hex cru — fechando a convenção display-referred (ver o doc do
    // topo)
    const renderPass = new RenderPass(scene, camera, null, new THREE.Color(backgroundColor));
    // resolve do multisample + cinto anti-Não-Finito: cópia do buffer
    // multisample pro simples com a sanificação do SANITIZE_SHADER no mesmo draw.
    const resolve = new ShaderPass(SANITIZE_SHADER);
    resolve.enabled = false;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(rt.width, rt.height),
      0, // strength: a rampa decide (começa apagado)
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    bloom.enabled = false;
    const composite = new ShaderPass(SCENERY_COMPOSITE_SHADER);
    const screenCopy = new ShaderPass(CopyShader);
    screenCopy.renderToScreen = true;
    composer.addPass(renderPass);
    composer.addPass(resolve);
    composer.addPass(bloom);
    composer.addPass(composite);
    composer.setSize(size.width, size.height); // crava CSS px + _pixelRatio certo
    const sceneryCapture = new THREE.WebGLRenderTarget(rt.width, rt.height, {
      type: THREE.HalfFloatType,
    });
    const scenerySource = sceneryCapture.clone();
    const sceneryBloomTarget = sceneryCapture.clone();
    const scenerySanitize = new ShaderPass(SANITIZE_SHADER);
    const sceneryCopy = new ShaderPass(CopyShader);
    const sceneryBloom = new UnrealBloomPass(
      new THREE.Vector2(rt.width, rt.height),
      0.5,
      BLOOM_RADIUS,
      0.42,
    );
    const target = gl.getRenderTarget();
    const clearColor = gl.getClearColor(new THREE.Color()).clone();
    const clearAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    for (const sceneryTarget of [sceneryCapture, scenerySource, sceneryBloomTarget]) {
      gl.setRenderTarget(sceneryTarget);
      gl.clear(true, true, true);
    }
    gl.setRenderTarget(target);
    gl.setClearColor(clearColor, clearAlpha);
    return {
      composer,
      bloom,
      composite,
      screenCopy,
      renderPass,
      resolve,
      sceneryCapture,
      scenerySource,
      sceneryBloomTarget,
      scenerySanitize,
      sceneryCopy,
      sceneryBloom,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // Mantém a configuração da cena sincronizada com o modo de renderização.
  const strength = useRef(0);
  useEffect(() => {
    // o fundo do scene sai de cena (literalmente): quem pinta é o clearColor do
    // RenderPass, do contrário o WebGLBackground limparia o RT em linear. Com o
    // desvio `qtNoComposer` é o inverso: devolve o fundo ao WebGLBackground.
    const prev = scene.background;
    scene.background = useComposer ? null : new THREE.Color(backgroundColor);
    if (!useComposer) unpatchBuiltins(scene);
    return () => {
      scene.background = prev;
    };
  }, [scene, backgroundColor, useComposer]);

  useEffect(() => {
    return () => {
      stack.composer.dispose();
      stack.bloom.dispose();
      stack.composite.dispose();
      stack.screenCopy.dispose();
      stack.resolve.dispose();
      stack.renderPass.dispose();
      stack.sceneryCapture.dispose();
      stack.scenerySource.dispose();
      stack.sceneryBloomTarget.dispose();
      stack.scenerySanitize.dispose();
      stack.sceneryCopy.dispose();
      stack.sceneryBloom.dispose();
      unpatchBuiltins(scene);
    };
  }, [stack, scene]);

  useEffect(() => {
    stack.composer.setSize(size.width, size.height);
    const width = Math.max(1, Math.round(size.width * gl.getPixelRatio()));
    const height = Math.max(1, Math.round(size.height * gl.getPixelRatio()));
    stack.sceneryCapture.setSize(width, height);
    stack.scenerySource.setSize(width, height);
    stack.sceneryBloomTarget.setSize(width, height);
    stack.sceneryBloom.setSize(width, height);
  }, [gl, stack, size.width, size.height]);

  useFrame((_, dt) => {
    // cabo da cena para as sondas de QA (só dev): varre a cena atrás de NaN e
    // lê de volta os RTs HalfFloat — qa/probe-nansource.mjs, qa/probe-frozen.mjs,
    // qa/probe-blackfix.mjs (o `composer` no cabo é o que congela o pipeline)
    if (import.meta.env.DEV) {
      (window as unknown as { __QT?: unknown }).__QT = { scene, camera, gl, THREE, composer: stack.composer };
    }
    if (!useComposer) {
      // Sem bloom, usa o render direto para evitar render targets e passes extras.
      strength.current = 0;
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }
    stack.renderPass.clearColor?.set(backgroundColor);
    patchBuiltins(scene); // material novo que spawnou no meio da partida
    const target = QA_NO_BLOOM
      ? 0
      : (bloomIntensity / MAX_BLOOM_INTENSITY) * BLOOM_MAX_STRENGTH;
    const cur = strength.current;
    if (cur !== target) {
      const step = BLOOM_RAMP * dt;
      strength.current = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
    }
    const v = strength.current;
    stack.bloom.enabled = v > 0.004;
    stack.resolve.enabled = v > 0.004 || sceneryBloomIntensity > 0;
    stack.bloom.strength = v;

    if (sceneryBloomIntensity > 0) {
      const previousLayerMask = camera.layers.mask;
      const previousTarget = gl.getRenderTarget();
      const previousClearColor = gl.getClearColor(new THREE.Color()).clone();
      const previousClearAlpha = gl.getClearAlpha();
      try {
        camera.layers.set(SCENERY_BLOOM_LAYER);
        gl.setClearColor(0x000000, 0);
        gl.setRenderTarget(stack.sceneryCapture);
        gl.clear(true, true, true);
        gl.render(scene, camera);
      } finally {
        camera.layers.mask = previousLayerMask;
        gl.setRenderTarget(previousTarget);
        gl.setClearColor(previousClearColor, previousClearAlpha);
      }

      stack.scenerySanitize.render(gl, stack.scenerySource, stack.sceneryCapture, dt, false);
      stack.sceneryCopy.render(gl, stack.sceneryBloomTarget, stack.scenerySource, dt, false);
      stack.sceneryBloom.strength = 0.5;
      stack.sceneryBloom.render(
        gl,
        stack.sceneryBloomTarget,
        stack.sceneryBloomTarget,
        dt,
        false,
      );
    }

    stack.composite.uniforms.uScenerySource.value = stack.scenerySource.texture;
    stack.composite.uniforms.uSceneryBloom.value = stack.sceneryBloomTarget.texture;
    stack.composite.uniforms.uSceneryIntensity.value =
      sceneryBloomIntensity / MAX_BLOOM_INTENSITY;
    // PAPEL FIXO nos dois buffers: a cena SEMPRE cai no renderTarget1
    // (multisample) e o pós SEMPRE no renderTarget2 (simples). O
    // `EffectComposer` troca esses ponteiros a cada pass com `needsSwap`, então
    // sem travar aqui o frame seguinte jogaria a cena no buffer sem multisample
    // (o MSAA piscaria) e o bloom escreveria de novo num framebuffer multisample
    // — resolve duplo no mesmo frame, o plumbing que o rt2 `samples = 0` evita
    stack.composer.readBuffer = stack.composer.renderTarget1;
    stack.composer.writeBuffer = stack.composer.renderTarget2;
    stack.composer.render(Math.min(dt, 0.05));
    stack.screenCopy.render(
      gl,
      stack.composer.writeBuffer,
      stack.composer.readBuffer,
      dt,
      false,
    );
  }, 1); // >0: o R3F deixa de desenhar sozinho e quem desenha é o compositor

  return null;
}
