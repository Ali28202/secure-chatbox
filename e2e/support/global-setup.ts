import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDatabase, resetDatabase } from './db';
import {
  ARTIFACT_DIR,
  E2E_DATABASE_URL,
  E2E_DB_NAME,
  E2E_PASSWORD,
  E2E_S3_BUCKET,
  E2E_S3_ENDPOINT,
  PASSWORD_HASH_FILE,
  ROOT_DIR,
  s3ClientConfig,
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

  await createDatabase();
  migrate();
  await resetDatabase();
  emptyBucket();
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
 * Proves the bucket is there, and leaves it empty.
 *
 * Objects from the previous run are stale the moment the tables are truncated:
 * the rows that named them are gone. Clearing them keeps a failure that leaves
 * a file behind from being invisible in the next run.
 *
 * Run through Bun for the same reason `writePasswordHash` is: `Bun.S3Client` is
 * a runtime built-in and Playwright is on Node. It also means the suite signs
 * with exactly the client the API signs with, rather than a second
 * implementation that might disagree about something subtle.
 *
 * The failure message matters more than the code here. Nothing in this
 * repository starts an object store — that is a deliberate property of the
 * platform — so a developer who has never needed one has no reason to guess
 * that the attachment specs want a bucket.
 */
function emptyBucket(): void {
  const script = `
    const client = new Bun.S3Client(${JSON.stringify(s3ClientConfig())});
    const { contents } = await client.list({ maxKeys: 1000 });
    for (const object of contents ?? []) await client.delete(object.key);
    // A write, not just a list: read-only credentials would pass everything
    // above and then fail on the first attachment, halfway through a spec.
    await client.write('.e2e-preflight', 'ok', { type: 'text/plain' });
    await client.delete('.e2e-preflight');
  `;

  try {
    execFileSync('bun', ['-e', script], { stdio: 'pipe' });
  } catch (error) {
    const detail = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error);

    throw new Error(
      `Could not use the "${E2E_S3_BUCKET}" bucket at ${E2E_S3_ENDPOINT}.\n\n` +
        'The attachment specs really upload files, so the suite needs a real\n' +
        'S3-compatible bucket. Nothing in this repository runs one — the platform\n' +
        'takes a bucket as configuration and so does this suite.\n\n' +
        'Start a throwaway one:  bun run test:s3:up\n' +
        '(and afterwards:        bun run test:s3:down)\n\n' +
        'Or point the suite at a bucket of your own, which must be empty:\n' +
        '  E2E_S3_ENDPOINT, E2E_S3_BUCKET, E2E_S3_ACCESS_KEY_ID, E2E_S3_SECRET_ACCESS_KEY\n\n' +
        detail
    );
  }
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
