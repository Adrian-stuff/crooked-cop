import { describe, expect, it } from 'vitest';
import { addPlayer, applyAction, createGame, validatePath, viewFor, GameError } from './engine';
import { ADJ, EDGES, EXIT_STATION, STATIONS, distance } from './map';
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
  it('lets a normal move transfer lines but Express must stay on one line', () => {
    // lawton -> taytay is Orange, lawton -> recto is Purple
    expect(() => validatePath('recto', ['lawton', 'taytay'], false)).not.toThrow();
    expect(() => validatePath('recto', ['lawton', 'taytay'], true)).toThrow(/one line/);
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
    // cops[1] at pier_4 arrests divisoria (empty) -> penalty
    g = act(g, cops[1].id, { type: 'arrest', station: 'divisoria' });
    expect(g.players.find((p) => p.id === cops[1].id)!.skipPoliceRound).toBe(2);
    // cops[0] at senate_deped arrests recto (adjacent) -> catches h1 with 3 artifacts
    g = act(g, cops[0].id, { type: 'arrest', station: 'recto' });
    expect(g.players.find((p) => p.id === h1.id)!.status).toBe('arrested');
    expect(g.artifacts.recto).toBe(3);
    expect(g.arrestsThisRound).toBe(2);
    expect(g.phase).toBe('police');
  });

  it('caps arrests at three per round', () => {
    let g = setup(8);
    const hs = byRole(g, 'heister');
    const cops = g.players.filter((p) => p.role === 'police' || p.role === 'traitor');
    g = placeAll(g, Object.fromEntries([...hs.map((h) => [h.id, 'quirino']), ...cops.map((c) => [c.id, 'pureza'])]));
    for (const h of hs) g = act(g, h.id, { type: 'endTurn' });
    for (let i = 0; i < 3; i++) g = act(g, cops[i].id, { type: 'arrest', station: 'legarda' });
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
    g = act(g, traitor.id, { type: 'search', station: at(traitor.id) });
    g = act(g, traitor.id, { type: 'endTurn' });
    const tv = viewFor(g, traitor.id, T0);
    expect(tv.envelopes.some((e) => e.kind === 'traitor' && e.lines.length === 2)).toBe(true);
    g = act(g, cop.id, { type: 'search', station: at(cop.id) });
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
    g = act(g, traitor.id, { type: 'tick' }, T0 + 61_000);
    expect(g.phase).toBe('info');
    g = act(g, cops[0].id, { type: 'accuse', target: cops[1].id }, T0 + 61_000);
    g = act(g, cops[2].id, { type: 'vote', yes: true }, T0 + 61_000);
    g = act(g, traitor.id, { type: 'vote', yes: true }, T0 + 61_000);
    expect(g.players.find((p) => p.id === cops[1].id)!.noArrestRound).toBe(2);
    // Next round: correct accusation
    g = act(g, traitor.id, { type: 'tick' }, T0 + 200_000);
    g = act(g, traitor.id, { type: 'tick' }, T0 + 400_000);
    g = act(g, traitor.id, { type: 'tick' }, T0 + 600_000);
    expect(g.phase).toBe('info');
    g = act(g, cops[0].id, { type: 'accuse', target: traitor.id }, T0 + 600_000);
    g = act(g, cops[1].id, { type: 'vote', yes: true }, T0 + 600_000);
    g = act(g, cops[2].id, { type: 'vote', yes: true }, T0 + 600_000);
    expect(g.players.find((p) => p.id === traitor.id)!.status).toBe('exposed');
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
