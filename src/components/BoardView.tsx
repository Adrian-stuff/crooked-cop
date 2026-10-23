import { useEffect, useState, type ReactNode } from 'react';

// The map with the action dock floating over its bottom edge, like a game HUD. It stays on
// screen over a map taller than the window. Tuck it away to reach the stations under it;
// it comes back by itself whenever `showKey` changes (a new phase, round or player).
export function BoardView({ children, dock, showKey }: { children: ReactNode; dock: ReactNode; showKey?: string }) {
  const [tucked, setTucked] = useState(false);
  useEffect(() => setTucked(false), [showKey]);
  return (
    <div className="board-view">
      <div className="board-scroll">{children}</div>
      <div className={`dock-float ${tucked ? 'tucked' : ''}`}>
        {tucked ? (
          <button className="dock-pill" onClick={() => setTucked(false)}>▴ Show actions</button>
        ) : (
          <button className="dock-toggle" onClick={() => setTucked(true)} title="Hide the actions to see the map under them" aria-label="Hide actions">▾</button>
        )}
        {/* Hidden rather than unmounted, so a half-made choice survives tucking it away. */}
        <div className="dock-float-body" hidden={tucked}>{dock}</div>
      </div>
    </div>
  );
}
