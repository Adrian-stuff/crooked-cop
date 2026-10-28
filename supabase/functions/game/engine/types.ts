// GENERATED from shared/types.ts by scripts/sync-function.mjs. Edit the original.
export type Role = 'heister' | 'police' | 'traitor' | 'spectator';
export type PublicRole = 'heister' | 'police' | 'traitor' | 'spectator' | 'unknown';
export type Phase = 'lobby' | 'setup' | 'heister' | 'police' | 'info' | 'ended';
export type PlayerStatus = 'active' | 'arrested' | 'escaped' | 'exposed';

export interface Settings {
  setupSeconds: number;
  heisterSeconds: number;
  policeSeconds: number;
  infoSeconds: number;
  maxRounds: number;
  artifactCount: number;
  heisterCount: 'auto' | 1 | 2;
  searchRange: number; // hops from the officer's station
  allowDMs: boolean;
  customExits?: string[]; // station IDs configured as exits (empty = auto based on seat count)
}

export const DEFAULT_SETTINGS: Settings = {
  setupSeconds: 60,
  heisterSeconds: 60,
  policeSeconds: 45, // per officer: the Police Phase is taken one officer at a time
  infoSeconds: 60,
  maxRounds: 15,
  artifactCount: 10,
  heisterCount: 'auto',
  searchRange: 3,
  allowDMs: true,
  customExits: [],
};

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  wantsSpectate: boolean;
  role: Role;
  label?: string; // H1 / H2 for heisters
  status: PlayerStatus;
  station: string | null;
  carried: number;
  done: boolean; // finished the current phase
  skipPoliceRound?: number; // wrong-arrest penalty
  noArrestRound?: number; // wrongly-accused penalty
  moved: boolean;
  acted: 'search' | 'arrest' | 'ultimate' | null;
  envelopeGiven: boolean;
  autoPlaced?: boolean; // placed at random when setup timed out
  cleared?: boolean; // voted on and shown not to be the Crooked Cop
  expressRound?: number; // round this player last took the Express
  afk?: boolean; // let their timer run out without acting; cleared when they act
  ultimateUsed?: boolean; // officer has played their one Police Ultimate card
  stealthUsed?: boolean; // Heister has played their one Stealth Mode
  stealthUntil?: number; // Heister is hidden from Searches, scans and clues through the end of this round
  sabotageUsed?: boolean; // Crooked Cop has played their one Sabotage
  jammedUntil?: number; // officer's Searches and scans are secretly jammed through the end of this round
}

export interface Envelope {
  id: string;
  to: string;
  round: number;
  kind: 'search' | 'traitor' | 'clue' | 'ultimate' | 'sabotage';
  title: string;
  lines: string[]; // plain-text version, for older clients and saved games
  search?: SearchResult;
  tip?: TipResult[];
  scan?: ScanResult;
}

// What a Police Ultimate found: whether any Heister is on the chosen line right now and,
// for each one, 3 stations in a row on the line that they're somewhere among.
export interface ScanResult {
  line: string;
  from: string; // the officer's station
  stations: string[]; // every station on the line
  found: boolean;
  zones?: string[][]; // one stretch of 3 neighbouring stations per Heister spotted
  heistersNow?: string[]; // exact stations; only in scans from games saved before zones
}

// What a Search found, so the client can lay it out instead of reading sentences.
export interface SearchResult {
  station: string;
  area: string[]; // every station the sweep covered, the searched one first
  heistersNow: string[]; // stations in the area with a Heister on them now
  tracks: { station: string; ago: number }[]; // Heister visits in the last 2 rounds
  hidden: string[]; // stations still holding an Artifact
  taken: { station: string; round: number }[];
  clue: string; // random field clue, not tied to the area
}

// One Heister's position in a Crooked Cop tip-off.
export interface TipResult {
  id: string;
  label: string;
  station: string | null;
  status: PlayerStatus;
}

export interface LogEntry {
  id: number;
  round: number;
  kind: 'info' | 'arrest' | 'fail' | 'accuse' | 'expose' | 'announce' | 'win';
  text: string;
}

export interface Accusation {
  by: string;
  target: string;
  votes: Record<string, boolean>;
}

// Shown to everyone when an accusation vote passes.
export interface Reveal {
  id: number;
  round: number;
  target: string;
  guilty: boolean;
}

// Heister positions as of the Crooked Cop's latest tip-off (null: no longer active).
export interface Tipoff {
  round: number;
  at: Record<string, string | null>;
}

// An officer's action this round. All of these are announced in the log, so everyone may see them.
export interface RoundAction {
  by: string;
  kind: 'move' | 'search' | 'arrest' | 'ultimate' | 'pass';
  station: string;
  ok?: boolean; // arrests: whether anyone was caught
  line?: string; // ultimates: the line that was scanned
}

export interface Visit {
  heister: string;
  station: string;
  round: number;
  hidden?: boolean; // made in Stealth Mode, so it leaves no tracks
}

export interface GameState {
  code: string;
  rng: number;
  settings: Settings;
  phase: Phase;
  round: number;
  deadline: number | null;
  players: Player[];
  artifacts: Record<string, number>;
  announcedTaken: number;
  visits: Visit[];
  pickups: { station: string; round: number }[];
  arrestsThisRound: number;
  exits: string[]; // Exit Stations in play this game
  exitStreak: Record<string, number>; // rounds in a row an officer ended on each exit
  exitMustClear: string[]; // exits that must be empty of officers at the end of this round
  accusation: Accusation | null;
  accusationUsed: boolean;
  envelopes: Envelope[];
  log: LogEntry[];
  winner: 'heisters' | 'police' | null;
  endReason: string | null;
  trails: Record<string, { round: number; station: string }[]>;
  nextId: number;
  policeTurn: string | null; // the officer acting now in the Police Phase
  reveal: Reveal | null; // result of the latest passed accusation vote
  tipoff: Tipoff | null; // where the Heisters were at the Crooked Cop's latest tip-off
  roundActions: RoundAction[]; // officers' public actions this round
  takenThisRound: number; // Artifacts taken in this round's Heister Phase (as announced)
  ultimateUnlocked: boolean; // the Heisters have taken enough Artifacts for officers to play their Ultimate; also Pursuit (no Express recharge)
}

export type Action =
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'spectate'; on: boolean }
  | { type: 'start' }
  | { type: 'chooseStart'; station: string }
  | { type: 'move'; path: string[]; express: boolean }
  | { type: 'search'; station: string }
  | { type: 'arrest'; station: string }
  | { type: 'ultimate'; line: string }
  | { type: 'stealth' }
  | { type: 'sabotage'; target: string }
  | { type: 'endTurn' }
  | { type: 'accuse'; target: string }
  | { type: 'vote'; yes: boolean }
  | { type: 'ready' }
  | { type: 'tick' }
  | { type: 'rematch' };

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  wantsSpectate: boolean;
  role: PublicRole;
  label?: string;
  status: PlayerStatus;
  station: string | null;
  carried: number | null;
  done: boolean;
  skipsPolice: boolean;
  cannotArrest: boolean;
  moved: boolean;
  acted: 'search' | 'arrest' | 'ultimate' | null;
  cleared: boolean;
  expressCooldown: boolean; // used Express last round, so it's recharging (a Heister's: Heister team and facilitator only)
  afk: boolean;
  ultimateUsed: boolean;
  stealthUsed: boolean; // public: Stealth Mode is announced
  stealthUntil: number | null; // public: last round of an active Stealth Mode
  sabotageUsed: boolean; // only the Crooked Cop themself and the facilitator see this
  jammed: boolean; // only the Crooked Cop and the facilitator see who is jammed
}

export interface View {
  rev?: number; // room version; clients ignore views older than the one they have
  code: string;
  me: string;
  myRole: Role;
  godView: boolean;
  settings: Settings;
  phase: Phase;
  round: number;
  deadline: number | null;
  serverNow: number;
  players: PublicPlayer[];
  artifacts: Record<string, number> | null; // only heisters / god / end
  announcedTaken: number;
  arrestsLeft: number;
  exits: string[];
  exitMustClear: string[];
  exitStreak: Record<string, number>;
  accusation: Accusation | null;
  accusationUsed: boolean;
  envelopes: Envelope[];
  log: LogEntry[];
  winner: 'heisters' | 'police' | null;
  endReason: string | null;
  trails: Record<string, { round: number; station: string }[]> | null;
  policeTurn: string | null;
  reveal: Reveal | null;
  tipoff: Tipoff | null; // only for the Crooked Cop
  roundActions: RoundAction[];
  takenThisRound: number;
  ultimateUnlocked: boolean;
}

export type ChatChannel = 'lobby' | 'police' | 'heisters' | `dm:${string}`;

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  from: string;
  name: string;
  text: string;
  ts: number;
}
