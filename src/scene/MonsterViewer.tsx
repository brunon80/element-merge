import { View } from '@react-three/drei/web';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MAX_LEVEL } from '../game/types';
import type { MonsterLevel, SpeciesId } from '../game/types';
import { formName, formTop, hasForms } from '../data/forms';
import { ALL_SPECIES_IDS, getSpecies } from '../data/monsters';
import { getGeometry } from './assets';
import { MODELS, VISUALS, partsForLevel, type MatRole } from './speciesModels';
import { SPECIES_RIGS } from './speciesRigs';
import { SmokeLayer } from './SmokeLayer';
import { SmokePool } from './smokePool';
import { hasWebGL2 } from './webgl';

const LEVEL_CHIPS: MonsterLevel[] = [1, 2, 3, 4, 5];

/**
 * Visualizador de modelo 3D para o bestiário: a criatura fica centralizada e
 * o usuário só pode girá-la em torno do próprio eixo vertical (rotação em Y).
 * Sem zoom, sem pan, sem inclinação — e sem rotação própria no eixo Z/X.
 *
 * **UM CONTEXTO WEBGL PARA A ENCICLOPÉDIA INTEIRA.** O iOS/Safari tem teto de
 * contextos WebGL e, quando estoura, PERDE O MAIS ANTIGO — que é o canvas da
 * batalha: abrir a enciclopédia e rolar os cards derrubava a cena 3D no
 * iPhone (parecia que "os shaders sumiam"). Por isso o card não monta um
 * `<Canvas>` próprio: ele é um `<View>` do drei, desenhado pelo palco único
 * `BestiaryStage` na posição exata da sua caixa. O card só entra no palco
 * quando está visível (IntersectionObserver) e quando há WebGL2.
 */

function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true); // ambientes sem IO (ex.: testes): considerar visível
      return;
    }
    const io = new IntersectionObserver((entries) => {
      setInView(entries.some((e) => e.isIntersecting));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** rotação do card: o usuário arrasta (userRot) e o palco gira sozinho (spin) */
interface Turntable {
  /** offset do arrasto do usuário (rad) */
  userRot: React.MutableRefObject<number>;
  /** true enquanto o dedo/mouse segura o card (pausa o giro automático) */
  dragging: React.MutableRefObject<boolean>;
}

function SpeciesRig({
  species,
  attackSeq,
  level = 1,
  smoke,
  locked = false,
  turn,
}: {
  species: SpeciesId;
  attackSeq?: number;
  level?: number;
  smoke?: SmokePool;
  /** silhueta selada: todos os materiais viram uma massa escura uniforme */
  locked?: boolean;
  turn: Turntable;
}) {
  const visuals = VISUALS[species];
  const modelDef = MODELS[species];
  const Rig = SPECIES_RIGS[species];
  const bodyRef = useRef<THREE.Group>(null!);
  const partRefs = useRef<(THREE.Mesh | null)[]>([]);
  const groupRefs = useRef<Record<number, THREE.Group | null>>({});
  const punchT = useRef(-1);
  const spin = useRef(0);
  const visParts = useMemo(() => partsForLevel(modelDef, level), [modelDef, level]);
  // espécies sem formas por nível crescem como antes (1 + 0,07/nível); as que
  // têm formas (fogo) já trazem o tamanho de cada forma no próprio modelo
  const growth = hasForms(getSpecies(species))
    ? 1
    : 1 + 0.07 * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);

  useEffect(() => {
    if (attackSeq !== undefined && attackSeq > 0) punchT.current = 0;
  }, [attackSeq]);

  const mats = useMemo(() => {
    const v = visuals;
    const std = (color: string, opts?: Partial<THREE.MeshStandardMaterialParameters>) =>
      new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: v.roughness ?? 0.7,
        metalness: v.metalness ?? 0.05,
        ...opts,
      });
    const map = {
      body: std(v.body),
      dark: std(v.dark),
      glow: std(v.glow, { emissive: v.glow, emissiveIntensity: 1.2 }),
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
      robe: std('#dfe9f5', { transparent: true, opacity: 0.3, depthWrite: false }),
      armveil: std('#dfe9f5', { transparent: true, opacity: 0.22, depthWrite: false }),
      veil: std(v.body, { transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8 }),
    };
    if (locked) {
      // espécie selada: silhueta opaca uniforme (sem cor, brilho ou transparência)
      const shadow = new THREE.MeshStandardMaterial({
        color: '#0d1220',
        flatShading: true,
        roughness: 0.9,
        metalness: 0.05,
      });
      const roles = Object.keys(map) as MatRole[];
      const sealed = {} as Record<MatRole, THREE.Material>;
      for (const k of roles) sealed[k] = shadow;
      Object.values(map).forEach((m) => m.dispose()); // descarta os materiais coloridos
      return sealed;
    }
    return map as Record<MatRole, THREE.Material>;
  }, [visuals, locked]);

  useEffect(() => {
    return () => Object.values(mats).forEach((m) => m.dispose());
  }, [mats]);

  useFrame((state, dt) => {
    const time = state.clock.elapsedTime;
    // vitrola do card: gira sozinha devagar (o autoRotate que o palco único
    // não pode fazer por câmera — a câmera é UMA só para todos os cards) e
    // obedece ao arrasto do usuário
    if (!turn.dragging.current) spin.current += Math.min(dt, 0.05) * 0.34;
    bodyRef.current.rotation.y = spin.current + turn.userRot.current;
    if (!Rig || locked) {
      const bob = modelDef.bob ?? 0.05;
      bodyRef.current.position.y = (modelDef.floatY ?? 0) + Math.sin(time * 1.8) * bob;
      // demonstração de ataque para rigs genéricos: avanço + inclinação
      if (punchT.current >= 0) {
        punchT.current += Math.min(dt, 0.05);
        const q = Math.sin(Math.PI * Math.min(1, punchT.current / 0.5));
        bodyRef.current.position.z = 0.3 * q;
        bodyRef.current.rotation.x = 0.28 * q;
        if (punchT.current > 0.5) {
          punchT.current = -1;
          bodyRef.current.position.z = 0;
          bodyRef.current.rotation.x = 0;
        }
      }
      bodyRef.current.scale.setScalar(growth);
    }
    const parts = visParts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const mesh = partRefs.current[i];
      if (!mesh) continue;
      if (part.spin) {
        mesh.rotation.x += part.spin[0] * 0.016;
        mesh.rotation.y += part.spin[1] * 0.016;
        mesh.rotation.z += part.spin[2] * 0.016;
      }
      if (part.flick) {
        mesh.scale.setScalar(1 + part.flick * Math.sin(time * (8 + (i % 5)) + i * 2.3));
      }
      if (part.rise) {
        const [speed, span] = part.rise;
        const cyc = (time * speed + i * 0.37) % span;
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
        if (g) g.rotation.y = time * speed;
      }
    }
  });

  return (
    <group ref={bodyRef}>
      {Rig && !locked ? (
        <Rig
          seed={7.31}
          level={level}
          emberScale={0.4}
          demoAttackSeq={attackSeq}
          smoke={smoke}
        />
      ) : (
        visParts.map((part, i) => {
          const mesh = (
            <mesh
              key={`${level}-${i}`}
              ref={(m) => {
                partRefs.current[i] = m;
              }}
              geometry={getGeometry(part.g, part.a)}
              material={mats[part.m]}
              position={part.p}
              rotation={part.r ?? [0, 0, 0]}
              scale={part.s ?? 1}
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
        })
      )}
    </group>
  );
}

export function MonsterViewer({
  species,
  locked = false,
  debugLevel,
  onDebugLevel,
}: {
  species: SpeciesId;
  /** card selado da enciclopédia: silhueta + nível, sem revelar identidade */
  locked?: boolean;
  /** depuração: nível escolhido para visualizar formas de espécie pura */
  debugLevel?: MonsterLevel;
  onDebugLevel?: (lv: MonsterLevel) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef);
  const can3d = hasWebGL2();
  const mounted = inView && can3d;
  const [seq, setSeq] = useState(0);
  const sdef0 = getSpecies(species);
  // criaturas da árvore existem num único nível fixo: o viewer já nasce nele
  const [level, setLevel] = useState<MonsterLevel>(sdef0.levelMin as MonsterLevel);
  const userRot = useRef(0);
  const dragging = useRef(false);
  const drag = useRef<{ x: number; rot: number; moved: number } | null>(null);
  const turn: Turntable = { userRot, dragging };

  // modo debug: o card controla o nível visualizado (para criar a forma certa
  // no campo); em jogo normal o viewer guarda o nível para si mesmo
  const controlled = debugLevel !== undefined && onDebugLevel !== undefined;
  const shownLevel = controlled ? (debugLevel ?? sdef0.levelMin) : level;
  if (controlled && debugLevel !== undefined && debugLevel !== level) setLevel(debugLevel);
  const chooseLevel = (lv: MonsterLevel): void => {
    setLevel(lv);
    onDebugLevel?.(lv);
  };

  const sdef = getSpecies(sdef0.id);
  const variants = hasForms(sdef); // espécies que evoluem de forma com a fusão
  const form = formName(sdef, shownLevel);
  // enquadramento: a cada nível o modelo é maior, mas cabe no card (cresce de
  // forma contida). Espécies de nível fixo (árvore) usam o enquadramento alto.
  const fixedLevel = sdef.levelMin === sdef.levelMax;
  const top = formTop(sdef, shownLevel);
  // Enquadramento: com UMA câmera para todos os cards, quem se enquadra é o
  // modelo (o centro da caixa delimitadora vai para a origem, onde a câmera
  // olha). Alvo: ~2,7 unidades de altura num quadro de 3,25 — e as espécies
  // altas (Nv.8-10) continuam visivelmente maiores que as baixas.
  const fitRaw = variants || fixedLevel ? 1.96 / Math.pow(top, 0.72) : 1.25;
  const fit = Math.min(fitRaw, 2.7 / top);
  const frameY = -top * fit * 0.5;
  const smoke = useMemo(() => (mounted ? new SmokePool(220) : null), [mounted]);
  // índice do View no pipeline do drei (ordem de desenho e prioridade de evento):
  // um valor por card, e o card é único por espécie
  const viewIndex = ALL_SPECIES_IDS.indexOf(species) + 1;

  return (
    <>
      <div
        className="beast-card-model"
        ref={boxRef}
        data-testid="beast-model"
        onPointerDown={(e) => {
          if (!can3d || !inView) return;
          dragging.current = true;
          drag.current = { x: e.clientX, rot: userRot.current, moved: 0 };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          d.moved = Math.max(d.moved, Math.abs(dx));
          userRot.current = d.rot + dx * 0.012; // girar o modelo no próprio eixo
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          const d = drag.current;
          drag.current = null;
          if (!d || !can3d || !inView) return;
          // clique de verdade (não arrasto de rotação): dispara a demonstração de ataque
          if (d.moved <= 6) setSeq((s) => s + 1);
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          drag.current = null;
        }}
      >
        {/* A caixa é só a MARCA no palco único da enciclopédia (BestiaryStage):
            o drei recorta esta área no canvas compartilhado; o 3D não é montado
            dentro dela — por isso nenhum card abre contexto WebGL novo. */}
        {mounted && (
          <View as="div" className="beast-model" index={viewIndex}>
            <ambientLight intensity={0.65} />
            <hemisphereLight args={['#9db8ff', '#141a2c', 0.5]} />
            <directionalLight position={[3, 6, 4]} intensity={1.4} />
            <pointLight
              position={[-2.5, 2.5, -2]}
              intensity={locked ? 0.35 : 12}
              color={locked ? '#8a93b5' : VISUALS[species].glow}
            />
            <group position={[0, frameY, 0]} scale={fit}>
              <SpeciesRig
                species={species}
                attackSeq={seq}
                level={shownLevel}
                smoke={smoke ?? undefined}
                locked={locked}
                turn={turn}
              />
            </group>
            {smoke && <SmokeLayer pool={smoke} />}
          </View>
        )}
        {!can3d && <span className="beast-model-hint">3D indisponível neste dispositivo</span>}
      </div>
      {/* chips de forma, rótulo e dica ficam FORA da caixa de propósito: o palco
          pinta o modelo por cima do canvas, e dentro da caixa o modelo cobriria
          esses textos (o canvas fica acima do overlay da enciclopédia) */}
      {mounted && (
        <div className="beast-model-foot">
          {variants && !locked && (
            <div className={`beast-level-chips${controlled ? ' debug' : ''}`}>
              {LEVEL_CHIPS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`beast-level-chip${l === shownLevel ? ' on' : ''}`}
                  aria-label={`forma nível ${l}`}
                  onClick={() => chooseLevel(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {variants && !locked && form && <span className="beast-model-form">{form}</span>}
          <span className="beast-model-click-hint">clique: demonstração de ataque</span>
        </div>
      )}
    </>
  );
}
