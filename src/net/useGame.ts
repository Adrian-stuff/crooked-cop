import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { Action, ChatMessage, View } from '../../shared/types';

export const WS_URL = import.meta.env.VITE_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

// Per-tab session, so several tabs in one browser can be different players.
const SESSION_KEY = 'crooked-cop-session';

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type ConnState = 'connecting' | 'open' | 'closed';

export function useGame(): Game {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [view, setView] = useState<View | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [resuming, setResuming] = useState(() => !!loadSession());
  const wsRef = useRef<WebSocket | null>(null);
  const retry = useRef(0);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;

    const open = () => {
      setConn('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        retry.current = 0;
        setConn('open');
        const s = loadSession();
        if (s) ws.send(JSON.stringify({ t: 'resume', code: s.code, token: s.token } satisfies ClientMsg));
        else setResuming(false);
      };
      ws.onmessage = (ev) => {
        const msg: ServerMsg = JSON.parse(ev.data);
        switch (msg.t) {
          case 'joined':
            saveSession({ code: msg.code, token: msg.token });
            setResuming(false);
            history.replaceState(null, '', `?room=${msg.code}`);
            break;
          case 'view':
            setView(msg.view);
            setClockOffset(msg.view.serverNow - Date.now());
            break;
          case 'chatHistory':
            setChat(msg.msgs);
            break;
          case 'chat':
            setChat((c) => (c.some((m) => m.id === msg.msg.id) ? c : [...c, msg.msg]));
            break;
          case 'error':
            setError(msg.message);
            break;
          case 'left':
            saveSession(null);
            setResuming(false);
            setView(null);
            setChat([]);
            break;
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConn('closed');
        timer = setTimeout(open, Math.min(5000, 500 * 2 ** retry.current++));
      };
    };
    open();
    return () => {
      disposed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError('Not connected to the server. Reconnecting…');
  }, []);

  const act = useCallback((action: Action) => send({ t: 'action', action }), [send]);

  return {
    conn, view, chat, error, clearError: () => setError(null), clockOffset, resuming,
    create: (name: string) => send({ t: 'create', name }),
    join: (code: string, name: string) => send({ t: 'join', code, name }),
    leave: () => {
      send({ t: 'leave' });
      history.replaceState(null, '', location.pathname);
    },
    kick: (playerId: string) => send({ t: 'kick', playerId }),
    swap: (seat: string, withId: string) => send({ t: 'swap', seat, with: withId }),
    say: (channel: string, text: string) => send({ t: 'chat', channel, text }),
    act,
  };
}

export interface Game {
  conn: ConnState;
  view: View | null;
  chat: ChatMessage[];
  error: string | null;
  clearError: () => void;
  clockOffset: number;
  resuming: boolean;
  create: (name: string) => void;
  join: (code: string, name: string) => void;
  leave: () => void;
  kick: (playerId: string) => void;
  swap: (seat: string, withId: string) => void; // host: put a spectator into an AFK or offline player's seat
  say: (channel: string, text: string) => void;
  act: (action: Action) => void;
}
