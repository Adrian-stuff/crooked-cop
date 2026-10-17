import type { PublicPlayer } from '../../shared/types';

// Each seated player gets one colour that follows them everywhere: board token, player list,
// chat name and Heister trail. Seats are the join order, which never changes mid-game.
export interface Identity {
  seat: number;
  name: string;
  color: string;
  ink: string; // text colour that reads on `color`
}

const SEATS: Omit<Identity, 'seat'>[] = [
  { name: 'Blue', color: '#3d7bff', ink: '#ffffff' },
  { name: 'Gold', color: '#ffc21a', ink: '#1a1406' },
  { name: 'Teal', color: '#19d3c5', ink: '#04201e' },
  { name: 'Rose', color: '#ff5fa2', ink: '#2a0615' },
  { name: 'Violet', color: '#7b5cff', ink: '#ffffff' },
  { name: 'Orange', color: '#ff7a1a', ink: '#220d00' },
  { name: 'Ivory', color: '#f2f4f8', ink: '#1a1d24' },
  { name: 'Bronze', color: '#a0662f', ink: '#ffffff' },
];

export const SPECTATOR_IDENTITY: Identity = { seat: -1, name: 'Grey', color: '#5b6474', ink: '#ffffff' };

export function seatIdentities(players: PublicPlayer[]): Record<string, Identity> {
  const out: Record<string, Identity> = {};
  let seat = 0;
  for (const p of players) {
    if (p.role === 'spectator') continue;
    out[p.id] = { ...SEATS[seat % SEATS.length], seat };
    seat++;
  }
  return out;
}

// Two letters so "Ana" and "Alex" still differ: "An" / "Al", or initials for multi-word names.
export function tokenText(p: Pick<PublicPlayer, 'name' | 'role' | 'label'>): string {
  if (p.role === 'heister' && p.label) return p.label;
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? '?';
  return w[0].toUpperCase() + (w[1] ?? '').toLowerCase();
}
