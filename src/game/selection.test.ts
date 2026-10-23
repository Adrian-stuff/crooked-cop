import { describe, expect, it } from 'vitest';
import { distance, EXIT_STATION, STATIONS } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';
import { isOfficer, setupOrder } from '../screens/TableScreen';
import { actsThisPhase, canTarget, candidates, marksFor } from './selection';

function makePlayer(partial: Partial<PublicPlayer> & { id: string; name: string; role: PublicPlayer['role'] }): PublicPlayer {
  return {
    status: 'active',
    station: null,
    carried: 0,
    done: false,
    afk: false,
    connected: true,
    isHost: false,
    wantsSpectate: false,
    skipsPolice: false,
    cannotArrest: false,
    moved: false,
    acted: null,
    cleared: false,
    expressCooldown: false,
    ultimateUsed: false,
    ...partial,
  };
}

function makeView(role: 'heister' | 'police' | 'traitor', artifacts: Record<string, number> = {}): View {
  const me = makePlayer({ id: 'p1', name: 'Player 1', role });
  return {
    code: 'TEST',
    serverNow: 0,
    arrestsLeft: 3,
    me: 'p1',
    myRole: role,
    godView: false,
    phase: 'setup',
    round: 0,
    deadline: null,
    exits: [EXIT_STATION],
    settings: {
      heisterSeconds: 60,
      policeSeconds: 60,
      infoSeconds: 60,
      setupSeconds: 60,
      maxRounds: 16,
      artifactCount: Object.keys(artifacts).length,
      searchRange: 1,
      heisterCount: 1,
      allowDMs: true,
    },
    players: [me],
    artifacts,
    announcedTaken: 0,
    takenThisRound: 0,
    policeTurn: null,
    roundActions: [],
    accusation: null,
    accusationUsed: false,
    reveal: null,
    tipoff: null,
    ultimateUnlocked: false,
    winner: null,
    endReason: null,
    envelopes: [],
    log: [],
    exitStreak: {},
    exitMustClear: [],
    trails: null,
  };
}

describe('selection candidates for setup (mode === "start")', () => {
  it('allows all stations for police and traitor officers', () => {
    const policeView = makeView('police', { recto: 1 });
    const policeCand = candidates(policeView, 'start', []);
    expect(policeCand.length).toBe(STATIONS.length);
    expect(policeCand).toContain(EXIT_STATION);
    expect(policeCand).toContain('recto');

    const traitorView = makeView('traitor', { recto: 1 });
    const traitorCand = candidates(traitorView, 'start', []);
    expect(traitorCand.length).toBe(STATIONS.length);
  });

  it('excludes exits for heisters', () => {
    const heisterView = makeView('heister', {});
    const cands = candidates(heisterView, 'start', []);
    expect(cands).not.toContain(EXIT_STATION);
    expect(canTarget(heisterView, 'start', EXIT_STATION)).toBe(false);
  });

  it('does not highlight stations that are less than 3 stations away from any artifact for heisters', () => {
    // Let artifact be at 'recto'
    // 'recto' distance to 'recto' is 0
    // distance('recto', 'taytay') is 2
    // distance('recto', 'east_road') is 3
    expect(distance('recto', 'recto')).toBe(0);
    expect(distance('recto', 'taytay')).toBe(2);
    expect(distance('recto', 'east_road')).toBe(3);

    const heisterView = makeView('heister', { recto: 1 });
    const cands = candidates(heisterView, 'start', []);

    // Stations 0, 1, 2 stations away must NOT be candidates
    expect(cands).not.toContain('recto');
    expect(cands).not.toContain('taytay');
    expect(canTarget(heisterView, 'start', 'recto')).toBe(false);
    expect(canTarget(heisterView, 'start', 'taytay')).toBe(false);

    // Stations 3 stations away (or more) ARE valid candidates
    expect(cands).toContain('east_road');
    expect(canTarget(heisterView, 'start', 'east_road')).toBe(true);

    const marks = marksFor(heisterView, 'start', []);
    expect(marks['recto']).toBeUndefined();
    expect(marks['taytay']).toBeUndefined();
    expect(marks['east_road']).toBe('start');
  });

  it('checks against all artifacts when multiple artifacts exist', () => {
    const heisterView = makeView('heister', { recto: 1, pureza: 1 });
    const cands = candidates(heisterView, 'start', []);

    for (const st of STATIONS) {
      const distRecto = distance(st.id, 'recto');
      const distPureza = distance(st.id, 'pureza');
      const isExit = st.id === EXIT_STATION;
      const shouldBeAllowed = !isExit && distRecto >= 3 && distPureza >= 3;

      if (shouldBeAllowed) {
        expect(cands).toContain(st.id);
      } else {
        expect(cands).not.toContain(st.id);
      }
    }
  });
});

describe('facilitator setup phase player ordering', () => {
  const p1 = makePlayer({ id: 'p1', name: 'Heister 1', role: 'heister' });
  const p2 = makePlayer({ id: 'p2', name: 'Officer 1', role: 'police' });
  const p3 = makePlayer({ id: 'p3', name: 'Crooked Cop', role: 'traitor' });
  const p4 = makePlayer({ id: 'p4', name: 'Officer 2', role: 'police' });
  const p5 = makePlayer({ id: 'p5', name: 'Heister 2', role: 'heister' });

  it('orders officers (police and traitor) before heisters while preserving seat order', () => {
    const players = [p1, p2, p3, p4, p5];
    const sorted = [...players].sort(setupOrder);
    expect(sorted.map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p1', 'p5']);
    expect(isOfficer(sorted[0].role)).toBe(true);
    expect(isOfficer(sorted[1].role)).toBe(true);
    expect(isOfficer(sorted[2].role)).toBe(true);
    expect(sorted[3].role).toBe('heister');
    expect(sorted[4].role).toBe('heister');
  });

  it('simulates setup phase stepping through all officers first before heister', () => {
    const players = [p1, p2, p3, p4, p5].map((p) => ({ ...p }));
    let waiting = players.filter((p) => actsThisPhase('setup', p) && !p.done).sort(setupOrder);

    // Initial state: Officers p2, p3, p4 must be placed first
    let hasWaitingOfficer = waiting.some((p) => isOfficer(p.role));
    expect(hasWaitingOfficer).toBe(true);
    let actor = waiting[0];
    expect(actor.id).toBe('p2');

    // Place p2
    actor.done = true;
    waiting = players.filter((p) => actsThisPhase('setup', p) && !p.done).sort(setupOrder);
    hasWaitingOfficer = waiting.some((p) => isOfficer(p.role));
    expect(hasWaitingOfficer).toBe(true);
    actor = waiting[0];
    expect(actor.id).toBe('p3');

    // Place p3
    actor.done = true;
    waiting = players.filter((p) => actsThisPhase('setup', p) && !p.done).sort(setupOrder);
    hasWaitingOfficer = waiting.some((p) => isOfficer(p.role));
    expect(hasWaitingOfficer).toBe(true);
    actor = waiting[0];
    expect(actor.id).toBe('p4');

    // Place p4
    actor.done = true;
    waiting = players.filter((p) => actsThisPhase('setup', p) && !p.done).sort(setupOrder);
    hasWaitingOfficer = waiting.some((p) => isOfficer(p.role));
    // All officers done! Now heisters can be placed
    expect(hasWaitingOfficer).toBe(false);
    actor = waiting[0];
    expect(actor.id).toBe('p1');
    expect(actor.role).toBe('heister');

    // Place p1
    actor.done = true;
    waiting = players.filter((p) => actsThisPhase('setup', p) && !p.done).sort(setupOrder);
    actor = waiting[0];
    expect(actor.id).toBe('p5');
    expect(actor.role).toBe('heister');
  });
});
