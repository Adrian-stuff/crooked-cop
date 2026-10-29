import type { Action, ChatMessage, View } from './types.ts';

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'action'; action: Action }
  | { t: 'kick'; playerId: string }
  | { t: 'swap'; seat: string; with: string }
  // Local dev only (VITE_DEV_IMPERSONATE=1 in .env.development.local, from this machine): list rooms, take over a seat.
  | { t: 'devRooms' }
  | { t: 'devImpersonate'; code: string; playerId: string }
  | { t: 'chat'; channel: string; text: string }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'view'; view: View }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chatHistory'; msgs: ChatMessage[] }
  | { t: 'error'; message: string }
  | { t: 'left' }
  | { t: 'devRooms'; rooms: DevRoom[] }
  | { t: 'devToken'; code: string; token: string };

export interface DevRoom {
  code: string;
  phase: string;
  round: number;
  players: { id: string; name: string; role: string; label?: string; status: string; connected: boolean; afk: boolean }[];
}
