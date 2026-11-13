import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SCENERY_BLOOM_LAYER } from './BloomGate';
import { useGameStore } from '../store/gameStore';
import { tileFromWorld, tileGroundPosition, UNIT_BASE_Y } from '../game/board';
import { Arena } from './Arena';
import { CameraController } from './CameraController';
import { DropSpot } from './DropSpot';
import { Effects } from './Effects';
import { FlameTrail } from './FlameTrail';
import { Lighting } from './Lighting';
import { ProjectileField } from './ProjectileField';
import { SmokeLayer } from './SmokeLayer';
import { SmokePool } from './smokePool';
import { DRAG_LIFT, UnitView } from './UnitView';
import { UniverseEndEnvironment } from './UniverseEndEnvironment';
import { registerWorldBridge } from './worldToScreen';
import type { ArenaScene } from '../game/types';

export function BattleScene({
  menuMode,
  sceneVariant,
}: {
  menuMode: boolean;
  sceneVariant: ArenaScene;
}) {
  const { camera, gl } = useThree();
  const unitIdsRaw = useGameStore((s) => s.units.map((u) => u.id).join(','));
  const ecoActive = useGameStore((s) => s.ecoActive);

  const unitIds = useMemo(
    () => (unitIdsRaw ? unitIdsRaw.split(',').map(Number) : []),
    [unitIdsRaw],
  );

  // fuligem compartilhada: trilha das bolas de fogo + fumaça que sai das
  // chamas das criaturas + fumaça das fusões e explosões
  const smoke = useMemo(() => new SmokePool(700), []);
  const sceneryLayerRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    sceneryLayerRef.current?.traverse((object) => {
      object.layers.enable(SCENERY_BLOOM_LAYER);
    });
  }, [sceneVariant]);

  // 🔋 Orçamento de sombra: no MODO ECONÔMICO em menu não há unidade no
  // tabuleiro — a ilha é estática, então a shadow map é redesenhada UMA vez a
  // cada troca de tela/cenário e fica em cache enquanto o menu vive. No jogo
  // volta o autoUpdate (e a 30 Hz, como todo o frame econômico). No modo
  // cheio o comportamento é o de sempre.
  useEffect(() => {
    gl.shadowMap.autoUpdate = !(ecoActive && menuMode);
    gl.shadowMap.needsUpdate = true;
  }, [gl, ecoActive, menuMode, sceneVariant]);

  const dragTools = useMemo(() => {
    return {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28),
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
      probe: new THREE.Vector3(),
    };
  }, []);

  // ── ponte mundo 3D ⇄ pixels da janela ──────────────────────────────────────
  // quem é DOM (a prévia de fusões, a luvinha do tutorial) precisa saber onde o
  // corpo mora na tela e para onde o dedo cai no chão. A câmera só existe aqui
  // dentro, então a cena publica a ponte no registro global
  // (ver src/scene/worldToScreen.ts).
  const bridge = useMemo(() => {
    const v = new THREE.Vector3();
    return {
      toScreen: (wx: number, wy: number, wz: number): { x: number; y: number } | null => {
        const rect = gl.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        v.set(wx, wy, wz).project(camera);
        return {
          x: rect.left + ((v.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - v.y) / 2) * rect.height,
        };
      },
      toGround: (cx: number, cy: number): [number, number] | null => {
        const rect = gl.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        dragTools.ndc.set(
          ((cx - rect.left) / rect.width) * 2 - 1,
          -((cy - rect.top) / rect.height) * 2 + 1,
        );
        dragTools.raycaster.setFromCamera(dragTools.ndc, camera);
        const p = dragTools.raycaster.ray.intersectPlane(dragTools.plane, dragTools.hit);
        if (!p) return null;
        return [p.x, p.z];
      },
    };
  }, [camera, gl, dragTools]);

  useEffect(() => {
    registerWorldBridge(bridge);
    return () => registerWorldBridge(null);
  }, [bridge]);

  useEffect(() => {
    const clientToGround = bridge.toGround;

    const isOverSellFab = (cx: number, cy: number): boolean => {
      // durante o arraste (especialmente toque, que captura o ponteiro no
      // canvas) o painel DOM não recebe pointerenter — elementFromPoint vê o
      // que está visualmente sob o cursor em qualquer coordenada de tela
      const el = document.elementFromPoint(cx, cy);
      return el ? el.closest('[data-sell-target]') !== null : false;
    };

    // para onde um ponto do MUNDO 3D vai NA TELA (função publicada logo acima)
    const slotNaTela = (side: 'player' | 'ai', tile: number): { x: number; y: number } | null => {
      const [wx, wy, wz] = tileGroundPosition(side, tile);
      return bridge.toScreen(wx, wy + 0.6, wz); // centro do corpo, não a base no chão
    };

    const onMove = (e: PointerEvent) => {
      const st = useGameStore.getState();
      st.trackTap(e.clientX, e.clientY);
      if (st.pendingDrag) st.tryPromoteDrag(e.clientX, e.clientY);
      if (st.dragId !== null) {
        st.setSellHover(isOverSellFab(e.clientX, e.clientY));
        const p = clientToGround(e.clientX, e.clientY);
        // coords de TELA junto: a prévia de fusões (DOM) persegue o ponteiro e
        // foge dos dois monstros do arraste
        if (p) {
          const olhado = tileFromWorld(p[0], p[1]);
          st.hoverWorld(p[0], p[1], e.clientX, e.clientY, {
            alvo: olhado ? slotNaTela(olhado.side, olhado.tile) : null,
            // quem está na mão é desenhado FLUTUANDO acima do chão (o mesmo
            // lift do UnitView): é esse corpo que o painel tem que desviar, e
            // ele mora alguns px ACIMA do dedo na tela
            corpo: bridge.toScreen(p[0], UNIT_BASE_Y + DRAG_LIFT + 0.6, p[1]),
          });
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      const st = useGameStore.getState();
      if (st.dragId !== null) st.endDrag();
      else if (st.pendingDrag) st.clearPointerState();
      // só abre o inspetor se a imprensa virou TOQUE (pouco movimento);
      // arraste/órbita já mataram o tapCandidate no trackTap
      st.commitTap(e.clientX, e.clientY);
    };
    const onCancel = () => {
      const st = useGameStore.getState();
      if (st.dragId !== null) st.endDrag();
      else if (st.pendingDrag) st.clearPointerState();
      useGameStore.setState({ tapCandidate: null }); // cancelamento não é toque
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [bridge]);

  return (
    <group>
      <group ref={sceneryLayerRef} name="scenery-bloom-layer">
        <Lighting key={ecoActive ? 'lighting-eco' : 'lighting-full'} sceneVariant={sceneVariant} eco={ecoActive} />
        <Arena sceneVariant={sceneVariant} />
        {sceneVariant === 'universe-end' && <UniverseEndEnvironment />}
      </group>
      <SmokeLayer pool={smoke} />
      <FlameTrail pool={smoke} />
      <ProjectileField />
      <Effects smoke={smoke} />
      <DropSpot />
      {unitIds.map((id) => (
        <UnitView key={id} unitId={id} smoke={smoke} />
      ))}
      <CameraController menuMode={menuMode} sceneVariant={sceneVariant} />
    </group>
  );
}
