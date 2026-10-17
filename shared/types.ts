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
  artifactsToEscape: number;
  heisterCount: 'auto' | 1 | 2;
  searchRange: number; // hops from the officer's station
  allowDMs: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  setupSeconds: 60,
  heisterSeconds: 60,
  policeSeconds: 60,
  infoSeconds: 60,
  maxRounds: 15,
  artifactCount: 10,
  artifactsToEscape: 5,
  heisterCount: 'auto',
  searchRange: 1,
  allowDMs: true,
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
  acted: 'search' | 'arrest' | null;
  envelopeGiven: boolean;
}

export interface Envelope {
  id: string;
  to: string;
  round: number;
  kind: 'search' | 'traitor' | 'clue';
  title: string;
  lines: string[];
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

export interface Visit {
  heister: string;
  station: string;
  round: number;
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
  exitStreak: number;
  exitMustClear: boolean;
  accusation: Accusation | null;
  accusationUsed: boolean;
  envelopes: Envelope[];
  log: LogEntry[];
  winner: 'heisters' | 'police' | null;
  endReason: string | null;
  trails: Record<string, { round: number; station: string }[]>;
  nextId: number;
}

export type Action =
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'spectate'; on: boolean }
  | { type: 'start' }
  | { type: 'chooseStart'; station: string }
  | { type: 'move'; path: string[]; express: boolean }
  | { type: 'search'; station: string }
  | { type: 'arrest'; station: string }
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
  acted: 'search' | 'arrest' | null;
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
  exitMustClear: boolean;
  exitStreak: number;
  accusation: Accusation | null;
  accusationUsed: boolean;
  envelopes: Envelope[];
  log: LogEntry[];
  winner: 'heisters' | 'police' | null;
  endReason: string | null;
  trails: Record<string, { round: number; station: string }[]> | null;
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
