FROM node:20-alpine AS builder

WORKDIR /app

# Railway build context = repo root, so reference backend/ explicitly
COPY backend/package*.json ./
RUN npm ci --ignore-scripts

COPY backend/ .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
# start:all runs scripts/wait-and-run.mjs before the gateway
COPY --from=builder /app/scripts ./scripts

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "run", "start:all"]
