import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { SpeciesId } from '../game/types';
import { getEngine } from '../store/gameStore';
import type { SmokePool } from './smokePool';

/**
 * Emisor da trilha dos projéteis: cada espécie "assinatura" tem a sua — a
 * bola de fogo do Ignis solta fuligem quente, a pedra do Gólem levanta poeira
 * de pedra (fria, pesada, some rápido) e a lâmina de vento do Zéfiro rasga
 * fiapos de ar (finos, velozes). Todos nascem logo atrás do projétil. A fumaça
 * é desenhada por <SmokeLayer/>.
 */

const MAX_EMITTERS = 24;
const PUFF_PER_FRAME = 6;

interface TrailCfg {
  emitPerSec: number;
  /** 0 = poeira fria, 1 = brasa */
  heat: number;
  rise: number;
  drag: number;
  jitter: number;
  /** fração da velocidade herdada pela partícula */
  inherit: number;
  size: (lv: number) => number;
  life: (lv: number) => number;
  /** distância atrás do projétil (cresce com o nível — bola maior) */
  back: (lv: number) => number;
}

/** trilha genérica calibrada por nível (criaturas da árvore têm nível fixo) */
const tr =
  (k: number): ((lv: number) => number) =>
  (lv) =>
    0.04 + 0.014 * Math.min(7, lv) * k;

const TRAILS: Partial<Record<SpeciesId, TrailCfg>> = {
  ignis: {
    emitPerSec: 16,
    heat: 0.55,
    rise: 0.5,
    drag: 3.4,
    jitter: 0.09,
    inherit: 0.1,
    size: (lv) => 0.05 + 0.016 * lv,
    life: (lv) => 0.5 + 0.07 * lv,
    back: (lv) => 0.42 + 0.06 * (lv - 1),
  },
  golem: {
    emitPerSec: 13,
    heat: 0.1, // poeira de pedra, não brasa
    rise: 0.1,
    drag: 4.4,
    jitter: 0.12,
    inherit: 0.12,
    size: (lv) => 0.045 + 0.016 * lv,
    life: (lv) => 0.42 + 0.06 * lv,
    back: (lv) => 0.3 + 0.14 * (lv - 1),
  },
  zephyr: {
    emitPerSec: 22,
    heat: 0.02,
    rise: 0.32,
    drag: 5.6,
    jitter: 0.1,
    inherit: 0.08,
    size: (lv) => 0.026 + 0.009 * lv,
    life: (lv) => 0.24 + 0.03 * lv,
    back: (lv) => 0.26 + 0.05 * (lv - 1),
  },
  // ---------------------------------------------------------------------
  // Espécies da árvore elemental (Nv.6–10): cada linhagem tem sua marca.
  // As funções de tamanho/vida são genéricas (nível fixo por espécie).
  // ---------------------------------------------------------------------
  raio: { emitPerSec: 24, heat: 0.35, rise: 0.3, drag: 5.2, jitter: 0.07, inherit: 0.08, size: tr(0.8), life: (lv) => 0.2 + 0.02 * Math.min(7, lv), back: tr(0.6) },
  madeira: { emitPerSec: 10, heat: 0.0, rise: 0.15, drag: 4.6, jitter: 0.12, inherit: 0.1, size: tr(1.0), life: (lv) => 0.4 + 0.04 * Math.min(7, lv), back: tr(0.7) },
  magma: { emitPerSec: 15, heat: 0.8, rise: 0.45, drag: 3.6, jitter: 0.1, inherit: 0.1, size: tr(1.2), life: (lv) => 0.5 + 0.05 * Math.min(7, lv), back: tr(0.9) },
  gelo: { emitPerSec: 14, heat: 0.0, rise: 0.2, drag: 5.0, jitter: 0.08, inherit: 0.09, size: tr(0.9), life: (lv) => 0.35 + 0.04 * Math.min(7, lv), back: tr(0.7) },
  vapor: { emitPerSec: 18, heat: 0.15, rise: 0.7, drag: 3.0, jitter: 0.11, inherit: 0.08, size: tr(1.1), life: (lv) => 0.45 + 0.05 * Math.min(7, lv), back: tr(0.8) },
  areia: { emitPerSec: 16, heat: 0.05, rise: 0.05, drag: 4.8, jitter: 0.14, inherit: 0.12, size: tr(0.9), life: (lv) => 0.3 + 0.03 * Math.min(7, lv), back: tr(0.7) },
  tempestade: { emitPerSec: 26, heat: 0.4, rise: 0.35, drag: 4.6, jitter: 0.09, inherit: 0.09, size: tr(0.9), life: (lv) => 0.28 + 0.03 * Math.min(7, lv), back: tr(0.7) },
  obsidiana: { emitPerSec: 12, heat: 0.1, rise: 0.1, drag: 4.4, jitter: 0.1, inherit: 0.11, size: tr(1.1), life: (lv) => 0.4 + 0.04 * Math.min(7, lv), back: tr(0.8) },
  pantano: { emitPerSec: 12, heat: 0.0, rise: 0.25, drag: 4.0, jitter: 0.13, inherit: 0.1, size: tr(1.1), life: (lv) => 0.45 + 0.05 * Math.min(7, lv), back: tr(0.7) },
  plasma: { emitPerSec: 20, heat: 0.6, rise: 0.4, drag: 3.8, jitter: 0.07, inherit: 0.09, size: tr(1.0), life: (lv) => 0.35 + 0.04 * Math.min(7, lv), back: tr(0.8) },
  nevoa: { emitPerSec: 20, heat: 0.0, rise: 0.55, drag: 2.8, jitter: 0.1, inherit: 0.07, size: tr(1.2), life: (lv) => 0.5 + 0.05 * Math.min(7, lv), back: tr(0.6) },
  cristal: { emitPerSec: 15, heat: 0.2, rise: 0.25, drag: 4.8, jitter: 0.08, inherit: 0.1, size: tr(0.8), life: (lv) => 0.3 + 0.03 * Math.min(7, lv), back: tr(0.7) },
  cosmico: { emitPerSec: 22, heat: 0.45, rise: 0.35, drag: 4.0, jitter: 0.08, inherit: 0.09, size: tr(1.0), life: (lv) => 0.35 + 0.04 * Math.min(7, lv), back: tr(0.8) },
  geodo: { emitPerSec: 12, heat: 0.15, rise: 0.1, drag: 4.4, jitter: 0.1, inherit: 0.11, size: tr(1.2), life: (lv) => 0.42 + 0.04 * Math.min(7, lv), back: tr(0.9) },
  abissal: { emitPerSec: 16, heat: 0.05, rise: 0.3, drag: 3.6, jitter: 0.1, inherit: 0.1, size: tr(1.1), life: (lv) => 0.45 + 0.05 * Math.min(7, lv), back: tr(0.8) },
  vulcanico: { emitPerSec: 18, heat: 0.9, rise: 0.5, drag: 3.4, jitter: 0.11, inherit: 0.1, size: tr(1.3), life: (lv) => 0.5 + 0.05 * Math.min(7, lv), back: tr(0.9) },
  astral: { emitPerSec: 24, heat: 0.4, rise: 0.35, drag: 4.2, jitter: 0.07, inherit: 0.09, size: tr(1.0), life: (lv) => 0.35 + 0.04 * Math.min(7, lv), back: tr(0.8) },
  colosso: { emitPerSec: 13, heat: 0.25, rise: 0.12, drag: 4.4, jitter: 0.12, inherit: 0.12, size: tr(1.4), life: (lv) => 0.45 + 0.05 * Math.min(7, lv), back: tr(1.0) },
  primordial: { emitPerSec: 26, heat: 0.6, rise: 0.45, drag: 3.6, jitter: 0.08, inherit: 0.1, size: tr(1.5), life: (lv) => 0.5 + 0.06 * Math.min(7, lv), back: tr(1.1) },
};

export function FlameTrail({ pool }: { pool: SmokePool }) {
  const emitters = useRef(new Map<number, number>()); // projétil id -> acumulador

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const world = getEngine()?.world;
    const seen = new Set<number>();
    let emitted = 0;

    if (world) {
      for (const p of world.projectiles) {
        const cfg = TRAILS[p.species];
        if (!p.alive || !cfg) continue;
        if (emitters.current.size >= MAX_EMITTERS && !emitters.current.has(p.id)) continue;
        seen.add(p.id);
        let acc = emitters.current.get(p.id) ?? 0;
        // o projétil de um monstro maior (nível mais alto) solta mais rastro
        const lv = Math.max(1, Math.min(10, p.ownerLevel ?? 1));
        acc += dt * cfg.emitPerSec * (1 + 0.14 * (lv - 1));
        while (acc >= 1 && emitted < PUFF_PER_FRAME) {
          acc -= 1;
          emitted++;
          const dx = p.vel[0];
          const dy = p.vel[1];
          const dz = p.vel[2];
          const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const back = cfg.back(lv);
          pool.spawn(
            // nasce atrás do projétil, com um pouco de espalhamento
            p.pos[0] - (dx / dl) * back,
            p.pos[1] - (dy / dl) * back,
            p.pos[2] - (dz / dl) * back,
            {
              jitter: cfg.jitter,
              // herda um tiquinho do movimento e logo para (fica no ar)
              vx: dx * cfg.inherit,
              vy: dy * cfg.inherit,
              vz: dz * cfg.inherit,
              life: cfg.life(lv),
              lifeVar: 0.5,
              size: cfg.size(lv),
              heat: cfg.heat,
              rise: cfg.rise,
              drag: cfg.drag,
            },
          );
        }
        emitters.current.set(p.id, acc);
      }
      if (world.projectiles.length === 0) emitters.current.clear();
      else for (const id of emitters.current.keys()) if (!seen.has(id)) emitters.current.delete(id);
    }
  });

  return null;
}
