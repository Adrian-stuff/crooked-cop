import { ADJ, EXPRESS_STOPS, STATIONS, distance, expressStep, neighbours } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';
import type { Mark } from '../components/Board';

export type Mode = 'move' | 'express' | 'search' | 'arrest' | 'start' | null;

// Lines an Express path can still be on, or null when no step is taken yet.
function expressLines(from: string, path: string[]): Set<string> | null {
  let lines: Set<string> | null = null;
  let prev = from;
  for (const st of path) {
    lines = expressStep(prev, st, lines);
    prev = st;
  }
  return lines;
}

export function candidates(view: View, mode: Mode, path: string[]): string[] {
  const me = view.players.find((p) => p.id === view.me);
  const here = me?.station;
  if (mode === 'start') {
    const isHeister = view.myRole === 'heister' || me?.role === 'heister';
    const artifactIds = Object.keys(view.artifacts ?? {});
    return STATIONS.filter((s) => {
      if (isHeister && view.exits.includes(s.id)) return false;
      if (isHeister && artifactIds.some((art) => distance(s.id, art) < 3)) return false;
      return true;
    }).map((s) => s.id);
  }
  if (!here) return [];
  const last = path.at(-1) ?? here;
  const visited = new Set([here, ...path]);
  if (mode === 'move') {
    if (path.length >= 2) return [];
    return neighbours(last).filter((s) => !visited.has(s));
  }
  if (mode === 'express') {
    if (path.length >= EXPRESS_STOPS) return [];
    const lines = expressLines(here, path);
    return [...new Set(ADJ[last].filter((n) => !visited.has(n.to) && expressStep(last, n.to, lines)).map((n) => n.to))];
  }
  if (mode === 'search') {
    return STATIONS.filter((s) => distance(here, s.id) <= view.settings.searchRange).map((s) => s.id);
  }
  if (mode === 'arrest') {
    return STATIONS.map((s) => s.id).filter((s) => {
      if (view.exits.includes(s)) return s === here; // exit: only if standing on it
      return distance(here, s) <= 2;
    });
  }
  return [];
}

export function marksFor(view: View, mode: Mode, path: string[]): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  const kind: Mark = mode === 'search' ? 'search' : mode === 'arrest' ? 'arrest' : mode === 'start' ? 'start' : 'candidate';
  for (const id of candidates(view, mode, path)) marks[id] = kind;
  for (const id of path) marks[id] = 'path';
  return marks;
}

// The best legal route to `target` in one move. Heisters prefer routes that sweep up Artifacts,
// then the shortest one.
export function pathTo(view: View, mode: 'move' | 'express', target: string): string[] | null {
  let best: string[] | null = null;
  let bestScore = -1;
  const walk = (path: string[]) => {
    for (const st of candidates(view, mode, path)) {
      const next = [...path, st];
      if (st !== target) {
        walk(next);
        continue;
      }
      // Express only collects at its last stop, so the stops in between don't count.
      const stops = mode === 'express' ? [st] : next;
      const score = stops.filter((s) => (view.artifacts?.[s] ?? 0) > 0).length;
      if (!best || score > bestScore || (score === bestScore && next.length < best.length)) {
        best = next;
        bestScore = score;
      }
    }
  };
  walk([]);
  return best;
}

export const canTarget = (view: View, mode: 'start' | 'search' | 'arrest', id: string) => candidates(view, mode, []).includes(id);

// Whether this player still has something to do in the current phase.
export function actsThisPhase(phase: View['phase'], p: PublicPlayer) {
  if (p.status !== 'active' || p.role === 'spectator') return false;
  const officer = p.role === 'police' || p.role === 'traitor';
  if (phase === 'heister') return p.role === 'heister';
  if (phase === 'police') return officer && !p.skipsPolice;
  if (phase === 'info') return officer; // the Heisters sit the Information Phase out
  return phase === 'setup';
}
