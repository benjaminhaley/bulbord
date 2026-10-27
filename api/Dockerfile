# Prebuilt image for the api service and the three cron services, which all
# run this same build (each cron just overrides the start command in Railway).
# Built once per push by CI (.github/workflows/ci.yml's build-images job) and
# pulled by Railway, instead of Railway rebuilding from source per service.
# Chromium (for render-page.ts) is its own early layer, so CI's layer cache
# only reinstalls it when this file changes.
FROM node:24.21.0-bookworm-slim AS runtime-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM runtime-base
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
CMD ["node", "dist/server.js"]
