import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Unit tests for the whole monorepo, from one config.
 *
 * **Run it with `bun run --bun vitest`, which is what `bun run test` does.**
 * Vitest's own binary has a `#!/usr/bin/env node` shebang, so a bare `vitest`
 * runs the suite on Node — and on Node this codebase is only half testable:
 * `Bun.password` (argon2id, in `lib/password.ts`), `Bun.write` and
 * `Bun.randomUUIDv7` (in `lib/storage.ts`) simply are not there. Under `--bun`
 * the tests execute in the same runtime as production, which means the argon2id
 * hashes and the magic-byte checks below are the real ones rather than stand-ins.
 *
 * One root config with three projects rather than a config per workspace,
 * because Bun's isolated linker gives each workspace its own `node_modules` with
 * no hoisting: three configs would mean three copies of the same aliases, kept
 * in step by hand. The projects still isolate what matters — each has its own
 * root, so a test only sees its own package's files, and the `api` project gets
 * the environment variables `src/env.ts` refuses to start without.
 */

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Resolved explicitly rather than left to the linker.
 *
 * `@repo/shared` is a `workspace:*` dependency of both apps, but Vite resolves
 * from its own project root, and pointing it straight at the source is also what
 * keeps the tests honest: they exercise the TypeScript that ships, not a build
 * artifact that may be stale.
 */
const repoAlias = {
  '@repo/shared': join(root, 'packages/shared/src/index.ts'),
};

/** Never `.next` — a production build contains thousands of files named like tests. */
const exclude = [...configDefaults.exclude, '**/.next/**', '**/generated/**', '**/e2e/**'];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: repoAlias },
        test: {
          name: 'shared',
          root: join(root, 'packages/shared'),
          environment: 'node',
          exclude,
        },
      },
      {
        resolve: { alias: repoAlias },
        test: {
          name: 'api',
          root: join(root, 'apps/api'),
          environment: 'node',
          exclude,
          /**
           * `src/env.ts` parses `process.env` at import and calls
           * `process.exit(1)` when it does not like what it finds — so anything
           * importing it transitively (jwt, storage, errors) would take the
           * whole worker down without these. Set here rather than in a `.env`
           * so the suite cannot pick up a developer's real secrets, and so the
           * token tests have known values to assert against.
           */
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://vitest:vitest@127.0.0.1:5432/vitest?schema=public',
            // Distinct, and both over the 32-character floor `env.ts` enforces.
            JWT_ACCESS_SECRET: 'vitest-access-secret-0123456789abcdef',
            JWT_REFRESH_SECRET: 'vitest-refresh-secret-0123456789abcdef',
            ACCESS_TOKEN_TTL: '900',
            REFRESH_TOKEN_TTL: '604800',
            COOKIE_SECURE: 'false',
            CORS_ORIGINS: 'http://localhost:3000',
            ALLOWED_IP_RANGES: '192.168.0.0/16,127.0.0.1,::1',
            // `lib/s3.ts` builds its client at import, so these have to exist
            // before the module loads. Nothing here reaches a bucket — the
            // storage suite mocks that file out — but the values still have to
            // parse, or `env.ts` exits the worker.
            S3_BUCKET: 'vitest-bucket',
            S3_REGION: 'us-east-1',
            S3_ACCESS_KEY_ID: 'vitest',
            S3_SECRET_ACCESS_KEY: 'vitest',
            S3_ENDPOINT: '',
            S3_URL_TTL: '300',
          },
        },
      },
      {
        resolve: {
          alias: {
            ...repoAlias,
            // Mirrors the `@/*` path in apps/web/tsconfig.json.
            '@': join(root, 'apps/web'),
          },
        },
        test: {
          name: 'web',
          root: join(root, 'apps/web'),
          // `node`, not `jsdom`: what is unit-tested here is the pure logic
          // behind the screens — titles, previews, error mapping. The rendering
          // is covered by the Playwright suite against a real browser, which is
          // a truer test of an RTL Persian interface than jsdom can give.
          environment: 'node',
          exclude,
          env: {
            // `lib/api.ts` reads this at import. Empty is the production shape
            // (same-origin behind nginx) and would make the assertions depend on
            // a default; a fixed value keeps them explicit.
            NEXT_PUBLIC_API_URL: 'http://localhost:3001',
          },
        },
      },
    ],
  },
});
