# syntax=docker/dockerfile:1
# Multi-stage build for Veent Radio on Digital Ocean App Platform (or any Docker host).
# The runtime image needs yt-dlp + ffmpeg, which aren't in the standard Node buildpack —
# without them the audio extraction in server.js fails with ENOENT on every track.

# ── deps: install everything (incl. dev deps) for the build step ──────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── builder: produce .next/ ───────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── pot-builder: build the bgutil PO-token generator (TypeScript → JS) ────────────
# YouTube enforces a Proof-of-Origin (PO) token on cookieless requests from datacenter
# IPs, which is the only way we can extract audio (cookies trigger SABR-only streaming
# that yt-dlp can't read). bgutil-ytdlp-pot-provider has two pieces: a Python plugin
# that yt-dlp loads, and a Node.js generator script the plugin shells out to.
FROM node:22-slim AS pot-builder
WORKDIR /pot
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git python3 build-essential pkg-config libpixman-1-dev libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git . \
 && cd server \
 && npm ci --no-audit --no-fund \
 && npx tsc \
 && npm prune --omit=dev

# ── runner: slim image with only prod deps + yt-dlp + ffmpeg + python + pot plugin ─
FROM node:22-slim AS runner
ARG WGCF_VERSION=2.2.30
ARG WIREPROXY_VERSION=1.1.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip unzip libpixman-1-0 libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && pip3 install --break-system-packages --no-cache-dir --target /tmp/bgutil-py bgutil-ytdlp-pot-provider \
 && mkdir -p /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider \
 && cp -r /tmp/bgutil-py/yt_dlp_plugins /etc/yt-dlp/plugins/bgutil-ytdlp-pot-provider/ \
 && rm -rf /tmp/bgutil-py \
 && curl -fsSL "https://github.com/ViRb3/wgcf/releases/download/v${WGCF_VERSION}/wgcf_${WGCF_VERSION}_linux_amd64" \
      -o /usr/local/bin/wgcf \
 && chmod +x /usr/local/bin/wgcf \
 && curl -fsSL "https://github.com/whyvl/wireproxy/releases/download/v${WIREPROXY_VERSION}/wireproxy_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin wireproxy \
 && chmod +x /usr/local/bin/wireproxy \
 && wgcf help >/dev/null && wireproxy --version

# Generator (built JS + its prod deps). Path is referenced explicitly from server.js
# via --extractor-args, so it doesn't depend on whatever $HOME resolves to at runtime.
COPY --from=pot-builder /pot/server/build /opt/bgutil-pot/server/build
COPY --from=pot-builder /pot/server/src /opt/bgutil-pot/server/src
COPY --from=pot-builder /pot/server/node_modules /opt/bgutil-pot/server/node_modules
COPY --from=pot-builder /pot/server/package.json /opt/bgutil-pot/server/package.json

# yt-dlp's PO-token plugin shells out to `node`. The base image has it at
# /usr/local/bin/node, but DO's runtime occasionally launches the container with a
# narrower PATH. Symlinking into /usr/bin guarantees it's findable; the explicit ENV
# PATH below makes that doubly true. The version check fails the build loudly if the
# base image ever stops shipping node.
RUN ln -sf /usr/local/bin/node /usr/bin/node \
 && node --version
ENV PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin"

WORKDIR /app
ENV NODE_ENV=production

# Install only production node_modules (smaller image)
COPY package*.json ./
RUN npm ci --omit=dev

# Bring built assets + the custom server
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.js ./next.config.js
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# DO App Platform sets PORT (typically 8080); server.js honours process.env.PORT.
EXPOSE 8080
CMD ["/usr/local/bin/entrypoint.sh"]
