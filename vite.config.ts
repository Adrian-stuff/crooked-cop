import { defineConfig, loadEnv, type Plugin } from 'vite'
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
        const local = LOOPBACK.has(req.socket.remoteAddress ?? '')
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

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

// Local dev only: relays the dev panel's online impersonation requests to the game function, adding
// DEV_IMPERSONATE_KEY from .env.development.local here so the key never reaches a browser. Only answers
// requests from this machine, so other devices on the network can't use it.
function devImpersonateRelay(env: Record<string, string>): Plugin {
  const url = `${env.VITE_SUPABASE_URL || 'https://hxoubdwmvrecptxzrzzp.supabase.co'}/functions/v1/game`
  const apikey = env.VITE_SUPABASE_KEY || 'sb_publishable_gC2G4XKMyYm2OvOZiazl1A_6S0U-3_5'
  return {
    name: 'dev-impersonate-relay',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/impersonate', async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return reply(405, { error: 'POST only' })
        if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return reply(403, { error: 'Only from this machine.' })
        if (!env.DEV_IMPERSONATE_KEY) return reply(403, { error: 'Set DEV_IMPERSONATE_KEY in .env.development.local.' })
        let raw = ''
        for await (const chunk of req) raw += chunk
        try {
          const { op, code, playerId } = JSON.parse(raw || '{}')
          if (op !== 'devRooms' && op !== 'devImpersonate') return reply(400, { error: 'Unknown request.' })
          const r = await fetch(url, {
            method: 'POST',
            headers: { apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ op, code, playerId, key: env.DEV_IMPERSONATE_KEY }),
          })
          reply(r.status, await r.json())
        } catch (e) {
          reply(500, { error: (e as Error).message })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), mapEditorSave(), ...(env.VITE_DEV_IMPERSONATE === '1' ? [devImpersonateRelay(env)] : [])],
    server: {
      proxy: {
        // xfwd passes the real client address on, so the dev server can tell this machine from LAN devices.
        '/ws': { target: 'ws://localhost:8787', ws: true, rewriteWsOrigin: true, xfwd: true },
      },
    },
  }
})
