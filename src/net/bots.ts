// In-browser bots for the lobby's Add bot button: each one joins the room as its own player over
// the same backend as this device (local WebSocket server or the Supabase function) and plays
// random legal moves through shared/botBrain. They live in this tab, so they stop if it closes.

import { botRunner, type BotRunner } from '../../shared/botBrain';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { Action, View } from '../../shared/types';
import { USE_SUPABASE } from './config';
import { WS_URL } from './useGame';
import { call } from './useSupabaseGame';

const NAMES = ['Bot Dela Cruz', 'Bot Santos', 'Bot Reyes', 'Bot Bautista', 'Bot Garcia', 'Bot Mendoza', 'Bot Ramos'];
const POLL_MS = 1500;

interface Bot {
  name: string;
  stop: () => void;
}

const bots = new Set<Bot>();

// A bot name nobody in the room is using yet.
function freeName(taken: string[]): string {
  const used = new Set(taken);
  const name = NAMES.find((n) => !used.has(n));
  if (name) return name;
  for (let i = 2; ; i++) if (!used.has(`Bot ${i}`)) return `Bot ${i}`;
}

// Joins `code` with a new bot. Resolves once it has a seat; rejects with the server's reason.
export function addBot(code: string, takenNames: string[]): Promise<void> {
  const name = freeName(takenNames);
  return USE_SUPABASE ? addOnlineBot(code, name) : addLocalBot(code, name);
}

export function stopAllBots() {
  for (const b of bots) b.stop();
  bots.clear();
}

function addLocalBot(code: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const send = (m: ClientMsg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
    const run: BotRunner = botRunner((action: Action) => send({ t: 'action', action }));
    let joined = false;
    const bot: Bot = { name, stop: () => { run.stop(); ws.close(); bots.delete(bot); } };
    ws.onopen = () => send({ t: 'join', code, name });
    ws.onmessage = (e) => {
      const msg: ServerMsg = JSON.parse(String(e.data));
      if (msg.t === 'joined' && !joined) {
        joined = true;
        bots.add(bot);
        resolve();
      } else if (msg.t === 'view') run(msg.view);
      else if (msg.t === 'error' && !joined) {
        bot.stop();
        reject(new Error(msg.message));
      } else if (msg.t === 'left') bot.stop();
    };
    ws.onerror = () => { if (!joined) reject(new Error('Could not reach the game server.')); };
    ws.onclose = () => { run.stop(); bots.delete(bot); };
  });
}

async function addOnlineBot(code: string, name: string): Promise<void> {
  const j = await call<{ code: string; token: string; view: View }>({ op: 'join', code, name });
  const session = { code: j.code, token: j.token };
  const run = botRunner((action) => { call({ op: 'action', ...session, action }).catch(() => {}); });
  let busy = false;
  // The online backend has no push for other players, so the bot polls for its view like the CLI bots.
  const poll = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await call<{ view: View }>({ op: 'resume', ...session });
      run(r.view);
    } catch {
      /* removed from the room, or a network blip: try again next poll */
    } finally {
      busy = false;
    }
  }, POLL_MS);
  const bot: Bot = { name, stop: () => { clearInterval(poll); run.stop(); bots.delete(bot); } };
  bots.add(bot);
  run(j.view);
}
