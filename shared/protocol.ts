import type { Action, ChatMessage, View } from './types.ts';

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'action'; action: Action }
  | { t: 'kick'; playerId: string }
  | { t: 'swap'; seat: string; with: string }
  | { t: 'chat'; channel: string; text: string }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'view'; view: View }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chatHistory'; msgs: ChatMessage[] }
  | { t: 'error'; message: string }
  | { t: 'left' };
