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

interface TopBarProps {
  view: View;
  onLeave: () => void;
  sound?: boolean;
  onSound?: (on: boolean) => void;
}

export function TopBar({ view, onLeave, sound, onSound }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/assets/logo-crooked-cop-128.png" alt="" width={36} height={36} />
        <span>The Crooked Cop</span>
      </div>
      <div className="room">Room <strong>{view.code}</strong></div>
      {onSound && (
        <button className="btn ghost small sound-toggle" aria-pressed={!!sound} onClick={() => onSound(!sound)}
          title="Play a sound when it's your move">
          {sound ? 'Sound on' : 'Sound off'}
        </button>
      )}
      <button className={`btn ghost small leave ${onSound ? 'with-sound' : ''}`} onClick={onLeave}>Leave</button>
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
                {p.cleared && <span className="tag cleared" title="A vote showed this officer is not the Crooked Cop">Cleared</span>}
                {p.afk && <span className="tag afk" title="Ran out of time without acting. Clears when they act.">AFK</span>}</span>
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
    body: 'Everyone knows who you are, but not where you are. Grab at least half of the Artifacts and escape through an Exit Station before time runs out.',
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
