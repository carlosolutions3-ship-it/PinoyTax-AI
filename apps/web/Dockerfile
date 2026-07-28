# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package*.json ./
RUN npm install

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, so the
# in-network API hostname must be known here, not just at container start.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

# ---- Runtime ----
# next.config.js sets output: 'standalone', which traces and copies only the
# production node_modules subset the app actually needs into .next/standalone.
# Since the Docker build context is this directory alone (not the monorepo
# root — see docker-compose.yml), Next resolves its own freshly-installed
# package-lock.json here as the workspace root, so the trace lands flat at
# .next/standalone/server.js rather than nested under an apps/web/ path.
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S pinoytax && adduser -S pinoytax -G pinoytax

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER pinoytax

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/login', (r) => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
