// Same interface as useGame, backed by the Supabase `game` edge function.
// Requests go over HTTP; each player's private view and chat arrive on a
// Realtime broadcast topic named after their secret token.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, ChatMessage, View } from '../../shared/types';
import type { ConnState, Game } from './useGame';
import { sb } from './supabase';

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
function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function call<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('game', { body });
  if (error) {
    // Game errors come back as HTTP 400 with { error }.
    const ctx = (error as { context?: Response }).context;
    let message = 'Could not reach the game server.';
    try {
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return data as T;
}

interface Joined {
  code: string;
  playerId: string;
  token: string;
  view: View;
  chat: ChatMessage[];
}

export function useSupabaseGame(): Game {
  const [conn, setConn] = useState<ConnState>('open');
  const [view, setView] = useState<View | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [resuming, setResuming] = useState(() => !!loadSession());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const revRef = useRef(0);

  const applyView = useCallback((v: View) => {
    if ((v.rev ?? 0) < revRef.current) return;
    revRef.current = v.rev ?? 0;
    setView(v);
    setClockOffset(v.serverNow - Date.now());
  }, []);

  const reset = useCallback(() => {
    saveSession(null);
    setSession(null);
    setView(null);
    setChat([]);
    revRef.current = 0;
  }, []);

  const onJoined = useCallback((j: Joined) => {
    const s = { code: j.code, token: j.token };
    saveSession(s);
    setSession(s);
    revRef.current = 0;
    applyView(j.view);
    setChat(j.chat);
    history.replaceState(null, '', `?room=${j.code}`);
  }, [applyView]);

  // Resume a session from this tab after a reload.
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    call<Joined>({ op: 'resume', ...s })
      .then(onJoined)
      .catch(() => reset())
      .finally(() => setResuming(false));
  }, [onJoined, reset]);

  // Private realtime topic for this player.
  useEffect(() => {
    if (!session) return;
    const ch = sb().channel(`cc-${session.token}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'view' }, ({ payload }) => applyView(payload as View))
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setChat((c) => (c.some((m) => m.id === msg.id) ? c : [...c, msg]));
      })
      .on('broadcast', { event: 'chatHistory' }, ({ payload }) => setChat((payload as { msgs: ChatMessage[] }).msgs))
      .on('broadcast', { event: 'left' }, () => reset())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConn('open');
          // Catch up on anything missed while (re)connecting.
          call<Joined>({ op: 'resume', ...session }).then((j) => { applyView(j.view); setChat(j.chat); }).catch(() => {});
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('closed');
        }
      });
    channelRef.current = ch;
    return () => {
      sb().removeChannel(ch);
      channelRef.current = null;
    };
  }, [session, applyView, reset]);

  // Phase timers: when a deadline passes, ask the server to advance.
  useEffect(() => {
    if (!session || !view?.deadline) return;
    const wait = view.deadline - (Date.now() + clockOffset) + 300 + Math.random() * 900;
    let retry: ReturnType<typeof setInterval>;
    const timer = setTimeout(() => {
      const fire = () => call({ op: 'tick', ...session }).catch(() => {});
      fire();
      retry = setInterval(fire, 4000);
    }, Math.max(0, wait));
    return () => {
      clearTimeout(timer);
      clearInterval(retry);
    };
  }, [session, view?.deadline, clockOffset]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const act = useCallback((action: Action) => {
    if (!session) return;
    run(async () => {
      const r = await call<{ view: View }>({ op: 'action', ...session, action });
      applyView(r.view);
    });
  }, [session, run, applyView]);

  return {
    conn, view, chat, error, clearError: () => setError(null), clockOffset, resuming,
    create: (name: string) => run(async () => onJoined(await call<Joined>({ op: 'create', name }))),
    join: (code: string, name: string) => run(async () => onJoined(await call<Joined>({ op: 'join', code, name }))),
    leave: () => run(async () => {
      if (session) await call({ op: 'leave', ...session }).catch(() => {});
      reset();
      history.replaceState(null, '', location.pathname);
    }),
    kick: (playerId: string) => { if (session) run(() => call({ op: 'kick', ...session, playerId })); },
    // Dev impersonation: resume as another seat. The realtime topic follows the new token; no leave is sent.
    switchSession: (s: Session) => run(async () => onJoined(await call<Joined>({ op: 'resume', ...s }))),
    swap: (seat: string, withId: string) => { if (session) run(() => call({ op: 'swap', ...session, seat, with: withId })); },
    say: (channel: string, text: string) => { if (session) run(async () => {
      const r = await call<{ msg?: ChatMessage }>({ op: 'chat', ...session, channel, text });
      const msg = r.msg;
      if (msg) setChat((c) => (c.some((m) => m.id === msg.id) ? c : [...c, msg]));
    }); },
    act,
  };
}
