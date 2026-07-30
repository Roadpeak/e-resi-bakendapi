# syntax=docker/dockerfile:1.6
# Multi-stage build for the e-resi NestJS backend.

ARG NODE_VERSION=22.11.0-alpine

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client for the runtime target (needs OpenSSL present).
RUN pnpm exec prisma generate
RUN pnpm run build
# Drop dev deps for the runtime image.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm prune --prod

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini openssl \
    && addgroup -S app && adduser -S app -G app -u 1001
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts ./prisma.config.ts
# Entrypoint runs prisma migrate then boots Nest.
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER app
EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--","/entrypoint.sh"]
CMD ["node","dist/main.js"]
