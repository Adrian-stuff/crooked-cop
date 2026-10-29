// Local multiplayer server for development and LAN play. It holds the
// authoritative GameState in memory and sends each socket only its own View.
// The Supabase edge function follows the same flow: load state, apply the
// action, save state, publish per-player views.

import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { addPlayer, applyAction, clearAfk, createGame, GameError, kickPlayer, setConnected, swapSeat, tick, viewFor } from '../shared/engine';
import { canPost, canRead } from '../shared/chat';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { ChatMessage, GameState } from '../shared/types';

const PORT = Number(process.env.GAME_PORT ?? 8787);

interface Room {
  state: GameState;
  sockets: Map<string, Set<WebSocket>>; // playerId -> sockets
  tokens: Map<string, string>; // token -> playerId
  chat: ChatMessage[];
}

const rooms = new Map<string, Room>();
const socketInfo = new WeakMap<WebSocket, { code: string; playerId: string }>();

function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

function broadcast(room: Room) {
  const t = Date.now();
  for (const [playerId, set] of room.sockets) {
    const view = viewFor(room.state, playerId, t);
    for (const ws of set) send(ws, { t: 'view', view });
  }
}

function sendHistory(room: Room, playerId: string) {
  const msgs = room.chat.filter((m) => canRead(room.state, playerId, m.channel));
  for (const ws of room.sockets.get(playerId) ?? []) send(ws, { t: 'chatHistory', msgs });
}

function attach(ws: WebSocket, room: Room, playerId: string) {
  socketInfo.set(ws, { code: room.state.code, playerId });
  if (!room.sockets.has(playerId)) room.sockets.set(playerId, new Set());
  room.sockets.get(playerId)!.add(ws);
}

function systemChat(room: Room, text: string) {
  const msg: ChatMessage = { id: randomBytes(6).toString('hex'), channel: 'lobby', from: 'system', name: 'Dispatch', text, ts: Date.now() };
  room.chat.push(msg);
  for (const [pid, set] of room.sockets) for (const ws of set) if (canRead(room.state, pid, 'lobby')) send(ws, { t: 'chat', msg });
}

function handle(ws: WebSocket, msg: ClientMsg) {
  const info = socketInfo.get(ws);
  const room = info ? rooms.get(info.code) : undefined;

  switch (msg.t) {
    case 'create': {
      const code = newCode();
      const playerId = randomBytes(8).toString('hex');
      const token = randomBytes(16).toString('hex');
      const name = msg.name.trim().slice(0, 20);
      if (!name) throw new GameError('Pick a name first.');
      const r: Room = {
        state: createGame(code, playerId, name, randomInt(2 ** 31)),
        sockets: new Map(), tokens: new Map([[token, playerId]]), chat: [],
      };
      rooms.set(code, r);
      attach(ws, r, playerId);
      send(ws, { t: 'joined', code, playerId, token });
      broadcast(r);
      return;
    }
    case 'join': {
      const r = rooms.get(msg.code.trim().toUpperCase());
      if (!r) throw new GameError('No room with that code.');
      const playerId = randomBytes(8).toString('hex');
      const token = randomBytes(16).toString('hex');
      r.state = addPlayer(r.state, playerId, msg.name);
      r.tokens.set(token, playerId);
      attach(ws, r, playerId);
      send(ws, { t: 'joined', code: r.state.code, playerId, token });
      sendHistory(r, playerId);
      systemChat(r, `${r.state.players.find((p) => p.id === playerId)!.name} joined${r.state.phase === 'lobby' ? '' : ' as a spectator'}.`);
      broadcast(r);
      return;
    }
    case 'resume': {
      const r = rooms.get(msg.code.toUpperCase());
      const playerId = r?.tokens.get(msg.token);
      if (!r || !playerId || !r.state.players.some((p) => p.id === playerId)) {
        send(ws, { t: 'left' });
        return;
      }
      r.state = addPlayer(r.state, playerId, '');
      attach(ws, r, playerId);
      send(ws, { t: 'joined', code: r.state.code, playerId, token: msg.token });
      sendHistory(r, playerId);
      broadcast(r);
      return;
    }
    case 'leave': {
      if (!room || !info) return;
      room.sockets.get(info.playerId)?.delete(ws);
      socketInfo.delete(ws);
      const name = room.state.players.find((p) => p.id === info.playerId)?.name;
      room.state = setConnected(room.state, info.playerId, false);
      for (const [tok, pid] of room.tokens) if (pid === info.playerId && room.state.phase === 'lobby') room.tokens.delete(tok);
      if (name) systemChat(room, `${name} left.`);
      send(ws, { t: 'left' });
      broadcast(room);
      return;
    }
    case 'action': {
      if (!room || !info) throw new GameError('Join a room first.');
      const before = room.state.phase;
      room.state = applyAction(room.state, info.playerId, msg.action, Date.now());
      broadcast(room);
      // Team channels open at game start; resend history so new channels appear.
      if (before !== room.state.phase && (before === 'lobby' || room.state.phase === 'ended' || room.state.phase === 'lobby')) {
        for (const pid of room.sockets.keys()) sendHistory(room, pid);
      }
      return;
    }
    case 'kick': {
      if (!room || !info) throw new GameError('Join a room first.');
      room.state = kickPlayer(room.state, info.playerId, msg.playerId);
      for (const k of room.sockets.get(msg.playerId) ?? []) send(k, { t: 'left' });
      room.sockets.delete(msg.playerId);
      broadcast(room);
      return;
    }
    case 'swap': {
      if (!room || !info) throw new GameError('Join a room first.');
      room.state = swapSeat(room.state, info.playerId, msg.seat, msg.with);
      // Each person's token and open sockets now belong to the other id.
      const other = (pid: string) => (pid === msg.seat ? msg.with : pid === msg.with ? msg.seat : pid);
      for (const [tok, pid] of room.tokens) room.tokens.set(tok, other(pid));
      const seatSockets = room.sockets.get(msg.seat);
      const subSockets = room.sockets.get(msg.with);
      room.sockets.delete(msg.seat);
      room.sockets.delete(msg.with);
      if (subSockets) room.sockets.set(msg.seat, subSockets);
      if (seatSockets) room.sockets.set(msg.with, seatSockets);
      for (const [pid, set] of room.sockets) for (const s of set) socketInfo.set(s, { code: room.state.code, playerId: pid });
      broadcast(room);
      sendHistory(room, msg.seat);
      sendHistory(room, msg.with);
      return;
    }
    case 'chat': {
      if (!room || !info) throw new GameError('Join a room first.');
      const text = msg.text.trim().slice(0, 500);
      if (!text) return;
      const err = canPost(room.state, info.playerId, msg.channel);
      if (err) throw new GameError(err);
      const me = room.state.players.find((p) => p.id === info.playerId)!;
      const m: ChatMessage = {
        id: randomBytes(6).toString('hex'), channel: msg.channel as ChatMessage['channel'],
        from: me.id, name: me.name, text, ts: Date.now(),
      };
      room.chat.push(m);
      if (room.chat.length > 2000) room.chat.shift();
      for (const [pid, set] of room.sockets) {
        if (canRead(room.state, pid, m.channel)) for (const s of set) send(s, { t: 'chat', msg: m });
      }
      if (me.afk) {
        room.state = clearAfk(room.state, me.id);
        broadcast(room);
      }
      return;
    }
  }
}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    try {
      handle(ws, msg);
    } catch (e) {
      if (e instanceof GameError) send(ws, { t: 'error', message: e.message });
      else {
        console.error(e);
        send(ws, { t: 'error', message: 'Server error.' });
      }
    }
  });
  ws.on('close', () => {
    const info = socketInfo.get(ws);
    const room = info && rooms.get(info.code);
    if (!room || !info) return;
    const set = room.sockets.get(info.playerId);
    set?.delete(ws);
    if (!set || set.size === 0) {
      room.sockets.delete(info.playerId);
      // Lobby seats free up after a short grace period (page reloads reconnect).
      setTimeout(() => {
        if (room.sockets.has(info.playerId)) return;
        room.state = setConnected(room.state, info.playerId, false);
        broadcast(room);
        if (room.sockets.size === 0) setTimeout(() => room.sockets.size === 0 && rooms.delete(info.code), 30 * 60_000);
      }, room.state.phase === 'lobby' ? 8000 : 0);
    }
  });
});

// Phase timers.
setInterval(() => {
  const t = Date.now();
  for (const room of rooms.values()) {
    const next = tick(room.state, t);
    if (next !== room.state) {
      room.state = next;
      broadcast(room);
    }
  }
}, 250);

console.log(`Crooked Cop dev server on ws://localhost:${PORT}`);
