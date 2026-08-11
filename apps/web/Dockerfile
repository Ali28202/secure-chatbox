# syntax=docker/dockerfile:1

# The web image. Built from the repo root for the same reason as the API's —
# `bun.lock` and the workspace manifests live above `apps/web`.
#
# Two stages, and unlike the API this one earns them: `next build` needs the
# whole Next toolchain and every devDependency, and none of that has any
# business being in the image that runs on the campus server.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# `@repo/database` is filtered out, and that is a firewall rather than a saving:
# the plan's rule is that Prisma must never be reachable from `apps/web`, because
# its WASM engine breaks Turbopack. An image that cannot resolve it cannot
# accidentally import it.
RUN bun install --frozen-lockfile --filter=web --filter='@repo/shared'

COPY packages/shared packages/shared
COPY apps/web apps/web

# Where the browser should send its requests, decided here because
# `NEXT_PUBLIC_*` is inlined into the client bundle at build time and cannot be
# changed by an environment variable afterwards.
#
# The default is the empty string, which is a real setting and not a missing
# one: behind nginx the API and the app are one origin, so `/api/...` and the
# socket handshake are same-origin paths. `lib/api.ts` reads it with `??` to
# preserve that, and `lib/socket.ts` converts it back to `undefined` because
# socket.io cannot parse an empty URL.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# The campus network has no route to the internet. Left on, the build spends its
# first seconds waiting out a DNS failure it then ignores.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN cd apps/web && bun run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
# Node rather than Bun, and this is the one place the two differ on purpose.
# `server.js` is Next's own output, written against Node's APIs and tested by
# Next against Node; Bun usually runs it, and "usually" is not a property worth
# having in the process that serves the whole front end of a deployment nobody
# is watching. The build above still runs on Bun, because that is what resolves
# the workspace.
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Without HOSTNAME the standalone server binds to localhost inside its own
# network namespace, and nginx's connections are refused from the next
# container over.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# `standalone` holds the server and only the `node_modules` files the build
# actually traced. Because tracing was rooted at the monorepo root, the tree it
# emits mirrors the repo — hence `apps/web/server.js` below rather than
# `server.js`.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./

# Static assets are excluded from the standalone output by design: Next assumes
# a CDN will serve them. There is no CDN on a campus intranet, so they are
# copied in and the server serves them itself.
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
