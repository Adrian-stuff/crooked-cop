import { describe, expect, it } from 'vitest';
import { AFK_TURN_SECONDS, addPlayer, applyAction, createGame, validatePath, viewFor, GameError } from './engine';
import { canPost } from './chat';
import { ADJ, EDGES, EXIT_STATION, SECOND_EXIT, STATIONS, distance, searchArea } from './map';
import type { Action, GameState } from './types';

const T0 = 1_000_000;

function setup(n = 6, seed = 42): GameState {
  let g = createGame('ABCD', 'p0', 'Host', seed);
  for (let i = 1; i < n; i++) g = addPlayer(g, `p${i}`, `Player${i}`);
  return applyAction(g, 'p0', { type: 'start' }, T0);
}

const act = (g: GameState, id: string, a: Action, t = T0) => applyAction(g, id, a, t);
const byRole = (g: GameState, role: string) => g.players.filter((p) => p.role === role);

function placeAll(g: GameState, where: Record<string, string> = {}): GameState {
  const fallback = ['pureza', 'legarda', 'recto', 'lawton', 'tutuban', 'divisoria', 'pier_4', 'quirino'];
  let i = 0;
  for (const p of g.players) {
    g = act(g, p.id, { type: 'chooseStart', station: where[p.id] ?? fallback[i++] });
  }
  for (const p of g.players) g = act(g, p.id, { type: 'ready' });
  return g;
}

describe('map', () => {
  it('is a single connected network', () => {
    for (const s of STATIONS) expect(distance(STATIONS[0].id, s.id)).toBeLessThan(Infinity);
  });
  it('has edges only between known stations', () => {
    for (const e of EDGES) {
      expect(ADJ[e.a]).toBeDefined();
      expect(ADJ[e.b]).toBeDefined();
    }
  });
  it('exit is Central Terminal at the end of the Green line', () => {
    expect(ADJ[EXIT_STATION].map((n) => n.to)).toEqual(['carriedo_g']);
  });
});

describe('movement validation', () => {
  it('allows 1-2 connected stations', () => {
    expect(() => validatePath('lawton', ['recto', 'senate_deped'], false)).not.toThrow();
    expect(() => validatePath('lawton', ['recto', 'senate_deped', 'legarda'], false)).toThrow(GameError);
    expect(() => validatePath('lawton', ['guadalupe'], false)).toThrow(GameError);
  });
  it('lets Express change lines only at an interchange', () => {
    // lawton -> taytay is Orange, lawton -> recto is Purple; Lawton is an interchange
    expect(() => validatePath('recto', ['lawton', 'taytay'], false)).not.toThrow();
    expect(() => validatePath('recto', ['lawton', 'taytay'], true)).not.toThrow();
    expect(() => validatePath('recto', ['lawton', 'taytay', 'east_road', 'bgc'], true)).not.toThrow();
    expect(() => validatePath('lawton', ['taytay', 'east_road', 'bgc', 'buendia'], true)).not.toThrow();
  });
});

describe('game flow', () => {
  it('assigns roles: 2 heisters, 1 traitor, rest police for 6 players', () => {
    const g = setup(6);
    expect(byRole(g, 'heister')).toHaveLength(2);
    expect(byRole(g, 'traitor')).toHaveLength(1);
    expect(byRole(g, 'police')).toHaveLength(3);
    expect(Object.keys(g.artifacts)).toHaveLength(10);
    expect(g.artifacts[EXIT_STATION]).toBeUndefined();
  });

  it('uses 1 heister for 4-5 players and refuses fewer than 4', () => {
    expect(byRole(setup(4), 'heister')).toHaveLength(1);
    let g = createGame('X', 'a', 'A', 1);
    g = addPlayer(g, 'b', 'B');
    expect(() => act(g, 'a', { type: 'start' })).toThrow(/at least 4/);
  });

  it('hides heister positions, artifacts and the traitor from police', () => {
    const g = placeAll(setup(6));
    const cop = byRole(g, 'police')[0];
    const v = viewFor(g, cop.id, T0);
    for (const h of v.players.filter((p) => p.role === 'heister')) expect(h.station).toBeNull();
    expect(v.artifacts).toBeNull();
    expect(v.players.some((p) => p.role === 'traitor')).toBe(false);
    const traitor = byRole(g, 'traitor')[0];
    expect(viewFor(g, traitor.id, T0).players.find((p) => p.id === traitor.id)!.role).toBe('traitor');
    const h = byRole(g, 'heister')[0];
    const hv = viewFor(g, h.id, T0);
    expect(hv.artifacts).not.toBeNull();
    expect(hv.players.filter((p) => p.role === 'heister').every((p) => p.station)).toBe(true);
  });

  it('auto-collects artifacts on pass-through, and Express only at the destination', () => {
    let g = setup(6);
    const [h1, h2] = byRole(g, 'heister');
    g.artifacts = { recto: 1, senate_deped: 1, taytay: 1, bgc: 1 };
    g = placeAll(g, { [h1.id]: 'lawton', [h2.id]: 'lawton' });
    expect(g.phase).toBe('heister');
    g = act(g, h1.id, { type: 'move', path: ['recto', 'senate_deped'], express: false });
    expect(g.players.find((p) => p.id === h1.id)!.carried).toBe(2);
    g = act(g, h2.id, { type: 'move', path: ['taytay', 'east_road', 'bgc'], express: true });
    expect(g.players.find((p) => p.id === h2.id)!.carried).toBe(1);
    expect(g.artifacts.taytay).toBe(1);
    expect(g.phase).toBe('police');
    expect(g.announcedTaken).toBe(3);
  });

  it('wrong arrest costs the next police phase; correct arrest drops artifacts', () => {
    let g = setup(6);
    const [h1, h2] = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g.artifacts = { recto: 3 };
    g = placeAll(g, { [h1.id]: 'lawton', [h2.id]: 'quirino', [cops[0].id]: 'senate_deped', [cops[1].id]: 'pier_4' });
    g = act(g, h1.id, { type: 'move', path: ['recto'], express: false });
    g = act(g, h2.id, { type: 'endTurn' });
    // cops[0] at senate_deped arrests recto (adjacent) -> catches h1 with 3 artifacts
    g = act(g, cops[0].id, { type: 'arrest', station: 'recto' });
    expect(g.players.find((p) => p.id === h1.id)!.status).toBe('arrested');
    expect(g.artifacts.recto).toBe(3);
    // cops[1] at pier_4 arrests divisoria (empty) -> penalty
    g = act(g, cops[1].id, { type: 'arrest', station: 'divisoria' });
    expect(g.players.find((p) => p.id === cops[1].id)!.skipPoliceRound).toBe(2);
    expect(g.arrestsThisRound).toBe(2);
    expect(g.phase).toBe('police');
  });

  it('caps arrests at three per round', () => {
    let g = setup(8);
    const hs = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g = placeAll(g, Object.fromEntries([...hs.map((h) => [h.id, 'quirino']), ...cops.map((c) => [c.id, 'pureza'])]));
    for (const h of hs) g = act(g, h.id, { type: 'endTurn' });
    for (let i = 0; i < 3; i++) {
      g = act(g, cops[i].id, { type: 'arrest', station: 'legarda' });
    }
    expect(() => act(g, cops[3].id, { type: 'arrest', station: 'legarda' })).toThrow(/3 arrest/);
  });

  it('exit station arrests require standing on it', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    const cop = g.players.find((p) => p.role === 'police')!;
    g = placeAll(g, { [h.id]: 'carriedo_g', [cop.id]: 'carriedo_g' });
    g = act(g, h.id, { type: 'move', path: [EXIT_STATION], express: false });
    expect(() => act(g, cop.id, { type: 'arrest', station: EXIT_STATION })).toThrow(/standing on it/);
  });

  it('heister escapes with enough artifacts', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    g = placeAll(g, { [h.id]: 'carriedo_g' });
    g.players.find((p) => p.id === h.id)!.carried = 5;
    g = act(g, h.id, { type: 'move', path: [EXIT_STATION], express: false });
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('heisters');
  });

  it('traitor gets heister locations after acting; search gives a private report', () => {
    let g = setup(6);
    const traitor = byRole(g, 'traitor')[0];
    const cop = byRole(g, 'police')[0];
    g = placeAll(g);
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    const at = (id: string) => g.players.find((p) => p.id === id)!.station!;
    // Officers take turns in seat order; the traitor and one cop search, the rest pass.
    while (g.phase === 'police') {
      const id = g.policeTurn!;
      g = act(g, id, id === traitor.id || id === cop.id ? { type: 'search', station: at(id) } : { type: 'endTurn' });
    }
    const tv = viewFor(g, traitor.id, T0);
    expect(tv.envelopes.some((e) => e.kind === 'traitor' && e.lines.length === 2)).toBe(true);
    for (const h of byRole(g, 'heister')) expect(tv.tipoff!.at[h.id]).toBe(at(h.id));
    expect(viewFor(g, cop.id, T0).tipoff).toBeNull();
    const cv = viewFor(g, cop.id, T0);
    expect(cv.envelopes).toHaveLength(1);
    expect(cv.envelopes[0].lines.at(-1)).toMatch(/^Field clue:/);
    expect(cv.envelopes.some((e) => e.kind === 'traitor')).toBe(false);
  });

  it('majority vote exposes the traitor; wrong accusation blocks arrests', () => {
    let g = setup(6);
    const traitor = byRole(g, 'traitor')[0];
    const cops = byRole(g, 'police');
    g = placeAll(g);
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    // Let every officer's turn time out until the Information Phase of `round`.
    let t = T0;
    const untilInfo = (round: number) => {
      while (!(g.phase === 'info' && g.round === round)) g = act(g, traitor.id, { type: 'tick' }, (t += 61_000));
    };
    untilInfo(1);
    g = act(g, cops[0].id, { type: 'accuse', target: cops[1].id }, t);
    g = act(g, cops[2].id, { type: 'vote', yes: true }, t);
    g = act(g, traitor.id, { type: 'vote', yes: true }, t);
    expect(g.players.find((p) => p.id === cops[1].id)!.noArrestRound).toBe(2);
    expect(viewFor(g, traitor.id, t).reveal).toMatchObject({ target: cops[1].id, guilty: false });
    expect(viewFor(g, traitor.id, t).players.find((p) => p.id === cops[1].id)!.cleared).toBe(true);
    // Next round: correct accusation
    untilInfo(2);
    g = act(g, cops[0].id, { type: 'accuse', target: traitor.id }, t);
    g = act(g, cops[1].id, { type: 'vote', yes: true }, t);
    g = act(g, cops[2].id, { type: 'vote', yes: true }, t);
    expect(g.players.find((p) => p.id === traitor.id)!.status).toBe('exposed');
    expect(viewFor(g, cops[0].id, t).reveal).toMatchObject({ target: traitor.id, guilty: true });
  });

  it('police win after the last round', () => {
    let g = setup(4);
    g.settings.maxRounds = 1;
    g = placeAll(g);
    let t = T0;
    while (g.phase !== 'ended') {
      t += 120_000;
      g = act(g, 'p0', { type: 'tick' }, t);
    }
    expect(g.winner).toBe('police');
  });

  it('enforces the exit occupancy limit', () => {
    let g = setup(4);
    const cop = g.players.find((p) => p.role === 'police')!;
    g = placeAll(g, { [cop.id]: EXIT_STATION });
    let t = T0;
    for (let r = 0; r < 3; r++) {
      while (g.phase !== 'info') { t += 70_000; g = act(g, 'p0', { type: 'tick' }, t); }
      t += 70_000;
      g = act(g, 'p0', { type: 'tick' }, t);
    }
    expect(g.players.find((p) => p.id === cop.id)!.station).not.toBe(EXIT_STATION);
  });
});

describe('setup secrecy', () => {
  it('hides officer starts from Heisters until setup ends, then logs them', () => {
    let g = setup(6);
    const [cop, mate] = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    const heister = byRole(g, 'heister')[0];
    g = act(g, cop.id, { type: 'chooseStart', station: 'lawton' });
    expect(viewFor(g, heister.id, T0).players.find((p) => p.id === cop.id)!.station).toBeNull();
    expect(viewFor(g, mate.id, T0).players.find((p) => p.id === cop.id)!.station).toBe('lawton');
    expect(g.log.some((e) => e.text.includes('lawton') || e.text.includes('Lawton'))).toBe(false);

    g = applyAction(g, 'p0', { type: 'tick' }, T0 + g.settings.setupSeconds * 1000 + 1);
    expect(g.phase).toBe('heister');
    expect(viewFor(g, heister.id, T0).players.find((p) => p.id === cop.id)!.station).toBe('lawton');
    expect(g.log.some((e) => e.text === `${cop.name} starts at Lawton.`)).toBe(true);
    expect(g.log.some((e) => e.text.startsWith(`${mate.name} was placed at `))).toBe(true);
  });
});

describe('setup picks', () => {
  it('lets players change their start until they lock in, and ends when all are locked', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    g = act(g, h.id, { type: 'chooseStart', station: 'recto' });
    g = act(g, h.id, { type: 'chooseStart', station: 'lawton' });
    expect(g.players.find((p) => p.id === h.id)!.station).toBe('lawton');
    expect(g.trails[h.id]).toBeUndefined(); // nothing is applied until setup ends
    const other = g.players.find((p) => p.id !== h.id)!;
    expect(() => act(g, other.id, { type: 'ready' })).toThrow(/Pick a starting station/);
    g = act(g, h.id, { type: 'ready' });
    expect(() => act(g, h.id, { type: 'chooseStart', station: 'recto' })).toThrow(/locked in/);
    for (const p of g.players.filter((p) => p.id !== h.id)) {
      g = act(g, p.id, { type: 'chooseStart', station: 'pureza' });
      g = act(g, p.id, { type: 'ready' });
    }
    expect(g.phase).toBe('heister');
    expect(g.trails[h.id]).toEqual([{ round: 0, station: 'lawton' }]);
  });
});

describe('police turns', () => {
  it('lets one officer act at a time, in seat order, with a timer each', () => {
    let g = placeAll(setup(6));
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    const [first, second] = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    expect(g.policeTurn).toBe(first.id);
    expect(() => act(g, second.id, { type: 'endTurn' })).toThrow(/Wait for your turn/);
    g = act(g, first.id, { type: 'endTurn' });
    expect(g.policeTurn).toBe(second.id);
    const deadline = g.deadline!;
    g = act(g, second.id, { type: 'tick' }, deadline + 1); // second runs out of time
    expect(g.players.find((p) => p.id === second.id)!.done).toBe(true);
    expect(g.policeTurn).not.toBe(second.id);
    expect(g.deadline).toBe(deadline + 1 + g.settings.policeSeconds * 1000);
  });
});

describe('search', () => {
  it('moves the officer onto the station they search', () => {
    let g = setup(4);
    const cop = g.players.find((p) => p.role === 'police' || p.role === 'traitor')!;
    g = placeAll(g, { [cop.id]: 'lawton' });
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    while (g.policeTurn !== cop.id) g = act(g, g.policeTurn!, { type: 'endTurn' });
    g = act(g, cop.id, { type: 'search', station: 'recto' });
    expect(g.players.find((p) => p.id === cop.id)!.station).toBe('recto');
    expect(g.log.at(-1)!.text).toMatch(/went to Recto and searched it/);
  });
});

describe('one action per officer', () => {
  it('ends the turn after a single Move, Search or Arrest', () => {
    let g = placeAll(setup(6));
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    const first = g.policeTurn!;
    const from = g.players.find((p) => p.id === first)!.station!;
    g = act(g, first, { type: 'move', path: [ADJ[from][0].to], express: false });
    expect(g.players.find((p) => p.id === first)!.done).toBe(true);
    expect(g.policeTurn).not.toBe(first);
    expect(() => act(g, first, { type: 'search', station: ADJ[from][0].to })).toThrow(/turn is over/);
  });
});

describe('heister express', () => {
  it('needs a round to recharge after use', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    g = placeAll(g, { [h.id]: 'lawton' });
    g = act(g, h.id, { type: 'move', path: ['taytay', 'east_road'], express: true });
    let t = T0;
    while (g.phase !== 'heister' || g.round !== 2) g = act(g, h.id, { type: 'tick' }, (t += 61_000));
    expect(viewFor(g, h.id, t).players.find((p) => p.id === h.id)!.expressCooldown).toBe(true);
    const cop = g.players.find((p) => p.role === 'police')!;
    expect(viewFor(g, cop.id, t).players.find((p) => p.id === h.id)!.expressCooldown).toBe(false);
    expect(() => act(g, h.id, { type: 'move', path: ['bgc'], express: true }, t)).toThrow(/recharging/);
    g = act(g, h.id, { type: 'move', path: ['bgc'], express: false }, t);
    while (g.phase !== 'heister' || g.round !== 3) g = act(g, h.id, { type: 'tick' }, (t += 61_000));
    expect(() => act(g, h.id, { type: 'move', path: ['east_road'], express: true }, t)).not.toThrow();
  });
});

describe('spectator chat', () => {
  it('keeps spectators quiet during play, except the facilitator in All', () => {
    let g = createGame('ABCD', 'p0', 'Host', 7);
    for (let i = 1; i < 6; i++) g = addPlayer(g, `p${i}`, `Player${i}`);
    g = applyAction(g, 'p5', { type: 'spectate', on: true }, T0);
    g = applyAction(g, 'p0', { type: 'spectate', on: true }, T0);
    expect(canPost(g, 'p5', 'lobby')).toBeNull(); // the lobby is open to everyone
    g = applyAction(g, 'p0', { type: 'start' }, T0);
    expect(canPost(g, 'p5', 'lobby')).toMatch(/Spectators can watch/);
    expect(canPost(g, 'p0', 'lobby')).toBeNull();
    expect(canPost(g, 'p0', 'police')).toMatch(/Spectators can watch/);
    expect(canPost(g, 'p1', 'lobby')).toBeNull();
  });
});

describe('exits', () => {
  it('opens Clark Airport as a second exit for 7-8 players', () => {
    expect(setup(6).exits).toEqual([EXIT_STATION]);
    const g8 = setup(8);
    expect(g8.exits).toEqual([EXIT_STATION, SECOND_EXIT]);
    expect(g8.artifacts[SECOND_EXIT]).toBeUndefined();
    const [h] = byRole(g8, 'heister');
    expect(() => act(g8, h.id, { type: 'chooseStart', station: SECOND_EXIT })).toThrow(/Exit Station/);
  });

  it('lets a Heister escape through the second exit with half the Artifacts', () => {
    let g = setup(8);
    const [h] = byRole(g, 'heister');
    const next = ADJ[SECOND_EXIT][0].to;
    g = placeAll(g, { [h.id]: next });
    g.players.find((p) => p.id === h.id)!.carried = 5; // half of 10
    g = act(g, h.id, { type: 'move', path: [SECOND_EXIT], express: false });
    expect(g.winner).toBe('heisters');
    expect(g.endReason).toMatch(/Clark Airport/);
  });

  it('needs half the Artifacts, rounded up, to escape', () => {
    let g = setup(4);
    g.settings.artifactCount = 7;
    const [h] = byRole(g, 'heister');
    g = placeAll(g, { [h.id]: 'carriedo_g' });
    g.players.find((p) => p.id === h.id)!.carried = 3;
    g = act(g, h.id, { type: 'move', path: [EXIT_STATION], express: false });
    expect(g.phase).not.toBe('ended'); // 3 of 7 is short of 4
  });

  it('carries on a game saved before exits were per game', () => {
    let g = placeAll(setup(4));
    const old = g as unknown as Record<string, unknown>;
    delete old.exits;
    old.exitStreak = 1;
    old.exitMustClear = false;
    expect(() => (g = act(g, g.players[0].id, { type: 'tick' }))).not.toThrow();
    expect(g.exits).toEqual([EXIT_STATION]);
  });
});

describe('afk', () => {
  it('marks a player AFK when their turn times out, shortens their next turn, and clears on any action', () => {
    let g = placeAll(setup(6));
    let t = T0;
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' }, t);
    const first = g.policeTurn!;
    g = act(g, first, { type: 'tick' }, (t = g.deadline! + 1));
    expect(g.players.find((p) => p.id === first)!.afk).toBe(true);
    expect(viewFor(g, first, t).players.find((p) => p.id === first)!.afk).toBe(true);
    expect(g.log.some((e) => e.text.endsWith('is AFK (ran out of time).'))).toBe(true);

    // Next round, the AFK officer's turn is short.
    while (!(g.phase === 'police' && g.round === 2)) {
      const h = byRole(g, 'heister').find((x) => g.phase === 'heister' && !g.players.find((p) => p.id === x.id)!.done);
      g = h ? act(g, h.id, { type: 'endTurn' }, t) : act(g, first, { type: 'tick' }, (t = g.deadline! + 1));
    }
    while (g.policeTurn !== first) g = act(g, g.policeTurn!, { type: 'endTurn' }, t);
    expect(g.deadline).toBe(t + AFK_TURN_SECONDS * 1000);
    g = act(g, first, { type: 'endTurn' }, t);
    expect(g.players.find((p) => p.id === first)!.afk).toBe(false);
  });
});

describe('search area', () => {
  it('covers every neighbour at an interchange and 2 stops each way on a plain station', () => {
    expect(new Set(searchArea('lawton'))).toEqual(new Set(['lawton', 'recto', 'tutuban', 'taytay']));
    expect(new Set(searchArea('recto'))).toEqual(new Set(['recto', 'senate_deped', 'legarda', 'lawton', 'tutuban']));
  });

  it('reports Heisters anywhere in the swept area', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    const cop = g.players.find((p) => p.role === 'police' || p.role === 'traitor')!;
    g = placeAll(g, { [h.id]: 'legarda', [cop.id]: 'senate_deped' });
    for (const x of byRole(g, 'heister')) g = act(g, x.id, { type: 'endTurn' });
    while (g.policeTurn !== cop.id) g = act(g, g.policeTurn!, { type: 'endTurn' });
    g = act(g, cop.id, { type: 'search', station: 'recto' }); // Legarda is 2 stops from Recto on its line
    const env = viewFor(g, cop.id, T0).envelopes.at(-1)!;
    expect(env.area).toContain('legarda');
    expect(env.lines.join(' ')).toMatch(/A Heister is at Legarda RIGHT NOW/);
  });
});
