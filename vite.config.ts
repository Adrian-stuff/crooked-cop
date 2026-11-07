import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapCode, parseMapFile } from './src/editor/mapCode'

const MAP_FILE = new URL('./shared/map.ts', import.meta.url)
const START = '// @map-editor:start'
const END = '// @map-editor:end'

const MAX_BODY = 1024 * 1024
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

// Dev-only endpoint behind the map editor's "Save to repo": swaps the marked block in shared/map.ts
// for the posted one and re-syncs the edge function copy. Only answers requests from this machine,
// since `vite --host` exposes the dev server to the LAN. Also refuses cross-site requests (custom
// header forces a CORS preflight this endpoint never answers; Origin must match Host; Host must be
// localhost to block DNS rebinding), caps the body, and regenerates the code from parsed data
// instead of writing the posted text verbatim.
function mapEditorSave(): Plugin {
  return {
    name: 'map-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__map-editor/save', (req, res) => {
        const deny = (status: number, msg: string) => {
          res.statusCode = status
          res.end(msg)
        }
        const host = req.headers.host ?? ''
        const origin = req.headers.origin
        let originOk = true
        if (origin !== undefined) {
          try {
            originOk = new URL(origin).host === host
          } catch {
            originOk = false
          }
        }
        if (req.method !== 'POST' || !LOOPBACK.has(req.socket.remoteAddress ?? '') || !LOCAL_HOST.test(host) || !originOk || req.headers['x-map-editor'] !== '1') {
          return deny(403, 'Map editor saves only from the editor on localhost.')
        }
        const chunks: Buffer[] = []
        let size = 0
        let aborted = false
        req.on('data', (c: Buffer) => {
          if (aborted) return
          size += c.length
          if (size > MAX_BODY) {
            aborted = true
            deny(413, 'Body too large.')
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => {
          if (aborted) return
          let original: string | null = null
          try {
            const body = Buffer.concat(chunks).toString('utf8')
            const code = mapCode(parseMapFile(body))
            const src = readFileSync(MAP_FILE, 'utf8')
            const a = src.indexOf(START)
            const b = src.indexOf(END)
            if (a < 0 || b < a) throw new Error('Markers not found in shared/map.ts.')
            original = src
            writeFileSync(MAP_FILE, src.slice(0, a) + code + src.slice(b + END.length))
            execFileSync(process.execPath, [fileURLToPath(new URL('./scripts/sync-function.mjs', import.meta.url))])
            res.end('ok')
          } catch (err) {
            if (original !== null) writeFileSync(MAP_FILE, original) // don't leave map.ts half-applied
            deny(400, String(err instanceof Error ? err.message : err))
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
          const { op, code, playerId, clientPub, sid } = JSON.parse(raw || '{}')
          if (op !== 'devRooms' && op !== 'devImpersonate' && op !== 'devPass') return reply(400, { error: 'Unknown request.' })
          const r = await fetch(url, {
            method: 'POST',
            headers: { apikey, Authorization: `Bearer ${apikey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ op, code, playerId, clientPub, sid, key: env.DEV_IMPERSONATE_KEY }),
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
