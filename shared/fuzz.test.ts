import { describe, expect, it } from 'vitest';
import { addPlayer, applyAction, createGame, GameError, viewFor } from './engine';
import { ADJ, STATIONS, neighbours } from './map';
import type { Action, GameState } from './types';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function randomAction(g: GameState, id: string, r: () => number): Action {
  const me = g.players.find((p) => p.id === id)!;
  const any = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const here = me.station ?? STATIONS[0].id;
  const step = () => {
    const a = any(neighbours(here));
    const b = any(neighbours(a).filter((x) => x !== here));
    return r() < 0.5 && b ? [a, b] : [a];
  };
  const options: Action[] = [
    { type: 'chooseStart', station: any(STATIONS).id },
    { type: 'move', path: step(), express: r() < 0.2 },
    { type: 'search', station: any([here, ...neighbours(here)]) },
    { type: 'arrest', station: any([here, ...ADJ[here].map((n) => n.to)]) },
    { type: 'endTurn' },
    { type: 'ready' },
    { type: 'accuse', target: any(g.players).id },
    { type: 'vote', yes: r() < 0.6 },
    { type: 'tick' },
  ];
  return any(options);
}

describe('random full games', () => {
  it('never throws a non-game error and never leaks hidden info to police', () => {
    let finished = 0;
    for (let game = 0; game < 60; game++) {
      const r = rng(game + 1);
      const n = 4 + (game % 5);
      let g = createGame('FUZZ', 'p0', 'P0', game);
      for (let i = 1; i < n; i++) g = addPlayer(g, `p${i}`, `P${i}`);
      g = applyAction(g, 'p0', { type: 'start' }, 0);
      let t = 0;
      for (let step = 0; step < 4000 && g.phase !== 'ended'; step++) {
        t += r() < 0.05 ? 30_000 : 200;
        const p = g.players[Math.floor(r() * g.players.length)];
        try {
          g = applyAction(g, p.id, randomAction(g, p.id, r), t);
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
        }
        for (const viewer of g.players) {
          if (step % 7 !== 0 || viewer.role !== 'police' || g.phase === 'ended') continue;
          const v = viewFor(g, viewer.id, t);
          expect(v.artifacts).toBeNull();
          expect(v.trails).toBeNull();
          for (const pp of v.players) {
            if (pp.role === 'heister' && pp.status === 'active') expect(pp.station).toBeNull();
            if (pp.role === 'heister') expect(pp.carried).toBeNull();
          }
          expect(v.players.some((pp) => pp.role === 'traitor' && pp.status === 'active')).toBe(false);
          expect(v.envelopes.every((e) => e.to === viewer.id)).toBe(true);
        }
        // Invariants
        const totalArtifacts = Object.values(g.artifacts).reduce((a, b) => a + b, 0)
          + g.players.reduce((a, p) => a + p.carried, 0);
        expect(totalArtifacts).toBe(g.settings.artifactCount);
        expect(g.arrestsThisRound).toBeLessThanOrEqual(3);
      }
      if (g.phase === 'ended') finished++;
    }
    expect(finished).toBeGreaterThan(50);
  });
});
