# ── Stage 1: Install + compile native modules ─────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# better-sqlite3 needs Python + build tools to compile the native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# ── Stage 2: Build Next.js ────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_MODE=local
# Satisfy NEXT_PUBLIC_ checks at build time — real values come from runtime env
ENV NEXT_PUBLIC_MAPBOX_TOKEN=build_placeholder
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000

RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy compiled app
COPY --from=builder /app/package*.json ./
COPY --from=deps    /app/node_modules  ./node_modules
COPY --from=builder /app/.next         ./.next
COPY --from=builder /app/public        ./public

# SQLite data dir — mount a Railway/Render Volume here so the DB survives redeploys
RUN mkdir -p .argus && chown nextjs:nodejs .argus

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
