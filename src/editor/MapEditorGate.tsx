import { lazy, Suspense, useEffect, useState } from 'react';

// Admin-only map editor. Not linked anywhere: open it with Ctrl+Alt+Shift+M (Ctrl+Option+Shift+M
// on a Mac). App.tsx only mounts this gate in dev builds (import.meta.env.DEV), so Vite drops the
// editor chunk from production bundles. It saves to shared/map.ts through the local dev server only.
const MapEditor = lazy(() => import('./MapEditor'));

const isSecretChord = (e: KeyboardEvent) => e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && e.code === 'KeyM';

export function MapEditorGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSecretChord(e)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <MapEditor onClose={() => setOpen(false)} />
    </Suspense>
  );
}
