// Facilitator-only mode for a game played on the physical board. The rules engine runs here in
// the browser, the facilitator records every player's move on this one device, and the game is
// saved locally so a reload doesn't lose it. Nothing goes to a server.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GameError, addPlayer, applyAction, createGame, kickPlayer, tick, viewFor } from '../../shared/engine';
import { EXIT_STATION, stationLabel } from '../../shared/map';
import type { Action, GameState, Role, Settings, View } from '../../shared/types';

export const FACILITATOR = 'facilitator';
const SAVE_KEY = 'crooked-cop-table';
const HISTORY = 50;

export type DealtRole = Exclude<Role, 'spectator'>;

interface Snapshot {
  state: GameState;
  left: number | null; // time left on the phase timer, so an undo doesn't land on an expired one
}

interface TableSave {
  state: GameState;
  paused: number | null; // ms left on the timer while paused
  dealRandom: boolean; // deal roles at random, or match the physical role cards
  roles: Record<string, DealtRole>;
  history: Snapshot[];
}

function load(): TableSave | null {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export const hasTableGame = () => !!load();

function store(s: TableSave | null) {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage full or unavailable: the game still runs, it just won't survive a reload */
  }
}

function fresh(): TableSave {
  const state = createGame('TABLE', FACILITATOR, 'Facilitator', (Math.random() * 2 ** 31) | 0);
  state.players[0].wantsSpectate = true; // the facilitator sees everything and doesn't play
  return { state, paused: null, dealRandom: true, roles: {}, history: [] };
}

const left = (s: TableSave, t: number) => s.paused ?? (s.state.deadline === null ? null : Math.max(0, s.state.deadline - t));

// While paused the engine sees no deadline, so nothing times out; the time left waits in `paused`.
function holdTimer(s: TableSave, t: number): TableSave {
  if (s.paused === null || s.state.deadline === null) return s;
  const state = { ...s.state, deadline: null };
  return { ...s, state, paused: Math.max(0, s.state.deadline - t) };
}

// Replaces the engine's random deal with the roles on the physical cards.
function dealCards(g: GameState, roles: Record<string, DealtRole>): GameState {
  const out = structuredClone(g);
  let h = 0;
  for (const p of out.players) {
    if (p.role === 'spectator') continue;
    p.role = roles[p.id] ?? 'police';
    p.label = p.role === 'heister' ? `H${++h}` : undefined;
  }
  const heisters = out.players.filter((p) => p.role === 'heister');
  const names = heisters.map((p) => `${p.label} (${p.name})`).join(' and ');
  const first = out.log.find((e) => e.kind === 'announce');
  if (first) first.text = `The heist is on. ${names} ${heisters.length > 1 ? 'are' : 'is'} the Heister${heisters.length > 1 ? 's' : ''}. One officer is crooked.`;
  return out;
}

export function checkCards(state: GameState, roles: Record<string, DealtRole>): string | null {
  const seats = state.players.filter((p) => !p.wantsSpectate);
  const count = (r: DealtRole) => seats.filter((p) => (roles[p.id] ?? 'police') === r).length;
  if (count('traitor') !== 1) return 'Mark exactly one Crooked Cop.';
  if (count('heister') < 1 || count('heister') > 2) return 'Mark one or two Heisters.';
  if (count('police') < 1) return 'At least one honest officer is needed.';
  return null;
}

export function useTableGame() {
  const [save, setSave] = useState<TableSave | null>(() => load() ?? fresh());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => store(save), [save]);

  // Runs the phase timer: once it expires the engine moves the game on, exactly as online.
  useEffect(() => {
    const id = setInterval(() => {
      setSave((s) => {
        if (!s || s.state.deadline === null || Date.now() < s.state.deadline) return s;
        return { ...s, state: tick(s.state, Date.now()) };
      });
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Applies a change and keeps the previous state for Undo. Engine errors show as a toast.
  const change = useCallback((fn: (s: TableSave, t: number) => TableSave, undoable = true) => {
    setSave((s) => {
      if (!s) return s;
      const t = Date.now();
      try {
        const next = holdTimer(fn(s, t), t);
        if (!undoable) return next;
        const history = [...s.history, { state: s.state, left: left(s, t) }].slice(-HISTORY);
        return { ...next, history };
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        // Toast after the update, not inside it.
        setTimeout(() => setError(e.message));
        return s;
      }
    });
  }, []);

  // Several players' actions as one step, so a single Undo takes them all back.
  const record = useCallback((steps: [string, Action][]) => {
    change((s, t) => ({ ...s, state: steps.reduce((g, [id, a]) => applyAction(g, id, a, t), s.state) }));
  }, [change]);
  const actAs = useCallback((id: string, ...actions: Action[]) => record(actions.map((a) => [id, a])), [record]);

  const view: View | null = useMemo(() => (save ? viewFor(save.state, FACILITATOR, Date.now()) : null), [save]);

  // The board as one player would act on it, but with everything visible: the facilitator
  // records their move, and the dock and station menu only offer what that player may legally do.
  const viewAs = useCallback((id: string): View | null => {
    if (!view) return null;
    const p = view.players.find((x) => x.id === id);
    if (!p || p.role === 'spectator' || p.role === 'unknown') return null;
    return { ...view, me: id, myRole: p.role, godView: false };
  }, [view]);

  return {
    save,
    view,
    viewAs,
    error,
    clearError: () => setError(null),
    paused: save?.paused ?? null,
    canUndo: !!save?.history.length,

    endSession: () => setSave(null),

    // ---------- Lobby ----------
    addPlayer: (name: string) => change((s) => {
      const state = addPlayer(s.state, `p${s.state.nextId}`, name);
      state.nextId++; // player ids come from nextId, so bump it to keep them unique
      return { ...s, state };
    }, false),
    removePlayer: (id: string) => change((s) => {
      const state = kickPlayer(s.state, FACILITATOR, id);
      const roles = { ...s.roles };
      delete roles[id];
      return { ...s, state, roles };
    }, false),
    setSettings: (settings: Partial<Settings>) => change((s, t) => ({ ...s, state: applyAction(s.state, FACILITATOR, { type: 'settings', settings }, t) }), false),
    setDealRandom: (on: boolean) => change((s) => ({ ...s, dealRandom: on }), false),
    setRole: (id: string, role: DealtRole) => change((s) => ({ ...s, roles: { ...s.roles, [id]: role } }), false),
    start: () => change((s, t) => {
      if (!s.dealRandom) {
        const problem = checkCards(s.state, s.roles);
        if (problem) throw new GameError(problem);
      }
      const started = applyAction(s.state, FACILITATOR, { type: 'start' }, t);
      return { ...s, state: s.dealRandom ? started : dealCards(started, s.roles), history: [] };
    }, false),

    // ---------- Recording ----------
    act: (action: Action) => actAs(FACILITATOR, action),
    actAs,
    record,
    undo: () => setSave((s) => {
      if (!s?.history.length) return s;
      const prev = s.history[s.history.length - 1];
      const t = Date.now();
      const paused = s.paused === null ? null : prev.left;
      const deadline = prev.left === null || paused !== null ? null : t + prev.left;
      return { ...s, state: { ...prev.state, deadline }, paused, history: s.history.slice(0, -1) };
    }),
    // Artifacts are dealt at random; during setup the facilitator can move them to match the board.
    toggleArtifact: (station: string) => change((s) => {
      if (s.state.phase !== 'setup') throw new GameError('Artifacts can only be placed during setup.');
      if (s.state.exits.includes(station) || station === EXIT_STATION) throw new GameError('Artifacts are never placed on an Exit Station.');
      const g = structuredClone(s.state);
      if (g.artifacts[station]) delete g.artifacts[station];
      else g.artifacts[station] = 1;
      g.settings.artifactCount = Object.values(g.artifacts).reduce((a, b) => a + b, 0);
      return { ...s, state: g };
    }),
    note: (text: string) => change((s) => {
      const g = structuredClone(s.state);
      g.log.push({ id: g.nextId++, round: g.round, kind: 'info', text: `Note: ${text.trim()}` });
      return { ...s, state: g };
    }),

    // ---------- Timer ----------
    pause: () => setSave((s) => (s && s.paused === null && s.state.deadline !== null
      ? { ...s, paused: Math.max(0, s.state.deadline - Date.now()), state: { ...s.state, deadline: null } } : s)),
    resume: () => setSave((s) => (s && s.paused !== null
      ? { ...s, paused: null, state: { ...s.state, deadline: Date.now() + s.paused } } : s)),
    addTime: (seconds: number) => setSave((s) => {
      if (!s) return s;
      if (s.paused !== null) return { ...s, paused: s.paused + seconds * 1000 };
      if (s.state.deadline === null) return s;
      return { ...s, state: { ...s.state, deadline: s.state.deadline + seconds * 1000 } };
    }),
  };
}

export type TableGame = ReturnType<typeof useTableGame>;

// ---------- Export ----------

const ROLE_NAME: Record<Role, string> = { heister: 'Heister', police: 'Officer', traitor: 'Crooked Cop', spectator: 'Facilitator' };

// The whole game as plain text: players, the dispatch log round by round, and every clue handed out.
export function gameRecord(g: GameState): string {
  const name = (id: string) => g.players.find((p) => p.id === id)?.name ?? id;
  const out: string[] = [];
  out.push('THE CROOKED COP — game record', `Recorded ${new Date().toLocaleString()}`, '');
  out.push('PLAYERS');
  for (const p of g.players.filter((x) => x.role !== 'spectator')) {
    const where = p.station ? ` · ${p.status === 'active' ? 'last at' : p.status + ' at'} ${stationLabel(p.station)}` : '';
    const carry = p.role === 'heister' ? ` · carrying ${p.carried}` : '';
    out.push(`  ${p.name} — ${ROLE_NAME[p.role]}${p.label ? ` ${p.label}` : ''}${where}${carry}`);
  }
  out.push('', `Exits: ${g.exits.map(stationLabel).join(', ')} · ${g.settings.artifactCount} Artifacts · ${g.settings.maxRounds} rounds`);
  if (g.winner) out.push(`Result: ${g.winner === 'heisters' ? 'Heisters' : 'Police'} win. ${g.endReason ?? ''}`);
  out.push('', 'DISPATCH LOG');
  let round = -1;
  for (const e of g.log) {
    if (e.round !== round) {
      round = e.round;
      out.push('', round === 0 ? 'Setup' : `Round ${round}`);
    }
    out.push(`  ${e.text}`);
  }
  out.push('', 'CLUES AND ENVELOPES');
  if (!g.envelopes.length) out.push('  None');
  for (const e of g.envelopes) {
    out.push('', `  R${e.round} · ${name(e.to)} · ${e.title}`);
    for (const line of e.lines) out.push(`    ${line}`);
  }
  const left = Object.entries(g.artifacts).filter(([, n]) => n > 0);
  out.push('', 'ARTIFACTS STILL ON THE BOARD', left.length ? `  ${left.map(([s, n]) => `${stationLabel(s)}${n > 1 ? ` ×${n}` : ''}`).join(', ')}` : '  None');
  return out.join('\n');
}

export function downloadRecord(g: GameState) {
  const blob = new Blob([gameRecord(g)], { type: 'text/plain' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  a.href = URL.createObjectURL(blob);
  a.download = `crooked-cop-${stamp}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
