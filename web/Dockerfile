# Prebuilt image for the web service, built once per push by CI
# (.github/workflows/ci.yml's build-images job) and pulled by Railway.
# VITE_API_URL is baked into the bundle at build time (passed as a build arg);
# server.mjs also reads it at runtime from the Railway service variable.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Type checking already ran in CI's web job; only the bundle is needed here.
RUN npx vite build

FROM node:24.21.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24.21.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.mjs ./
COPY --from=build /app/dist ./dist
CMD ["node", "server.mjs"]
