# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src

RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/config/clinic.json ./dist/config/clinic.json
COPY src/db/migrations ./dist/db/migrations

RUN mkdir -p /app/data

EXPOSE 3000

# dumb-init garante propagação correta de sinais para graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
# Roda migrations antes de iniciar o servidor
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
