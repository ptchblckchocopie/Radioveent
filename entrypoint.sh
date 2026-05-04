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
PROBE_SECS="${WARP_PROBE_SECS:-45}"
mkdir -p "$WARP_DIR"
cd "$WARP_DIR"

# Cloudflare's WARP register API rate-limits / transiently fails on DO IPs. Retry
# with backoff so a single API hiccup doesn't doom the whole boot.
register_warp() {
  if [[ -f account.toml ]]; then return 0; fi
  for attempt in 1 2 3 4 5; do
    echo "warp: registering free WARP account (attempt $attempt/5)"
    if /usr/local/bin/wgcf register --accept-tos; then return 0; fi
    sleep $((attempt * 3))
  done
  return 1
}

start_wireproxy() {
  /usr/local/bin/wireproxy -c wireproxy.conf >/tmp/wireproxy.log 2>&1 &
  echo $!
}

probe_warp() {
  for i in $(seq 1 "$PROBE_SECS"); do
    if curl -s --max-time 2 -x "socks5h://127.0.0.1:${SOCKS_PORT}" \
         https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q '^warp=on'; then
      echo "$i"
      return 0
    fi
    sleep 1
  done
  return 1
}

TUNNEL_OK=0
WP_PID=""
if register_warp; then
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

  # Two startup attempts: if the first wireproxy never gets a handshake within
  # PROBE_SECS, kill it and try again. WireGuard cold-start over UDP is sometimes
  # held up by DO's egress NAT taking 10–20s to allow the flow.
  for try in 1 2; do
    echo "warp: starting wireproxy (try $try/2)"
    WP_PID=$(start_wireproxy)
    if SECS=$(probe_warp); then
      echo "warp: tunnel up after ${SECS}s — SOCKS proxy on 127.0.0.1:${SOCKS_PORT}"
      TUNNEL_OK=1
      break
    fi
    echo "warp: probe failed on try $try; wireproxy log tail:"
    tail -n 30 /tmp/wireproxy.log || true
    if kill -0 "$WP_PID" 2>/dev/null; then kill "$WP_PID" 2>/dev/null || true; fi
    sleep 2
  done
else
  echo "warp: registration failed after 5 attempts — proceeding without proxy"
fi

if [[ $TUNNEL_OK -eq 1 ]]; then
  # socks5h:// makes yt-dlp resolve DNS via WARP, so YouTube only ever sees the
  # Cloudflare egress.
  export WARP_PROXY_URL="socks5h://127.0.0.1:${SOCKS_PORT}"
  EGRESS_IP=$(curl -s --max-time 3 -x "$WARP_PROXY_URL" https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | awk -F= '/^ip=/{print $2}')
  echo "warp: egress IP via proxy = ${EGRESS_IP:-<unknown>}"

  # Watchdog: if wireproxy dies later (handshake renegotiation failure, etc.),
  # respawn it on the same port so the URL exported to Node stays valid. Without
  # this, a crashed wireproxy would silently drop us back to direct DO egress
  # (= immediate YouTube bot-wall).
  (
    while true; do
      sleep 30
      if ! kill -0 "$WP_PID" 2>/dev/null; then
        echo "warp: wireproxy died, restarting"
        WP_PID=$(start_wireproxy)
      fi
    done
  ) &
else
  echo "warp: tunnel did NOT come up — yt-dlp will run without proxy (extraction will likely hit YouTube bot-wall)"
fi

cd /app
exec npm start
