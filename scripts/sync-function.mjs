// Copies the shared rules engine into the Supabase edge function folder,
// which must be self-contained when deployed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const files = ['engine.ts', 'map.ts', 'types.ts', 'chat.ts'];
const out = new URL('../supabase/functions/game/engine/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of files) {
  const src = readFileSync(new URL(`../shared/${f}`, import.meta.url), 'utf8');
  writeFileSync(new URL(f, out), `// GENERATED from shared/${f} by scripts/sync-function.mjs. Edit the original.\n${src}`);
}
console.log(`Copied ${files.length} files to supabase/functions/game/engine/`);
