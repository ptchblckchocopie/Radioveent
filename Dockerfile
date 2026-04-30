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

# ── runner: slim image with only prod deps + yt-dlp + ffmpeg + python ─────────────
FROM node:22-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

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
