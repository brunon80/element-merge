import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { Arena } from './Arena';
import { CameraController } from './CameraController';
import { DropSpot } from './DropSpot';
import { Effects } from './Effects';
import { FlameTrail } from './FlameTrail';
import { Lighting } from './Lighting';
import { ProjectileField } from './ProjectileField';
import { SmokeLayer } from './SmokeLayer';
import { SmokePool } from './smokePool';
import { UnitView } from './UnitView';

export function BattleScene({ menuMode }: { menuMode: boolean }) {
  const { camera, gl } = useThree();
  const unitIdsRaw = useGameStore((s) => s.units.map((u) => u.id).join(','));

  const unitIds = useMemo(
    () => (unitIdsRaw ? unitIdsRaw.split(',').map(Number) : []),
    [unitIdsRaw],
  );

  // fuligem compartilhada: trilha das bolas de fogo + fumaça que sai das
  // chamas das criaturas + fumaça das fusões e explosões
  const smoke = useMemo(() => new SmokePool(700), []);

  const dragTools = useMemo(() => {
    return {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.28),
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
    };
  }, []);

  useEffect(() => {
    const clientToGround = (cx: number, cy: number): [number, number] | null => {
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
    };

    const isOverSellBin = (cx: number, cy: number): boolean => {
      // durante o arraste (especialmente toque, que captura o ponteiro no
      // canvas) o painel DOM não recebe pointerenter — elementFromPoint vê o
      // que está visualmente sob o cursor em qualquer coordenada de tela
      const el = document.elementFromPoint(cx, cy);
      return el ? el.closest('[data-sell-target]') !== null : false;
    };

    const onMove = (e: PointerEvent) => {
      const st = useGameStore.getState();
      if (st.pendingDrag) st.tryPromoteDrag(e.clientX, e.clientY);
      if (st.dragId !== null) {
        st.setSellHover(isOverSellBin(e.clientX, e.clientY));
        const p = clientToGround(e.clientX, e.clientY);
        if (p) st.hoverWorld(p[0], p[1]);
      }
    };
    const onUp = () => {
      const st = useGameStore.getState();
      if (st.dragId !== null) st.endDrag();
      else if (st.pendingDrag) st.clearPointerState();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, dragTools]);

  return (
    <group>
      <Lighting />
      <Arena />
      <SmokeLayer pool={smoke} />
      <FlameTrail pool={smoke} />
      <ProjectileField />
      <Effects smoke={smoke} />
      <DropSpot />
      {unitIds.map((id) => (
        <UnitView key={id} unitId={id} smoke={smoke} />
      ))}
      <CameraController menuMode={menuMode} />
    </group>
  );
}
