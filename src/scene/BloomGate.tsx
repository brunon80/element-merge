import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { useGameStore } from '../store/gameStore';

/**
 * O BLOOM DO QUASAR (autorizado pelo usuário SÓ pro disco do Primordial — a
 * decisão está no HANDOFF). Como o pedido amarra: o brilho do disco precisa de
 * pós-processamento de verdade (anel de fótons em HDR estourando pra fora da
 * tela), mas "a arena inteira não pode trocar de pipeline por causa de uma
 * unidade". Este componente resolve os dois.
 *
 * ## Por que o pipeline é SEMPRE o composer (montado desde o primeiro frame) e
 * ## o que é gateado é o próprio bloom
 *
 * Ligar/desligar o composer quando um primordial nasce/morre trocaria o caminho
 * de cor da arena inteira num único frame — com o pipeline permanente, o
 * `UnrealBloomPass` entra e sai (subindo e descendo a rampa) e TODO o resto é
 * pixel a pixel o que a arena já mostra hoje sem pós nenhum.
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
 *    escureceria inteira quando o primordial piscasse em cena. Daí o
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
 * de luminância: o anel de fótons do disco sai >1 do shader no RT HalfFloat
 * (Float16 segura o HDR) e é exatamente isso que o `UnrealBloomPass` pesca —
 * 0,8 no display-referred é perto do branco, só o horizonte acende.
 *
 * ## O gate
 *
 * `UnrealBloomPass.enabled` segue "existe um primordial vivo em cena" (morto:
 * rampa de volta a zero durante a pose de morte, o disco já apaga sozinho).
 * O RT HalfFloat + MSAA `samples: 4` (o canvas nu tinha MSAA nativo; sem
 * samples o composer trocaria serrilhado bom por serrilhado pior) existem
 * sempre — o pass de bloom desligado não desenha nada (o EffectComposer pula
 * passes disabled), então o custo do gate fechado é só o RT + a cópia.
 * O palco da enciclopédia (outro contexto, outro Canvas) fica intocado: o
 * print do card do primordial não floresce, igual ao resto da árvore.
 */

/** fundo oficial da arena (era o `args={['#0b1020']}` do `<color attach>` no
 *  App; mora aqui agora porque é o clearColor do RenderPass — e é LIDO pelo App
 *  para o `<fog>`, mantendo os dois no mesmo tom) */
export const ARENA_BG = '#0b1020';

/** os três números do florecer do disco: intensidade, espalhamento e o limiar
 *  (0,8 no display-referred = perto do branco; só o azó do horizonte passa) */
const BLOOM_STRENGTH = 0.62;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.8;
/** a rampa (por segundo): ~0,25 s acendendo quando o quasar nasce, ~0,25 s
 *  apagando quando ele morre — ninguém merece pop de pós-processamento */
const BLOOM_RAMP = 2.5;

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

export function BloomGate() {
  const { gl, scene, camera, size } = useThree();
  const primAlive = useGameStore(
    (s) => s.units.some((u) => u.species === 'primordial' && !u.dying),
  );

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
    // fundo pelo RenderPass: o setClearColor dele roda com o canvas ainda
    // vinculado, então o three codifica pro espaço do framebuffer e o RT
    // recebe o hex cru — fechando a convenção display-referred (ver o doc do
    // topo)
    const renderPass = new RenderPass(scene, camera, null, new THREE.Color(ARENA_BG));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(rt.width, rt.height),
      0, // strength: a rampa decide (começa apagado)
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    bloom.enabled = false;
    const copy = new ShaderPass(CopyShader); // a cópia pura SEM codificação — é
    // ela que fecha a conta: o buffer já vale "o que o framebuffer mostra"
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(copy);
    composer.setSize(size.width, size.height); // crava CSS px + _pixelRatio certo
    return { composer, bloom, copy, renderPass };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // gate: só o pass de bloom entra/sai; o pipeline é sempre o mesmo
  const strength = useRef(0);
  useEffect(() => {
    // o fundo do scene sai de cena (literalmente): quem pinta é o clearColor do
    // RenderPass, do contrário o WebGLBackground limparia o RT em linear
    const prev = scene.background;
    scene.background = null;
    return () => {
      scene.background = prev;
    };
  }, [scene]);

  useEffect(() => {
    return () => {
      stack.composer.dispose();
      stack.bloom.dispose();
      stack.copy.dispose();
      stack.renderPass.dispose();
      unpatchBuiltins(scene);
    };
  }, [stack, scene]);

  useEffect(() => {
    stack.composer.setSize(size.width, size.height);
  }, [stack, size.width, size.height]);

  useFrame((_, dt) => {
    patchBuiltins(scene); // material novo que spawnou no meio da partida
    const target = primAlive ? BLOOM_STRENGTH : 0;
    const cur = strength.current;
    if (cur !== target) {
      const step = BLOOM_RAMP * dt;
      strength.current = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
    }
    const v = strength.current;
    stack.bloom.enabled = v > 0.004;
    stack.bloom.strength = v;
    stack.composer.render(Math.min(dt, 0.05));
  }, 1); // >0: o R3F deixa de desenhar sozinho e quem desenha é o composer

  return null;
}
