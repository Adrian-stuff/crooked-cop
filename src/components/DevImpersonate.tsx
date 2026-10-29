import { useEffect, useRef, useState } from 'react';
import type { ClientMsg, DevRoom, ServerMsg } from '../../shared/protocol';
import { USE_SUPABASE } from '../net/config';
import { WS_URL, saveSession } from '../net/useGame';

// Local dev only: on with VITE_DEV_IMPERSONATE=1 in .env.development.local. Local rooms go through the dev game
// server, which refuses anyone not on this machine. Online rooms go through a relay in the Vite dev server that
// only answers this machine and adds DEV_IMPERSONATE_KEY, which the game function checks.
export const DEV_IMPERSONATE = import.meta.env.DEV && import.meta.env.VITE_DEV_IMPERSONATE === '1';

// Become that player in this tab: the normal resume flow picks the new session up.
function enter(code: string, token: string) {
  saveSession({ code, token });
  location.href = `${location.pathname}?room=${code}`;
}

async function relay<T>(body: Record<string, string>): Promise<T> {
  const res = await fetch('/__dev/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'The dev relay is not running. Restart `npm run dev:online`.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? res.statusText);
  return data as T;
}

const ROLE: Record<string, string> = { heister: 'Heister', police: 'Officer', traitor: 'Crooked Cop', spectator: 'Spectator' };

// A floating DEV button: lists every room on the local server and takes over any player's seat in this tab.
export function DevImpersonate({ me }: { me?: string }) {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<DevRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadOnline = () => relay<{ rooms: DevRoom[] }>({ op: 'devRooms' }).then((r) => setRooms(r.rooms)).catch((e) => setError(e.message));

  useEffect(() => {
    if (!open) return;
    if (USE_SUPABASE) {
      relay<{ rooms: DevRoom[] }>({ op: 'devRooms' }).then((r) => setRooms(r.rooms)).catch((e) => setError(e.message));
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
    ws.onopen = () => send({ t: 'devRooms' });
    ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      if (msg.t === 'devRooms') setRooms(msg.rooms);
      if (msg.t === 'error') setError(msg.message);
      if (msg.t === 'devToken') enter(msg.code, msg.token);
    };
    return () => ws.close();
  }, [open]);

  const refresh = () => {
    setError(null);
    if (USE_SUPABASE) loadOnline();
    else if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ t: 'devRooms' } satisfies ClientMsg));
  };
  const become = (code: string, playerId: string) => {
    if (USE_SUPABASE) {
      relay<{ code: string; token: string }>({ op: 'devImpersonate', code, playerId }).then((r) => enter(r.code, r.token)).catch((e) => setError(e.message));
    } else {
      wsRef.current?.send(JSON.stringify({ t: 'devImpersonate', code, playerId } satisfies ClientMsg));
    }
  };

  return (
    <div className="dev-imp">
      {open && (
        <section className="dev-imp-panel" aria-label="Dev: impersonate a player">
          <header>
            <strong>Dev · impersonate {USE_SUPABASE ? 'online' : 'local'}</strong>
            <button className="btn ghost small" onClick={refresh}>Refresh</button>
          </header>
          <p className="muted small">Takes over a seat in this tab. Open another tab to play a second seat.</p>
          {error && <p className="dev-imp-error">{error}</p>}
          {rooms === null && !error && <p className="muted small">Loading…</p>}
          {rooms?.length === 0 && <p className="muted small">{USE_SUPABASE ? 'No online rooms active in the last 12 hours.' : 'No rooms on the local server.'}</p>}
          {rooms?.map((r) => (
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
