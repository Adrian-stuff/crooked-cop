// Public connection settings. The publishable key is safe to ship: every table is
// service-role only and all access goes through the `game` edge function.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://hxoubdwmvrecptxzrzzp.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_gC2G4XKMyYm2OvOZiazl1A_6S0U-3_5';

// Production builds (Vercel etc.) play online. `npm run dev` uses the local WebSocket
// server unless Supabase settings are given (`npm run dev:online`) or VITE_BACKEND is set.
export const USE_SUPABASE = import.meta.env.VITE_BACKEND
  ? import.meta.env.VITE_BACKEND === 'supabase'
  : !import.meta.env.DEV || !!import.meta.env.VITE_SUPABASE_URL;
