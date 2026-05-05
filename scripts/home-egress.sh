#!/usr/bin/env bash
# Run on a HOME machine (not on DO). Brings up a local SOCKS5 proxy bound to
# this machine's Tailscale tailnet IP. The DO container joins the same tailnet
# (using TS_AUTHKEY in entrypoint.sh) and dials microsocks here. Free, no
# domain, no card.
#
# Prereqs (one-time):
#   - microsocks   ( sudo apt install microsocks )
#   - tailscale    ( curl -fsSL https://tailscale.com/install.sh | sh )
#                  then `sudo tailscale up` and complete browser auth
#   - generate a Tailscale auth key (Reusable + Ephemeral):
#     https://login.tailscale.com/admin/settings/keys
#
# Usage:
#   ./scripts/home-egress.sh
#
# What it prints:
#   EGRESS_PROXY_URL=socks5h://USER:PASS@TAILNET_IP:PORT
#
# Paste that into DO App Platform > Settings > Environment Variables (mark
# Encrypted), alongside TS_AUTHKEY=tskey-auth-..., then redeploy. Keep this
# terminal open — closing it tears down microsocks and DO loses egress.
set -euo pipefail

PORT="${HOME_PROXY_PORT:-1080}"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    echo "$2" >&2
    exit 1
  fi
}

require microsocks "Install with: sudo apt install microsocks"
require tailscale  "Install with: curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up"
require openssl    "Install openssl (apt/brew)."

TAILNET_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
if [[ -z "$TAILNET_IP" ]]; then
  echo "tailscale: no tailnet IP detected — run 'sudo tailscale up' to authenticate first." >&2
  exit 1
fi

# Random per-session creds. The tailnet is already private, but binding with
# auth means a stale auth key on a forgotten DO container can't proxy through.
PROXY_USER="rv-$(openssl rand -hex 4)"
PROXY_PASS="$(openssl rand -hex 16)"

cleanup() {
  set +e
  [[ -n "${MS_PID:-}" ]] && kill "$MS_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "→ tailnet IP for this machine: ${TAILNET_IP}"
echo "→ starting microsocks on ${TAILNET_IP}:${PORT}"
microsocks -i "$TAILNET_IP" -p "$PORT" -u "$PROXY_USER" -P "$PROXY_PASS" >/tmp/microsocks.log 2>&1 &
MS_PID=$!
sleep 0.5
if ! kill -0 "$MS_PID" 2>/dev/null; then
  echo "microsocks failed to start. Log:" >&2
  cat /tmp/microsocks.log >&2
  exit 1
fi

EGRESS_URL="socks5h://${PROXY_USER}:${PROXY_PASS}@${TAILNET_IP}:${PORT}"

cat <<INFO

══════════════════════════════════════════════════════════════════
  microsocks is up on the tailnet. Set BOTH on Digital Ocean
  (mark each "Encrypted") and redeploy:

  EGRESS_PROXY_URL=${EGRESS_URL}
  TS_AUTHKEY=tskey-auth-...    ← from Tailscale admin (Reusable + Ephemeral)

  Keep this terminal open. Closing it tears down microsocks and the
  DO app loses egress.
══════════════════════════════════════════════════════════════════

INFO

wait "$MS_PID"
