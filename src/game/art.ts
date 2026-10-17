import type { Phase } from '../../shared/types';

// Artwork slots. Every slot left null falls back to the built-in vector art, so the game is
// complete without them. To swap art in, drop the file into public/assets and put its path here.
export const ART: {
  // Square transparent PNG/SVG (~128px) drawn in place of the token shape. The player's seat
  // colour is still drawn as a ring behind it, so one image per role is enough.
  token: Record<'police' | 'traitor' | 'heister', string | null>;
  // Optional per-seat portraits (index = seat 0–7), drawn inside the token instead of initials.
  // Use circular art with transparent corners.
  portraits: (string | null)[];
  // Wide background (~1600×300) behind the full-width phase banner.
  banner: Partial<Record<Phase, string | null>>;
} = {
  token: { police: null, traitor: null, heister: null },
  portraits: [],
  banner: {},
};
