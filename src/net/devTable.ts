// Dev impersonation for online facilitator-mode games.
//
// A facilitator game lives on the facilitator's device, so that device answers dev requests itself:
// - The dev panel (local dev on the developer's machine) gets a short-lived pass from the game function,
//   which only signs one for the DEV_IMPERSONATE_KEY the local Vite relay adds. The pass carries a
//   one-time ECDH public key from the dev tab.
// - The dev tab broadcasts the pass on a discovery topic. Each linked facilitator checks the signature
//   against DEV_PASS_PUBLIC_KEY below and ignores anything else, so knowing a table code is not enough.
// - Everything after that (seat lists, private views, actions) is AES-GCM encrypted with a key only the
//   two ends can derive, so devices and eavesdroppers on the topics see nothing useful and can't forge.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { viewFor } from '../../shared/engine';
import type { Action, View } from '../../shared/types';
import { sb } from './supabase';
import type { TableGame } from './useTableGame';

// Public half of the key the game function signs dev passes with (private half: DEV_SIGNING_JWK secret).
const DEV_PASS_PUBLIC_KEY: JsonWebKey = {
  kty: 'EC', crv: 'P-256', x: 'drSIsr5hKKZ27t2lw12XQpfYcS2J3YDEuml_idoGK-k', y: 'mbbEGbkRTwSYPnxySj3aTNpQFqyKwwkWuABwE4c0IAk',
};
const DISCOVER = 'cc-devtable-discover';
const sessionTopic = (sid: string) => `cc-devtable-${sid}`;

export interface DevPass { payload: string; sig: string } // payload: JSON { clientPub, sid, exp }
export interface DevTableSeat { id: string; name: string; role: string; label?: string; status: string }
export interface DevTable { code: string; phase: string; round: number; seats: DevTableSeat[] }
interface Box { iv: string; ct: string }

// ---------- Crypto ----------

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();
function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function verifyPass(pass: DevPass): Promise<{ clientPub: JsonWebKey; sid: string; exp: number } | null> {
  try {
    const key = await crypto.subtle.importKey('jwk', DEV_PASS_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(pass.sig), utf8.encode(pass.payload));
    if (!ok) return null;
    const p = JSON.parse(pass.payload);
    return typeof p.sid === 'string' && /^[0-9a-f]{32}$/.test(p.sid) && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

const newEcdh = () => crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as Promise<CryptoKeyPair>;
async function sharedKey(priv: CryptoKey, pubJwk: JsonWebKey): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key: CryptoKey, value: unknown): Promise<Box> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8.encode(JSON.stringify(value)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function unseal<T>(key: CryptoKey, box: Box): Promise<T | null> {
  try {
    return JSON.parse(fromUtf8.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))));
  } catch {
    return null; // not for us, or tampered with
  }
}

const randomHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const subscribed = (ch: RealtimeChannel) => new Promise<void>((resolve, reject) => {
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') resolve();
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime ${status}`));
  });
});

// ---------- Facilitator side (ships in every build; does nothing without a valid pass) ----------

type ReqBody = { kind: 'watch'; as: string } | { kind: 'act'; as: string; action: Action };
type Req = ReqBody & { id: string };
interface HostSession { key: CryptoKey; ch: RealtimeChannel; exp: number; watching: Set<string>; seen: Set<string> }

export function useDevTableHost(table: TableGame, code: string | null) {
  const tableRef = useRef(table);
  useEffect(() => {
    tableRef.current = table;
  });
  const sessions = useRef(new Map<string, HostSession>());

  const summary = useCallback((): DevTable | null => {
    const s = tableRef.current.save?.state;
    if (!s || !code) return null;
    return {
      code, phase: s.phase, round: s.round,
      seats: s.players.filter((p) => p.role !== 'spectator').map((p) => ({ id: p.id, name: p.name, role: p.role, label: p.label, status: p.status })),
    };
  }, [code]);

  // Sends the seat list and every watched seat's private view to each live dev session.
  const push = useCallback(async () => {
    const s = tableRef.current.save?.state;
    for (const [sid, sess] of sessions.current) {
      if (sess.exp < Date.now()) {
        sb().removeChannel(sess.ch);
        sessions.current.delete(sid);
        continue;
      }
      try {
        sess.ch.send({ type: 'broadcast', event: 'table', payload: { code, box: await seal(sess.key, summary()) } });
        for (const as of sess.watching) {
          if (s) sess.ch.send({ type: 'broadcast', event: 'view', payload: { code, box: await seal(sess.key, { as, view: viewFor(s, as, Date.now()) }) } });
        }
      } catch {
        /* a dev nicety; never let it disturb the game */
      }
    }
  }, [code, summary]);

  useEffect(() => {
    if (!code) return;
    const all = sessions.current;
    const discover = sb().channel(DISCOVER, { config: { broadcast: { self: false } } });
    discover.on('broadcast', { event: 'hello' }, async ({ payload }) => {
      const pass = await verifyPass((payload as { pass: DevPass }).pass);
      if (!pass || all.has(pass.sid)) return;
      const mine = await newEcdh();
      const key = await sharedKey(mine.privateKey, pass.clientPub);
      const ch = sb().channel(sessionTopic(pass.sid), { config: { broadcast: { self: false } } });
      const sess: HostSession = { key, ch, exp: pass.exp, watching: new Set(), seen: new Set() };
      all.set(pass.sid, sess);
      ch.on('broadcast', { event: 'req' }, async ({ payload: p }) => {
        const { code: to, box } = p as { code: string; box: Box };
        if (to !== code || sess.exp < Date.now()) return;
        const req = await unseal<Req>(key, box);
        if (!req || sess.seen.has(req.id)) return;
        sess.seen.add(req.id);
        let error: string | null = null;
        if (req.kind === 'watch') sess.watching.add(req.as);
        else error = tableRef.current.tryAny(req.as, req.action);
        ch.send({ type: 'broadcast', event: 'res', payload: { code, box: await seal(key, { id: req.id, error }) } });
        if (req.kind === 'watch') push();
      });
      try {
        await subscribed(ch);
        const facPub = await crypto.subtle.exportKey('jwk', mine.publicKey);
        ch.send({ type: 'broadcast', event: 'hi', payload: { code, facPub } });
        push();
      } catch {
        all.delete(pass.sid);
        sb().removeChannel(ch);
      }
    });
    discover.subscribe();
    return () => {
      sb().removeChannel(discover);
      for (const sess of all.values()) sb().removeChannel(sess.ch);
      all.clear();
    };
  }, [code, push]);

  const state = table.save?.state;
  useEffect(() => {
    if (sessions.current.size) push();
  }, [state, push]);
}

// ---------- Dev side ----------

async function devPass(clientPub: JsonWebKey, sid: string): Promise<DevPass> {
  const res = await fetch('/__dev/impersonate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'devPass', clientPub, sid }),
  });
  const data = await res.json().catch(() => ({ error: 'The dev relay is not running. Restart the dev server.' }));
  if (!res.ok || data.error) throw new Error(data.error ?? res.statusText);
  return data as DevPass;
}

// Finds linked facilitator games, then watches and plays seats in them.
export function useDevTables() {
  const [tables, setTables] = useState<Record<string, DevTable>>({});
  const [views, setViews] = useState<Record<string, View>>({}); // "CODE:seatId" -> that seat's view
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const conn = useRef<{ ch: RealtimeChannel; keys: Map<string, Promise<CryptoKey>>; waiting: Map<string, (e: string | null) => void> } | null>(null);

  const stop = useCallback(() => {
    if (conn.current) sb().removeChannel(conn.current.ch);
    conn.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const search = useCallback(async () => {
    stop();
    setTables({});
    setError(null);
    setStatus('searching');
    try {
      const mine = await newEcdh();
      const sid = randomHex(16);
      // Promises, so a message right behind the facilitator's key waits for it to be worked out.
      const keys = new Map<string, Promise<CryptoKey>>();
      const waiting = new Map<string, (e: string | null) => void>();
      const ch = sb().channel(sessionTopic(sid), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'hi' }, async ({ payload }) => {
        const { code, facPub } = payload as { code: string; facPub: JsonWebKey };
        keys.set(code, sharedKey(mine.privateKey, facPub));
      })
        .on('broadcast', { event: 'table' }, async ({ payload }) => {
          const { code, box } = payload as { code: string; box: Box };
          const key = keys.get(code);
          const t = key && await unseal<DevTable>(await key, box);
          if (t) setTables((all) => ({ ...all, [code]: t }));
        })
        .on('broadcast', { event: 'view' }, async ({ payload }) => {
          const { code, box } = payload as { code: string; box: Box };
          const key = keys.get(code);
          const v = key && await unseal<{ as: string; view: View }>(await key, box);
          if (v) setViews((all) => ({ ...all, [`${code}:${v.as}`]: v.view }));
        })
        .on('broadcast', { event: 'res' }, async ({ payload }) => {
          const { code, box } = payload as { code: string; box: Box };
          const key = keys.get(code);
          const r = key && await unseal<{ id: string; error: string | null }>(await key, box);
          if (r) waiting.get(r.id)?.(r.error);
        });
      await subscribed(ch);
      conn.current = { ch, keys, waiting };
      const pass = await devPass(await crypto.subtle.exportKey('jwk', mine.publicKey), sid);
      const discover = sb().channel(DISCOVER, { config: { broadcast: { self: false } } });
      await subscribed(discover);
      discover.send({ type: 'broadcast', event: 'hello', payload: { pass } });
      setTimeout(() => sb().removeChannel(discover), 3000);
      setStatus('idle');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [stop]);

  const request = useCallback(async (code: string, req: ReqBody): Promise<string | null> => {
    const c = conn.current;
    const key = c?.keys.get(code);
    if (!c || !key) return 'Not connected to that facilitator. Search again.';
    const id = randomHex(8);
    const box = await seal(await key, { ...req, id });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        c.waiting.delete(id);
        resolve("The facilitator's device didn't answer. Is it still open?");
      }, 8000);
      c.waiting.set(id, (e) => {
        clearTimeout(timer);
        c.waiting.delete(id);
        resolve(e);
      });
      c.ch.send({ type: 'broadcast', event: 'req', payload: { code, box } });
    });
  }, []);

  const watch = useCallback((code: string, as: string) => request(code, { kind: 'watch', as }), [request]);
  const act = useCallback((code: string, as: string, action: Action) => request(code, { kind: 'act', as, action }), [request]);

  return { tables: Object.values(tables), views, status, error, search, watch, act };
}
