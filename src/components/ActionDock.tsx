import { useState, type ReactNode } from 'react';
import { EXIT_STATION, stationLabel } from '../../shared/map';
import type { Action, View } from '../../shared/types';
import type { Mode } from '../game/selection';

interface Props {
  view: View;
  mode: Mode;
  path: string[];
  setMode: (m: Mode) => void;
  setPath: (p: string[]) => void;
  act: (a: Action) => void;
}

const isOfficer = (role: string) => role === 'police' || role === 'traitor';

const HINT: Partial<Record<NonNullable<Mode>, string>> = {
  start: 'Click any station to start there',
  move: 'Pick up to 2 stops on the map',
  express: 'Ride one line, up to 4 stops',
  search: "Click a blue-ringed station: you'll go there and search it",
  arrest: "Click a red-ringed station. A wrong arrest costs you next round's Police Phase",
};

interface CardProps {
  step?: string;
  label: ReactNode;
  icon?: string;
  kind?: string;
  selected?: boolean;
  done?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

function Card({ step, label, icon, kind = '', selected, done, disabled, title, onClick }: CardProps) {
  return (
    <button className={`dock-card ${kind} ${selected ? 'selected' : ''} ${done ? 'done' : ''}`}
      disabled={disabled || done} onClick={onClick} title={title} aria-pressed={selected}>
      {icon && <img src={icon} alt="" className="dock-card-art" />}
      <span>
        {step && <small>{done ? `${step} ✓` : step}</small>}
        <strong>{label}</strong>
      </span>
    </button>
  );
}

function Dock({ title, sub, children, tone = '', hint }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; tone?: string; hint?: string | null }) {
  return (
    <section className={`dock ${tone}`} aria-label="Your actions">
      {hint && <div className="dock-hint" key={hint} role="status">{hint}</div>}
      <div className="dock-text">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="dock-actions">{children}</div>}
    </section>
  );
}

export function ActionDock({ view, mode, path, setMode, setPath, act }: Props) {
  const me = view.players.find((p) => p.id === view.me);
  const [accuseTarget, setAccuseTarget] = useState('');
  if (!me) return null;
  const officer = isOfficer(view.myRole);
  const active = me.status === 'active';
  const hint = mode ? HINT[mode] : null;
  const pick = (m: Mode) => { setPath([]); setMode(mode === m ? null : m); };

  // While building a route the dock turns into the route and its confirm button.
  const routing = mode === 'move' || mode === 'express';
  const route = (
    <>
      <div className="route" aria-live="polite">
        {path.length ? path.map((s, i) => <span key={s} className="route-stop">{i > 0 && '→ '}{stationLabel(s)}</span>)
          : <em>No stops picked yet</em>}
      </div>
      <button className="btn ghost" onClick={() => { setPath([]); setMode(null); }}>Cancel</button>
      <button className="btn primary" disabled={!path.length}
        onClick={() => { act({ type: 'move', path, express: mode === 'express' }); setPath([]); setMode(null); }}>
        Confirm {mode === 'express' ? 'Express' : 'move'}
      </button>
    </>
  );
  const moveCards = (step?: string, done?: boolean) => (
    <>
      <Card step={step} label="Move 1–2" kind="move" selected={mode === 'move'} done={done} onClick={() => pick('move')} />
      <Card step={step && !done ? 'or' : undefined} label="Express" icon="/assets/card-express.png" kind="express" selected={mode === 'express'} done={done}
        title="Up to 4 stops along one line" onClick={() => pick('express')} />
    </>
  );

  if (view.phase === 'ended') {
    const canRematch = me.isHost || !view.players.find((p) => p.isHost)?.connected;
    return (
      <Dock tone={`verdict ${view.winner}`} title={view.winner === 'heisters' ? 'The Heisters got away' : 'The Police closed the case'} sub={view.endReason}>
        {canRematch
          ? <button className="btn primary" onClick={() => act({ type: 'rematch' })}>Back to lobby</button>
          : <span className="muted">Waiting for the host to start a rematch</span>}
      </Dock>
    );
  }

  if (view.myRole === 'spectator') {
    return <Dock title={view.godView ? 'Facilitator view' : 'Spectating'}
      sub={view.godView ? 'You can see every Heister, every Artifact and the Crooked Cop. Keep it to yourself.'
        : 'You see what the public board shows. Hidden positions are revealed at the end.'} />;
  }

  if (!active) {
    const msg = me.status === 'arrested' ? 'You were arrested. Watch the rest of the case unfold.'
      : me.status === 'exposed' ? 'You were exposed as the Crooked Cop and removed from the force.' : 'You escaped!';
    return <Dock title="Out of play" sub={msg} />;
  }

  if (view.phase === 'setup') {
    if (me.done) return <Dock title="Locked in" sub={<>You start at <strong>{stationLabel(me.station!)}</strong>. Waiting for the others…</>} />;
    if (me.station) {
      return (
        <Dock title={<>Starting at {stationLabel(me.station)}</>} hint={hint ?? 'Click another station to change your pick'}
          sub="Change it as often as you like until you lock in. Setup ends when everyone has locked in.">
          <Card label="Change" selected={mode === 'start'} onClick={() => pick('start')} />
          <button className="btn primary" onClick={() => { setMode(null); act({ type: 'ready' }); }}>Lock in</button>
        </Dock>
      );
    }
    return (
      <Dock title="Choose your starting station" hint={hint}
        sub={view.myRole === 'heister' ? 'Pick secretly. Officer picks stay hidden until setup ends. Gold coins mark the Artifacts.'
          : 'Your team sees your pick; the Heisters only see it when setup ends. Spread out to cover the network.'}>
        <Card label={mode === 'start' ? 'Click a station…' : 'Pick on the map'} kind="primary" selected={mode === 'start'} onClick={() => pick('start')} />
      </Dock>
    );
  }

  if (view.phase === 'heister') {
    if (view.myRole !== 'heister') return <Dock title="Heister Phase" sub="The Heisters are moving in secret. Plan your next move in Police chat." />;
    const carry = (
      <span className="carry-meter" title={`Escape through ${stationLabel(EXIT_STATION)}`}>
        <img src="/assets/artifact.png" alt="" width={20} height={20} />
        <strong>{me.carried ?? 0}</strong>/{view.settings.artifactsToEscape}
      </span>
    );
    if (me.done) return <Dock title={`Your move, ${me.label}`} sub="Move locked in. Waiting for your partner…">{carry}</Dock>;
    return (
      <Dock title={`Your move, ${me.label}`} hint={hint ?? 'Click any station for options'}
        sub="Stops on an Artifact pick it up. Express only collects at its last stop.">
        {routing ? route : (
          <>
            {moveCards()}
            <button className="btn ghost" onClick={() => act({ type: 'endTurn' })}>Stay put</button>
          </>
        )}
        {carry}
      </Dock>
    );
  }

  if (view.phase === 'police') {
    if (!officer) return <Dock title="Police Phase" sub="Officers are moving, searching and arresting. Watch the board." />;
    if (me.done) {
      return <Dock title="Police Phase" sub={me.skipsPolice ? 'You sit out this phase (wrong arrest last round).' : 'Your turn is done. Waiting for the other officers…'} />;
    }
    if (view.policeTurn !== me.id) {
      const up = view.players.find((p) => p.id === view.policeTurn);
      return <Dock title="Police Phase" sub={<>Officers go one at a time. {up ? <><strong>{up.name}</strong> is taking their turn.</> : ''} You're up soon.</>} />;
    }
    const noArrest = me.cannotArrest || view.arrestsLeft <= 0;
    const warn = view.exitMustClear ? `Exit rule: no officer may end this round on ${stationLabel(EXIT_STATION)}`
      : me.cannotArrest ? 'You were wrongly accused: no arrests for you this round' : null;
    return (
      <Dock title="Your turn, Officer" hint={hint ?? warn ?? 'Click any station for options'}
        sub="Pick one action: Move, Express, Search (you go there) or Arrest.">
        {routing ? route : (
          <>
            {moveCards()}
            <Card label="Search" kind="search" selected={mode === 'search'} title="Go to a nearby station and search it" onClick={() => pick('search')} />
            <Card step={`${view.arrestsLeft} left`} label="Arrest" icon="/assets/card-arrest.png" kind="arrest" selected={mode === 'arrest'}
              disabled={noArrest} onClick={() => pick('arrest')} />
            <button className="btn ghost" onClick={() => { setMode(null); act({ type: 'endTurn' }); }}>Pass</button>
          </>
        )}
      </Dock>
    );
  }

  // Information phase
  const acc = view.accusation;
  const officers = view.players.filter((p) => isOfficer(p.role) && p.status === 'active');
  const target = acc && view.players.find((p) => p.id === acc.target);
  const yes = acc ? Object.values(acc.votes).filter(Boolean).length : 0;
  const no = acc ? Object.values(acc.votes).filter((v) => !v).length : 0;
  return (
    <Dock title="Information Phase"
      sub={acc && target
        ? <><strong>{view.players.find((p) => p.id === acc.by)?.name}</strong> accuses <strong>{target.name}</strong>. Yes {yes} · No {no} of {officers.length}</>
        : `Compare envelopes in chat. The round ends when everyone is done or the timer runs out.${view.accusationUsed ? " This round's accusation has been used." : ''}`}
      tone={acc ? 'accusing' : ''}>
      {acc && officer && (
        <>
          <button className={`btn arrest ${acc.votes[me.id] === true ? 'selected' : ''}`} onClick={() => act({ type: 'vote', yes: true })}>Guilty</button>
          <button className={`btn ${acc.votes[me.id] === false ? 'selected' : ''}`} onClick={() => act({ type: 'vote', yes: false })}>Not guilty</button>
        </>
      )}
      {officer && !acc && !view.accusationUsed && (
        <>
          <select value={accuseTarget} onChange={(e) => setAccuseTarget(e.target.value)} aria-label="Officer to accuse">
            <option value="">Accuse an officer…</option>
            {officers.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn arrest" disabled={!accuseTarget}
            onClick={() => { act({ type: 'accuse', target: accuseTarget }); setAccuseTarget(''); }}>
            Call the vote
          </button>
        </>
      )}
      <button className="btn primary" disabled={me.done} onClick={() => act({ type: 'ready' })}>
        {me.done ? 'Waiting…' : "I'm done talking"}
      </button>
    </Dock>
  );
}
