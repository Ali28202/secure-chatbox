import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDatabase, resetDatabase } from './db';
import {
  ARTIFACT_DIR,
  E2E_DATABASE_URL,
  E2E_DB_NAME,
  E2E_PASSWORD,
  PASSWORD_HASH_FILE,
  ROOT_DIR,
} from './env';

export default async function globalSetup(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

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

function migrate(): void {
  execFileSync('bun', ['run', 'db:deploy'], {
    cwd: join(ROOT_DIR, 'packages/database'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
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
