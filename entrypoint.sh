#!/bin/bash
# YouTube extraction needs a residential egress IP (DO datacenter IPs hit
# LOGIN_REQUIRED at the YouTube player API). On this branch, egress is provided
# by an external SOCKS5 proxy reached via the EGRESS_PROXY_URL env var — set it
# on DO to point at a home-machine SOCKS5 proxy exposed through ngrok TCP.
# See scripts/home-egress.sh for the home-side setup.
#
# Cookieless extraction also needs a Proof-of-Origin token. bgutil v1.3+
# dropped the Node "script" provider, so we run its HTTP server locally and
# point yt-dlp at it via --extractor-args (server.js).
set -eu

POT_SERVER_DIR="/opt/bgutil-pot/server"
POT_PORT="${POT_PORT:-4416}"

if [[ -f "$POT_SERVER_DIR/build/main.js" ]]; then
  echo "pot: starting bgutil PO-token HTTP server on :${POT_PORT}..."
  ( cd "$POT_SERVER_DIR" && node build/main.js --port "$POT_PORT" ) &
  POT_PID=$!
  for _ in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:${POT_PORT}/" >/dev/null 2>&1; then
      echo "pot: HTTP server ready on :${POT_PORT} (pid=$POT_PID)"
      break
    fi
    sleep 1
  done
else
  echo "pot: bgutil server not found at $POT_SERVER_DIR/build/main.js — extraction will fail" >&2
fi

cd /app
exec npm start
