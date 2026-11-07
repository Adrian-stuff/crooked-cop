import { useEffect, useRef, useState } from 'react';
import type { View } from '../../shared/types';
import type { ClientMsg, DevRoom, ServerMsg } from '../../shared/protocol';
import { USE_SUPABASE } from '../net/config';
import { wsUrl, loadSession, type Game, type Session } from '../net/useGame';
import type { TableGame } from '../net/useTableGame';

// Local dev only: on with VITE_DEV_IMPERSONATE=1 in .env.development.local. Local rooms go through the dev game
// server, which refuses anyone not on this machine. Online rooms go through a relay in the Vite dev server that
// only answers this machine and adds DEV_IMPERSONATE_KEY, which the game function checks.
export const DEV_IMPERSONATE = import.meta.env.DEV && import.meta.env.VITE_DEV_IMPERSONATE === '1';

// Tokens this machine already holds for each seat ("CODE:playerId"), so switching back and forth
// reuses them instead of handing the room a new token every time.
const TOKENS_KEY = 'crooked-cop-dev-tokens';
function tokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function remember(code: string, playerId: string, token: string) {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...tokens(), [`${code}:${playerId}`]: token }));
  } catch {
    /* storage unavailable */
  }
}

async function relay<T>(body: Record<string, string>): Promise<T> {
  const res = await fetch('/__dev/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'The dev relay is not running. Restart `npm run dev:online`.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? res.statusText);
  return data as T;
}

const ROLE: Record<string, string> = { heister: 'Heister', police: 'Officer', traitor: 'Crooked Cop', spectator: 'Spectator' };

// A floating DEV button: lists every room on the local server and takes over any player's seat in this tab.
export function DevImpersonate({ me, onSwitch }: { me?: string; onSwitch: (s: Session) => void }) {
  const [open, setOpen] = useState(false);
  const current = loadSession();
  // Take over the seat in this tab without reloading; the seat you were in stays connected.
  const enter = (code: string, playerId: string, token: string) => {
    if (current && me) remember(current.code, me, current.token);
    remember(code, playerId, token);
    onSwitch({ code, token });
    if (new URLSearchParams(location.search).get('room') !== code) history.replaceState(null, '', `?room=${code}`);
  };
  const enterRef = useRef(enter);
  enterRef.current = enter;
  const [rooms, setRooms] = useState<DevRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef<string | null>(null); // the seat a local token request is for

  const loadOnline = () => relay<{ rooms: DevRoom[] }>({ op: 'devRooms' }).then((r) => setRooms(r.rooms)).catch((e) => setError(e.message));

  useEffect(() => {
    if (!open) return;
    if (USE_SUPABASE) {
      relay<{ rooms: DevRoom[] }>({ op: 'devRooms' }).then((r) => setRooms(r.rooms)).catch((e) => setError(e.message));
      return;
    }
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
    ws.onopen = () => send({ t: 'devRooms' });
    ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      if (msg.t === 'devRooms') setRooms(msg.rooms);
      if (msg.t === 'error') setError(msg.message);
      if (msg.t === 'devToken') enterRef.current(msg.code, pending.current ?? '', msg.token);
    };
    return () => ws.close();
  }, [open]);

  const refresh = () => {
    setError(null);
    if (USE_SUPABASE) loadOnline();
    else if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ t: 'devRooms' } satisfies ClientMsg));
  };
  const become = (code: string, playerId: string) => {
    setError(null);
    const known = tokens()[`${code}:${playerId}`];
    if (known) return enter(code, playerId, known);
    if (USE_SUPABASE) {
      relay<{ code: string; token: string }>({ op: 'devImpersonate', code, playerId })
        .then((r) => enter(r.code, playerId, r.token)).catch((e) => setError(e.message));
    } else {
      pending.current = playerId;
      wsRef.current?.send(JSON.stringify({ t: 'devImpersonate', code, playerId } satisfies ClientMsg));
    }
  };
  // The room you're in comes first.
  const sorted = rooms && [...rooms].sort((a, b) => Number(b.code === current?.code) - Number(a.code === current?.code));

  return (
    <div className="dev-imp">
      {open && (
        <section className="dev-imp-panel" aria-label="Dev: impersonate a player">
          <header>
            <strong>Dev · impersonate {USE_SUPABASE ? 'online' : 'local'}</strong>
            <button className="btn ghost small" onClick={refresh}>Refresh</button>
          </header>
          <p className="muted small">Switches this tab to that seat; the seat you leave stays connected. Open another tab to watch two at once.</p>
          {error && <p className="dev-imp-error">{error}</p>}
          {rooms === null && !error && <p className="muted small">Loading…</p>}
          {rooms?.length === 0 && <p className="muted small">{USE_SUPABASE ? 'No online rooms active in the last 12 hours.' : 'No rooms on the local server.'}</p>}
          {sorted?.map((r) => (
            <div key={r.code} className="dev-imp-room">
              <div className="dev-imp-room-head">
                <strong>{r.code}</strong>
                <span className="muted small">{r.phase}{r.round ? ` · round ${r.round}` : ''}</span>
              </div>
              {r.players.map((p) => (
                <button key={p.id} className={`dev-imp-player ${p.id === me ? 'me' : ''}`} disabled={p.id === me}
                  onClick={() => become(r.code, p.id)}>
                  <span className="dev-imp-name">{p.name}{p.id === me && ' (you)'}</span>
                  <span className={`dev-imp-role ${p.role}`}>{p.label ? `${p.label} ` : ''}{r.phase === 'lobby' ? 'Seat' : ROLE[p.role] ?? p.role}</span>
                  <span className="muted small">
                    {p.status !== 'active' ? p.status : ''}{!p.connected ? ' offline' : ''}{p.afk ? ' AFK' : ''}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
      <button className="dev-imp-toggle" onClick={() => { setOpen(!open); setError(null); }} aria-expanded={open}
        title="Local dev only: take over any player's seat">
        DEV
      </button>
    </div>
  );
}

// Facilitator mode: the game lives on this device, so any seat can be played right here. Lists the seats;
// picking one plays it in this tab (see tableSeatGame), and "Facilitator" goes back.
export function TableDevSeats({ table, playing, onPlay }: { table: TableGame; playing: string | null; onPlay: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const state = table.save?.state;
  if (!state || state.phase === 'lobby') return null;
  const seats = state.players.filter((p) => p.role !== 'spectator');
  return (
    <div className="dev-imp">
      {open && (
        <section className="dev-imp-panel" aria-label="Dev: play as a seat">
          <header><strong>Dev · play as (facilitator game)</strong></header>
          <p className="muted small">Plays that seat's private screen in this tab. The game itself stays on this device.</p>
          <button className={`dev-imp-player ${playing === null ? 'me' : ''}`} disabled={playing === null} onClick={() => onPlay(null)}>
            <span className="dev-imp-name">Facilitator{playing === null && ' (you)'}</span>
          </button>
          {seats.map((p) => (
            <button key={p.id} className={`dev-imp-player ${p.id === playing ? 'me' : ''}`} disabled={p.id === playing} onClick={() => onPlay(p.id)}>
              <span className="dev-imp-name">{p.name}{p.id === playing && ' (you)'}</span>
              <span className={`dev-imp-role ${p.role}`}>{p.label ? `${p.label} ` : ''}{ROLE[p.role] ?? p.role}</span>
              <span className="muted small">{p.status !== 'active' ? p.status : ''}</span>
            </button>
          ))}
        </section>
      )}
      <button className="dev-imp-toggle" onClick={() => setOpen(!open)} aria-expanded={open} title="Local dev only: play any seat">DEV</button>
    </div>
  );
}

// The online game screen's interface, backed by the facilitator's game and acting as one seat.
export function tableSeatGame(table: TableGame, view: View, id: string, onExit: () => void): Game {
  const noop = () => {};
  return {
    conn: 'open', view, chat: [], error: table.error, clearError: table.clearError, clockOffset: 0, resuming: false,
    create: noop, join: noop, leave: onExit, kick: noop, swap: noop, switchSession: noop, say: noop,
    act: (a) => table.actAs(id, a),
  };
}
