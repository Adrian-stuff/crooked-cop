import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EXIT_STATION, LINES, MAP_HEIGHT, MAP_WIDTH, STATIONS, STATION_BY_ID, linesAt, lineName, type LabelSide, searchArea } from '../../shared/map';
import type { PublicPlayer, RoundAction, View } from '../../shared/types';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText, type Identity } from '../game/identity';
import { BOARD_PAD as PAD } from '../game/geometry';
import { trackPoints } from '../game/route';
import { TokenShape } from './Token';


export type Mark = 'candidate' | 'path' | 'search' | 'arrest' | 'start';

interface Props {
  view: View | null;
  marks?: Record<string, Mark>;
  onStation?: (id: string) => void;
  showTrails?: boolean;
  showNames?: boolean;
  focus?: string | null; // player id to spotlight
  onFocus?: (id: string | null) => void;
  onPick?: (id: string | null) => void; // a station clicked outside any mode (null: empty board)
  selected?: string | null;
  swept?: string[]; // stations your Search covered this round
  lastSeen?: { station: string; round: number }[]; // Heisters your searches spotted recently
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

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface PawnProps {
  p: PublicPlayer;
  identity: Identity;
  x: number;
  y: number;
  station: string;
  me: boolean;
  onTurn: boolean;
  did?: RoundAction;
  focused: boolean;
  dimmed: boolean;
  showTag: boolean;
  clickable: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}

function Pawn({ p, identity, x, y, station, me, onTurn, did, focused, dimmed, showTag, clickable, onClick, onHover }: PawnProps) {
  const ref = useRef<SVGGElement>(null);
  const last = useRef<{ x: number; y: number; station: string } | null>(null);

  // Slide along the rails from where the pawn was to where it is now.
  useLayoutEffect(() => {
    const from = last.current;
    last.current = { x, y, station };
    const el = ref.current;
    if (!el || !from || (from.x === x && from.y === y) || reduceMotion()) return;
    const pts = from.station === station ? [from, { x, y }] : [from, ...trackPoints(from.station, station), { x, y }];
    const lens = pts.map((pt, i) => (i ? Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y) : 0));
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let run = 0;
    const frames = pts.map((pt, i) => {
      run += lens[i];
      return { transform: `translate(${pt.x}px, ${pt.y}px)`, offset: run / total };
    });
    const anim = el.animate(frames, { duration: Math.min(2400, Math.max(320, total * 2.2)), easing: 'cubic-bezier(.45,0,.25,1)' });
    el.classList.add('moving');
    anim.onfinish = anim.oncancel = () => el.classList.remove('moving');
    return () => anim.cancel();
  }, [x, y, station]);

  const heister = p.role === 'heister';
  const name = p.name.length > 11 ? `${p.name.slice(0, 10)}…` : p.name;
  const tagW = name.length * 10.5 + 24;
  return (
    <g ref={ref} style={{ transform: `translate(${x}px, ${y}px)` }}
      className={`pawn ${me ? 'me' : ''} ${onTurn ? 'on-turn' : ''} ${focused ? 'focused' : ''} ${dimmed ? 'dim' : ''} ${p.status} ${clickable ? 'clickable' : ''}`}
      onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)} onClick={onClick}>
      <g className="pawn-body">
        <g transform="scale(1.2)">
          {onTurn && <circle r={46} className="turn-ring" />}
          {me && <circle r={42} className="me-halo" />}
          <TokenShape role={p.role} identity={identity} text={tokenText(p)} />
          {heister && p.carried !== null && p.carried > 0 && (
            <g transform="translate(26 -26)" className="carry-badge">
              <circle r={13} fill="var(--gold)" stroke="#0b0d11" strokeWidth={3} />
              <text y={6} textAnchor="middle" key={p.carried}>{p.carried}</text>
            </g>
          )}
          {did && (
            <g transform="translate(26 26)" className={`done-badge ${did.kind} ${did.ok === false ? 'failed' : did.ok ? 'caught' : ''}`}>
              <circle r={12} />
              <text y={5} textAnchor="middle">{DID_GLYPH[did.kind]}</text>
              <title>{DID_TEXT[did.kind]}</title>
            </g>
          )}
          {(p.afk || !p.connected) && p.status === 'active' && (
            <g transform="translate(-26 -26)" className="afk-badge">
              <rect x={-20} y={-11} width={40} height={22} rx={11} />
              <text y={6} textAnchor="middle">{p.connected ? 'AFK' : 'OFF'}</text>
            </g>
          )}
          {p.status === 'arrested' && (
            <g className="cuffs">
              <circle r={34} className="burst" />
              <path d="M-20 -20 L20 20 M20 -20 L-20 20" stroke="#0b0d11" strokeWidth={11} strokeLinecap="round" />
              <path d="M-20 -20 L20 20 M20 -20 L-20 20" stroke="#ff4d4d" strokeWidth={6} strokeLinecap="round" />
            </g>
          )}
        </g>
      </g>
      {(showTag || focused) && (
        <g className="pawn-tag">
          <rect x={-tagW / 2} y={46} width={tagW} height={28} rx={14} stroke={identity.color} />
          <text y={66} textAnchor="middle" className={me ? 'mine' : ''}>{name}</text>
        </g>
      )}
      <title>{`${p.name} · ${identity.name}${heister ? ` · ${p.label} Heister` : ''}${p.status !== 'active' ? ` · ${p.status}` : ''}${p.afk ? ' · AFK' : ''}${p.connected ? '' : ' · offline'}`}</title>
    </g>
  );
}

const DID_GLYPH: Record<RoundAction['kind'], string> = { move: '→', search: 'S', arrest: '!', pass: '–' };
const DID_TEXT: Record<RoundAction['kind'], string> = { move: 'Moved this round', search: 'Searched this round', arrest: 'Tried an arrest this round', pass: 'Passed this round' };

// What happened on the map this round: teammates' sweeps, failed arrests, and Heisters you've spotted.
function RoundMarks({ view, lastSeen }: { view: View; lastSeen: { station: string; round: number }[] }) {
  const live = view.phase === 'police' || view.phase === 'info';
  const sweeps = live ? view.roundActions.filter((a) => a.kind === 'search' && a.by !== view.me) : [];
  const swept = new Set(sweeps.flatMap((a) => searchArea(a.station)));
  const failed = live ? view.roundActions.filter((a) => a.kind === 'arrest' && a.ok === false) : [];
  return (
    <g pointerEvents="none">
      {[...swept].map((id) => {
        const st = STATION_BY_ID[id];
        return <circle key={`sw-${id}`} cx={st.x} cy={st.y} r={26} className="team-sweep" />;
      })}
      {failed.map((a) => {
        const st = STATION_BY_ID[a.station];
        return (
          <g key={`fa-${a.by}`} transform={`translate(${st.x} ${st.y})`} className="failed-arrest">
            <path d="M-16 -16 L16 16 M16 -16 L-16 16" />
            <title>An arrest failed here this round</title>
          </g>
        );
      })}
      {lastSeen.map(({ station, round }) => {
        const st = STATION_BY_ID[station];
        const age = view.round - round;
        return (
          <g key={`ls-${station}`} transform={`translate(${st.x + 38} ${st.y - 34})`} className="last-seen" opacity={age <= 0 ? 1 : age === 1 ? 0.7 : 0.45}>
            <rect x={-40} y={-14} width={80} height={26} rx={13} />
            <text y={5} textAnchor="middle">Seen R{round}</text>
            <title>{`Your search spotted a Heister here in round ${round}`}</title>
          </g>
        );
      })}
    </g>
  );
}

// The Crooked Cop's last tip-off, drawn in red where each hidden Heister was at that moment.
function TipoffLayer({ view, shown }: { view: View; shown: Set<string> }) {
  if (!view.tipoff) return null;
  return (
    <g pointerEvents="none">
      {Object.entries(view.tipoff.at).map(([hid, station]) => {
        const h = view.players.find((p) => p.id === hid);
        if (!station || !h || shown.has(hid)) return null;
        const st = STATION_BY_ID[station];
        return (
          <g key={`${hid}-${view.tipoff!.round}-${station}`} className="tipoff" transform={`translate(${st.x - 40} ${st.y + 34})`}>
            <path d="M0 -30 L30 0 L0 30 L-30 0 Z" className="tipoff-diamond" />
            <text y={8} textAnchor="middle" className="tipoff-label">{h.label}</text>
            <g transform="translate(0 46)">
              <rect x={-38} y={-13} width={76} height={24} rx={12} className="tipoff-tag" />
              <text y={5} textAnchor="middle" className="tipoff-tag-text">Tip R{view.tipoff!.round}</text>
            </g>
            <title>{`${h.label} (${h.name}) was here at your tip-off in round ${view.tipoff!.round}`}</title>
          </g>
        );
      })}
    </g>
  );
}

// Artifacts pop in, and fly off with a glint when a Heister picks them up.
function ArtifactLayer({ artifacts }: { artifacts: Record<string, number> | null }) {
  const prev = useRef(artifacts);
  const [gone, setGone] = useState<{ id: string; key: number }[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = artifacts;
    if (!before || !artifacts) return;
    const lost = Object.keys(before).filter((id) => (artifacts[id] ?? 0) < before[id]).map((id) => ({ id, key: Math.random() }));
    if (!lost.length) return;
    setGone((g) => [...g, ...lost]);
    setTimeout(() => setGone((g) => g.filter((x) => !lost.includes(x))), 1000);
  }, [artifacts]);

  return (
    <g pointerEvents="none">
      {artifacts && Object.entries(artifacts).map(([id, n]) => {
        const st = STATION_BY_ID[id];
        return (
          <g key={id} transform={`translate(${st.x + 18} ${st.y - 22})`}>
            <g className="artifact">
              <image href="/assets/artifact.png" x={-15} y={-15} width={30} height={30} />
              {n > 1 && <text key={n} x={14} y={-10} className="artifact-count">×{n}</text>}
            </g>
          </g>
        );
      })}
      {gone.map(({ id, key }) => {
        const st = STATION_BY_ID[id];
        return (
          <g key={key} transform={`translate(${st.x + 18} ${st.y - 22})`}>
            <circle r={18} className="artifact-glint" />
            <image href="/assets/artifact.png" x={-15} y={-15} width={30} height={30} className="artifact-gone" />
          </g>
        );
      })}
    </g>
  );
}

export function Board({ view, marks = {}, onStation, showTrails, showNames = true, focus = null, onFocus, onPick, selected = null, swept = [], lastSeen = [] }: Props) {
  const ids = useMemo(() => seatIdentities(view?.players ?? []), [view?.players]);
  const exits = view?.exits ?? [EXIT_STATION];

  // Pawns in player order (yours last, so it draws on top), fanned out around shared stations.
  const pawns = useMemo(() => {
    const shown = (view?.players ?? []).filter((p) => p.station && p.role !== 'spectator' && p.status !== 'escaped');
    const crowd: Record<string, PublicPlayer[]> = {};
    for (const p of shown) (crowd[p.station!] ??= []).push(p);
    const list = shown.map((p) => {
      const here = crowd[p.station!];
      const n = here.length;
      const i = here.indexOf(p);
      const angle = n === 1 ? -Math.PI / 4 : (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = n === 1 ? 46 : Math.max(54, n * 13);
      const st = STATION_BY_ID[p.station!];
      return { p, station: p.station!, crowded: n > 1, x: Math.round(st.x + Math.cos(angle) * r), y: Math.round(st.y + Math.sin(angle) * r) };
    });
    return [...list.filter((d) => d.p.id !== view?.me), ...list.filter((d) => d.p.id === view?.me)];
  }, [view?.players, view?.me]);

  const occupants = useMemo(() => {
    const by: Record<string, string[]> = {};
    for (const { p, station } of pawns) (by[station] ??= []).push(p.name);
    return by;
  }, [pawns]);

  const trails = showTrails && view?.trails ? view.trails : null;
  // Only spotlight someone the viewer can actually see on the map.
  const spot = focus && (pawns.some((d) => d.p.id === focus) || trails?.[focus]) ? focus : null;
  const hover = (id: string | null) => onFocus?.(id);

  return (
    <svg viewBox={`${-PAD} 0 ${MAP_WIDTH + PAD * 2} ${MAP_HEIGHT}`} className="board" role="img" aria-label="Transit map game board">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <rect x={-PAD} width={MAP_WIDTH + PAD * 2} height={MAP_HEIGHT} fill="var(--board)" onClick={() => onPick?.(null)} />
      <image href="/assets/logo-crooked-cop.png" x={690} y={250} width={580} height={580} opacity={0.07} preserveAspectRatio="xMidYMid meet" />
      <StaticMap />

      {trails && Object.entries(trails).map(([pid, steps]) => {
        const pts = steps.map((s) => `${STATION_BY_ID[s.station].x},${STATION_BY_ID[s.station].y}`).join(' ');
        const dim = spot && spot !== pid;
        return (
          <g key={pid} pointerEvents="none" className="trail" opacity={dim ? 0.25 : 1}>
            <polyline points={pts} fill="none" stroke="#000" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
            <polyline points={pts} fill="none" stroke={(ids[pid] ?? SPECTATOR_IDENTITY).color} className="trail-dash"
              strokeWidth={7} strokeDasharray="16 10" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}

      {STATIONS.map((st) => {
        const mark = marks[st.id];
        const [dx, dy, anchor] = LABEL_OFFSET[st.label];
        const clickable = (!!onStation && !!mark) || !!onPick;
        const occ = occupants[st.id]?.join(', ');
        return (
          <g key={st.id} className={`station ${mark ? `mark-${mark}` : ''} ${clickable ? 'clickable' : ''}`}
            onClick={() => (mark ? onStation?.(st.id) : onPick?.(st.id))}>
            {mark && <circle key={mark} cx={st.x} cy={st.y} r={31} className="mark-ring" />}
            {selected === st.id && <circle cx={st.x} cy={st.y} r={36} className="selected-ring" />}
            {swept.includes(st.id) && <circle cx={st.x} cy={st.y} r={28} className="swept-ring" />}
            {exits.includes(st.id) && <circle cx={st.x} cy={st.y} r={30} fill="none" stroke="#f7e11b" strokeWidth={8} className="exit-ring" />}
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
            <title>{`${st.name} · ${linesAt(st.id).map(lineName).join(', ')} line${linesAt(st.id).length > 1 ? 's' : ''}${exits.includes(st.id) ? ' · EXIT STATION' : ''}${occ ? `\n${occ}` : ''}`}</title>
          </g>
        );
      })}

      {view && <RoundMarks view={view} lastSeen={lastSeen} />}
      <ArtifactLayer artifacts={view?.artifacts ?? null} />
      {view && <TipoffLayer view={view} shown={new Set(pawns.map((d) => d.p.id))} />}

      {pawns.map(({ p, station, crowded, x, y }) => (
        <Pawn key={p.id} p={p} identity={ids[p.id] ?? SPECTATOR_IDENTITY} x={x} y={y} station={station}
          me={p.id === view?.me} onTurn={view?.phase === 'police' && view.policeTurn === p.id}
          did={view && (view.phase === 'police' || view.phase === 'info') ? view.roundActions.find((a) => a.by === p.id) : undefined} focused={spot === p.id} dimmed={!!spot && spot !== p.id}
          showTag={showNames && !crowded} clickable={(!!onStation && !!marks[station]) || !!onPick}
          onClick={() => (marks[station] ? onStation?.(station) : onPick?.(station))} onHover={hover} />
      ))}

      <rect x={-PAD} width={MAP_WIDTH + PAD * 2} height={MAP_HEIGHT} fill="url(#vignette)" pointerEvents="none" />
    </svg>
  );
}
