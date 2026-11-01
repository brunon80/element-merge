import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DEATH_ANIMATION_WINDOW } from '../data/balance';
import { getEngine, useGameStore } from '../store/gameStore';
import type { SpeciesId, Side } from '../game/types';
import { flameIconTexture, getGeometry, poisonIconTexture, slowIconTexture } from './assets';
import { MODELS, VISUALS, partsForLevel, type MatRole } from './speciesModels';
import { SPECIES_RIGS } from './speciesRigs';
import type { SmokePool } from './smokePool';
import { formTop, hasForms } from '../data/forms';
import { getSpecies } from '../data/monsters';
import { PLATFORM } from '../game/board';

const BAR_W = 0.92;

/** Limite do arraste: a criatura segurada persegue o ponteiro, mas fica na
 *  própria metade da ilha (não anda sobre o abismo nem sai da plataforma). */
const DRAG_EDGE_X = PLATFORM.halfX - 0.25;
const DRAG_EDGE_FRONT = PLATFORM.frontZ - 0.05;
const DRAG_EDGE_BACK = PLATFORM.backZ - 0.2;

interface Mats {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  black: THREE.MeshBasicMaterial;
  trans: THREE.MeshStandardMaterial;
  steam: THREE.MeshStandardMaterial;
  robe: THREE.MeshStandardMaterial;
  armveil: THREE.MeshStandardMaterial;
  veil: THREE.MeshStandardMaterial;
}

function hpColor(frac: number): string {
  if (frac > 0.55) return '#3ce9a4';
  if (frac > 0.28) return '#ffd23f';
  return '#ff5470';
}

export function UnitView({ unitId, smoke }: { unitId: number; smoke?: SmokePool }) {
  const eng = getEngine();
  const unit = eng?.getUnit(unitId);
  const species: SpeciesId | null = unit ? unit.species : null;
  const side: Side = unit ? unit.side : 'player';
  const level = unit?.level ?? 1;

  const rootRef = useRef<THREE.Group>(null!);
  const modelRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const barFillRef = useRef<THREE.Mesh>(null!);
  const barGroupRef = useRef<THREE.Group>(null!);
  const burnIconRef = useRef<THREE.Sprite>(null!);
  const slowIconRef = useRef<THREE.Sprite>(null!);
  const poisonIconRef = useRef<THREE.Sprite>(null!);
  const selRingRef = useRef<THREE.Mesh>(null!);
  const pipRefs = useRef<(THREE.Mesh | null)[]>([]);

  const visuals = species ? VISUALS[species] : VISUALS.ignis;
  const modelDef = species ? MODELS[species] : MODELS.ignis;
  const sdef = getSpecies(species ?? 'ignis');
  /** A espécie muda de forma com a fusão? Nesse caso o próprio modelo já vem
   *  com o tamanho de cada forma (nada de escalar de novo por cima). */
  const growsByForm = hasForms(sdef);
  /** topo da forma atual — barra de vida, ícones e área de toque acompanham */
  const topY = formTop(sdef, level);
  // rigs especiais por elemento (fogo usa shader de chama); demais seguem o rig padrão
  const Rig = species ? SPECIES_RIGS[species] : undefined;
  // partes do nível atual (fusões do mesmo elemento mudam a silhueta)
  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);

  const mats = useMemo<Mats>(() => {
    const v = visuals;
    const std = (color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>) =>
      new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: v.roughness ?? 0.7,
        metalness: v.metalness ?? 0.05,
        ...opts,
      });
    return {
      body: std(v.body),
      dark: std(v.dark),
      glow: std(v.glow, { emissive: v.glow, emissiveIntensity: 1.5 }),
      accent: std(v.accent, { emissive: v.accent, emissiveIntensity: 0.25 }),
      white: std('#f4f7ff', { roughness: 0.4 }),
      black: new THREE.MeshBasicMaterial({ color: '#0c0f18' }),
      trans: std(v.body, {
        transparent: true,
        opacity: v.bodyOpacity ?? 0.85,
        roughness: 0.15,
        emissive: v.body,
        emissiveIntensity: 0.15,
      }),
      steam: std('#dfe9f5', { transparent: true, opacity: 0.3, depthWrite: false }),
      robe: std('#dfe9f5', { transparent: true, opacity: 0.34, depthWrite: false }),
      armveil: std('#dfe9f5', { transparent: true, opacity: 0.22, depthWrite: false }),
      veil: std(v.body, { transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8 }),
    };
  }, [visuals]);

  useEffect(() => {
    const m = mats;
    return () => {
      Object.values(m).forEach((mat) => mat.dispose());
    };
  }, [mats]);

  const partMat = (role: MatRole): THREE.Material => {
    switch (role) {
      case 'body':
        return mats.body;
      case 'dark':
        return mats.dark;
      case 'glow':
        return mats.glow;
      case 'accent':
        return mats.accent;
      case 'white':
        return mats.white;
      case 'black':
        return mats.black;
      case 'trans':
        return mats.trans;
      case 'steam':
        return mats.steam;
      case 'robe':
        return mats.robe;
      case 'armveil':
        return mats.armveil;
      case 'veil':
        return mats.veil;
    }
  };

  // cache base colors for tint restores
  const baseColors = useMemo(() => {
    const m = new Map<string, THREE.Color>();
    (['body', 'dark', 'accent', 'trans'] as const).forEach((k) => {
      m.set(k, (mats[k] as THREE.MeshStandardMaterial).color.clone());
    });
    return m;
  }, [mats]);

  const phaseSeed = (unitId * 137.13) % 100;

  useFrame((state, dt) => {
    const engine = getEngine();
    if (!engine) return;
    const u = engine.getUnit(unitId);
    if (!u) return;
    const time = engine.world.time;
    const st = useGameStore.getState();
    const root = rootRef.current;
    if (!root) return;

    // ---- posição: enquanto o ponteiro está segurando a criatura, ela PERSEGUE
    // o cursor (não fica presa no slot até o soltar); limites: sua metade da plataforma ----
    const dragging = st.dragId === unitId;
    const lift = dragging ? 1.1 : 0;
    let tx = u.pos[0];
    let tz = u.pos[2];
    if (dragging && st.dragPointer) {
      const sign = u.side === 'player' ? 1 : -1; // z "para dentro" do próprio lado
      tx = THREE.MathUtils.clamp(st.dragPointer.x, -DRAG_EDGE_X, DRAG_EDGE_X);
      const inward = Math.max(DRAG_EDGE_FRONT, Math.min(DRAG_EDGE_BACK, st.dragPointer.z * sign));
      tz = sign * inward;
    }
    const ty = u.pos[1] + lift;
    const followK = dragging ? 1 - Math.exp(-dt * 26) : Math.min(1, dt * 10);
    root.position.x += (tx - root.position.x) * followK;
    root.position.y += (ty - root.position.y) * (1 - Math.pow(0.0001, dt));
    root.position.z += (tz - root.position.z) * followK;

    // ---- escala: nível + punch de spawn + encolhimento na morte ----
    // (formas que já crescem no modelo não recebem escala extra)
    let scale = growsByForm ? 1 : 1 + 0.07 * (u.level - 1);
    const age = time - u.spawnedAt;
    if (age < 0.45)
      scale *= 0.4 + 0.6 * Math.min(1, age / 0.3) + 0.25 * Math.sin((age / 0.45) * Math.PI);
    if (!u.alive && u.diedAt !== null) {
      const p = Math.min(1, (time - u.diedAt) / DEATH_ANIMATION_WINDOW);
      scale *= 1 - p;
      modelRef.current.rotation.z = p * 1.8;
      selRingRef.current.visible = false;
    }
    if (dragging) scale *= 1.06;
    root.scale.setScalar(Math.max(0.0001, scale));

    // ---- idle: flutuação + respiração ----
    const bob = modelDef.bob ?? 0.05;
    const floatY = modelDef.floatY ?? 0;
    modelRef.current.position.y = floatY + Math.sin(time * 2.2 + phaseSeed) * bob;

    // ---- investida de ataque (o arremesso de fogo tem coreografia própria no rig) ----
    const sinceAttack = time - u.lastAttackAt;
    if (u.alive && sinceAttack < 0.28) {
      const lungeK = Rig ? 0.3 : 1;
      modelRef.current.position.z = (1 - sinceAttack / 0.28) * 0.22 * lungeK;
    } else {
      modelRef.current.position.z *= 1 - Math.min(1, dt * 8);
    }

    // ---- pulsar quando é alvo de fusão destacada ----
    const hover = st.dragHover;
    const mergeTarget = hover && hover.targetId === unitId && hover.kind === 'merge';
    if (mergeTarget) {
      const pulse = 1 + Math.sin(time * 12) * 0.05;
      modelRef.current.scale.setScalar(pulse);
    } else if (modelRef.current.scale.x !== 1) {
      modelRef.current.scale.setScalar(1);
    }

    // ---- partes animadas ----
    const parts = visParts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      if (part.spin) {
        mesh.rotation.x += part.spin[0] * dt;
        mesh.rotation.y += part.spin[1] * dt;
        mesh.rotation.z += part.spin[2] * dt;
      }
      if (part.flick) {
        const f = 1 + part.flick * Math.sin(time * (8 + (i % 5)) + i * 2.3);
        mesh.scale.setScalar(f);
      }
      if (part.rise) {
        const [speed, span] = part.rise;
        const cyc = (time * speed + i * 0.37 + phaseSeed * 0.1) % span;
        mesh.position.y = part.p[1] + cyc;
        const t = cyc / span;
        mesh.scale.setScalar(0.7 + t * 0.9);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.transparent) mat.opacity = (part.m === 'steam' ? 0.32 : 0.8) * (1 - t * 0.8);
      }
    }
    if (modelDef.groups) {
      for (const [gid, speed] of Object.entries(modelDef.groups)) {
        const g = groupRefs.current[Number(gid)];
        if (g) g.rotation.y = time * speed + phaseSeed;
      }
    }

    // ---- flash de dano + status (queimadura/lentidão) ----
    const sinceHurt = time - u.lastHurtAt;
    const flash = u.alive && sinceHurt < 0.3 ? 1 - sinceHurt / 0.3 : 0;
    const burning = u.statuses.some((s) => s.type === 'burn');
    const slowed = u.statuses.some((s) => s.type === 'slow');
    const poisoned = u.statuses.some((s) => s.type === 'poison');
    const bodyM = mats.body;
    const bodyBase = baseColors.get('body')!;
    if (flash > 0) {
      bodyM.emissive.setRGB(flash, flash, flash);
    } else if (burning) {
      bodyM.emissive.setRGB(0.5 + 0.25 * Math.sin(time * 10), 0.12, 0.02);
    } else if (poisoned) {
      bodyM.emissive.setRGB(0.02, 0.32 + 0.15 * Math.sin(time * 7), 0.06);
    } else {
      bodyM.emissive.setRGB(0, 0, 0);
    }
    bodyM.color.copy(bodyBase);
    const transM = mats.trans;
    transM.emissiveIntensity = 0.15 + (flash > 0 ? flash * 0.8 : 0);
    const darkM = mats.dark;
    darkM.color.copy(baseColors.get('dark')!);
    if (slowed && u.alive) {
      const tint = new THREE.Color('#7ad4ff');
      bodyM.color.lerp(tint, 0.3);
      darkM.color.lerp(tint, 0.3);
    }
    mats.glow.emissiveIntensity = 1.5 + Math.sin(time * 5 + phaseSeed) * 0.2 + (u.alive ? 0 : -1.2);

    // ---- barra de vida / pips / ícones ----
    const frac = Math.max(0, u.hp / u.maxHp);
    const fill = barFillRef.current;
    fill.scale.x = Math.max(0.0001, frac);
    fill.position.x = -BAR_W / 2 + (BAR_W * frac) / 2;
    (fill.material as THREE.MeshBasicMaterial).color.set(u.alive ? hpColor(frac) : '#5a6478');
    barGroupRef.current.visible = u.alive;
    for (let i = 0; i < 10; i++) {
      const pip = pipRefs.current[i];
      if (!pip) continue;
      pip.visible = u.alive && i < u.level;
    }
    if (u.alive) {
      barGroupRef.current.quaternion.copy(state.camera.quaternion);
    }
    burnIconRef.current.visible = burning && u.alive;
    slowIconRef.current.visible = slowed && u.alive;
    poisonIconRef.current.visible = poisoned && u.alive;
    if (burnIconRef.current.visible) {
      const s = 0.42 * (1 + 0.15 * Math.sin(time * 12));
      burnIconRef.current.scale.setScalar(s);
    }
    if (slowIconRef.current.visible) {
      const s = 0.4 * (1 + 0.1 * Math.sin(time * 4));
      slowIconRef.current.scale.setScalar(s);
    }
    if (poisonIconRef.current.visible) {
      const s = 0.4 * (1 + 0.12 * Math.sin(time * 6));
      poisonIconRef.current.scale.setScalar(s);
    }

    // ---- anel de seleção ----
    selRingRef.current.visible =
      u.alive && (st.selectedId === unitId || mergeTarget || dragging);
    if (selRingRef.current.visible) {
      selRingRef.current.rotation.z += dt * 1.4;
      (selRingRef.current.material as THREE.MeshBasicMaterial).color.set(
        mergeTarget ? '#ffd23f' : dragging ? '#7ad4ff' : '#3ce9a4',
      );
    }
  });

  if (!unit || !species) return null;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const st = useGameStore.getState();
    const live = getEngine()?.getUnit(unitId);
    if (!live || !live.alive) return;
    st.selectUnit(unitId);
    if (live.side === 'player') {
      const ne = e.nativeEvent;
      st.beginDragCandidate(unitId, ne.clientX, ne.clientY);
    }
  };

  return (
    <group ref={rootRef} position={[unit.pos[0], unit.pos[1], unit.pos[2]]}>
      <group
        ref={modelRef}
        rotation-y={side === 'player' ? Math.PI : 0}
      >
        {Rig ? (
          <Rig
            seed={(unitId * 2.399 + 1.7) % 40}
            unitId={unitId}
            level={level}
            smoke={smoke}
          />
        ) : (
          visParts.map((part, i) => {
          const mesh = (
            <mesh
              key={i}
              ref={(m) => {
                partRefs.current[i] = m;
              }}
              geometry={getGeometry(part.g, part.a)}
              material={partMat(part.m)}
              position={part.p}
              rotation={part.r ?? [0, 0, 0]}
              scale={part.s ?? 1}
              castShadow
            />
          );
          if (part.group !== undefined) {
            return (
              <group
                key={`g${i}`}
                ref={(g) => {
                  groupRefs.current[part.group!] = g;
                }}
              >
                {mesh}
              </group>
            );
          }
          return mesh;
          }
          )
        )}
      </group>

      {/* HUD 3D: barra de vida, pips de nível, ícones de status (acima do topo
          do modelo no nível atual — o dragão Nv5 é bem mais alto que o imps) */}
      <group ref={barGroupRef} position={[0, topY + 0.42, 0]}>
        <mesh geometry={getGeometry('plane', [BAR_W + 0.08, 0.17])} position={[0, 0, -0.005]}>
          <meshBasicMaterial color="#0a0e1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={barFillRef} geometry={getGeometry('plane', [BAR_W, 0.1])}>
          <meshBasicMaterial color="#3ce9a4" />
        </mesh>
        <group position={[0, 0.2, 0]}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <mesh
              key={i}
              ref={(m) => {
                pipRefs.current[i] = m;
              }}
              geometry={getGeometry('box', [0.12, 0.12, 0.02])}
              position={[(i - 4.5) * 0.13, 0, 0]}
            >
              <meshBasicMaterial color="#ffd23f" />
            </mesh>
          ))}
        </group>
      </group>
      <sprite
        ref={burnIconRef}
        position={[0.55 + 0.14 * (Math.min(5, level) - 1), topY - 0.1, 0]}
        scale={0.42}
        visible={false}
      >
        <spriteMaterial map={flameIconTexture()} transparent depthWrite={false} />
      </sprite>
      <sprite
        ref={slowIconRef}
        position={[-0.55 - 0.14 * (Math.min(5, level) - 1), topY - 0.1, 0]}
        scale={0.4}
        visible={false}
      >
        <spriteMaterial map={slowIconTexture()} transparent depthWrite={false} />
      </sprite>
      <sprite
        ref={poisonIconRef}
        position={[0, topY + 0.32, 0]}
        scale={0.4}
        visible={false}
      >
        <spriteMaterial map={poisonIconTexture()} transparent depthWrite={false} />
      </sprite>

      <mesh
        ref={selRingRef}
        geometry={getGeometry('torus', [0.72, 0.045, 6, 36])}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        scale={1 + 0.13 * (level - 1)}
        visible={false}
      >
        <meshBasicMaterial color="#3ce9a4" transparent opacity={0.9} />
      </mesh>

      {/* área de captura para ponteiro (cresce com o nível da criatura) */}
      <mesh
        position={[0, topY / 2, 0]}
        scale={[1 + 0.16 * (level - 1), topY / 2.1, 1 + 0.16 * (level - 1)]}
        onPointerDown={onPointerDown}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'default')}
      >
        <cylinderGeometry args={[0.65, 0.65, 2.1, 8]} />
        <meshBasicMaterial visible={false} transparent opacity={0} />
      </mesh>
    </group>
  );
}
