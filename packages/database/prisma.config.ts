import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Load the monorepo-root .env by absolute path. Prisma CLI commands get invoked
// from several different working directories (this package, the repo root, a
// turbo task), and relying on cwd discovery makes them behave differently
// depending on where you happen to be standing.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun run prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
