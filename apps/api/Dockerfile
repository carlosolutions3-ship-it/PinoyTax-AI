# ---- Base ----
FROM node:20-alpine AS base
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
FROM node:20-alpine AS runtime
WORKDIR /app
# supervisor (pulls in python3) is only needed for the combined-mode CMD
# below — see docker/supervisord.conf's doc comment for why this exists
# instead of Render's unavailable-on-Free-plan Background Worker service.
RUN apk add --no-cache openssl dumb-init supervisor \
  && addgroup -S pinoytax && adduser -S pinoytax -G pinoytax \
  && mkdir -p /app/run && chown pinoytax:pinoytax /app/run

ENV NODE_ENV=production

COPY --from=prod-deps --chown=pinoytax:pinoytax /app/node_modules ./node_modules
COPY --from=build --chown=pinoytax:pinoytax /app/dist ./dist
COPY --from=build --chown=pinoytax:pinoytax /app/prisma ./prisma
COPY --chown=pinoytax:pinoytax docker/supervisord.conf ./docker/supervisord.conf
COPY --chown=pinoytax:pinoytax package*.json ./

USER pinoytax

EXPOSE 3001

# One image, three ways to run it:
#  - default CMD below: combined mode (api + worker supervised together in
#    one container) for Render's Free plan, which has no standalone
#    Background Worker service type.
#  - Railway's existing api/worker services override this CMD with an
#    explicit Start Command (`node dist/main.js` / `node dist/worker.js`
#    respectively) and never see this default — unaffected by this change.
#  - docker-compose.yml's worker service likewise overrides the command
#    directly; its api service pins `command: ["node", "dist/main.js"]` so
#    local dev keeps the api and worker as separate log streams/containers
#    instead of picking up combined mode.
# The worker-only override path never listens on 3001, so it sets
# WORKER_PROCESS=true to skip the HTTP probe here — otherwise Docker (and
# Swarm, if ever used) reports it "unhealthy" forever despite running
# correctly. Kubernetes doesn't consult this HEALTHCHECK at all (see
# DEPLOYMENT.md's probe config), so this only matters for
# docker-compose/Swarm-based runs and combined mode (where it correctly
# always probes, since the api's HTTP server is always present there).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "process.env.WORKER_PROCESS === 'true' ? process.exit(0) : require('http').get('http://localhost:3001/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
# Migrations run once before either process touches the database (see
# prisma/migrations — migrate deploy is idempotent), then `exec` replaces
# this shell with supervisord so dumb-init's direct child is supervisord
# itself, not an intermediate shell — required for signal forwarding
# (SIGTERM on container stop) to actually reach supervisord's graceful
# shutdown path rather than killing an orphaned shell.
CMD ["sh", "-c", "npx prisma migrate deploy && exec supervisord -c /app/docker/supervisord.conf"]
