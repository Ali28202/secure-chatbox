# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# A slow or lossy link is the normal case here, and `@prisma/client` is a 28 MB
# tarball — by far the largest — so it is the one that times out first while
# dozens of smaller requests compete with it.
#
# Three things make that survivable: an explicit cache directory mounted across
# builds so a retry resumes instead of starting over, fewer concurrent requests
# so the big download gets bandwidth, and actually retrying.
RUN --mount=type=cache,target=/bun-cache,sharing=locked \
  export BUN_INSTALL_CACHE_DIR=/bun-cache; \
  for attempt in 1 2 3; do \
    bun install --frozen-lockfile --network-concurrency 8 \
      --filter=web --filter='@repo/shared' && exit 0; \
    echo "bun install failed (attempt $attempt of 3) — retrying in 5s"; \
    sleep 5; \
  done; \
  echo 'bun install failed three times; the registry is unreachable or too slow'; \
  exit 1

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN cd apps/web && bun run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./

COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
