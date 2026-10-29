import { describe, expect, it } from 'vitest';
import { AFK_TURN_SECONDS, addPlayer, clearAfk, applyAction, createGame, setConnected, swapSeat, validatePath, viewFor, GameError } from './engine';
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
  // Fallback pool: all non-exit stations, filtered to be at least 3 stops from any artifact for heisters.
  const artifactIds = Object.keys(g.artifacts);
  const allStations = STATIONS.filter((s) => !g.exits.includes(s.id)).map((s) => s.id);
  const safeForHeister = allStations.filter((s) => artifactIds.every((art) => distance(s, art) >= 3));
  const fallback = safeForHeister.length >= 8 ? safeForHeister : allStations;
  let i = 0;
  for (const p of g.players) {
    const station = where[p.id] ?? fallback[i++];
    g = act(g, p.id, { type: 'chooseStart', station });
  }
  for (const p of g.players) g = act(g, p.id, { type: 'ready' });
  return g;
}

// Directly forces player starting positions without going through chooseStart validation.
// Use when a test needs heister starting positions that would violate the artifact-distance rule.
function placeAllDirect(g: GameState, where: Record<string, string>): GameState {
  g = structuredClone(g);
  for (const p of g.players) {
    if (p.role === 'spectator') continue;
    const station = where[p.id] ?? 'pureza';
    p.station = station;
    if (p.role === 'heister') {
      g.trails[p.id] = [{ round: 0, station }];
      g.visits.push({ heister: p.id, station, round: 0 });
      const n = g.artifacts[station] ?? 0;
      if (n > 0) { p.carried += n; delete (g.artifacts as Record<string, number>)[station]; g.pickups.push({ station, round: 0 }); }
    }
  }
  g.phase = 'heister';
  g.round = 1;
  g.deadline = T0 + g.settings.heisterSeconds * 1000;
  for (const p of g.players) p.done = !(p.role === 'heister' && p.status === 'active');
  g.log.push({ id: g.nextId++, round: 1, kind: 'info', text: 'Round 1: the Heisters are on the move.' });
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
    expect(() => validatePath('recto', ['lawton', 'taytay', 'east_road', 'bgc', 'buendia'], true)).not.toThrow();
    expect(() => validatePath('legarda', ['recto', 'lawton', 'taytay', 'east_road', 'bgc', 'buendia'], true)).toThrow(/at most 5/);
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
    // Use placeAllDirect: heisters start at lawton which is adjacent to recto (too close for chooseStart).
    g = placeAllDirect(g, Object.fromEntries(g.players.map((p) => [p.id, p.role === 'heister' ? 'lawton' : 'pureza'])));
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
    // lawton is adjacent to recto, so bypass chooseStart validation with placeAllDirect.
    g = placeAllDirect(g, { [h1.id]: 'lawton', [h2.id]: 'quirino', [cops[0].id]: 'senate_deped', [cops[1].id]: 'pier_4' });
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
    // Use placeAllDirect: 'quirino' may be near an artifact depending on the seed.
    g = placeAllDirect(g, Object.fromEntries([...hs.map((h) => [h.id, 'quirino']), ...cops.map((c) => [c.id, 'pureza'])]));
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

  it('allows arresting up to 2 stations away, but fails at 3 stations away', () => {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    const cop = g.players.find((p) => p.role === 'police')!;
    // recto -> lawton (1) -> taytay (2) -> east_road (3)
    expect(distance('recto', 'taytay')).toBe(2);
    expect(distance('recto', 'east_road')).toBe(3);
    g = placeAllDirect(g, { [h.id]: 'taytay', [cop.id]: 'recto' });
    g = act(g, h.id, { type: 'endTurn' });
    // Cop is at recto, arresting at taytay (2 stops away) succeeds in catching h
    g = act(g, cop.id, { type: 'arrest', station: 'taytay' });
    expect(g.players.find((p) => p.id === h.id)!.status).toBe('arrested');

    // Test failing at 3 stops away:
    let g2 = setup(4);
    const cop2 = g2.players.find((p) => p.role === 'police')!;
    const h2 = byRole(g2, 'heister')[0];
    g2 = placeAllDirect(g2, { [cop2.id]: 'recto', [h2.id]: 'pureza' });
    g2 = act(g2, h2.id, { type: 'endTurn' });
    expect(() => act(g2, cop2.id, { type: 'arrest', station: 'east_road' })).toThrow(/within 2 stops/);
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
    // Find a valid station (≥3 from all artifacts) for the heister's test picks.
    const artifactIds = Object.keys(g.artifacts);
    const validStation = STATIONS.find((s) => !g.exits.includes(s.id) && artifactIds.every((a) => distance(s.id, a) >= 3))!.id;
    const validStation2 = STATIONS.find((s) => !g.exits.includes(s.id) && s.id !== validStation && artifactIds.every((a) => distance(s.id, a) >= 3))!.id;
    g = act(g, h.id, { type: 'chooseStart', station: validStation });
    g = act(g, h.id, { type: 'chooseStart', station: validStation2 });
    expect(g.players.find((p) => p.id === h.id)!.station).toBe(validStation2);
    expect(g.trails[h.id]).toBeUndefined(); // nothing is applied until setup ends
    const other = g.players.find((p) => p.id !== h.id)!;
    expect(() => act(g, other.id, { type: 'ready' })).toThrow(/Pick a starting station/);
    g = act(g, h.id, { type: 'ready' });
    expect(() => act(g, h.id, { type: 'chooseStart', station: validStation })).toThrow(/locked in/);
    for (const p of g.players.filter((p) => p.id !== h.id)) {
      g = act(g, p.id, { type: 'chooseStart', station: 'pureza' });
      g = act(g, p.id, { type: 'ready' });
    }
    expect(g.phase).toBe('heister');
    expect(g.trails[h.id]).toEqual([{ round: 0, station: validStation2 }]);
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

  it('defaults to 3 stops search range and allows searching 3 stops away', () => {
    let g = setup(4);
    expect(g.settings.searchRange).toBe(3);
    const cop = g.players.find((p) => p.role === 'police' || p.role === 'traitor')!;
    g = placeAll(g, { [cop.id]: 'tutuban' });
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    while (g.policeTurn !== cop.id) g = act(g, g.policeTurn!, { type: 'endTurn' });
    // tutuban -> lawton (1) -> recto (2) -> senate_deped (3)
    expect(distance('tutuban', 'senate_deped')).toBe(3);
    expect(() => act(g, cop.id, { type: 'search', station: 'senate_deped' })).not.toThrow();
  });
});

describe('police ultimate', () => {
  // One Heister on Recto (Purple). Officers: the first two in seat order start on Lawton (Purple/Orange interchange).
  // Uses placeAllDirect because recto may be within 3 stops of an artifact from the default seed.
  function ready(carried: number) {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g = placeAllDirect(g, { [h.id]: 'recto', [cops[0].id]: 'lawton', [cops[1].id]: 'lawton', [cops[2].id]: 'quirino' });
    g.players.find((p) => p.id === h.id)!.carried = carried;
    g = act(g, h.id, { type: 'endTurn' });
    return { g, cops };
  }

  it('stays locked until the Heisters have taken 3 Artifacts', () => {
    const { g, cops } = ready(2);
    expect(g.ultimateUnlocked).toBe(false);
    expect(() => act(g, cops[0].id, { type: 'ultimate', line: 'purple' })).toThrow(/unlocks once/);
  });

  it('scans one line through the officer\'s station, once per game, as a free action', () => {
    const { g: start, cops } = ready(3);
    let g = start;
    expect(g.ultimateUnlocked).toBe(true);
    expect(viewFor(g, cops[0].id, T0).ultimateUnlocked).toBe(true);
    expect(() => act(g, cops[0].id, { type: 'ultimate', line: 'blue' })).toThrow(/through your station/);
    g = act(g, cops[0].id, { type: 'ultimate', line: 'orange' });
    const first = g.envelopes.at(-1)!;
    expect(first).toMatchObject({ to: cops[0].id, kind: 'ultimate', scan: { line: 'orange', from: 'lawton', found: false } });
    expect(g.roundActions.at(-1)).toMatchObject({ by: cops[0].id, kind: 'ultimate', line: 'orange' });
    expect(g.log.at(-1)!.text).not.toMatch(/Heister/); // the result stays in the envelope

    // Free: still their turn, and they still get their one action.
    expect(g.policeTurn).toBe(cops[0].id);
    expect(g.players.find((p) => p.id === cops[0].id)!).toMatchObject({ done: false, station: 'lawton', ultimateUsed: true });
    expect(() => act(g, cops[0].id, { type: 'ultimate', line: 'purple' })).toThrow(/already played/);
    g = act(g, cops[0].id, { type: 'move', path: ['recto'], express: false });
    expect(g.players.find((p) => p.id === cops[0].id)!).toMatchObject({ done: true, station: 'recto' });

    // No scanning after your action, and scan-then-pass records only the scan.
    g = act(g, cops[1].id, { type: 'ultimate', line: 'purple' });
    const scan = g.envelopes.at(-1)!.scan!;
    expect(scan.found).toBe(true);
    // Not the exact station: 3 neighbouring Purple stations, one of them Recto.
    expect(scan).not.toHaveProperty('heistersNow');
    expect(scan.zones).toHaveLength(1);
    const [zone] = scan.zones!;
    expect(zone).toHaveLength(3);
    expect(zone).toContain('recto');
    const purple = ['pureza', 'legarda', 'senate_deped', 'recto', 'lawton', 'tutuban', 'divisoria'];
    const runs = [1, 2, 3].map((i) => purple.slice(i, i + 3).sort().join());
    expect(runs).toContain([...zone].sort().join());
    expect(g.envelopes.at(-1)!.lines.join(' ')).not.toMatch(/spotted at/);
    g = act(g, cops[1].id, { type: 'endTurn' });
    expect(g.roundActions.filter((a) => a.by === cops[1].id).map((a) => a.kind)).toEqual(['ultimate']);

    // Next round the first officer's card is spent.
    let t = T0;
    while (g.phase !== 'police' || g.round !== 2) g = act(g, cops[0].id, { type: 'tick' }, (t += 61_000));
    while (g.policeTurn !== cops[0].id) g = act(g, g.policeTurn!, { type: 'endTurn' }, t);
    expect(() => act(g, cops[0].id, { type: 'ultimate', line: 'purple' }, t)).toThrow(/already played/);
  });
});

describe('police ultimate zones', () => {
  // A lone Heister at `at`; the first officer scans `line` from `from`.
  function scan(line: string, at: string, from: string, seed: number) {
    let g = setup(4, seed);
    const [h] = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g = placeAllDirect(g, { [h.id]: at, ...Object.fromEntries(cops.map((c) => [c.id, from])) });
    g.players.find((p) => p.id === h.id)!.carried = 3;
    g = act(g, h.id, { type: 'endTurn' });
    g = act(g, g.policeTurn!, { type: 'ultimate', line });
    return g.envelopes.at(-1)!.scan!.zones![0];
  }
  const linked = (a: string, b: string) => ADJ[a].some((n) => n.to === b);

  it('always names 3 neighbouring stations, including on loops and branches', () => {
    const cases: [string, string, string][] = [
      ['purple', 'common_terminal', 'lawton'], // where the Purple loop closes
      ['lime', 'sucat', 'guadalupe'], // end of the 2-station Lime branch
      ['pink', 'regalado', 'malolos'], // middle of a short Pink branch
      ['red', 'clark_airport', 'malolos'], // end of a line
    ];
    for (const [line, at, from] of cases) {
      const starts = new Set<string>();
      for (let seed = 1; seed <= 12; seed++) {
        const zone = scan(line, at, from, seed);
        expect(zone).toHaveLength(3);
        expect(new Set(zone).size).toBe(3);
        expect(zone).toContain(at);
        expect(linked(zone[0], zone[1]) && linked(zone[1], zone[2])).toBe(true);
        starts.add(zone.join());
      }
      if (at !== 'clark_airport') expect(starts.size).toBeGreaterThan(1); // the Heister's spot in the stretch varies
    }
  });
});

describe('swapping a spectator into a seat', () => {
  function ready() {
    let g = placeAll(setup(5));
    g = addPlayer(g, 'sub', 'Latecomer'); // joins mid-game, so watches
    const [h] = byRole(g, 'heister');
    return { g, h };
  }

  it('hands an offline player\'s seat, with all its game state, to a spectator', () => {
    const { g: start, h } = ready();
    const g0 = setConnected(start, h.id, false);
    const g = swapSeat(g0, 'p0', h.id, 'sub');
    const seat = g.players.find((p) => p.id === h.id)!;
    const old = g.players.find((p) => p.id === 'sub')!;
    expect(seat).toMatchObject({ name: 'Latecomer', connected: true, afk: false, role: 'heister', label: h.label, station: h.station });
    expect(old).toMatchObject({ name: h.name, connected: false, role: 'spectator' });
    expect(viewFor(g, h.id, T0).myRole).toBe('heister');
    expect(g.log.at(-1)!.text).toBe(`Latecomer took over ${h.name}'s seat.`);
    expect(g.log.at(-1)!.text).not.toMatch(/Heister/); // says nothing about the seat's role
  });

  it('swaps out an AFK player who is still connected', () => {
    const { g: start, h } = ready();
    start.players.find((p) => p.id === h.id)!.afk = true;
    const g = swapSeat(start, 'p0', h.id, 'sub');
    expect(g.players.find((p) => p.id === 'sub')!).toMatchObject({ name: h.name, connected: true, role: 'spectator' });
  });

  it('only lets the host swap a spectator into an AFK or offline seat during play', () => {
    const { g, h } = ready();
    const away = setConnected(g, h.id, false);
    expect(() => swapSeat(away, h.id === 'p1' ? 'p2' : 'p1', h.id, 'sub')).toThrow(/Only the host/);
    expect(() => swapSeat(g, 'p0', h.id, 'sub')).toThrow(/AFK or disconnected/);
    expect(() => swapSeat(away, 'p0', h.id, 'p3')).toThrow(/spectator to swap in/);
    expect(() => swapSeat(setConnected(away, 'sub', false), 'p0', h.id, 'sub')).toThrow(/offline/);
    let lobby = createGame('ABCD', 'p0', 'Host', 1);
    lobby = addPlayer(lobby, 'p1', 'One');
    expect(() => swapSeat(lobby, 'p0', 'p1', 'p0')).toThrow(/during a game/);
  });
});

describe('heister stealth mode', () => {
  // One Heister on Recto (Purple); officers on Lawton (one stop away, and on the Purple line).
  function ready(n = 4) {
    let g = setup(n);
    const hs = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    const where: Record<string, string> = { [hs[0].id]: 'recto' };
    if (hs[1]) where[hs[1].id] = 'tutuban';
    for (const c of cops) where[c.id] = 'lawton';
    g = placeAllDirect(g, where);
    return { g, hs, cops };
  }

  it('needs the Heister to be the last one in play', () => {
    const { g, hs } = ready(8);
    expect(hs).toHaveLength(2);
    expect(() => act(g, hs[0].id, { type: 'stealth' })).toThrow(/last Heister/);
  });

  it('hides the Heister from Searches, scans and tracks for two rounds, once per game', () => {
    const { g: start, hs: [h], cops } = ready();
    let g = act(start, h.id, { type: 'stealth' });
    expect(g.players.find((p) => p.id === h.id)!).toMatchObject({ stealthUsed: true, stealthUntil: 2, done: false });
    expect(g.log.at(-1)!.kind).toBe('announce');
    expect(viewFor(g, cops[0].id, T0).players.find((p) => p.id === h.id)!.stealthUntil).toBe(2);
    expect(() => act(g, h.id, { type: 'stealth' })).toThrow(/already used/);

    g.players.find((p) => p.id === h.id)!.carried = 3; // so the Ultimate unlocks
    g = act(g, h.id, { type: 'move', path: ['lawton', 'taytay'], express: false });
    expect(g.phase).toBe('police');

    // Searching the Heister's own station (which they just passed through) and scanning their line find nothing.
    g = act(g, g.policeTurn!, { type: 'search', station: 'taytay' });
    const r = g.envelopes.at(-1)!.search!;
    expect(r.heistersNow).toEqual([]);
    expect(r.tracks).toEqual([]);
    const scanner = g.policeTurn!;
    g = act(g, scanner, { type: 'ultimate', line: 'orange' });
    expect(g.envelopes.at(-1)!.scan!.found).toBe(false);

    // An arrest still lands.
    g = act(g, scanner, { type: 'arrest', station: 'taytay' });
    expect(g.phase).toBe('ended');
  });

  it('wears off after the next round', () => {
    const { g: start, hs: [h], cops } = ready();
    let g = act(start, h.id, { type: 'stealth' });
    g = act(g, h.id, { type: 'endTurn' });
    let t = T0;
    while (g.round < 3 || g.phase !== 'police') g = act(g, cops[0].id, { type: 'tick' }, (t += 61_000));
    expect(viewFor(g, cops[0].id, t).players.find((p) => p.id === h.id)!.stealthUntil).toBeNull();
    const cop = g.policeTurn!;
    g = act(g, cop, { type: 'search', station: 'recto' }, t);
    expect(g.envelopes.at(-1)!.search!.heistersNow).toEqual(['recto']);
  });
});

describe('crooked cop sabotage', () => {
  function ready(carried: number) {
    let g = setup(5);
    const [h] = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    const where: Record<string, string> = { [h.id]: 'recto' };
    for (const c of cops) where[c.id] = 'lawton';
    g = placeAllDirect(g, where);
    g.players.find((p) => p.id === h.id)!.carried = carried;
    g = act(g, h.id, { type: 'endTurn' });
    const traitor = cops.find((c) => c.role === 'traitor')!;
    const honest = cops.filter((c) => c.role === 'police');
    // Hand turns on until the Crooked Cop is up.
    while (g.policeTurn !== traitor.id) g = act(g, g.policeTurn!, { type: 'endTurn' });
    return { g, traitor, honest, h };
  }

  it('stays locked until the Heisters have taken 3 Artifacts, and is the Crooked Cop\'s alone', () => {
    const { g, traitor, honest } = ready(2);
    expect(() => act(g, traitor.id, { type: 'sabotage', target: honest.at(-1)!.id })).toThrow(/unlocks once/);
    expect(() => act(g, honest[0].id, { type: 'sabotage', target: traitor.id })).toThrow(/Only the Crooked Cop/);
  });

  it('secretly jams one officer\'s Searches and scans', () => {
    const { g: start, traitor, honest } = ready(3);
    const target = honest.at(-1)!;
    const logLen = start.log.length;
    let g = act(start, traitor.id, { type: 'sabotage', target: target.id });
    expect(g.log.length).toBe(logLen); // nothing public
    expect(g.roundActions.some((a) => a.by === traitor.id)).toBe(false);
    expect(g.envelopes.at(-1)).toMatchObject({ to: traitor.id, kind: 'sabotage' });
    expect(g.policeTurn).toBe(traitor.id); // free action
    expect(viewFor(g, target.id, T0).players.find((p) => p.id === target.id)!.jammed).toBe(false);
    expect(viewFor(g, traitor.id, T0).players.find((p) => p.id === target.id)!.jammed).toBe(true);
    expect(() => act(g, traitor.id, { type: 'sabotage', target: target.id })).toThrow(/already sabotaged/);
    expect(() => act(g, traitor.id, { type: 'sabotage', target: traitor.id })).toThrow(/another active officer/);

    // The target may already have gone this round; the jam lasts into the next.
    g = act(g, traitor.id, { type: 'endTurn' });
    let t = T0;
    while (g.policeTurn !== target.id) {
      g = g.policeTurn ? act(g, g.policeTurn, { type: 'endTurn' }, t) : act(g, target.id, { type: 'tick' }, (t += 61_000));
    }
    g = act(g, target.id, { type: 'ultimate', line: 'purple' }, t);
    expect(g.envelopes.at(-1)!.scan!.found).toBe(false);
    g = act(g, target.id, { type: 'search', station: 'recto' }, t);
    const r = g.envelopes.at(-1)!.search!;
    expect(r.heistersNow).toEqual([]);
    expect(r.tracks).toEqual([]);
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
    // Use placeAllDirect: lawton may be near an artifact from the default seed.
    g = placeAllDirect(g, Object.fromEntries(g.players.map((p) => [p.id, p.role === 'heister' ? 'lawton' : 'pureza'])));
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

describe('police express', () => {
  // One Heister on Recto. The first officer in seat order starts on Lawton and takes the Orange line Express.
  function expressed(carried: number) {
    let g = setup(4);
    const [h] = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g = placeAllDirect(g, { [h.id]: 'recto', [cops[0].id]: 'lawton', [cops[1].id]: 'pureza', [cops[2].id]: 'quirino' });
    g.players.find((p) => p.id === h.id)!.carried = carried;
    g = act(g, h.id, { type: 'endTurn' });
    g = act(g, cops[0].id, { type: 'move', path: ['taytay', 'east_road'], express: true });
    let t = T0;
    while (g.phase !== 'police' || g.round !== 2) g = act(g, h.id, { type: 'tick' }, (t += 61_000));
    while (g.policeTurn !== cops[0].id) g = act(g, g.policeTurn!, { type: 'endTurn' }, t);
    return { g, t, h, cop: cops[0] };
  }

  it('needs a round to recharge, and everyone can see it', () => {
    const { g, t, h, cop } = expressed(0);
    expect(viewFor(g, cop.id, t).players.find((p) => p.id === cop.id)!.expressCooldown).toBe(true);
    expect(viewFor(g, h.id, t).players.find((p) => p.id === cop.id)!.expressCooldown).toBe(true);
    expect(() => act(g, cop.id, { type: 'move', path: ['bgc'], express: true }, t)).toThrow(/recharging/);
    expect(() => act(g, cop.id, { type: 'move', path: ['bgc'], express: false }, t)).not.toThrow();
  });

  it('stops recharging once Pursuit starts at 3 Artifacts taken', () => {
    const { g, t, cop } = expressed(3);
    expect(g.ultimateUnlocked).toBe(true);
    expect(g.log.some((e) => /Pursuit/.test(e.text))).toBe(true);
    expect(viewFor(g, cop.id, t).players.find((p) => p.id === cop.id)!.expressCooldown).toBe(false);
    expect(() => act(g, cop.id, { type: 'move', path: ['bgc'], express: true }, t)).not.toThrow();
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
    // next is adjacent to the exit and may be near an artifact; bypass chooseStart validation.
    g = placeAllDirect(g, Object.fromEntries(g.players.map((p) => [p.id, p.role === 'heister' ? next : 'pureza'])));
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

  it('allows configuring custom exit stations in lobby', () => {
    let g = createGame('ABCD', 'p0', 'Host', 4);
    for (let i = 1; i < 4; i++) g = addPlayer(g, `p${i}`, `Player${i}`);
    expect(g.settings.searchRange).toBe(3);
    g = act(g, 'p0', { type: 'settings', settings: { customExits: ['tutuban', 'pitx'] } });
    expect(g.settings.customExits).toEqual(['tutuban', 'pitx']);
    expect(g.exits).toEqual(['tutuban', 'pitx']);
    expect(viewFor(g, 'p0', 0).exits).toEqual(['tutuban', 'pitx']);

    // Game starts with the configured exits
    g = act(g, 'p0', { type: 'start' });
    expect(g.exits).toEqual(['tutuban', 'pitx']);
    expect(g.artifacts['tutuban']).toBeUndefined();
    expect(g.artifacts['pitx']).toBeUndefined();
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

  it('clears AFK when the player chats', () => {
    const g = placeAll(setup(4));
    g.players[1].afk = true;
    expect(clearAfk(g, g.players[1].id).players[1].afk).toBe(false);
    expect(clearAfk(g, g.players[2].id)).toBe(g); // nothing to clear, same state back
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
    expect(env.search!.area).toContain('legarda');
    expect(env.search!.heistersNow).toEqual(['legarda']);
    expect(env.lines.join(' ')).toMatch(/Heister at Legarda right now/);
  });
});

describe('round actions', () => {
  it('records officers\' public actions for the round and clears them next round', () => {
    let g = placeAll(setup(6));
    for (const h of byRole(g, 'heister')) g = act(g, h.id, { type: 'endTurn' });
    const first = g.policeTurn!;
    const at = g.players.find((p) => p.id === first)!.station!;
    g = act(g, first, { type: 'search', station: at });
    const second = g.policeTurn!;
    g = act(g, second, { type: 'endTurn' });
    expect(g.roundActions).toEqual([
      { by: first, kind: 'search', station: at },
      { by: second, kind: 'pass', station: g.players.find((p) => p.id === second)!.station },
    ]);
    let t = T0;
    while (g.round === 1) g = act(g, first, { type: 'tick' }, (t += 61_000));
    expect(g.roundActions).toEqual([]);
  });
});
