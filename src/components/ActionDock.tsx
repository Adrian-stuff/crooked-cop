import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ULTIMATE_UNLOCK, escapeTarget } from '../../shared/engine';
import { EXPRESS_STOPS, LINES, lineName, linesAt, lineStations, stationLabel } from '../../shared/map';
import type { Action, PublicPlayer, View } from '../../shared/types';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText } from '../game/identity';
import type { Mode } from '../game/selection';
import { TokenIcon } from './Token';

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
  express: `Ride up to ${EXPRESS_STOPS} stops. Change lines only at interchanges`,
  search: "Click a blue-ringed station: you'll go there and sweep the area around it",
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

interface DockProps { title: ReactNode; sub?: ReactNode; children?: ReactNode; tone?: string; hint?: string | null; recap?: ReactNode }

function Dock({ title, sub, children, tone = '', hint, recap }: DockProps) {
  return (
    <section className={`dock ${tone}`} aria-label="Your actions">
      {hint && <div className="dock-hint" key={hint} role="status">{hint}</div>}
      {recap && <div className="dock-recap">{recap}</div>}
      <div className="dock-text">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="dock-actions">{children}</div>}
    </section>
  );
}

// What the officers did this round, shown while everyone compares notes.
export function RoundRecap({ view }: { view: View }) {
  const name = (id: string) => (id === view.me ? 'You' : view.players.find((p) => p.id === id)?.name ?? 'Someone');
  const items = view.roundActions.map((a, i) => {
    const who = name(a.by);
    const at = stationLabel(a.station);
    const text = a.kind === 'search' ? `${who} searched ${at}`
      : a.kind === 'ultimate' ? `${who} scanned the ${lineName(a.line ?? '')} line`
      : a.kind === 'arrest' ? (a.ok ? `${who} caught a Heister at ${at}` : `${who}'s arrest at ${at} failed`)
        : a.kind === 'move' ? `${who} moved to ${at}` : `${who} passed`;
    const tone = a.kind === 'arrest' ? (a.ok ? 'clear' : 'danger') : a.kind === 'search' ? 'search' : a.kind === 'ultimate' ? 'ultimate' : '';
    return <span key={i} className={`recap-item ${tone}`}>{text}</span>;
  });
  return (
    <>
      <span className="recap-title">Round {view.round} recap</span>
      {view.takenThisRound > 0 && <span className="recap-item gold">+{view.takenThisRound} Artifact{view.takenThisRound > 1 ? 's' : ''} taken</span>}
      {items.length ? items : <span className="recap-item">No officer acted this round</span>}
    </>
  );
}

export function ActionDock({ view, mode, path, setMode, setPath, act }: Props) {
  const me = view.players.find((p) => p.id === view.me);
  const [accuseTarget, setAccuseTarget] = useState('');
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => setScanning(false), [view.phase, view.round]);
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
  // A Heister's Express card recharges for a round after use.
  const recharging = me.expressCooldown;
  const moveCards = () => (
    <>
      <Card label="Move 1–2" kind="move" selected={mode === 'move'} onClick={() => pick('move')} />
      <Card step={recharging ? 'Recharging' : undefined} label="Express" icon="/assets/card-express.png" kind="express"
        selected={mode === 'express'} disabled={recharging}
        title={recharging ? 'You used Express last round. It is ready again next round.' : `Up to ${EXPRESS_STOPS} stops; you can change lines at interchanges`}
        onClick={() => pick('express')} />
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
    return <Dock title={view.godView ? 'Facilitator view' : 'Spectating'} recap={view.phase === 'info' ? <RoundRecap view={view} /> : null}
      sub={view.godView ? 'You can see every Heister, every Artifact and the Crooked Cop. Keep it to yourself.'
        : 'You see what the public board shows. Hidden positions are revealed at the end.'} />;
  }

  if (!active) {
    const msg = me.status === 'arrested' ? 'You were arrested. Watch the rest of the case unfold.'
      : me.status === 'exposed' ? 'You were exposed as the Crooked Cop and removed from the force.' : 'You escaped!';
    return <Dock title="Out of play" sub={msg} recap={view.phase === 'info' ? <RoundRecap view={view} /> : null} />;
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
      <span className="carry-meter" title={`Escape through ${view.exits.map(stationLabel).join(' or ')}`}>
        <img src="/assets/artifact.png" alt="" width={20} height={20} />
        <strong>{me.carried ?? 0}</strong>/{escapeTarget(view.settings)}
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
    // The Police Ultimate: scan one line through your station for Heisters, once per game.
    if (scanning && view.ultimateUnlocked && !me.ultimateUsed) {
      const lines = linesAt(me.station!);
      return (
        <Dock tone="deciding" title="Police Ultimate"
          sub={lines.length > 1
            ? `${stationLabel(me.station!)} is an interchange. Pick which line to scan for Heisters. This uses your action and your one Ultimate.`
            : 'Scan your whole line for Heisters. This uses your action and your one Ultimate.'}>
          {lines.map((l) => {
            const line = LINES.find((x) => x.id === l)!;
            return (
              <button key={l} className="decision ultimate" style={{ '--line-color': line.color } as CSSProperties}
                onClick={() => { setScanning(false); act({ type: 'ultimate', line: l }); }}>
                <strong><i className="line-swatch" />{line.name} line</strong>
                <small>{lineStations(l).length} stations</small>
              </button>
            );
          })}
          <button className="btn ghost" onClick={() => setScanning(false)}>Cancel</button>
        </Dock>
      );
    }
    const ultimateStep = me.ultimateUsed ? 'Used'
      : view.ultimateUnlocked ? 'Once per game' : `${Math.min(view.announcedTaken, ULTIMATE_UNLOCK)}/${ULTIMATE_UNLOCK} taken`;
    const ultimateTitle = me.ultimateUsed ? 'You already played your Ultimate this game.'
      : view.ultimateUnlocked ? 'Check whether any Heister is on a line through your station'
        : `Unlocks once the Heisters have taken ${ULTIMATE_UNLOCK} Artifacts`;
    const warn = view.exitMustClear.length ? `Exit rule: no officer may end this round on ${view.exitMustClear.map(stationLabel).join(' or ')}`
      : me.cannotArrest ? 'You were wrongly accused: no arrests for you this round' : null;
    return (
      <Dock title="Your turn, Officer" hint={hint ?? warn ?? 'Click any station for options'}
        sub={`Pick one action: Move, Express, Search (you go there)${view.ultimateUnlocked && !me.ultimateUsed ? ', Arrest or Ultimate' : ' or Arrest'}.`}>
        {routing ? route : (
          <>
            {moveCards()}
            <Card label="Search" kind="search" selected={mode === 'search'} title="Go to a nearby station and search it" onClick={() => pick('search')} />
            <Card step={`${view.arrestsLeft} left`} label="Arrest" icon="/assets/card-arrest.png" kind="arrest" selected={mode === 'arrest'}
              disabled={noArrest} onClick={() => pick('arrest')} />
            <Card step={ultimateStep} label="Ultimate" kind="ultimate" title={ultimateTitle}
              disabled={!view.ultimateUnlocked || me.ultimateUsed} onClick={() => { setMode(null); setPath([]); setScanning(true); }} />
            <button className="btn ghost" onClick={() => { setMode(null); act({ type: 'endTurn' }); }}>Pass</button>
          </>
        )}
      </Dock>
    );
  }

  // Information phase: talk, and optionally put one officer to a vote.
  const acc = view.accusation;
  const recap = <RoundRecap view={view} />;
  const officers = view.players.filter((p) => isOfficer(p.role) && p.status === 'active');
  const ids = seatIdentities(view.players);
  const token = (p: PublicPlayer, size = 28) => <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={size} />;
  const done = (
    <button className="btn primary" disabled={me.done} onClick={() => act({ type: 'ready' })}>
      {me.done ? 'Waiting…' : "I'm done talking"}
    </button>
  );

  if (acc) {
    const target = view.players.find((p) => p.id === acc.target)!;
    const accuser = view.players.find((p) => p.id === acc.by)?.name ?? 'Someone';
    const yes = officers.filter((o) => acc.votes[o.id] === true).length;
    const no = officers.filter((o) => acc.votes[o.id] === false).length;
    const need = Math.floor(officers.length / 2) + 1;
    const mine = acc.votes[me.id];
    const tally = (
      <span className="vote-tally">
        {officers.map((o) => (
          <i key={o.id} className={acc.votes[o.id] === true ? 'yes' : acc.votes[o.id] === false ? 'no' : ''}
            title={`${o.name}: ${acc.votes[o.id] === undefined ? 'not voted' : acc.votes[o.id] ? 'guilty' : 'not guilty'}`} />
        ))}
        Guilty {yes} · Not guilty {no} · {need} needed
      </span>
    );
    if (officer && mine === undefined) {
      return (
        <Dock tone="deciding" title={<>Is {target.id === me.id ? 'you' : target.name} the Crooked Cop?</>}
          sub={<>{accuser} called the vote. {tally}</>}>
          <span className="vote-suspect">{token(target, 44)}</span>
          <button className="decision guilty" onClick={() => act({ type: 'vote', yes: true })}>
            <strong>Guilty</strong><small>Remove them if they're the Crooked Cop</small>
          </button>
          <button className="decision innocent" onClick={() => act({ type: 'vote', yes: false })}>
            <strong>Not guilty</strong><small>Keep them on the force</small>
          </button>
        </Dock>
      );
    }
    return (
      <Dock tone="accusing" title={officer ? `You voted ${mine ? 'Guilty' : 'Not guilty'}` : 'Officers are voting'}
        sub={<>{accuser} accuses <strong>{target.name}</strong>. {tally}</>}>
        <span className="vote-suspect">{token(target, 36)}</span>
        {officer && (
          <button className="btn ghost" onClick={() => act({ type: 'vote', yes: !mine })}>
            Change to {mine ? 'Not guilty' : 'Guilty'}
          </button>
        )}
      </Dock>
    );
  }

  const canAccuse = officer && !view.accusationUsed;
  if (picking && canAccuse) {
    const suspects = officers.filter((p) => p.id !== me.id);
    const chosen = suspects.find((p) => p.id === accuseTarget);
    return (
      <Dock title="Who is the Crooked Cop?"
        sub="Put one officer to a vote. One vote per round; if they're innocent they can't arrest next round.">
        <div className="suspects">
          {suspects.map((p) => (
            <button key={p.id} className={`suspect ${accuseTarget === p.id ? 'selected' : ''}`} aria-pressed={accuseTarget === p.id}
              onClick={() => setAccuseTarget(p.id)}>
              {token(p)}<span>{p.name}</span>{p.cleared && <em>cleared</em>}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={() => { setPicking(false); setAccuseTarget(''); }}>Cancel</button>
        <button className="btn arrest" disabled={!chosen}
          onClick={() => { act({ type: 'accuse', target: accuseTarget }); setAccuseTarget(''); setPicking(false); }}>
          {chosen ? `Call the vote on ${chosen.name}` : 'Pick a suspect'}
        </button>
      </Dock>
    );
  }

  return (
    <Dock title="Information Phase" recap={recap}
      sub={`Compare envelopes in chat. The round ends when everyone is done or the timer runs out.${officer && view.accusationUsed ? " This round's vote has been used." : ''}`}>
      {canAccuse && <Card label="Call a vote" kind="arrest" title="Accuse an officer of being the Crooked Cop" onClick={() => setPicking(true)} />}
      {done}
    </Dock>
  );
}
