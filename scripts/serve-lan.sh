#!/usr/bin/env bash
# Builds the production bundle against the hosted Supabase backend and serves it on the local
# network, so other laptops on the same Wi-Fi can open it and play.
#   npm run serve:lan            # build + serve on port 4173
#   PORT=8080 npm run serve:lan  # pick another port
#   SKIP_BUILD=1 npm run serve:lan
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-4173}"

[[ -d node_modules/vite ]] || { echo "▶ Installing dependencies…"; npm install; }

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "▶ Building production bundle (Supabase backend)…"
  VITE_BACKEND=supabase npm run build
fi

IF="$(route -n get default 2>/dev/null | awk "/interface:/{print \$2}")"
IP="$(ipconfig getifaddr "${IF:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo
echo "▶ Serving Crooked Cop"
echo "   This laptop:   http://localhost:${PORT}"
if [[ -n "$IP" ]]; then echo "   Other laptops: http://${IP}:${PORT}"; else echo "   Other laptops: use the Network address Vite prints below"; fi
echo "   (Same Wi-Fi needed. If macOS asks to allow incoming connections for node, click Allow.)"
echo

exec npx vite preview --host 0.0.0.0 --port "$PORT" --strictPort
