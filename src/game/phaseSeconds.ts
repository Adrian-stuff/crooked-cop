import { AFK_TURN_SECONDS } from '../../shared/engine';
import type { View } from '../../shared/types';

// How long the current timer started at, for the progress bar.
export function phaseSeconds(view: View): number {
  const s = view.settings;
  switch (view.phase) {
    case 'setup': return s.setupSeconds;
    case 'heister': return s.heisterSeconds;
    case 'police': {
      const cur = view.players.find((p) => p.id === view.policeTurn);
      return cur && (cur.afk || !cur.connected) ? Math.min(AFK_TURN_SECONDS, s.policeSeconds) : s.policeSeconds;
    }
    case 'info': return view.accusation ? Math.max(s.infoSeconds, 20) : s.infoSeconds;
    default: return 0;
  }
}
