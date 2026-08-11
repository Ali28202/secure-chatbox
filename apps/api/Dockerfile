# syntax=docker/dockerfile:1

# The API image. Built from the repo root — see `.dockerignore` — because a
# Bun workspace cannot be installed from a subdirectory: `bun.lock` and every
# workspace manifest live above `apps/api`.
#
# Deliberately a single stage. There is nothing to compile: Bun runs the
# TypeScript sources directly, which is also why `apps/api`'s `build` script is
# `tsc --noEmit`. Bundling the API with `bun build` buys nothing here and walks
# straight into the Prisma WASM resolution bug the plan set out to avoid.
#
# This image is also what the one-shot `migrate` service runs, with a different
# working directory and command — which is why the Prisma CLI and the
# migrations are present rather than pruned. One image, one `bun install`, and
# no chance of the migration binary drifting from the client the API imports.
#
# That choice is not free and the number is worth knowing: `prisma` drags in
# Prisma Studio, pglite and effect, roughly 170 MB the API itself never loads.
# Splitting them into a second image would trade that for two dependency trees
# on disk instead of one shared set of layers, and for the possibility of the
# two images being built from different commits. On a single campus server the
# shared-layer version is the better trade; on a registry serving many nodes it
# would not be.
FROM oven/bun:1.3.14-alpine

WORKDIR /app

# Manifests first, on their own layer. Everything below this is a cache hit
# until a dependency actually changes — and the sources, which change every
# commit, are copied after the install rather than before it.
#
# `apps/web`'s manifest is copied even though nothing here needs it: the root
# `workspaces` globs resolve it, and with the file missing `--frozen-lockfile`
# sees a workspace in the lockfile that no longer exists and refuses.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# `--filter` keeps the web app's tree — Next, React, the Tailwind toolchain —
# out of an image that will never render a page.
RUN bun install --frozen-lockfile \
  --filter=api \
  --filter='@repo/database' \
  --filter='@repo/shared'

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/api apps/api

# Generated here rather than copied from the host: the client is emitted for a
# target runtime and platform, and `.dockerignore` excludes the host's copy for
# that reason.
#
# `bunx --bun` is not decoration. Prisma's CLI ships a `#!/usr/bin/env node`
# shebang and this image has no Node at all; `--bun` is what points that
# shebang at the runtime that is actually installed.
#
# The DATABASE_URL is a syntactically valid placeholder. `prisma generate` reads
# the schema, not the database, but `prisma.config.ts` resolves the datasource
# URL eagerly and a missing variable stops the build with a confusing error
# about the database rather than about the config.
RUN cd packages/database \
  && DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
  bunx --bun prisma generate --config ./prisma.config.ts

# Where attachments are written. Absolute and outside /app on purpose: this path
# is a mounted volume in compose.prod.yml, and a semester of coursework written
# into an image layer would vanish with the next deploy without anyone noticing.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R bun:bun /data

# After the install, never before: Bun skips devDependencies when NODE_ENV is
# production, and this image needs the Prisma CLI for the `migrate` service.
ENV NODE_ENV=production

# The image ships with the campus LAN plus its own loopback — loopback because
# the HEALTHCHECK below dials 127.0.0.1 and `ipRestriction` reads the TCP peer
# address, so a container that did not allow itself would report unhealthy
# forever. compose.prod.yml replaces this with the internal network's subnet.
ENV ALLOWED_IP_RANGES=192.168.0.0/16,127.0.0.1,::1

USER bun
WORKDIR /app/apps/api
EXPOSE 3001

# `/api/health/db` rather than `/api/health`: the process being up says nothing
# useful to compose, which uses this to hold nginx back until the API can
# actually answer. Shell form, so ${API_PORT} expands.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-3001}/api/health/db" >/dev/null || exit 1

# No `--env-file`: in development the API is started with `--env-file=../../.env`,
# but here the environment comes from compose and the root .env is excluded from
# the build context precisely so it cannot be baked in.
CMD ["bun", "run", "src/index.ts"]
