#!/usr/bin/env bash
# warp-egress-setup.sh
#
# One-shot setup for an always-on Cloudflare WARP egress Droplet that the
# DO App Platform container can use as a residential-looking, low-latency
# proxy for yt-dlp. Replaces the home-PC Tailscale exit node so the project
# stays up regardless of whether your PC is on.
#
# Architecture:
#   Browser → App Platform (SGP1) → tailnet hop → THIS DROPLET → wireproxy
#                                                       → Cloudflare WARP
#                                                       → YouTube
#
# What this script installs on a fresh Ubuntu 24.04 Droplet:
#   - Tailscale (joins your tailnet so the App Platform container can reach
#     this Droplet privately, no public proxy port)
#   - wgcf  (Cloudflare WARP account registration / WireGuard config)
#   - wireproxy (userspace WireGuard + HTTP-CONNECT proxy listener)
#   - systemd unit so wireproxy auto-restarts on reboot/crash
#   - ufw firewall: deny inbound except SSH and tailnet
#
# Usage:
#   export TS_AUTHKEY='tskey-auth-...'   # from login.tailscale.com/admin/settings/keys
#   bash warp-egress-setup.sh
#
# After it finishes the script prints the EGRESS_PROXY_URL you paste into
# App Platform's env vars.

set -euo pipefail

# ── Inputs ───────────────────────────────────────────────────────────────────
TS_AUTHKEY="${TS_AUTHKEY:-}"
TS_HOSTNAME="${TS_HOSTNAME:-warp-egress}"
PROXY_PORT="${PROXY_PORT:-1080}"

if [[ -z "$TS_AUTHKEY" ]]; then
  echo "ERROR: TS_AUTHKEY env var not set." >&2
  echo "Generate one at https://login.tailscale.com/admin/settings/keys" >&2
  echo "Then re-run: TS_AUTHKEY='tskey-auth-...' bash $0" >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: must run as root (try: sudo bash $0)" >&2
  exit 1
fi

ARCH="$(dpkg --print-architecture)"   # amd64 / arm64
WGCF_VER="2.2.21"
WIREPROXY_VER="1.0.10"

# ── 1. Tailscale ─────────────────────────────────────────────────────────────
echo "==> Installing Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

# ── 2. wgcf ──────────────────────────────────────────────────────────────────
echo "==> Installing wgcf $WGCF_VER ($ARCH)"
if ! command -v wgcf >/dev/null 2>&1; then
  curl -fsSL "https://github.com/ViRb3/wgcf/releases/download/v${WGCF_VER}/wgcf_${WGCF_VER}_linux_${ARCH}" \
    -o /usr/local/bin/wgcf
  chmod +x /usr/local/bin/wgcf
fi

# ── 3. wireproxy ─────────────────────────────────────────────────────────────
echo "==> Installing wireproxy $WIREPROXY_VER ($ARCH)"
if ! command -v wireproxy >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/whyvl/wireproxy/releases/download/v${WIREPROXY_VER}/wireproxy_linux_${ARCH}.tar.gz" \
    -o "$TMP/wireproxy.tgz"
  tar -xzf "$TMP/wireproxy.tgz" -C "$TMP"
  install -m 0755 "$TMP/wireproxy" /usr/local/bin/wireproxy
  rm -rf "$TMP"
fi

# ── 4. Register with Cloudflare WARP ─────────────────────────────────────────
echo "==> Registering Cloudflare WARP account"
mkdir -p /etc/wireproxy
cd /etc/wireproxy
if [[ ! -f wgcf-account.toml ]]; then
  yes | wgcf register
fi
wgcf generate

# ── 5. Build wireproxy config ────────────────────────────────────────────────
PROXY_USER="warp"
PROXY_PASS="$(openssl rand -hex 16)"

# Combine WireGuard interface + HTTP CONNECT listener.
# The MTU=1280 and 0.0.0.0/0 AllowedIPs from wgcf-profile.conf are kept.
cat /etc/wireproxy/wgcf-profile.conf > /etc/wireproxy/wireproxy.conf
cat >> /etc/wireproxy/wireproxy.conf <<EOF

[http]
BindAddress = 0.0.0.0:${PROXY_PORT}
Username = ${PROXY_USER}
Password = ${PROXY_PASS}
EOF

# Stash credentials for the convenience print at the end (root-only readable)
umask 077
cat > /etc/wireproxy/proxy-credentials <<EOF
PROXY_USER=${PROXY_USER}
PROXY_PASS=${PROXY_PASS}
PROXY_PORT=${PROXY_PORT}
EOF
umask 022

# ── 6. systemd unit ──────────────────────────────────────────────────────────
echo "==> Installing systemd unit"
cat > /etc/systemd/system/wireproxy.service <<'EOF'
[Unit]
Description=Cloudflare WARP via wireproxy (HTTP CONNECT proxy on tailnet)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/wireproxy -c /etc/wireproxy/wireproxy.conf
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable wireproxy
systemctl restart wireproxy

# ── 7. Firewall — deny everything except SSH + tailnet ───────────────────────
echo "==> Configuring ufw (allow SSH + tailnet only)"
if ! command -v ufw >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y ufw
fi
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
# Tailscale CGNAT range 100.64.0.0/10
ufw allow from 100.64.0.0/10
ufw --force enable

# ── 8. Bring up Tailscale ────────────────────────────────────────────────────
echo "==> Bringing up Tailscale (hostname=$TS_HOSTNAME)"
tailscale up \
  --authkey="$TS_AUTHKEY" \
  --hostname="$TS_HOSTNAME" \
  --accept-dns=false \
  --ssh
sleep 3

# ── 9. Smoke-test the proxy ──────────────────────────────────────────────────
echo "==> Smoke-testing wireproxy → WARP → cloudflare.com/cdn-cgi/trace"
sleep 2
TRACE="$(curl -fsS --max-time 10 \
  -x "http://${PROXY_USER}:${PROXY_PASS}@127.0.0.1:${PROXY_PORT}" \
  https://www.cloudflare.com/cdn-cgi/trace || true)"
if echo "$TRACE" | grep -q '^warp=on'; then
  echo "    OK — WARP active. egress IP: $(echo "$TRACE" | awk -F= '/^ip=/{print $2}')"
else
  echo "    WARNING — WARP did not confirm. Trace was:"
  echo "$TRACE" | sed 's/^/      /'
  echo "    Check: systemctl status wireproxy ; journalctl -u wireproxy -n 50"
fi

# ── 10. Print the EGRESS_PROXY_URL ───────────────────────────────────────────
TS_IP="$(tailscale ip -4 | head -1)"
echo ""
echo "================================================================"
echo " WARP egress Droplet ready"
echo ""
echo " Tailnet hostname:  $TS_HOSTNAME"
echo " Tailnet IP:        $TS_IP"
echo " Proxy port:        $PROXY_PORT"
echo ""
echo " Paste this into your DO App Platform env vars (component-level):"
echo ""
echo "   EGRESS_PROXY_URL=http://${PROXY_USER}:${PROXY_PASS}@${TS_IP}:${PROXY_PORT}"
echo ""
echo " You can leave TS_EXIT_NODE in place — server.js prefers EGRESS_PROXY_URL"
echo " when both are set, and falls back to the home-PC route if this Droplet"
echo " ever goes down."
echo "================================================================"
