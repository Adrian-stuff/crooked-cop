// The Crooked Cop rules engine. Pure and deterministic: the server owns a
// GameState, applies actions, and sends each player only viewFor(state, id).
// It runs the same in the Node dev server and in a Supabase edge function.

import {
  ADJ, EXIT_STATION, STATIONS, distance, isAdjacent, lineName, linesAt, stationLabel,
} from './map.ts';
import {
  DEFAULT_SETTINGS, type Action, type Envelope, type GameState, type LogEntry, type Player,
  type PublicPlayer, type PublicRole, type Settings, type View,
} from './types.ts';

export class GameError extends Error {}

const fail = (msg: string): never => {
  throw new GameError(msg);
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

// ---------- RNG (mulberry32, state kept in GameState so replays are exact) ----------

function rand(g: GameState): number {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(g: GameState, arr: T[]): T => arr[Math.floor(rand(g) * arr.length)];
function shuffle<T>(g: GameState, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Creation / lobby ----------

function blankPlayer(id: string, name: string, isHost: boolean): Player {
  return {
    id, name, isHost, connected: true, wantsSpectate: false, role: 'police', status: 'active',
    station: null, carried: 0, done: false, moved: false, acted: null, envelopeGiven: false,
  };
}

export function createGame(code: string, hostId: string, hostName: string, seed: number): GameState {
  return {
    code, rng: seed | 0, settings: { ...DEFAULT_SETTINGS }, phase: 'lobby', round: 0, deadline: null,
    players: [blankPlayer(hostId, hostName, true)], artifacts: {}, announcedTaken: 0, visits: [],
    pickups: [], arrestsThisRound: 0, exitStreak: 0, exitMustClear: false, accusation: null,
    accusationUsed: false, envelopes: [], log: [], winner: null, endReason: null, trails: {}, nextId: 1,
    policeTurn: null, reveal: null, tipoff: null,
  };
}

export function addPlayer(state: GameState, id: string, name: string): GameState {
  const g = structuredClone(state);
  const existing = g.players.find((p) => p.id === id);
  if (existing) {
    existing.connected = true;
    return g;
  }
  const clean = name.trim().slice(0, 20);
  if (!clean) fail('Pick a name first.');
  if (g.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) fail('That name is taken in this room.');
  const p = blankPlayer(id, clean, false);
  if (g.phase !== 'lobby') {
    p.role = 'spectator';
    p.wantsSpectate = true;
    p.status = 'active';
  } else if (g.players.filter((x) => !x.wantsSpectate).length >= MAX_PLAYERS) {
    p.wantsSpectate = true;
  }
  g.players.push(p);
  return g;
}

export function setConnected(state: GameState, id: string, connected: boolean): GameState {
  const g = structuredClone(state);
  const p = g.players.find((x) => x.id === id);
  if (!p) return g;
  p.connected = connected;
  if (g.phase === 'lobby' && !connected) {
    g.players = g.players.filter((x) => x.id !== id);
  }
  // Hand the host role on only in the lobby; mid-game a reload should not cost it.
  if (g.phase === 'lobby' && (!g.players.some((x) => x.isHost) || (p.isHost && !connected))) {
    const next = g.players.find((x) => x.connected && x.id !== id);
    if (next) {
      g.players.forEach((x) => (x.isHost = false));
      next.isHost = true;
    }
  }
  return g;
}

export function kickPlayer(state: GameState, hostId: string, targetId: string): GameState {
  const g = structuredClone(state);
  if (!g.players.find((p) => p.id === hostId)?.isHost) fail('Only the host can remove players.');
  if (g.phase !== 'lobby') fail('Players can only be removed in the lobby.');
  g.players = g.players.filter((p) => p.id !== targetId || p.isHost);
  return g;
}

// ---------- Helpers ----------

const activeHeisters = (g: GameState) => g.players.filter((p) => p.role === 'heister' && p.status === 'active');
const activePolice = (g: GameState) =>
  g.players.filter((p) => (p.role === 'police' || p.role === 'traitor') && p.status === 'active');
const isPolice = (p: Player) => p.role === 'police' || p.role === 'traitor';

// Station names like "Taft Ave." would otherwise end sentences with "..".
const tidy = (text: string) => text.replace(/\.\.(?=\s|$)/g, '.');

function log(g: GameState, kind: LogEntry['kind'], text: string) {
  g.log.push({ id: g.nextId++, round: g.round, kind, text: tidy(text) });
}

function envelope(g: GameState, to: string, kind: Envelope['kind'], title: string, lines: string[]) {
  g.envelopes.push({ id: `e${g.nextId++}`, to, round: g.round, kind, title, lines: lines.map(tidy) });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function heisterTag(p: Player) {
  return `${p.label} (${p.name})`;
}

export function heisterCountFor(settings: Settings, n: number): number {
  if (n >= 8) return 2;
  if (n < 6) return 1;
  return settings.heisterCount === 'auto' ? 2 : settings.heisterCount;
}

// Validates a move path (the stations after the start).
export function validatePath(from: string, path: string[], express: boolean): void {
  if (path.length === 0) fail('Pick at least one station to move.');
  if (express ? path.length > 4 : path.length > 2) {
    fail(express ? 'Express moves at most 4 stations.' : 'You can move 1 to 2 stations.');
  }
  const seen = new Set([from]);
  let prev = from;
  let lines: Set<string> | null = null; // lines an Express move can still be on
  for (const st of path) {
    if (seen.has(st)) fail('A move cannot visit the same station twice.');
    if (!isAdjacent(prev, st)) fail('Stations must be connected by a line.');
    if (express) {
      const shared = new Set(ADJ[prev].filter((n) => n.to === st).map((n) => n.line));
      const next: Set<string> = lines ? new Set([...lines].filter((l) => shared.has(l))) : shared;
      if (next.size === 0) fail('Express must stay on one line.');
      lines = next;
    }
    seen.add(st);
    prev = st;
  }
}

// ---------- Phase transitions ----------

function startGame(g: GameState, t: number) {
  const seats = g.players.filter((p) => !p.wantsSpectate);
  if (seats.length < MIN_PLAYERS) fail(`Need at least ${MIN_PLAYERS} players (not spectating).`);
  if (seats.length > MAX_PLAYERS) fail(`At most ${MAX_PLAYERS} players can play.`);
  const nHeisters = heisterCountFor(g.settings, seats.length);
  const order = shuffle(g, seats);
  order.forEach((p, i) => {
    p.role = i < nHeisters ? 'heister' : i === nHeisters ? 'traitor' : 'police';
    p.label = i < nHeisters ? `H${i + 1}` : undefined;
  });
  for (const p of g.players) {
    if (p.wantsSpectate) p.role = 'spectator';
    Object.assign(p, {
      status: 'active', station: null, carried: 0, done: false, moved: false, acted: null,
      envelopeGiven: false, skipPoliceRound: undefined, noArrestRound: undefined, cleared: false, expressRound: undefined,
    });
  }
  const candidates = STATIONS.filter((s) => !s.exit).map((s) => s.id);
  g.artifacts = {};
  for (const id of shuffle(g, candidates).slice(0, g.settings.artifactCount)) g.artifacts[id] = 1;
  Object.assign(g, {
    round: 0, visits: [], pickups: [], arrestsThisRound: 0, exitStreak: 0, exitMustClear: false,
    accusation: null, accusationUsed: false, envelopes: [], log: [], winner: null, endReason: null,
    trails: {}, announcedTaken: 0, policeTurn: null, reveal: null, tipoff: null,
  });
  g.phase = 'setup';
  g.deadline = t + g.settings.setupSeconds * 1000;
  const heisterNames = g.players.filter((p) => p.role === 'heister').map(heisterTag).join(' and ');
  log(g, 'announce', `The heist is on. ${heisterNames} ${nHeisters > 1 ? 'are' : 'is'} the Heister${nHeisters > 1 ? 's' : ''}. One officer is crooked.`);
  log(g, 'info', 'Setup: everyone picks a starting station and can change it until they lock in. Only the Police team sees officer picks, and Heisters pick in secret.');
}

// Applies a starting station once setup is over (picks before that are just choices).
function placeAt(g: GameState, p: Player, station: string) {
  p.station = station;
  if (p.role === 'heister') {
    g.trails[p.id] = [{ round: g.round, station }];
    g.visits.push({ heister: p.id, station, round: g.round });
    collect(g, p, station);
  }
}

function collect(g: GameState, p: Player, station: string) {
  const n = g.artifacts[station] ?? 0;
  if (n > 0) {
    p.carried += n;
    delete g.artifacts[station];
    g.pickups.push({ station, round: g.round });
  }
}

function finishSetup(g: GameState, t: number) {
  const free = STATIONS.filter((s) => !s.exit).map((s) => s.id);
  for (const p of g.players) {
    if (p.role === 'spectator') continue;
    if (!p.station) p.autoPlaced = true;
    placeAt(g, p, p.station ?? pick(g, free));
  }
  // Officer picks stay hidden from the Heisters until now, so announce them all at once.
  for (const p of g.players.filter(isPolice)) {
    log(g, 'info', `${p.name} ${p.autoPlaced ? 'was placed' : 'starts'} at ${stationLabel(p.station!)}.`);
    delete p.autoPlaced;
  }
  beginRound(g, 1, t);
}

function beginRound(g: GameState, round: number, t: number) {
  if (round > g.settings.maxRounds) {
    return endGame(g, 'police', `Time's up. ${g.settings.maxRounds} rounds passed without an escape.`);
  }
  g.round = round;
  g.phase = 'heister';
  g.deadline = t + g.settings.heisterSeconds * 1000;
  g.accusation = null;
  g.accusationUsed = false;
  for (const p of g.players) p.done = !(p.role === 'heister' && p.status === 'active');
  log(g, 'info', `Round ${round}: the Heisters are on the move.`);
}

function endHeisterPhase(g: GameState, t: number) {
  const taken = g.players
    .filter((p) => p.role === 'heister' && p.status !== 'arrested')
    .reduce((sum, p) => sum + p.carried, 0);
  g.announcedTaken = taken;
  log(g, 'announce', `${plural(taken, 'Artifact')} of ${g.settings.artifactCount} ${taken === 1 ? 'has' : 'have'} been taken.`);
  g.phase = 'police';
  g.policeTurn = null;
  g.arrestsThisRound = 0;
  for (const p of g.players) {
    p.moved = false;
    p.acted = null;
    p.envelopeGiven = false;
    const skipping = p.skipPoliceRound === g.round;
    p.done = !(isPolice(p) && p.status === 'active') || skipping;
    if (isPolice(p) && p.status === 'active' && skipping) log(g, 'info', `${p.name} sits out this Police Phase (wrong arrest).`);
  }
  if (g.exitMustClear) log(g, 'info', `Exit rule: ${stationLabel(EXIT_STATION)} must be empty of officers at the end of this round.`);
  log(g, 'info', 'Police Phase: officers take turns, one action each: Move, Express, Search or Arrest.');
  maybeEndPolicePhase(g, t);
}

function finishPoliceTurn(g: GameState, p: Player) {
  if (p.done) return;
  p.done = true;
  if (p.role === 'traitor' && !p.envelopeGiven && (p.moved || p.acted)) {
    p.envelopeGiven = true;
    const lines = g.players
      .filter((h) => h.role === 'heister')
      .map((h) =>
        h.status === 'active'
          ? `${heisterTag(h)} is at ${stationLabel(h.station!)}.`
          : `${heisterTag(h)} is ${h.status}.`,
      );
    envelope(g, p.id, 'traitor', 'Crooked tip-off', lines);
    g.tipoff = {
      round: g.round,
      at: Object.fromEntries(g.players.filter((h) => h.role === 'heister').map((h) => [h.id, h.status === 'active' ? h.station : null])),
    };
  }
}

// Officers act one at a time in seat order. Hands the turn on once the current officer is done,
// and ends the phase when nobody is left.
function maybeEndPolicePhase(g: GameState, t: number) {
  if (g.phase !== 'police') return;
  const current = g.players.find((p) => p.id === g.policeTurn);
  if (current && !current.done && current.status === 'active') return;
  const next = activePolice(g).find((p) => !p.done);
  if (!next) return endPolicePhase(g, t);
  g.policeTurn = next.id;
  g.deadline = t + g.settings.policeSeconds * 1000;
}

function endPolicePhase(g: GameState, t: number) {
  for (const p of activePolice(g)) finishPoliceTurn(g, p);
  g.policeTurn = null;
  if (g.exitMustClear) {
    for (const p of activePolice(g)) {
      if (p.station === EXIT_STATION) {
        const dest = ADJ[EXIT_STATION][0].to;
        p.station = dest;
        log(g, 'info', `${p.name} was moved off ${stationLabel(EXIT_STATION)} to ${stationLabel(dest)} (exit occupancy limit).`);
      }
    }
  }
  const atExit = activePolice(g).some((p) => p.station === EXIT_STATION);
  g.exitStreak = atExit ? g.exitStreak + 1 : 0;
  g.exitMustClear = g.exitStreak >= 2;
  g.phase = 'info';
  g.deadline = t + g.settings.infoSeconds * 1000;
  for (const p of g.players) {
    p.done = !((isPolice(p) || p.role === 'heister') && p.status === 'active');
  }
  log(g, 'info', 'Information Phase: compare notes. Any officer may call a vote on the Crooked Cop.');
}

function maybeEndInfoPhase(g: GameState, t: number) {
  if (g.phase !== 'info' || g.accusation) return;
  const relevant = g.players.filter((p) => (isPolice(p) || p.role === 'heister') && p.status === 'active');
  if (relevant.every((p) => p.done)) beginRound(g, g.round + 1, t);
}

function endGame(g: GameState, winner: 'heisters' | 'police', reason: string) {
  g.phase = 'ended';
  g.deadline = null;
  g.winner = winner;
  g.endReason = reason;
  g.accusation = null;
  log(g, 'win', `${winner === 'heisters' ? 'Heisters' : 'Police'} win. ${reason}`);
  const traitor = g.players.find((p) => p.role === 'traitor');
  if (traitor) {
    const outcome = traitor.status === 'exposed'
      ? 'and was exposed'
      : winner === 'heisters' ? 'and wins with the Heisters' : 'and was never caught';
    log(g, 'expose', `The Crooked Cop was ${traitor.name}, ${outcome}.`);
  }
}

function checkPoliceWin(g: GameState) {
  const heisters = g.players.filter((p) => p.role === 'heister');
  if (heisters.every((h) => h.status === 'arrested')) {
    endGame(g, 'police', heisters.length > 1 ? 'Both Heisters were arrested.' : 'The Heister was arrested.');
  }
}

// ---------- Clues ----------

function fieldClue(g: GameState): string {
  const hs = activeHeisters(g);
  if (hs.length === 0) return 'The radio is quiet.';
  const h = pick(g, hs);
  const here = h.station!;
  const options: (() => string | null)[] = [
    () => `A Heister is somewhere on the ${lineName(pick(g, linesAt(here)))} line.`,
    () => {
      const near = STATIONS.filter((s) => s.id !== here && distance(here, s.id) <= 3);
      return near.length ? `A Heister is within 3 stops of ${stationLabel(pick(g, near).id)}.` : null;
    },
    () => {
      const far = STATIONS.filter((s) => distance(here, s.id) >= 4);
      return far.length ? `${heisterTag(h)} is NOT within 3 stops of ${stationLabel(pick(g, far).id)}.` : null;
    },
    () => `${heisterTag(h)} is carrying ${plural(h.carried, 'Artifact')}.`,
    () => {
      const recent = g.visits.filter((v) => v.round >= g.round - 2 && v.round > 0);
      return recent.length ? `A Heister passed through ${stationLabel(pick(g, recent).station)} in the last 2 rounds.` : null;
    },
  ];
  for (const fn of shuffle(g, options)) {
    const clue = fn();
    if (clue) return clue;
  }
  return 'The radio is quiet.';
}

function searchReport(g: GameState, station: string): string[] {
  const name = stationLabel(station);
  const lines: string[] = [];
  const present = activeHeisters(g).some((h) => h.station === station);
  lines.push(present ? `A Heister is at ${name} RIGHT NOW.` : `No Heister is at ${name} right now.`);
  const recent = g.visits
    .filter((v) => v.station === station && v.round >= g.round - 2 && v.round > 0)
    .sort((a, b) => b.round - a.round)[0];
  if (recent) {
    const ago = g.round - recent.round;
    lines.push(`A Heister passed through here ${ago === 0 ? 'this round' : `${plural(ago, 'round')} ago`}.`);
  } else {
    lines.push('No Heister activity here in the last 2 rounds.');
  }
  if ((g.artifacts[station] ?? 0) > 0) lines.push('An Artifact is still hidden here.');
  const taken = g.pickups.filter((p) => p.station === station);
  for (const p of taken) lines.push(`An Artifact was taken from here ${p.round === 0 ? 'at the start' : `in round ${p.round}`}.`);
  if (!(g.artifacts[station] > 0) && taken.length === 0) lines.push('No sign of any Artifact here.');
  lines.push(`Field clue: ${fieldClue(g)}`);
  return lines;
}

// ---------- Actions ----------

export function applyAction(state: GameState, playerId: string, action: Action, t: number): GameState {
  const g = structuredClone(state);
  advanceTime(g, t);
  const me = g.players.find((p) => p.id === playerId) ?? fail('You are not in this room.');

  switch (action.type) {
    case 'tick':
      break;

    case 'settings': {
      if (!me.isHost) fail('Only the host can change settings.');
      if (g.phase !== 'lobby') fail('Settings are locked once the game starts.');
      const s = { ...g.settings, ...action.settings };
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
      s.setupSeconds = clamp(s.setupSeconds, 10, 600);
      s.heisterSeconds = clamp(s.heisterSeconds, 10, 600);
      s.policeSeconds = clamp(s.policeSeconds, 10, 600);
      s.infoSeconds = clamp(s.infoSeconds, 10, 600);
      s.maxRounds = clamp(s.maxRounds, 1, 50);
      s.artifactCount = clamp(s.artifactCount, 1, 30);
      s.artifactsToEscape = clamp(s.artifactsToEscape, 1, s.artifactCount);
      s.searchRange = clamp(s.searchRange, 0, 3);
      if (![1, 2, 'auto'].includes(s.heisterCount)) s.heisterCount = 'auto';
      s.allowDMs = !!s.allowDMs;
      g.settings = s;
      break;
    }

    case 'spectate':
      if (g.phase !== 'lobby') fail('You can only switch to spectating in the lobby.');
      if (!action.on && g.players.filter((p) => !p.wantsSpectate).length >= MAX_PLAYERS) fail('The table is full.');
      me.wantsSpectate = action.on;
      break;

    case 'start':
      if (!me.isHost) fail('Only the host can start the game.');
      if (g.phase !== 'lobby') fail('The game has already started.');
      startGame(g, t);
      break;

    case 'rematch':
      if (!me.isHost && g.players.find((p) => p.isHost)?.connected) fail('Only the host can start a rematch.');
      if (g.phase !== 'ended') fail('The game is still running.');
      g.phase = 'lobby';
      g.deadline = null;
      g.players = g.players.filter((p) => p.connected);
      if (!g.players.some((p) => p.isHost)) me.isHost = true;
      for (const p of g.players) Object.assign(p, { role: 'police', label: undefined, station: null, status: 'active' });
      break;

    case 'chooseStart': {
      if (g.phase !== 'setup') fail('Starting stations are chosen during setup.');
      if (me.role === 'spectator') fail('Spectators do not take a station.');
      if (me.done) fail('You already locked in your starting station.');
      if (!ADJ[action.station]) fail('Unknown station.');
      if (me.role === 'heister' && action.station === EXIT_STATION) fail('Heisters cannot start on the Exit Station.');
      me.station = action.station;
      break;
    }

    case 'move': {
      if (me.status !== 'active') fail('You are out of play.');
      if (g.phase === 'heister') {
        if (me.role !== 'heister') fail('It is the Heister Phase.');
        if (me.done) fail('You already moved this round.');
        // A Heister's Express needs a round to recharge.
        if (action.express && me.expressRound === g.round - 1) fail('Your Express card is recharging. You can use it again next round.');
        validatePath(me.station!, action.path, action.express);
        if (action.express) me.expressRound = g.round;
        const stops = action.express ? [action.path[action.path.length - 1]] : action.path;
        for (const st of stops) {
          g.visits.push({ heister: me.id, station: st, round: g.round });
          collect(g, me, st);
        }
        me.station = action.path[action.path.length - 1];
        g.trails[me.id].push({ round: g.round, station: me.station });
        me.done = true;
        if (me.station === EXIT_STATION && me.carried >= g.settings.artifactsToEscape) {
          me.status = 'escaped';
          endGame(g, 'heisters', `${heisterTag(me)} escaped through ${stationLabel(EXIT_STATION)} with ${plural(me.carried, 'Artifact')}.`);
          break;
        }
        if (activeHeisters(g).every((p) => p.done)) endHeisterPhase(g, t);
      } else if (g.phase === 'police') {
        if (!isPolice(me)) fail('It is the Police Phase.');
        if (me.done) fail('Your turn is over.');
        if (g.policeTurn !== me.id) fail('Wait for your turn.');
        if (me.moved || me.acted) fail('You already used your action this round.');
        validatePath(me.station!, action.path, action.express);
        me.station = action.path[action.path.length - 1];
        me.moved = true;
        log(g, 'info', `${me.name} ${action.express ? 'took the Express' : 'moved'} to ${stationLabel(me.station)}.`);
        // One action per officer per round: moving uses it.
        finishPoliceTurn(g, me);
        maybeEndPolicePhase(g, t);
      } else fail('You cannot move right now.');
      break;
    }

    case 'search': {
      if (g.phase !== 'police' || !isPolice(me)) fail('Only officers can search during the Police Phase.');
      if (me.status !== 'active' || me.done) fail('Your turn is over.');
      if (g.policeTurn !== me.id) fail('Wait for your turn.');
      if (me.acted || me.moved) fail('You already used your action this round.');
      if (!ADJ[action.station]) fail('Unknown station.');
      if (distance(me.station!, action.station) > g.settings.searchRange) {
        fail(g.settings.searchRange === 0 ? 'You can only search your own station.' : `You can only search within ${plural(g.settings.searchRange, 'stop')} of you.`);
      }
      me.acted = 'search';
      envelope(g, me.id, 'search', `Search: ${stationLabel(action.station)}`, searchReport(g, action.station));
      // Searching takes the officer to the station they searched.
      const went = me.station !== action.station;
      me.station = action.station;
      log(g, 'info', went ? `${me.name} went to ${stationLabel(action.station)} and searched it.` : `${me.name} searched ${stationLabel(action.station)}.`);
      finishPoliceTurn(g, me);
      maybeEndPolicePhase(g, t);
      break;
    }

    case 'arrest': {
      if (g.phase !== 'police' || !isPolice(me)) fail('Only officers can arrest during the Police Phase.');
      if (me.status !== 'active' || me.done) fail('Your turn is over.');
      if (g.policeTurn !== me.id) fail('Wait for your turn.');
      if (me.acted || me.moved) fail('You already used your action this round.');
      if (me.noArrestRound === g.round) fail('You were wrongly accused and cannot arrest this round.');
      if (g.arrestsThisRound >= 3) fail('The team has used all 3 arrest attempts this round.');
      const target = action.station;
      if (!ADJ[target]) fail('Unknown station.');
      if (target === EXIT_STATION) {
        if (me.station !== EXIT_STATION) fail('At the Exit Station you can only arrest while standing on it.');
      } else if (target !== me.station && !isAdjacent(me.station!, target)) {
        fail('You can only arrest at your station or one connected stop away.');
      }
      g.arrestsThisRound++;
      me.acted = 'arrest';
      const caught = activeHeisters(g).filter((h) => h.station === target);
      if (caught.length) {
        for (const h of caught) {
          h.status = 'arrested';
          if (h.carried > 0) g.artifacts[target] = (g.artifacts[target] ?? 0) + h.carried;
          log(g, 'arrest', `${me.name} ARRESTED ${heisterTag(h)} at ${stationLabel(target)}. ${h.carried ? `${plural(h.carried, 'Artifact')} dropped there.` : ''}`.trim());
          h.carried = 0;
          h.station = target;
        }
        checkPoliceWin(g);
        if (g.phase === 'ended') break;
      } else {
        me.skipPoliceRound = g.round + 1;
        log(g, 'fail', `${me.name}'s arrest at ${stationLabel(target)} failed. The station was empty. ${me.name} skips next Police Phase.`);
      }
      finishPoliceTurn(g, me);
      maybeEndPolicePhase(g, t);
      break;
    }

    case 'endTurn': {
      if (g.phase === 'heister') {
        if (me.role !== 'heister' || me.status !== 'active') fail('It is the Heister Phase.');
        if (me.done) fail('You already moved this round.');
        me.done = true;
        g.trails[me.id].push({ round: g.round, station: me.station! });
        g.visits.push({ heister: me.id, station: me.station!, round: g.round });
        if (activeHeisters(g).every((p) => p.done)) endHeisterPhase(g, t);
      } else if (g.phase === 'police') {
        if (!isPolice(me) || me.status !== 'active') fail('It is the Police Phase.');
        if (g.policeTurn !== me.id) fail('Wait for your turn.');
        finishPoliceTurn(g, me);
        maybeEndPolicePhase(g, t);
      } else fail('Nothing to end right now.');
      break;
    }

    case 'accuse': {
      if (g.phase !== 'info') fail('Accusations happen in the Information Phase.');
      if (!isPolice(me) || me.status !== 'active') fail('Only active officers can call a vote.');
      if (g.accusation) fail('A vote is already in progress.');
      if (g.accusationUsed) fail('Only one accusation vote per round.');
      const target = g.players.find((p) => p.id === action.target);
      if (!target || !isPolice(target) || target.status !== 'active') fail('You can only accuse an active officer.');
      g.accusation = { by: me.id, target: target!.id, votes: { [me.id]: true } };
      g.accusationUsed = true;
      // Give officers time to vote even if the phase was nearly over.
      g.deadline = Math.max(g.deadline ?? 0, t + 20_000);
      log(g, 'accuse', `${me.name} accuses ${target!.name} of being the Crooked Cop. Officers, vote now.`);
      resolveAccusation(g, t, false);
      break;
    }

    case 'vote': {
      if (!g.accusation) fail('There is no vote in progress.');
      if (!isPolice(me) || me.status !== 'active') fail('Only active officers vote.');
      g.accusation!.votes[me.id] = action.yes;
      resolveAccusation(g, t, false);
      break;
    }

    case 'ready': {
      if (g.phase === 'setup') {
        if (me.role === 'spectator') fail('Spectators do not take a station.');
        if (!me.station) fail('Pick a starting station first.');
        me.done = true;
        if (g.players.every((p) => p.role === 'spectator' || p.done)) finishSetup(g, t);
        break;
      }
      if (g.phase !== 'info') fail('You can only skip ahead during the Information Phase.');
      me.done = true;
      maybeEndInfoPhase(g, t);
      break;
    }

    default:
      fail('Unknown action.');
  }
  return g;
}

function resolveAccusation(g: GameState, t: number, timedOut: boolean) {
  const acc = g.accusation;
  if (!acc) return;
  const voters = activePolice(g);
  const yes = voters.filter((p) => acc.votes[p.id] === true).length;
  const no = voters.filter((p) => acc.votes[p.id] === false).length;
  const needed = Math.floor(voters.length / 2) + 1;
  const target = g.players.find((p) => p.id === acc.target)!;
  if (yes >= needed) {
    g.accusation = null;
    g.reveal = { id: g.nextId++, round: g.round, target: target.id, guilty: target.role === 'traitor' };
    if (target.role !== 'traitor') target.cleared = true;
    if (target.role === 'traitor') {
      target.status = 'exposed';
      log(g, 'expose', `Vote passed ${yes}-${no}. ${target.name} WAS the Crooked Cop and is removed from the game.`);
    } else {
      target.noArrestRound = g.round + 1;
      log(g, 'fail', `Vote passed ${yes}-${no}, but ${target.name} is innocent. They cannot arrest next round.`);
    }
  } else if (no > voters.length - needed || timedOut) {
    g.accusation = null;
    log(g, 'accuse', `The vote against ${target.name} failed (${yes}-${no}).`);
  }
  if (!g.accusation) maybeEndInfoPhase(g, t);
}

// Moves the game along when a phase timer has run out.
export function advanceTime(g: GameState, t: number) {
  for (let guard = 0; guard < 5 && g.deadline !== null && t >= g.deadline; guard++) {
    switch (g.phase) {
      case 'setup':
        finishSetup(g, t);
        break;
      case 'heister':
        for (const h of activeHeisters(g)) {
          if (!h.done) {
            h.done = true;
            g.trails[h.id].push({ round: g.round, station: h.station! });
            g.visits.push({ heister: h.id, station: h.station!, round: g.round });
          }
        }
        endHeisterPhase(g, t);
        break;
      case 'police': {
        // The current officer ran out of time; the next one gets a fresh timer.
        const current = g.players.find((p) => p.id === g.policeTurn);
        if (current) finishPoliceTurn(g, current);
        else endPolicePhase(g, t);
        maybeEndPolicePhase(g, t);
        break;
      }
      case 'info':
        if (g.accusation) resolveAccusation(g, t, true);
        if (g.phase === 'info') beginRound(g, g.round + 1, t);
        break;
      default:
        g.deadline = null;
    }
  }
}

export function tick(state: GameState, t: number): GameState {
  if (state.deadline === null || t < state.deadline) return state;
  const g = structuredClone(state);
  advanceTime(g, t);
  return g;
}

// ---------- Views (the only thing that leaves the server) ----------

export function viewFor(g: GameState, viewerId: string, t: number): View {
  const me = g.players.find((p) => p.id === viewerId);
  const myRole = me?.role ?? 'spectator';
  const ended = g.phase === 'ended';
  const godView = ended || (myRole === 'spectator' && !!me?.isHost && !!me?.wantsSpectate);
  const heisterTeam = myRole === 'heister';

  const players: PublicPlayer[] = g.players.map((p) => {
    let role: PublicRole = p.role;
    if (g.phase === 'lobby') role = p.wantsSpectate ? 'spectator' : 'unknown';
    else if (p.role === 'traitor' && !(godView || p.id === viewerId || p.status === 'exposed')) role = 'police';
    const seeHeister = p.role !== 'heister' || godView || heisterTeam || p.status !== 'active';
    // During setup only the Police team sees where officers chose to start.
    const seeOfficer = !(g.phase === 'setup' && isPolice(p)) || godView || p.id === viewerId || myRole === 'police' || myRole === 'traitor';
    return {
      id: p.id, name: p.name, isHost: p.isHost, connected: p.connected, wantsSpectate: p.wantsSpectate,
      role, label: p.label, status: p.status,
      station: seeHeister && seeOfficer ? p.station : null,
      carried: p.role === 'heister' ? (godView || heisterTeam ? p.carried : null) : null,
      done: p.done,
      skipsPolice: p.skipPoliceRound === g.round,
      cannotArrest: p.noArrestRound === g.round,
      moved: p.moved,
      acted: p.acted,
      cleared: !!p.cleared,
      expressCooldown: p.role === 'heister' && (godView || heisterTeam) && p.expressRound === g.round - 1,
    };
  });

  return {
    code: g.code, me: viewerId, myRole, godView, settings: g.settings, phase: g.phase, round: g.round,
    deadline: g.deadline, serverNow: t, players,
    artifacts: godView || heisterTeam ? g.artifacts : null,
    announcedTaken: g.announcedTaken,
    arrestsLeft: 3 - g.arrestsThisRound,
    exitMustClear: g.exitMustClear,
    exitStreak: g.exitStreak,
    accusation: g.accusation,
    accusationUsed: g.accusationUsed,
    envelopes: godView ? g.envelopes : g.envelopes.filter((e) => e.to === viewerId),
    log: g.log.slice(-200),
    winner: g.winner,
    endReason: g.endReason,
    trails: godView
      ? g.trails
      : heisterTeam
        ? Object.fromEntries(Object.entries(g.trails).filter(([id]) => g.players.find((p) => p.id === id)?.role === 'heister'))
        : null,
    policeTurn: g.policeTurn ?? null,
    reveal: g.reveal ?? null,
    tipoff: myRole === 'traitor' ? g.tipoff ?? null : null,
  };
}
