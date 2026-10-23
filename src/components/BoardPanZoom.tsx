import { useEffect, useRef, type ReactNode } from 'react';
import { usePanZoom } from './usePanZoom';

interface Props {
  children: ReactNode;
  overlay?: ReactNode;
  controls?: ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
  activeStation?: string | null;
  activePlayerName?: string;
  autoCenter?: boolean;
}

export function BoardPanZoom({
  children,
  overlay,
  controls,
  className = '',
  minScale = 1.0,
  maxScale = 4.0,
  activeStation = null,
  activePlayerName,
  autoCenter = true,
}: Props) {
  const {
    containerRef,
    contentRef,
    transform,
    isDragging,
    zoomIn,
    zoomOut,
    reset,
    centerOnStation,
  } = usePanZoom({
    minScale,
    maxScale,
    initialScale: 1.0,
  });

  const lastCenteredStation = useRef<string | null>(null);

  // Auto-pan camera when the active player changes, if zoomed in or screen overflows
  useEffect(() => {
    if (!activeStation || !autoCenter) return;
    if (lastCenteredStation.current === activeStation) return;
    lastCenteredStation.current = activeStation;

    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const isOverflowing = content.offsetWidth > container.clientWidth || content.offsetHeight > container.clientHeight;
    const isZoomedIn = transform.scale > 1.05;

    if (isZoomedIn || isOverflowing) {
      centerOnStation(activeStation, isZoomedIn ? transform.scale : undefined, 600);
    }
  }, [activeStation, autoCenter, centerOnStation, transform.scale]);

  const handleCenterClick = () => {
    if (activeStation) {
      // Zoom in to at least 1.6x when explicitly centering on player
      centerOnStation(activeStation, Math.max(1.6, transform.scale), 500);
    }
  };

  // Keyboard shortcut 'c' to center on active player
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        if (activeStation) {
          e.preventDefault();
          handleCenterClick();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStation, transform.scale, centerOnStation]);

  const isTransformed =
    transform.scale > 1.01 || Math.abs(transform.x) > 1 || Math.abs(transform.y) > 1;

  return (
    <div
      ref={containerRef}
      className={`board-scroll board-viewport ${isTransformed ? 'is-pannable' : ''} ${isDragging ? 'dragging' : ''} ${className}`}
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
          {activeStation && (
            <button
              type="button"
              className="zoom-btn zoom-center-btn"
              onClick={handleCenterClick}
              title={`Center camera on ${activePlayerName || 'current player'} (C)`}
              aria-label={`Center camera on ${activePlayerName || 'current player'}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
              </svg>
            </button>
          )}
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
            disabled={transform.scale <= minScale}
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
            title="Reset view to fit (0 or double-click)"
            aria-label="Reset view"
          >
            ⟲ Reset
          </button>
        )}
      </div>
    </div>
  );
}
