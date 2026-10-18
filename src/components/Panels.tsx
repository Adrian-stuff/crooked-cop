import { useEffect, useRef, useState } from 'react';
import { stationLabel } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';
import { ART } from '../game/art';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText, type Identity } from '../game/identity';
import { actsThisPhase } from '../game/selection';
import { TokenIcon } from './Token';

export function useCountdown(deadline: number | null, offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

const PHASE_NAME: Record<string, string> = {
  lobby: 'Lobby', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

export function TopBar({ view, onLeave }: { view: View; onLeave: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/assets/logo-crooked-cop-128.png" alt="" width={36} height={36} />
        <span>The Crooked Cop</span>
      </div>
      <div className="room">Room <strong>{view.code}</strong></div>
      {view.phase !== 'lobby' && (
        <>
          <div className="round">Round <strong key={view.round} className="pop">{Math.max(view.round, 0)}</strong>/{view.settings.maxRounds}</div>
          <div className="taken" title="Artifacts taken, as announced after each Heister Phase">
            <img src="/assets/artifact.png" alt="" width={22} height={22} /> <span key={view.announcedTaken} className="pop">{view.announcedTaken}</span>/{view.settings.artifactCount} taken
          </div>
        </>
      )}
      <button className="btn ghost small leave" onClick={onLeave}>Leave</button>
    </header>
  );
}

function roleBadge(p: PublicPlayer) {
  switch (p.role) {
    case 'heister': return <span className="tag heister">{p.label} Heister</span>;
    case 'traitor': return <span className="tag traitor">Crooked Cop</span>;
    case 'police': return <span className="tag police">Police</span>;
    case 'spectator': return <span className="tag">Spectator</span>;
    default: return null;
  }
}

// Sits on top of the board: what phase it is, how long is left, and who the table is waiting on.
export function StatusStrip({ view, offset, ids }: { view: View; offset: number; ids: Record<string, Identity> }) {
  const secs = useCountdown(view.deadline, offset);
  const mm = secs === null ? '' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const pending = view.players.filter((p) => actsThisPhase(view.phase, p) && !p.done);
  // In the Police Phase officers go one at a time, so the one acting now leads the queue.
  const waiting = view.phase === 'police'
    ? [...pending.filter((p) => p.id === view.policeTurn), ...pending.filter((p) => p.id !== view.policeTurn)]
    : pending;
  const mine = view.phase === 'police' ? view.policeTurn === view.me : waiting.some((p) => p.id === view.me);
  const label = mine ? 'Your move ·' : view.phase === 'police' ? 'Now' : view.phase === 'setup' ? 'Not locked in' : 'Waiting on';
  return (
    <div className="status-strip">
      <span key={view.phase} className={`phase phase-${view.phase}`}>{PHASE_NAME[view.phase]}</span>
      {secs !== null && view.phase !== 'ended' && <span className={`timer ${secs <= 10 ? 'urgent' : ''}`} aria-live="off">{mm}</span>}
      {waiting.length > 0 && (
        <span className="waiting">
          <span className="muted">{label}</span>
          {waiting.map((p) => (
            <span key={p.id} title={p.name}
              className={`waiting-token ${p.id === view.me ? 'me' : ''} ${view.phase === 'police' && p.id === view.policeTurn ? 'current' : view.phase === 'police' ? 'queued' : ''}`}>
              <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={24} />
            </span>
          ))}
        </span>
      )}
      {waiting.length === 0 && view.phase !== 'ended' && (
        <span className="waiting muted">Everyone is done</span>
      )}
    </div>
  );
}

interface PlayerListProps {
  view: View;
  ids: Record<string, Identity>;
  focus: string | null;
  setFocus: (id: string | null) => void;
}

export function PlayerList({ view, ids, focus, setFocus }: PlayerListProps) {
  const order = { heister: 0, traitor: 1, police: 1, unknown: 2, spectator: 3 } as const;
  const players = [...view.players].sort((a, b) => order[a.role] - order[b.role]);
  return (
    <section className="panel players">
      <h3>Players</h3>
      <ul>
        {players.map((p) => {
          const id = ids[p.id] ?? SPECTATOR_IDENTITY;
          return (
            <li key={p.id} style={{ '--seat': id.color } as React.CSSProperties}
              className={`${p.connected ? '' : 'offline'} ${p.status !== 'active' ? 'out' : ''} ${focus === p.id ? 'focused' : ''}`}
              onMouseEnter={() => setFocus(p.id)} onMouseLeave={() => setFocus(null)}
              onClick={() => setFocus(focus === p.id ? null : p.id)} title={`${id.name} token`}>
              <TokenIcon role={p.role} identity={id} text={tokenText(p)} size={34} />
              <span className="pname">{p.name}{p.id === view.me && <em> (you)</em>}{p.isHost && <span title="Host"> ★</span>}
                {p.cleared && <span className="tag cleared" title="A vote showed this officer is not the Crooked Cop">Cleared</span>}</span>
              {roleBadge(p)}
              <span className="pmeta">
                {p.station ? stationLabel(p.station)
                  : p.role === 'heister' && p.status === 'active'
                    ? view.tipoff?.at[p.id] ? <span className="tip-meta">Tip-off R{view.tipoff.round}: {stationLabel(view.tipoff.at[p.id]!)}</span> : 'Location unknown'
                    : ''}
                {p.carried !== null && p.role === 'heister' ? ` · ${p.carried} carried` : ''}
                {p.status !== 'active' && ` · ${p.status}`}
                {p.skipsPolice && ' · sitting out'}
                {p.cannotArrest && ' · no arrests'}
                {!p.connected && ' · offline'}
              </span>
              {actsThisPhase(view.phase, p) && (
                <span className={`ready ${p.done ? 'yes' : ''}`} title={p.done ? 'Done' : 'Thinking'}>{p.done ? '✓' : '…'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const isOfficer = (role: string) => role === 'police' || role === 'traitor';

function bannerSub(view: View): string {
  const role = view.myRole;
  switch (view.phase) {
    case 'heister': return role === 'heister' ? 'Your move. Slip through the network.' : 'The Heisters are on the move…';
    case 'police': return view.policeTurn === view.me ? 'Move, then search or arrest.' : isOfficer(role) ? 'Officers take turns. Watch the board.' : 'The Police are closing in…';
    case 'info': return role === 'heister' ? 'The Police compare notes…' : 'Share what you found. Someone is lying.';
    case 'ended': return view.endReason ?? '';
    default: return '';
  }
}

// When an accusation vote passes, everyone sees whether the accused really was the Crooked Cop.
export function RevealCard({ view }: { view: View }) {
  const id = view.reveal?.id ?? null;
  const seen = useRef(id);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (id === null || seen.current === id) return; // not for a reveal that happened before you loaded
    seen.current = id;
    setShown(id);
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [id]);

  if (shown === null || !view.reveal) return null;
  const { target, guilty } = view.reveal;
  const accused = view.players.find((p) => p.id === target);
  const who = accused?.name ?? 'The accused';
  const identity = seatIdentities(view.players)[target] ?? SPECTATOR_IDENTITY;
  return (
    <div className={`reveal-card ${guilty ? 'guilty' : 'innocent'}`} role="alert" onClick={() => setShown(null)}>
      <div className="reveal-inner">
        {accused && <TokenIcon role={guilty ? 'traitor' : 'police'} identity={identity} text={tokenText(accused)} size={110} />}
        <div className="reveal-stamp">{guilty ? 'Guilty' : 'Innocent'}</div>
        <h2>{guilty ? `${who} WAS the Crooked Cop` : `${who} is NOT the Crooked Cop`}</h2>
        <p>{guilty ? 'They are removed from the force. The Heisters just lost their inside source.'
          : "The vote passed against an honest officer. They can't arrest next round, and the real Crooked Cop is still out there."}</p>
      </div>
    </div>
  );
}

// A full-width title card that sweeps across the screen whenever the phase changes.
export function PhaseBanner({ view }: { view: View }) {
  // A fresh card also marks the moment your Police turn comes up.
  const myPoliceTurn = view.phase === 'police' && view.policeTurn === view.me;
  const key = `${view.phase}:${view.round}${myPoliceTurn ? ':me' : ''}`;
  const seen = useRef(key);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (seen.current === key) return; // no banner for the phase you joined or reloaded into
    seen.current = key;
    if (view.phase === 'setup' || view.phase === 'lobby') return; // the role card covers setup
    setShown(key);
    const t = setTimeout(() => setShown(null), view.phase === 'ended' ? 3600 : 2300);
    return () => clearTimeout(t);
  }, [key, view.phase]);

  if (!shown) return null;
  const ended = view.phase === 'ended';
  const art = ART.banner[view.phase];
  const title = ended ? (view.winner === 'heisters' ? 'The Heisters got away' : 'Case closed') : myPoliceTurn ? 'Your turn, Officer' : PHASE_NAME[view.phase];
  return (
    <div className={`phase-banner banner-${view.phase} ${ended ? `win-${view.winner}` : ''}`} key={shown} aria-hidden="true">
      <div className="band" style={art ? { backgroundImage: `url(${art})` } : undefined}>
        <div className="kicker">{ended ? 'Final verdict' : `Round ${view.round} of ${view.settings.maxRounds}`}</div>
        <div className="big">{title}</div>
        <div className="sub">{bannerSub(view)}</div>
      </div>
    </div>
  );
}

export function Envelopes({ view }: { view: View }) {
  const list = [...view.envelopes].reverse();
  if (view.phase === 'lobby') return null;
  return (
    <section className="panel envelopes">
      <h3>{view.godView ? 'All envelopes' : 'Your envelopes'}</h3>
      {list.length === 0 && <p className="muted">Search a station to receive a sealed envelope. Its contents are private to you.</p>}
      <div className="env-list">
        {list.map((e, i) => (
          <article key={e.id} className={`envelope ${e.kind} ${i === 0 ? 'newest' : ''}`} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
            <header>
              <span>{e.title}</span>
              <span className="env-round">R{e.round}{view.godView ? ` · ${view.players.find((p) => p.id === e.to)?.name}` : ''}</span>
            </header>
            <ul>{e.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Log({ view }: { view: View }) {
  const entries = [...view.log].reverse();
  return (
    <section className="panel log">
      <h3>Dispatch log</h3>
      <ul>
        {entries.map((e) => (
          <li key={e.id} className={`log-${e.kind}`}><span className="log-round">R{e.round}</span> {e.text}</li>
        ))}
      </ul>
    </section>
  );
}

const ROLE_COPY = {
  heister: {
    img: '/assets/role-heister.png',
    title: 'You are a Heister',
    body: 'Everyone knows who you are, but not where you are. Grab at least 5 Artifacts and escape through Central Terminal before round 15.',
  },
  traitor: {
    img: '/assets/role-crooked.png',
    title: 'You are the Crooked Cop',
    body: "Act like a loyal officer. After each turn you'll get a tip-off with the Heisters' exact locations. Feed the team believable lies and don't get voted out.",
  },
  police: {
    img: '/assets/role-cop.png',
    title: 'You are a Cop',
    body: 'Track the Heisters with searches and clues, arrest both of them, and watch out: one of your fellow officers is lying to you.',
  },
} as const;

export function RoleReveal({ view, onClose }: { view: View; onClose: () => void }) {
  if (view.myRole === 'spectator') return null;
  const copy = ROLE_COPY[view.myRole];
  const partner = view.myRole === 'heister' ? view.players.find((p) => p.role === 'heister' && p.id !== view.me) : null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal role-card ${view.myRole}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={copy.title}>
        <img src={copy.img} alt="" className="role-img" />
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        {partner && <p>Your partner is <strong>{partner.name}</strong> ({partner.label}). Use the Heisters chat.</p>}
        <button className="btn primary" onClick={onClose} autoFocus>Got it</button>
      </div>
    </div>
  );
}
