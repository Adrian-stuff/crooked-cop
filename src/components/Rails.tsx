import type { Line } from '../../shared/map';

type Pt = { x: number; y: number };

// Lines with generated rail art in public/assets/board/rails (scripts/gen-board-assets.py).
// Any other line, e.g. one just made in the map editor, falls back to plain strokes.
const RAIL_ART = new Set(['blue', 'purple', 'red', 'lime', 'orange', 'pink', 'green']);

// Rail PNG cross-section in board units: 32 tall, 30u glow band around a 15u core.
const H = 32;
const CAP = 16;
const CORE = 15 / 2;
const SEAM = 0.5; // caps tuck this far under the rail so no hairline shows

const railSrc = (id: string) => `/assets/board/rails/rail-${id}.png`;
const endSrc = (id: string) => `/assets/board/rails/rail-end-${id}.png`;

function pieces(line: Line, point: (p: string | Pt) => Pt | undefined) {
  const out: { a: Pt; len: number; deg: number }[] = [];
  for (const seg of line.segments) {
    const pts = seg.map(point).filter((p): p is Pt => !!p);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0) out.push({ a, len, deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
    }
  }
  return out;
}

// One straight rail between two points, rounded at both ends. Each piece carries its own caps,
// so a bend is filled by the caps of the two pieces meeting there.
function Piece({ id, a, len, deg, core }: { id: string; a: Pt; len: number; deg: number; core?: boolean }) {
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${deg})`}>
      <image href={railSrc(id)} x={0} y={-H / 2} width={len} height={H} preserveAspectRatio="none"
        clipPath={core ? 'url(#rail-core)' : undefined} />
      <image href={endSrc(id)} x={len - SEAM} y={-H / 2} width={CAP} height={H}
        clipPath={core ? 'url(#rail-end-core)' : undefined} />
      <image href={endSrc(id)} x={-SEAM} y={-H / 2} width={CAP} height={H} transform="rotate(180)"
        clipPath={core ? 'url(#rail-end-core)' : undefined} />
    </g>
  );
}

// Draws every line from the rail PNGs: all glow first, then all cores (the same images clipped to
// the core band), so a crossing line's glow never covers another line's core.
export function Rails({ lines, point }: { lines: Line[]; point: (p: string | Pt) => Pt | undefined }) {
  const art = lines.filter((l) => RAIL_ART.has(l.id)).map((l) => ({ id: l.id, pieces: pieces(l, point) }));
  const plain = lines.filter((l) => !RAIL_ART.has(l.id));
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id="rail-core" clipPathUnits="objectBoundingBox">
          <rect x={0} y={0.5 - CORE / H} width={1} height={(CORE * 2) / H} />
        </clipPath>
        <clipPath id="rail-end-core" clipPathUnits="objectBoundingBox">
          <ellipse cx={0} cy={0.5} rx={CORE / CAP} ry={CORE / H} />
        </clipPath>
      </defs>
      {plain.map((line) =>
        line.segments.map((seg, i) => {
          const pts = seg.map(point).filter((p): p is Pt => !!p).map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <g key={`${line.id}-${i}`}>
              <polyline points={pts} fill="none" stroke={line.color} strokeOpacity={0.28} strokeWidth={30} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={pts} fill="none" stroke={line.color} strokeWidth={15} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        }),
      )}
      {art.map(({ id, pieces }) => pieces.map((p, i) => <Piece key={`g-${id}-${i}`} id={id} {...p} />))}
      {art.map(({ id, pieces }) => pieces.map((p, i) => <Piece key={`c-${id}-${i}`} id={id} {...p} core />))}
    </g>
  );
}
