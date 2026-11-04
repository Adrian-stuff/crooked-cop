// The random-move bot, shared by the command-line bots (server/bots.ts) and the lobby's Add bot
// button (src/net/bots.ts). Given a bot's own view, it picks its legal moves, or nothing to do yet.

import { ADJ, STATIONS, linesAt, neighbours } from './map';
import type { Action, View } from './types';

const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Changes whenever the bot might have something new to do; the bot acts once per change.
export function botKey(v: View): string {
  const me = v.players.find((p) => p.id === v.me);
  if (!me) return '';
  return `${v.phase}:${v.round}:${me.done}:${me.moved}:${me.acted}:${me.station}:${v.accusation?.target ?? ''}:${v.policeTurn}`;
}

// The actions to send, in order, for this view (empty when there is nothing to do yet). Usually one;
// a free extra like Stealth Mode or Sabotage goes first, followed by the turn's real action.
// `accuseChance`: chance an officer bot calls a vote in an Information Phase.
export function botMove(v: View, accuseChance = 0.1): Action[] {
  const me = v.players.find((p) => p.id === v.me);
  if (!me || me.status !== 'active' || v.myRole === 'spectator') return [];
  const officer = v.myRole === 'police' || v.myRole === 'traitor';

  if (v.phase === 'setup' && !me.done) {
    if (!me.station) return [{ type: 'chooseStart', station: rnd(STATIONS.filter((s) => !v.exits.includes(s.id))).id }];
    return [{ type: 'ready' }];
  }
  if (v.phase === 'heister' && v.myRole === 'heister' && !me.done && me.station) {
    const out: Action[] = [];
    const solo = v.players.filter((p) => p.role === 'heister' && p.status === 'active').length === 1;
    if (solo && !me.stealthUsed && Math.random() < 0.2) out.push({ type: 'stealth' });
    const step1 = rnd(neighbours(me.station));
    const step2 = rnd(neighbours(step1).filter((s) => s !== me.station));
    out.push({ type: 'move', path: Math.random() < 0.5 && step2 ? [step1, step2] : [step1], express: false });
    return out;
  }
  if (v.phase === 'police' && officer && !me.done && me.station && v.policeTurn === me.id) {
    const out: Action[] = [];
    // A Crooked Cop sometimes sabotages a fellow officer before taking their turn.
    const marks = v.players.filter((p) => p.id !== me.id && (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
    if (v.myRole === 'traitor' && v.ultimateUnlocked && !me.sabotageUsed && marks.length && Math.random() < 0.3) {
      out.push({ type: 'sabotage', target: rnd(marks).id });
    }
    // One action per turn: sometimes arrest, otherwise search a neighbour (which moves there) or just move.
    const near = neighbours(me.station).filter((s) => !v.exitMustClear.includes(s));
    if (v.ultimateUnlocked && !me.ultimateUsed && Math.random() < 0.2) out.push({ type: 'ultimate', line: rnd(linesAt(me.station)) });
    else if (Math.random() < 0.15 && !me.cannotArrest && v.arrestsLeft > 0)
      out.push({ type: 'arrest', station: rnd(ADJ[me.station].map((n) => n.to).filter((s) => !v.exits.includes(s))) });
    else if (Math.random() < 0.6 && v.settings.searchRange > 0) out.push({ type: 'search', station: rnd(near) });
    else out.push({ type: 'move', path: [rnd(near)], express: false });
    return out;
  }
  if (v.phase === 'info') {
    if (v.accusation && officer && v.accusation.votes[me.id] === undefined) return [{ type: 'vote', yes: Math.random() < 0.5 }];
    if (!v.accusation && !v.accusationUsed && officer && Math.random() < accuseChance) {
      const suspects = v.players.filter((p) => p.id !== me.id && (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
      if (suspects.length) return [{ type: 'accuse', target: rnd(suspects).id }];
    }
    // Heisters stay out of the Information Phase.
    if (!v.accusation && !me.done && officer) return [{ type: 'ready' }];
  }
  return [];
}

export interface BotRunner {
  (v: View): void; // feed every view the bot receives
  stop(): void; // cancel a pending move; later views are ignored
}

// Wraps botMove with a human-ish pause: acts once per botKey change, after 0.6–1.8 s, on whatever
// view is newest by then.
export function botRunner(act: (action: Action) => void, accuseChance = 0.1): BotRunner {
  let lastKey = '';
  let latest: View | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const run = ((v: View) => {
    if (stopped) return;
    latest = v;
    const key = botKey(v);
    if (key === lastKey) return;
    lastKey = key;
    if (timer) return; // the pending move plays the newest view
    timer = setTimeout(() => {
      timer = null;
      if (!stopped && latest) for (const a of botMove(latest, accuseChance)) act(a);
    }, 600 + Math.random() * 1200);
  }) as BotRunner;
  run.stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return run;
}
