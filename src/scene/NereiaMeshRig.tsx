import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import waterLvl1Url from '../models/water/water_model_lvl1.glb?url';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { getEngine } from '../store/gameStore';
import { circleTexture, setSeedAttribute } from './assets';
import { NOISE_GLSL } from './flameShaders';
import { TEAM_TINT } from './stoneShaders';
import {
  attackPose,
  makeSprayGeo,
  SPRAY_FRAG,
  SPRAY_VERT,
  WATER_ATTACK_WINDOW,
  WATER_ROLE_LOOK,
  WATER_WINDUP,
  WaterRig,
  type WaterRigProps,
} from './WaterRig';

/**
 * NEREIA Nv.1 de MALHA 3D IMPORTADA (linha "modelos 3D", molde do Ignis/Zéfiro
 * e do Golém): a unidade Nv.1 ("gotinha") troca o figurino procedural de peças
 * pelo mesh texturizado criado fora do jogo
 * (`src/models/water/water_model_lvl1.glb` — 20.860 vértices, 40 mil
 * triângulos, UMA malha com UMA textura de 2048², export do trimesh a partir de
 * .ply; SEM ossos e SEM animação no arquivo). Nv.2+ continua o WaterRig normal
 * (gota viva → ondina → cavalo de onda → TSUNAMI) e enquanto a malha carrega o
 * fallback também é o WaterRig.
 *
 * A malha é uma GOTA GORDA com cara (olhos e boca pintados na frente +Z, uma
 * BORDA DE ESPUMA ondulada na barriga e a ponta fina em cima). O GLB não traz
 * esqueleto, então vale o mesmo esquema dos outros três: esqueleto de código +
 * pesos (`ensureSkin`), coreografia do figurino lida no relógio do motor
 * (`attackPose` exportado do WaterRig), follow-through amostrado NO PASSADO e a
 * VIDA DA ÁGUA em camadas:
 *  1. o corpo texturizado com `onBeforeCompile`: correntes subindo pela
 *     superfície (o ruído do WATER_VERT literal, nas MESMAS escalas,
 *     deslocando ao longo da normal — seguro aqui porque a malha é OPACA de
 *     face única, a mesma lição do golém) + o ROLAR da maré e o empurrão do
 *     arremesso pelo EIXO (o `uSwell`/`uSurge` do figurino, crescentes com a
 *     altura) + as ONDAS BRANCAS descendo de cima para baixo do WATER_FRAG
 *     (fórmula literal, dosada para não brigar com a espuma PINTADA da malha) +
 *     o aro da equipe no fresnel;
 *  2. as MESMAS gotas em arco do figurino (`makeSprayGeo`/`SPRAY_VERT`/
 *     `SPRAY_FRAG`) e a rajada de névoa fria no instante em que o jato sai
 *     (pool compartilhado).
 *
 * ⚠️ A ÁGUA FLUI — é o CONTRÁRIO da regra do golém. Na rocha, osso girando
 * ABRE a superfície (o "leque escuro" da rodada 3) e por isso a máscara é DURA
 * e os ângulos do braço têm teto de ±0,14 rad; aqui o corpo é macio e o
 * figurino ORIGINAL já achata/estica o corpo inteiro (`g.scale` no WaterRig),
 * então a volumetria do arremesso é ESCALA no osso da BARRIGA (a fórmula
 * literal do figurino) e as FAIXAS DE PESO são SUAVES — cisalhar devagar é
 * exatamente o que água faz. O que a lição do golém deixa de pé aqui: rosto e
 * olhos FIRMES (a máscara de vida no shader some na faixa da cara) e nenhum
 * ângulo grande em osso nenhum.
 *
 * O JATO NÃO É UMA PEDRA: a Nereia é ranged e quem voa até o alvo é o
 * projétil do motor (`ProjectileField` desenha a água com o MESMO
 * `makeWaterMaterial` do figurino). A malha não cospe um taco decorativo como o
 * golém — ela CARREGA a maré, embica e a névoa/gotas explodem na boca; o
 * encaixe da boca com o canhão do motor é proposital (ver `fit`).
 *
 * ENCAIXE: escalada para o topo autoral da forma (`formTop` Nv.1 = 1,4) e
 * FLUTUANDO baixinho como a gotinha antiga (`HOVER_LVL1`). A malha escalada tem
 * meia-envergadura 0,57 × 0,56 — mais GORDA que a pegada da gotinha procedural
 * (0,51 × 0,50), então `MEDIDO.nereia[0]` em `data/footprints.ts` foi medido na
 * malha (0,58 × 0,58 com a folga do achatamento) e `qa/probe-footprint.mjs`
 * segue com SOBREPOSIÇÕES: 0.
 */

/** dados da espécie (a altura autoral do Nv.1 vem do catálogo, não do modelo) */
const NEREIA_DEF = getSpecies('nereia');
const TOP_LVL1 = formTop(NEREIA_DEF, 1);
const LEVEL_1 = 1;
/**
 * A gotinha procedural flutuava a `0,03 + 0,012·nível` do WaterRig (Nv.1
 * 0,042) com um bob de ±0,05 — a malha também flutua baixinho (água não é
 * planta, mas o penedo é: aqui o corpo tem a base REDONDA, nada plantado).
 */
const HOVER_LVL1 = 0.03 + LEVEL_1 * 0.012;

/**
 * Rumo da malha: o rig encara o INIMIGO no +Z local (o mesmo +Z do jato).
 * Confirmado no viewer offline da malha (`mesh-viewer.html` na raiz +
 * `qa/mesh-viewer-shot.mjs`): a fatia +Z é a
 * que tem OS DOIS OLHOS e a boca; a barriga mais gorda (y −0,42) também vira
 * para o inimigo, igual ao arremesso do golém. Se o print mostrar a gota DE
 * COSTAS, vire aqui (Math.PI = meia volta).
 */
export const NEREIA_MODEL_YAW = 0;

/** paleta do figurino (WATER_ROLE_LOOK.body): azure saturado + espuma branca */
const LOOK = WATER_ROLE_LOOK.body!;
/** ondas brancas do WATER_FRAG sobre a malha: AGORA no DIFUSO (mix do albedo,
 * a receita literal `col = mix(col, uFoam, waves·foamAmt)` do figurino opaco).
 * O figurino usa 0,5 sobre corpo azul-ESCURO (alto contraste); a malha tem
 * textura azure CLARA — 0,55 é o meio-termo: a faixa branca lê de longe sem
 * apagar a pintura (0,65 estourou as cristas no print da sonda) */
const WAVE_AMT = 0.55;
/** reforço EMISSIVO da onda (apagada em repouso; o grosso é o difuso — isto
 * é o brilho da faixa carregada/no escuro). No 3º print o emissivo SOZINHO
 * (0,45) não bastava: sobre a textura clara ele não cria a faixa — só o mix
 * difuso cria */
const GLOW_REST = 0.15;
const GLOW_CHARGE = 1.1;
/** amplitude da ondulação da casca em MOVIMENTO (o `uAmp` do figurino no Nv.1
 * é ≈ 0,07 de peça local) — na malha fica 0,05: a textura já tem volume
 * pintado, mas o corpo precisa ONDULAR de verdade para o "se mexia" aparecer */
const RIPPLE_AMP = 0.05;
/** ARO DA EQUIPE no fresnel. Duas lições da medição:
 *  1. NO EXPOENTE: o figurino opaco usava 2,2 sobre uma base azul-ESCURA e o
 *     aro lia como luz de contorno; na malha PBR clara o mesmo expoente largo
 *     lavava metade da barriga (a barriga gorda passa muito tempo quase de
 *     perfil para a câmera). 4,2 segura o aro na silhueta.
 *  2. NO MATIZ: o tint do jogador é dourado (#f5c451) e o aro é EMISSIVO, então
 *     não obedece à luz do bioma — dourado sobre azure viria cáqui em qualquer
 *     fase (o "amarronzado que permanece em todas as fases" do print do
 *     usuário; no palco do bestiário não aparece porque lá a unidade não existe
 *     e o tint cai no neutro frio #c8dcff). 0,78 de mistura para o azul-claro
 *     da paleta deixa o jogador em menta e a IA em lavanda: a distinção de
 *     equipe continua, a água Fresnel-reflete o céu da arena, não a lanterna. */
const RIM_POW = 4.2;
const RIM_COOL = 0.78;
const RIM_DOSE = 0.34;

/**
 * juntas do esqueleto de código, LIDAS NA MALHA (bbox y −1,00..+0,98, o perfil
 * da gota medido em `water-probe4.mjs`: a barriga mais gorda |x| 0,81 em y
 * −0,42, a BORDA de espuma na transição y ≈ 0,0, o topo afinando até a ponta em
 * y +0,98):
 *  0 raiz (plantada, casca de baixo — a base não pode levantar quando a
 *    barriga achata), 1 BARRIGA (o osso que ACHATA E ESTICA, a fórmula do
 *    figurino), 2 CARA/ombro da gota (y 0,05: firme, é onde mora a cara),
 *    3 ombro → 4 ponta (a ponta fina que ATRASA e açoita no arremesso — o
 *    análogo da barbatana do vento e da crina do fogo).
 */
const JOINT_Y = [-1.0, -0.62, 0.05, 0.55, 0.78];
/**
 * FAIXAS de peso — rampas SUAVES (água flui; aqui a máscara dura do golém
 * NÃO vale, ver o cabeçalho). A cada altura `TRANS_Y` mora uma TRANSIÇÃO de
 * osso com ±0,13 de rampa de cada lado (a mesma técnica em cadeia do
 * `ensureSkin` do zéfiro): entre −0,79 e −0,53 a casca é RAIZ pura (a base
 * redonda não levanta quando a barriga achata), entre −0,32 e +0,02 é CARA
 * pura — é o platô: os olhos (y ≈ +0,1) não herdam nem o achata-estica da
 * barriga nem o açoite da ponta (a lição do zéfiro: faixa firme = rosto
 * nunca treme). Boca e queixo (y −0,32..+0,02) ainda pegam um pouco da
 * barriga: a boca se mexe junto com o corpo, mas devagar, cisalhando como água.
 */
const TRANS_Y = [-0.66, -0.15, 0.15, 0.62];
const RAMP_HALF = 0.13;

/**
 * faixa da CARA na malha (medida no texto: olhos em y ≈ −0,1..+0,15, boca em
 * y ≈ −0,35, tudo na frente +Z) — a VIDA DA ÁGUA no shader DESAPARECE aqui
 * dentro: corrente, onda e swelling só fora dessa janela, senão os olhos
 * tremem e a boca "derrete" (foi a reclamação de derretimento no print do
 * golém, mesma causa).
 */
const FACE_Y_MIN = -0.42;
const FACE_Y_MAX = 0.22;
const FACE_Z_MIN = 0.3;

const tmpWorld = new THREE.Vector3();

const clampLevel = (l: number | undefined): number =>
  Math.max(1, Math.min(5, Math.round(l ?? 1)));
const ramp = (v: number, a: number, b: number) => THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
/** trava de Euler (a regra do golém vale para a água também: nenhum osso gira
 *  ângulo grande — o que faz volume aqui é ESCALA na barriga e ATRASO na ponta) */
const cap = (v: number, m: number) => THREE.MathUtils.clamp(v, -m, m);

/**
 * Pesos de pele POR FAIXA DE Y (2 influências, rampas SUAVES — ao contrário da
 * máscara dura do golém; ver o cabeçalho). Abaixo da base, a casca fica na
 * RAIZ: a barriga achata e a base não levanta do chão. A cara fica no osso da
 * CARA. Carimba o `aSeed` que os shaders da casa exigem (lição WebKit do
 * zéfiro: shader da casa LÊ geometria — sem `aSeed` no WebKit o monstro some).
 */
function ensureSkin(geo: THREE.BufferGeometry, seed: number): void {
  if (!geo.userData.waterSeed) {
    setSeedAttribute(geo, seed);
    geo.userData.waterSeed = true;
  }
  if (geo.userData.nereiaSkin) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    // cadeia de transições (o padrão do zéfiro): abaixo da 1ª altura a casca é
    // o osso 0; acima da última, o osso 4; entre elas, rampa suave entre os
    // dois adjacentes — cisalhar devagar é o que água faz
    let j = 0;
    while (j < TRANS_Y.length && y >= TRANS_Y[j]) j++;
    let a = j;
    let b = j;
    let w = 0;
    if (j > 0 && y < TRANS_Y[j - 1] + RAMP_HALF) {
      // dentro da rampa ANTES da junta j: osso j−1 → osso j
      a = j - 1;
      b = j;
      w = ramp(y, TRANS_Y[j - 1] - RAMP_HALF, TRANS_Y[j - 1] + RAMP_HALF);
    } else if (j < TRANS_Y.length && y > TRANS_Y[j] - RAMP_HALF) {
      // dentro da rampa DEPOIS da junta j: osso j → osso j+1
      a = j;
      b = j + 1;
      w = ramp(y, TRANS_Y[j] - RAMP_HALF, TRANS_Y[j] + RAMP_HALF);
    }
    idx[i * 4] = a;
    idx[i * 4 + 1] = b;
    idx[i * 4 + 2] = a;
    idx[i * 4 + 3] = b;
    wgt[i * 4] = 1 - w;
    wgt[i * 4 + 1] = w;
    wgt[i * 4 + 2] = 0;
    wgt[i * 4 + 3] = 0;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.userData.nereiaSkin = true;
}

/**
 * Dispatcher da Nereia: Nv.1 = malha importada; Nv.2..5 = WaterRig (a
 * progressão gota viva → ondina → cavalo de onda → TSUNAMI continua
 * procedural, com a muralha de água, os funis de sucção e o jato no cume que só
 * o rig da casa tem).
 */
export function NereiaRig(props: WaterRigProps) {
  const level = clampLevel(props.level);
  if (level === 1) {
    // enquanto o GLB (3,4 MB) carrega, a gotinha antiga segura o palco
    return (
      <Suspense fallback={<WaterRig {...props} level={1} />}>
        <WaterLvl1MeshRig {...props} level={1} />
      </Suspense>
    );
  }
  return <WaterRig {...props} level={level} />;
}

/** malha Nv.1 pura — suspensa pelo useGLTF (o dispatcher amarra o Suspense) */
function WaterLvl1MeshRig({
  seed,
  unitId,
  level: levelProp = LEVEL_1,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: WaterRigProps) {
  const level = clampLevel(levelProp);
  useGLTF.preload(waterLvl1Url);
  const { scene } = useGLTF(waterLvl1Url);

  // a malha + a textura da fonte (geometry COMPARTILHADO entre instâncias;
  // material e esqueleto são por unidade)
  const src = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) throw new Error('water_model_lvl1.glb não tem mesh');
    const geo = meshes[0].geometry;
    geo.computeBoundingBox();
    const tex = (meshes[0].material as THREE.MeshStandardMaterial).map;
    return { geo, tex };
  }, [scene]);

  // encaixe autoral: altura = formTop Nv.1, corpo centralizado e a BASE
  // flutuando a `HOVER_LVL1` (a gotinha antiga flutuava baixinho)
  const fit = useMemo(() => {
    const bb = src.geo.boundingBox!;
    const s = TOP_LVL1 / (bb.max.y - bb.min.y);
    const cx = ((bb.min.x + bb.max.x) / 2) * s;
    const cz = ((bb.min.z + bb.max.z) / 2) * s;
    const px = -(cx * Math.cos(NEREIA_MODEL_YAW) + cz * Math.sin(NEREIA_MODEL_YAW));
    const pz = cx * Math.sin(NEREIA_MODEL_YAW) - cz * Math.cos(NEREIA_MODEL_YAW);
    return {
      s,
      pos: [px, -bb.min.y * s + HOVER_LVL1, pz] as [number, number, number],
    };
  }, [src]);

  // tint da equipe (o mesmo canal do WaterRig): pinta o ARO da gota na cor de
  // quem é o dono — o fresnel do WATER_FRAG literal do figurino
  const team = useMemo(() => {
    const u = unitId !== undefined ? getEngine()?.getUnit(unitId) : undefined;
    return u ? TEAM_TINT[u.side] : TEAM_TINT.neutral;
  }, [unitId]);

  // material por instância: textura do GLB + a VIDA DA ÁGUA no vértice (o
  // WATER_VERT do figurino nas mesmas escalas) e as ONDAS BRANCAS no fragment
  // (o WATER_FRAG dosado) — o figurino dentro do modelo novo
  const body = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: src.tex,
      roughness: 0.42, // molhado: a gota reflete a arena (metalness baixo, o
      metalness: 0.06, // brilho é o fresnel da receita, não metal falseado)
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFT = { value: 0 };
      sh.uniforms.uFA = { value: RIPPLE_AMP }; // ondulação da casca (o figurino usa ~0,07 de peça; a textura já tem volume pintado, mas o corpo PRECISA ondular)
      sh.uniforms.uFSwell = { value: 0.03 + level * 0.006 }; // o `uSwell` do figurino
      sh.uniforms.uFBend = { value: 0.02 + level * 0.008 }; // balanço lateral
      sh.uniforms.uFSurge = { value: 0 }; // arremesso: puxando/soltando
      sh.uniforms.uFSeed = { value: seed };
      sh.uniforms.uFPhase = { value: seed };
      sh.uniforms.uFHurt = { value: 0 };
      sh.uniforms.uFCharge = { value: 0 };
      sh.uniforms.uFGlow = { value: GLOW_REST };
      sh.uniforms.uFGlowCharge = { value: GLOW_CHARGE };
      sh.uniforms.uFFoam = { value: new THREE.Color(LOOK.foam) };
      sh.uniforms.uFFoamAmt = { value: WAVE_AMT };
      sh.uniforms.uFTeam = { value: new THREE.Color(team) };
      // gfrac é fração da ALTURA LOCAL da malha (−1,00..+0,98 = 1,977). Usar o
      // formTop do mundo (1,4) COMPRIMIA a fração: ela saturava em 1,0 na
      // metade de cima e a onda ficava CONGELADA lá (sem gradiente vertical) —
      // foi o "senti falta da onda que se mexia" do 2º print
      sh.uniforms.uFModelH = {
        value: src.geo.boundingBox!.max.y - src.geo.boundingBox!.min.y,
      };
      sh.vertexShader =
        `uniform float uFT;\nuniform float uFA;\nuniform float uFSwell;\nuniform float uFBend;\nuniform float uFSurge;\nuniform float uFSeed;\nuniform float uFPhase;\nuniform float uFHurt;\nuniform float uFCharge;\nuniform float uFModelH;\nvarying float vGNer;\nvarying float vNNer;\nvarying float vANer;\nvarying float vFaceMask;\nattribute float aSeed;\n${NOISE_GLSL}\n` +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // VIDA DA ÁGUA na malha — o WATER_VERT do figurino (mesmos ruídos,
          // mesmas escalas, correntes SUBINDO pela casca: água tem peso, é mais
          // lento que o vento). O deslocamento é pela NORMAL: a malha é OPACA de
          // face única, então a lição do golém vale e a do invólucro fino não.
          vFaceMask = step(${FACE_Y_MIN.toFixed(2)}, transformed.y) *
                      step(transformed.y, ${FACE_Y_MAX.toFixed(2)}) *
                      step(${FACE_Z_MIN.toFixed(2)}, transformed.z);
          float life = 1.0 - vFaceMask; // a cara fica FIRME (olhos/boca não tremem)
          float gh = transformed.y + ${(-JOINT_Y[0]).toFixed(2)};
          float gfrac = clamp(gh / max(0.001, uFModelH), 0.0, 1.0);
          vGNer = gfrac;
          vANer = atan(transformed.z, transformed.x); // o vAng do figurino: a onda quebra EM TORNO do corpo, não em listras retas
          vec3 q = vec3(transformed.x * 2.2, transformed.y * 1.7 - uFT * 1.35, transformed.z * 2.2) + uFSeed + aSeed;
          float n1 = fbm(q);
          float n2 = fnoise(q * 2.4 + vec3(2.2, -uFT * 2.7, 1.1) + 7.0);
          vNNer = mix(n1, n2, 0.35);
          float amp = uFA * (1.0 + uFHurt * 0.4) * (1.0 + uFCharge * 0.5);
          transformed += objectNormal * ((n1 - 0.5) * 1.8 + (n2 - 0.5) * 1.0) * amp * life;
          // o corpo ROLA com a maré e embica no arremesso (as duas fórmulas
          // literais do WATER_VERT: uSwell/uSurge/uBend crescem com a altura)
          float roll = uFSwell * gfrac * (1.0 + uFCharge * 0.9);
          transformed.z += (roll * sin(uFT * 1.3 + uFPhase * 1.4 + gh * 1.1) + uFBend * gfrac * cos(uFT * 0.8 + uFPhase + gh * 0.9) + uFSurge * 0.34 * gfrac) * life;
          transformed.y += 0.12 * uFSwell * gfrac * sin(uFT * 1.1 + uFPhase * 2.1) * life;`,
        );
      sh.fragmentShader =
        `varying float vGNer;\nvarying float vNNer;\nvarying float vANer;\nvarying float vFaceMask;\nuniform float uFT;\nuniform float uFSeed;\nuniform float uFPhase;\nuniform float uFHurt;\nuniform float uFCharge;\nuniform float uFGlow;\nuniform float uFGlowCharge;\nuniform float uFFoamAmt;\nuniform vec3 uFFoam;\nuniform vec3 uFTeam;\n${NOISE_GLSL}\n` +
        sh.fragmentShader
          .replace(
            '#include <map_fragment>',
            /* glsl */ `#include <map_fragment>
            // ONDAS BRANCAS descendo de cima para baixo — a fórmula LITERAL do
            // WATER_FRAG (frente entra suave, traseira corta seco). O figurino
            // é um shader OPACO e faz a onda SUBSTITUIR o albedo
            // ("col = mix(col, uFoam, waves·foamAmt)") — só emissivo NÃO se vê
            // sobre a textura clara (foi o "não está visível" do 3º print); o
            // mix no DIFUSO é o que faz a faixa branca PERCORRER o corpo do
            // topo ao chão como no rig antigo. NULA na cara (vFaceMask).
            float off = fnoise(vec3(vANer * 1.5, vGNer * 0.9, uFPhase + uFSeed)) * 0.55;
            float fall = fract(vGNer * 2.3 + uFT * 0.5 + off);
            // na malha a crista é MAIS LARGA que no figurino (0,18/0,42 em vez
            // de 0,13/0,30): a gota occupy ~90 px na tela e uma crista estreita
            // ali vira listrinha de código de barras, não "onda percorrendo o
            // corpo do topo ao chão" (o que o usuário pediu)
            float band = smoothstep(0.0, 0.18, fall) * (1.0 - smoothstep(0.18, 0.42, fall));
            band *= smoothstep(0.32, 0.62, fnoise(vec3(vANer * 3.1, vGNer * 4.2 - uFT * 0.45, uFPhase)));
            float rib = fract(vGNer * 5.4 + uFT * 1.15 + off * 1.7 + 0.37);
            float ribMask = smoothstep(0.0, 0.08, rib) * (1.0 - smoothstep(0.08, 0.2, rib));
            // ondinhas finas: 0,18 (no figurino 0,35) — na malha texturizada
            // elas somadas à crista viram riscas e apagam a leitura da onda
            float nerWaves = clamp(band + ribMask * 0.18, 0.0, 1.0) * (1.0 - vFaceMask);
            // espuma só no topo das cristas (o cume da onda)
            float nerCrest = smoothstep(0.68, 0.95, vNNer) * smoothstep(0.8, 0.98, vGNer) * (1.0 - vFaceMask);
            diffuseColor.rgb = mix(diffuseColor.rgb, uFFoam, nerWaves * uFFoamAmt);
            diffuseColor.rgb = mix(diffuseColor.rgb, uFFoam, nerCrest * uFFoamAmt * 0.6);`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `#include <emissivemap_fragment>
            // reforço EMISSIVO da onda: apagada em repouso, ACENDE carregando
            // a maré (o análogo da veia de magma do golém). O grosso é o mix
            // difuso acima — isto só faz a faixa brilhar carregada/no escuro
            totalEmissiveRadiance += uFFoam * (nerWaves + nerCrest * 0.6) * (uFGlow + uFCharge * uFGlowCharge);
            // ARO DA EQUIPE no fresnel: no figurino opaco era pow de 1−ndv com
            // expoente 2,2 e dose 0,28 sobre uma base azul-ESCURA, então o aro
            // dourado do jogador lia como luz de contorno. Na malha PBR clara e
            // molhada o MESMO aro LARGO (expoente 2,2) banhava metade da
            // barriga: dourado (TEAM_TINT.player = #f5c451) por cima de azure =
            // cáqui. E como é EMISSIVO não obedece à luz do bioma: o amarronzado
            // ficou o mesmo em todas as fases (a reclamação do print) e só não
            // apareceu no palco do bestiário porque lá não há unidade e o tint
            // cai no neutro frio (#c8dcff). Emenda: aro APERTADO na silhueta
            // (expoente alto) e matiz puxado para o azul-claro da paleta — o
            // jogador continua menta e a IA lavanda (dá para saber de quem é a
            // gota), mas água Fresnel-reflete o céu da arena, não a lanterna da
            // equipe.
            float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
            vec3 nerTeam = mix(uFTeam, vec3(0.70, 0.90, 1.0), ${RIM_COOL});
            totalEmissiveRadiance += nerTeam * pow(1.0 - ndv, ${RIM_POW}) * ${RIM_DOSE};
            // flash de dano (o mix branco do figurino)
            totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * uFHurt * 0.5;`,
          );
      m.userData.shader = sh;
    };
    return m;
  }, [src, seed, team, level]);

  // ESQUELETO POR INSTÂNCIA: geometria (com pesos) compartilhada, ossos e
  // animação privados de cada unidade — duas gotinhas Nv.1 nunca atacam juntas.
  const rig = useMemo(() => {
    ensureSkin(src.geo, seed);
    const mk = (name: string, y: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(0, y, 0);
      return b;
    };
    const root = mk('root', JOINT_Y[0]);
    const belly = mk('belly', JOINT_Y[1] - JOINT_Y[0]);
    const face = mk('face', JOINT_Y[2] - JOINT_Y[1]);
    const shoulder = mk('shoulder', JOINT_Y[3] - JOINT_Y[2]);
    const tip = mk('tip', JOINT_Y[4] - JOINT_Y[3]);
    root.add(belly);
    belly.add(face);
    face.add(shoulder);
    shoulder.add(tip);
    const skinned = new THREE.SkinnedMesh(src.geo, body);
    skinned.add(root);
    skinned.bind(new THREE.Skeleton([root, belly, face, shoulder, tip]));
    skinned.castShadow = true;
    skinned.frustumCulled = false; // o relevo do shader viaja além da esfera
    return { skinned, bones: { root, belly, face, shoulder, tip } };
  }, [src, body, seed]);

  // gotas em arco + clarão de maré: o MESMO idioma do WaterRig (Nv.1 gotinha)
  const spray = useMemo(
    () => ({
      geo: makeSprayGeo(embers ?? 10 + level * 8),
      mat: new THREE.ShaderMaterial({
        vertexShader: SPRAY_VERT,
        fragmentShader: SPRAY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uSizeMul: { value: emberScale },
          uHeight: { value: TOP_LVL1 },
          uSpread: { value: 0.5 + level * 0.22 },
          uCharge: { value: 0 },
        },
      }),
    }),
    [embers, level, emberScale],
  );

  useEffect(
    () => () => {
      body.dispose(); // a TEXTURA é do cache do useGLTF (compartilhada): não dispor
      rig.skinned.skeleton?.dispose();
      spray.geo.dispose();
      spray.mat.dispose();
    },
    [body, rig, spray],
  );

  const animRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const sprayDone = useRef(true);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  useFrame((_, dtRaw) => {
    const g = animRef.current;
    const glow = glowRef.current;
    if (!g || !glow) return;
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

    // estado da unidade no motor — os mesmos canais do WaterRig
    let hurt = 0;
    let alpha = 1;
    let hpFrac = 1;
    let sinceAttack = -1;
    if (unitId !== undefined) {
      const eng = getEngine();
      const u = eng ? eng.getUnit(unitId) : undefined;
      if (eng && u) {
        hurt = Math.max(0, 1 - (eng.world.time - u.lastHurtAt) / 0.28);
        hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
        sinceAttack = eng.world.time - u.lastAttackAt;
        if (!u.alive && u.diedAt !== null) {
          alpha = Math.max(0, 1 - (eng.world.time - u.diedAt) / DEATH_ANIMATION_WINDOW);
        }
      }
    } else if (demoT.current >= 0) {
      demoT.current += dt;
      sinceAttack = demoT.current;
      if (demoT.current > WATER_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    // instante em que o jato SAI (fim da carga) — o mesmo beat do figurino
    const releasing =
      sinceAttack >= WATER_WINDUP * WATER_ATTACK_WINDOW && sinceAttack <= WATER_ATTACK_WINDOW;
    const crumble = 1 - alpha; // morrendo a água se desfaz
    const wilt = crumble * 0.9;

    // ---- rajada de névoa fria no instante em que o jato dispara (o bloco
    // literal do WaterRig, no pool compartilhado) ----
    if (releasing && !sprayDone.current) {
      sprayDone.current = true;
      if (smoke) {
        g.updateWorldMatrix(true, false);
        for (let i = 0; i < 5 + level; i++) {
          tmpWorld
            .set(
              (Math.random() - 0.5) * (0.8 + level * 0.18),
              TOP_LVL1 * (0.4 + Math.random() * 0.5),
              0.6 + Math.random() * 0.5,
            )
            .applyMatrix4(g.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.06 + 0.012 * level + Math.random() * 0.03,
            heat: 0.02, // névoa fria
            life: 0.55 + Math.random() * 0.4,
            lifeVar: 0.3,
            jitter: 0.18,
            rise: 0.5,
            drag: 3.2,
            vx: (Math.random() - 0.5) * 1.1,
            vz: 1.2 + Math.random() * 1.4,
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > WATER_ATTACK_WINDOW) sprayDone.current = false;

    // ---- DANÇA DA MARÉ: o corpo ACHATA na carga e ESTICA na liberação — é a
    // fórmula LITERAL do figurino (`g.scale` com o `squash`), e mora no osso da
    // BARRIGA porque a base (raiz) tem que continuar plantada no chão enquanto a
    // barriga alarga. O avanço do arremesso (`surge`) é TRANSLAÇÃO do grupo,
    // rígida. follow-through: a ponta é amostrada NO PASSADO (o atraso que a
    // massa da água tem)
    const pulse = Math.sin(t * 1.35 + seed) * 0.6 + Math.sin(t * 2.7 + 2.2 + seed * 0.4) * 0.4;
    const sq = pose.squash; // −1 achatada .. +0,9 esticada
    const sway = Math.sin(t * 0.55 + seed) * 0.02 + Math.sin(t * 1.2 + 2.1) * 0.008;
    g.rotation.y = sway;
    g.rotation.z = Math.sin(t * 0.4 + seed * 0.6) * 0.015 + wilt * 0.1;
    g.rotation.x = cap(-pose.surge * 0.1 + wilt * 0.16, 0.18);
    g.position.z = pose.surge * 0.12;
    g.position.y = Math.sin(t * 0.9 + seed) * 0.05 * (0.5 + 0.5 * hpFrac) - wilt * 0.05;

    const lagA = attackPose(sinceAttack - 0.07);
    const lagB = attackPose(sinceAttack - 0.14);
    const b = rig.bones;
    // BARRIGA: o squash&stretch do figurino + a respiração da gota (o pulso do
    // WaterRig) + o afundar na morte (a poça)
    const flat = 1 + wilt * 0.5; // morrendo: desaba e alarga feito poça
    b.belly.scale.set(
      (1 - sq * 0.16) * flat,
      (1 + sq * 0.2) * (1 - wilt * 0.55) * (0.78 + 0.22 * hpFrac) * (1 + pulse * 0.02),
      (1 - sq * 0.16) * flat,
    );
    b.belly.rotation.x = cap(pose.surge * 0.05 + Math.sin(t * 0.5 + seed) * 0.01, 0.06);
    // CARA: firme de propósito (o rosto não herda o achata-estica), só atrasa o
    // embicar do arremesso — e a boca `roar` do figurino vira um tope de foco
    b.face.rotation.x = cap(-pose.surge * 0.06 + lagA.surge * 0.04 + pose.roar * 0.05, 0.09);
    b.face.rotation.z = Math.sin(t * 0.6 + seed * 0.5) * 0.012;
    // PONTA: o açoite atrasado (a análoga da barbatana do vento / crina do fogo)
    const lagTip = lagB.surge - pose.surge;
    const lagTip2 = lagA.surge - pose.surge;
    b.shoulder.rotation.x = cap(-lagTip2 * 0.1 + Math.sin(t * 1.6 + seed) * 0.02, 0.12);
    b.shoulder.rotation.z = Math.sin(t * 1.1 + seed * 0.7) * 0.02;
    b.tip.rotation.x = cap(-lagTip * 0.16 + Math.sin(t * 2.2 + seed * 1.3) * 0.03 - wilt * 0.5, 0.28);
    b.tip.rotation.z = Math.sin(t * 1.8 + seed * 0.9) * 0.03 * (1 - wilt);

    // ---- vida no material: ondulação, maré, ondas brancas e o aro da equipe ----
    const sh = body.userData.shader as
      | {
          uniforms: {
            uFT: { value: number };
            uFA: { value: number };
            uFSwell: { value: number };
            uFBend: { value: number };
            uFSurge: { value: number };
            uFHurt: { value: number };
            uFCharge: { value: number };
            uFGlow: { value: number };
            uFFoamAmt: { value: number };
          };
        }
      | undefined;
    if (sh) {
      sh.uniforms.uFT.value = t;
      // morrendo a água agita demais e se desfaz (o mesmo multiplicador do figurino)
      sh.uniforms.uFA.value = RIPPLE_AMP * (1 + hurt * 0.4 + crumble * 2.4);
      sh.uniforms.uFHurt.value = hurt;
      sh.uniforms.uFCharge.value = pose.charge;
      sh.uniforms.uFSurge.value = pose.surge;
      // a onda branca brilha SEMPRE (o figurino pinta no difuso; aqui é o
      // emissivo dosado) — o glow da carga é reforço por cima, no shader
      sh.uniforms.uFGlow.value = GLOW_REST * (0.8 + 0.2 * hpFrac) * alpha;
      sh.uniforms.uFFoamAmt.value = WAVE_AMT * alpha;
    }

    spray.mat.uniforms.uTime.value = t;
    spray.mat.uniforms.uAlpha.value = alpha;
    spray.mat.uniforms.uCharge.value = pose.charge;

    // ---- clarão de maré (o mesmo halo discreto do figurino: grande demais
    // lava a criatura de azul-branco) ----
    const baseGlow = 1.0 + level * 0.18;
    glow.scale.setScalar(Math.max(0.7, baseGlow + pose.flare * 0.6 + hurt * 0.3));
    glow.position.y = TOP_LVL1 * 0.55;
    (glow.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.06 + level * 0.012 + pose.charge * 0.14 + pose.flare * 0.18) * alpha,
    );
  });

  return (
    <group ref={animRef}>
      <group position={fit.pos} rotation-y={NEREIA_MODEL_YAW} scale={fit.s}>
        <primitive object={rig.skinned} />
      </group>
      <points geometry={spray.geo} material={spray.mat} frustumCulled={false} />
      <sprite ref={glowRef} position={[0, 0.9, 0]} scale={1.18}>
        <spriteMaterial
          map={circleTexture()}
          color="#3f9fd8"
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}
