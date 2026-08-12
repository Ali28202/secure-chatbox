import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDatabase, resetDatabase } from './db';
import {
  ARTIFACT_DIR,
  E2E_DATABASE_URL,
  E2E_DB_NAME,
  E2E_PASSWORD,
  PASSWORD_HASH_FILE,
  ROOT_DIR,
  UPLOAD_DIR,
} from './env';

/**
 * Everything that has to be true before the first test, done once.
 *
 * Note the ordering Playwright imposes: web servers are plugins, and plugin
 * setup runs *before* this file. So the API is already listening by the time
 * the database is created here. That is fine, and it is why the readiness probe
 * is `/api/health` rather than `/api/health/db` — the API touches Postgres
 * lazily, on its first query, which is after this has finished.
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  // Uploads from the previous run are stale the moment the tables are
  // truncated: the rows that pointed at them are gone.
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });

  await createDatabase();
  migrate();
  await resetDatabase();
  writePasswordHash();
}

async function createDatabase(): Promise<void> {
  try {
    await ensureDatabase();
  } catch (error) {
    throw new Error(
      `Could not reach Postgres to create the "${E2E_DB_NAME}" database.\n` +
        'Start it first:  bun run db:up\n\n' +
        String(error)
    );
  }
}

/**
 * `migrate deploy`, not `migrate dev`.
 *
 * `deploy` applies the committed migrations and nothing else. `dev` would
 * compare the schema against the database and offer to generate a new
 * migration, which is a prompt in the middle of a test run at best and a
 * migration file nobody meant to write at worst.
 *
 * `DATABASE_URL` is passed in the child's environment on purpose: dotenv, which
 * `prisma.config.ts` uses to load the root `.env`, does not overwrite a
 * variable that is already set. Ours therefore wins, and the suite cannot
 * migrate the development database by accident.
 */
function migrate(): void {
  execFileSync('bun', ['run', 'db:deploy'], {
    cwd: join(ROOT_DIR, 'packages/database'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}

/**
 * One argon2id hash of the shared test password, cached for the workers.
 *
 * Produced by Bun because `Bun.password` is what the API verifies against, and
 * Playwright runs on Node where it does not exist. Hashing is deliberately slow
 * — a second or so — which is exactly why it happens once here instead of on
 * every `createAccount` call.
 */
function writePasswordHash(): void {
  const hash = execFileSync(
    'bun',
    ['-e', `process.stdout.write(await Bun.password.hash(${JSON.stringify(E2E_PASSWORD)}))`],
    { encoding: 'utf8' }
  ).trim();

  if (!hash.startsWith('$argon2id$')) {
    throw new Error(`Expected an argon2id hash from Bun, got: ${hash.slice(0, 40)}`);
  }

  writeFileSync(PASSWORD_HASH_FILE, hash, 'utf8');
}
