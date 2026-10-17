import { useEffect, useMemo, useRef, useState } from 'react';
import { dmChannel, dmParticipants } from '../../shared/chat';
import type { ChatMessage, View } from '../../shared/types';
import { seatIdentities } from '../game/identity';

interface Props {
  view: View;
  messages: ChatMessage[];
  say: (channel: string, text: string) => void;
}

const isOfficer = (role: string) => role === 'police' || role === 'traitor';

export function Chat({ view, messages, say }: Props) {
  const [channel, setChannel] = useState('lobby');
  const [text, setText] = useState('');
  const [seen, setSeen] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const inGame = view.phase !== 'lobby';
  const me = view.players.find((p) => p.id === view.me);

  const tabs = useMemo(() => {
    const t: { id: string; label: string; cls?: string }[] = [{ id: 'lobby', label: 'All' }];
    const ended = view.phase === 'ended';
    if (inGame && (isOfficer(view.myRole) || view.godView || ended)) t.push({ id: 'police', label: 'Police', cls: 'police' });
    if (inGame && (view.myRole === 'heister' || view.godView || ended)) t.push({ id: 'heisters', label: 'Heisters', cls: 'heisters' });
    const dmIds = new Set(messages.map((m) => m.channel).filter((c) => c.startsWith('dm:')));
    if (channel.startsWith('dm:')) dmIds.add(channel as ChatMessage['channel']);
    for (const c of dmIds) {
      const other = dmParticipants(c)?.find((id) => id !== view.me);
      const name = view.players.find((p) => p.id === other)?.name ?? 'Left';
      t.push({ id: c, label: `@${name}`, cls: 'dm' });
    }
    return t;
  }, [inGame, view.myRole, view.godView, view.phase, view.players, view.me, messages, channel]);

  const current = tabs.some((t) => t.id === channel) ? channel : 'lobby';
  const shown = messages.filter((m) => m.channel === current);
  const ids = useMemo(() => seatIdentities(view.players), [view.players]);

  useEffect(() => {
    setSeen((s) => ({ ...s, [current]: shown.length }));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [current, shown.length]);

  const dmTargets = view.players.filter((p) => p.id !== view.me && p.role !== 'spectator' && !p.wantsSpectate);
  const canDM = view.settings.allowDMs && me && view.myRole !== 'spectator' && !me.wantsSpectate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    say(current, text);
    setText('');
  };

  const placeholder = current === 'police'
    ? (view.myRole === 'traitor' ? 'Message the team… (they trust you)' : 'Message the Police team…')
    : current === 'heisters' ? 'Plan with your partner…'
      : current.startsWith('dm:') ? 'Private message…' : 'Message everyone…';

  return (
    <section className="panel chat">
      <div className="chat-tabs" role="tablist">
        {tabs.map((t) => {
          const unread = messages.filter((m) => m.channel === t.id).length - (seen[t.id] ?? 0);
          return (
            <button key={t.id} role="tab" aria-selected={t.id === current}
              className={`chat-tab ${t.cls ?? ''} ${t.id === current ? 'active' : ''}`} onClick={() => setChannel(t.id)}>
              {t.label}{t.id !== current && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          );
        })}
        {canDM && dmTargets.length > 0 && (
          <select className="dm-select" value="" aria-label="Start a direct message"
            onChange={(e) => e.target.value && setChannel(dmChannel(view.me, e.target.value))}>
            <option value="">+ DM</option>
            {dmTargets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      <div className="chat-list" ref={listRef}>
        {shown.length === 0 && <p className="muted empty">No messages yet.</p>}
        {shown.map((m) => (
          <div key={m.id} className={`msg ${m.from === view.me ? 'mine' : ''} ${m.from === 'system' ? 'system' : ''}`}>
            {m.from !== 'system' && <span className="who" style={ids[m.from] && { color: ids[m.from].color }}>{m.name}</span>}
            <span className="text">{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={500}
          aria-label="Chat message" />
        <button className="btn primary" type="submit">Send</button>
      </form>
    </section>
  );
}
