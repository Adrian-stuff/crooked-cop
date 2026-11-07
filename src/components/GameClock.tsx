import { useEffect, useState } from 'react';
import type { View } from '../../shared/types';

// Whole minutes since the game started, frozen once it ends. Ticks every few seconds.
function useElapsedMinutes(startedAt: number | null, endedAt: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    const id = setInterval(() => setNow(Date.now() + offset), 5000);
    return () => clearInterval(id);
  }, [startedAt, endedAt, offset]);
  if (startedAt === null) return null;
  return Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 60000));
}

const minutesText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

// "12 min elapsed": total time the game has been running.
export function ElapsedChip({ view, offset = 0, className = 'chip' }: { view: View; offset?: number; className?: string }) {
  const mins = useElapsedMinutes(view.startedAt, view.endedAt, offset);
  if (mins === null) return null;
  return (
    <span className={className} title="Total time since the game started">
      {view.endedAt !== null ? `Played ${minutesText(mins)}` : `${minutesText(mins)} elapsed`}
    </span>
  );
}
