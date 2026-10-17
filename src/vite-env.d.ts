/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_BACKEND?: 'supabase' | 'ws';
}
