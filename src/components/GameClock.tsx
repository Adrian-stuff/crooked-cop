import { useEffect, useState } from 'react';
import type { View } from '../../shared/types';

// Only real timestamps count: a view from an older facilitator build has no startedAt at all.
const time = (t: number | null | undefined) => (typeof t === 'number' && Number.isFinite(t) ? t : null);

// Whole minutes since the game started, frozen once it ends. Ticks every few seconds.
// Unknown start (or a broken clock offset) shows nothing rather than "NaN min".
function useElapsedMinutes(started: number | null | undefined, ended: number | null | undefined, rawOffset: number): number | null {
  const startedAt = time(started);
  const endedAt = time(ended);
  const offset = time(rawOffset) ?? 0;
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), 5000);
    return () => clearInterval(id);
  }, [startedAt, endedAt, offset]);
  if (startedAt === null) return null;
  const mins = Math.floor(((endedAt ?? now) - startedAt) / 60000);
  return Number.isFinite(mins) ? Math.max(0, mins) : null;
}

const minutesText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

// "12 min elapsed": total time the game has been running.
export function ElapsedChip({ view, offset = 0, className = 'chip' }: { view: View; offset?: number; className?: string }) {
  const mins = useElapsedMinutes(view.startedAt, view.endedAt, offset);
  if (mins === null) return null;
  return (
    <span className={className} title="Total time since the game started">
      {time(view.endedAt) !== null ? `Played ${minutesText(mins)}` : `${minutesText(mins)} elapsed`}
    </span>
  );
}
