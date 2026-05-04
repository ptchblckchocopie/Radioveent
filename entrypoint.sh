#!/bin/bash
# YouTube extraction needs a residential egress IP (DO datacenter IPs hit
# LOGIN_REQUIRED at the YouTube player API). On this branch, egress is provided
# by an external SOCKS5 proxy reached via the EGRESS_PROXY_URL env var — set it
# on DO to point at a home-machine SOCKS5 proxy exposed through ngrok TCP.
# See scripts/home-egress.sh for the home-side setup.
set -eu

cd /app
exec npm start
