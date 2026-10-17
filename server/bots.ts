// Fills a room with bots that make random legal moves, for solo testing.
// Usage: npm run bots -- <ROOM> [count]

import WebSocket from 'ws';
import { ADJ, EXIT_STATION, STATIONS, neighbours } from '../shared/map';
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

function bot(name: string) {
  const ws = new WebSocket(URL);
  const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
  let busy = false;
  let lastKey = '';

  ws.on('open', () => send({ t: 'join', code: code.toUpperCase(), name }));
  ws.on('message', (data) => {
    const msg: ServerMsg = JSON.parse(String(data));
    if (msg.t === 'error') console.log(`[${name}] ${msg.message}`);
    if (msg.t !== 'view') return;
    const v = msg.view;
    const me = v.players.find((p) => p.id === v.me)!;
    const key = `${v.phase}:${v.round}:${me.done}:${me.moved}:${me.acted}:${me.station}:${v.accusation?.target ?? ''}`;
    if (busy || key === lastKey) return;
    lastKey = key;
    busy = true;
    setTimeout(() => {
      busy = false;
      play(v, send);
    }, 600 + Math.random() * 1200);
  });
  ws.on('close', () => console.log(`[${name}] disconnected`));
}

function play(v: View, send: (m: ClientMsg) => void) {
  const me = v.players.find((p) => p.id === v.me)!;
  const act = (action: Action) => send({ t: 'action', action });
  if (me.status !== 'active' || v.myRole === 'spectator') return;
  const officer = v.myRole === 'police' || v.myRole === 'traitor';

  if (v.phase === 'setup' && !me.station) {
    act({ type: 'chooseStart', station: rnd(STATIONS.filter((s) => !s.exit)).id });
  } else if (v.phase === 'heister' && v.myRole === 'heister' && !me.done && me.station) {
    const step1 = rnd(neighbours(me.station));
    const step2 = rnd(neighbours(step1).filter((s) => s !== me.station));
    act({ type: 'move', path: Math.random() < 0.5 && step2 ? [step1, step2] : [step1], express: false });
  } else if (v.phase === 'police' && officer && !me.done && me.station) {
    if (!me.moved) {
      const dest = rnd(neighbours(me.station).filter((s) => s !== EXIT_STATION || !v.exitMustClear));
      act({ type: 'move', path: [dest], express: false });
    } else if (!me.acted) {
      if (Math.random() < 0.15 && !me.cannotArrest && v.arrestsLeft > 0) {
        act({ type: 'arrest', station: rnd(ADJ[me.station].map((n) => n.to).filter((s) => s !== EXIT_STATION)) });
      } else {
        act({ type: 'search', station: me.station });
      }
    }
  } else if (v.phase === 'info') {
    if (v.accusation && officer && v.accusation.votes[me.id] === undefined) act({ type: 'vote', yes: Math.random() < 0.5 });
    else if (!v.accusation && !me.done) act({ type: 'ready' });
  }
}

const n = Math.max(1, Math.min(7, Number(countArg ?? 3)));
for (let i = 0; i < n; i++) setTimeout(() => bot(NAMES[i]), i * 150);
console.log(`Sending ${n} bots to room ${code.toUpperCase()}…`);
