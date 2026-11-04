import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MAP_FILE = new URL('./shared/map.ts', import.meta.url)
const START = '// @map-editor:start'
const END = '// @map-editor:end'

// Dev-only endpoint behind the map editor's "Save to repo": swaps the marked block in shared/map.ts
// for the posted one and re-syncs the edge function copy. Only answers requests from this machine,
// since `vite --host` exposes the dev server to the LAN.
function mapEditorSave(): Plugin {
  return {
    name: 'map-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__map-editor/save', (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
        if (req.method !== 'POST' || !local) {
          res.statusCode = 403
          return res.end('Map editor saves only from localhost.')
        }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            if (!body.startsWith(START) || !body.trimEnd().endsWith(END)) throw new Error('Body is not a map-editor block.')
            const src = readFileSync(MAP_FILE, 'utf8')
            const a = src.indexOf(START)
            const b = src.indexOf(END)
            if (a < 0 || b < a) throw new Error('Markers not found in shared/map.ts.')
            writeFileSync(MAP_FILE, src.slice(0, a) + body.trimEnd() + src.slice(b + END.length))
            execFileSync(process.execPath, [fileURLToPath(new URL('./scripts/sync-function.mjs', import.meta.url))])
            res.end('ok')
          } catch (err) {
            res.statusCode = 400
            res.end(String(err instanceof Error ? err.message : err))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mapEditorSave()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true, rewriteWsOrigin: true },
    },
  },
})
