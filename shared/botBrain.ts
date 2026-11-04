// The random-move bot, shared by the command-line bots (server/bots.ts) and the lobby's Add bot
// button (src/net/bots.ts). Given a bot's own view, it picks one legal move, or nothing to do yet.

import { ADJ, STATIONS, linesAt, neighbours } from './map';
import type { Action, View } from './types';

const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Changes whenever the bot might have something new to do; the bot acts once per change.
export function botKey(v: View): string {
  const me = v.players.find((p) => p.id === v.me);
  if (!me) return '';
  return `${v.phase}:${v.round}:${me.done}:${me.moved}:${me.acted}:${me.station}:${v.accusation?.target ?? ''}:${v.policeTurn}`;
}

// `accuseChance`: chance an officer bot calls a vote in an Information Phase.
export function botMove(v: View, accuseChance = 0.1): Action | null {
  const me = v.players.find((p) => p.id === v.me);
  if (!me || me.status !== 'active' || v.myRole === 'spectator') return null;
  const officer = v.myRole === 'police' || v.myRole === 'traitor';

  if (v.phase === 'setup' && !me.done) {
    if (!me.station) return { type: 'chooseStart', station: rnd(STATIONS.filter((s) => !v.exits.includes(s.id))).id };
    return { type: 'ready' };
  }
  if (v.phase === 'heister' && v.myRole === 'heister' && !me.done && me.station) {
    const step1 = rnd(neighbours(me.station));
    const step2 = rnd(neighbours(step1).filter((s) => s !== me.station));
    return { type: 'move', path: Math.random() < 0.5 && step2 ? [step1, step2] : [step1], express: false };
  }
  if (v.phase === 'police' && officer && !me.done && me.station && v.policeTurn === me.id) {
    // One action per turn: sometimes arrest, otherwise search a neighbour (which moves there) or just move.
    const near = neighbours(me.station).filter((s) => !v.exitMustClear.includes(s));
    if (v.ultimateUnlocked && !me.ultimateUsed && Math.random() < 0.2) return { type: 'ultimate', line: rnd(linesAt(me.station)) };
    if (Math.random() < 0.15 && !me.cannotArrest && v.arrestsLeft > 0)
      return { type: 'arrest', station: rnd(ADJ[me.station].map((n) => n.to).filter((s) => !v.exits.includes(s))) };
    if (Math.random() < 0.6 && v.settings.searchRange > 0) return { type: 'search', station: rnd(near) };
    return { type: 'move', path: [rnd(near)], express: false };
  }
  if (v.phase === 'info') {
    if (v.accusation && officer && v.accusation.votes[me.id] === undefined) return { type: 'vote', yes: Math.random() < 0.5 };
    if (!v.accusation && !v.accusationUsed && officer && Math.random() < accuseChance) {
      const suspects = v.players.filter((p) => p.id !== me.id && (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
      if (suspects.length) return { type: 'accuse', target: rnd(suspects).id };
    }
    if (!v.accusation && !me.done) return { type: 'ready' };
  }
  return null;
}
