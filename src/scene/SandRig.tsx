import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine } from '../store/gameStore';
import { makeSandMaterial } from './sandShaders';
import { makeWindMaterial } from './windShaders';
import { circleTexture, getGeometry } from './assets';
import { MODELS, partsForLevel, type MatRole } from './speciesModels';
import type { SmokePool } from './smokePool';
import { formTop } from '../data/forms';
import { getSpecies } from '../data/monsters';

/**
 * Rig da AREIA (Nv.6 — o GÊNIO DO DESERTO), no MESMO padrão dos golems:
 * corpo OPACA de areia compactada (sandShaders: duna viva com grão escor-
 * regendo, veios de avalanche e mica) envolta em VÉUS de grão em turbilhão
 * (o shader de vento na paleta areia — fitas de grão subindo em espiral;
 * SEM tint de equipe, a regra da nuvem). Diferença do gênio:
 *
 *  1. CAUDA EM FUNIL (tornado plantado): casca translúcida em lathe denso
 *     com turbilhão no shader (uSpin diferencia base/topo — a coluna cisalha
 *     como tornado de verdade) e coluna sólida de areia acesa por dentro;
 *  2. TRUQUE DE ESCALA DO GÊNIO: cintura estreita, peito COLOSSAL e cabeça
 *     pequena com fez — o gênio da Lâmpada; barba de areia escorrendo e
 *     penacho de energia no topo do fez;
 *  3. ATAQUE (rajada dupla de grãos cortantes): as garras RECUAM reunindo a
 *     esteira de grão (uFlare acelera o turbilhão da cauda E das garras), o
 *     corpo torce e então VARRE para frente disparando — o motor solta o
 *     segundo tiro 0,3s depois (doubleShot), e a coreografia cobre os dois.
 *
 * A timeline vem do motor (lastAttackAt); no bestiário, `demoAttackSeq`
 * dispara a mesma coreografia. O projétil-assinatura (lufa-swirl de grão
 * com núcleo compactado) usa os MESMOS materiais no ProjectileField.
 */

export const SAND_ATTACK_WINDOW = 0.6;
/** fração da janela em que o gênio recolhe a rajada nas garras */
const SAND_WINDUP = 0.48;

const AREIA_DEF = getSpecies('areia');

interface AttackPose {
  twist: number; // o gênio todo torce recolhendo o vendaval
  rise: number; // 0..1 flutua subindo na carga (a cauda encolhe do chão)
  swing: number; // garras (neg = recuadas, pos = varrem para a rajada)
  charge: number; // veios âmbar + turbilhão acelerando (0..1)
  stepZ: number; // empurra para frente no disparo
  flare: number; // esteiras de grão e halo estufam
  doubleKick: number; // o SEGUNDO tiro (0,3s depois): re-cole curto
}

function attackPose(since: number): AttackPose {
  const P: AttackPose = {
    twist: 0,
    rise: 0,
    swing: 0,
    charge: 0,
    stepZ: 0,
    flare: 0,
    doubleKick: 0,
  };
  if (since < 0 || since > SAND_ATTACK_WINDOW) return P;
  const p = since / SAND_ATTACK_WINDOW;
  if (p < SAND_WINDUP) {
    const k = (p / SAND_WINDUP) ** 1.4;
    P.twist = -0.38 * k;
    P.rise = k;
    P.swing = -0.95 * k;
    P.charge = k;
    P.stepZ = -0.07 * k;
    P.flare = 0.6 * k;
    return P;
  }
  const r = (p - SAND_WINDUP) / (1 - SAND_WINDUP);
  const a = 1 - (1 - Math.min(1, r / 0.24)) ** 2; // a rajada sai quase junto
  const decay = 1 - Math.max(0, (r - 0.42) / 0.58);
  P.twist = (-0.38 + 0.82 * a) * decay;
  P.rise = (1 - 0.7 * a) * decay;
  P.swing = (-0.95 + 2.0 * a) * decay;
  P.charge = Math.max(0, 1 - 1.5 * r) * decay;
  P.stepZ = (-0.07 + 0.3 * a) * decay;
  P.flare = (0.6 + 0.8 * a) * decay;
  // doubleShot do motor: +0,3s → as garras dão um recole curto de re-carga
  P.doubleKick = Math.max(0, 1 - Math.abs(since - 0.3) / 0.18) * 0.5;
  return P;
}

/** areia compactada por papel (sandShaders): corpo ocre, sombra úmida,
 *  veio âmbar; `glow` = núcleo/faiscas acesas na duna; `accent` = ouro */
interface SandLook {
  sandA: string;
  sandB: string;
  flow: string;
  flowGlow: number;
  amp: number;
  speckle?: number;
  flowSpeed?: number;
}

const SAND_ROLE_LOOK: Partial<Record<MatRole, SandLook>> = {
  body: {
    sandA: '#e3c691', // areia CLARA e SECA de deserto (toffee/molhado = o erro
    sandB: '#9a7a48', // a evitar; sombra de duna é marrom claro, não caramelo)
    flow: '#e89a3a',
    flowGlow: 0.06, // veios quase apagados: a duna é seca, não derretida
    amp: 0.034,
    flowSpeed: 0.35,
    speckle: 1,
  },
  dark: {
    sandA: '#bda173',
    sandB: '#6e552c',
    flow: '#c98f3e',
    flowGlow: 0.05,
    amp: 0.03,
    flowSpeed: 0.5,
    speckle: 0.6,
  },
  glow: {
    sandA: '#f5c179', // núcleo aceso DENTRO da duna — âmbar QUEIMADO, não
    sandB: '#7a4c18', // creme-pálido (o glow claro + véu translúcido = a
    flow: '#ff9d3c', // "chama branca" do print; aqui o fogo é baixo e laranja)
    flowGlow: 0.85,
    amp: 0.032,
    flowSpeed: 0.8,
    speckle: 0.5,
  },
  accent: {
    sandA: '#e6b558', // ouro do fez e das pulseiras (ainda granulado: é o
    sandB: '#6e4a16', // mesmo shader — gênio ESCULPIDO em areia+ouro, não
    flow: '#ffcf7a', // metal liso; o brilho seco casa com o corpo)
    flowGlow: 0.2,
    amp: 0.018,
    flowSpeed: 0.2,
    speckle: 1.4,
  },
  trans: {
    sandA: '#b3946a', // dune rasteira rente ao chão (opaca, mas baixinha —
    sandB: '#6e552c', // discreta: anel de areia sombra, não tapete laranja)
    flow: '#a87c3c',
    flowGlow: 0.02,
    amp: 0.026,
    flowSpeed: 0.55,
    speckle: 0.7,
  },
};

/** véus de grão em turbilhão (o shader do zéfiro na paleta do DESERTO):
 *  fitas de grão subindo em espiral. Os prints cobraram duas coisas: o
 *  véu branco-toalha (hot claro DEMAIS — heat alto empina o ocre para o
 *  branco e vira cortina de chuveiro) e o lenço claro. No shader do vento
 *  alfa e claridade são o MESMO canal (as fitas), então a densidade vem do
 *  alphaMul e a COR é ocre queimado em todos os canais — o "brilho" do grão
 *  é creme-ocre (#e0c184), nunca #ffe* (o gatilho do blowout) */
interface VeilLook {
  cold: string; // sombra do grão
  mid: string; // o ocre do grão em suspensão
  hot: string; // grão iluminado / rajada carregada (teto: creme, nunca branco)
  alphaMul: number;
  spin: number;
  ampScale: number;
}

const VEIL_LOOK: VeilLook[] = [
  // [0] cauda-funil: CORTINA densa de grão (o corpo do gênio é areia
  // voando) — ocre FUNDO (a cortina dense tem que ser escura: areia em
  // suspensão densa é marrom, não branco), fitas âmbar, zero branco
  { cold: '#4f3817', mid: '#93692c', hot: '#d9b26a', alphaMul: 1.25, spin: 2.6, ampScale: 1 },
  // [1] halo: névoa leve rareada (a poeira em órbita — discreto)
  { cold: '#6e5228', mid: '#a9853f', hot: '#d9bd7e', alphaMul: 0.45, spin: 1.4, ampScale: 1 },
  // [2] esteiras da garra: DENSAS (a rajada reunida — tem que ler punho de
  // areia, não lenço claro)
  { cold: '#573d18', mid: '#9c7130', hot: '#d8b26a', alphaMul: 0.95, spin: 3.2, ampScale: 1 },
];

function makeGritGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 3);
  let s = 0x7a3f19b9 ^ (n * 2654435761);
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * 3; i++) rnd[i] = rand();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  return g;
}

export interface SandRigProps {
  seed: number;
  unitId?: number;
  level?: number;
  /** grãos desprendidos da cauda (são o "cascalho" do gênio) */
  embers?: number;
  emberScale?: number;
  demoAttackSeq?: number;
  /** pool compartilhado — a poeira de grão do disparo e da cauda */
  smoke?: SmokePool;
}

const tmpWorld = new THREE.Vector3();

export function SandRig({
  seed,
  unitId,
  level: levelProp,
  embers,
  emberScale = 1,
  demoAttackSeq,
  smoke,
}: SandRigProps) {
  const modelDef = MODELS.areia;
  // espécie da árvore: forma única no nível da espécie (Nv.6)
  const level = Math.max(
    AREIA_DEF.levelMin,
    Math.min(AREIA_DEF.levelMax, Math.round(levelProp ?? AREIA_DEF.levelMin)),
  );
  const gritCount = embers ?? 22;
  const topY = formTop(AREIA_DEF, level);

  const rootRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const coreGlowRef = useRef<THREE.Sprite>(null!);
  const clock = useRef(0);
  const demoT = useRef(-1);
  const strikeDone = useRef(true);
  const dustAcc = useRef(0);

  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const actors = useMemo(() => {
    const arms: { i: number; side: 1 | -1; base: [number, number, number] }[] = [];
    visParts.forEach((p, i) => {
      const side: 1 | -1 = p.p[0] >= 0 ? 1 : -1;
      const base = p.r ?? [0, 0, 0];
      if (p.tag === 'arm') arms.push({ i, side, base });
    });
    return { arms };
  }, [visParts]);

  useEffect(() => {
    if (demoAttackSeq !== undefined && demoAttackSeq > 0) demoT.current = 0;
  }, [demoAttackSeq]);

  const partMats = useMemo(() => {
    // olhos: brasa âmbar do deserto (sóbrio, sem aditivo)
    const eye = new THREE.MeshStandardMaterial({
      color: '#ffe9b8',
      emissive: '#ffb347',
      emissiveIntensity: 1.1,
      roughness: 0.3,
      flatShading: true,
    });
    const socket = new THREE.MeshBasicMaterial({ color: '#241708' });
    const cache = new Map<string, THREE.Material>();
    const list = visParts.map((p, i) => {
      if (p.m === 'white') return eye;
      if (p.m === 'black') return socket;
      if (p.m === 'veil') {
        // véu de grão: shader do VENTO (fitas espiral + turbilhão diferencial)
        // na paleta do deserto — o visual é escolhido pela PEÇA (cauda-funil
        // cortina densa; esteira da garra punho de areia; halo rareado),
        // nunca por contador de loop
        const vi = p.g === 'vortex' ? 0 : p.tag === 'arm' ? 2 : 1;
        const look = VEIL_LOOK[vi];
        const key = `V|${vi}|${p.amp ?? 0.05}|${Math.round(p.p[1] * 100)}`;
        let m = cache.get(key);
        if (!m) {
          m = makeWindMaterial({
            cold: look.cold,
            mid: look.mid,
            hot: look.hot,
            amp: (p.amp ?? 0.05) * look.ampScale,
            twist: 0.55, // fitas levemente espiraladas subindo pela casca
            spin: look.spin,
            bend: 0,
            alphaMul: look.alphaMul,
            soft: 0, // volume cheio: areia em suspensão não some na borda
            seed: seed + (i % 3) * 2.9,
            phase: seed,
            yOff: p.p[1],
            modelH: topY,
          });
          cache.set(key, m);
        }
        return m;
      }
      const look = SAND_ROLE_LOOK[p.m] ?? SAND_ROLE_LOOK.body!;
      const key = `${p.m}|${p.amp ?? look.amp}|${Math.round(p.p[1] * 100)}|${i % 3}`;
      let m = cache.get(key);
      if (!m) {
        m = makeSandMaterial({
          sandA: look.sandA,
          sandB: look.sandB,
          flow: look.flow,
          amp: p.amp ?? look.amp,
          flowSpeed: look.flowSpeed ?? 0.35,
          flowGlow: look.flowGlow,
          speckle: look.speckle ?? 1,
          seed: seed + (i % 3) * 3.3,
          breath: p.tag === 'arm' ? 0.35 : 1,
        });
        cache.set(key, m);
      }
      return m;
    });
    return {
      list,
      uniq: [...cache.values(), eye, socket],
      shaders: [...cache.values()] as THREE.ShaderMaterial[],
    };
  }, [visParts, seed, level, topY]);

  // grãos desprendendo da cauda (o análogo das lascas do golem): miúdos,
  // dourados, caindo em arco do funil para o chão
  const grit = useMemo(() => {
    const geo = makeGritGeo(gritCount);
    const mat = new THREE.ShaderMaterial({
      vertexShader: GRIT_VERT,
      fragmentShader: GRIT_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uSizeMul: { value: emberScale },
        uCharge: { value: 0 },
        uTailH: { value: 1.6 },
      },
    });
    return { geo, mat };
  }, [gritCount, emberScale]);

  const geoClones = useRef<THREE.BufferGeometry[]>([]);
  const partGeos = useMemo(() => {
    return visParts.map((p, i) => {
      const geo = getGeometry(p.g, p.a);
      const mat = partMats.list[i];
      if (mat instanceof THREE.ShaderMaterial && mat.vertexShader.includes('aSeed')) {
        const g = geo.clone();
        g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([seed + i * 1.9]), 1));
        geoClones.current.push(g);
        return g;
      }
      return geo;
    });
  }, [visParts, partMats, seed]);

  useEffect(() => {
    return () => {
      for (const m of partMats.uniq) m.dispose();
      for (const g of geoClones.current) g.dispose();
      geoClones.current = [];
      grit.geo.dispose();
      grit.mat.dispose();
    };
  }, [partMats, grit]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    clock.current += dt;
    const t = clock.current;

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
      if (demoT.current > SAND_ATTACK_WINDOW + 0.05) demoT.current = -1;
    }
    const pose = attackPose(sinceAttack);
    const striking =
      sinceAttack >= SAND_WINDUP * SAND_ATTACK_WINDOW && sinceAttack <= SAND_ATTACK_WINDOW;

    // rajada dupla: solta poeira de grão na VARREDURA e no recole do 2º tiro
    if (striking && !strikeDone.current) {
      strikeDone.current = true;
      if (smoke) {
        rootRef.current?.updateWorldMatrix(true, false);
        for (let i = 0; i < 7; i++) {
          tmpWorld
            .set((Math.random() - 0.5) * 1.6, 2.2 + Math.random() * 0.5, 0.6 + Math.random() * 0.7)
            .applyMatrix4(rootRef.current!.matrixWorld);
          smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
            size: 0.1 + Math.random() * 0.06,
            heat: 0.16, // poeira OCRE quente (nunca fuligem cinza)
            life: 0.8 + Math.random() * 0.5,
            lifeVar: 0.3,
            jitter: 0.2,
            rise: 0.15,
            drag: 3.0,
            vx: (Math.random() - 0.5) * 1.6,
            vz: 0.8 + Math.random() * 1.6, // a rajada empurra para frente
          });
        }
      }
    }
    if (sinceAttack < 0 || sinceAttack > SAND_ATTACK_WINDOW) strikeDone.current = false;

    // a cauda NUNCA para de vazar grão: poeirinha na base do funil
    if (smoke && alpha > 0.3) {
      dustAcc.current += dt * (0.9 + 0.9 * pose.charge) * (0.5 + 0.5 * hpFrac);
      let guard = 0;
      while (dustAcc.current >= 1 && guard < 3) {
        dustAcc.current -= 1;
        guard++;
        rootRef.current?.updateWorldMatrix(true, false);
        const ang = Math.random() * 6.283;
        const r = 0.55 + Math.random() * 0.5;
        tmpWorld
          .set(Math.cos(ang) * r, 0.1 + Math.random() * 0.5, Math.sin(ang) * r)
          .applyMatrix4(rootRef.current!.matrixWorld);
        smoke.spawn(tmpWorld.x, tmpWorld.y, tmpWorld.z, {
          size: 0.07 + Math.random() * 0.04,
          heat: 0.14,
          life: 1.0 + Math.random() * 0.6,
          lifeVar: 0.35,
          jitter: 0.16,
          rise: 0.35, // o turbilhão da cauda SUSPENDE o grão (anti-gravidade do gênio)
          drag: 2.4,
        });
      }
      if (dustAcc.current > 2) dustAcc.current = 2;
    }

    // ---- uniforms (areia E véu no mesmo loop; cada shader tem o seu par) ----
    const windBreath =
      Math.sin(t * 0.55 + seed) * 0.5 + Math.sin(t * 1.25 + seed * 0.7) * 0.3 + Math.sin(t * 2.6 + 1.3) * 0.2;
    const crumble = 1 - alpha; // morrendo: o gênio DESMONTA em areia
    for (const m of partMats.shaders) {
      const baseAmp = (m.userData.baseAmp as number | undefined) ?? m.uniforms.uAmp.value;
      m.userData.baseAmp = baseAmp;
      m.uniforms.uTime.value = t;
      m.uniforms.uHurt.value = hurt;
      m.uniforms.uAmp.value = baseAmp * (1 + hurt * 0.2 + crumble * 2.8);
      if (m.uniforms.uCharge) m.uniforms.uCharge.value = pose.charge;
      if (m.uniforms.uBreath) m.uniforms.uBreath.value = windBreath * (0.6 + 0.4 * hpFrac);
      // vento: uFlare acelera o turbilhão (cauda E esteiras das garras) e o
      // colapso vira vendaval final (uBend dispara no death)
      if (m.uniforms.uFlare) {
        m.uniforms.uFlare.value = Math.min(1.4, pose.charge + pose.flare * 0.4 + crumble * 0.8);
        m.uniforms.uBend.value = crumble * 0.22;
      }
    }
    grit.mat.uniforms.uTime.value = t;
    grit.mat.uniforms.uAlpha.value = alpha;
    grit.mat.uniforms.uCharge.value = pose.charge;

    // clarão sóbrio do núcleo aceso dentro da duna (nunca blowout)
    const core = coreGlowRef.current;
    core.scale.setScalar(0.7 + pose.charge * 0.24);
    (core.material as THREE.SpriteMaterial).opacity = Math.max(
      0,
      (0.05 + windBreath * 0.02 + pose.charge * 0.1) * alpha,
    );

    // ---- corpo: flutuação do gênio, torção do vendaval, afundar no chão na carga ----
    const g = rootRef.current;
    const sway = Math.sin(t * 0.45 + seed) * 0.02 + Math.sin(t * 1.0 + 1.7) * 0.007;
    g.scale.set(1 + pose.flare * 0.02, 1 - pose.rise * 0.015, 1 + pose.flare * 0.02);
    g.rotation.y = sway + pose.twist;
    g.rotation.z = Math.sin(t * 0.36 + seed * 0.6) * 0.009;
    g.rotation.x = -pose.rise * 0.02 - pose.twist * 0.08;
    // na carga o gênio SOBE (a cauda encolhe do chão); no tiro afunda o peito
    g.position.y = Math.sin(t * 0.8 + seed) * 0.05 + pose.rise * 0.14 - pose.doubleKick * 0.04;
    g.position.z = pose.stepZ;

    // ---- grupos orbitais (halo de grãos + nódulos em sentidos opostos) ----
    const orbital = modelDef.groups ?? {};
    for (const gid of Object.keys(orbital)) {
      const grp = groupRefs.current[Number(gid)];
      if (grp) grp.rotation.y += dt * orbital[Number(gid)] * (1 + pose.charge * 1.6);
    }

    // ---- peças: garras que recuam reunindo o grão e VARREM na rajada ----
    for (let i = 0; i < visParts.length; i++) {
      const part = visParts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      const base = part.r ?? [0, 0, 0];
      let sc = 1;

      const arm = actors.arms.find((x) => x.i === i);
      if (arm) {
        // garra: recua carregando (e o 2º tiro do doubleShot dá o recole curto)
        const swing = pose.swing - pose.doubleKick * 0.5;
        mesh.rotation.x = base[0] - swing;
        mesh.rotation.y = base[1];
        mesh.rotation.z = base[2] + arm.side * pose.twist * 0.3;
        sc *= 1 + pose.charge * 0.4 + pose.doubleKick * 0.25;
      }

      if (part.flick && !arm) {
        sc *= 1 + part.flick * 2 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 2.1 + seed));
      }
      if (sc !== 1) mesh.scale.setScalar(sc);
    }
    void topY; // topo amarrado nos testes; forma única Nv.6
  });

  return (
    <group ref={rootRef}>
      {visParts.map((part, i) => {
        const mesh = (
          <mesh
            ref={(m) => {
              partRefs.current[i] = m;
            }}
            geometry={partGeos[i]}
            material={partMats.list[i]}
            position={part.p}
            rotation={part.r ?? [0, 0, 0]}
            scale={part.s ?? 1}
            castShadow
          />
        );
        if (part.group !== undefined && modelDef.groups?.[part.group] !== undefined) {
          return (
            <group
              key={`g${part.group}-${level}-${i}`}
              ref={(gr) => {
                groupRefs.current[part.group!] = gr;
              }}
            >
              {mesh}
            </group>
          );
        }
        return <group key={`${level}-${i}`}>{mesh}</group>;
      })}
      <points geometry={grit.geo} material={grit.mat} frustumCulled={false} />
      <sprite ref={coreGlowRef} position={[0, 1.0, 0]} scale={0.7}>
        <spriteMaterial
          map={circleTexture()}
          color="#ffcf7a"
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/**
 * Grãos desprendendo da CAUDA-FUNIL: caem em arco das bandas do turbilhão
 * até o chão, dourados, e o charge arranca mais grão (a rajada rasgando a
 * própria cauda). Clamp de gl_PointSize (regra anti-envelope).
 */
const GRIT_VERT = /* glsl */ `
attribute vec3 aRand; // x: ângulo, y: fase, z: tamanho/velocidade
uniform float uTime;
uniform float uAlpha;
uniform float uSizeMul;
uniform float uCharge;
uniform float uTailH;
varying float vA;
varying vec3 vC;
void main() {
  float speed = 0.3 + 0.4 * aRand.z;
  float prog = fract(uTime * speed * 0.45 + aRand.y);
  // sai de uma banda do funil (raio cresce para baixo) e CAI em arco
  float ang = aRand.x * 6.28318 + prog * (1.5 + 2.0 * aRand.z) + uTime * 0.5;
  float y = mix(uTailH * (0.35 + 0.6 * aRand.z), 0.02, prog);
  float r = mix(0.35 + 0.3 * aRand.z, 1.15, prog * 0.7);
  vec3 p = vec3(cos(ang) * r, y, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (1.6 + 2.4 * aRand.z) * uSizeMul * (1.0 + uCharge * 0.35);
  // clamp: perto da câmera o sprite não pode virar parede (envelope fantasma)
  gl_PointSize = min(90.0, size * (28.0 / max(0.5, -mv.z)));
  vA = smoothstep(0.0, 0.08, prog) * (1.0 - smoothstep(0.7, 0.98, prog)) * uAlpha;
  // ocre do grão com quina clara iluminada (sem blowout)
  vC = mix(vec3(0.86, 0.66, 0.36), vec3(1.0, 0.87, 0.6), uCharge * 0.5 + 0.25 * aRand.z);
  gl_Position = projectionMatrix * mv;
}
`;

const GRIT_FRAG = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  // grão DURO (não fiapo de nuvem): disco com borda seca
  float m = smoothstep(0.5, 0.32, length(d));
  if (m <= 0.001 || vA <= 0.001) discard;
  gl_FragColor = vec4(vC, m * vA * 0.75);
}
`;
