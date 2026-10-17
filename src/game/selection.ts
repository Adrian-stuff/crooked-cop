import { ADJ, EXIT_STATION, STATIONS, distance, neighbours } from '../../shared/map';
import type { View } from '../../shared/types';
import type { Mark } from '../components/Board';

export type Mode = 'move' | 'express' | 'search' | 'arrest' | 'start' | null;

// Lines an Express path can still be on, or null when no step is taken yet.
function expressLines(from: string, path: string[]): Set<string> | null {
  let lines: Set<string> | null = null;
  let prev = from;
  for (const st of path) {
    const shared = new Set(ADJ[prev].filter((n) => n.to === st).map((n) => n.line));
    const next: Set<string> = lines ? new Set([...lines].filter((l: string) => shared.has(l))) : shared;
    lines = next;
    prev = st;
  }
  return lines;
}

export function candidates(view: View, mode: Mode, path: string[]): string[] {
  const me = view.players.find((p) => p.id === view.me);
  const here = me?.station;
  if (mode === 'start') {
    return STATIONS.filter((s) => !(view.myRole === 'heister' && s.exit)).map((s) => s.id);
  }
  if (!here) return [];
  const last = path.at(-1) ?? here;
  const visited = new Set([here, ...path]);
  if (mode === 'move') {
    if (path.length >= 2) return [];
    return neighbours(last).filter((s) => !visited.has(s));
  }
  if (mode === 'express') {
    if (path.length >= 4) return [];
    const lines = expressLines(here, path);
    return [...new Set(ADJ[last].filter((n) => (!lines || lines.has(n.line)) && !visited.has(n.to)).map((n) => n.to))];
  }
  if (mode === 'search') {
    return STATIONS.filter((s) => distance(here, s.id) <= view.settings.searchRange).map((s) => s.id);
  }
  if (mode === 'arrest') {
    if (here === EXIT_STATION) return [EXIT_STATION, ...neighbours(here)];
    return [here, ...neighbours(here).filter((s) => s !== EXIT_STATION)];
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
