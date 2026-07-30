#!/bin/sh
# Runtime entrypoint for the e-resi backend container.
# Runs `prisma migrate deploy` once (idempotent) then execs the CMD.
set -eu

echo "[entrypoint] running prisma migrate deploy…"
# `pnpm exec` isn't in the runtime image (prod-only deps); use npx via node
# directly since @prisma/client + prisma CLI are both in node_modules.
node ./node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] starting: $*"
exec "$@"
