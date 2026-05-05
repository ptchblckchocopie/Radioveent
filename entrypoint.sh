#!/bin/bash
# Egress: yt-dlp must reach YouTube from a residential IP (DO datacenter IPs
# trip the bot-wall on the YouTube player API). On this branch the container
# joins a Tailscale tailnet using TS_AUTHKEY and dials microsocks running on
# the home machine via EGRESS_PROXY_URL (set on DO, e.g.
# socks5h://user:pass@100.x.x.x:1080). See scripts/home-egress.sh.
#
# Cookieless extraction also needs a Proof-of-Origin token. bgutil v1.3+
# dropped the Node "script" provider, so we run its HTTP server locally and
# point yt-dlp at it via --extractor-args (server.js).
set -eu

# ── Tailscale (userspace networking — no TUN/CAP_NET_ADMIN required) ─────────
TS_STATE_DIR="${TS_STATE_DIR:-/var/lib/tailscale}"
TS_SOCK="$TS_STATE_DIR/tailscaled.sock"
mkdir -p "$TS_STATE_DIR"

if [[ -n "${TS_AUTHKEY:-}" ]]; then
  echo "tailscale: starting tailscaled (userspace networking)"
  /usr/local/bin/tailscaled \
    --tun=userspace-networking \
    --state="$TS_STATE_DIR/tailscaled.state" \
    --socket="$TS_SOCK" \
    >/tmp/tailscaled.log 2>&1 &
  for _ in $(seq 1 20); do
    [[ -S "$TS_SOCK" ]] && break
    sleep 0.5
  done
  echo "tailscale: authenticating"
  /usr/local/bin/tailscale --socket="$TS_SOCK" up \
    --authkey="$TS_AUTHKEY" \
    --hostname="${TS_HOSTNAME:-musicqueue-do}" \
    --accept-dns=false
  /usr/local/bin/tailscale --socket="$TS_SOCK" status | head -5 || true
else
  echo "tailscale: TS_AUTHKEY not set — yt-dlp egress will fail" >&2
fi

# ── bgutil PO-token HTTP server ──────────────────────────────────────────────
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
