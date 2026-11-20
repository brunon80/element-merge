/**
 * Mapa de URLs das malhas da linha "modelos 3D" — a FONTE ÚNICA dos 26 GLBs.
 * Cada figurino importa a URL (ou o mapa da família, indexado por nível−1)
 * daqui; o carregador sob demanda (`scene/modelPreload.ts`) e os gatilhos de
 * pré-baixa (loja, prévia de fusão) buscam na lista por espécie.
 *
 * A lista é a CONTRATO: espécie SEM entrada aqui não tem GLB — o figurino
 * procedural dela é o figurino oficial, não um fallback. Espécie COM entrada
 * só usa a malha (o rig antigo no arquivo dela virou só doador de efeitos e
 * de coreografia).
 */
import type { SpeciesId } from '../game/types';
import fireLvl1Url from '../models/fire/fire_model_lvl1.glb?url';
import fireLvl2Url from '../models/fire/fire_model_lvl2.glb?url';
import fireLvl3Url from '../models/fire/fire_model_lvl3.glb?url';
import fireLvl4Url from '../models/fire/fire_model_lvl4.glb?url';
import fireLvl5Url from '../models/fire/fire_model_lvl5.glb?url';
import golemLvl1Url from '../models/golem/golem_model_lvl1.glb?url';
import golemLvl2Url from '../models/golem/golem_model_lvl2.glb?url';
import golemLvl3Url from '../models/golem/golem_model_lvl3.glb?url';
import golemLvl4Url from '../models/golem/golem_model_lvl4.glb?url';
import golemLvl5Url from '../models/golem/golem_model_lvl5.glb?url';
import waterLvl1Url from '../models/water/water_model_lvl1.glb?url';
import waterLvl2Url from '../models/water/water_model_lvl2.glb?url';
import waterLvl3Url from '../models/water/water_model_lvl3.glb?url';
import waterLvl4Url from '../models/water/water_model_lvl4.glb?url';
import waterLvl5Url from '../models/water/water_model_lvl5.glb?url';
import windLvl1Url from '../models/wind/wind_model_lvl1.glb?url';
import windLvl2Url from '../models/wind/wind_model_lvl2.glb?url';
import windLvl3Url from '../models/wind/wind_model_lvl3.glb?url';
import windLvl4Url from '../models/wind/wind_model_lvl4.glb?url';
import windLvl5Url from '../models/wind/wind_model_lvl5.glb?url';
import iceUrl from '../models/ice/ice.glb?url';
import lavaUrl from '../models/lava/lava.glb?url';
import rayUrl from '../models/ray/ray.glb?url';
import sandUrl from '../models/sand/sand.glb?url';
import steamUrl from '../models/steam/steam.glb?url';
import treeUrl from '../models/tree/tree.glb?url';
import crystalUrl from '../models/crystal/crystal.glb?url';
import hazeUrl from '../models/haze/haze.glb?url';
import obsidianUrl from '../models/obsidian/obsidian.glb?url';
import pantanoUrl from '../models/pantano/pantano.glb?url';
import plasmaUrl from '../models/plasma/plasma.glb?url';
import stormUrl from '../models/storm/storm.glb?url';

/** árvore do fogo (índice = nível−1) */
export const FIRE_URLS = [fireLvl1Url, fireLvl2Url, fireLvl3Url, fireLvl4Url, fireLvl5Url];
/** árvore do vento (índice = nível−1) */
export const WIND_URLS = [windLvl1Url, windLvl2Url, windLvl3Url, windLvl4Url, windLvl5Url];
/** árvore da pedra (índice = nível−1) */
export const GOLEM_MESH_URLS = [golemLvl1Url, golemLvl2Url, golemLvl3Url, golemLvl4Url, golemLvl5Url];
/** árvore da água (índice = nível−1) */
export const WATER_URLS = [waterLvl1Url, waterLvl2Url, waterLvl3Url, waterLvl4Url, waterLvl5Url];
/** trovoada única (Nv.6) */
export const RAY_URL = rayUrl;
/** ancião das raízes único (Nv.6) */
export const TREE_URL = treeUrl;
/** colosso de lava único (Nv.6) */
export const LAVA_URL = lavaUrl;
/** cubo de gelo único (Nv.6) */
export const ICE_URL = iceUrl;
/** máquina a vapor única (Nv.6) */
export const STEAM_URL = steamUrl;
/** golem de areia único (Nv.6) */
export const SAND_URL = sandUrl;
/** prisma vivo único (Nv.7) */
export const CRYSTAL_URL = crystalUrl;
/** espectro da bruma único (Nv.7) */
export const HAZE_URL = hazeUrl;
/** fortaleza de vidro negro única (Nv.7) */
export const OBSIDIAN_URL = obsidianUrl;
/** hidra do lodo única (Nv.7) */
export const PANTANO_URL = pantanoUrl;
/** estrela de bolso única (Nv.7) */
export const PLASMA_URL = plasmaUrl;
/** muralha de raios única (Nv.7) */
export const STORM_URL = stormUrl;

/**
 * Malhas por espécie (índice = nível−1; as únicas de Nv.6 têm um só item).
 * É o gancho dos PRÉ-BAXAS: a loja pede o Nv.1 da oferta assim que a vitrine
 * monta, a prévia de fusão pede a forma que VAI nascer do arraste, e o
 * bestiário já monta o figurino do card aberto. No spawn, o figurino encontra
 * o cache pronto e nasce sem espera (o download só vira espera quando ninguém
 * avisou antes — aí o selo de invocação do `SummonFX` cobre a espera).
 */
export const MODEL_URLS_BY_SPECIES: Partial<Record<SpeciesId, readonly string[]>> = {
  ignis: FIRE_URLS,
  zephyr: WIND_URLS,
  golem: GOLEM_MESH_URLS,
  nereia: WATER_URLS,
  raio: [RAY_URL],
  madeira: [TREE_URL],
  magma: [LAVA_URL],
  gelo: [ICE_URL],
  vapor: [STEAM_URL],
  areia: [SAND_URL],
  cristal: [CRYSTAL_URL],
  nevoa: [HAZE_URL],
  obsidiana: [OBSIDIAN_URL],
  pantano: [PANTANO_URL],
  plasma: [PLASMA_URL],
  tempestade: [STORM_URL],
};

/** URL da malha da forma (espécie+nível); `undefined` = espécie puramente procedural */
export function modelUrlFor(species: SpeciesId, level: number): string | undefined {
  return MODEL_URLS_BY_SPECIES[species]?.[level - 1];
}
