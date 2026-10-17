// The Crooked Cop game server on Supabase.
// Every request: load the room, apply the change with the shared rules engine,
// save it (optimistic concurrency on `version`), then broadcast each player
// their own view on a private Realtime topic named after their secret token.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { addPlayer, applyAction, createGame, GameError, kickPlayer, setConnected, tick, viewFor } from './engine/engine.ts';
import { canPost, canRead } from './engine/chat.ts';
import type { Action, ChatMessage, GameState } from './engine/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Req =
  | { op: 'create'; name: string }
  | { op: 'join'; code: string; name: string }
  | { op: 'resume'; code: string; token: string }
  | { op: 'action'; code: string; token: string; action: Action }
  | { op: 'tick'; code: string; token: string }
  | { op: 'chat'; code: string; token: string; channel: string; text: string }
  | { op: 'kick'; code: string; token: string; playerId: string }
  | { op: 'leave'; code: string; token: string };

interface Room {
  code: string;
  state: GameState;
  tokens: Record<string, string>;
  version: number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function randomHex(bytes: number) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => letters[b % letters.length]).join('');
}

async function load(code: string): Promise<Room> {
  const { data, error } = await db.from('cc_rooms').select('code,state,tokens,version').eq('code', code.toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data) throw new GameError('No room with that code.');
  return data as Room;
}

// Applies fn to the latest room, retrying if another request saved first.
async function mutate(code: string, fn: (room: Room) => Partial<Room> | null): Promise<{ before: Room; after: Room }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const before = await load(code);
    const change = fn(structuredClone(before));
    if (!change) return { before, after: before };
    const after: Room = { ...before, ...change, version: before.version + 1 };
    const { data, error } = await db.from('cc_rooms')
      .update({ state: after.state, tokens: after.tokens, version: after.version, updated_at: new Date().toISOString() })
      .eq('code', before.code).eq('version', before.version).select('code');
    if (error) throw error;
    if (data?.length) return { before, after };
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
  }
  throw new GameError('The room is busy. Try again.');
}

function playerFor(room: Room, token: string): string {
  const id = room.tokens[token];
  if (!id || !room.state.players.some((p) => p.id === id)) throw new GameError('You are no longer in this room.');
  return id;
}

async function broadcast(messages: { topic: string; event: string; payload: unknown }[]) {
  if (!messages.length) return;
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
  });
  if (!res.ok) console.error('broadcast failed', res.status, await res.text());
}

const topicFor = (token: string) => `cc-${token}`;

function viewMessages(room: Room, t: number) {
  return Object.entries(room.tokens)
    .filter(([, pid]) => room.state.players.some((p) => p.id === pid))
    .map(([token, pid]) => ({ topic: topicFor(token), event: 'view', payload: { ...viewFor(room.state, pid, t), rev: room.version } }));
}

async function chatHistory(room: Room, playerId: string): Promise<ChatMessage[]> {
  const { data, error } = await db.from('cc_messages').select('id,channel,from_player,name,text,created_at')
    .eq('room_code', room.code).order('id', { ascending: false }).limit(600);
  if (error) throw error;
  return (data ?? []).reverse()
    .filter((m) => canRead(room.state, playerId, m.channel))
    .map((m) => ({ id: String(m.id), channel: m.channel, from: m.from_player, name: m.name, text: m.text, ts: Date.parse(m.created_at) }) as ChatMessage);
}

async function historyMessages(room: Room) {
  const out = [];
  for (const [token, pid] of Object.entries(room.tokens)) {
    if (!room.state.players.some((p) => p.id === pid)) continue;
    out.push({ topic: topicFor(token), event: 'chatHistory', payload: { msgs: await chatHistory(room, pid) } });
  }
  return out;
}

async function systemChat(room: Room, text: string) {
  const { data, error } = await db.from('cc_messages')
    .insert({ room_code: room.code, channel: 'lobby', from_player: 'system', name: 'Dispatch', text })
    .select('id,created_at').single();
  if (error) throw error;
  const msg: ChatMessage = { id: String(data.id), channel: 'lobby', from: 'system', name: 'Dispatch', text, ts: Date.parse(data.created_at) };
  return Object.keys(room.tokens).map((token) => ({ topic: topicFor(token), event: 'chat', payload: msg }));
}

// Team channels open at game start and everything is readable once it ends.
const historyChanged = (a: GameState, b: GameState) =>
  a.phase !== b.phase && (a.phase === 'lobby' || b.phase === 'lobby' || b.phase === 'ended');

async function handle(req: Req) {
  const t = Date.now();
  switch (req.op) {
    case 'create': {
      const name = String(req.name ?? '').trim().slice(0, 20);
      if (!name) throw new GameError('Pick a name first.');
      const playerId = randomHex(8);
      const token = randomHex(16);
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const state = createGame(code, playerId, name, crypto.getRandomValues(new Int32Array(1))[0]);
        const { error } = await db.from('cc_rooms').insert({ code, state, tokens: { [token]: playerId }, version: 1 });
        if (!error) {
          return { code, playerId, token, view: { ...viewFor(state, playerId, t), rev: 1 }, chat: [] };
        }
        if (error.code !== '23505') throw error; // retry only on a code collision
      }
      throw new GameError('Could not create a room. Try again.');
    }

    case 'join': {
      const playerId = randomHex(8);
      const token = randomHex(16);
      const { after } = await mutate(req.code, (room) => ({
        state: addPlayer(room.state, playerId, String(req.name ?? '')),
        tokens: { ...room.tokens, [token]: playerId },
      }));
      const me = after.state.players.find((p) => p.id === playerId)!;
      const sys = await systemChat(after, `${me.name} joined${after.state.phase === 'lobby' ? '' : ' as a spectator'}.`);
      await broadcast([...viewMessages(after, t), ...sys]);
      return { code: after.code, playerId, token, view: { ...viewFor(after.state, playerId, t), rev: after.version }, chat: await chatHistory(after, playerId) };
    }

    case 'resume': {
      const room = await load(req.code);
      const playerId = playerFor(room, req.token);
      const { after } = await mutate(req.code, (r) => {
        const p = r.state.players.find((x) => x.id === playerId);
        return p && !p.connected ? { state: addPlayer(r.state, playerId, '') } : null;
      });
      const next = tick(after.state, t);
      if (next !== after.state) await handleTick(req.code);
      return { code: room.code, playerId, token: req.token, view: { ...viewFor(after.state, playerId, t), rev: after.version }, chat: await chatHistory(after, playerId) };
    }

    case 'tick':
      await handleTick(req.code);
      return { ok: true };

    case 'action': {
      let playerId = '';
      const { before, after } = await mutate(req.code, (room) => {
        playerId = playerFor(room, req.token);
        return { state: applyAction(room.state, playerId, req.action, t) };
      });
      const msgs = viewMessages(after, t);
      if (historyChanged(before.state, after.state)) msgs.push(...(await historyMessages(after)));
      await broadcast(msgs);
      return { view: { ...viewFor(after.state, playerId, t), rev: after.version } };
    }

    case 'kick': {
      let removedTokens: string[] = [];
      const { after } = await mutate(req.code, (room) => {
        const hostId = playerFor(room, req.token);
        const state = kickPlayer(room.state, hostId, req.playerId);
        removedTokens = Object.entries(room.tokens).filter(([, pid]) => pid === req.playerId).map(([tok]) => tok);
        const tokens = Object.fromEntries(Object.entries(room.tokens).filter(([, pid]) => pid !== req.playerId));
        return { state, tokens };
      });
      await broadcast([...viewMessages(after, t), ...removedTokens.map((tok) => ({ topic: topicFor(tok), event: 'left', payload: {} }))]);
      return { ok: true };
    }

    case 'leave': {
      let name = '';
      const { after } = await mutate(req.code, (room) => {
        const playerId = room.tokens[req.token];
        if (!playerId) return null;
        name = room.state.players.find((p) => p.id === playerId)?.name ?? '';
        const state = setConnected(room.state, playerId, false);
        const tokens = state.phase === 'lobby'
          ? Object.fromEntries(Object.entries(room.tokens).filter(([tok]) => tok !== req.token))
          : room.tokens;
        return { state, tokens };
      });
      const sys = name ? await systemChat(after, `${name} left.`) : [];
      await broadcast([...viewMessages(after, t), ...sys]);
      return { ok: true };
    }

    case 'chat': {
      const room = await load(req.code);
      const playerId = playerFor(room, req.token);
      const text = String(req.text ?? '').trim().slice(0, 500);
      if (!text) return { ok: true };
      const err = canPost(room.state, playerId, req.channel);
      if (err) throw new GameError(err);
      const me = room.state.players.find((p) => p.id === playerId)!;
      const { data, error } = await db.from('cc_messages')
        .insert({ room_code: room.code, channel: req.channel, from_player: playerId, name: me.name, text })
        .select('id,created_at').single();
      if (error) throw error;
      const msg: ChatMessage = {
        id: String(data.id), channel: req.channel as ChatMessage['channel'], from: playerId, name: me.name, text, ts: Date.parse(data.created_at),
      };
      await broadcast(Object.entries(room.tokens)
        .filter(([, pid]) => canRead(room.state, pid, msg.channel))
        .map(([token]) => ({ topic: topicFor(token), event: 'chat', payload: msg })));
      return { msg };
    }

    default:
      throw new GameError('Unknown request.');
  }
}

async function handleTick(code: string) {
  const t = Date.now();
  const { before, after } = await mutate(code, (room) => {
    const next = tick(room.state, t);
    return next === room.state ? null : { state: next };
  });
  if (after === before) return;
  const msgs = viewMessages(after, t);
  if (historyChanged(before.state, after.state)) msgs.push(...(await historyMessages(after)));
  await broadcast(msgs);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: Req;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  try {
    return json(await handle(body));
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Server error.' }, 500);
  }
});
