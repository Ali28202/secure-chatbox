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

function migrate(): void {
  execFileSync('bun', ['run', 'db:deploy'], {
    cwd: join(ROOT_DIR, 'packages/database'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}

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
