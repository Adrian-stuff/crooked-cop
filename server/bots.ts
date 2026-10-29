// Fills a room with bots that make random legal moves, for solo testing.
// Usage: npm run bots -- <ROOM> [count]

import WebSocket from 'ws';
import { ADJ, STATIONS, linesAt, neighbours } from '../shared/map';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { Action, View } from '../shared/types';

const [code, countArg] = process.argv.slice(2);
if (!code) {
  console.error('Usage: npm run bots -- <ROOM> [count]');
  process.exit(1);
}
const URL = process.env.GAME_URL ?? 'ws://localhost:8787';
const NAMES = ['Bot Dela Cruz', 'Bot Santos', 'Bot Reyes', 'Bot Bautista', 'Bot Garcia', 'Bot Mendoza', 'Bot Ramos'];
const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
// Chance an officer bot calls a vote in an Information Phase (BOT_ACCUSE=1 makes them always try).
const ACCUSE_CHANCE = Number(process.env.BOT_ACCUSE ?? 0.1);

// Online mode (BOTS_ONLINE=1) talks to the Supabase edge function and polls for its view.
const FN_URL = process.env.SUPABASE_FN_URL ?? 'https://hxoubdwmvrecptxzrzzp.supabase.co/functions/v1/game';
const FN_KEY = process.env.SUPABASE_KEY ?? 'sb_publishable_gC2G4XKMyYm2OvOZiazl1A_6S0U-3_5';

async function fn(body: Record<string, unknown>) {
  const res = await fetch(FN_URL, { method: 'POST', headers: { apikey: FN_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function connect(name: string, onView: (v: View, send: (m: ClientMsg) => void) => void) {
  if (process.env.BOTS_ONLINE) {
    let session: { code: string; token: string } | null = null;
    const send = (m: ClientMsg) => {
      if (m.t === 'action' && session) fn({ op: 'action', ...session, action: m.action }).catch((e) => console.log(`[${name}] ${e.message}`));
    };
    fn({ op: 'join', code: code.toUpperCase(), name }).then((j) => {
      session = { code: j.code, token: j.token };
      onView(j.view, send);
      setInterval(async () => {
        try {
          const r = await fn({ op: 'resume', ...session! });
          const v: View = r.view;
          if (v.deadline && Date.now() > v.deadline + 1500) await fn({ op: 'tick', ...session! });
          onView(v, send);
        } catch (e) {
          console.log(`[${name}] ${(e as Error).message}`);
        }
      }, 1500);
    }).catch((e) => console.log(`[${name}] ${e.message}`));
    return;
  }
  const ws = new WebSocket(URL);
  const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
  ws.on('open', () => send({ t: 'join', code: code.toUpperCase(), name }));
  ws.on('message', (data) => {
    const msg: ServerMsg = JSON.parse(String(data));
    if (msg.t === 'error') console.log(`[${name}] ${msg.message}`);
    if (msg.t === 'view') onView(msg.view, send);
  });
  ws.on('close', () => console.log(`[${name}] disconnected`));
}

function bot(name: string) {
  let busy = false;
  let lastKey = '';
  let latest: View;
  connect(name, (v, send) => {
    latest = v;
    const me = v.players.find((p) => p.id === v.me)!;
    const key = `${v.phase}:${v.round}:${me.done}:${me.moved}:${me.acted}:${me.station}:${v.accusation?.target ?? ''}:${v.policeTurn}`;
    if (key === lastKey) return;
    lastKey = key;
    if (busy) return; // the pending move below plays whatever view is newest by then
    busy = true;
    setTimeout(() => {
      busy = false;
      play(latest, send);
    }, 600 + Math.random() * 1200);
  });
}

function play(v: View, send: (m: ClientMsg) => void) {
  const me = v.players.find((p) => p.id === v.me)!;
  const act = (action: Action) => send({ t: 'action', action });
  if (me.status !== 'active' || v.myRole === 'spectator') return;
  const officer = v.myRole === 'police' || v.myRole === 'traitor';

  if (v.phase === 'setup' && !me.done) {
    if (!me.station) act({ type: 'chooseStart', station: rnd(STATIONS.filter((s) => !v.exits.includes(s.id))).id });
    else act({ type: 'ready' });
  } else if (v.phase === 'heister' && v.myRole === 'heister' && !me.done && me.station) {
    const solo = v.players.filter((p) => p.role === 'heister' && p.status === 'active').length === 1;
    if (solo && !me.stealthUsed && Math.random() < 0.2) act({ type: 'stealth' });
    const step1 = rnd(neighbours(me.station));
    const step2 = rnd(neighbours(step1).filter((s) => s !== me.station));
    act({ type: 'move', path: Math.random() < 0.5 && step2 ? [step1, step2] : [step1], express: false });
  } else if (v.phase === 'police' && officer && !me.done && me.station && v.policeTurn === me.id) {
    // One action per turn: sometimes arrest, otherwise search a neighbour (which moves there) or just move.
    const near = neighbours(me.station).filter((s) => !v.exitMustClear.includes(s));
    const marks = v.players.filter((p) => p.id !== me.id && (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
    if (v.myRole === 'traitor' && v.ultimateUnlocked && !me.sabotageUsed && marks.length && Math.random() < 0.3) {
      act({ type: 'sabotage', target: rnd(marks).id });
    }
    if (v.ultimateUnlocked && !me.ultimateUsed && Math.random() < 0.2) {
      act({ type: 'ultimate', line: rnd(linesAt(me.station)) });
    } else if (Math.random() < 0.15 && !me.cannotArrest && v.arrestsLeft > 0) {
      act({ type: 'arrest', station: rnd(ADJ[me.station].map((n) => n.to).filter((s) => !v.exits.includes(s))) });
    } else if (Math.random() < 0.6 && v.settings.searchRange > 0) {
      act({ type: 'search', station: rnd(near) });
    } else {
      act({ type: 'move', path: [rnd(near)], express: false });
    }
  } else if (v.phase === 'info') {
    if (v.accusation && officer && v.accusation.votes[me.id] === undefined) act({ type: 'vote', yes: Math.random() < 0.5 });
    else if (!v.accusation && !v.accusationUsed && officer && Math.random() < ACCUSE_CHANCE) {
      const suspects = v.players.filter((p) => p.id !== me.id && (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
      if (suspects.length) act({ type: 'accuse', target: rnd(suspects).id });
    } else if (!v.accusation && !me.done && officer) act({ type: 'ready' });
  }
}

const n = Math.max(1, Math.min(7, Number(countArg ?? 3)));
for (let i = 0; i < n; i++) setTimeout(() => bot(NAMES[i]), i * 150);
console.log(`Sending ${n} ${process.env.BOTS_ONLINE ? 'online ' : ''}bots to room ${code.toUpperCase()}…`);
