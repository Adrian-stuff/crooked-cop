import { ADJ, LINES, STATION_BY_ID } from '../../shared/map';

type Pt = { x: number; y: number };

// Shortest hop route a → b, both ends included.
export function route(a: string, b: string): string[] {
  if (a === b || !ADJ[a] || !ADJ[b]) return [a, b];
  const prev: Record<string, string> = { [a]: a };
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { to } of ADJ[cur]) {
      if (prev[to] !== undefined) continue;
      prev[to] = cur;
      if (to === b) {
        const out = [b];
        for (let s = b; s !== a; ) out.push((s = prev[s]));
        return out.reverse();
      }
      queue.push(to);
    }
  }
  return [a, b];
}

// The drawn track between two adjacent stations, including any bends, so pawns ride the rails.
function leg(a: string, b: string): Pt[] {
  for (const line of LINES) {
    for (const seg of line.segments) {
      const ia = seg.indexOf(a);
      const ib = seg.indexOf(b);
      if (ia < 0 || ib < 0) continue;
      const span = seg.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
      if (span.slice(1, -1).some((p) => typeof p === 'string')) continue;
      const pts = span.map((p) => (typeof p === 'string' ? STATION_BY_ID[p] : p));
      return ia < ib ? pts : pts.reverse();
    }
  }
  return [STATION_BY_ID[a], STATION_BY_ID[b]];
}

// Points along the track from station a to station b.
export function trackPoints(a: string, b: string): Pt[] {
  const stops = route(a, b);
  const pts: Pt[] = [STATION_BY_ID[stops[0]]];
  for (let i = 0; i + 1 < stops.length; i++) pts.push(...leg(stops[i], stops[i + 1]).slice(1));
  return pts.filter(Boolean);
}
