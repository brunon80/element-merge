import { useEffect } from 'react';
import { playMusic } from '../audio/music';
import type { MusicTrackId } from '../audio/music';
import type { ArenaScene } from '../game/types';
import { useGameStore } from '../store/gameStore';

/** cada cenário da arena tem sua própria trilha de ambiente */
const SCENE_TRACK: Record<ArenaScene, MusicTrackId> = {
  arcane: 'arcane',
  forest: 'forest',
  ice: 'ice',
  volcanic: 'volcanic',
  underwater: 'underwater',
  'universe-end': 'universe',
};

/**
 * Amarra a trilha ao contexto: menu no menu principal, o ambiente do cenário
 * durante preparação e combate, e a fanfarra/lamento no resultado. O
 * crossfade é de responsabilidade do toca-fitas (src/audio/music.ts).
 * No empate toca a vitória: o saldo sobe e parte do time sobrevive — não é
 * motivo de luto.
 */
export function useMusicTrack(): void {
  const screen = useGameStore((s) => s.screen);
  const phase = useGameStore((s) => s.phase);
  const scene = useGameStore((s) => s.activeArenaScene);
  useEffect(() => {
    if (screen === 'menu') {
      playMusic('menu');
    } else if (phase === 'victory' || phase === 'draw') {
      playMusic('victory');
    } else if (phase === 'defeat') {
      playMusic('defeat');
    } else {
      playMusic(SCENE_TRACK[scene]);
    }
  }, [screen, phase, scene]);
}
