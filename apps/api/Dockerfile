# ---- Base ----
FROM node:26-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ---- Dependencies ----
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ---- Production dependencies only ----
FROM base AS prod-deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# ---- Runtime ----
FROM node:26-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl dumb-init \
  && addgroup -S pinoytax && adduser -S pinoytax -G pinoytax

ENV NODE_ENV=production

COPY --from=prod-deps --chown=pinoytax:pinoytax /app/node_modules ./node_modules
COPY --from=build --chown=pinoytax:pinoytax /app/dist ./dist
COPY --from=build --chown=pinoytax:pinoytax /app/prisma ./prisma
COPY --chown=pinoytax:pinoytax package*.json ./

USER pinoytax

EXPOSE 3001

# One image, two entrypoints (api HTTP server vs. worker background
# processor — see docker-compose.yml/DEPLOYMENT.md). The worker never
# listens on 3001, so its container must set WORKER_PROCESS=true to skip
# the HTTP probe here — otherwise Docker (and Swarm, if ever used) reports
# it "unhealthy" forever despite it running correctly. Kubernetes doesn't
# consult this HEALTHCHECK at all (see DEPLOYMENT.md's probe config, which
# only wires liveness/readiness on the api Deployment), so this only
# matters for docker-compose/Swarm-based runs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "process.env.WORKER_PROCESS === 'true' ? process.exit(0) : require('http').get('http://localhost:3001/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
