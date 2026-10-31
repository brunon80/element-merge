import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  ROW_DEPTH,
  TILE_SPACING_X,
  boardSlotPositions,
  tileFromWorld,
  tileGroundPosition,
} from '../game/board';
import { getEngine, useGameStore } from '../store/gameStore';

/**
 * Destaque do "spot" de destino enquanto o jogador arrasta uma criatura
 * (mouse segurado ou toque segurado). É o principal retorno visual de onde a
 * criatura vai cair:
 *
 *  • disco de luz + anel tracejado girando no slot (sempre no slot válido);
 *  • quatro colchetes que "fecham" sobre o slot no instante em que o destino
 *    é travado (lock-on);
 *  • feixe vertical com seta descendo e colar subindo em loop — visível mesmo
 *    quando o slot está escondido atrás de uma criatura grande;
 *  • faíscas orbitando quando o destino é uma FUSÃO válida;
 *  • X vermelho + cores quentes quando a posição não vale (fora do tabuleiro,
 *    lado errado ou fusão impossível);
 *  • enquanto o arraste acontece, os slots livres do lado mostram uma marca de
 *    canto discreta ("posso receber aqui").
 *
 * Cores: mover = azul, fundir = verde, inválido = vermelho.
 */

type Kind = 'move' | 'merge' | 'invalid';

const KIND_COLOR: Record<Kind, string> = {
  move: '#63c2ff',
  merge: '#42e8a4',
  invalid: '#ff5470',
};

/** meia-dimensão do retângulo dos colchetes (proporção da célula do tabuleiro) */
const BRACKET_HX = TILE_SPACING_X * 0.4;
const BRACKET_HZ = ROW_DEPTH * 0.42;

/** disco/anel/X do destino na proporção da célula (a elipse do pai casa com o vão 3,2×2,3) */
const PAD_PLANE = TILE_SPACING_X * 0.91;
const RING_R: [number, number] = [TILE_SPACING_X * 0.375, TILE_SPACING_X * 0.42];
const CROSS_ARM = TILE_SPACING_X * 0.83;

// ---------------------------------------------------------------------------
// texturas de tela (desenhadas uma única vez)
// ---------------------------------------------------------------------------

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

let padTex: THREE.Texture | null = null;
/** núcleo brilhante + anel forte + anel tracejado externo */
function padTexture(): THREE.Texture {
  if (padTex) return padTex;
  padTex = canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0.78)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.24)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([16, 13]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.86, 0, Math.PI * 2);
    ctx.stroke();
  });
  return padTex;
}

let beamTex: THREE.Texture | null = null;
/** gradiente vertical (denso embaixo, some no topo) */
function beamTexture(): THREE.Texture {
  if (beamTex) return beamTex;
  beamTex = canvasTexture(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return beamTex;
}

let hintTex: THREE.Texture | null = null;
/** quatro cantos de slot (aviso discreto de "slot livre") */
function hintTexture(): THREE.Texture {
  if (hintTex) return hintTex;
  hintTex = canvasTexture(128, 128, (ctx, w) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 9;
    const m = 22;
    const l = 30;
    const corners: [number, number, number, number][] = [
      [m, m, 1, 1],
      [w - m, m, -1, 1],
      [m, w - m, 1, -1],
      [w - m, w - m, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + sx * l, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * l);
      ctx.stroke();
    }
  });
  return hintTex;
}

let mergeTex: THREE.CanvasTexture | null = null;
/** etiqueta "→ Nome Nv.X" do resultado de uma fusão válida no alvo do arraste */
function drawMergeLabel(
  texture: THREE.CanvasTexture,
  label: string,
  level: number,
  known: boolean,
): void {
  const c = texture.image as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  const text = `\u2192 ${known ? label : '???'} Nv.${level}`;
  ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = Math.min(w - 24, ctx.measureText(text).width + 36);
  const x = (w - tw) / 2;
  ctx.fillStyle = 'rgba(8,12,22,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, h / 2 - 40, tw, 80, 40);
  ctx.fill();
  ctx.strokeStyle = known ? 'rgba(66,232,164,0.9)' : 'rgba(255,210,63,0.9)';
  ctx.lineWidth = 5;
  if (!known) ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = known ? '#8ff2c6' : '#ffd23f';
  ctx.fillText(text, w / 2, h / 2);
  texture.needsUpdate = true;
}

// ---------------------------------------------------------------------------

export function DropSpot() {
  const rootRef = useRef<THREE.Group>(null!);
  const padRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const bracketsRef = useRef<THREE.Group>(null!);
  const beamRef = useRef<THREE.Group>(null!);
  const arrowRef = useRef<THREE.Mesh>(null!);
  const collarRef = useRef<THREE.Mesh>(null!);
  const crossRef = useRef<THREE.Group>(null!);
  const sparksRef = useRef<THREE.Group>(null!);
  const labelRef = useRef<THREE.Sprite>(null!);
  const hintRefs = useRef<(THREE.Mesh | null)[]>([]);
  const labelKey = useRef<string>('');

  const appear = useRef(1);
  const wasActive = useRef(false);

  // colchetes nos quatro cantos da célula (dois traços por canto)
  const bracketDefs = useMemo(() => {
    const defs: { p: [number, number, number]; s: [number, number, number] }[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        defs.push({
          p: [sx * (BRACKET_HX - 0.21), 0, sz * BRACKET_HZ],
          s: [0.42, 0.05, 0.075],
        });
        defs.push({
          p: [sx * BRACKET_HX, 0, sz * (BRACKET_HZ - 0.21)],
          s: [0.075, 0.05, 0.42],
        });
      }
    }
    return defs;
  }, []);

  // marcações de slot livre (uma por slot dos dois lados; só o lado que
  // arrasta fica aceso)
  const slotDefs = useMemo(() => boardSlotPositions(), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = state.clock.elapsedTime;
    const st = useGameStore.getState();
    const eng = getEngine();
    const dragId = st.dragId;

    // ---- marcas de slot livre ----
    // (sobre a lixeira o destino é o painel DOM — escondemos tudo na arena)
    const dragUnit = dragId !== null && eng ? eng.getUnit(dragId) : undefined;
    const hintPulse = 0.1 + 0.07 * (0.5 + 0.5 * Math.sin(t * 3.2));
    slotDefs.forEach((s, i) => {
      const m = hintRefs.current[i];
      if (!m) return;
      if (!dragUnit || st.sellHover || s.side !== dragUnit.side) {
        if (m.visible) m.visible = false;
        return;
      }
      const free = !eng!.unitAt(s.side, s.tile);
      m.visible = free;
      if (free) (m.material as THREE.MeshBasicMaterial).opacity = hintPulse;
    });

    // ---- destino do arraste ----
    const root = rootRef.current;
    if (!root) return;
    const hv = st.dragHover;
    const ptr = st.dragPointer;

    // destino "para onde o dedo/apontador aponta" quando não há slot ali
    let kind: Kind | null = null;
    let px = 0;
    let pz = 0;
    if (dragUnit && !st.sellHover) {
      if (hv) {
        const [gx, gy, gz] = tileGroundPosition(hv.side, hv.tile);
        kind = hv.kind;
        px = gx;
        pz = gz;
        root.position.y = gy + 0.02;
      } else if (ptr) {
        const spot = tileFromWorld(ptr.x, ptr.z);
        const overOwnTile =
          spot && spot.side === dragUnit.side && spot.tile === dragUnit.tile;
        if (!overOwnTile) {
          kind = 'invalid';
          px = ptr.x;
          pz = ptr.z;
          root.position.y = 0.3;
        }
      }
    }

    if (!kind) {
      if (root.visible) root.visible = false;
      if (labelRef.current?.visible) labelRef.current.visible = false;
      wasActive.current = false;
      return;
    }
    if (!root.visible) root.visible = true;
    if (!wasActive.current) {
      // acabou de aparecer: cola no destino (sem deslizar pela arena inteira)
      root.position.x = px;
      root.position.z = pz;
      appear.current = 0;
      wasActive.current = true;
    } else {
      const k = 1 - Math.pow(0.000001, dt); // perseguição rápida e suave
      root.position.x += (px - root.position.x) * k;
      root.position.z += (pz - root.position.z) * k;
    }
    appear.current = Math.min(1, appear.current + dt * 5.5);
    const lock = 1 - (1 - appear.current) ** 2; // ease-out do lock-on

    const color = KIND_COLOR[kind];
    const fast = kind === 'invalid' ? 11 : 6;
    const pulse = 0.5 + 0.5 * Math.sin(t * fast);
    const setColor = (m: THREE.Material | THREE.Material[] | undefined) => {
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) {
        const bm = mm as THREE.MeshBasicMaterial;
        if (bm.color) bm.color.set(color);
      }
    };

      // disco + anel. O pai do disco escala 1,12 no vão horizontal e 0,8 no vão
      // entre linhas: uma elipse redonda na proporção da célula do tabuleiro.
      const pad = padRef.current;
      if (pad) {
        const s = 1 + pulse * 0.07 + lock * 0.12;
        pad.scale.setScalar(s);
        const bm = pad.material as THREE.MeshBasicMaterial;
        bm.color.set(color);
        bm.opacity = 0.42 + 0.3 * pulse + 0.3 * (1 - lock);
        // o anel tracejado da textura gira (a elipse fica parada no chão)
        if (bm.map) {
          bm.map.center.set(0.5, 0.5);
          bm.map.rotation = t * 0.85;
        }
      }
    const ring = ringRef.current;
    if (ring) {
      ring.rotation.set(-Math.PI / 2, 0, -t * 1.5);
      const bm = ring.material as THREE.MeshBasicMaterial;
      bm.color.set(color);
      bm.opacity = 0.55 + 0.4 * pulse;
    }

    // colchetes fechando sobre o slot
    const brackets = bracketsRef.current;
    if (brackets) {
      const s = 1.45 - 0.45 * lock + pulse * 0.03;
      brackets.scale.set(s, 1, s);
      brackets.children.forEach((ch) => setColor((ch as THREE.Mesh).material));
    }

    // feixe / seta / colar (escondido quando a posição não vale)
    const beam = beamRef.current;
    if (beam) {
      beam.visible = kind !== 'invalid';
      if (beam.visible) {
        const arrow = arrowRef.current;
        if (arrow) {
          arrow.position.y = 3.25 + Math.sin(t * 3.1) * 0.28;
          setColor(arrow.material);
        }
        const collar = collarRef.current;
        if (collar) {
          const c = (t * 1.5) % 1; // sobe em loop
          collar.position.y = 0.08 + c * 2.9;
          const bm = collar.material as THREE.MeshBasicMaterial;
          bm.color.set(color);
          bm.opacity = 0.75 * (1 - c);
          collar.scale.setScalar(1 + c * 0.35);
        }
        beam.children.forEach((ch) => setColor((ch as THREE.Mesh).material));
      }
    }

    // X de inválido
    const cross = crossRef.current;
    if (cross) {
      cross.visible = kind === 'invalid';
      if (cross.visible) {
        cross.rotation.z = t * 0.8;
        cross.scale.setScalar(1 + pulse * 0.08);
        cross.children.forEach((ch) => setColor((ch as THREE.Mesh).material));
      }
    }

    // faíscas orbitando quando a fusão é possível
    const sparks = sparksRef.current;
    if (sparks) {
      sparks.visible = kind === 'merge';
      if (sparks.visible) {
        sparks.children.forEach((ch, i) => {
          const a = t * 2.1 + (i * Math.PI * 2) / sparks.children.length;
          ch.position.set(Math.cos(a) * 1.05, 0.55 + 0.35 * Math.sin(a * 2), Math.sin(a) * 0.78);
          setColor((ch as THREE.Mesh).material);
        });
      }
    }

    // etiqueta com o RESULTADO da fusão (nome oculto se espécie inédita)
    const label = labelRef.current;
    if (label) {
      const fusion = kind === 'merge' ? hv?.fusion : undefined;
      if (!fusion) {
        if (label.visible) label.visible = false;
      } else {
        const key = `${fusion.label}|${fusion.level}|${fusion.known}`;
        if (labelKey.current !== key) {
          labelKey.current = key;
          if (!mergeTex) {
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 128;
            mergeTex = new THREE.CanvasTexture(c);
          }
          drawMergeLabel(mergeTex, fusion.label, fusion.level, fusion.known);
          (label.material as THREE.SpriteMaterial).map = mergeTex;
          (label.material as THREE.SpriteMaterial).needsUpdate = true;
        }
        const target = hv && hv.targetId !== undefined ? eng?.getUnit(hv.targetId) : undefined;
        const topY = 1.6 + 0.16 * ((target?.level ?? 1) - 1);
        label.position.set(px, topY + 1.15 + Math.sin(t * 2.4) * 0.06, pz);
        label.scale.set(2.3, 0.575, 1);
        label.visible = true;
      }
    }
  });

  return (
    <group>
      {/* aviso discreto de slot livre */}
      {slotDefs.map((s, i) => (
        <mesh
          key={`${s.side}-${s.tile}`}
          ref={(m) => {
            hintRefs.current[i] = m;
          }}
          position={[s.pos[0], s.pos[1] + 0.02, s.pos[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0.78}
          visible={false}
        >
          <planeGeometry args={[TILE_SPACING_X * 0.66, TILE_SPACING_X * 0.66]} />
          <meshBasicMaterial
            map={hintTexture()}
            color="#8fd4ff"
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* destaque do destino */}
      <group ref={rootRef} visible={false}>
        {/* o pai faz a elipse do disco na proporção da célula do tabuleiro */}
        <group scale={[1.18, 1, 0.85]}>
          <mesh ref={padRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <planeGeometry args={[PAD_PLANE, PAD_PLANE]} />
            <meshBasicMaterial
              map={padTexture()}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[RING_R[0], RING_R[1], 48, 1, 0, Math.PI * 1.4]} />
          <meshBasicMaterial
            color="#63c2ff"
            transparent
            opacity={0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <group ref={bracketsRef}>
          {bracketDefs.map((d, i) => (
            <mesh key={i} position={d.p}>
              <boxGeometry args={d.s} />
              <meshBasicMaterial
                color="#63c2ff"
                transparent
                opacity={0.95}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>

        <group ref={beamRef}>
          <mesh position={[0, 1.8, 0]}>
            <cylinderGeometry args={[0.6, 0.8, 3.6, 20, 1, true]} />
            <meshBasicMaterial
              map={beamTexture()}
              transparent
              opacity={0.42}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={arrowRef} position={[0, 3.2, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.2, 0.4, 6]} />
            <meshBasicMaterial
              color="#63c2ff"
              transparent
              opacity={0.9}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={collarRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <ringGeometry args={[0.5, 0.62, 32]} />
            <meshBasicMaterial
              color="#63c2ff"
              transparent
              opacity={0.6}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>

        <group ref={crossRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[CROSS_ARM, 0.2]} />
            <meshBasicMaterial
              color="#ff5470"
              transparent
              opacity={0.85}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <planeGeometry args={[CROSS_ARM, 0.2]} />
            <meshBasicMaterial
              color="#ff5470"
              transparent
              opacity={0.85}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>

        <group ref={sparksRef} visible={false}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i}>
              <octahedronGeometry args={[0.11, 0]} />
              <meshBasicMaterial
                color="#42e8a4"
                transparent
                opacity={0.9}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* etiqueta do resultado da fusão (fora do root: não herdava a escala) */}
      <sprite ref={labelRef} scale={[2.3, 0.575, 1]} visible={false}>
        <spriteMaterial transparent depthWrite={false} opacity={0.96} toneMapped={false} />
      </sprite>
    </group>
  );
}
