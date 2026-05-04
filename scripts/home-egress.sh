#!/usr/bin/env bash
# Run on a HOME machine (not on DO). Brings up a local SOCKS5 proxy with
# random credentials and exposes it to the public internet via an ngrok TCP
# tunnel. The DO app then routes yt-dlp's traffic through this proxy, so
# YouTube sees your home (residential) IP instead of DO's datacenter IP and
# stops bot-walling extraction.
#
# Usage:
#   ./scripts/home-egress.sh
#
# Requirements (install once):
#   - microsocks   ( brew install microsocks  /  sudo apt install microsocks )
#   - ngrok        ( https://ngrok.com/download — TCP tunnels need an account;
#                    free tier "pay-as-you-go" works fine for one tunnel )
#
# What it prints:
#   EGRESS_PROXY_URL=socks5h://USER:PASS@HOST:PORT
#
# Paste that exact line into the DO App Platform "Environment Variables" panel
# (mark it as "Encrypted"), then redeploy. The DO app will route YouTube
# extraction through your home connection. Keep this terminal open — closing
# it tears down the tunnel and the DO app loses egress.
set -euo pipefail

PORT="${HOME_PROXY_PORT:-1080}"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    echo "$2" >&2
    exit 1
  fi
}

require microsocks "Install with:  brew install microsocks   (macOS)
                                  sudo apt install microsocks   (Debian/Ubuntu)"
require ngrok "Install from https://ngrok.com/download and run 'ngrok config add-authtoken <token>'."
require curl "Install curl (apt/brew)."
require openssl "Install openssl (apt/brew)."

# Random per-session creds so an exposed ngrok URL isn't open to the world.
PROXY_USER="rv-$(openssl rand -hex 4)"
PROXY_PASS="$(openssl rand -hex 16)"

cleanup() {
  set +e
  [[ -n "${MS_PID:-}" ]] && kill "$MS_PID" 2>/dev/null
  [[ -n "${NG_PID:-}" ]] && kill "$NG_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "→ starting microsocks on 127.0.0.1:${PORT}"
microsocks -i 127.0.0.1 -p "$PORT" -u "$PROXY_USER" -P "$PROXY_PASS" >/tmp/microsocks.log 2>&1 &
MS_PID=$!
sleep 0.5
if ! kill -0 "$MS_PID" 2>/dev/null; then
  echo "microsocks failed to start. Log:" >&2
  cat /tmp/microsocks.log >&2
  exit 1
fi

echo "→ starting ngrok TCP tunnel (this may take a few seconds)"
# --log=stdout streams JSON events; we read them via the local API instead,
# which is more reliable and gives the public URL even after restart.
ngrok tcp "$PORT" --log=/tmp/ngrok.log >/dev/null 2>&1 &
NG_PID=$!

# ngrok exposes a local HTTP API at 127.0.0.1:4040 once it's up.
PUBLIC_URL=""
for i in $(seq 1 30); do
  PUBLIC_URL=$(curl -s --max-time 2 http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -oE '"public_url":"tcp://[^"]+' \
    | head -1 \
    | cut -d'"' -f4 || true)
  if [[ -n "$PUBLIC_URL" ]]; then break; fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "ngrok did not publish a tunnel within 30s. Recent log:" >&2
  tail -n 30 /tmp/ngrok.log >&2 || true
  echo "Common causes: missing authtoken (run 'ngrok config add-authtoken <token>')," >&2
  echo "or your account doesn't include TCP tunnels (free pay-as-you-go does)." >&2
  exit 1
fi

# tcp://0.tcp.ngrok.io:12345 -> 0.tcp.ngrok.io:12345
HOST_PORT=${PUBLIC_URL#tcp://}
EGRESS_URL="socks5h://${PROXY_USER}:${PROXY_PASS}@${HOST_PORT}"

cat <<INFO

══════════════════════════════════════════════════════════════════
  SOCKS5 proxy is up. Set this on Digital Ocean and redeploy:

  EGRESS_PROXY_URL=${EGRESS_URL}

  Mark it as "Encrypted" in the DO env-vars UI so the credentials
  don't end up in build logs.

  Keep this terminal open. Closing it tears down the tunnel.
══════════════════════════════════════════════════════════════════

INFO

# Stay foreground until either child dies, then bail so trap fires.
wait -n "$MS_PID" "$NG_PID"
