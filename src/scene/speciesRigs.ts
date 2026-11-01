import type { ComponentType } from 'react';
import type { SpeciesId } from '../game/types';
import { FlameRig } from './FlameRig';
import { WindRig } from './WindRig';
import { StoneRig } from './StoneRig';
import { WaterRig } from './WaterRig';
import { LightningRig } from './LightningRig';
import { WoodRig } from './WoodRig';
import { MagmaRig } from './MagmaRig';
import { IceRig } from './IceRig';
import { VaporRig } from './VaporRig';
import { SandRig } from './SandRig';
import { TempestadeRig } from './TempestadeRig';
import { ObsidianaRig } from './ObsidianaRig';
import { PantanoRig } from './PantanoRig';
import { PlasmaRig } from './PlasmaRig';
import type { SmokePool } from './smokePool';

export interface SpeciesRigProps {
  seed: number;
  unitId?: number;
  /** nível atual da unidade (1..5) — silhueta/efeitos evoluem com a fusão */
  level?: number;
  embers?: number;
  emberScale?: number;
  /** incrementar dispara a coreografia de ataque em modo demonstração */
  demoAttackSeq?: number;
  /** pool de fumaça/fuligem compartilhado da cena */
  smoke?: SmokePool;
}

/**
 * Rigs especiais por elemento/espécie — substituem o rig genérico de peças
 * procedurais quando existirem. Os quatro elementos puros têm rig e progressão
 * própria (fogo, ar, terra e água); da árvore elemental, Raio (rig elétrico),
 * Madeira (rig de tronco/esmeralda no padrão do golem), Magma (vulcão de
 * basalto no mesmo padrão), Gelo (golem de cristal branco translúcido),
 * Vapor (caldeira de ferro viva com cabeça de nuvem), Areia (gênio do
 * deserto com cauda-funil de areia em turbilhão), Tempestade (muralha de
 * supercélula com
 * mastros para-raios e cortinas de chuva), Obsidiana (fortaleza de vidro
 * negro plantada, brasa violeta nas costuras), Pântano (hidra do lodo: poça
 * que borbulha, caldeirão afogado e três pescoços que cospem veneno) e Plasma
 * (estrela de bolso: sol em miniatura numa jaula de ferro forjado com anéis
 * de contenção que giram) já
 * têm figurino próprio; as demais espécies da árvore ainda usam o rig padrão:
 * a busca é por espécie e o fallback é o rig padrão.
 */
export const SPECIES_RIGS: Partial<Record<SpeciesId, ComponentType<SpeciesRigProps>>> = {
  ignis: FlameRig,
  zephyr: WindRig,
  golem: StoneRig,
  nereia: WaterRig,
  raio: LightningRig,
  madeira: WoodRig,
  magma: MagmaRig,
  gelo: IceRig,
  vapor: VaporRig,
  areia: SandRig,
  tempestade: TempestadeRig,
  obsidiana: ObsidianaRig,
  pantano: PantanoRig,
  plasma: PlasmaRig,
};
