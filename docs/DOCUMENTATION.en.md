# Secure Chatbox — Complete Documentation

**پلتفرم چت‌باکس امنیتی و کنترل روابط درون‌شبکه‌ای**
_Secure Chatbox and Intranet Access Control Platform_

BSc final project · Supervisor: Dr. Majid Aghaei · Semester 2, 1404–1405

> Persian edition: [DOCUMENTATION.fa.md](DOCUMENTATION.fa.md)

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [The five-minute start](#2-the-five-minute-start)
3. [Repository layout](#3-repository-layout)
4. [Technology choices, and why each one](#4-technology-choices-and-why-each-one)
5. [The data model](#5-the-data-model)
6. [The security model](#6-the-security-model)
7. [The HTTP API](#7-the-http-api)
8. [Realtime: the Socket.IO gateway](#8-realtime-the-socketio-gateway)
9. [The web client — what you actually see](#9-the-web-client--what-you-actually-see)
10. [Attachments and the S3 bucket](#10-attachments-and-the-s3-bucket)
11. [Seed data — the accounts and conversations you get](#11-seed-data--the-accounts-and-conversations-you-get)
12. [Every command in the repository](#12-every-command-in-the-repository)
13. [Configuration reference — every environment variable](#13-configuration-reference--every-environment-variable)
14. [Testing](#14-testing)
15. [Continuous integration](#15-continuous-integration)
16. [Analytics with Metabase](#16-analytics-with-metabase)
17. [Production deployment — the full runbook](#17-production-deployment--the-full-runbook)
18. [Operating the deployment](#18-operating-the-deployment)
19. [Troubleshooting](#19-troubleshooting)
20. [How it was built — the twelve milestones](#20-how-it-was-built--the-twelve-milestones)
21. [Known limitations and what is deliberately not here](#21-known-limitations-and-what-is-deliberately-not-here)

---

## 1. What this is

A messaging platform for a university's own network. Professors and students
sign in with the identifiers the university already gave them, and talk in real
time — course groups, announcement channels, study groups, and direct messages —
without any academic conversation leaving the campus LAN and without depending
on a third-party messenger.

Three properties define the whole design:

**It is an intranet application.** nginx refuses every request that does not come
from `192.168.0.0/16` or loopback, and the API refuses it a second time on its
own. There is no runtime dependency on the public internet: the font is
self-hosted, no CDN is contacted, and the entire stack runs from Docker images
you can pull once and keep. The single exception is documented in §10 — message
attachments live in an S3 bucket, and that bucket is reached over the network.

**Roles are enforced twice.** Every access rule lives in exactly one file —
[`packages/shared/src/policy.ts`](../packages/shared/src/policy.ts) — as a pure
function of plain data. The API imports it into its services and evaluates it
against rows it loaded itself. The browser imports the same file into a hook and
uses it to decide what to _draw_. A button that is not there is a kindness, not a
defence; the server is the only thing that decides.

**A session belongs to one device.** Sessions are stateless JWTs, so there is no
session table to revoke rows from. Instead every token carries the device it was
issued to, the `users.device_id` column holds the one device an account is
currently signed in on, and a login from anywhere else overwrites it — which
makes every token bound to the old device fail its next check. Signing in on a
phone signs the laptop out, deliberately.

### What works today

Everything in the project brief is implemented, verified, and committed:

| Capability                                                         | State |
| ------------------------------------------------------------------ | ----- |
| Registration, login by student/staff number **or** phone number    | ✅    |
| One-device sessions with immediate eviction of the previous device | ✅    |
| Direct messages, course groups, custom study groups                | ✅    |
| Read-only announcement channels                                    | ✅    |
| Per-member mute                                                    | ✅    |
| Real-time delivery over WebSocket, with presence                   | ✅    |
| Reply chains that survive deletion of the parent                   | ✅    |
| Message pinning (chat admins only)                                 | ✅    |
| Soft delete with a tombstone                                       | ✅    |
| Delivered / read receipts and unread badges                        | ✅    |
| Attachments in an S3 bucket, served by short-lived signed URLs     | ✅    |
| Fully Persian, right-to-left interface                             | ✅    |
| Dark and light themes                                              | ✅    |
| 72 end-to-end browser tests                                        | ✅    |
| CI on every pull request (lint, typecheck, e2e)                    | ✅    |
| One-command production deployment behind nginx                     | ✅    |
| Analytics dashboards that structurally cannot read message bodies  | ✅    |

---

## 2. The five-minute start

You need [Bun](https://bun.sh) 1.3.14 or newer and Docker. Nothing else.

```bash
# 1. Dependencies for all four workspaces.
bun install

# 2. Configuration. Copy the example and generate two real JWT secrets.
cp .env.example .env
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"  >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)" >> .env
#    (delete the two placeholder lines the example file already had)

# 3. Postgres.
bun run db:up

# 4. Schema, generated client, and demo data.
bun run db:migrate
bun run db:seed

# 5. Both apps, together.
bun run dev
```

Open **http://localhost:3000** and sign in:

|            |                                                |
| ---------- | ---------------------------------------------- |
| Identifier | `40012301` (or the phone number `09351230001`) |
| Password   | `Chatbox@1404`                                 |

That is Ali Mahallati, a student, who is already a member of four conversations
with eighteen messages in them.

To see the platform actually work, open a second browser — a different profile or
a private window, **not** a second tab, because a second tab is the same device
and the same session — and sign in as `40012303` / `Chatbox@1404` (Mohammad
Hosseini). Both are in _امنیت شبکه_. Type in one window; the message appears in
the other in well under a tenth of a second, and its tick marks fill in as the
other person scrolls past it.

### What is running

|            | Address               | What it is                       |
| ---------- | --------------------- | -------------------------------- |
| Web client | http://localhost:3000 | Next.js, the interface           |
| API        | http://localhost:3001 | Hono on Bun, REST + WebSocket    |
| Postgres   | localhost:5432        | The database, in Docker          |
| Metabase   | http://localhost:8080 | Optional; `bun run analytics:up` |

---

## 3. Repository layout

A Bun workspace monorepo, orchestrated by Turborepo.

```
secure-chatbox/
├── apps/
│   ├── api/                   Hono on Bun — REST + Socket.IO
│   │   ├── src/
│   │   │   ├── index.ts       Bun entrypoint: serve object, socket dispatch
│   │   │   ├── app.ts         Hono instance, middleware chain, route mounting
│   │   │   ├── env.ts         Zod-validated environment; exits if wrong
│   │   │   ├── types.ts       Hono context variable map
│   │   │   ├── lib/
│   │   │   │   ├── cookies.ts       Set/clear the three cookies
│   │   │   │   ├── cookie-header.ts Hand-rolled parser for the socket handshake
│   │   │   │   ├── errors.ts        Persian error envelope + AppError
│   │   │   │   ├── jwt.ts           Sign/verify access and refresh tokens
│   │   │   │   ├── password.ts      Bun.password (argon2id) wrapper
│   │   │   │   ├── mappers.ts       Prisma rows → DTOs
│   │   │   │   ├── receipts.ts      Delivered/read bookkeeping
│   │   │   │   ├── s3.ts            Bun.S3Client, built from env at import
│   │   │   │   ├── storage.ts       Upload validation, key generation
│   │   │   │   ├── validation.ts    zValidator wrapper with Persian errors
│   │   │   │   └── enum-parity.ts   Fails typecheck if Prisma enums drift
│   │   │   ├── middleware/
│   │   │   │   ├── ip-restriction.ts   CIDR allow list
│   │   │   │   ├── require-auth.ts     Verify access token, load user
│   │   │   │   └── require-chat-member.ts  404 (not 403) for non-members
│   │   │   ├── modules/
│   │   │   │   ├── auth/       register, login, refresh, logout, me
│   │   │   │   ├── chat/       create, list, detail, members
│   │   │   │   ├── message/    history, send, read, pin, delete
│   │   │   │   ├── user/       search
│   │   │   │   └── attachment/ signed download URLs
│   │   │   ├── routes/health.ts
│   │   │   └── socket/gateway.ts   Rooms, presence, auth on handshake
│   │   └── Dockerfile
│   │
│   └── web/                   Next.js 16 App Router
│       ├── app/
│       │   ├── layout.tsx           <html lang="fa" dir="rtl">, Vazirmatn
│       │   ├── globals.css          Tailwind v4 tokens, oklch, dark variant
│       │   ├── page.tsx             Landing / redirect
│       │   ├── (auth)/login, (auth)/register
│       │   └── (app)/chats, (app)/chats/[chatId]
│       ├── components/
│       │   ├── auth/       login-form, register-form, form-error
│       │   ├── chat/       chat-list, chat-detail, message-list,
│       │   │               message-bubble, message-composer,
│       │   │               message-attachments, chat-members-dialog,
│       │   │               new-chat-dialog, user-picker, presence-indicator
│       │   ├── layout/     app-header, theme-toggle
│       │   ├── realtime/   realtime-bridge
│       │   ├── system/     connection-status
│       │   └── ui/         shadcn primitives (base-nova style, rtl: true)
│       ├── hooks/          use-auth, use-chats, use-messages, use-users,
│       │                   use-permissions, use-debounced-value
│       ├── lib/            api (axios + refresh interceptor), socket,
│       │                   device-id, routes, labels, chat, form-errors,
│       │                   fonts, query-client, utils
│       ├── stores/         auth-store, presence-store (zustand)
│       ├── providers/      app-providers (react-query, theme, toasts)
│       ├── proxy.ts        Next 16's renamed middleware — navigation only
│       └── Dockerfile
│
├── packages/
│   ├── database/           Prisma 7 — schema, migrations, client, seed
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   ├── prisma/seed.ts
│   │   ├── prisma.config.ts     Loads the root .env by absolute path
│   │   └── src/{client,index}.ts
│   └── shared/             Contracts both apps import
│       ├── src/constants.ts     Limits, MIME allowlist, cookie names, codes
│       ├── src/policy.ts        Every access rule, as pure functions
│       ├── src/format.ts        Persian digits, dates, file sizes
│       ├── src/locale.ts        fa-IR
│       ├── src/messages.ts      Shared Persian strings
│       ├── src/schemas/         Zod: auth, chat, message, user, common
│       └── src/types/           DTOs, API envelope, socket event contracts
│
├── e2e/                    Playwright — 8 specs, 72 tests
├── infra/
│   ├── nginx/nginx.conf
│   ├── nginx/conf.d/app.conf        Port 80 — web, API, WebSocket
│   ├── nginx/conf.d/metabase.conf   Port 8080 — analytics
│   └── metabase/init.sql            The read-only role and its grants
├── .github/workflows/ci.yml
├── .github/actions/setup/action.yml
├── compose.yml             Development: Postgres (+ optional Metabase)
├── compose.prod.yml        Production: everything, behind nginx
└── turbo.json
```

### Two structural rules that are load-bearing

**`@repo/database` must never become a dependency of `apps/web`.** That firewall
is what keeps Prisma's WASM out of the Turbopack graph — a known Next 16 + Prisma
7 failure mode. It is why `packages/shared/src/constants.ts` re-declares the four
enums as string-literal unions instead of importing them from Prisma, and why
[`apps/api/src/lib/enum-parity.ts`](../apps/api/src/lib/enum-parity.ts) exists: it
fails typecheck the moment the two definitions drift apart.

**Bun's isolated linker means no root hoisting.** Every workspace-to-workspace
import needs an explicit `"workspace:*"` entry in the consumer's `package.json`.
This is also why `e2e/` is not a workspace — it lives at the root, has its own
`tsconfig.json`, and is linted and typechecked by its own CI steps.

---

## 4. Technology choices, and why each one

| Choice                                                | Reason                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun 1.3.14** as runtime and package manager         | `Bun.password` gives argon2id offloaded to a worker thread — bcryptjs is pure JS and blocks the event loop. `Bun.S3Client` is built in. TypeScript runs directly, so there is no build step for the API at all.                                                                   |
| **Hono 4.13** rather than Express                     | Web-standard `Request`/`Response`, so it is the same object Bun's `fetch` handler receives. Ships `hono/jwt`, `hono/csrf` and `hono/ip-restriction` in the same package — no extra dependencies for any of the three.                                                             |
| **`@socket.io/bun-engine` 0.1.1**, pinned exactly     | Hono hands the server lifecycle to `Bun.serve`, so there is no `http.Server` for engine.io to attach to. Without this adapter, `new Server()` binds to nothing and every client hangs forever on the polling handshake. Pinned because it is pre-1.0.                             |
| **Next.js 16.3 + React 19.2**                         | App Router, React Server Components for the shell, `next/font/local` for the self-hosted font. The file is `proxy.ts`, not `middleware.ts` — Next 16 renamed the convention.                                                                                                      |
| **Tailwind v4 + shadcn (`base-nova`, `"rtl": true`)** | shadcn's RTL mode rewrites every `left-*`/`right-*` to `start-*`/`end-*` at install time. Hand-rolling that across forty components is where RTL bugs come from. There is no `tailwind.config.ts` in v4 — the tokens live in `globals.css`.                                       |
| **Vazirmatn, self-hosted**                            | An intranet has no runtime internet. The variable `.woff2` is committed to `apps/web/fonts/` and served from `/_next/static/media/`; nothing ever asks `fonts.gstatic.com`. The upstream file had to be renamed — `Vazirmatn[wght].woff2` parses as a Next dynamic-route segment. |
| **Prisma 7.9.1 with `@prisma/adapter-pg`**            | In Prisma 7 the Rust query engine is gone and a driver adapter is mandatory. The generator is configured `runtime = "bun"`, `moduleFormat = "esm"`, `importFileExtension = "ts"` — that last one is required or Bun cannot resolve the generated `./internal/*` imports.          |
| **Zod 4 in `@repo/shared`**                           | One schema validates the form in the browser and the request body on the server, and produces the same Persian error message in both places.                                                                                                                                      |
| **httpOnly cookies, not `Authorization` headers**     | A token in `localStorage` is readable by any script that gets onto the page. httpOnly cookies also mean the Socket.IO handshake authenticates itself with no extra work, because the browser attaches them to the upgrade request.                                                |
| **Postgres 18-alpine**                                | Note: PG 18 moved `PGDATA` to `/var/lib/postgresql/18/docker` and declares its `VOLUME` at `/var/lib/postgresql`. Mounting the old `.../data` path persists nothing, silently.                                                                                                    |

---

## 5. The data model

Seven tables. The schema is
[`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma);
migrations are in `packages/database/prisma/migrations/`.

```
        ┌──────────────┐         ┌──────────────┐
        │    users     │────────<│ chat_members │>────────┐
        └──────┬───────┘         └──────────────┘         │
               │                                    ┌─────┴──────┐
               │                                    │   chats    │
               │                                    └─────┬──────┘
               │  sender                                  │
               └────────────>┌──────────────┐<────────────┘
                             │   messages   │──┐ reply_to_id (self)
                             └──────┬───────┘<─┘
                     ┌──────────────┴───────────────┐
              ┌──────┴───────┐            ┌─────────┴────────┐
              │ attachments  │            │ message_receipts │
              └──────────────┘            └──────────────────┘
```

All primary keys are `TEXT` holding a UUIDv7 — time-ordered, so an index on the
id is also roughly an index on creation time.

### `users`

| Column                     | Type                  | Notes                                                                                                                                                                                                            |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | text PK               | UUIDv7                                                                                                                                                                                                           |
| `university_id`            | text unique           | The student number or staff code. A login identifier.                                                                                                                                                            |
| `phone_number`             | text unique, nullable | The other login identifier. Stored canonically as `09` + nine digits (`normalizePhoneNumber` in `@repo/shared`). Nullable only because it was added to accounts that already existed; registration requires one. |
| `password_hash`            | text                  | argon2id, `$argon2id$v=19$m=65536,t=2,p=1$…`                                                                                                                                                                     |
| `name`                     | text                  | Display name                                                                                                                                                                                                     |
| `role`                     | enum                  | `STUDENT` \| `PROFESSOR` \| `ADMIN`                                                                                                                                                                              |
| `is_active`                | bool                  | `requireAuth` rejects `false`                                                                                                                                                                                    |
| `device_id`                | text, nullable        | **The revocation list.** See §6. Not unique — two people sharing a lab machine legitimately present the same fingerprint.                                                                                        |
| `last_seen`                | timestamp, nullable   |                                                                                                                                                                                                                  |
| `created_at`, `updated_at` | timestamp             |                                                                                                                                                                                                                  |

### `chats`

| Column            | Type                | Notes                                                             |
| ----------------- | ------------------- | ----------------------------------------------------------------- |
| `id`              | text PK             |                                                                   |
| `title`           | text, nullable      | Null for `DIRECT` — the title is derived from the other member    |
| `type`            | enum                | `DIRECT` \| `COURSE_GROUP` \| `CUSTOM_GROUP`                      |
| `is_read_only`    | bool                | Announcement channels: only chat admins may send                  |
| `creator_id`      | text FK → users     | `onDelete: Restrict`                                              |
| `last_message_at` | timestamp, nullable | Denormalised, maintained by `MessageService`. Indexed descending. |

`last_message_at` is one of two additions beyond the submitted ERD. Without it,
ordering the chat list requires a correlated `max(created_at)` per chat on every
single request.

### `chat_members`

Composite primary key `(user_id, chat_id)`.

| Column      | Type      | Notes                                                                    |
| ----------- | --------- | ------------------------------------------------------------------------ |
| `role`      | enum      | `ADMIN` \| `MEMBER` — **per chat**, entirely independent of `users.role` |
| `is_muted`  | bool      | Blocked at send time                                                     |
| `joined_at` | timestamp |                                                                          |

`ChatRole` and `GlobalRole` are never compared. Being a PROFESSOR does not make
you an admin of a group you were added to, and administering a study group does
not make a student a professor. The global role decides only what you may
_create_.

### `messages`

| Column                                 | Type                         | Notes                                                               |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `content`                              | text, **nullable**           | Nulled on soft delete; the row survives so reply chains stay intact |
| `sender_id`                            | text FK → users              | cascade                                                             |
| `chat_id`                              | text FK → chats              | cascade                                                             |
| `reply_to_id`                          | text FK → messages, nullable | Self-relation, `onDelete: SetNull`                                  |
| `is_edited`, `is_deleted`, `is_pinned` | bool                         |                                                                     |

`is_pinned` is the second addition beyond the submitted ERD — the use-case
diagram grants professors «حذف پیام یا پین کردن» but the ERD had no field to
store it in.

Index `(chat_id, created_at DESC)` is what makes cursor pagination fast.

### `attachments`

| Column                   | Type      | Notes                                                                                                                                           |
| ------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `s3_bucket`              | text      | Recorded **per row**, not read from config — so changing `S3_BUCKET` later leaves every existing attachment findable                            |
| `s3_object_key`          | text      | Generated by the API: a month prefix, a UUIDv7, and the display name. A client can never choose where its upload lands. Never sent to browsers. |
| `file_name`              | text      | What to show, and what the browser saves it as                                                                                                  |
| `file_type`, `file_size` | text, int |                                                                                                                                                 |

### `message_receipts`

Composite primary key `(message_id, user_id)`. Status is `DELIVERED` or `READ`
and only ever advances in that direction.

### Two deliberate omissions from the ERD

**No `sessions` table.** Refresh tokens stay stateless — their own secret, a
seven-day expiry, and logout clears the cookies. The trade-off, stated plainly: a
stolen refresh token cannot be revoked before it expires. Device binding
substantially narrows the window (a login anywhere else invalidates it), but it
is not the same guarantee a session table would give.

**No `edits` history.** `is_edited` is a flag, not a log.

---

## 6. The security model

Seven independent layers. None of them is the only thing standing between an
attacker and the data.

### 6.1 Network — nginx

[`infra/nginx/conf.d/app.conf`](../infra/nginx/conf.d/app.conf) opens with:

```nginx
allow 192.168.0.0/16;
allow 127.0.0.1;
deny  all;
```

Order matters — nginx evaluates allow/deny top to bottom and stops at the first
match, so `deny all` must come last. From any address outside the campus LAN the
response is **403**, before a single byte reaches the application. In
`compose.prod.yml` nginx is the only service that publishes a port at all;
`api`, `web`, `db` and `metabase` are reachable by service name on an internal
network and by nothing else.

### 6.2 Network — the API, again

`hono/ip-restriction`, applied to every route in
[`apps/api/src/app.ts:35`](../apps/api/src/app.ts#L35), enforces
`ALLOWED_IP_RANGES` independently. In production that value is the compose
network's own subnet (`172.28.0.0/16`, pinned in the network's IPAM config so
Docker cannot hand out something else) plus loopback for the container's own
health check. If someone finds a way to reach port 3001 directly, they are still
refused.

### 6.3 Passwords

`Bun.password.hash` — argon2id, offloaded to a worker thread so hashing does not
block the event loop.

On an unknown identifier the service still runs `verifyPassword` against a dummy
hash before returning its failure, so the response time does not reveal which
accounts exist.

### 6.4 Tokens

Two JWTs, two **different** secrets, each at least 32 characters. `env.ts`
refuses to start if they are equal — if they matched, a refresh token could be
replayed as an access token. Each token also carries a `typ` claim that is
checked on verify, and `alg` is always passed explicitly to `verify` to prevent
algorithm-confusion attacks.

| Cookie          | Path        | Lifetime                     | Contents                |
| --------------- | ----------- | ---------------------------- | ----------------------- |
| `access_token`  | `/`         | 15 min (`ACCESS_TOKEN_TTL`)  | httpOnly, SameSite=Lax  |
| `refresh_token` | `/api/auth` | 7 days (`REFRESH_TOKEN_TTL`) | httpOnly, SameSite=Lax  |
| `session_hint`  | `/`         | matches refresh              | **No token.** Readable. |

The refresh cookie is scoped to `/api/auth` so it is not attached to every
ordinary API call — it travels only where it is needed.

`session_hint` carries nothing and proves nothing. Its presence alone tells
`proxy.ts` whether to render the app shell or send the visitor to the login form,
which neither real cookie can do: the access cookie expires after fifteen minutes
while the session is still good for a week, and the refresh cookie is deliberately
not sent on page requests. Anyone can forge it. All they win is a page that
immediately asks the API for data and receives a 401.

`COOKIE_SECURE` is an **explicit environment variable**, not derived from
`NODE_ENV`. A campus intranet may well be served over plain HTTP, and a `Secure`
cookie there is one the browser accepts and then never sends back — which
presents as "login succeeds and then I am immediately logged out".

### 6.5 One device per account

This is the part that most distinguishes the platform.

1. The browser mints a device id on first use and keeps it in `localStorage` —
   see [`apps/web/lib/device-id.ts`](../apps/web/lib/device-id.ts). It is 32 hex
   characters of `crypto.getRandomValues` **prefixed** by an FNV-1a hash of the
   browser's own traits (user agent, language, `hardwareConcurrency`, platform).
   Random first, deliberately: a fingerprint built purely from traits would be
   identical on every machine in a computer lab, and one student signing in would
   evict the person next to them. The traits only add the ability to notice that
   storage has been copied elsewhere.

   `crypto.subtle.digest` is restricted to secure contexts and is therefore
   `undefined` on a plain-HTTP LAN, which is why FNV-1a is hand-written.
   `crypto.getRandomValues` _is_ available in insecure contexts, which is what
   makes the random half possible at all.

2. It is sent in the **login body only** — never as a cookie, never as a header.
   From then on it lives inside the signed token, so there is nothing on the wire
   for an attacker holding a stolen cookie to copy.

3. `login` writes it to `users.device_id`, overwriting whatever was there.

4. Every authenticated request compares the token's device against the column.
   A mismatch returns **`DEVICE_MISMATCH`**, which is its own error code and not
   a plain 401 — because the two need opposite handling. An ordinary 401 means
   "refresh and carry on"; this one means the account is signed in somewhere else
   and refreshing will fail for exactly the same reason. The client checks for it,
   skips the refresh, drops the session, and says what actually happened.

5. Open sockets are closed too. `socket.data.deviceId` records which device
   opened each connection, because the handshake is the _only_ moment a socket is
   authenticated — once it is open, nothing re-reads the account.

Clearing site data mints a new id and therefore ends the session on the next
request. That is correct: a browser that has forgotten which device it is cannot
prove it is the same one.

### 6.6 CSRF

`hono/csrf` with `origin: env.CORS_ORIGINS`, at
[`apps/api/src/app.ts:52`](../apps/api/src/app.ts#L52).

In production `CORS_ORIGINS` is **empty**, and that is not an oversight. nginx
makes the app and the API one origin, so a same-origin request is not a CORS
request at all. The CSRF guard passes a request on `Sec-Fetch-Site: same-origin`
alone — which is exactly what the browser sends here — and refuses every
cross-site form or multipart post, because the origin list matches nothing.
`PUBLIC_ORIGIN` exists only to also admit browsers too old to send
`Sec-Fetch-Site`.

### 6.7 Authorization

[`packages/shared/src/policy.ts`](../packages/shared/src/policy.ts) — every rule,
once, as a pure function:

| Function                                      | Rule                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `canCreateChat(user, type)`                   | `COURSE_GROUP` requires PROFESSOR or ADMIN; direct chats and custom groups are open to everyone                                           |
| `sendBlock(chat, member)`                     | Returns `'MUTED'`, `'READ_ONLY'`, or `null`. **Mute is checked first** — a muted admin is muted                                           |
| `canDeleteMessage(member, senderId)`          | Your own, always; anyone else's only as chat ADMIN                                                                                        |
| `canPinMessage(member)`                       | Chat ADMIN only. No "your own message" case — pinning changes what the whole chat sees                                                    |
| `canUpdateChat(chat, member)`                 | Chat ADMIN, and never in a `DIRECT` chat                                                                                                  |
| `canManageMembers(chat, member)`              | Same                                                                                                                                      |
| `canUpdateMember(chat, actor, target)`        | Never yourself — an admin who could demote themselves could leave a group with no admin at all, which nothing inside the app could repair |
| `canMuteMember(chat, actor, target)`          | The above, plus: an admin is never muted. Co-admins can remove each other; they cannot gag each other                                     |
| `canLeaveChat(chat, member, otherAdminCount)` | Anyone, except the last admin — who must appoint a successor first                                                                        |

Direct chats are excluded from every administration rule. Both participants are
`ADMIN` (there is no hierarchy between two people), so a rule that only asked
about `ChatRole` would let either of them mute the other or turn the conversation
read-only. That is not administration.

`requireChatMember` returns **404, not 403**, for a chat you are not in — so the
API never confirms that a chat id exists to someone who has no business knowing.

### 6.8 Uploads

Enforced in `packages/shared/src/constants.ts` and re-enforced server-side:

- **Allowlist, not denylist** — thirteen MIME types (images, PDF, plain text,
  ZIP, Office documents). A denylist of dangerous types is a promise to have
  thought of all of them.
- **The stored extension comes from the allowlist table, never from the uploaded
  filename.** A filename is client-supplied text; the only reliable defence
  against storing `report.pdf.php` is never to ask the client what the extension
  should be.
- `Object.hasOwn`, not `type in ALLOWED_FILE_TYPES` — `in` walks the prototype
  chain, so `'constructor'` would otherwise pass an allowlist that never listed
  it.
- 10 MB per file, 5 files per message, ~51 MB body limit, checked **before**
  anything is written.
- Magic-byte verification against the declared type.

---

## 7. The HTTP API

Base path `/api`. Every response is a typed envelope; every error message is
Persian.

**Middleware chain**, in order — [`apps/api/src/app.ts`](../apps/api/src/app.ts):

```
logger()  →  ipRestriction  →  cors(credentials)  →  csrf  →  routes
```

### Health — `/api/health`

| Method | Path               | Notes                                                      |
| ------ | ------------------ | ---------------------------------------------------------- |
| `GET`  | `/api/health`      | `{ status, uptime }`. No auth, no database.                |
| `GET`  | `/api/health/db`   | Round-trips Postgres and returns a row count               |
| `POST` | `/api/health/echo` | **Development only.** Demonstrates the validation envelope |

### Auth — `/api/auth`

| Method | Path        | Body                                                          | Effect                                                                                                                                                                                                                                     |
| ------ | ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/register` | `universityId`, `phoneNumber`, `name`, `password`, `deviceId` | Creates the account and signs in                                                                                                                                                                                                           |
| `POST` | `/login`    | `identifier`, `password`, `deviceId`                          | `identifier` is **either** the university id or the phone number — the service decides which, because a person typing their own identifier should not have to tell the form which one it is. Sets all three cookies and claims the device. |
| `POST` | `/refresh`  | —                                                             | Reads the refresh cookie, re-checks the device, issues a new access token                                                                                                                                                                  |
| `POST` | `/logout`   | —                                                             | Clears all three cookies                                                                                                                                                                                                                   |
| `GET`  | `/me`       | —                                                             | The signed-in user. Never includes `passwordHash`.                                                                                                                                                                                         |

### Users — `/api/users`

| Method | Path             | Notes                                                  |
| ------ | ---------------- | ------------------------------------------------------ |
| `GET`  | `/api/users?q=…` | Search by name or university id, for the member picker |

### Chats — `/api/chats`

| Method | Path | Notes                                                                                                              |
| ------ | ---- | ------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/`  | The signed-in user's chats, ordered by `last_message_at` desc, each with its unread count and last-message preview |
| `POST` | `/`  | Create. `DIRECT` chats are deduplicated by sorted member pair, so asking twice returns the existing conversation   |

Everything below is mounted under `/:chatId` behind `requireChatMember`:

| Method   | Path                                 | Notes                                              |
| -------- | ------------------------------------ | -------------------------------------------------- |
| `GET`    | `/api/chats/:chatId`                 | Detail, with the member list                       |
| `PATCH`  | `/api/chats/:chatId`                 | Title, `isReadOnly` — `canUpdateChat`              |
| `POST`   | `/api/chats/:chatId/members`         | Add — `canManageMembers`                           |
| `PATCH`  | `/api/chats/:chatId/members/:userId` | Role or mute — `canUpdateMember` / `canMuteMember` |
| `DELETE` | `/api/chats/:chatId/members/:userId` | Remove, or leave — `canLeaveChat`                  |

### Messages — `/api/chats/:chatId/messages`

| Method   | Path              | Notes                                                                                                                                                                                                                                            |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/`               | **Cursor** pagination: `?before=<messageId>&limit=50`. Offset pagination breaks under concurrent inserts, which a chat application has by definition.                                                                                            |
| `POST`   | `/`               | Send. Multipart when there are attachments; own body limit. Runs in a `$transaction` — insert plus the `last_message_at` bump — and **emits only after the transaction commits**, because emitting inside produces phantom messages on rollback. |
| `POST`   | `/read`           | `markRead(chatId, upToMessageId)` — one round trip per scroll settle, not one per message                                                                                                                                                        |
| `GET`    | `/pinned`         | The pinned messages of this chat                                                                                                                                                                                                                 |
| `PATCH`  | `/:messageId/pin` | `canPinMessage`                                                                                                                                                                                                                                  |
| `DELETE` | `/:messageId`     | Soft delete — `canDeleteMessage`. Returns the tombstone: `content: null, isDeleted: true`                                                                                                                                                        |

### Attachments — `/api/attachments`

| Method | Path             | Notes                                                                                                                                  |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/:attachmentId` | Re-checks chat membership, then **redirects to a signed S3 URL** valid for `S3_URL_TTL` seconds. The bytes never pass through the API. |

---

## 8. Realtime: the Socket.IO gateway

The engine is `@socket.io/bun-engine`, dispatched explicitly in
`apps/api/src/index.ts`:

```ts
export default {
  port: env.API_PORT,
  idleTimeout: 30, // MUST exceed engine pingInterval (25s); Bun's default is 10
  websocket,
  fetch(req, server) {
    if (new URL(req.url).pathname.startsWith('/socket.io/')) {
      return engine.handleRequest(req, server);
    }
    return app.fetch(req, server);
  },
};
```

Explicit dispatch rather than `app.all('/socket.io/', …)` — that form matches
only the exact trailing-slash path, and lets Hono's global `cors()` emit a
duplicate `Access-Control-Allow-Origin` that the browser rejects.

`idleTimeout: 30` is not optional. Bun's default is 10 seconds and engine.io
pings every 25, so without it every socket dies while the conversation is still
open.

**Authentication** happens in `io.use()`, which parses
`socket.handshake.headers.cookie` with a hand-rolled parser
([`lib/cookie-header.ts`](../apps/api/src/lib/cookie-header.ts)) — `hono/utils/cookie`
is not in Hono's export map.

**Connections** are a `Map<userId, Set<socketId>>`. A Set, because one user has
several tabs.

### Server → client

| Event              | Payload          | Meaning                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message:new`      | `MessageDto`     | A message was posted in a chat this socket belongs to — **including one this same user sent from another tab, and including their own send echoed back**. Clients apply it by id, never by appending blindly.                                                                                                                                                                                       |
| `message:deleted`  | `MessageDto`     | The payload is the tombstone, not the id                                                                                                                                                                                                                                                                                                                                                            |
| `message:updated`  | `MessageDto`     | Something changed without being deleted — today that means pinned or unpinned. Named for the _shape_ of the change, not for pinning, because clients apply it the same way whatever moved: replace the row with this id. A `message:pinned` event would need a sibling for every future edit, each with an identical handler.                                                                       |
| `presence:sync`    | `string[]`       | Everyone already online that this socket shares a chat with. Sent on connect and again on joining a new chat, so clients **merge** rather than replace. A user's absence from this list means "not covered by this batch", not "offline".                                                                                                                                                           |
| `presence:changed` | `PresenceChange` | Going offline is only ever reported here                                                                                                                                                                                                                                                                                                                                                            |
| `receipt:read`     | `ReadReceipt`    | A member read up to a point. Broadcast to the whole room including the sender, so the reader's _own_ other tabs can refresh their unread badge.                                                                                                                                                                                                                                                     |
| `chat:updated`     | `chatId`         | **Carries the id and nothing else, and that is the whole design.** Every richer payload would be per-viewer — `ChatListItemDto` holds an unread count and read watermarks that mean different things to each member — so no single broadcast object could be correct for the room it is sent to. This is an invalidation signal: it says _what_ went stale, and each client re-reads it for itself. |

### Client → server

| Event       | Payload  | Notes                                                                                                                                                           |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat:join` | `chatId` | For a chat created or joined _after_ this socket connected. Membership is re-checked server-side — the room a socket asks for is not evidence it belongs there. |

Both interfaces live in
[`packages/shared/src/types/socket.ts`](../packages/shared/src/types/socket.ts)
and type the server and the client from the same declaration.

---

## 9. The web client — what you actually see

`<html lang="fa" dir="rtl">`, Vazirmatn throughout, Persian digits everywhere,
dark and light themes.

### `/login`

Two fields — «شناسه» and «گذرواژه». The identifier accepts either the university
id or the phone number, because a person typing their own identifier should not
have to tell the form which kind it is.

Validation runs against the same Zod schema the API uses, so the message under
the field is the message the server would have sent.

A `?next=` parameter survives the round trip, so a link into a specific
conversation still lands there after signing in. It is sanitised by
`safeRedirectTarget` — anything that is not a plain in-app path is discarded, and
`//host` is rejected too because browsers read it as protocol-relative. Without
that check, `/login?next=https://evil.example` would turn the login page into a
credible-looking springboard to someone else's.

If you arrive here because your account was claimed by another device, the URL
carries `?device=…` and the page says so. It is a URL flag rather than a message
in a store because getting here means reloading the page — the entire point of a
forced re-login is that no client state survives it.

### `/register`

Name, university id, phone number, password. The phone number is normalised to
`09` + nine digits before it is sent.

### `/chats`

The application shell. A header with your name, a theme toggle, a connection
indicator, and a two-pane layout — the conversation list on the right (this is
RTL), the open conversation on the left.

**The list** is ordered by `last_message_at` descending and shows, per row: the
title (derived from the other participant for direct chats), the last message as
a preview, a relative timestamp in Persian, and an unread badge. Rows reorder
themselves live as messages arrive.

**«گفت‌وگوی جدید»** opens a dialog. What it offers depends on who you are:
students get direct messages and custom groups, professors and admins also get
course groups — because `canCreateChat` says so, evaluated in the browser by
`use-permissions` and again on the server.

### `/chats/[chatId]`

**Pinned messages** sit at the top when there are any.

**The message list** loads a page of 50 and fetches older ones as you scroll up,
by cursor. Each bubble carries the sender's name (in groups), the body, Persian
timestamps, any attachments, and — on your own messages — tick marks: one for
delivered, two for read.

Read receipts are driven by an `IntersectionObserver` and **batched**. One round
trip per scroll settle, not one per message.

Replies quote the parent above the body. Deleting the parent leaves the quote in
place as «پیام حذف شده است» — this is the tombstone doing its job.

**The composer** is where the policy becomes visible. If you are muted, or the
chat is read-only and you are not an admin, the box is disabled and the reason is
written underneath — in the same sentence the API would have returned, because
both come from `SEND_BLOCK_MESSAGES` in `policy.ts`.

Attachments: a paperclip, a file picker restricted by `FILE_ACCEPT`, and a
preview strip. Oversized files are refused in the browser before the upload
starts, and refused again by the API.

**Message actions** — reply, pin, delete — appear only where the policy allows
them.

**The members dialog** lists everyone with their chat role and mute state, and
offers add, remove, promote, mute and leave to whoever the policy allows.

### Under the interface

`lib/api.ts` is an axios instance with `withCredentials: true` and a 401
interceptor that refreshes **once** — concurrent 401s share a single in-flight
promise — and then replays the original request. A `DEVICE_MISMATCH` response
skips the refresh entirely and routes to `/login?device=…`.

`realtime-bridge.tsx` connects the socket, joins rooms, and writes every incoming
event into the React Query cache. It is the only component that touches the
socket; everything else reads the cache.

`proxy.ts` (Next 16's renamed `middleware.ts`) reads `session_hint` and nothing
else. It decides which page shape to serve before the app renders. It verifies
nothing — see §6.4. What it buys is the absence of a flash: a signed-out visitor
goes straight to the login form instead of watching an empty chat list appear and
then vanish.

---

## 10. Attachments and the S3 bucket

**Nothing in this repository runs an object store.** The bucket is somebody
else's — AWS, an Iranian provider such as Arvan or ParsPack, or a MinIO the
university runs on its own network. Five environment variables are the whole of
what the platform knows about it.

The flow:

1. The browser checks size, count and type against `@repo/shared` and refuses
   locally rather than spending five minutes uploading a file that will be
   rejected.
2. The API re-checks everything, verifies magic bytes against the declared type,
   and builds a key: month prefix, UUIDv7, display name. The client never chooses
   where its upload lands.
3. `Bun.S3Client` writes the object. The row records the bucket **and** the key,
   so changing `S3_BUCKET` later does not orphan anything already stored.
4. `GET /api/attachments/:id` re-checks chat membership, then redirects to a
   signed URL valid for `S3_URL_TTL` seconds (default 300). The bytes never pass
   through the API, and the bucket stays private — the whole scheme depends on
   anonymous reads being refused.

Note `S3_ENDPOINT` must be a URL **the browser can also reach**. The SigV4
signature covers the host, so a name that only resolves inside the container
network produces links that work for the API and for nobody else.

**This is the one part of the platform that leaves the campus network.** Messages,
accounts and sessions never do. If that is not acceptable for the coursework
being sent, run an S3-compatible store on the university's own network and point
`S3_ENDPOINT` at it — nothing else changes.

---

## 11. Seed data — the accounts and conversations you get

`bun run db:seed` — idempotent, so run it as often as you like. Every row is
upserted against a fixed id, and message timestamps are written in `create` only,
so re-seeding does not shuffle the conversation.

It **refuses to run under `NODE_ENV=production`.**

### Accounts

Password for all seven: **`Chatbox@1404`** (development only).

| University id | Phone         | Name            | Role      |
| ------------- | ------------- | --------------- | --------- |
| `admin`       | `09120000000` | مدیر سامانه     | ADMIN     |
| `900101`      | `09121110001` | دکتر مجید آقایی | PROFESSOR |
| `900102`      | `09121110002` | دکتر زهرا رضایی | PROFESSOR |
| `40012301`    | `09351230001` | علی محلاتی      | STUDENT   |
| `40012302`    | `09351230002` | سارا کریمی      | STUDENT   |
| `40012303`    | `09351230003` | محمد حسینی      | STUDENT   |
| `40012304`    | `09351230004` | نگین صادقی      | STUDENT   |

### Conversations

| Chat                | Type                        | Notable                                                                                     |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| امنیت شبکه          | COURSE_GROUP                | Dr. Aghaei is admin. **نگین صادقی is muted** — sign in as her to see the disabled composer. |
| پایگاه داده         | COURSE_GROUP                | Dr. Rezaei is admin                                                                         |
| اطلاعیه‌های دانشکده | COURSE_GROUP, **read-only** | Admin and both professors are chat admins; students can read and nothing else               |
| پروژهٔ پایانی       | CUSTOM_GROUP                | Created by a **student** — this is `canCreateChat` allowing it                              |
| علی ↔ دکتر آقایی    | DIRECT                      | Both members are ADMIN                                                                      |
| سارا ↔ محمد         | DIRECT                      | Both members are ADMIN                                                                      |

### Verified totals

7 users · 6 chats · 23 memberships · 18 messages · 55 receipts, 30 of them READ.

Among the messages: **3 pinned**, **5 replies**, **1 edited**, **1 soft-deleted**
(so you can see a tombstone and a reply that still quotes it).

Unread counts after seeding: محمد 6 · نگین 6 · علی 4 · سارا 3 · دکتر زهرا 1 ·
مدیر 1.

**Attachments are deliberately not seeded.** A row pointing at an object that
does not exist in your bucket is worse than no row — it produces a broken
download rather than an empty state. Upload one from the interface to exercise
that path.

---

## 12. Every command in the repository

### Daily work

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `bun install`       | Install every workspace             |
| `bun run dev`       | API and web together, both watching |
| `bun run build`     | Production build of both            |
| `bun run typecheck` | All four workspaces                 |
| `bun run lint`      | All four workspaces                 |

### Database

| Command               | What it does                                               |
| --------------------- | ---------------------------------------------------------- |
| `bun run db:up`       | Postgres in Docker                                         |
| `bun run db:down`     | Stop it                                                    |
| `bun run db:generate` | Regenerate the Prisma client (after schema edits)          |
| `bun run db:migrate`  | Create and apply a migration — **development only**        |
| `bun run db:deploy`   | Apply existing migrations — **this is the production one** |
| `bun run db:reset`    | Drop, recreate, migrate, seed. **Destroys all data.**      |
| `bun run db:studio`   | Prisma Studio, a browser table viewer                      |
| `bun run db:seed`     | Demo data (idempotent)                                     |

### Tests

| Command                   | What it does                             |
| ------------------------- | ---------------------------------------- |
| `bun run test:s3:up`      | A MinIO bucket for the attachment specs  |
| `bun run test:e2e`        | 72 Playwright tests in a real Chromium   |
| `bun run test:e2e:ui`     | Playwright's interactive runner          |
| `bun run test:e2e:report` | Open the last report                     |
| `bun run test:s3:down`    | Stop MinIO                               |
| `bun run typecheck:e2e`   | The suite has its own tsconfig (DOM lib) |
| `bun run lint:e2e`        | And its own lint step                    |

### Analytics

| Command                  | What it does      |
| ------------------------ | ----------------- |
| `bun run analytics:up`   | Metabase on :8080 |
| `bun run analytics:down` | Stop it           |
| `bun run analytics:logs` | Follow its log    |

### Production

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `bun run prod:up`   | Build images and bring the whole stack up |
| `bun run prod:down` | Stop everything                           |
| `bun run prod:logs` | Follow every service                      |
| `bun run prod:ps`   | Service status                            |

---

## 13. Configuration reference — every environment variable

One file: the **root `.env`**. Docker Compose reads it, `prisma.config.ts` loads
it by absolute path, and `apps/api` is started with `--env-file=../../.env`.
`.env.example` is its documented shape and is what CI runs against, so the
example is exercised on every pull request instead of quietly rotting.

`.env` is gitignored. Never commit it.

### Postgres

| Variable            | Default          | Notes                             |
| ------------------- | ---------------- | --------------------------------- |
| `POSTGRES_USER`     | `chatbox`        |                                   |
| `POSTGRES_PASSWORD` | `chatbox_dev_pw` | **Required in production** (`:?`) |
| `POSTGRES_DB`       | `chatbox`        |                                   |
| `POSTGRES_PORT`     | `5432`           | Host port, development only       |

### Prisma

| Variable       | Notes                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Must match the values above. In `compose.prod.yml` this is **rebuilt** against `db:5432` rather than taken from `.env`, because inside that network the database answers to `db`. Two names for one setting is how a deployment ends up migrating the wrong database. |

### API

| Variable   | Default       | Notes                                   |
| ---------- | ------------- | --------------------------------------- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `API_PORT` | `3001`        |                                         |

### Auth

| Variable             | Default                        | Notes                                                                                                                                                |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`  | —                              | ≥ 32 chars. `openssl rand -base64 48`                                                                                                                |
| `JWT_REFRESH_SECRET` | —                              | ≥ 32 chars, **different from the above**. The API refuses to start if they match.                                                                    |
| `ACCESS_TOKEN_TTL`   | `900`                          | Seconds                                                                                                                                              |
| `REFRESH_TOKEN_TTL`  | `604800`                       | Seconds — 7 days                                                                                                                                     |
| `COOKIE_SECURE`      | `false`                        | Set `true` **only** if the deployment actually terminates TLS                                                                                        |
| `CORS_ORIGINS`       | `http://localhost:3000`        | Comma-separated. **Empty in production.**                                                                                                            |
| `ALLOWED_IP_RANGES`  | `192.168.0.0/16,127.0.0.1,::1` | CIDR blocks or single addresses. Empty disables the check. Note Docker's default bridge is `172.17.0.0/16` and is _not_ covered by `192.168.0.0/16`. |

### Production only

| Variable        | Default | Notes                                                                                           |
| --------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `HTTP_PORT`     | `80`    | Where nginx listens. 80 makes the address a bare `http://<server>` with no port to mistype.     |
| `PUBLIC_ORIGIN` | empty   | e.g. `http://chat.university.local`. Only needed for browsers too old to send `Sec-Fetch-Site`. |

### Attachments

| Variable               | Default     | Notes                                                      |
| ---------------------- | ----------- | ---------------------------------------------------------- |
| `S3_BUCKET`            | —           | **Required.** Must exist and must stay private.            |
| `S3_REGION`            | `us-east-1` |                                                            |
| `S3_ACCESS_KEY_ID`     | —           | **Required**                                               |
| `S3_SECRET_ACCESS_KEY` | —           | **Required**                                               |
| `S3_ENDPOINT`          | empty       | Empty for AWS. Otherwise a URL the browser can also reach. |
| `S3_URL_TTL`           | `300`       | Seconds a download link stays valid                        |

The credentials use `:?` in `compose.prod.yml` rather than a default: an API that
started without them would accept uploads and lose them, one at a time, with a
log line nobody reads. Better to refuse to come up.

### Analytics — optional

Nothing in `apps/` reads any of these. The platform runs identically without
them.

| Variable                  | Default       | Notes                                                                                                                                                                              |
| ------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METABASE_PORT`           | `8080`        |                                                                                                                                                                                    |
| `METABASE_DB`             | `metabase`    | Metabase's own database, created by `metabase-init`                                                                                                                                |
| `METABASE_RO_USER`        | `metabase_ro` |                                                                                                                                                                                    |
| `METABASE_RO_PASSWORD`    | —             | `openssl rand -base64 24`. Changing it and bringing the stack up again rotates it.                                                                                                 |
| `METABASE_ENCRYPTION_KEY` | —             | `openssl rand -base64 32`. Generate **once** and keep it — see §16.                                                                                                                |
| `METABASE_JAVA_OPTS`      | `-Xmx1g`      | A JVM sizes its heap from the _host's_ memory unless told otherwise, which is how a reporting tool ends up holding a quarter of a server it is only occasionally asked a question. |

---

## 14. Testing

One suite, end to end. There is no unit layer: every rule this platform enforces
— a policy check, an argon2id hash, a signed URL, a Persian numeral — is worth
asserting against the running system rather than against a function called in
isolation, and a browser driving the real API over the real database is the only
place where all of them are true at once.

### End-to-end — Playwright

**72 tests across 8 specs**, in a real Chromium.

```bash
bun run db:up          # Postgres must be running
bun run test:s3:up     # A bucket, for the attachment specs
bun run test:e2e
bun run test:s3:down
```

| Spec                     | Tests | Covers                                                             |
| ------------------------ | ----- | ------------------------------------------------------------------ |
| `auth.spec.ts`           | 16    | Register, login by both identifiers, refresh, logout, cookie flags |
| `access-control.spec.ts` | 11    | Every policy rule, from the browser                                |
| `messaging.spec.ts`      | 8     | Send, reply, delete, pin, realtime across two contexts             |
| `chats.spec.ts`          | 9     | Creation, direct deduplication, member management                  |
| `attachments.spec.ts`    | 8     | Real uploads to MinIO, signed downloads, rejections                |
| `device.spec.ts`         | 7     | One-device eviction, `DEVICE_MISMATCH`, socket closure             |
| `receipts.spec.ts`       | 6     | Delivered/read transitions, unread badges                          |
| `rtl.spec.ts`            | 7     | `dir="rtl"`, Persian digits, the font actually loading             |

The suite provisions almost everything itself: it creates its own `chatbox_e2e`
database, runs migrations into it, and starts both servers on ports 3100 and 3101
so it never collides with a development session. The only two things it cannot
provide are Postgres and the bucket.

Point it at a different bucket with `E2E_S3_BUCKET`, `E2E_S3_ENDPOINT`,
`E2E_S3_ACCESS_KEY_ID`, `E2E_S3_SECRET_ACCESS_KEY`.

Traces and screenshots are recorded on failure only, and land in
`e2e/.artifacts/`.

---

## 15. Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — on every pull request
(opened, pushed to, reopened) and on every push to `main`.

Pull requests rather than every branch push, deliberately: a branch you are still
rebasing does not need a runner, and once it becomes a pull request every
subsequent push is covered anyway.

`concurrency: cancel-in-progress` — pushing a fix cancels the run for the commit
it replaces rather than queueing behind it. The older result is about code that no
longer exists.

Three **parallel** jobs, so a pull request gets three independent verdicts. A type
error and a failing test are different problems, and finding both in one run is
faster than finding the second one tomorrow.

| Job            | Steps                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint**       | `bun run lint` + `bun run lint:e2e`                                                                                                                |
| **Typecheck**  | `bun run typecheck` + `bun run typecheck:e2e`                                                                                                      |
| **End-to-end** | Postgres service container, a MinIO step, Chromium with `--with-deps`, then `bun run test:e2e`. The report is uploaded on failure and kept 7 days. |

The e2e job starts MinIO as a **step** rather than a `services:` entry because
that image needs a command — `minio server /data` — and a service container can
only set `options`, never the command. The directory made first _is_ the bucket:
MinIO reads the top level of its data directory as the bucket list, which saves
pulling a second image just to run `mc mb`.

The shared setup lives in
[`.github/actions/setup/action.yml`](../.github/actions/setup/action.yml) —
written once because three jobs need the same five steps and GitHub Actions has no
YAML anchors to share them with. It:

- installs Bun with **no version pinned**, so `setup-bun` reads `packageManager`
  from `package.json` and the runner installs exactly the Bun this repository
  declares;
- restores `~/.bun/install/cache`, keyed on `bun.lock` with a prefix fallback —
  a lockfile change invalidates the key but most packages in it are the same
  ones, so a stale cache is worth far more than none;
- runs `bun install --frozen-lockfile`, so a run that quietly resolved a
  different tree fails instead of testing something nobody has;
- writes `.env` **from `.env.example`**, substituting two freshly generated JWT
  secrets — which means the example file is exercised on every pull request;
- generates the Prisma client, which is a build product and is not committed.

---

## 16. Analytics with Metabase

Optional, and genuinely optional: nothing in `apps/` knows the container exists,
and the platform serves every request identically with it stopped.

```bash
bun run analytics:up
# Wait about 25 seconds — it migrates its own database on first boot
open http://localhost:8080
```

Create the Metabase administrator account. Then, when the wizard asks for a
database to analyse, **do not give it `POSTGRES_USER`.** Give it:

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Type     | PostgreSQL                                          |
| Host     | `db` (or `localhost` if Metabase is not in compose) |
| Port     | `5432`                                              |
| Database | `chatbox`                                           |
| Username | `metabase_ro`                                       |
| Password | `METABASE_RO_PASSWORD` from `.env`                  |

### What that role can and cannot do

[`infra/metabase/init.sql`](../infra/metabase/init.sql) is an idempotent script
run against the `postgres` maintenance database on every `up`. It creates
Metabase's own database, creates (or rotates the password of) the `metabase_ro`
login role, grants CONNECT, USAGE and SELECT plus `ALTER DEFAULT PRIVILEGES` for
future tables — and then **narrows two tables with column-level grants**:

| Table      | Withheld                                     |
| ---------- | -------------------------------------------- |
| `users`    | `password_hash`, `phone_number`, `device_id` |
| `messages` | `content`                                    |

The role can read the schema, count rows, group, join and chart. It cannot read a
single message body, a password hash, a phone number, or a device fingerprint. It
has no INSERT, UPDATE or DELETE anywhere.

This matters because Metabase runs whatever SQL its users type. Which account it
types it _as_ is what decides what a compromised dashboard login is worth.

**Verified behaviour:** the restricted columns do not even appear in
`information_schema.columns` for that role.

### The `SELECT *` gotcha

Because of the column-level grants, **`SELECT * FROM users` fails with
"permission denied"** — the star expands to every column including the revoked
ones. Name the columns you want:

```sql
-- Fails
SELECT * FROM users;

-- Works
SELECT id, university_id, name, role, is_active, last_seen, created_at
FROM users;

-- Works
SELECT id, sender_id, chat_id, is_pinned, is_deleted, created_at
FROM messages;
```

Metabase's own query builder (the point-and-click one) always names columns
explicitly, so it is unaffected. This only bites in the native SQL editor.

> If you would rather have `SELECT *` work, the alternative is a pair of
> read-only views (`users_public`, `messages_public`) exposing only the permitted
> columns, with the role granted SELECT on the views instead of the tables. Say
> the word and I will add them to `init.sql`.

### Notes

- Metabase's application database is **Postgres, not the default embedded H2**.
  Metabase's own documentation warns against H2 for anything but a trial: it is
  one file, it corrupts under concurrent access, and it takes every saved
  dashboard with it when it does.
- `MB_ENCRYPTION_SECRET_KEY` encrypts the credentials Metabase saves for every
  database it connects to. **Generate it once and keep it.** Changing it does not
  lock anyone out of Metabase — it makes those saved connections unreadable, and
  every one of them has to be entered again. Back it up with the JWT secrets.
- In production Metabase has **no published port**. It is reached through nginx
  on `:8080` — a port of its own rather than a path under `:80`, because Metabase
  cannot be served from a URL subpath. Same allow list, same front door.
- Data sources are configured in the UI only. There is no file in this repository
  that provisions them.

---

## 17. Production deployment — the full runbook

One command brings up seven services. First read the checklist below; the command
will not run without it.

### Prerequisites

- A Linux server on the campus network with a **fixed** address in
  `192.168.0.0/16`
- Docker and the Compose plugin
- Port 80 free (and 8080 if you want analytics)
- An S3 bucket, private, with credentials

### Step 1 — Real secrets

Everything in `.env.example` is a placeholder. The two JWT values in particular
are not a starting point; they are a public value in a public file.

```bash
cp .env.example .env

# Generate four secrets. Write them into .env, replacing the placeholders.
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET  (must differ from the above)
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # METABASE_RO_PASSWORD
openssl rand -base64 32   # METABASE_ENCRYPTION_KEY
```

`compose.prod.yml` uses `${VAR:?message}` for every one of these, so it fails
immediately and by name if any is missing — rather than starting a platform whose
tokens anyone can forge.

### Step 2 — The bucket

```dotenv
S3_BUCKET=chatbox-attachments
S3_REGION=…
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_ENDPOINT=…            # empty for AWS; otherwise a URL the browser can reach
S3_URL_TTL=300
```

The bucket must exist and must stay private. The API never makes it public; it
hands each browser a signed URL that expires, which only works if anonymous reads
are refused.

### Step 3 — Cookies and origin

```dotenv
COOKIE_SECURE=false      # true ONLY if you terminate TLS
HTTP_PORT=80
PUBLIC_ORIGIN=           # e.g. http://chat.university.local, if you need it
```

`COOKIE_SECURE=true` without TLS is the single most common way to make a
deployment look broken: login succeeds, and the very next request is
unauthenticated, because the browser accepted a `Secure` cookie it will never send
back over plain HTTP.

### Step 4 — The allow list

Check that `infra/nginx/conf.d/app.conf` matches the campus network. It ships
with:

```nginx
allow 192.168.0.0/16;
allow 127.0.0.1;
deny  all;
```

If the university uses `10.x.x.x`, change it here. This is the front door;
`ALLOWED_IP_RANGES` inside the API is the second lock and stays at the compose
subnet.

### Step 5 — Bring it up

```bash
bun run prod:up      # docker compose -f compose.prod.yml up -d --build
bun run prod:ps
bun run prod:logs
```

What happens, in order:

1. **`db`** starts and becomes healthy.
2. **`migrate`** runs `prisma migrate deploy` and exits. `deploy`, never
   `migrate dev` — `dev` would compare the schema to the database and offer to
   invent a new migration, which on a production database is a prompt nobody is
   there to answer. `api` waits for the exit to be a _success_, so there is no
   window in which the application serves requests against a schema it was not
   built for.
3. **`metabase-init`** runs its grants — after `migrate`, not merely after `db`,
   because the column-level grants name columns of `users` and `messages` and
   those tables have to exist first. On a first deployment the two run back to
   back, and that ordering is the whole difference between analytics that can
   read a message body and analytics that cannot.
4. **`api`**, **`web`** and **`metabase`** start.
5. **`nginx`** starts and publishes 80 and 8080. It is the only service that
   publishes anything.

### Step 6 — Create the first accounts

The seed refuses to run under `NODE_ENV=production`, which is intentional — a
production database should not contain an account whose password is written in a
public repository.

Register the first administrator through the interface at `http://<server>/register`,
then promote them:

```bash
docker compose -f compose.prod.yml exec db \
  psql -U chatbox -d chatbox \
  -c "UPDATE users SET role='ADMIN' WHERE university_id='<their-id>';"
```

From then on, professors can be promoted the same way, and professors create
course groups from the interface.

### Step 7 — Verify

```bash
# From a machine on the campus LAN
curl -i http://<server>/api/health          # 200
curl -i http://<server>/                    # 200, the Persian interface

# From anywhere else
curl -i http://<server>/                    # 403
```

Then, in a browser on the LAN: register, sign in, send a message, open a second
browser profile, watch it arrive. In DevTools → Network → WS, the socket should
show status **101** — if it is stuck on `transport=polling`, the WebSocket upgrade
is not getting through nginx.

Leave the page idle for a minute. The socket must survive; that is the
`idleTimeout: 30` check.

---

## 18. Operating the deployment

### Backups

The database volume is the only state the deployment holds. Attachments used to be
the other one; they are in a bucket now, which is somewhere else entirely and is
not this deployment's to back up.

```bash
docker compose -f compose.prod.yml exec -T db \
  pg_dump -U chatbox chatbox | gzip > "chatbox-$(date +%F).sql.gz"
```

Restore:

```bash
gunzip -c chatbox-2026-08-17.sql.gz | \
  docker compose -f compose.prod.yml exec -T db psql -U chatbox -d chatbox
```

Back up `.env` too — separately, and not into the repository. The JWT secrets and
`METABASE_ENCRYPTION_KEY` are not recoverable from anything else.

### Deploying an update

```bash
git pull
bun run prod:up      # rebuilds the images; `migrate` reruns and applies anything new
```

### Rotating the JWT secrets

Change them in `.env` and `bun run prod:up`. **Every session ends immediately** —
every existing token fails its signature check. Everyone signs in again. Do it if
you suspect a leak; expect the support calls.

### Rotating the analytics password

Change `METABASE_RO_PASSWORD` and bring the stack up again — `init.sql` runs
`ALTER ROLE … PASSWORD` on every start. Then update the saved connection inside
Metabase's own UI.

### Logs

```bash
bun run prod:logs                                          # everything
docker compose -f compose.prod.yml logs -f api             # one service
docker compose -f compose.prod.yml logs --since 1h nginx
```

### Signing someone out of every device

```sql
UPDATE users SET device_id = NULL WHERE university_id = '…';
```

Their next request fails the device check and they sign in again.

### Deactivating an account

```sql
UPDATE users SET is_active = false WHERE university_id = '…';
```

`requireAuth` rejects it on the next request. Their messages stay where they are.

---

## 19. Troubleshooting

| Symptom                                             | Cause and fix                                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Login succeeds, then everything is 401**          | `COOKIE_SECURE=true` on a plain-HTTP deployment. The browser accepted a `Secure` cookie it will never send back. Set it to `false`.                                                                 |
| **`The API refuses to start`, mentioning secrets**  | `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are equal, or shorter than 32 characters.                                                                                                              |
| **403 from a machine that should be allowed**       | The address is outside `192.168.0.0/16`. Fix `infra/nginx/conf.d/app.conf`. Note Docker's default bridge is `172.17.0.0/16` and is _not_ inside `192.168.0.0/16`.                                   |
| **Messages need a refresh to appear**               | The WebSocket is not connected. DevTools → Network → WS: status must be **101**. If it is stuck on `transport=polling`, nginx is not forwarding `Upgrade`/`Connection`.                             |
| **The socket drops every ten seconds**              | `idleTimeout` is missing from the Bun serve object. It must be ≥ 30.                                                                                                                                |
| **`ECONNREFUSED` on any `db:` command**             | The Postgres container is not running. `bun run db:up`. The named volume survives — no data is lost.                                                                                                |
| **`Cannot find module '…/generated/prisma/…'`**     | `bun run db:generate`. The client is a build product and is not committed.                                                                                                                          |
| **`permission denied for table users` in Metabase** | You wrote `SELECT *`. Name the columns — see §16.                                                                                                                                                   |
| **Metabase is unhealthy for the first minute**      | Expected. It migrates its own database on first boot; `start_period` is 90 s for this reason.                                                                                                       |
| **Attachment downloads 403 from the bucket**        | `S3_ENDPOINT` is a hostname the browser cannot resolve, or the signature expired. The SigV4 signature covers the host, so the endpoint must be reachable from the _browser_, not only from the API. |
| **The font is wrong / text renders in Arial**       | The `.woff2` was not committed, or was committed under its upstream name. `Vazirmatn[wght].woff2` parses as a Next dynamic-route segment and must be renamed.                                       |
| **Uploads fail at exactly 10 MB**                   | Working as designed — `UPLOAD.maxFileBytes`.                                                                                                                                                        |
| **`no output files found for task api#build`**      | A harmless Turbo warning. The API's `build` is `tsc --noEmit`; bundling buys nothing on Bun and walks into a Prisma WASM resolution bug.                                                            |

---

## 20. How it was built — the twelve milestones

Each milestone ended at a state that could be verified before the next began.

| #       | Milestone                                                                 | Commit    |
| ------- | ------------------------------------------------------------------------- | --------- |
| **M1**  | Postgres in Docker, the full Prisma schema, a working client              | `a50543c` |
| **M2**  | `@repo/shared` contracts, Zod-validated env, the Persian error envelope   | `f6ef01b` |
| **M3**  | `AuthService` — register, login, refresh, logout, me — and the first seed | `cb257d4` |
| **M4**  | The web foundation: RTL, Vazirmatn, Tailwind v4, shadcn, providers        | `a4871ed` |
| **M5**  | Auth UI and route protection via `proxy.ts`                               | `d91ab4d` |
| **M6**  | `ChatService` and the chat list                                           | `38abff9` |
| **M7**  | `MessageService` and cursor-paginated history — REST only, deliberately   | `c5193ff` |
| **M8**  | The Socket.IO gateway: rooms, presence, realtime                          | `61a4e30` |
| **M9**  | Read receipts and unread counts                                           | `608796f` |
| **M10** | Attachments                                                               | `abf0a42` |
| **M11** | Roles and access control, consolidated into `policy.ts`                   | `98fb2b8` |
| **M12** | Full Compose and nginx with the IP allow list                             | `2ed0405` |

M7 ends with a deliberate demonstration: send a message in one tab, open a second,
and confirm it does **not** appear without a refresh. That gap is exactly what M8
closes.

### After the twelve

| Work                                                          | Commit    |
| ------------------------------------------------------------- | --------- |
| The Vitest suite                                              | `df47a3d` |
| The Playwright suite                                          | `58dff1a` |
| GitHub Actions CI                                             | `e5061df` |
| Route-type generation before typecheck                        | `8ab4a8d` |
| **Device-bound sessions and login by phone number**           | `fae4590` |
| **Attachments moved from the API's disk to an S3 bucket**     | `e5513e2` |
| **Metabase, reading through a role that cannot see messages** | `2b9aa95` |
| **The extended seed — chats, messages, receipts**             | `21fd815` |

The last four are structural changes made after the original twelve, in response
to a revised ERD and UML.

---

## 21. Known limitations and what is deliberately not here

**Stated plainly, because a defence is worth more when its edges are named.**

| Limitation                                                          | Why                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A stolen refresh token cannot be revoked before it expires**      | Sessions are stateless. Device binding narrows the window sharply — a login anywhere else invalidates it — but it is not the guarantee a `sessions` table would give. Adding one is an ERD change, which is why it was a deliberate decision rather than a default. |
| **The device fingerprint is not a hardware identity**               | The web platform cannot read a MAC address. It is a random value in `localStorage` with a traits prefix. Clearing site data ends the session; copying `localStorage` to a similar machine would carry it. It is a _label_, not a secret.                            |
| **Attachments leave the campus network**                            | Documented in §10 and in `.env.example`. Point `S3_ENDPOINT` at a store on the university's own network to close this.                                                                                                                                              |
| **Message edit history is not kept**                                | `is_edited` is a flag, not a log.                                                                                                                                                                                                                                   |
| **No message search**                                               | Not in the brief. `messages.content` is unindexed for text.                                                                                                                                                                                                         |
| **No push notifications, typing indicators, or voice/video**        | Not in the brief.                                                                                                                                                                                                                                                   |
| **No rate limiting on login**                                       | `RATE_LIMITED` exists in the error codes; nothing emits it yet. On an intranet with named accounts the threat model is different, but this is a real gap.                                                                                                           |
| **The submitted ERD still lacks `is_pinned` and `last_message_at`** | Both are implemented and documented in §5. The diagram in the report needs updating to match.                                                                                                                                                                       |
| **Metabase data sources are configured by hand**                    | Nothing in the repository provisions them. The credentials to type are in §16.                                                                                                                                                                                      |
| **`SELECT *` fails in Metabase's SQL editor**                       | A direct consequence of the column-level grants — see §16. Views would fix it if you want them.                                                                                                                                                                     |

---

## Where to look next

| Question                                     | File                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| What are the exact access rules?             | [`packages/shared/src/policy.ts`](../packages/shared/src/policy.ts)                   |
| What does a request body have to look like?  | [`packages/shared/src/schemas/`](../packages/shared/src/schemas/)                     |
| What can the client receive over the socket? | [`packages/shared/src/types/socket.ts`](../packages/shared/src/types/socket.ts)       |
| What columns exist?                          | [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma) |
| What is in the demo data?                    | [`packages/database/prisma/seed.ts`](../packages/database/prisma/seed.ts)             |
| How is the API wired together?               | [`apps/api/src/app.ts`](../apps/api/src/app.ts)                                       |
| How does the socket authenticate?            | [`apps/api/src/socket/gateway.ts`](../apps/api/src/socket/gateway.ts)                 |
| What does production actually run?           | [`compose.prod.yml`](../compose.prod.yml)                                             |
| Who is allowed in?                           | [`infra/nginx/conf.d/app.conf`](../infra/nginx/conf.d/app.conf)                       |
| What can analytics read?                     | [`infra/metabase/init.sql`](../infra/metabase/init.sql)                               |
