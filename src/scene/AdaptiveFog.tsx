import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Fog } from 'three';
import { ARENA_R, ORBIT_TARGET } from '../game/board';
import type { ArenaScene } from '../game/types';

/**
 * FOG ADAPTIVO (05/nov — cobrado pelo usuário: "no mobile não dá para ver
 * árvore nenhuma"). O fog antigo era FIXO (near 2×ARENA_R, far 5,5–7,5×):
 * como as distâncias do fog são medidas a partir da CÂMERA, o mesmo cenário
 * tinha densidades incompatíveis entre as fases — o desktop de janela larga
 * começa com a câmera BAIXA a 1,316R do tabuleiro (fog quase não tocava
 * nada), enquanto o celular/tablete começa a 2,3R (CAMERA_POS) e a órbita
 * sobe até 2,55R: a vegetação do anel externo (floresta chega a ARENA_R+35,
 * gelo a +51, vulcão a +75, subaquático a +60) afundava em 60%+ de neblina,
 * e a linha inimiga do próprio tabuleiro já entrava em ~20% de fog.
 *
 * O fog agora acompanha a câmera: começa sempre logo após a última linha do
 * tabuleiro (distância à câmera + 0,4R — a linha inimiga fica limpa em
 * QUALQUER fase/janela/zoom) e tem um COMPRIMENTO por cenário, preservando a
 * personalidade de cada um (subaquático é o mais turvo, gelo o mais límpido
 * — a mesma ordem relativa do desenho antigo). Medido na sonda
 * `qa/probe-fog.mjs`: a vegetação externa máxima não passa de ~50% de neblina
 * no pior enquadre (anel externo montado a até 2,55R da câmera).
 */
/**
 * Comprimento do fog por cenário, em ARENA_R — CALIBRADO na sonda
 * qa/probe-fog.mjs contra a vegetação REAL de cada ambiente (pior folha
 * medida, não intuição):
 *  - floresta: a MURALHA de árvores mora a r 86,5–116,5 (TREE_RING_INNER
 *    sai do teto de zoom da órbita + copa + folga — é o desenho antigo,
 *    preservado) — precisa do maior alcance para a muralha continuar lida;
 *  - vulcão: conos distantes a r 75–98 (silhueta, não mancha);
 *  - gelo: floresta de gelo a r 53–74;
 *  - subaquático: recife a r 61–83 (a névoa mais densa — paisagem afogada);
 *  - arcana: sem vegetação externa, só o vazio além da ilha esmaece.
 * Meta sonda: pior folha ≤ 0,55 de neblina nas três calibrações de câmera
 * (retrato celular ~2,2R, desktop baixo 1,316R e zoom máximo do cenário).
 * Lição que originou o fix (cobrado pelo usuário): com spans curtos a
 * MURALHA da floresta (offset ~83–101 da câmera) afundava em 0,8–0,97.
 */
const FOG_SPAN: Record<ArenaScene, number> = {
  underwater: 5.0, // névoa d'água: a mais densa (engole o recife longínquo)
  arcane: 4.6, // ilha arcana sem vegetação: só o vazio além da ilha esmaece
  ice: 5.5, // ar congelado LIMPO: a floresta de gelo do horizonte é paisagem
  volcanic: 6.0, // ar de cinzas: os conos distantes viram silhueta legível
  forest: 8.0, // bruma da mata leve POR UNIDADE, mas a muralha é muito longe
  'universe-end': 0, // sem fog — as estrelas deste cenário pedem céu aberto
};

/** folga entre a câmera e o início do fog, em ARENA_R (a linha inimiga do
 *  tabuleiro fica de fora em toda câmera: a linha mais distante do board está
 *  a ~0,37R além do alvo, e o fog começa a 0,4R) */
const FOG_NEAR_AHEAD = 0.4;

export function AdaptiveFog({
  color,
  variant,
}: {
  color: string;
  variant: ArenaScene;
}) {
  const { scene, camera } = useThree();
  const ownRef = useRef<Fog | null>(null);

  useEffect(() => {
    ownRef.current = new Fog(color, ARENA_R * 2, ARENA_R * 6);
    scene.fog = ownRef.current;
    return () => {
      ownRef.current = null;
      scene.fog = null;
    };
  }, [scene, color]);

  useFrame(() => {
    const fog = ownRef.current;
    if (!fog) return;
    const dist = Math.hypot(
      camera.position.x - ORBIT_TARGET[0],
      camera.position.y - ORBIT_TARGET[1],
      camera.position.z - ORBIT_TARGET[2],
    );
    fog.near = dist + ARENA_R * FOG_NEAR_AHEAD;
    fog.far = fog.near + ARENA_R * FOG_SPAN[variant];
  });

  return null;
}
