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
 && npx tsc

# ── runner: slim image with only prod deps + yt-dlp + ffmpeg + python + pot plugin ─
FROM node:22-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 python3-pip unzip libpixman-1-0 libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && pip3 install --break-system-packages --no-cache-dir bgutil-ytdlp-pot-provider \
 && PLUGIN_SITE=$(python3 -c "import site,os; print(next(p for p in site.getsitepackages()+[site.getusersitepackages()] if os.path.isdir(os.path.join(p,'yt_dlp_plugins'))))") \
 && mkdir -p /root/.config/yt-dlp/plugins/bgutil-ytdlp-pot-provider \
 && cp -r "$PLUGIN_SITE/yt_dlp_plugins" /root/.config/yt-dlp/plugins/bgutil-ytdlp-pot-provider/

# Bring the generator (built JS + its prod deps) into the place the plugin looks for.
COPY --from=pot-builder /pot/server/build /root/bgutil-ytdlp-pot-provider/server/build
COPY --from=pot-builder /pot/server/package.json /pot/server/package-lock.json /root/bgutil-ytdlp-pot-provider/server/
RUN cd /root/bgutil-ytdlp-pot-provider/server \
 && npm ci --omit=dev --no-audit --no-fund

WORKDIR /app
ENV NODE_ENV=production

# Install only production node_modules (smaller image)
COPY package*.json ./
RUN npm ci --omit=dev

# Bring built assets + the custom server
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/next.config.js ./next.config.js

# DO App Platform sets PORT (typically 8080); server.js honours process.env.PORT.
EXPOSE 8080
CMD ["npm", "start"]
