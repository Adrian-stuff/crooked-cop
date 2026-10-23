import { useCallback, useEffect, useRef, useState } from 'react';
import { stationPercent } from '../game/geometry';
import { STATION_BY_ID } from '../../shared/map';

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface UsePanZoomOptions {
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
}

const DRAG_THRESHOLD = 8; // Pixels moved before registering as a drag gesture

export function usePanZoom({
  minScale = 1.0,
  maxScale = 4.0,
  initialScale = 1.0,
}: UsePanZoomOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: initialScale });
  const [isDragging, setIsDragging] = useState(false);

  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: initialScale });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startPanRef = useRef<{ x: number; y: number } | null>(null);
  const startTransformRef = useRef<Transform>({ x: 0, y: 0, scale: initialScale });
  const initialPinchRef = useRef<{
    dist: number;
    center: { x: number; y: number };
    scale: number;
    transform: Transform;
  } | null>(null);
  const isDraggingRef = useRef(false);

  const applyTransform = useCallback((x: number, y: number, scale: number, transition = false) => {
    const el = contentRef.current;
    if (!el) return;
    if (transition) {
      el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
    } else {
      el.style.transition = 'none';
    }
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  const clampPosition = useCallback(
    (x: number, y: number, scale: number): { x: number; y: number } => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return { x, y };

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const contentW = content.offsetWidth;
      const contentH = content.offsetHeight;
      if (!containerW || !contentW) return { x, y };

      const origLeft = Math.max(0, (containerW - contentW) / 2);
      const origTop = Math.max(0, (containerH - contentH) / 2);

      const scaledW = contentW * scale;
      const scaledH = contentH * scale;

      let minX: number;
      let maxX: number;
      if (scaledW <= containerW) {
        // Fits horizontally: keep centered
        minX = 0;
        maxX = 0;
      } else {
        // Wider than viewport: allow panning from edge to edge with a small margin
        const margin = 40;
        minX = containerW - origLeft - scaledW - margin;
        maxX = -origLeft + margin;
      }

      let minY: number;
      let maxY: number;
      if (scaledH <= containerH) {
        // Fits vertically: keep centered
        minY = 0;
        maxY = 0;
      } else {
        // Taller than viewport: allow panning from top to bottom with a small margin
        const margin = 40;
        minY = containerH - origTop - scaledH - margin;
        maxY = -origTop + margin;
      }

      return {
        x: Math.min(maxX, Math.max(minX, x)),
        y: Math.min(maxY, Math.max(minY, y)),
      };
    },
    [],
  );

  const zoomTo = useCallback(
    (targetScale: number, clientX?: number, clientY?: number) => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const clampedScale = Math.min(maxScale, Math.max(minScale, targetScale));
      const rect = container.getBoundingClientRect();
      const px = clientX !== undefined ? clientX - rect.left : rect.width / 2;
      const py = clientY !== undefined ? clientY - rect.top : rect.height / 2;

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const contentW = content.offsetWidth;
      const contentH = content.offsetHeight;
      const origLeft = Math.max(0, (containerW - contentW) / 2);
      const origTop = Math.max(0, (containerH - contentH) / 2);

      const currentScale = transformRef.current.scale;
      const currentX = transformRef.current.x;
      const currentY = transformRef.current.y;

      const cx = (px - origLeft - currentX) / currentScale;
      const cy = (py - origTop - currentY) / currentScale;

      const rawX = px - origLeft - cx * clampedScale;
      const rawY = py - origTop - cy * clampedScale;

      const { x: newX, y: newY } = clampPosition(rawX, rawY, clampedScale);

      transformRef.current = { x: newX, y: newY, scale: clampedScale };
      setTransform({ x: newX, y: newY, scale: clampedScale });
      applyTransform(newX, newY, clampedScale, true);
    },
    [clampPosition, maxScale, minScale, applyTransform],
  );

  const zoomIn = useCallback(() => {
    zoomTo(transformRef.current.scale * 1.35);
  }, [zoomTo]);

  const zoomOut = useCallback(() => {
    zoomTo(transformRef.current.scale / 1.35);
  }, [zoomTo]);

  const reset = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    setTransform({ x: 0, y: 0, scale: 1 });
    applyTransform(0, 0, 1, true);
  }, [applyTransform]);

  const centerOnPercent = useCallback(
    (leftPercent: number, topPercent: number, targetScale?: number, durationMs = 500) => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const currentScale = transformRef.current.scale;
      const nextScale = targetScale !== undefined
        ? Math.min(maxScale, Math.max(minScale, targetScale))
        : (currentScale <= 1.05 ? 1.6 : currentScale);

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const contentW = content.offsetWidth;
      const contentH = content.offsetHeight;
      if (!containerW || !contentW) return;

      const origLeft = Math.max(0, (containerW - contentW) / 2);
      const origTop = Math.max(0, (containerH - contentH) / 2);

      const stageX = contentW * (leftPercent / 100);
      const stageY = contentH * (topPercent / 100);

      const rawX = containerW / 2 - origLeft - stageX * nextScale;
      const rawY = containerH / 2 - origTop - stageY * nextScale;

      const { x: newX, y: newY } = clampPosition(rawX, rawY, nextScale);

      transformRef.current = { x: newX, y: newY, scale: nextScale };
      setTransform({ x: newX, y: newY, scale: nextScale });

      const el = contentRef.current;
      if (el) {
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.2, 0.8, 0.25, 1)`;
        el.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${nextScale})`;
        setTimeout(() => {
          if (el) el.style.transition = 'none';
        }, durationMs + 30);
      }
    },
    [clampPosition, maxScale, minScale],
  );

  const centerOnStation = useCallback(
    (stationId: string, targetScale?: number, durationMs = 500) => {
      if (!STATION_BY_ID[stationId]) return;
      const { left, top } = stationPercent(stationId);
      centerOnPercent(left, top, targetScale, durationMs);
    },
    [centerOnPercent],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Primary mouse button (0) or touch/pen only
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const target = (e.target as Element | null);
      if (target?.closest('button, input, select, textarea, a, [role="dialog"], .station-pop')) {
        return;
      }

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      isDraggingRef.current = false;

      if (pointersRef.current.size === 1) {
        startPanRef.current = { x: e.clientX, y: e.clientY };
        startTransformRef.current = { ...transformRef.current };
      } else if (pointersRef.current.size === 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        initialPinchRef.current = {
          dist,
          center,
          scale: transformRef.current.scale,
          transform: { ...transformRef.current },
        };
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      if (pointersRef.current.size === 1 && startPanRef.current) {
        const dx = e.clientX - startPanRef.current.x;
        const dy = e.clientY - startPanRef.current.y;
        const dist = Math.hypot(dx, dy);

        // Deadzone check: do not start dragging or capturing pointer until moved beyond threshold
        if (!isDraggingRef.current) {
          if (dist < DRAG_THRESHOLD) {
            return;
          }
          isDraggingRef.current = true;
          setIsDragging(true);
          try {
            container.setPointerCapture(e.pointerId);
          } catch {
            // Ignore if pointer capture fails
          }
        }

        const rawX = startTransformRef.current.x + dx;
        const rawY = startTransformRef.current.y + dy;
        const { x: newX, y: newY } = clampPosition(rawX, rawY, transformRef.current.scale);

        transformRef.current.x = newX;
        transformRef.current.y = newY;
        applyTransform(newX, newY, transformRef.current.scale, false);
      } else if (pointersRef.current.size === 2 && initialPinchRef.current) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          setIsDragging(true);
        }

        const [p1, p2] = Array.from(pointersRef.current.values());
        const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const currentCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        const factor = currentDist / (initialPinchRef.current.dist || 1);
        const nextScale = Math.min(maxScale, Math.max(minScale, initialPinchRef.current.scale * factor));

        const rect = container.getBoundingClientRect();
        const px = initialPinchRef.current.center.x - rect.left;
        const py = initialPinchRef.current.center.y - rect.top;

        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const contentW = content.offsetWidth;
        const contentH = content.offsetHeight;
        const origLeft = Math.max(0, (containerW - contentW) / 2);
        const origTop = Math.max(0, (containerH - contentH) / 2);

        const cx = (px - origLeft - initialPinchRef.current.transform.x) / initialPinchRef.current.scale;
        const cy = (py - origTop - initialPinchRef.current.transform.y) / initialPinchRef.current.scale;

        const panDx = currentCenter.x - initialPinchRef.current.center.x;
        const panDy = currentCenter.y - initialPinchRef.current.center.y;

        const rawX = px - origLeft - cx * nextScale + panDx;
        const rawY = py - origTop - cy * nextScale + panDy;

        const { x: newX, y: newY } = clampPosition(rawX, rawY, nextScale);

        transformRef.current = { x: newX, y: newY, scale: nextScale };
        applyTransform(newX, newY, nextScale, false);
      }
    },
    [applyTransform, clampPosition, maxScale, minScale],
  );

  const onPointerUp = useCallback((e: PointerEvent) => {
    pointersRef.current.delete(e.pointerId);

    const container = containerRef.current;
    if (container && container.hasPointerCapture(e.pointerId)) {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }

    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      startPanRef.current = { x: remaining.x, y: remaining.y };
      startTransformRef.current = { ...transformRef.current };
      initialPinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      startPanRef.current = null;
      initialPinchRef.current = null;

      const wasDragging = isDraggingRef.current;
      isDraggingRef.current = false;
      setIsDragging(false);

      if (wasDragging) {
        setTransform({ ...transformRef.current });
        // Suppress trailing click on drag release so station/empty board is not clicked
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        window.addEventListener('click', suppressClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', suppressClick, { capture: true });
        }, 50);
      }
    }
  }, []);

  const onDoubleClick = useCallback(
    (e: MouseEvent) => {
      const target = (e.target as Element | null);
      if (target?.closest('button, input, select, textarea, a, [role="dialog"], .station, .pawn, .station-pop')) {
        return;
      }
      if (
        transformRef.current.scale > 1.05 ||
        Math.abs(transformRef.current.x) > 10 ||
        Math.abs(transformRef.current.y) > 10
      ) {
        reset();
      } else {
        zoomTo(2.0, e.clientX, e.clientY);
      }
    },
    [reset, zoomTo],
  );

  // Attach pointer listeners
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('dblclick', onDoubleClick);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('dblclick', onDoubleClick);
    };
  }, [onPointerDown, onPointerMove, onPointerUp, onDoubleClick]);

  // Wheel zoom (non-passive to prevent page scrolling)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const currentScale = transformRef.current.scale;
      const nextScale = Math.min(maxScale, Math.max(minScale, currentScale * factor));
      if (Math.abs(nextScale - currentScale) < 0.001) return;

      const containerW = el.clientWidth;
      const containerH = el.clientHeight;
      const contentW = contentRef.current?.offsetWidth ?? containerW;
      const contentH = contentRef.current?.offsetHeight ?? containerH;
      const origLeft = Math.max(0, (containerW - contentW) / 2);
      const origTop = Math.max(0, (containerH - contentH) / 2);

      const currentX = transformRef.current.x;
      const currentY = transformRef.current.y;

      const cx = (px - origLeft - currentX) / currentScale;
      const cy = (py - origTop - currentY) / currentScale;

      const rawX = px - origLeft - cx * nextScale;
      const rawY = py - origTop - cy * nextScale;

      const { x: newX, y: newY } = clampPosition(rawX, rawY, nextScale);

      transformRef.current = { x: newX, y: newY, scale: nextScale };
      applyTransform(newX, newY, nextScale, false);
      setTransform({ x: newX, y: newY, scale: nextScale });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyTransform, clampPosition, maxScale, minScale]);

  // Window resize bounds adjustment
  useEffect(() => {
    const onResize = () => {
      const { x, y, scale } = transformRef.current;
      if (scale === 1 && x === 0 && y === 0) return;
      const { x: newX, y: newY } = clampPosition(x, y, scale);
      if (newX !== x || newY !== y) {
        transformRef.current.x = newX;
        transformRef.current.y = newY;
        applyTransform(newX, newY, scale, false);
        setTransform({ x: newX, y: newY, scale });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampPosition, applyTransform]);

  // Keyboard navigation (+, -, 0)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomIn, zoomOut, reset]);

  return {
    containerRef,
    contentRef,
    transform,
    isDragging,
    zoomIn,
    zoomOut,
    reset,
    zoomTo,
    centerOnPercent,
    centerOnStation,
  };
}
