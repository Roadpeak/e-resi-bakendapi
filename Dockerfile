# syntax=docker/dockerfile:1.6
# Multi-stage build for the e-resi NestJS backend.
#
# Debian slim rather than Alpine, and the panorama bake is why. Alpine's
# Chromium cannot initialise any GL display in a container — SwANGLE wants a
# Vulkan loader the package set does not provide, eglInitialize fails for
# every display type, and the dead GPU process leaves DevTools page targets
# silently unresponsive (commands accepted, never answered — a hang, not an
# error). Debian's chromium ships with working software GL out of the box,
# which is the entire point of having a browser in this image.

ARG NODE_VERSION=22.11.0-bookworm-slim

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store-deb,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --shamefully-hoist

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client for the runtime target (needs OpenSSL present).
# NODE_OPTIONS: Prisma 7.8's @prisma/dev transitively require()s an ESM-only
# module (zeptomatch). Node 22's --experimental-require-module flag lets
# CJS require ESM, working around the upstream packaging bug.
RUN NODE_OPTIONS="--experimental-require-module" pnpm exec prisma generate
RUN pnpm run build
# Drop dev deps for the runtime image.
# CI=true: pnpm refuses to purge node_modules without a TTY unless it believes
# it is running in CI. GitHub Actions sets this for us, so the failure only
# shows up in a local `docker build` — setting it here makes both paths work.
RUN --mount=type=cache,id=pnpm-store-deb,target=/root/.local/share/pnpm/store \
    CI=true pnpm prune --prod

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Chromium is here to render panoramas, not to browse.
#
# PanoramaService drives a headless browser because there is no dependable
# headless WebGL in Node: three.js needs a real GL context to resolve Draco,
# KTX2 and the material graph exactly as the viewer will, and Chrome is the
# only implementation that agrees with the browsers buyers use.
#
# The font packages are not optional dressing: without them Chromium falls
# back to boxes for every glyph, and any model carrying text in a texture
# atlas or a label bakes as tofu.
#
# This costs roughly 300MB on the image, carried by every replica for what is
# an occasional admin request. Accepted deliberately: the alternative is a
# second image and a queue, which is more infrastructure than the bake earns
# until it runs often enough to need one.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini openssl ca-certificates \
      chromium fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --uid 1001 app

# Where PanoramaService looks first, so it does not have to guess.
ENV CHROME_PATH=/usr/bin/chromium

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
ENTRYPOINT ["/usr/bin/tini","--","/entrypoint.sh"]
# TS build lacks rootDir=src, so nest emits dist/src/main.js instead of
# dist/main.js. Match reality here rather than edit the app's tsconfig.
CMD ["node","dist/src/main.js"]
