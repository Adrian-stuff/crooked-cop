import type { ChatChannel, GameState, Player } from './types.ts';

export function dmChannel(a: string, b: string): ChatChannel {
  return `dm:${[a, b].sort().join(':')}`;
}

export function dmParticipants(channel: string): [string, string] | null {
  if (!channel.startsWith('dm:')) return null;
  const [, a, b] = channel.split(':');
  return a && b ? [a, b] : null;
}

const isOfficer = (p: Player) => p.role === 'police' || p.role === 'traitor';
const hostGod = (p: Player, g: GameState) => p.role === 'spectator' && p.isHost && p.wantsSpectate && g.phase !== 'lobby';

export function canRead(g: GameState, playerId: string, channel: string): boolean {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return false;
  if (channel === 'lobby') return true;
  if (g.phase === 'ended') return !channel.startsWith('dm:') || !!dmParticipants(channel)?.includes(playerId);
  if (channel === 'police') return g.phase !== 'lobby' && (isOfficer(p) || hostGod(p, g));
  if (channel === 'heisters') return g.phase !== 'lobby' && (p.role === 'heister' || hostGod(p, g));
  const dm = dmParticipants(channel);
  return !!dm && dm.includes(playerId);
}

export function canPost(g: GameState, playerId: string, channel: string): string | null {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return 'You are not in this room.';
  // Spectators watch in silence during play; the facilitator (host) may still post to everyone.
  if (p.role === 'spectator' && g.phase !== 'lobby' && g.phase !== 'ended' && !(hostGod(p, g) && channel === 'lobby')) {
    return 'Spectators can watch but not chat during the game.';
  }
  if (channel === 'lobby') return null;
  if (g.phase === 'lobby') return 'Team chats open when the game starts.';
  if (channel === 'police') {
    if (!isOfficer(p)) return 'Only officers can post in Police chat.';
    if (p.status === 'exposed') return 'Exposed officers are off the force.';
    return null;
  }
  if (channel === 'heisters') return p.role === 'heister' ? null : 'Only Heisters can post here.';
  const dm = dmParticipants(channel);
  if (dm) {
    if (!g.settings.allowDMs) return 'Direct messages are turned off in this room.';
    if (!dm.includes(playerId)) return 'Not your conversation.';
    const other = g.players.find((x) => x.id === (dm[0] === playerId ? dm[1] : dm[0]));
    if (!other) return 'That player left.';
    if (p.role === 'spectator' || other.role === 'spectator') return 'Spectators cannot send or receive DMs.';
    return null;
  }
  return 'Unknown channel.';
}
