#!/bin/bash
# Brings up Cloudflare WARP via wireproxy (userspace WireGuard exposing a SOCKS5
# proxy on 127.0.0.1:25344) before launching the Node app. yt-dlp routes through
# the SOCKS proxy so YouTube sees a Cloudflare egress IP instead of the DO IP,
# which YouTube hard-blocks at the player-API level.
#
# WARP_DISABLE=1 skips the tunnel entirely (useful for local dev).
set -eu

if [[ "${WARP_DISABLE:-0}" == "1" ]]; then
  echo "warp: WARP_DISABLE=1 set, skipping tunnel"
  exec npm start
fi

WARP_DIR="${WARP_DIR:-/opt/warp}"
SOCKS_PORT="${WARP_SOCKS_PORT:-25344}"
mkdir -p "$WARP_DIR"
cd "$WARP_DIR"

if [[ ! -f account.toml ]]; then
  echo "warp: registering free WARP account"
  /usr/local/bin/wgcf register --accept-tos
fi

if [[ ! -f wgcf-profile.conf ]]; then
  echo "warp: generating wireguard profile"
  /usr/local/bin/wgcf generate
fi

if [[ ! -f wireproxy.conf ]]; then
  echo "warp: building wireproxy config"
  cp wgcf-profile.conf wireproxy.conf
  cat <<EOF >> wireproxy.conf

[Socks5]
BindAddress = 127.0.0.1:${SOCKS_PORT}
EOF
fi

echo "warp: starting wireproxy"
/usr/local/bin/wireproxy -c wireproxy.conf >/tmp/wireproxy.log 2>&1 &
WP_PID=$!

# Wait up to 20s for the SOCKS proxy to actually carry traffic.
TUNNEL_OK=0
for i in $(seq 1 20); do
  if curl -s --max-time 2 -x "socks5h://127.0.0.1:${SOCKS_PORT}" \
       https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q '^warp=on'; then
    TUNNEL_OK=1
    break
  fi
  sleep 1
done

echo "warp: wireproxy log tail (first ${i}s):"
tail -n 30 /tmp/wireproxy.log || true

if [[ $TUNNEL_OK -eq 1 ]]; then
  # socks5h:// makes yt-dlp resolve DNS through the proxy too — important so YouTube
  # only ever sees the WARP egress, never a DO-resolved name.
  echo "warp: tunnel up — SOCKS proxy listening on 127.0.0.1:${SOCKS_PORT}"
  export WARP_PROXY_URL="socks5h://127.0.0.1:${SOCKS_PORT}"
  # Confirm the egress IP we're actually presenting to YouTube — easier to spot
  # WARP-vs-DO routing problems than reading wireproxy logs.
  EGRESS_IP=$(curl -s --max-time 3 -x "$WARP_PROXY_URL" https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | awk -F= '/^ip=/{print $2}')
  echo "warp: egress IP via proxy = ${EGRESS_IP:-<unknown>}"
else
  echo "warp: tunnel FAILED to come up — yt-dlp will run without proxy (extraction will likely hit YouTube bot-wall)"
  if ! kill -0 "$WP_PID" 2>/dev/null; then
    echo "warp: wireproxy process exited"
  fi
fi

cd /app
exec npm start
