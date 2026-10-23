import { useEffect, useState, type ReactNode } from 'react';
import { BoardPanZoom } from './BoardPanZoom';

interface Props {
  children: ReactNode;
  dock: ReactNode;
  showKey?: string;
  overlay?: ReactNode;
  controls?: ReactNode;
}

// The map with zoom and drag controls, plus the action dock floating over its bottom edge
// like a game HUD.
export function BoardView({ children, dock, showKey, overlay, controls }: Props) {
  const [tucked, setTucked] = useState(false);
  useEffect(() => setTucked(false), [showKey]);

  return (
    <div className="board-view">
      <BoardPanZoom overlay={overlay} controls={controls}>
        {children}
      </BoardPanZoom>

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
