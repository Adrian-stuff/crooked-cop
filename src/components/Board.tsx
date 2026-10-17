import { memo, useMemo } from 'react';
import { LINES, MAP_HEIGHT, MAP_WIDTH, STATIONS, STATION_BY_ID, linesAt, lineName, type LabelSide } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';

const PAD = 50; // room for labels at the map edges

export type Mark = 'candidate' | 'path' | 'search' | 'arrest' | 'start';

interface Props {
  view: View | null;
  marks?: Record<string, Mark>;
  onStation?: (id: string) => void;
  showTrails?: boolean;
}

const LABEL_OFFSET: Record<LabelSide, [number, number, 'start' | 'middle' | 'end']> = {
  n: [0, -26, 'middle'],
  s: [0, 38, 'middle'],
  e: [26, 6, 'start'],
  w: [-26, 6, 'end'],
  ne: [20, -22, 'start'],
  nw: [-20, -22, 'end'],
  se: [20, 34, 'start'],
  sw: [-20, 34, 'end'],
};

function point(p: string | { x: number; y: number }) {
  return typeof p === 'string' ? STATION_BY_ID[p] : p;
}

const StaticMap = memo(function StaticMap() {
  return (
    <g>
      {LINES.map((line) =>
        line.segments.map((seg, i) => {
          const pts = seg.map(point).map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <g key={`${line.id}-${i}`}>
              <polyline points={pts} fill="none" stroke={line.color} strokeOpacity={0.28} strokeWidth={30} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={pts} fill="none" stroke={line.color} strokeWidth={15} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        }),
      )}
    </g>
  );
});

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function Pawn({ p, x, y, me }: { p: PublicPlayer; x: number; y: number; me: boolean }) {
  const heister = p.role === 'heister';
  const fill = heister ? 'var(--red)' : p.role === 'traitor' ? 'var(--green)' : 'var(--navy)';
  const faded = p.status === 'arrested' || p.status === 'exposed';
  return (
    <g transform={`translate(${x} ${y})`} opacity={faded ? 0.45 : 1} className="pawn">
      <rect x={-17} y={-17} width={34} height={34} transform="rotate(45)" fill={fill}
        stroke={me ? 'var(--gold)' : '#fff'} strokeWidth={me ? 5 : 3} rx={3} />
      <text y={6} textAnchor="middle" className="pawn-text">{heister ? p.label : initials(p.name)}</text>
      {p.status === 'arrested' && <path d="M-14 -14 L14 14 M14 -14 L-14 14" stroke="#fff" strokeWidth={4} />}
      <title>{`${p.name}${heister ? ` (${p.label})` : ''}${p.status !== 'active' ? ` · ${p.status}` : ''}`}</title>
    </g>
  );
}

export function Board({ view, marks = {}, onStation, showTrails }: Props) {
  const occupants = useMemo(() => {
    const by: Record<string, PublicPlayer[]> = {};
    for (const p of view?.players ?? []) {
      if (!p.station || p.role === 'spectator' || p.status === 'escaped') continue;
      (by[p.station] ??= []).push(p);
    }
    return by;
  }, [view?.players]);

  const trails = showTrails && view?.trails ? view.trails : null;

  return (
    <svg viewBox={`${-PAD} 0 ${MAP_WIDTH + PAD * 2} ${MAP_HEIGHT}`} className="board" role="img" aria-label="Transit map game board">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <rect x={-PAD} width={MAP_WIDTH + PAD * 2} height={MAP_HEIGHT} fill="var(--board)" />
      <image href="/assets/logo-diamond.png" x={660} y={240} width={600} height={600} opacity={0.05} preserveAspectRatio="xMidYMid meet" />
      <StaticMap />

      {trails && Object.entries(trails).map(([pid, steps]) => {
        const p = view!.players.find((x) => x.id === pid);
        const pts = steps.map((s) => `${STATION_BY_ID[s.station].x},${STATION_BY_ID[s.station].y}`).join(' ');
        return (
          <g key={pid} pointerEvents="none">
            <polyline points={pts} fill="none" stroke="#000" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            <polyline points={pts} fill="none" stroke={p?.label === 'H2' ? '#ffd23f' : '#ff4d4d'}
              strokeWidth={7} strokeDasharray="16 10" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}

      {STATIONS.map((st) => {
        const mark = marks[st.id];
        const [dx, dy, anchor] = LABEL_OFFSET[st.label];
        const clickable = !!onStation && !!mark;
        const occ = occupants[st.id]?.map((p) => p.name).join(', ');
        return (
          <g key={st.id} className={`station ${mark ? `mark-${mark}` : ''} ${clickable ? 'clickable' : ''}`}
            onClick={() => onStation && mark && onStation(st.id)}>
            {mark && <circle cx={st.x} cy={st.y} r={31} className="mark-ring" />}
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
            <text x={st.x + dx * (st.major ? 1.15 : 1)} y={st.y + dy} textAnchor={anchor}
              className={st.major ? 'st-label major' : 'st-label'}>{st.name.toUpperCase()}</text>
            <circle cx={st.x} cy={st.y} r={30} fill="transparent" />
            <title>{`${st.name} · ${linesAt(st.id).map(lineName).join(', ')} line${linesAt(st.id).length > 1 ? 's' : ''}${st.exit ? ' · EXIT STATION' : ''}${occ ? `\n${occ}` : ''}`}</title>
          </g>
        );
      })}

      {view?.artifacts && Object.entries(view.artifacts).map(([id, n]) => {
        const st = STATION_BY_ID[id];
        return (
          <g key={id} transform={`translate(${st.x + 18} ${st.y - 22})`} pointerEvents="none">
            <image href="/assets/artifact.png" x={-15} y={-15} width={30} height={30} />
            {n > 1 && <text x={14} y={-10} className="artifact-count">×{n}</text>}
          </g>
        );
      })}

      {Object.entries(occupants).map(([id, ps]) => {
        const st = STATION_BY_ID[id];
        return ps.map((p, i) => {
          const angle = ps.length === 1 ? -Math.PI / 4 : (i / ps.length) * Math.PI * 2 - Math.PI / 2;
          const r = ps.length === 1 ? 30 : 34;
          return <Pawn key={p.id} p={p} me={p.id === view?.me} x={st.x + Math.cos(angle) * r} y={st.y + Math.sin(angle) * r} />;
        });
      })}

      <rect x={-PAD} width={MAP_WIDTH + PAD * 2} height={MAP_HEIGHT} fill="url(#vignette)" pointerEvents="none" />
    </svg>
  );
}
