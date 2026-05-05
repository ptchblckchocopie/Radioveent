#!/bin/bash
# Egress: yt-dlp must reach YouTube from a residential IP (DO datacenter IPs
# trip the bot-wall on the YouTube player API). The container joins a Tailscale
# tailnet using TS_AUTHKEY and routes all traffic through a home PC configured
# as a Tailscale exit node (residential IP). tailscaled runs in userspace
# networking mode (no TUN/CAP_NET_ADMIN) and exposes a local HTTP proxy on
# :1055 that yt-dlp uses via --proxy.
#
# Cookieless extraction also needs a Proof-of-Origin token. bgutil v1.3+
# dropped the Node "script" provider, so we run its HTTP server locally and
# point yt-dlp at it via --extractor-args (server.js).
set -eu

# ── Tailscale (userspace networking — no TUN/CAP_NET_ADMIN required) ─────────
TS_STATE_DIR="${TS_STATE_DIR:-/var/lib/tailscale}"
TS_SOCK="$TS_STATE_DIR/tailscaled.sock"
TS_PROXY_PORT="${TS_PROXY_PORT:-1055}"
mkdir -p "$TS_STATE_DIR"

if [[ -n "${TS_AUTHKEY:-}" ]]; then
  echo "tailscale: starting tailscaled (userspace networking, HTTP proxy on :${TS_PROXY_PORT})"
  /usr/local/bin/tailscaled \
    --tun=userspace-networking \
    --outbound-http-proxy-listen=":${TS_PROXY_PORT}" \
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

  # If an exit node is configured, route all traffic through it.
  # The exit node should be the home PC (residential IP).
  EXIT_NODE="${TS_EXIT_NODE:-}"
  if [[ -n "$EXIT_NODE" ]]; then
    echo "tailscale: setting exit node to ${EXIT_NODE}"
    /usr/local/bin/tailscale --socket="$TS_SOCK" set --exit-node="$EXIT_NODE" \
      --exit-node-allow-lan-access=false || true
    echo "tailscale: exit node active — all traffic routes through ${EXIT_NODE}"
  else
    echo "tailscale: WARNING — no TS_EXIT_NODE set, traffic will use DO's IP" >&2
  fi
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
    if (echo >/dev/tcp/127.0.0.1/"$POT_PORT") 2>/dev/null; then
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
