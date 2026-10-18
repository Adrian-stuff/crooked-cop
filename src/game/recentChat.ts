import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../shared/types';

// Messages that arrived in the last few seconds, for speech bubbles on the map.
// History loaded on join or reconnect is skipped so the board doesn't flood with old chat.
export function useRecentChat(messages: ChatMessage[], clockOffset: number, showFor = 6000): ChatMessage[] {
  const seen = useRef(new Set<string>());
  const [recent, setRecent] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const now = Date.now() + clockOffset;
    const fresh = messages.filter((m) => !seen.current.has(m.id) && m.from !== 'system' && now - m.ts < 10_000);
    for (const m of messages) seen.current.add(m.id);
    if (!fresh.length) return;
    setRecent((r) => [...r, ...fresh].slice(-8));
    setTimeout(() => setRecent((r) => r.filter((m) => !fresh.includes(m))), showFor);
  }, [messages, clockOffset, showFor]);

  return recent;
}

export const channelKind = (channel: string) =>
  channel === 'police' ? 'police' : channel === 'heisters' ? 'heisters' : channel.startsWith('dm:') ? 'dm' : 'all';

export const channelLabel = (channel: string) =>
  channel === 'police' ? 'Police' : channel === 'heisters' ? 'Heisters' : channel.startsWith('dm:') ? 'DM' : 'All';
