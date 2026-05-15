# syntax=docker/dockerfile:1.7
# Multi-stage: build the web SPA, build the server, then run the server with the SPA copied in.

# ─────────── Stage 1: build the web ───────────
FROM node:20-alpine AS web-build
WORKDIR /app/web

COPY web/package.json web/package-lock.json* web/yarn.lock* web/pnpm-lock.yaml* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \
    else npm install; fi

COPY web/ ./
RUN npm run build

# ─────────── Stage 2: build the server ───────────
FROM node:20-alpine AS server-build
WORKDIR /app/server

# better-sqlite3 needs build tools; alpine doesn't ship them by default.
RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json* server/yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm install; fi

COPY server/ ./
RUN npm run build

# ─────────── Stage 3: runtime ───────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Runtime deps for better-sqlite3 native binding
RUN apk add --no-cache libstdc++

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

# Server: install production deps separately so we don't ship build toolchain
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; \
    else npm install --omit=dev; fi \
 && npm rebuild better-sqlite3 --build-from-source=false || true

# Built server JS
COPY --from=server-build /app/server/dist ./dist
# Built web SPA — index.ts looks for ./public next to dist/
COPY --from=web-build /app/web/dist ./public

# Volume target for SQLite — Fly mounts here
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080
CMD ["node", "dist/index.js"]
