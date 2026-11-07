import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, View } from '../../shared/types';
import { ActionDock, RoundRecap } from '../components/ActionDock';
import { Board } from '../components/Board';
import { BoardLegend } from '../components/BoardLegend';
import { BoardPanZoom } from '../components/BoardPanZoom';
import { Envelopes } from '../components/Envelopes';
import { Log, PlayerList, useCountdown } from '../components/Panels';
import { StationPopover } from '../components/StationPopover';
import { ElapsedChip } from '../components/GameClock';
import { StatusStrip } from '../components/StatusStrip';
import { TokenIcon } from '../components/Token';
import { useEnvelopeHighlight } from '../game/envelopeHighlight';
import { useFullscreen } from '../game/useFullscreen';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText, type Identity } from '../game/identity';
import { marksFor, type Mode } from '../game/selection';
import { useTableDevice } from '../net/tableLink';
import '../table.css';
import { useTimeWarning } from '../game/sound';

const PHASE_NAME: Record<string, string> = {
  lobby: 'Getting ready', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// How long an officer's envelopes stay up after their action before the next officer's turn opens.
// This is the window for reading the result and passing the device on; the officer can also skip it.
const REVEAL_SECONDS = 10;

// One shared device for the whole Police team, passed from officer to officer. It moves along on its
// own: each officer's turn opens as soon as it starts, and every turn ends on the same timed private
// envelope screen, even when there is nothing in it, so nobody watching can tell the Crooked Cop's
// tip-off from an honest officer's empty hand.
type Stage =
  | { kind: 'idle' }
  | { kind: 'turn'; id: string; seen: string[] } // choosing an action; `seen` = envelopes they had before it
  | { kind: 'reveal'; id: string; seen: string[] }; // their new envelope, privately

export function CopsScreen({ code }: { code: string }) {
  const { sync, offset, online, facilitator, act } = useTableDevice(code, 'cops');
  const base = sync?.display;
  const turnId = base?.phase === 'police' ? base.policeTurn : null;
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  // Timer warnings only: the music plays from the facilitator's screen and the table display.
  useTimeWarning(base?.phase ?? 'lobby', useCountdown(base?.deadline ?? null, offset), sync?.paused != null);

  // The officer whose turn it is, or idle between turns.
  const next = (): Stage => (turnId ? { kind: 'turn', id: turnId, seen: sync?.cops[turnId]?.envelopes.map((e) => e.id) ?? [] } : { kind: 'idle' });

  // Follow the game: a new officer is up, or the current one's time ran out
  // (or the facilitator recorded their move) while they were choosing.
  useEffect(() => {
    setStage((st) => {
      if (st.kind === 'turn' && st.id !== turnId) return { kind: 'reveal', id: st.id, seen: st.seen };
      if (st.kind === 'reveal') return st;
      return st.kind === 'turn' && st.id === turnId ? st : next();
    });
    // next() reads the latest sync; only a change of turn should move the device along.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId, base?.round]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  if (!sync || !base) {
    return (
      <div className="splash device-wait">
        <div>Cops device · {code}</div>
        <p className="muted">{online ? "Waiting for the facilitator's device…" : 'Connecting…'}</p>
      </div>
    );
  }

  const viewOf = (id: string | null) => (id ? sync.cops[id] ?? null : null);
  const ids = seatIdentities(base.players);

  let body;
  if (stage.kind === 'turn' && viewOf(stage.id)) {
    const id = stage.id;
    // Earlier envelopes stay sealed: the turn only sees what it receives itself (e.g. an Ultimate scan).
    const v = viewOf(id)!;
    const turnView = { ...v, envelopes: v.envelopes.filter((e) => !stage.seen.includes(e.id)) };
    body = (
      <TurnStage view={turnView} offset={offset} ids={ids} paused={sync.paused}
        act={async (a) => {
          const problem = await act(id, a);
          if (problem) setError(problem);
          // The Ultimate and Sabotage are free: the officer stays on their turn.
          else if (a.type !== 'ultimate' && a.type !== 'sabotage') setStage({ kind: 'reveal', id, seen: stage.seen });
        }} />
    );
  } else if (stage.kind === 'reveal' && viewOf(stage.id)) {
    body = <RevealStage view={viewOf(stage.id)!} seen={stage.seen} ids={ids} onDone={() => setStage(next())} />;
  } else {
    body = <Idle key={base.phase} base={base} offset={offset} paused={sync.paused} />;
  }

  return (
    <div className="app cops-screen">
      <header className="topbar">
        <div className="brand">
          <img src="/assets/brand/logo-crooked-cop-128.png" alt="" width={36} height={36} />
          <span>Cops device</span>
        </div>
        <span className="muted small">Room {code}</span>
        <button className="btn ghost small leave" onClick={() => { location.search = ''; }}>Leave</button>
      </header>
      {(!online || !facilitator) && (
        <div className="device-banner">{online ? "The facilitator's device is offline. Actions will work again when it's back." : 'Reconnecting…'}</div>
      )}
      {body}
      {error && <div className="toast" role="alert" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function Countdown({ view, offset, paused }: { view: View; offset: number; paused: number | null }) {
  const secs = useCountdown(view.deadline, offset);
  if (paused !== null) return <span className="cops-clock paused">{clock(Math.ceil(paused / 1000))} · paused</span>;
  return secs === null ? null : <span className={`cops-clock ${secs <= 10 ? 'urgent' : ''}`}>{clock(secs)}</span>;
}

function TurnStage({ view, offset, ids, paused, act }: {
  view: View; offset: number; ids: Record<string, Identity>; paused: number | null; act: (a: Action) => Promise<void>;
}) {
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen(boardWrapRef);
  const [mode, setMode] = useState<Mode>(null);
  const [path, setPath] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const { highlight, onHighlight, swept, lastSeen } = useEnvelopeHighlight(view);
  const marks = useMemo(() => (mode ? marksFor(view, mode, path) : {}), [view, mode, path]);
  const me = view.players.find((p) => p.id === view.me)!;
  const send = (a: Action) => {
    if (busy) return;
    setBusy(true);
    act(a).finally(() => setBusy(false));
  };

  const onStation = (id: string) => {
    if (mode === 'move' || mode === 'express') {
      if (path.at(-1) === id) setPath(path.slice(0, -1));
      else if (marks[id] === 'candidate') setPath([...path, id]);
    } else if (mode === 'search' || mode === 'arrest') {
      send({ type: mode, station: id });
      setMode(null);
    }
  };

  const currentStation = me?.station ?? null;
  const currentTargetName = me?.name;

  // Laid out like the online game: board and actions, with your own envelopes beside them.
  return (
    <main className="game cops-turn">
      <div className="board-col">
        <div ref={boardWrapRef} className={`board-wrap ${fullscreen ? 'is-fullscreen' : ''}`}>
          <StatusStrip view={view} offset={offset} ids={ids} />
          {paused !== null && <div className="device-banner">Timer paused by the facilitator</div>}
          <BoardPanZoom
            activeStation={currentStation}
            activePlayerName={currentTargetName}
            controls={
              <button
                type="button"
                className={`board-fs-btn ${fullscreen ? 'is-fs' : ''}`}
                onClick={toggleFullscreen}
                title={fullscreen ? 'Exit fullscreen map (Esc)' : 'Expand map fullscreen'}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Expand map fullscreen'}
              >
                {fullscreen ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    </svg>
                    <span>Exit</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                    <span>Fullscreen</span>
                  </>
                )}
              </button>
            }
          >
            <div className="board-stage">
              <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails} showNames={showNames}
                focus={focus} onFocus={setFocus} selected={picked} swept={swept} lastSeen={lastSeen}
                onPick={(id) => setPicked(mode || id === picked ? null : id)} />
              {picked && !mode && <StationPopover view={view} station={picked} ids={ids} act={send} onClose={() => setPicked(null)} />}
            </div>
          </BoardPanZoom>
          <BoardLegend view={view} showNames={showNames} setShowNames={setShowNames} showTrails={showTrails} setShowTrails={setShowTrails}
            fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
        </div>
        <div className={busy ? 'cops-busy' : ''} aria-busy={busy}>
          <ActionDock view={view} mode={mode} path={path} setMode={(m) => { setPicked(null); setMode(m); }} setPath={setPath} act={send} />
        </div>
        <div className="below-board">
          <PlayerList view={{ ...view, players: view.players.filter((p) => p.role !== 'spectator') }} ids={ids} focus={focus} setFocus={setFocus} />
          <Log view={view} />
        </div>
      </div>
      <aside className="side-col">
        <section className="panel cops-whoami">
          <TokenIcon role={me.role} identity={ids[me.id] ?? SPECTATOR_IDENTITY} text={tokenText(me)} size={40} />
          <span className="cops-whoami-text">
            <strong>{me.name}</strong>
            <small>Private · only {me.name} looks</small>
          </span>
        </section>
        <Envelopes view={view} ids={ids} highlight={highlight} onHighlight={onHighlight} />
      </aside>
    </main>
  );
}

function RevealStage({ view, seen, ids, onDone }: { view: View; seen: string[]; ids: Record<string, Identity>; onDone: () => void }) {
  const me = view.players.find((p) => p.id === view.me)!;
  // Wait until the facilitator's device confirms the turn is over: that's when a tip-off is written.
  const settled = me.done || view.policeTurn !== view.me || view.phase !== 'police';
  const fresh = view.envelopes.filter((e) => !seen.includes(e.id)).map((e) => e.id);
  const { highlight, onHighlight } = useEnvelopeHighlight(view);
  const left = usePassCountdown(settled, onDone);
  return (
    <main className="cops-reveal no-map">
      <section className="cops-card compact">
        <span className="pt-round">Private · only {me.name} looks</span>
        <h1>{me.name}'s envelopes</h1>
        {!settled ? <p className="muted">Sealing the envelope…</p> : (
          <>
            {fresh.length === 0 && (
              <article className="envelope open cops-empty">
                <p><strong>No new envelope this turn.</strong></p>
                <p className="muted small">Moves, arrests and passes don't come with one. Every officer sees this screen after their turn, so nobody can tell who got what.</p>
              </article>
            )}
            {/* Only this turn's envelope (the latest search, or a tip-off), not the whole history. */}
            {fresh.length > 0 && (
              <Envelopes view={{ ...view, envelopes: view.envelopes.filter((e) => fresh.includes(e.id)) }} ids={ids}
                highlight={highlight} onHighlight={onHighlight} fresh={fresh} />
            )}
          </>
        )}
        {settled && (
          <div className="cops-pass" role="timer" aria-live="polite">
            <span>Hiding in {left}s.</span>
            <button className="btn primary" onClick={onDone}>Pass the device on.</button>
          </div>
        )}
      </section>
    </main>
  );
}

// Counts down once the envelope is sealed, then hides it and moves the device along on its own.
function usePassCountdown(settled: boolean, onDone: () => void) {
  const [left, setLeft] = useState(REVEAL_SECONDS);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!settled) return;
    const end = Date.now() + REVEAL_SECONDS * 1000;
    const id = setInterval(() => {
      const secs = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(secs);
      if (secs === 0) {
        clearInterval(id);
        done.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [settled]);
  return left;
}

function Idle({ base, offset, paused }: { base: View; offset: number; paused: number | null }) {
  const waitText: Record<string, string> = {
    lobby: 'The facilitator is seating players.',
    setup: 'Officers choose their starting stations with the facilitator.',
    heister: 'The Heisters are moving. Your turns come next.',
    police: 'Officers go one at a time.',
    info: 'Compare notes out loud. Any officer may call a vote through the facilitator.',
    ended: base.endReason ?? '',
  };
  // The Information Phase always takes over the whole screen so the table can read it while comparing
  // notes. Every other phase's card enlarges to full screen when clicked, and shrinks on a second click.
  // Keyed by phase, so each new phase starts at normal size.
  const [enlarged, setEnlarged] = useState(false);
  const toggleable = base.phase !== 'info';
  const toggle = () => toggleable && setEnlarged((e) => !e);
  return (
    <main className={`cops-card${base.phase === 'info' || enlarged ? ' cops-full' : ''}${toggleable ? ' cops-toggle' : ''}`}
      {...(toggleable && {
        role: 'button', tabIndex: 0, 'aria-pressed': enlarged, title: enlarged ? 'Click to shrink' : 'Click to enlarge',
        onClick: toggle,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()),
      })}>
      <span className="pt-round">
        {base.phase === 'lobby' ? 'Facilitator mode' : `Round ${base.round} of ${base.settings.maxRounds}`}
        {base.phase !== 'lobby' && <> · <ElapsedChip view={base} offset={offset} className="pt-elapsed" /></>}
      </span>
      <h1>{base.phase === 'ended' ? (base.winner === 'heisters' ? 'The Heisters got away' : 'Case closed') : PHASE_NAME[base.phase]}</h1>
      <Countdown view={base} offset={offset} paused={paused} />
      <p className="muted">{waitText[base.phase]}</p>
      {base.phase === 'info' && <div className="dock-recap cops-recap"><RoundRecap view={base} /></div>}
      {toggleable && <span className="cops-toggle-hint">{enlarged ? 'Tap to shrink' : 'Tap to enlarge'}</span>}
    </main>
  );
}
