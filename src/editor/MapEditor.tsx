import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINES, MAP_HEIGHT, MAP_WIDTH, STATIONS, type LabelSide, type Station } from '../../shared/map';
import { Rails } from '../components/Rails';
import { StationLabels } from '../components/StationLabels';
import { LABEL_SIZE, MAJOR_LABEL_SIZE, labelSize } from '../game/geometry';
import { mapCode, parseMapFile, validate, type MapDraft, type Pt, type SegPoint } from './mapCode';

const DRAFT_KEY = 'crooked-cop:map-editor-draft';
const SIDES: LabelSide[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const HOME_VIEW = { x: -60, y: -40, w: MAP_WIDTH + 120, h: MAP_HEIGHT + 80 };

type Mode = 'select' | 'station' | 'track';
type Sel = { kind: 'station'; id: string } | { kind: 'label'; id: string } | { kind: 'bend'; line: number; seg: number; idx: number } | null;
type Drag =
  | { kind: 'move'; sel: Exclude<Sel, null>; from: Pt; start: Pt }
  | { kind: 'pan'; from: { cx: number; cy: number }; view: typeof HOME_VIEW };

const shipped = (): MapDraft => structuredClone({ stations: STATIONS, lines: LINES });

function loadDraft(): MapDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as MapDraft;
  } catch { /* no storage: start from the shipped map */ }
  return shipped();
}

function uniqueId(base: string, taken: Set<string>) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
}

// Client coordinates to map units.
function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): Pt {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: p.x, y: p.y };
}

// A number box that can be cleared before typing a new value. It applies the value whenever the
// text is a valid number in range, and shows the real value again once it loses focus.
function NumberField({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={min} max={max} value={draft ?? value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function MapEditor({ onClose }: { onClose: () => void }) {
  const [map, setMap] = useState<MapDraft>(loadDraft);
  const past = useRef<MapDraft[]>([]);
  const future = useRef<MapDraft[]>([]);
  const [mode, setMode] = useState<Mode>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [activeLine, setActiveLine] = useState(0);
  const [activeSeg, setActiveSeg] = useState(0);
  const [snap, setSnap] = useState(true);
  const [view, setView] = useState(HOME_VIEW);
  const [status, setStatus] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(map)); } catch { /* draft just won't survive a reload */ }
  }, [map]);

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(id);
  }, [status]);

  const byId = useMemo(() => Object.fromEntries(map.stations.map((s) => [s.id, s])), [map.stations]);
  const point = useCallback((p: SegPoint) => (typeof p === 'string' ? byId[p] : p), [byId]);
  const warnings = useMemo(() => validate(map), [map]);
  const line = map.lines[activeLine];

  // Every edit goes through commit (undoable) or, mid-drag, through setMap directly.
  const commit = useCallback((next: MapDraft | ((m: MapDraft) => MapDraft)) => {
    setMap((cur) => {
      const n = typeof next === 'function' ? next(cur) : next;
      if (n === cur) return cur;
      past.current = [...past.current.slice(-99), cur];
      future.current = [];
      return n;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setMap((cur) => { future.current.push(cur); return prev; });
    setSel(null);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setMap((cur) => { past.current.push(cur); return next; });
    setSel(null);
  }, []);

  const snapPt = useCallback((p: Pt): Pt => (snap ? { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 } : { x: Math.round(p.x), y: Math.round(p.y) }), [snap]);

  const toMap = (e: { clientX: number; clientY: number }) => svgPoint(svgRef.current!, e);

  // ---------- map edits ----------

  const updateStation = (id: string, patch: Partial<Station>) =>
    commit((m) => ({ ...m, stations: m.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  // Kept in -180..180; 0 clears the field so untouched stations serialize as before.
  const setAngle = (id: string, deg: number) => {
    const a = Math.round(((((deg + 180) % 360) + 360) % 360) - 180);
    updateStation(id, { labelAngle: a || undefined });
  };

  const renameStation = (from: string, to: string) => {
    to = to.trim();
    if (!to || to === from) return;
    if (byId[to]) return setStatus(`Station id "${to}" is already taken.`);
    commit((m) => ({
      stations: m.stations.map((s) => (s.id === from ? { ...s, id: to } : s)),
      lines: m.lines.map((l) => ({ ...l, segments: l.segments.map((seg) => seg.map((p) => (p === from ? to : p))) })),
    }));
    setSel({ kind: 'station', id: to });
  };

  const setPoint = (m: MapDraft, s: Exclude<Sel, null>, p: Pt): MapDraft => {
    if (s.kind === 'station') return { ...m, stations: m.stations.map((st) => (st.id === s.id ? { ...st, ...p } : st)) };
    if (s.kind === 'label') {
      const labelOffset = p.x || p.y ? p : undefined;
      return { ...m, stations: m.stations.map((st) => (st.id === s.id ? { ...st, labelOffset } : st)) };
    }
    return {
      ...m,
      lines: m.lines.map((l, li) => (li !== s.line ? l : {
        ...l,
        segments: l.segments.map((seg, si) => (si !== s.seg ? seg : seg.map((q, qi) => (qi === s.idx ? p : q)))),
      })),
    };
  };

  const deleteSel = () => {
    if (!sel || sel.kind === 'label') return;
    if (sel.kind === 'station') {
      commit((m) => ({
        stations: m.stations.filter((s) => s.id !== sel.id),
        lines: m.lines.map((l) => ({ ...l, segments: l.segments.map((seg) => seg.filter((p) => p !== sel.id)) })),
      }));
    } else {
      removePoint(sel.line, sel.seg, sel.idx);
    }
    setSel(null);
  };

  const removePoint = (li: number, si: number, idx: number) =>
    commit((m) => ({
      ...m,
      lines: m.lines.map((l, i) => (i !== li ? l : { ...l, segments: l.segments.map((seg, j) => (j !== si ? seg : seg.filter((_, k) => k !== idx))) })),
    }));

  const appendToSegment = (p: SegPoint) => {
    if (!line) return setStatus('Add a line first.');
    commit((m) => {
      const segs = m.lines[activeLine].segments.length ? m.lines[activeLine].segments : [[]];
      const si = Math.min(activeSeg, segs.length - 1);
      const seg = segs[si];
      if (typeof p === 'string' && seg.at(-1) === p) return m;
      const lines = m.lines.map((l, i) => (i !== activeLine ? l : { ...l, segments: segs.map((s, j) => (j === si ? [...s, p] : s)) }));
      return { ...m, lines };
    });
  };

  const updateLine = (patch: Partial<MapDraft['lines'][number]>) =>
    commit((m) => ({ ...m, lines: m.lines.map((l, i) => (i === activeLine ? { ...l, ...patch } : l)) }));

  const addLine = () => {
    const id = uniqueId('new_line', new Set(map.lines.map((l) => l.id)));
    commit((m) => ({ ...m, lines: [...m.lines, { id, name: 'New', color: '#ffffff', segments: [[]] }] }));
    setActiveLine(map.lines.length);
    setActiveSeg(0);
    setMode('track');
  };

  // ---------- pointer ----------

  const onStationDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (mode === 'track') return appendToSegment(id);
    const s = { kind: 'station' as const, id };
    setSel(s);
    startMove(e, s, byId[id]);
  };

  const onLabelDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (mode === 'track') return appendToSegment(id);
    const s = { kind: 'label' as const, id };
    setSel(s);
    startMove(e, s, byId[id].labelOffset ?? { x: 0, y: 0 });
  };

  const onBendDown = (e: React.PointerEvent, li: number, si: number, idx: number, p: Pt) => {
    e.stopPropagation();
    const s = { kind: 'bend' as const, line: li, seg: si, idx };
    setSel(s);
    startMove(e, s, p);
  };

  const startMove = (e: React.PointerEvent, s: Exclude<Sel, null>, at: Pt) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    past.current = [...past.current.slice(-99), map];
    future.current = [];
    drag.current = { kind: 'move', sel: s, from: toMap(e), start: { x: at.x, y: at.y } };
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    const at = snapPt(toMap(e));
    if (mode === 'station') {
      const id = uniqueId('station', new Set(map.stations.map((s) => s.id)));
      commit((m) => ({ ...m, stations: [...m.stations, { id, name: 'New Station', ...at, label: 'e' }] }));
      setSel({ kind: 'station', id });
      return;
    }
    if (mode === 'track') return appendToSegment(at);
    setSel(null);
    svgRef.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: 'pan', from: { cx: e.clientX, cy: e.clientY }, view };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const scale = d.view.w / svgRef.current!.clientWidth;
      setView({ ...d.view, x: d.view.x - (e.clientX - d.from.cx) * scale, y: d.view.y - (e.clientY - d.from.cy) * scale });
      return;
    }
    const now = toMap(e);
    const to = { x: d.start.x + now.x - d.from.x, y: d.start.y + now.y - d.from.y };
    // Labels move freely: a 10-unit grid is too coarse for text.
    const p = d.sel.kind === 'label' ? { x: Math.round(to.x), y: Math.round(to.y) } : snapPt(to);
    setMap((m) => setPoint(m, d.sel, p));
  };

  const onUp = () => { drag.current = null; };

  // Wheel zooms around the cursor; React's onWheel is passive, so bind it by hand.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = svgPoint(svg, e);
      const k = Math.min(4, Math.max(0.15, Math.exp(e.deltaY * 0.0015)));
      setView((v) => {
        const w = Math.min(HOME_VIEW.w * 2, Math.max(200, v.w * k));
        const f = w / v.w;
        return { x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f, w, h: v.h * f };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- keyboard ----------

  // The window listener binds once and reads the latest handlers from here.
  const keys = useRef<{ undo: () => void; redo: () => void; deleteSel: () => void; onClose: () => void; sel: Sel; setSel: (s: Sel) => void; nudge: (dx: number, dy: number) => void; tilt: (deg: number) => void }>(null!);
  keys.current = {
    undo, redo, deleteSel, onClose, sel, setSel,
    tilt: (deg) => {
      if (sel?.kind !== 'station' && sel?.kind !== 'label') return;
      const st = byId[sel.id];
      if (st) setAngle(st.id, (st.labelAngle ?? 0) + deg);
    },
    nudge: (dx, dy) => {
      if (!sel) return;
      const at = sel.kind === 'station' ? byId[sel.id]
        : sel.kind === 'label' ? (byId[sel.id] && (byId[sel.id].labelOffset ?? { x: 0, y: 0 }))
        : (map.lines[sel.line].segments[sel.seg][sel.idx] as Pt);
      if (at) commit((m) => setPoint(m, sel, { x: at.x + dx, y: at.y + dy }));
    },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = keys.current;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? k.redo() : k.undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return k.redo(); }
      if (mod || e.altKey) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'Escape': return k.sel ? k.setSel(null) : k.onClose();
        case 'Delete': case 'Backspace': e.preventDefault(); return k.deleteSel();
        case 'v': return setMode('select');
        case 's': return setMode('station');
        case 't': return setMode('track');
        case 'ArrowLeft': e.preventDefault(); return k.nudge(-step, 0);
        case 'ArrowRight': e.preventDefault(); return k.nudge(step, 0);
        case 'ArrowUp': e.preventDefault(); return k.nudge(0, -step);
        case 'ArrowDown': e.preventDefault(); return k.nudge(0, step);
        case '[': case '{': return k.tilt(e.shiftKey ? -1 : -5);
        case ']': case '}': return k.tilt(e.shiftKey ? 1 : 5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- output ----------

  const code = () => mapCode({ ...map, lines: map.lines.map((l) => ({ ...l, segments: l.segments.filter((s) => s.length > 1) })) });

  const save = async () => {
    try {
      const res = await fetch('/__map-editor/save', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: code() });
      setStatus(res.ok ? 'Saved to shared/map.ts and synced to the edge function.' : `Save failed: ${await res.text()}`);
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code());
      setStatus('Copied. Paste it over the @map-editor block in shared/map.ts.');
    } catch {
      setStatus('Clipboard blocked. Use Download instead.');
    }
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code()], { type: 'text/plain' }));
    a.download = 'map-data.ts';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const reset = () => {
    if (!confirm('Discard the draft and reload the map currently in shared/map.ts?')) return;
    commit(shipped());
    setSel(null);
  };

  // Loads a map-data.ts from Download (or shared/map.ts, or a JSON draft). Undo brings the old draft back.
  const restoreInput = useRef<HTMLInputElement>(null);
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = parseMapFile(await file.text());
      commit(next);
      setSel(null);
      setActiveLine(0);
      setActiveSeg(0);
      setStatus(`Restored ${next.stations.length} stations and ${next.lines.length} lines from ${file.name}. Undo to go back.`);
    } catch (err) {
      setStatus(`Couldn't restore ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ---------- render ----------

  const selStation = sel?.kind === 'station' || sel?.kind === 'label' ? byId[sel.id] : undefined;
  const selBend = sel?.kind === 'bend' ? (map.lines[sel.line]?.segments[sel.seg]?.[sel.idx] as Pt | undefined) : undefined;
  const stationLines = (id: string) => map.lines.filter((l) => l.segments.some((s) => s.includes(id))).map((l) => l.name);
  const activeSegPts = line?.segments[Math.min(activeSeg, line.segments.length - 1)] ?? [];

  return (
    <div className="map-editor" role="dialog" aria-label="Map editor">
      <header className="me-bar">
        <strong>Map editor</strong>
        <div className="me-modes" role="radiogroup" aria-label="Tool">
          {([['select', 'Select (V)'], ['station', 'Add station (S)'], ['track', 'Draw track (T)']] as const).map(([m, label]) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
        <label className="me-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap 10</label>
        <button onClick={undo} disabled={!past.current.length}>Undo</button>
        <button onClick={redo} disabled={!future.current.length}>Redo</button>
        <button onClick={() => setView(HOME_VIEW)}>Fit</button>
        <span className="me-spacer" />
        {import.meta.env.DEV && <button className="primary" onClick={save}>Save to repo</button>}
        <button onClick={copy}>Copy code</button>
        <button onClick={download}>Download</button>
        <button onClick={() => restoreInput.current?.click()}>Restore</button>
        <input ref={restoreInput} type="file" accept=".ts,.json,.txt,text/plain,application/json" hidden
          onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        <button onClick={reset}>Reset</button>
        <button onClick={onClose} aria-label="Close map editor">Close</button>
      </header>

      <div className="me-body">
        <svg ref={svgRef} className={`me-canvas mode-${mode}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <rect x={-5000} y={-5000} width={12000} height={12000} fill="var(--board)" onPointerDown={onBackgroundDown} />
          <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} className="me-frame" pointerEvents="none" />
          <Rails lines={map.lines} point={point} />

          {line && activeSegPts.length > 0 && (
            <polyline className="me-active-seg" pointerEvents="none"
              points={activeSegPts.map(point).filter(Boolean).map((p) => `${p!.x},${p!.y}`).join(' ')} />
          )}

          {map.lines.map((l, li) => l.segments.map((seg, si) => seg.map((p, idx) => typeof p === 'string' ? null : (
            <rect key={`${li}-${si}-${idx}`} x={p.x - 8} y={p.y - 8} width={16} height={16} rx={3}
              className={`me-bend ${sel?.kind === 'bend' && sel.line === li && sel.seg === si && sel.idx === idx ? 'sel' : ''}`}
              stroke={l.color} onPointerDown={(e) => onBendDown(e, li, si, idx, p)} />
          ))))}

          {map.stations.map((st) => (
            <g key={st.id} className="me-station" onPointerDown={(e) => onStationDown(e, st.id)}>
              {(sel?.kind === 'station' || sel?.kind === 'label') && sel.id === st.id && <circle cx={st.x} cy={st.y} r={36} className="me-sel-ring" />}
              {st.exit && <circle cx={st.x} cy={st.y} r={30} fill="none" stroke="#f7e11b" strokeWidth={8} />}
              {st.interchange ? (
                <>
                  <circle cx={st.x} cy={st.y} r={24} fill="#fff" />
                  <circle cx={st.x} cy={st.y} r={19} fill="#111" />
                  <circle cx={st.x} cy={st.y} r={13} fill="#fff" />
                </>
              ) : (
                <circle cx={st.x} cy={st.y} r={14} fill="#fff" stroke="#111" strokeWidth={4} />
              )}
              <circle cx={st.x} cy={st.y} r={30} fill="transparent" />
            </g>
          ))}
          <StationLabels stations={map.stations} selected={sel?.kind === 'label' ? sel.id : null} onLabelDown={onLabelDown} />
        </svg>

        <aside className="me-side">
          {selStation && (
            <section>
              <h3>Station</h3>
              <label>Id<input key={selStation.id} defaultValue={selStation.id} onBlur={(e) => renameStation(selStation.id, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>
              <label>Name<input value={selStation.name} onChange={(e) => updateStation(selStation.id, { name: e.target.value })} /></label>
              <div className="me-row">
                <label>X<NumberField value={selStation.x} onChange={(x) => updateStation(selStation.id, { x })} /></label>
                <label>Y<NumberField value={selStation.y} onChange={(y) => updateStation(selStation.id, { y })} /></label>
              </div>
              <label>Label
                <select value={selStation.label} onChange={(e) => updateStation(selStation.id, { label: e.target.value as LabelSide })}>
                  {SIDES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </label>
              <label>Label offset</label>
              <div className="me-row">
                {(['x', 'y'] as const).map((k) => (
                  <label key={k}>{k.toUpperCase()}<NumberField value={selStation.labelOffset?.[k] ?? 0}
                    onChange={(n) => commit((m) => setPoint(m, { kind: 'label', id: selStation.id }, { x: 0, y: 0, ...selStation.labelOffset, [k]: n }))} /></label>
                ))}
                <button className="me-reset" disabled={!selStation.labelOffset}
                  onClick={() => commit((m) => setPoint(m, { kind: 'label', id: selStation.id }, { x: 0, y: 0 }))}>Reset</button>
              </div>
              <label>Label tilt
                <div className="me-row me-font">
                  <input type="range" min={-90} max={90} value={selStation.labelAngle ?? 0}
                    onChange={(e) => setAngle(selStation.id, +e.target.value)} />
                  <NumberField min={-180} max={180} value={selStation.labelAngle ?? 0} onChange={(n) => setAngle(selStation.id, n)} />
                  <button className="me-reset" disabled={!selStation.labelAngle} onClick={() => setAngle(selStation.id, 0)}>Reset</button>
                </div>
              </label>
              <label>Font size
                <div className="me-row me-font">
                  <input type="range" min={8} max={48} value={labelSize(selStation)}
                    onChange={(e) => updateStation(selStation.id, { fontSize: +e.target.value })} />
                  <NumberField min={8} max={48} value={labelSize(selStation)} onChange={(fontSize) => updateStation(selStation.id, { fontSize })} />
                </div>
              </label>
              <div className="me-row">
                <button disabled={!selStation.fontSize} onClick={() => updateStation(selStation.id, { fontSize: undefined })}>
                  Default ({selStation.major ? MAJOR_LABEL_SIZE : LABEL_SIZE})
                </button>
                <button onClick={() => {
                  const { fontSize, major } = selStation;
                  commit((m) => ({ ...m, stations: m.stations.map((s) => (!!s.major === !!major ? { ...s, fontSize } : s)) }));
                  setStatus(`Applied to every ${major ? 'major' : 'regular'} station.`);
                }}>Apply to all {selStation.major ? 'major' : 'regular'}</button>
              </div>
              {(['interchange', 'major', 'exit'] as const).map((k) => (
                <label key={k} className="me-check">
                  <input type="checkbox" checked={!!selStation[k]} onChange={(e) => updateStation(selStation.id, { [k]: e.target.checked || undefined })} /> {k}
                </label>
              ))}
              <p className="me-muted">Lines: {stationLines(selStation.id).join(', ') || 'none'}</p>
              <button className="danger" onClick={deleteSel}>Delete station</button>
            </section>
          )}

          {selBend && sel?.kind === 'bend' && (
            <section>
              <h3>Bend point</h3>
              <div className="me-row">
                <label>X<NumberField value={selBend.x} onChange={(x) => commit((m) => setPoint(m, sel, { ...selBend, x }))} /></label>
                <label>Y<NumberField value={selBend.y} onChange={(y) => commit((m) => setPoint(m, sel, { ...selBend, y }))} /></label>
              </div>
              <button className="danger" onClick={deleteSel}>Delete point</button>
            </section>
          )}

          <section>
            <h3>Lines</h3>
            <ul className="me-lines">
              {map.lines.map((l, i) => (
                <li key={i}>
                  <button className={i === activeLine ? 'on' : ''} onClick={() => { setActiveLine(i); setActiveSeg(0); }}>
                    <span className="me-swatch" style={{ background: l.color }} /> {l.name}
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={addLine}>Add line</button>
          </section>

          {line && (
            <section>
              <h3>{line.name} line</h3>
              <div className="me-row">
                <label>Name<input value={line.name} onChange={(e) => updateLine({ name: e.target.value })} /></label>
                <label>Colour<input type="color" value={line.color} onChange={(e) => updateLine({ color: e.target.value })} /></label>
              </div>
              <label>Id<input key={line.id} defaultValue={line.id} onBlur={(e) => {
                const id = e.target.value.trim();
                if (id && id !== line.id) updateLine({ id });
              }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>
              <p className="me-muted">Rail art is picked by id (blue, purple, red, lime, orange, pink, green); other ids draw plain strokes.</p>
              {line.segments.map((seg, si) => (
                <div key={si} className={`me-seg ${si === activeSeg ? 'on' : ''}`}>
                  <button className="me-seg-head" onClick={() => setActiveSeg(si)}>Segment {si + 1} · {seg.length} points{si === activeSeg ? ' (drawing)' : ''}</button>
                  <div className="me-chips">
                    {seg.map((p, idx) => (
                      <span key={idx} className="me-chip">
                        {typeof p === 'string' ? (byId[p]?.name ?? `? ${p}`) : `· ${p.x},${p.y}`}
                        <button aria-label="Remove point" onClick={() => removePoint(activeLine, si, idx)}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="me-row">
                <button onClick={() => { updateLine({ segments: [...line.segments, []] }); setActiveSeg(line.segments.length); setMode('track'); }}>New segment</button>
                <button className="danger" disabled={!line.segments.length}
                  onClick={() => { updateLine({ segments: line.segments.filter((_, i) => i !== activeSeg) }); setActiveSeg(0); }}>Delete segment</button>
              </div>
              <button className="danger" onClick={() => {
                if (!confirm(`Delete the ${line.name} line?`)) return;
                commit((m) => ({ ...m, lines: m.lines.filter((_, i) => i !== activeLine) }));
                setActiveLine(0);
                setActiveSeg(0);
              }}>Delete line</button>
            </section>
          )}

          <section>
            <h3>Checks {warnings.length ? `(${warnings.length})` : '✓'}</h3>
            {warnings.length ? <ul className="me-warn">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="me-muted">No problems found.</p>}
          </section>

          <section className="me-muted me-help">
            <p><b>Select</b>: drag stations, labels or bend points, drag empty space to pan, wheel to zoom, arrows nudge the selection (Shift ×10), [ and ] tilt a label 5° (Shift 1°).</p>
            <p><b>Draw track</b>: click stations to extend the active segment; click empty space to add a bend point.</p>
            <p>Restore loads a file made with Download (or shared/map.ts) back in. The draft is kept in this browser until you Reset. Saving rewrites the map for new games only.</p>
          </section>
        </aside>
      </div>
      {status && <div className="toast" role="status" onClick={() => setStatus(null)}>{status}</div>}
    </div>
  );
}
