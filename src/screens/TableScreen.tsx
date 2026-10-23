import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { escapeTarget } from '../../shared/engine';
import { STATIONS } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';
import { ActionDock, Card, Dock, RoundRecap, VoteTally } from '../components/ActionDock';
import { Board, type Mark } from '../components/Board';
import { BoardPanZoom } from '../components/BoardPanZoom';
import { Envelopes } from '../components/Envelopes';
import { Log, PhaseBanner, PlayerList, RevealCard, useCountdown } from '../components/Panels';
import { StationPopover } from '../components/StationPopover';
import { StatusStrip } from '../components/StatusStrip';
import { TokenIcon } from '../components/Token';
import { useEnvelopeHighlight } from '../game/envelopeHighlight';
import { useFullscreen } from '../game/useFullscreen';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText, type Identity } from '../game/identity';
import { actsThisPhase, marksFor, type Mode } from '../game/selection';
import { deviceUrl, useFacilitatorLink, type DeviceKind, type FacilitatorLink } from '../net/tableLink';
import { downloadRecord, useTableGame, type TableGame } from '../net/useTableGame';
import { TableLobby } from './TableLobby';
import '../table.css';

const PHASE_NAME: Record<string, string> = {
  lobby: 'Lobby', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

export const isOfficer = (role: string) => role === 'police' || role === 'traitor';
const clock = (ms: number) => {
  const secs = Math.ceil(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

export function setupOrder(a: PublicPlayer, b: PublicPlayer): number {
  const aOfficer = isOfficer(a.role);
  const bOfficer = isOfficer(b.role);
  if (aOfficer && !bOfficer) return -1;
  if (!aOfficer && bOfficer) return 1;
  return 0;
}

export function TableApp({ onExit }: { onExit: () => void }) {
  const table = useTableGame();
  const link = useFacilitatorLink(table);
  const { error, clearError } = table;

  useEffect(() => {
    if (!table.save) onExit();
  }, [table.save, onExit]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  if (!table.view) return null;
  return (
    <>
      {table.view.phase === 'lobby'
        ? <TableLobby table={table} view={table.view} link={link} />
        : <TableScreen table={table} view={table.view} link={link} />}
      {error && <div className="toast" role="alert" onClick={clearError}>{error}</div>}
    </>
  );
}

export function TableTopBar({ table }: { table: TableGame }) {
  const playing = table.view?.phase !== 'lobby';
  const end = () => {
    const msg = playing
      ? 'End this game? Its log and clues are deleted from this device. Use "Export record" first to keep them.'
      : 'Leave facilitator mode?';
    if (confirm(msg)) table.endSession();
  };
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/assets/logo-crooked-cop-128.png" alt="" width={36} height={36} />
        <span>The Crooked Cop</span>
      </div>
      <span className="tag gold">Facilitator mode</span>
      <div className="table-top-actions">
        {playing && (
          <>
            <button className="btn ghost small" disabled={!table.canUndo} onClick={table.undo} title="Take back the last thing you recorded">Undo</button>
            <button className="btn ghost small" onClick={() => table.save && downloadRecord(table.save.state)}>Export record</button>
          </>
        )}
        <button className="btn ghost small" onClick={end}>{playing ? 'End game' : 'Exit'}</button>
      </div>
    </header>
  );
}

// Pause, add time, and a big public timer to turn towards the table. Whose move is being recorded
// sits in the same row, above the map, so the floating dock covers no more of the map than online.
function TimerBar({ table, view, onShow, children }: { table: TableGame; view: View; onShow: () => void; children?: ReactNode }) {
  const running = view.deadline !== null;
  const paused = table.paused;
  if (view.phase === 'ended') return null;
  return (
    <div className="table-bar">
      {paused !== null && <span className="chip warn">Timer paused · {clock(paused)} left</span>}
      {paused !== null
        ? <button className="btn primary small" onClick={table.resume}>Resume timer</button>
        : <button className="btn small" disabled={!running} onClick={table.pause}>Pause timer</button>}
      <button className="btn ghost small" disabled={!running && paused === null} onClick={() => table.addTime(30)}>+30s</button>
      <button className="btn ghost small" disabled={!running && paused === null} onClick={() => table.addTime(60)}>+1 min</button>
      {children}
      <button className="btn ghost small table-show" onClick={onShow} title="Show the table a full-screen timer with nothing secret on it">Table timer</button>
    </div>
  );
}

// Safe to show the players: phase, time, round and public totals only.
function PublicTimer({ table, view, onClose }: { table: TableGame; view: View; onClose: () => void }) {
  const secs = useCountdown(view.deadline, 0);
  const shown = table.paused !== null ? clock(table.paused) : secs === null ? '' : clock(secs * 1000);
  const up = view.phase === 'police' ? view.players.find((p) => p.id === view.policeTurn) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`public-timer phase-bg-${view.phase}`} onClick={onClose} role="dialog" aria-label="Table timer">
      <div className="pt-round">Round {Math.max(view.round, 0)} of {view.settings.maxRounds}</div>
      <div className="pt-phase">{PHASE_NAME[view.phase]}</div>
      {up && <div className="pt-up">{up.name}'s turn</div>}
      <div className={`pt-clock ${table.paused !== null ? 'paused' : secs !== null && secs <= 10 ? 'urgent' : ''}`}>{shown || '—'}</div>
      {table.paused !== null && <div className="pt-note">Paused</div>}
      {view.phase !== 'setup' && (
        <div className="pt-taken">
          <img src="/assets/artifact.png" alt="" width={28} height={28} />
          {view.announcedTaken} of {view.settings.artifactCount} Artifacts taken · escape needs {escapeTarget(view.settings)}
        </div>
      )}
      <div className="pt-hint">Tap anywhere to go back</div>
    </div>
  );
}

// Whose move is being recorded. In setup officers are placed first, then heisters.
// In the Heister Phase the facilitator can pick the order; officers always go in seat order.
function Recorder({ view, waiting, actor, ids, onPick }: { view: View; waiting: PublicPlayer[]; actor: string | null; ids: Record<string, Identity>; onPick: (id: string) => void }) {
  if (!waiting.length || view.phase === 'info' || view.phase === 'ended') return null;
  const hasWaitingOfficer = view.phase === 'setup' && waiting.some((p) => isOfficer(p.role));
  const choosable = view.phase === 'setup' || view.phase === 'heister';
  const roleName = (p: PublicPlayer) => (p.role === 'heister' ? `${p.label} Heister` : p.role === 'traitor' ? 'Crooked Cop' : 'Officer');
  return (
    <div className="recorder" role="group" aria-label="Recording for">
      <span className="recorder-label">Recording for</span>
      {waiting.map((p) => {
        const disabled = (!choosable && p.id !== actor) || (hasWaitingOfficer && p.role === 'heister');
        return (
          <button key={p.id} className={`recorder-who ${p.id === actor ? 'selected' : ''}`} aria-pressed={p.id === actor}
            disabled={disabled} title={hasWaitingOfficer && p.role === 'heister' ? 'Place officers first' : undefined} onClick={() => onPick(p.id)}>
            <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={24} />
            <span>{p.name}</span>
            <small>{roleName(p)}</small>
          </button>
        );
      })}
    </div>
  );
}

// Information Phase: record an accusation and each officer's vote, then move on.
// Same cards and pickers as the online game's dock, with everyone's choices on one screen.
function InfoRecorder({ table, view, ids }: { table: TableGame; view: View; ids: Record<string, Identity> }) {
  const [picking, setPicking] = useState(false);
  const [by, setBy] = useState('');
  const [target, setTarget] = useState('');
  const officers = view.players.filter((p) => isOfficer(p.role) && p.status === 'active');
  const waiting = view.players.filter((p) => (isOfficer(p.role) || p.role === 'heister') && p.status === 'active' && !p.done);
  const acc = view.accusation;
  const token = (p: PublicPlayer, size = 28) => <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={size} />;
  const reset = () => { setPicking(false); setBy(''); setTarget(''); };

  if (acc) {
    const accused = view.players.find((p) => p.id === acc.target)!;
    const accuser = view.players.find((p) => p.id === acc.by);
    return (
      <Dock tone="accusing" title={<>Is {accused.name} the Crooked Cop?</>}
        sub={<>{accuser?.name ?? 'An officer'} called the vote. Tap each officer's answer; the result shows as soon as it's decided. <VoteTally officers={officers} votes={acc.votes} /></>}>
        <ul className="vote-rows">
          {officers.map((o) => {
            const vote = acc.votes[o.id];
            return (
              <li key={o.id}>
                {token(o, 26)}
                <span className="pname">{o.name}{o.id === accused.id && <small> (accused)</small>}</span>
                <button className={`vote-choice guilty ${vote === true ? 'selected' : ''}`} aria-pressed={vote === true}
                  onClick={() => table.actAs(o.id, { type: 'vote', yes: true })}>Guilty</button>
                <button className={`vote-choice innocent ${vote === false ? 'selected' : ''}`} aria-pressed={vote === false}
                  onClick={() => table.actAs(o.id, { type: 'vote', yes: false })}>Not guilty</button>
              </li>
            );
          })}
        </ul>
      </Dock>
    );
  }

  const canAccuse = !view.accusationUsed && officers.length > 1;
  if (picking && canAccuse) {
    const caller = officers.find((p) => p.id === by);
    const chosen = officers.find((p) => p.id === target && p.id !== by);
    const picker = (list: PublicPlayer[], value: string, set: (id: string) => void) => (
      <div className="suspects">
        {list.map((p) => (
          <button key={p.id} className={`suspect ${value === p.id ? 'selected' : ''}`} aria-pressed={value === p.id} onClick={() => set(p.id)}>
            {token(p)}<span>{p.name}</span>{p.cleared && <em>cleared</em>}
          </button>
        ))}
      </div>
    );
    return (
      <Dock tone="deciding" title={caller ? `Who does ${caller.name} accuse?` : 'Who calls the vote?'}
        sub="One vote per round. If the accused is innocent, they can't arrest next round.">
        <div className="vote-steps">
          <span className="vote-step-label">1 · Calling the vote</span>
          {picker(officers, by, (id) => { setBy(id); if (id === target) setTarget(''); })}
          {caller && (
            <>
              <span className="vote-step-label">2 · Accused</span>
              {picker(officers.filter((p) => p.id !== by), target, setTarget)}
            </>
          )}
        </div>
        <button className="btn ghost" onClick={reset}>Cancel</button>
        <button className="btn arrest" disabled={!caller || !chosen}
          onClick={() => { table.actAs(by, { type: 'accuse', target }); reset(); }}>
          {chosen ? `Call the vote on ${chosen.name}` : caller ? 'Pick the accused' : 'Pick who calls it'}
        </button>
      </Dock>
    );
  }

  return (
    <Dock title="Information Phase" recap={<RoundRecap view={view} />}
      sub={`Players compare notes out loud. ${view.accusationUsed ? "This round's vote has been used." : 'If an officer calls a vote on the Crooked Cop, record it here.'}`}>
      {canAccuse && <Card label="Call a vote" kind="arrest" title="Record an officer accusing another of being the Crooked Cop" onClick={() => setPicking(true)} />}
      <button className="btn primary" onClick={() => table.record(waiting.map((p) => [p.id, { type: 'ready' }]))}>End Information Phase</button>
    </Dock>
  );
}

const DEVICE_COPY: Record<DeviceKind, { title: string; body: string }> = {
  display: { title: 'Table display', body: 'A TV or laptop everyone can see: timer, board, announcements and results. Nothing secret.' },
  cops: { title: 'Cops device', body: 'A tablet the officers pass around. Each officer picks their action on it and reads their envelope in private.' },
};

// Lets a table display and a shared cops device follow this game. This device stays in charge.
export function DevicesPanel({ table, link }: { table: TableGame; link: FacilitatorLink }) {
  const [copied, setCopied] = useState<DeviceKind | null>(null);
  if (!link.code) {
    return (
      <section className="panel devices">
        <h3>Other devices</h3>
        <p className="muted small">Add a table display everyone can see, and a cops device the officers pass around to pick actions and read envelopes. Needs an internet connection.</p>
        <button className="btn" onClick={table.startLink}>Connect devices</button>
      </section>
    );
  }
  const copy = (kind: DeviceKind) => {
    navigator.clipboard?.writeText(deviceUrl(kind, link.code!)).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };
  return (
    <section className="panel devices">
      <div className="devices-head">
        <h3>Other devices</h3>
        <span className={`chip ${link.online ? '' : 'warn'}`}>{link.online ? 'Live' : 'Connecting…'}</span>
      </div>
      <p className="muted small">On each device, open the game and choose <strong>Join a table device</strong> with code</p>
      <div className="devices-code">{link.code}</div>
      <ul className="devices-list">
        {(['display', 'cops'] as const).map((kind) => (
          <li key={kind}>
            <span className={`device-dot ${link.devices[kind] ? 'on' : ''}`} aria-hidden="true" />
            <span className="device-info">
              <strong>{DEVICE_COPY[kind].title}</strong>
              <small>{link.devices[kind] ? `${link.devices[kind]} connected` : 'Not connected'} · {DEVICE_COPY[kind].body}</small>
            </span>
            <button className="btn ghost small" onClick={() => copy(kind)}>{copied === kind ? 'Copied' : 'Copy link'}</button>
          </li>
        ))}
      </ul>
      <button className="btn ghost small" onClick={() => confirm('Disconnect the other devices?') && table.stopLink()}>Stop sharing</button>
    </section>
  );
}

function Notes({ table }: { table: TableGame }) {
  const [text, setText] = useState('');
  return (
    <section className="panel table-notes">
      <h3>Add to the log</h3>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { table.note(text); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Rulings, disputes, anything worth keeping" aria-label="Note" />
        <button className="btn small" disabled={!text.trim()}>Add note</button>
      </form>
    </section>
  );
}

export function TableScreen({ table, view, link }: { table: TableGame; view: View; link: FacilitatorLink }) {
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen(boardWrapRef);
  const ids = useMemo(() => seatIdentities(view.players), [view.players]);
  const waiting = useMemo(() => {
    const list = view.players.filter((p) => actsThisPhase(view.phase, p) && !p.done);
    return view.phase === 'setup' ? [...list].sort(setupOrder) : list;
  }, [view.players, view.phase]);
  const hasWaitingOfficer = view.phase === 'setup' && waiting.some((p) => isOfficer(p.role));
  const [chosen, setChosen] = useState<string | null>(null);
  const actor = view.phase === 'police' ? view.policeTurn
    : view.phase === 'setup' || view.phase === 'heister' ? (
        view.phase === 'setup' && hasWaitingOfficer
          ? (waiting.find((p) => p.id === chosen && isOfficer(p.role)) ?? waiting[0])?.id ?? null
          : (waiting.find((p) => p.id === chosen) ?? waiting[0])?.id ?? null
      )
    : null;
  const actorView = actor ? table.viewAs(actor) : null;
  const act = (a: Parameters<TableGame['act']>[0]) => (actor ? table.actAs(actor, a) : table.act(a));

  const [mode, setMode] = useState<Mode>(null);
  const [path, setPath] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [editArtifacts, setEditArtifacts] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const { highlight, onHighlight, swept } = useEnvelopeHighlight(view);

  // A new player to record for starts fresh; in setup they go straight to picking a station.
  useEffect(() => {
    setPath([]);
    setPicked(null);
    setMode(view.phase === 'setup' && actor ? 'start' : null);
  }, [view.phase, view.round, actor]);

  useEffect(() => {
    if (view.phase !== 'setup') setEditArtifacts(false);
  }, [view.phase]);

  const marks = useMemo((): Record<string, Mark> => {
    if (editArtifacts) return Object.fromEntries(STATIONS.filter((s) => !view.exits.includes(s.id)).map((s) => [s.id, 'candidate' as Mark]));
    return mode && actorView ? marksFor(actorView, mode, path) : {};
  }, [editArtifacts, mode, actorView, path, view.exits]);

  const onStation = (id: string) => {
    if (editArtifacts) return table.toggleArtifact(id);
    if (!actor) return;
    if (mode === 'start') {
      // One tap places and locks in the player's start, then the next player is up.
      table.actAs(actor, { type: 'chooseStart', station: id }, { type: 'ready' });
      setChosen(null);
    } else if (mode === 'move' || mode === 'express') {
      if (path.at(-1) === id) setPath(path.slice(0, -1));
      else if (marks[id] === 'candidate') setPath([...path, id]);
    } else if (mode === 'search') {
      table.actAs(actor, { type: 'search', station: id });
      setMode(null);
    } else if (mode === 'arrest') {
      table.actAs(actor, { type: 'arrest', station: id });
      setMode(null);
    }
  };

  const seatedView = { ...view, players: view.players.filter((p) => p.role !== 'spectator') };
  const artifactsLeft = Object.values(view.artifacts ?? {}).reduce((a, b) => a + b, 0);

  const actorPlayer = actor ? view.players.find((p) => p.id === actor) : null;
  const focusedPlayer = focus ? view.players.find((p) => p.id === focus) : null;
  const currentTarget = focusedPlayer ?? actorPlayer;
  const currentStation = currentTarget?.station ?? null;
  const currentTargetName = currentTarget?.name;

  return (
    <div className="app game-screen table-screen">
      {/* Recording a move fits in one screen; the players list and the log sit below it. */}
      <div className="game-fold">
        <TableTopBar table={table} />
        <main className="game">
          <div className="board-col">
            <TimerBar table={table} view={view} onShow={() => setShowTimer(true)}>
              {!editArtifacts && <Recorder view={view} waiting={waiting} actor={actor} ids={ids} onPick={setChosen} />}
            </TimerBar>
            <div ref={boardWrapRef} className={`board-wrap ${fullscreen ? 'is-fullscreen' : ''}`}>
              <StatusStrip view={view} offset={0} ids={ids} />
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
                  <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails} showNames
                    focus={focus} onFocus={setFocus} selected={picked} swept={swept}
                    onPick={(id) => setPicked(mode || editArtifacts || id === picked ? null : id)} />
                  {picked && !mode && (
                    <StationPopover view={actorView ?? view} station={picked} ids={ids} act={act} onClose={() => setPicked(null)} facilitator />
                  )}
                </div>
              </BoardPanZoom>
              <div className="legend">
                <span><img src="/assets/artifact.png" alt="" width={16} height={16} /> {artifactsLeft} Artifact{artifactsLeft === 1 ? '' : 's'} on the board</span>
                {view.phase === 'setup' && (
                  <button className={`btn small ${editArtifacts ? 'selected' : ''}`} aria-pressed={editArtifacts}
                    onClick={() => { setEditArtifacts(!editArtifacts); setPicked(null); }}>
                    {editArtifacts ? 'Done placing Artifacts' : 'Move Artifacts to match the board'}
                  </button>
                )}
                {view.trails && (
                  <label className="check small">
                    <input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Heister trails
                  </label>
                )}
                <button
                  type="button"
                  className={`btn small legend-fullscreen ${fullscreen ? 'selected' : ''}`}
                  onClick={toggleFullscreen}
                  title={fullscreen ? 'Exit fullscreen map (Esc)' : 'View map in fullscreen'}
                >
                  {fullscreen ? '🗗 Exit Fullscreen' : '⛶ Fullscreen'}
                </button>
                <a className="legend-more" href="#case-file">Players &amp; log ↓</a>
              </div>
            </div>
            {editArtifacts ? (
              <Dock title="Placing Artifacts" hint="Tap a station to add or remove an Artifact"
                sub={`${artifactsLeft} placed, so a Heister escapes with ${Math.ceil(artifactsLeft / 2)}.`}>
                <button className="btn primary" onClick={() => setEditArtifacts(false)}>Done</button>
              </Dock>
            ) : (
              <div className="table-dock">
                {view.phase === 'info'
                  ? <InfoRecorder table={table} view={view} ids={ids} />
                  : <ActionDock key={`${view.phase}:${actor}`} view={actorView ?? view} mode={mode} path={path}
                    setMode={(m) => { setPicked(null); setMode(m); }} setPath={setPath} act={act} facilitator={!!actorView} />}
              </div>
            )}
          </div>
          <aside className="side-col">
            <Envelopes view={view} ids={ids} highlight={highlight} onHighlight={onHighlight} />
            <DevicesPanel table={table} link={link} />
            <Notes table={table} />
            {view.phase === 'ended' && (
              <section className="panel">
                <h3>Game over</h3>
                <p className="muted small">Save the full record: players and roles, the log round by round, and every clue handed out.</p>
                <button className="btn primary" onClick={() => table.save && downloadRecord(table.save.state)}>Export record</button>
              </section>
            )}
          </aside>
        </main>
      </div>
      <div className="below-board below-fold" id="case-file">
        <PlayerList view={seatedView} ids={ids} focus={focus} setFocus={setFocus} />
        <Log view={view} />
      </div>
      <PhaseBanner view={view} />
      <RevealCard view={view} />
      {showTimer && <PublicTimer table={table} view={view} onClose={() => setShowTimer(false)} />}
    </div>
  );
}
