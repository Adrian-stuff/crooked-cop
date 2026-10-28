import { useMemo, useState } from 'react';
import type { ScanResult, View } from '../../shared/types';

// A scan that found someone lights up the 3-station stretches it named; otherwise the whole line.
export const scanArea = (r: ScanResult) => (r.found && r.zones?.length ? [...new Set(r.zones.flat())] : r.stations);

// Keep the area your Search swept lit up for the rest of the round.
// Hovering or pinning an envelope's area chip lights that sweep up instead.
export function useEnvelopeHighlight(view: View) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const highlight = hover ?? pinned;
  const shown = view.envelopes.find((e) => e.id === highlight);
  const areaOf = (e?: View['envelopes'][number]) => e?.search?.area ?? (e?.scan ? scanArea(e.scan) : undefined);
  const swept = areaOf(shown)
    ?? areaOf(view.envelopes.filter((e) => (e.kind === 'search' || e.kind === 'ultimate') && (view.godView || e.to === view.me) && e.round === view.round).at(-1));

  // Stations where your own searches or ultimate spotted a Heister in the last 3 rounds (latest per station).
  const lastSeen = useMemo(() => {
    if (view.godView) return [];
    const seen: Record<string, number> = {};
    for (const e of view.envelopes) {
      if (e.to !== view.me || view.round - e.round > 2) continue;
      if (e.search) {
        for (const s of e.search.heistersNow) seen[s] = Math.max(seen[s] ?? 0, e.round);
      }
      if (e.scan?.heistersNow) {
        for (const s of e.scan.heistersNow) seen[s] = Math.max(seen[s] ?? 0, e.round);
      }
    }
    return Object.entries(seen).map(([station, round]) => ({ station, round }));
  }, [view.envelopes, view.me, view.round, view.godView]);

  const onHighlight = (id: string | null, pin?: boolean) => {
    if (pin) setPinned((p) => (p === id ? null : id));
    else setHover(id);
  };
  return { highlight, onHighlight, swept, lastSeen };
}
