#!/bin/bash
# Brings up Cloudflare WARP via wireproxy (userspace WireGuard exposing a SOCKS5
# proxy on 127.0.0.1:25344). yt-dlp routes through the SOCKS proxy so YouTube
# sees a Cloudflare egress IP instead of the DO IP, which YouTube hard-blocks
# at the player-API level.
#
# WARP bring-up runs in the BACKGROUND so Node can start immediately and pass
# DO's health check. The proxy URL is written to $WARP_URL_FILE once the tunnel
# is verified; server.js reads that file lazily at extraction time, so yt-dlp
# picks the proxy up as soon as it's ready (no Node restart needed).
#
# WARP_DISABLE=1 skips the tunnel entirely (useful for local dev).
set -eu

WARP_URL_FILE="${WARP_URL_FILE:-/tmp/warp-proxy.url}"
rm -f "$WARP_URL_FILE"
export WARP_URL_FILE

if [[ "${WARP_DISABLE:-0}" == "1" ]]; then
  echo "warp: WARP_DISABLE=1 set, skipping tunnel"
  cd /app
  exec npm start
fi

warp_bringup() {
  WARP_DIR="${WARP_DIR:-/opt/warp}"
  SOCKS_PORT="${WARP_SOCKS_PORT:-25344}"
  PROBE_SECS="${WARP_PROBE_SECS:-45}"
  mkdir -p "$WARP_DIR"
  cd "$WARP_DIR"

  # Cloudflare's WARP register API rate-limits / transiently fails on DO IPs.
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

  # rc=0: tunnel up. rc=1: timeout. rc=2: EPERM detected (sandbox forbids bind),
  # caller should abort retries — both windtf and whyvl forks fail this way on
  # DO App Platform, so retrying the same fork is pointless.
  probe_warp() {
    for i in $(seq 1 "$PROBE_SECS"); do
      if curl -s --max-time 2 -x "socks5h://127.0.0.1:${SOCKS_PORT}" \
           https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q '^warp=on'; then
        echo "$i"
        return 0
      fi
      if grep -q "Unable to update bind: permission denied" /tmp/wireproxy.log 2>/dev/null; then
        return 2
      fi
      sleep 1
    done
    return 1
  }

  if ! register_warp; then
    echo "warp: registration failed after 5 attempts — yt-dlp will run without proxy"
    return 0
  fi

  if [[ ! -f wgcf-profile.conf ]]; then
    echo "warp: generating wireguard profile"
    /usr/local/bin/wgcf generate
  fi
  if [[ ! -f wireproxy.conf ]]; then
    echo "warp: building wireproxy config"
    cp wgcf-profile.conf wireproxy.conf
    printf '\n[Socks5]\nBindAddress = 127.0.0.1:%s\n' "$SOCKS_PORT" >> wireproxy.conf
  fi

  local WP_PID=""
  for try in 1 2; do
    echo "warp: starting wireproxy (try $try/2)"
    WP_PID=$(start_wireproxy)
    set +e; probe_warp; local rc=$?; set -e

    if [[ $rc -eq 0 ]]; then
      echo "warp: tunnel up — SOCKS proxy on 127.0.0.1:${SOCKS_PORT}"
      printf 'socks5h://127.0.0.1:%s' "$SOCKS_PORT" > "$WARP_URL_FILE"
      local EGRESS_IP
      EGRESS_IP=$(curl -s --max-time 3 -x "socks5h://127.0.0.1:${SOCKS_PORT}" https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null | awk -F= '/^ip=/{print $2}' || true)
      echo "warp: egress IP via proxy = ${EGRESS_IP:-<unknown>}"

      # Watchdog: respawn wireproxy if it dies later (handshake renegotiation
      # failure, etc.) so $WARP_URL_FILE keeps pointing at a live proxy.
      while true; do
        sleep 30
        if ! kill -0 "$WP_PID" 2>/dev/null; then
          echo "warp: wireproxy died, restarting"
          WP_PID=$(start_wireproxy)
        fi
      done
    fi

    if [[ $rc -eq 2 ]]; then
      echo "warp: wireproxy hit EPERM (sandbox forbids bind) — aborting retries"
      tail -n 30 /tmp/wireproxy.log || true
      kill "$WP_PID" 2>/dev/null || true
      return 0
    fi

    echo "warp: probe failed on try $try; wireproxy log tail:"
    tail -n 30 /tmp/wireproxy.log || true
    kill "$WP_PID" 2>/dev/null || true
    sleep 2
  done

  echo "warp: tunnel did NOT come up after 2 tries — yt-dlp will run without proxy"
}

warp_bringup &

cd /app
exec npm start
