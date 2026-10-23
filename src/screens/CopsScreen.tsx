import { useEffect, useMemo, useState } from 'react';
import type { Action, PublicPlayer, View } from '../../shared/types';
import { ActionDock, RoundRecap } from '../components/ActionDock';
import { Board } from '../components/Board';
import { BoardLegend } from '../components/BoardLegend';
import { BoardView } from '../components/BoardView';
import { Envelopes } from '../components/Envelopes';
import { Log, PlayerList, useCountdown } from '../components/Panels';
import { StationPopover } from '../components/StationPopover';
import { StatusStrip } from '../components/StatusStrip';
import { TokenIcon } from '../components/Token';
import { useEnvelopeHighlight } from '../game/envelopeHighlight';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText, type Identity } from '../game/identity';
import { marksFor, type Mode } from '../game/selection';
import { useTableDevice } from '../net/tableLink';
import '../table.css';

const PHASE_NAME: Record<string, string> = {
  lobby: 'Getting ready', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// One shared device for the whole Police team, passed from officer to officer.
// Every turn ends on the same private envelope screen, even when there is nothing in it,
// so nobody watching can tell the Crooked Cop's tip-off from an honest officer's empty hand.
type Stage =
  | { kind: 'idle' }
  | { kind: 'handoff'; id: string } // waiting for the officer whose turn it is to take the device
  | { kind: 'turn'; id: string; seen: string[] } // choosing an action; `seen` = envelopes they had before it
  | { kind: 'reveal'; id: string; seen: string[] } // their new envelope, privately
  | { kind: 'review'; id: string | null; open: boolean }; // an officer re-reading their own envelopes

export function CopsScreen({ code }: { code: string }) {
  const { sync, offset, online, facilitator, act } = useTableDevice(code, 'cops');
  const base = sync?.display;
  const turnId = base?.phase === 'police' ? base.policeTurn : null;
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  // Follow the game: a new officer is up, or the current one's time ran out
  // (or the facilitator recorded their move) while they were choosing.
  useEffect(() => {
    setStage((st) => {
      if (st.kind === 'turn' && st.id !== turnId) return { kind: 'reveal', id: st.id, seen: st.seen };
      if (st.kind === 'reveal' || st.kind === 'review') return st;
      if (turnId) return st.kind === 'handoff' && st.id === turnId ? st : { kind: 'handoff', id: turnId };
      return { kind: 'idle' };
    });
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

  const next = (): Stage => (turnId ? { kind: 'handoff', id: turnId } : { kind: 'idle' });
  // Any officer can re-read their own envelopes between turns, then the device goes back to whoever is up.
  const review = () => setStage({ kind: 'review', id: null, open: false });
  const canReview = base.phase !== 'lobby' && (stage.kind === 'idle' || stage.kind === 'handoff');
  const viewOf = (id: string | null) => (id ? sync.cops[id] ?? null : null);
  const ids = seatIdentities(base.players);

  let body;
  if (stage.kind === 'turn' && viewOf(stage.id)) {
    const id = stage.id;
    body = (
      <TurnStage view={viewOf(id)!} offset={offset} ids={ids} paused={sync.paused} onBack={() => setStage(next())}
        act={async (a) => {
          const problem = await act(id, a);
          if (problem) setError(problem);
          // The Ultimate is free: the officer stays on their turn and reads the scan beside the map.
          else if (a.type !== 'ultimate') setStage({ kind: 'reveal', id, seen: stage.seen });
        }} />
    );
  } else if (stage.kind === 'reveal' && viewOf(stage.id)) {
    body = <RevealStage view={viewOf(stage.id)!} seen={stage.seen} ids={ids} onDone={() => setStage(next())} />;
  } else if (stage.kind === 'review') {
    const v = viewOf(stage.id);
    body = v && stage.open
      ? <ReviewStage view={v} ids={ids} onDone={() => setStage(next())} />
      : (
        <ReviewPick officers={base.players.filter((p) => p.id in sync.cops)} ids={ids} chosen={stage.id}
          pick={(pid) => setStage({ kind: 'review', id: pid, open: false })}
          open={() => setStage({ ...stage, open: true })} cancel={() => setStage(next())} />
      );
  } else if (stage.kind === 'handoff' && viewOf(stage.id)) {
    const v = viewOf(stage.id)!;
    body = (
      <Handoff player={v.players.find((p) => p.id === v.me)!} ids={ids} base={base} offset={offset} paused={sync.paused}
        onStart={() => setStage({ kind: 'turn', id: stage.id, seen: v.envelopes.map((e) => e.id) })} onReview={review} />
    );
  } else {
    body = <Idle base={base} offset={offset} paused={sync.paused} onReview={review} />;
  }

  return (
    <div className="app cops-screen">
      <header className="topbar">
        <div className="brand">
          <img src="/assets/logo-crooked-cop-128.png" alt="" width={36} height={36} />
          <span>Cops device</span>
        </div>
        <span className="muted small">Room {code}</span>
        {canReview && <button className="btn small cops-env-btn" onClick={review}>My envelopes</button>}
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

function Handoff({ player, ids, base, offset, paused, onStart, onReview }: {
  player: PublicPlayer; ids: Record<string, Identity>; base: View; offset: number; paused: number | null; onStart: () => void; onReview: () => void;
}) {
  return (
    <main className="cops-card">
      <span className="pt-round">Round {base.round} · Police Phase <Countdown view={base} offset={offset} paused={paused} /></span>
      <TokenIcon role="police" identity={ids[player.id] ?? SPECTATOR_IDENTITY} text={tokenText(player)} size={110} />
      <h1>{player.name}'s turn</h1>
      <p className="muted">Pass the device to {player.name}. Everyone else, look away from the screen.</p>
      <button className="btn primary big" onClick={onStart}>I'm {player.name}, show my options</button>
      {base.roundActions.length > 0 && <div className="dock-recap cops-recap"><RoundRecap view={base} /></div>}
      <button className="btn ghost small" onClick={onReview}>Another officer wants to re-read their envelopes</button>
    </main>
  );
}

function TurnStage({ view, offset, ids, paused, act, onBack }: {
  view: View; offset: number; ids: Record<string, Identity>; paused: number | null; act: (a: Action) => Promise<void>; onBack: () => void;
}) {
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

  // Laid out like the online game: board and actions, with your own envelopes beside them.
  return (
    <main className="game cops-turn">
      <div className="board-col">
        <div className="board-wrap">
          <StatusStrip view={view} offset={offset} ids={ids} />
          {paused !== null && <div className="device-banner">Timer paused by the facilitator</div>}
          <BoardView showKey={`${view.phase}:${view.round}`} dock={
            <div className={busy ? 'cops-busy' : ''} aria-busy={busy}>
              <ActionDock view={view} mode={mode} path={path} setMode={(m) => { setPicked(null); setMode(m); }} setPath={setPath} act={send} />
            </div>
          }>
            <div className="board-stage">
              <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails} showNames={showNames}
                focus={focus} onFocus={setFocus} selected={picked} swept={swept} lastSeen={lastSeen}
                onPick={(id) => setPicked(mode || id === picked ? null : id)} />
              {picked && !mode && <StationPopover view={view} station={picked} ids={ids} act={send} onClose={() => setPicked(null)} />}
            </div>
          </BoardView>
          <BoardLegend view={view} showNames={showNames} setShowNames={setShowNames} showTrails={showTrails} setShowTrails={setShowTrails} />
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
          <button className="btn ghost small" onClick={onBack} title="Wrong officer? Hand the device back without acting">Not {me.name}?</button>
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
  const { highlight, onHighlight, swept, lastSeen } = useEnvelopeHighlight(view);
  return (
    <main className="cops-reveal">
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
            <Envelopes view={view} ids={ids} highlight={highlight} onHighlight={onHighlight} fresh={fresh} />
          </>
        )}
        <button className="btn primary big" disabled={!settled} onClick={onDone}>Hide them and pass the device on</button>
      </section>
      {settled && (
        <div className="board-wrap cops-reveal-board">
          <Board view={view} showNames swept={swept} lastSeen={lastSeen} />
        </div>
      )}
    </main>
  );
}

function ReviewPick({ officers, ids, chosen, pick, open, cancel }: {
  officers: PublicPlayer[]; ids: Record<string, Identity>; chosen: string | null; pick: (id: string) => void; open: () => void; cancel: () => void;
}) {
  const who = officers.find((p) => p.id === chosen);
  return (
    <main className="cops-card">
      <h1>{who ? `Only ${who.name} should look` : 'Whose envelopes?'}</h1>
      {who ? <p className="muted">Hand the device to {who.name}. Everyone else, look away.</p>
        : <p className="muted">Re-read your own envelopes at any time. Pick your name.</p>}
      {!who && (
        <div className="suspects">
          {officers.map((p) => (
            <button key={p.id} className="suspect" onClick={() => pick(p.id)}>
              <TokenIcon role="police" identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={28} /><span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cops-row">
        <button className="btn ghost" onClick={cancel}>Cancel</button>
        {who && <button className="btn primary" onClick={open}>I'm {who.name}, open them</button>}
      </div>
    </main>
  );
}

function ReviewStage({ view, ids, onDone }: { view: View; ids: Record<string, Identity>; onDone: () => void }) {
  const { highlight, onHighlight, swept, lastSeen } = useEnvelopeHighlight(view);
  const me = view.players.find((p) => p.id === view.me)!;
  return (
    <main className="cops-reveal">
      <section className="cops-card compact">
        <span className="pt-round">Private · only {me.name} looks</span>
        <h1>{me.name}'s envelopes</h1>
        <Envelopes view={view} ids={ids} highlight={highlight} onHighlight={onHighlight} />
        <button className="btn primary big" onClick={onDone}>Hide my envelopes</button>
      </section>
      <div className="board-wrap cops-reveal-board">
        <Board view={view} showNames swept={swept} lastSeen={lastSeen} />
      </div>
    </main>
  );
}

function Idle({ base, offset, paused, onReview }: { base: View; offset: number; paused: number | null; onReview: () => void }) {
  const waitText: Record<string, string> = {
    lobby: 'The facilitator is seating players.',
    setup: 'Officers choose their starting stations with the facilitator.',
    heister: 'The Heisters are moving. Your turns come next.',
    police: 'Officers go one at a time.',
    info: 'Compare notes out loud. Any officer may call a vote through the facilitator.',
    ended: base.endReason ?? '',
  };
  return (
    <main className="cops-card">
      <span className="pt-round">{base.phase === 'lobby' ? 'Facilitator mode' : `Round ${base.round} of ${base.settings.maxRounds}`}</span>
      <h1>{base.phase === 'ended' ? (base.winner === 'heisters' ? 'The Heisters got away' : 'Case closed') : PHASE_NAME[base.phase]}</h1>
      <Countdown view={base} offset={offset} paused={paused} />
      <p className="muted">{waitText[base.phase]}</p>
      {base.phase === 'info' && <div className="dock-recap cops-recap"><RoundRecap view={base} /></div>}
      {base.phase !== 'lobby' && <button className="btn big" onClick={onReview}>Look at my envelopes</button>}
    </main>
  );
}
