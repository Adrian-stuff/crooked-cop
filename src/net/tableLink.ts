// Links extra devices to a facilitator-mode game. The facilitator's device stays the only copy of
// the game: it pushes a public view to the table display and each officer's own view to the cops
// device, over a Realtime broadcast topic named after a room code. The cops device sends the
// current officer's action back, and the facilitator applies it like any other recorded move.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { viewFor } from '../../shared/engine';
import type { Action, GameState, View } from '../../shared/types';
import { sb } from './supabase';
import type { TableGame } from './useTableGame';

export type DeviceKind = 'display' | 'cops';

export interface TableSync {
  rev: number;
  display: View; // what anyone at the table may see
  cops: Record<string, View>; // each officer's own view, envelopes included
  paused: number | null; // ms left on the timer while paused
}

interface ActMsg { id: string; as: string; action: Action }
interface ResultMsg { id: string; error: string | null }

const DISPLAY_ID = 'table-display';
const topic = (code: string) => `cc-table-${code}`;

// No 0/O or 1/I, so a code read across the table can't be misheard.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newLinkCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export const deviceUrl = (kind: DeviceKind, code: string) => `${location.origin}${location.pathname}?${kind}=${code}`;

let lastRev = 0;
function syncFor(g: GameState, paused: number | null): TableSync {
  const t = Date.now();
  lastRev = Math.max(t, lastRev + 1);
  const officers = g.phase === 'lobby' ? [] : g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
  const cops = Object.fromEntries(officers.map((p) => {
    const v = viewFor(g, p.id, t);
    return [p.id, { ...v, log: v.log.slice(-25) }]; // the cops device only needs recent lines; keeps the message small
  }));
  return { rev: lastRev, display: viewFor(g, DISPLAY_ID, t), cops, paused };
}

// Asks the browser to keep the screen on while a table device is showing the game.
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const grab = () => {
      if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    };
    grab();
    document.addEventListener('visibilitychange', grab);
    return () => {
      document.removeEventListener('visibilitychange', grab);
      lock?.release().catch(() => {});
    };
  }, []);
}

// ---------- Facilitator side ----------

export function useFacilitatorLink(table: TableGame) {
  const code = table.save?.link ?? null;
  const [online, setOnline] = useState(false);
  const [devices, setDevices] = useState<Record<DeviceKind, number>>({ display: 0, cops: 0 });
  const chRef = useRef<RealtimeChannel | null>(null);
  const tableRef = useRef(table);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    tableRef.current = table;
  });

  const push = useCallback(() => {
    const ch = chRef.current;
    const s = tableRef.current.save;
    if (!ch || !s) return;
    ch.send({ type: 'broadcast', event: 'sync', payload: syncFor(s.state, s.paused) });
  }, []);

  useEffect(() => {
    if (!code) return;
    const ch = sb().channel(topic(code), { config: { broadcast: { self: false }, presence: { key: 'facilitator' } } });
    ch.on('broadcast', { event: 'hello' }, () => push())
      .on('broadcast', { event: 'act' }, ({ payload }) => {
        const { id, as, action } = payload as ActMsg;
        if (seen.current.has(id)) return; // a resend of something already applied
        seen.current.add(id);
        const error = tableRef.current.tryAs(as, action);
        ch.send({ type: 'broadcast', event: 'result', payload: { id, error } satisfies ResultMsg });
      })
      .on('presence', { event: 'sync' }, () => {
        const counts: Record<DeviceKind, number> = { display: 0, cops: 0 };
        for (const metas of Object.values(ch.presenceState<{ kind: string }>())) {
          for (const m of metas) if (m.kind === 'display' || m.kind === 'cops') counts[m.kind]++;
        }
        setDevices(counts);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          chRef.current = ch;
          setOnline(true);
          ch.track({ kind: 'facilitator' });
          push();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setOnline(false);
        }
      });
    return () => {
      chRef.current = null;
      sb().removeChannel(ch);
      setOnline(false);
      setDevices({ display: 0, cops: 0 });
    };
  }, [code, push]);

  // Every recorded change, pause and resume goes straight out to the devices.
  const state = table.save?.state;
  const paused = table.save?.paused;
  useEffect(() => push(), [state, paused, push]);

  return { code, online, devices };
}

export type FacilitatorLink = ReturnType<typeof useFacilitatorLink>;

// ---------- Device side ----------

export function useTableDevice(code: string, kind: DeviceKind) {
  const [sync, setSync] = useState<TableSync | null>(null);
  const [offset, setOffset] = useState(0);
  const [online, setOnline] = useState(false);
  const [facilitator, setFacilitator] = useState(false);
  const chRef = useRef<RealtimeChannel | null>(null);
  const rev = useRef(0);
  const waiting = useRef(new Map<string, (error: string | null) => void>());
  useWakeLock();

  useEffect(() => {
    const ch = sb().channel(topic(code), { config: { broadcast: { self: false }, presence: { key: `${kind}-${Math.random().toString(36).slice(2, 8)}` } } });
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => {
      const s = payload as TableSync;
      if (s.rev <= rev.current) return;
      rev.current = s.rev;
      setSync(s);
      setOffset(s.display.serverNow - Date.now());
    })
      .on('broadcast', { event: 'result' }, ({ payload }) => {
        const { id, error } = payload as ResultMsg;
        waiting.current.get(id)?.(error);
        waiting.current.delete(id);
      })
      .on('presence', { event: 'sync' }, () => setFacilitator('facilitator' in ch.presenceState()))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          chRef.current = ch;
          setOnline(true);
          ch.track({ kind });
          ch.send({ type: 'broadcast', event: 'hello', payload: {} });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setOnline(false);
        }
      });
    return () => {
      chRef.current = null;
      sb().removeChannel(ch);
    };
  }, [code, kind]);

  // Keep asking until the facilitator's device answers (it may be opened after this one).
  useEffect(() => {
    if (sync) return;
    const id = setInterval(() => chRef.current?.send({ type: 'broadcast', event: 'hello', payload: {} }), 3000);
    return () => clearInterval(id);
  }, [sync]);

  // Sends an officer's action to the facilitator. Resolves with the rules error, or null once applied.
  const act = useCallback((as: string, action: Action) => new Promise<string | null>((resolve) => {
    const ch = chRef.current;
    if (!ch) return resolve('Not connected. Check the internet connection.');
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      waiting.current.delete(id);
      resolve("The facilitator's device didn't answer. Is it still open?");
    }, 8000);
    waiting.current.set(id, (error) => {
      clearTimeout(timer);
      resolve(error);
    });
    ch.send({ type: 'broadcast', event: 'act', payload: { id, as, action } satisfies ActMsg });
  }), []);

  return { sync, offset, online, facilitator, act };
}
