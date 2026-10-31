import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../data/elements';
import { SPECIES } from '../data/monsters';
import type { ElementId, FxEvent, SpeciesId } from '../game/types';
import { getEngine } from '../store/gameStore';
import { circleTexture, drawPopupText, flameDropGeometry, flameIconTexture, getGeometry, slowIconTexture } from './assets';
import { makeFlameMaterial } from './flameShaders';
import { makeStoneMaterial } from './stoneShaders';
import { makeWoodMaterial } from './woodShaders';
import { makeIceMaterial } from './iceShaders';
import type { SmokePool } from './smokePool';

const PARTICLE_CAP = 400;
const POPUP_CAP = 12;
const RING_CAP = 8;
const BOLT_CAP = 4;
// arcos jagados (Raio): escopo do impacto/dispersão/corrente
const ARC_CAP = 14;
const ARC_SEG = 7;

function glowColor(el: ElementId | undefined): string {
  return el ? ELEMENTS[el].glow : '#ffd23f';
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

interface Popup {
  sprite: THREE.Sprite | null;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Sistema de efeitos: consome eventos efêmeros do motor (dreno único por
 * quadro) e reproduz partículas, números de dano, anéis de fusão e raios.
 */
export function Effects({ smoke }: { smoke?: SmokePool }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const parts = useMemo(() => {
    return {
      pos: new Float32Array(PARTICLE_CAP * 3),
      col: new Float32Array(PARTICLE_CAP * 3),
      base: new Float32Array(PARTICLE_CAP * 3),
      vel: new Float32Array(PARTICLE_CAP * 3),
      life: new Float32Array(PARTICLE_CAP),
      max: new Float32Array(PARTICLE_CAP),
      grav: new Float32Array(PARTICLE_CAP),
      cursor: 0,
    };
  }, []);
  const colorScratch = useMemo(() => new THREE.Color(), []);

  const popups = useMemo<Popup[]>(() => {
    return Array.from({ length: POPUP_CAP }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas);
      return {
        sprite: null as THREE.Sprite | null,
        ctx,
        texture,
        life: 0,
        max: 0.9,
        x: 0,
        y: -50,
        z: 0,
      };
    });
  }, []);

  const rings = useRef<THREE.Mesh[]>([]);
  const ringData = useMemo(
    () => Array.from({ length: RING_CAP }, () => ({ life: 0, max: 0.55, grow: 1.6 })),
    [],
  );
  const bolts = useRef<THREE.Mesh[]>([]);
  const boltData = useMemo(
    () => Array.from({ length: BOLT_CAP }, () => ({ life: 0 })),
    [],
  );
  // ---- arcos jagados (trovoada do Raio) ------------------------------------
  // polilinhas de segmentos tortos desenhadas como LineSegments aditivos:
  // é o traço duro de relâmpago que a geometrica lisa não consegue imitar
  const arcGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(ARC_CAP * ARC_SEG * 2 * 3);
    const col = new Float32Array(ARC_CAP * ARC_SEG * 2 * 3);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = 0;
      pos[i + 1] = -70;
      pos[i + 2] = 0;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  const arcMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const arcData = useMemo(
    () =>
      Array.from({ length: ARC_CAP }, () => ({
        ox: 0,
        oy: 0,
        oz: 0,
        dx: 0,
        dy: 1,
        dz: 0,
        len: 1,
        amp: 0.15,
        life: 0,
        max: 0.16,
        seed: 0,
        hot: 1,
        gold: 1,
      })),
    [],
  );
  const arcCursor = useRef(0);
  const arcScratch = useMemo(() => ({ a: new THREE.Color('#2f8fe6'), b: new THREE.Color('#cfe9ff') }), []);
  const arcTmp = useMemo(
    () => ({ d: new THREE.Vector3(), p: new THREE.Vector3(), perp2: new THREE.Vector3() }),
    [],
  );
  // explosões de projétil (bola de fogo do Ignis): gotas de chama que
  // incham e apagam usando o MESMO material de chama da criatura
  const BURST_CAP = 5;
  const bursts = useRef<THREE.Mesh[]>([]);
  const shards = useRef<THREE.Mesh[]>([]);
  const burstData = useMemo(
    () => Array.from({ length: BURST_CAP }, () => ({ life: 0, max: 0.36, size: 1 })),
    [],
  );
  const burstFlame = useMemo(() => {
    const geo = flameDropGeometry(0.5, 1.15, 18, 16);
    const mats = Array.from({ length: BURST_CAP }, (_, i) =>
      makeFlameMaterial({
        cold: '#ff3d0a',
        mid: '#ff8a1e',
        hot: '#ffe6a0',
        amp: 0.3,
        alphaMul: 1.12,
        seed: 4.1 + i * 2.3,
      }),
    );
    return { geo, mats };
  }, []);
  // "bolas de pedra" da explosão do Gólem: matação com o MESMO material de
  // pedra da criatura (relevo nas fissuras + fissuras de magma acesas)
  const SHARD_CAP = 4;
  const shardRock = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.5);
    const mats = Array.from({ length: SHARD_CAP }, (_, i) =>
      makeStoneMaterial({
        rockA: '#a88b62',
        rockB: '#4a3a26',
        crack: '#ff7a2a',
        amp: 0.08,
        crackGlow: 1.8,
        speck: 0.5,
        seed: 7.7 + i * 1.9,
        breath: 0.4,
      }),
    );
    return { geo, mats };
  }, []);
  // ...e os brotos de MADEIRA do impacto da Madeira (mesmo shader da criatura:
  // casca com sulcos + seiva esmeralda acesa no instante do choque)
  const shardWood = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.5);
    const mats = Array.from({ length: SHARD_CAP }, (_, i) =>
      makeWoodMaterial({
        barkA: '#7c9c56',
        barkB: '#3f3120',
        moss: '#4f7a3d',
        sap: '#37d977',
        amp: 0.09,
        sapGlow: 2.0,
        speck: 0.5,
        seed: 5.3 + i * 2.1,
        breath: 0.4,
      }),
    );
    return { geo, mats };
  }, []);
  // ...e os cacos de BASALTO incandescente do impacto do Magma (mesmo shader
  // do vulcão: rocha quase preta com rios de lava acesos no instante do choque)
  const shardLava = useMemo(() => {
    const mats = Array.from({ length: SHARD_CAP }, (_, i) =>
      makeStoneMaterial({
        rockA: '#42322e',
        rockB: '#140f10',
        crack: '#ff6a1f',
        amp: 0.06,
        crackGlow: 2.0,
        crackScale: 1.3,
        crackWidth: 0.04,
        crackBoost: 1.1,
        speck: 0.3,
        seed: 2.9 + i * 1.7,
        breath: 0.4,
      }),
    );
    // mesma geometria do pool da pedra (só o material muda por kind)
    return { geo: shardRock.geo, mats };
  }, [shardRock]);
  // ...e os cacos de CRISTAL de gelo do impacto da estaca do Gelo (mesmo
  // shader do corpo: cristal branco translúcido/reflexivo estilhaçando)
  const shardIce = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.5);
    const mats = Array.from({ length: SHARD_CAP }, (_, i) =>
      makeIceMaterial({
        iceA: '#f4faff',
        iceB: '#9cc2da',
        crack: '#d8f2ff',
        amp: 0.05,
        crackGlow: 1.4,
        crackScale: 1.5,
        crackWidth: 0.024,
        alpha: 0.8,
        sparkle: 1.2,
        seed: 8.1 + i * 2.4,
        breath: 0.4,
      }),
    );
    return { geo, mats };
  }, []);
  const shardData = useMemo(
    () =>
      Array.from({ length: SHARD_CAP }, () => ({
        life: 0,
        max: 0.62,
        size: 1,
        kind: 'rock' as 'rock' | 'wood' | 'lava' | 'ice',
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
      })),
    [],
  );
  useEffect(() => {
    return () => {
      for (const m of burstFlame.mats) m.dispose();
      burstFlame.geo.dispose();
      for (const m of shardRock.mats) m.dispose();
      shardRock.geo.dispose();
      for (const m of shardWood.mats) m.dispose();
      shardWood.geo.dispose();
      // shardLava compartilha a geometria do shardRock (dispose é idempotente)
      for (const m of shardLava.mats) m.dispose();
      for (const m of shardIce.mats) m.dispose();
      shardIce.geo.dispose();
      arcGeo.dispose();
      arcMat.dispose();
    };
  }, [burstFlame, shardRock, shardWood, shardLava, shardIce, arcGeo, arcMat]);
  const flameSprites = useRef<THREE.Sprite[]>([]);
  const slowSprites = useRef<THREE.Sprite[]>([]);
  const spriteData = useMemo(
    () => ({
      flame: Array.from({ length: 3 }, () => ({ life: 0 })),
      slow: Array.from({ length: 3 }, () => ({ life: 0 })),
    }),
    [],
  );

  const spawnParticles = (
    x: number,
    y: number,
    z: number,
    color: string,
    count: number,
    speed: number,
    life: number,
    grav: number,
    biasY = 0,
  ) => {
    colorScratch.set(color);
    for (let i = 0; i < count; i++) {
      const idx = parts.cursor;
      parts.cursor = (parts.cursor + 1) % PARTICLE_CAP;
      const o = idx * 3;
      parts.pos[o] = x + (Math.random() - 0.5) * 0.25;
      parts.pos[o + 1] = y + (Math.random() - 0.5) * 0.25;
      parts.pos[o + 2] = z + (Math.random() - 0.5) * 0.25;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      parts.vel[o] = Math.cos(a) * s;
      parts.vel[o + 1] = biasY + Math.random() * s * 0.7;
      parts.vel[o + 2] = Math.sin(a) * s;
      parts.base[o] = colorScratch.r;
      parts.base[o + 1] = colorScratch.g;
      parts.base[o + 2] = colorScratch.b;
      parts.col[o] = colorScratch.r;
      parts.col[o + 1] = colorScratch.g;
      parts.col[o + 2] = colorScratch.b;
      parts.life[idx] = life * (0.7 + Math.random() * 0.6);
      parts.max[idx] = parts.life[idx];
      parts.grav[idx] = grav;
    }
  };

  const spawnRing = (x: number, y: number, z: number, color: string, grow = 1.6) => {
    for (let i = 0; i < RING_CAP; i++) {
      const d = ringData[i];
      if (d.life > 0) continue;
      const mesh = rings.current[i];
      if (!mesh) return;
      d.life = d.max;
      d.grow = grow;
      mesh.position.set(x, y, z);
      (mesh.material as THREE.MeshBasicMaterial).color.set(color);
      return;
    }
  };

  const spawnBolt = (
    a: [number, number, number],
    b: [number, number, number],
    color: string,
  ) => {
    for (let i = 0; i < BOLT_CAP; i++) {
      const d = boltData[i];
      if (d.life > 0) continue;
      const mesh = bolts.current[i];
      if (!mesh) return;
      d.life = 0.14;
      tmp.set(a[0], a[1], a[2]);
      tmp2.set(b[0], b[1], b[2]);
      const mid = tmp.clone().add(tmp2).multiplyScalar(0.5);
      mesh.position.copy(mid);
      const dir = tmp2.clone().sub(tmp).normalize();
      mesh.quaternion.setFromUnitVectors(up, dir);
      mesh.scale.set(1, tmp.distanceTo(tmp2), 1);
      (mesh.material as THREE.MeshBasicMaterial).color.set(color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
      return;
    }
  };

  /** arco jagado de relâmpago: origem + direção + comprimento (zigue-zague
   *  recalculado a cada quadro — o traço FERVE como um estalo elétrico real) */
  const spawnArc = (
    o: [number, number, number],
    dx: number,
    dy: number,
    dz: number,
    len: number,
    amp: number,
    life: number,
    hot = 1,
    gold = 1,
  ) => {
    const idx = arcCursor.current;
    arcCursor.current = (arcCursor.current + 1) % ARC_CAP;
    const d = arcData[idx];
    const dl = Math.hypot(dx, dy, dz) || 1;
    d.ox = o[0];
    d.oy = o[1];
    d.oz = o[2];
    d.dx = dx / dl;
    d.dy = dy / dl;
    d.dz = dz / dl;
    d.len = len;
    d.amp = amp;
    d.life = life;
    d.max = life;
    d.seed = Math.random() * 100;
    d.hot = hot;
    d.gold = gold;
  };

  /** dispersão: N mini-arcos saltando em todas as direções de um ponto
   *  (a corrente do Raio se partindo no alvo — a "bola de pedra" elétrica) */
  const spawnScatter = (
    x: number,
    y: number,
    z: number,
    n: number,
    len: number,
    amp: number,
    life: number,
    hot = 1,
  ) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const vy = Math.random() * 1.4 - 0.35;
      spawnArc(
        [x + Math.cos(a) * 0.12, y + (Math.random() - 0.5) * 0.2, z + Math.sin(a) * 0.12],
        Math.cos(a),
        vy,
        Math.sin(a),
        len * (0.55 + Math.random() * 0.7),
        amp,
        life,
        hot,
      );
    }
  };

  const spawnBurst = (
    x: number,
    y: number,
    z: number,
    size = 1,
    kind: 'flame' | 'shard' | 'sprout' | 'lavaShard' | 'iceShard' = 'flame',
  ) => {
    if (kind === 'flame') {
      for (let i = 0; i < BURST_CAP; i++) {
        const d = burstData[i];
        if (d.life > 0) continue;
        const mesh = bursts.current[i];
        if (!mesh) return;
        d.life = d.max;
        d.size = size;
        mesh.visible = true;
        mesh.position.set(x, y, z);
        // rotação/tamanho iniciais aleatórios: cada explosão ferve diferente
        mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
        mesh.scale.setScalar(0.4 * size);
        return;
      }
      return;
    }
    // pedra: sai arremessada para os lados com cambalhota; a gravidade e o
    // quique no chão ficam no laço de frame
    for (let i = 0; i < SHARD_CAP; i++) {
      const d = shardData[i];
      if (d.life > 0) continue;
      const mesh = shards.current[i];
      if (!mesh) return;
      d.life = d.max;
      d.size = size;
      d.kind =
        kind === 'sprout'
          ? 'wood'
          : kind === 'lavaShard'
            ? 'lava'
            : kind === 'iceShard'
              ? 'ice'
              : 'rock';
      const a = Math.random() * Math.PI * 2;
      const s = 1.6 + Math.random() * 1.8;
      d.vx = Math.cos(a) * s;
      d.vy = 1.6 + Math.random() * 1.8;
      d.vz = Math.sin(a) * s;
      d.rx = (Math.random() - 0.5) * 11;
      d.ry = (Math.random() - 0.5) * 11;
      d.rz = (Math.random() - 0.5) * 11;
      mesh.visible = true;
      mesh.position.set(x + Math.cos(a) * 0.2, y, z + Math.sin(a) * 0.2);
      mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      mesh.scale.setScalar(0.4 * size);
      return;
    }
  };

  /** fumaça/fuligem do pool compartilhado (impactos, fusões) */
  const spawnSmoke = (
    x: number,
    y: number,
    z: number,
    count: number,
    opts?: { size?: number; heat?: number; life?: number; speed?: number },
  ) => {
    if (!smoke) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts?.speed ?? 0.9) * (0.4 + Math.random() * 0.8);
      smoke.spawn(x, y, z, {
        vx: Math.cos(a) * s,
        vy: 0.4 + Math.random() * 0.8,
        vz: Math.sin(a) * s,
        jitter: 0.28,
        life: opts?.life ?? 1.2,
        lifeVar: 0.6,
        size: (opts?.size ?? 0.1) * (0.8 + Math.random() * 0.6),
        heat: opts?.heat ?? 0.4,
        drag: 2.2,
      });
    }
  };

  const spawnStatusSprite = (
    pos: [number, number, number],
    status?: 'burn' | 'slow' | 'poison',
  ) => {
    const isFlame = status === 'burn';
    const arr = isFlame ? flameSprites.current : slowSprites.current;
    const data = isFlame ? (spriteData.flame as { life: number }[]) : (spriteData.slow as { life: number }[]);
    for (let i = 0; i < arr.length; i++) {
      if (data[i].life > 0) continue;
      data[i].life = 0.8;
      const sp = arr[i];
      if (sp) sp.position.set(pos[0] + 0.4, pos[1] + 1.4, pos[2] + 0.4);
      return;
    }
  };

  const usePopup = (x: number, y: number, z: number, text: string, color: string) => {
    let best = 0;
    let minRatio = Infinity;
    for (let i = 0; i < POPUP_CAP; i++) {
      const p = popups[i];
      const ratio = p.life / p.max;
      if (ratio < minRatio) {
        minRatio = ratio;
        best = i;
      }
    }
    const p = popups[best];
    drawPopupText(p.ctx, text, color);
    p.texture.needsUpdate = true;
    p.life = p.max;
    p.x = x + (Math.random() - 0.5) * 0.3;
    p.y = y;
    p.z = z;
  };

  const VISUAL_FAMILY: Record<string, 'flame' | 'rock' | 'gale' | 'wave' | 'storm' | 'crystal'> = {
    ignis: 'flame',
    magma: 'flame',
    vapor: 'flame',
    plasma: 'flame',
    vulcanico: 'flame',
    golem: 'rock',
    madeira: 'rock',
    areia: 'rock',
    obsidiana: 'rock',
    pantano: 'rock',
    geodo: 'rock',
    colosso: 'rock',
    zephyr: 'gale',
    nevoa: 'gale',
    nereia: 'wave',
    gelo: 'wave',
    abissal: 'wave',
    raio: 'storm',
    tempestade: 'storm',
    cosmico: 'storm',
    astral: 'storm',
    primordial: 'storm',
    cristal: 'crystal',
  };
  const impactColor = (species: SpeciesId | undefined, el: ElementId | undefined): string => {
    if (species) {
      const def = SPECIES[species];
      if (def?.base.projectileColor) return def.base.projectileColor;
    }
    return glowColor(el);
  };

  const handleFx = (events: FxEvent[]) => {
    for (const ev of events) {
      const [x, y, z] = ev.pos;
      switch (ev.type) {
        case 'hit': {
          spawnParticles(x, y - 0.4, z, glowColor(ev.element), 5, 1.6, 0.4, 1.5);
          if (ev.amount) usePopup(x, y, z, `-${ev.amount}`, '#ffe8c9');
          break;
        }
        case 'impact': {
          if (ev.species === 'raio') {
            // corrente do Raio no alvo: a descarga CHEGA como um arco jagado
            // (rastro do disparo) e se DISPERSA em mini-relâmpagos para todos
            // os lados — a assinatura elétrica espelhada no "peso" do golem
            const lv = Math.max(6, Math.min(10, ev.level ?? 6));
            const k = 1 + (lv - 6) * 0.1;
            if (ev.pos2) {
              const ix = ev.pos2[0] - x;
              const iy = ev.pos2[1] - y;
              const iz = ev.pos2[2] - z;
              const il = Math.hypot(ix, iy, iz);
              if (il > 0.4) {
                spawnArc([ev.pos2[0], ev.pos2[1], ev.pos2[2]], -ix, -iy, -iz, Math.min(il, 1.6), 0.16, 0.13, 0.9);
              }
            }
            spawnScatter(x, y, z, 4 + Math.round(lv * 0.6), 0.55 * k, 0.14, 0.16, 0.95);
            spawnParticles(x, y, z, '#8fd0ff', 8 + Math.round(lv * 0.7), 3.2, 0.4, -1.6, 1.2); // faíscas azul-elétricas subindo
            spawnParticles(x, y, z, '#ffffff', 4 + Math.round(lv * 0.3), 2.2, 0.25, 0.4); // estalos brancos
            spawnParticles(x, y - 0.2, z, '#ffd76a', 3 + Math.round(lv * 0.4), 1.8, 0.4, 1.2, 0.4); // brasas douradas do núcleo (acento)
            spawnRing(x, 0.1, z, '#3f9dff', 1.5 + 0.16 * lv);
            spawnRing(x, y * 0.55, z, '#ffd98a', 0.8 + 0.1 * lv);
            spawnSmoke(x, y, z, 2 + Math.round(lv * 0.3), {
              size: 0.06,
              heat: 0.02,
              life: 0.6,
              speed: 1.6,
            });
            break;
          }
          // estouro do projétil no alvo: faíscas + anel; bola de fogo do
          // Ignis ganha a explosão de chama (mesmo material da criatura)
          spawnParticles(x, y, z, glowColor(ev.element), 8, 2.4, 0.45, 1.2, 0.8);
          spawnRing(x, 0.1, z, glowColor(ev.element), 1.1);
          if (ev.species === 'ignis') {
            // bola de fogo maior/mais alto nível = explosão e fuligem maiores
            const lv = Math.max(1, Math.min(5, ev.level ?? 1));
            spawnBurst(x, y, z, 0.62 + 0.17 * lv);
            spawnParticles(x, y, z, '#ffb347', 8 + lv * 2, 3.0, 0.6, -1.8, 1.4); // brasos subindo
            spawnParticles(x, y, z, '#ff5a1f', 6 + lv, 2.2, 0.5, 1.6);
            spawnSmoke(x, y, z, 3 + lv, {
              size: 0.08 + 0.014 * lv,
              heat: 0.55,
              life: 1.0 + 0.12 * lv,
              speed: 1.1,
            });
          } else if (ev.species === 'golem') {
            // punho de pedra: bolas de pedra com o material da criatura
            // quicando no chão, lascas douradas, poeira e DOIS anéis no piso
            // (o segundo anel largo é o "peso" do impacto)
            const lv = Math.max(1, Math.min(5, ev.level ?? 1));
            for (let i = 0; i < 2; i++) spawnBurst(x, y, z, 0.34 + 0.12 * lv, 'shard');
            spawnParticles(x, y, z, '#d8b06a', 8 + lv * 2, 2.8, 0.5, 2.2, 1.0); // lascas douradas
            spawnParticles(x, y, z, '#7d6a4a', 6 + lv, 1.9, 0.55, 2.0); // terra escura caindo
            spawnParticles(x, y, z, '#f2e2c8', 4 + lv, 1.4, 0.3, 1.0, 0.5); // brilho de mineral
            spawnRing(x, 0.1, z, '#e0b96a', 1.7 + 0.28 * lv);
            spawnRing(x, 0.16, z, '#c98a4b', 0.9 + 0.22 * lv); // anel interno = peso
            spawnSmoke(x, y, z, 3 + lv, {
              size: 0.09 + 0.016 * lv,
              heat: 0.12, // poeira fria de pedra
              life: 1.1 + 0.1 * lv,
              speed: 1.3,
            });
          } else if (ev.species === 'madeira') {
            // semente do ancião no alvo: brotos de casca com seiva acesa
            // saltando (o "peso" lenhoso espelhado no golem), farpa de folha,
            // anéis de musgo/esmeralda e nuvem de esporos (a assinatura do slow)
            const lv = Math.max(6, Math.min(10, ev.level ?? 6));
            for (let i = 0; i < 2; i++) spawnBurst(x, y, z, 0.3 + 0.05 * (lv - 6), 'sprout');
            spawnParticles(x, y, z, '#8fbf6f', 10, 2.5, 0.55, 1.6, 1.1); // farpas de folha
            spawnParticles(x, y, z, '#4d3a22', 6, 1.9, 0.55, 2.0); // casca escura caindo
            spawnParticles(x, y, z, '#b8f0c8', 5, 1.4, 0.3, 0.5, 0.4); // pó de esmeralda
            spawnRing(x, 0.1, z, '#7fb069', 1.6 + 0.12 * (lv - 6));
            spawnRing(x, 0.16, z, '#2fbf6f', 0.9); // anel interno esmeralda
            spawnSmoke(x, y, z, 4, {
              size: 0.08,
              heat: 0.04, // esporos frios
              life: 1.0,
              speed: 1.1,
            });
          } else if (ev.species === 'magma') {
            // bloco de lava do vulcão no alvo: a bola de fogo da família se
            // abre em CACOS DE BASALTO incandescente quicando (o peso físico
            // do golem com a temperatura da lava), brasas subindo da fissura
            // do impacto (o vulcão expele, não desmorona) e cinza quente
            const lv = Math.max(6, Math.min(10, ev.level ?? 6));
            spawnBurst(x, y, z, 0.5 + 0.06 * (lv - 6));
            for (let i = 0; i < 2; i++) spawnBurst(x, y, z, 0.32 + 0.05 * (lv - 6), 'lavaShard');
            spawnParticles(x, y, z, '#ff6a1f', 8 + (lv - 6) * 2, 3.0, 0.6, -1.8, 1.4); // brasas subindo
            spawnParticles(x, y, z, '#ffb347', 6, 2.4, 0.5, -1.0, 0.8); // faíscas quentes
            spawnParticles(x, y, z, '#1d1416', 7, 2.2, 0.55, 2.2, 1.0); // debris de basalto caindo
            spawnRing(x, 0.1, z, '#ff6a1f', 1.7 + 0.12 * (lv - 6));
            spawnRing(x, 0.16, z, '#ffd08a', 0.95); // anel interno quente
            spawnSmoke(x, y, z, 4, {
              size: 0.085,
              heat: 0.25, // cinza ainda quente
              life: 1.05,
              speed: 1.1,
            });
          } else if (ev.species === 'gelo') {
            // estaca de cristal no alvo: o icicle ESTILHAÇA em cacos do mesmo
            // cristal (branco translúcido quicando), pó de gelo cintilante,
            // farpas azuis e NÉVOA FRIA no chão (a assinatura do slow)
            const lv = Math.max(6, Math.min(10, ev.level ?? 6));
            for (let i = 0; i < 2; i++) spawnBurst(x, y, z, 0.3 + 0.05 * (lv - 6), 'iceShard');
            spawnParticles(x, y, z, '#eaf6ff', 12, 2.8, 0.5, 1.6, 0.9); // estilhaços brancos
            spawnParticles(x, y, z, '#a8e6ff', 8, 2.2, 0.5, 1.2, 0.5); // farpas azuis
            spawnParticles(x, y, z, '#ffffff', 5, 1.3, 0.28, 0.4, 0.3); // glitter de pó de gelo
            spawnRing(x, 0.1, z, '#cfe9ff', 1.7 + 0.12 * (lv - 6)); // placa de geada
            spawnRing(x, 0.16, z, '#8fd0ff', 0.95); // anel interno congelado
            spawnSmoke(x, y, z, 4, {
              size: 0.08,
              heat: 0, // névoa fria (bruma congelante)
              life: 1.1,
              speed: 1.0,
            });
          } else if (ev.species === 'zephyr') {
            // rajada do zéfiro: faíscas que SOBEM (vento não tem peso), anel
            // de choque flutuante na altura do impacto, marca no chão e
            // névoa gelada
            const lv = Math.max(1, Math.min(5, ev.level ?? 1));
            spawnParticles(x, y, z, '#cfeaff', 10 + lv * 2, 3.4, 0.45, -1.6, 0.5); // sobem
            spawnParticles(x, y, z, '#8fb8d8', 8 + lv, 2.4, 0.4, -0.8);
            spawnParticles(x, y + 0.2, z, '#ffffff', 4 + lv, 1.6, 0.25, -0.4, 0.3);
            spawnRing(x, y + 0.05, z, '#bfe9ff', 1.5 + 0.24 * lv); // anel no ar
            spawnRing(x, 0.1, z, '#8fb8d8', 1.0 + 0.16 * lv); // e a marca no chão
            spawnSmoke(x, y, z, 3 + lv, {
              size: 0.06 + 0.012 * lv,
              heat: 0.02, // névoa gelada
              life: 0.7 + 0.08 * lv,
              speed: 1.8,
            });
          } else if (ev.species === 'nereia') {
            // lança d'água: fonte azul que sobe e CAI (água tem peso),
            // dois anéis molhados no chão e névoa d'água
            const lv = Math.max(1, Math.min(5, ev.level ?? 1));
            spawnParticles(x, y, z, '#bfe4ff', 10 + lv * 2, 2.6, 0.55, 1.5, 1.7); // respingo
            spawnParticles(x, y, z, '#4db4ff', 8 + lv, 2.0, 0.6, 1.2, 0.6);
            spawnParticles(x, y, z, '#e8f6ff', 4 + lv, 1.2, 0.35, 1.0, 0.8); // espuma
            spawnRing(x, 0.1, z, '#7cc4f0', 1.5 + 0.22 * lv);
            spawnRing(x, 0.16, z, '#4db4ff', 0.9 + 0.18 * lv);
            spawnSmoke(x, y, z, 3 + lv, {
              size: 0.07 + 0.012 * lv,
              heat: 0.02, // névoa d'água
              life: 0.8 + 0.08 * lv,
              speed: 1.2,
            });
          } else if (
            ev.species &&
            (VISUAL_FAMILY[ev.species] === 'flame' ||
              VISUAL_FAMILY[ev.species] === 'rock' ||
              VISUAL_FAMILY[ev.species] === 'wave' ||
              VISUAL_FAMILY[ev.species] === 'gale' ||
              VISUAL_FAMILY[ev.species] === 'storm' ||
              VISUAL_FAMILY[ev.species] === 'crystal')
          ) {
            // criaturas da árvore elemental (Nv.6–10): cada linhagem mantém a
            // assinatura da família (lava explode, pedra racha, mar respinga,
            // bruma sobe, trovoada estala, cristal ricocheteia)
            const fam = VISUAL_FAMILY[ev.species];
            const color = impactColor(ev.species, ev.element);
            if (fam === 'flame') {
              spawnBurst(x, y, z, 0.55 + 0.04 * Math.min(10, ev.level ?? 1));
              spawnParticles(x, y, z, color, 10, 3.0, 0.6, -1.8, 1.4);
              spawnSmoke(x, y, z, 4, { size: 0.1, heat: 0.5, life: 1.1, speed: 1.2 });
            } else if (fam === 'rock') {
              spawnBurst(x, y, z, 0.4 + 0.03 * Math.min(10, ev.level ?? 1), 'shard');
              spawnParticles(x, y, z, color, 10, 2.6, 0.5, 2.2, 0.9);
              spawnRing(x, 0.1, z, color, 1.8);
              spawnSmoke(x, y, z, 4, { size: 0.1, heat: 0.12, life: 1.1, speed: 1.3 });
            } else if (fam === 'wave') {
              spawnParticles(x, y, z, color, 10, 2.6, 0.55, 1.5, 1.7);
              spawnRing(x, 0.1, z, color, 1.6);
              spawnSmoke(x, y, z, 3, { size: 0.07, heat: 0.02, life: 0.8, speed: 1.2 });
            } else if (fam === 'gale') {
              spawnParticles(x, y, z, color, 10, 3.4, 0.45, -1.6, 0.5);
              spawnRing(x, y + 0.05, z, color, 1.5);
              spawnSmoke(x, y, z, 3, { size: 0.06, heat: 0.02, life: 0.7, speed: 1.8 });
            } else if (fam === 'storm') {
              spawnParticles(x, y, z, color, 12, 3.6, 0.5, -1.2, 0.8);
              spawnParticles(x, y, z, '#ffffff', 5, 2.2, 0.3, 0.6);
              spawnRing(x, 0.1, z, color, 1.9);
            } else {
              // cristal: estilhaços facetados que brilham e caem devagar
              spawnParticles(x, y, z, color, 12, 2.8, 0.55, 0.6, 0.8);
              spawnParticles(x, y, z, '#ffffff', 4, 1.8, 0.35, 0.4);
              spawnRing(x, 0.1, z, color, 1.5);
            }
          }
          break;
        }
        case 'discovery': {
          // descoberta inédita: coluna de luz dourada + anéis + faíscas subindo
          spawnParticles(x, y + 0.4, z, '#ffd76a', 30, 2.2, 1.4, -3.2, 2.2);
          spawnParticles(x, y + 0.4, z, glowColor(ev.element), 16, 2.8, 1.0, -2.4, 1.0);
          spawnParticles(x, y + 0.4, z, '#ffffff', 8, 1.6, 0.6, -1.6, 0.6);
          spawnRing(x, 0.12, z, '#ffd76a', 2.8);
          spawnRing(x, 0.16, z, glowColor(ev.element), 1.6);
          spawnSmoke(x, y + 0.6, z, 5, { size: 0.12, heat: 0.35, life: 1.6, speed: 1.1 });
          break;
        }
        case 'primordial': {
          // Nv.10: o nascimento da entidade primordial — clarão total da arena
          spawnParticles(x, y + 0.5, z, '#ffffff', 42, 4.2, 1.6, -3.4, 2.8);
          spawnParticles(x, y + 0.5, z, '#ffd76a', 26, 3.2, 1.4, -2.8, 1.6);
          for (const elE of ['fire', 'water', 'earth', 'air'] as const) {
            spawnParticles(x, y + 0.5, z, ELEMENTS[elE].glow, 8, 2.6, 1.1, -2.0, 0.8);
          }
          spawnRing(x, 0.12, z, '#ffffff', 4.2);
          spawnRing(x, 0.16, z, '#ffd76a', 3.0);
          spawnRing(x, 0.2, z, '#9ad0ff', 2.0);
          spawnSmoke(x, y + 0.8, z, 8, { size: 0.14, heat: 0.5, life: 2.0, speed: 1.4 });
          usePopup(x, y + 1.6, z, 'PRIMORDIAL', '#ffd76a');
          break;
        }
        case 'status':
          spawnParticles(x, y + 0.6, z, glowColor(ev.element), 4, 0.8, 0.5, -0.5, 0.6);
          if (ev.status === 'burn' || ev.status === 'slow') {
            spawnStatusSprite(ev.pos, ev.status);
          } else if (ev.status === 'poison') {
            // veneno: bolhas verdes subindo devagar
            spawnParticles(x, y + 0.5, z, '#8fd85f', 8, 0.9, 0.9, -0.9, 0.5);
            spawnParticles(x, y + 0.8, z, '#55802e', 4, 0.6, 0.7, -0.6, 0.3);
          }
          break;
        case 'kill': {
          spawnParticles(x, y, z, glowColor(ev.element), 20, 3.2, 0.8, 2.2);
          spawnParticles(x, y, z, '#ffffff', 6, 2.2, 0.4, 1);
          spawnRing(x, 0.1, z, glowColor(ev.element), 2.0);
          break;
        }
        case 'summon': {
          spawnParticles(x, 0.4, z, glowColor(ev.element), 12, 1.4, 0.6, -1.4, 1.8);
          spawnRing(x, 0.12, z, glowColor(ev.element), 1.2);
          break;
        }
        case 'sell': {
          // lixeira: implosão dourada + moedas subindo + "+X" no local
          spawnRing(x, 0.1, z, '#f5c451', 1.35);
          spawnParticles(x, y, z, '#f5c451', 12, 1.2, 1.0, -2.2, 0.9); // moedas sobem
          spawnParticles(x, y, z, '#ffe9b8', 5, 0.7, 0.6, -1.2, 0.6);
          if (ev.amount) usePopup(x, y + 0.3, z, `+${ev.amount}`, '#f5c451');
          break;
        }
        case 'mergeStart': {
          const cx = ev.pos2 ? (x + ev.pos2[0]) / 2 : x;
          const cz = ev.pos2 ? (z + ev.pos2[2]) / 2 : z;
          spawnRing(cx, 0.12, cz, '#ffd23f', 1.4);
          spawnParticles(x, y + 0.6, z, '#ffd23f', 10, 1.2, 0.5, -1.2);
          if (ev.pos2) {
            spawnParticles(ev.pos2[0], ev.pos2[1] + 0.6, ev.pos2[2], '#ffd23f', 10, 1.2, 0.5, -1.2);
          }
          break;
        }
        case 'mergeDone': {
          spawnParticles(x, y + 0.7, z, '#ffd23f', 26, 3.4, 0.9, -2.4);
          spawnParticles(x, y + 0.7, z, glowColor(ev.element), 14, 2.6, 0.8, -2.2);
          spawnRing(x, 0.12, z, '#ffd23f', 2.4);
          // fusão de fogo: a explosão de chama e a fuligem são do tamanho do
          // novo nível (subir de nível é visível no tabuleiro)
          if (ev.species === 'ignis') {
            const nl = ev.level ?? 1;
            spawnBurst(x, y + 0.7, z, 0.6 + 0.32 * nl);
            spawnSmoke(x, y + 0.5, z, 4 + nl * 2, {
              size: 0.1 + 0.02 * nl,
              heat: 0.5,
              life: 1.6,
              speed: 1.3,
            });
          }
          break;
        }
        case 'chain': {
          if (ev.pos2) {
            if (ev.species === 'raio') {
              // respingo da corrente: salto em ARCO JAGADO azul-elétrico com
              // osso dourado (o fio duro de relâmpago), não o cilindro claro
              // das outras trovoadas
              const ax = ev.pos2[0] - x;
              const ay = ev.pos2[1] + 0.7 - (y + 0.7);
              const az = ev.pos2[2] - z;
              const al = Math.hypot(ax, ay, az);
              spawnArc([x, y + 0.6, z], ax, ay, az, Math.max(0.5, Math.min(al, 6)), 0.2, 0.16, 0.95);
              spawnScatter(ev.pos2[0], ev.pos2[1] + 0.7, ev.pos2[2], 3, 0.4, 0.12, 0.13, 0.9);
              spawnParticles(ev.pos2[0], ev.pos2[1] + 0.7, ev.pos2[2], '#bfe4ff', 6, 1.6, 0.35, -1);
            } else {
              spawnBolt(ev.pos, ev.pos2, glowColor(ev.element) || '#aef2ff');
              spawnParticles(ev.pos2[0], ev.pos2[1] + 0.7, ev.pos2[2], glowColor(ev.element), 6, 1.4, 0.4, 1);
            }
          }
          break;
        }
      }
    }
  };

  useFrame((state, dt) => {
    const clockT = state.clock.elapsedTime;
    const eng = getEngine();
    if (eng) handleFx(eng.drainFx());

    // partículas
    const { pos, col, base, vel, life, max, grav } = parts;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const o = i * 3;
      vel[o + 1] -= grav[i] * dt;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      if (life[i] <= 0) {
        pos[o + 1] = -60;
        col[o] = col[o + 1] = col[o + 2] = 0;
        continue;
      }
      const fade = (life[i] / max[i]) ** 1.6;
      col[o] = base[o] * fade;
      col[o + 1] = base[o + 1] * fade;
      col[o + 2] = base[o + 2] * fade;
    }
    const geo = pointsRef.current.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // popups
    for (const p of popups) {
      if (!p.sprite) continue;
      if (p.life > 0) {
        p.life -= dt;
        const t = 1 - p.life / p.max;
        p.sprite.position.set(p.x, p.y + t * 1.25, p.z);
        const mat = p.sprite.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, 1 - t * t * 1.15);
        const s = 0.62 + 0.16 * Math.sin(Math.min(1, t * 4) * Math.PI);
        p.sprite.scale.set(s, s, 1);
      } else if (p.sprite.material.opacity !== 0) {
        (p.sprite.material as THREE.SpriteMaterial).opacity = 0;
      }
    }

    // anéis
    for (let i = 0; i < RING_CAP; i++) {
      const mesh = rings.current[i];
      const d = ringData[i];
      if (!mesh) continue;
      if (d.life > 0) {
        d.life -= dt;
        const t = 1 - d.life / d.max;
        const s = 0.5 + t * d.grow;
        mesh.scale.set(s, s, s);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      } else {
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // raios de corrente
    for (let i = 0; i < BOLT_CAP; i++) {
      const mesh = bolts.current[i];
      const d = boltData[i];
      if (!mesh) continue;
      if (d.life > 0) {
        d.life -= dt;
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / 0.14);
        mesh.scale.x = mesh.scale.z = 0.7 + Math.random() * 0.7;
      } else {
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // arcos jagados da trovoada (Raio): o zigue-zague é redesenhado TODO
    // quadro (ferve) enquanto vivo; a cauda é azul-elétrica, o miolo azul-branco
    // e o osso mais quente do raio acende no acento dourado (paleta da referência)
    const hashOff = (seed: number, s: number, tt: number) =>
      0.55 * Math.sin(seed * 9 + s * 12.9898 + Math.floor(tt * 16) * 3.77) +
      0.45 * Math.sin(seed + s * 5.1 + tt * 34);
    let arcDirty = false;
    const arcPos = arcGeo.getAttribute('position') as THREE.BufferAttribute;
    const arcCol = arcGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < ARC_CAP; i++) {
      const d = arcData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) continue; // o último quadro apaga e a linha some
      arcDirty = true;
      const t = 1 - d.life / d.max;
      const fade = 1 - t * t;
      const flick = 0.55 + 0.45 * Math.sin(clockT * 73 + d.seed * 13 + i * 2.1);
      const k = fade * (0.55 + 0.45 * flick);
      arcScratch.a.setRGB(0.16, 0.44, 0.9); // cauda azul-elétrica
      arcScratch.b.setRGB(0.8, 0.92, 1.0); // miolo azul-branco
      arcScratch.b.multiplyScalar(d.hot);
      arcTmp.d.set(d.dx, d.dy, d.dz);
      // base perpendicular estável no tempo de vida (o traço não "dança" a
      // direção inteira, só ferve em cima dela)
      arcTmp.p.set(0, 1, 0).cross(arcTmp.d);
      if (arcTmp.p.lengthSq() < 1e-4) arcTmp.p.set(1, 0, 0).cross(arcTmp.d);
      arcTmp.p.normalize();
      arcTmp.perp2.crossVectors(arcTmp.d, arcTmp.p);
      const ampNow = d.amp * (0.8 + 0.35 * flick);
      for (let s = 0; s <= ARC_SEG; s++) {
        const t0 = s / ARC_SEG;
        const shape = Math.sin(t0 * Math.PI); // pontas fixas, meio torto
        const off = hashOff(d.seed, s, clockT) * ampNow * shape;
        const px = d.ox + arcTmp.d.x * t0 * d.len + arcTmp.p.x * off + arcTmp.perp2.x * off * 0.6;
        const py = d.oy + arcTmp.d.y * t0 * d.len + arcTmp.p.y * off + arcTmp.perp2.y * off * 0.6;
        const pz = d.oz + arcTmp.d.z * t0 * d.len + arcTmp.p.z * off + arcTmp.perp2.z * off * 0.6;
        if (s > 0) {
          const wA = (i * ARC_SEG * 2 + (s - 1) * 2 + 1) * 3; // vertex do fim do traço anterior (mesma posição)
          arcPos.setXYZ(wA / 3, px, py, pz);
          const wB = (i * ARC_SEG * 2 + s * 2) * 3;
          arcPos.setXYZ(wB / 3, px, py, pz);
          const heat = (0.25 + 0.75 * shape) * k;
          // só o "osso" mais quente do raio puxa para o dourado; o resto do
          // traço fica na corrente azul (dourado é acento, não a base)
          const goldT = Math.max(0, heat - 0.6) * d.gold;
          const cr = arcScratch.a.r + (arcScratch.b.r - arcScratch.a.r) * heat + goldT * 0.6;
          const cg = arcScratch.a.g + (arcScratch.b.g - arcScratch.a.g) * heat + goldT * 0.38;
          const cb = arcScratch.a.b + (arcScratch.b.b - arcScratch.a.b) * heat - goldT * 0.3;
          arcCol.setXYZ(wA / 3, cr, cg, cb);
          arcCol.setXYZ(wB / 3, cr, cg, cb);
        }
      }
    }
    if (arcDirty) {
      arcPos.needsUpdate = true;
      arcCol.needsUpdate = true;
    }

    // explosões de bola de fogo (chama que incha e some)
    for (let i = 0; i < BURST_CAP; i++) {
      const mesh = bursts.current[i];
      const d = burstData[i];
      const mat = burstFlame.mats[i];
      if (!mesh) continue;
      if (d.life > 0) {
        d.life -= dt;
        mat.uniforms.uTime.value = clockT + i * 1.7;
        const t = 1 - Math.max(0, d.life) / d.max;
        const ease = 1 - (1 - t) ** 2; // cresce rápido e freia
        mesh.scale.setScalar(d.size * (0.4 + 1.8 * ease));
        mat.uniforms.uAlpha.value = 1 - t;
        mat.uniforms.uAmp.value = 0.3 * (1 + t * 1.6); // fervendo enquanto expande
      } else if (mesh.visible) {
        mesh.visible = false;
      }
    }

    // estilhaços de pedra do impacto do Gólem: saem disparados para os lados,
    // a gravidade os puxa para o chão (quicam), cambalhotam e apagam
    // encolhendo — as fissuras de magma acendem no instante do impacto e
    // vão sumindo (material de pedra igual ao da criatura)
    for (let i = 0; i < SHARD_CAP; i++) {
      const mesh = shards.current[i];
      const d = shardData[i];
      // a malha do pool é compartilhada: quem decide a "substância" do
      // estilhaço é o kind gravado no spawn (pedra do golem, madeira da
      // Madeira, basalto incandescente do Magma, cristal do Gelo) — o par
      // geometry/material troca a cada uso
      const set =
        d.kind === 'wood' ? shardWood : d.kind === 'lava' ? shardLava : d.kind === 'ice' ? shardIce : shardRock;
      const mat = set.mats[i];
      if (!mesh) continue;
      if (d.life > 0) {
        mesh.geometry = set.geo;
        mesh.material = mat;
        d.life -= dt;
        const t = 1 - Math.max(0, d.life) / d.max;
        mat.uniforms.uTime.value = clockT + i * 2.3;
        mat.uniforms.uCharge.value = Math.max(0, 1 - t * 1.8);
        if (mat.uniforms.uSap) mat.uniforms.uSap.value = 0.7;
        d.vy -= 10.5 * dt; // pedra tem peso
        mesh.position.x += d.vx * dt;
        mesh.position.y += d.vy * dt;
        mesh.position.z += d.vz * dt;
        const floor = 0.1 + 0.1 * d.size;
        if (mesh.position.y < floor) {
          mesh.position.y = floor;
          d.vy = Math.abs(d.vy) * 0.38;
          d.vx *= 0.72;
          d.vz *= 0.72;
        }
        mesh.rotation.x += d.rx * dt;
        mesh.rotation.y += d.ry * dt;
        mesh.rotation.z += d.rz * dt;
        const grow = Math.min(1, t / 0.18);
        const shrink = 1 - Math.max(0, (t - 0.72) / 0.28);
        mesh.scale.setScalar(d.size * (0.4 + 0.75 * grow) * shrink);
      } else if (mesh.visible) {
        mesh.visible = false;
      }
    }

    // ícones de status
    for (const [sprites, data] of [
      [flameSprites.current, spriteData.flame],
      [slowSprites.current, spriteData.slow],
    ] as const) {
      for (let i = 0; i < sprites.length; i++) {
        const sp = sprites[i];
        const d = data[i] as { life: number };
        if (!sp) continue;
        if (d.life > 0) {
          d.life -= dt;
          const t = 1 - d.life / 0.8;
          sp.position.y += dt * 0.8;
          const s = 0.34 * (1 + 0.2 * Math.sin(t * 18));
          sp.scale.set(s, s, 1);
          (sp.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - t);
        } else if ((sp.material as THREE.SpriteMaterial).opacity !== 0) {
          (sp.material as THREE.SpriteMaterial).opacity = 0;
        }
      }
    }
  });

  const particleGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(parts.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(parts.col, 3));
    return g;
  }, [parts]);

  return (
    <group>
      <points ref={pointsRef} geometry={particleGeo} frustumCulled={false}>
        <pointsMaterial
          size={0.17}
          map={circleTexture()}
          vertexColors
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {popups.map((p, i) => (
        <sprite
          key={i}
          ref={(s) => {
            p.sprite = s;
          }}
          position={[0, -50, 0]}
          scale={0.6}
        >
          <spriteMaterial
            map={p.texture}
            transparent
            depthWrite={false}
            toneMapped={false}
            opacity={0}
          />
        </sprite>
      ))}

      {Array.from({ length: RING_CAP }, (_, i) => (
        <mesh
          key={`r${i}`}
          ref={(m) => {
            if (m) rings.current[i] = m;
          }}
          geometry={getGeometry('plane', [2, 2])}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.12, 0]}
        >
          <meshBasicMaterial
            map={circleTexture()}
            color="#ffd23f"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {Array.from({ length: BOLT_CAP }, (_, i) => (
        <mesh
          key={`b${i}`}
          ref={(m) => {
            if (m) bolts.current[i] = m;
          }}
          geometry={getGeometry('cyl', [0.045, 0.045, 1, 5])}
        >
          <meshBasicMaterial
            color="#aef2ff"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* arcos jagados da trovoada (Raio): LineSegments aditivos com zigue-
          zague recalculado por quadro; invisíveis até o primeiro estalo */}
      <lineSegments geometry={arcGeo} material={arcMat} frustumCulled={false} />

      {Array.from({ length: BURST_CAP }, (_, i) => (
        <mesh
          key={`x${i}`}
          ref={(m) => {
            if (m) bursts.current[i] = m;
          }}
          geometry={burstFlame.geo}
          material={burstFlame.mats[i]}
          visible={false}
          frustumCulled={false}
        />
      ))}

      {Array.from({ length: SHARD_CAP }, (_, i) => (
        <mesh
          key={`k${i}`}
          ref={(m) => {
            if (m) shards.current[i] = m;
          }}
          geometry={shardRock.geo}
          material={shardRock.mats[i]}
          visible={false}
          frustumCulled={false}
        />
      ))}

      {Array.from({ length: 3 }, (_, i) => (
        <sprite
          key={`flame${i}`}
          ref={(s) => {
            if (s) flameSprites.current[i] = s;
          }}
          scale={0.34}
          position={[0, -50, 0]}
        >
          <spriteMaterial map={flameIconTexture()} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <sprite
          key={`slow${i}`}
          ref={(s) => {
            if (s) slowSprites.current[i] = s;
          }}
          scale={0.34}
          position={[0, -50, 0]}
        >
          <spriteMaterial map={slowIconTexture()} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}
