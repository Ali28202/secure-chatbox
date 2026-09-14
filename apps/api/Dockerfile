FROM oven/bun:1.3.14-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,target=/bun-cache,sharing=locked \
  export BUN_INSTALL_CACHE_DIR=/bun-cache; \
  for attempt in 1 2 3; do \
    bun install --frozen-lockfile --network-concurrency 8 \
      --filter=api --filter='@repo/database' --filter='@repo/shared' && exit 0; \
    echo "bun install failed (attempt $attempt of 3) — retrying in 5s"; \
    sleep 5; \
  done; \
  echo 'bun install failed three times; the registry is unreachable or too slow'; \
  exit 1

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/api apps/api

RUN cd packages/database \
  && DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
  bunx --bun prisma generate --config ./prisma.config.ts

ENV NODE_ENV=production

ENV ALLOWED_IP_RANGES=192.168.0.0/16,127.0.0.1,::1

USER bun
WORKDIR /app/apps/api
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-3001}/api/health/db" >/dev/null || exit 1

CMD ["bun", "run", "src/index.ts"]
