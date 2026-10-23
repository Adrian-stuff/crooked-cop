import type { ReactNode } from 'react';
import { usePanZoom } from './usePanZoom';

interface Props {
  children: ReactNode;
  overlay?: ReactNode;
  controls?: ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

export function BoardPanZoom({
  children,
  overlay,
  controls,
  className = '',
  minScale = 0.5,
  maxScale = 4.0,
}: Props) {
  const { containerRef, contentRef, transform, isDragging, zoomIn, zoomOut, reset } = usePanZoom({
    minScale,
    maxScale,
    initialScale: 1.0,
  });

  const isTransformed =
    transform.scale !== 1 || Math.abs(transform.x) > 1 || Math.abs(transform.y) > 1;

  return (
    <div
      ref={containerRef}
      className={`board-scroll board-viewport ${isDragging ? 'dragging' : ''} ${className}`}
    >
      <div
        ref={contentRef}
        className="board-pan-zoom"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>

      {overlay && <div className="board-overlay">{overlay}</div>}

      <div className="board-zoom-hud">
        {controls}
        <div className="zoom-btn-group">
          <button
            type="button"
            className="zoom-btn"
            onClick={zoomIn}
            disabled={transform.scale >= maxScale}
            title="Zoom in (+ or scroll wheel)"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="zoom-btn zoom-level-btn"
            onClick={reset}
            title="Reset zoom to 100% (0 or double-click)"
            aria-label="Reset zoom"
          >
            {Math.round(transform.scale * 100)}%
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={zoomOut}
            disabled={transform.scale <= minScale}
            title="Zoom out (– or scroll wheel)"
            aria-label="Zoom out"
          >
            –
          </button>
        </div>
        {isTransformed && (
          <button
            type="button"
            className="zoom-reset-btn"
            onClick={reset}
            title="Reset view (0 or double-click)"
            aria-label="Reset view"
          >
            ⟲ Reset
          </button>
        )}
      </div>
    </div>
  );
}
