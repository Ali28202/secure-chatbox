import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ChatRole, GlobalRole } from '@repo/shared';
import { Client } from 'pg';
import {
  E2E_DATABASE_URL,
  E2E_DB_NAME,
  E2E_PASSWORD,
  MAINTENANCE_DATABASE_URL,
  PASSWORD_HASH_FILE,
} from './env';

/**
 * Direct SQL against the suite's database.
 *
 * Deliberately not Prisma. `@repo/database` generates a client for the Bun
 * runtime, and Playwright runs on Node — but the better reason is that these
 * helpers exist to *arrange* a situation, and arranging it through the same
 * layer the application uses would mean a bug in that layer could make a test
 * pass. A professor account inserted by hand is a professor account regardless
 * of what the service layer believes.
 *
 * Everything the tests *assert* still goes through the real UI and the real
 * API. This is the setup door, and it is only ever opened before the test.
 */

async function withClient<T>(connectionString: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** A connection to the suite's own database. */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  return withClient(E2E_DATABASE_URL, fn);
}

/**
 * Creates `chatbox_e2e` if this machine has never run the suite before.
 *
 * Postgres has no `CREATE DATABASE IF NOT EXISTS`, so the existence check is a
 * separate query. The name is interpolated rather than bound because an
 * identifier cannot be a bind parameter — `env.ts` validates it as a plain
 * identifier for exactly this line.
 */
export async function ensureDatabase(): Promise<void> {
  await withClient(MAINTENANCE_DATABASE_URL, async (client) => {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      E2E_DB_NAME,
    ]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${E2E_DB_NAME}"`);
    }
  });
}

/**
 * Empties every application table, leaving the schema and Prisma's migration
 * history alone.
 *
 * Discovered from `pg_tables` rather than listed, so a future migration that
 * adds a table does not quietly leave rows behind for the next run to trip
 * over. `CASCADE` because the tables reference each other and there is no
 * ordering that satisfies all of them; `RESTART IDENTITY` is a formality here
 * since every key is a UUID.
 */
export async function resetDatabase(): Promise<void> {
  await withDb(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    );
    if (rows.length === 0) return;

    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  });
}

// --- Accounts ----------------------------------------------------------------

export interface Account {
  id: string;
  universityId: string;
  phoneNumber: string;
  name: string;
  password: string;
  role: GlobalRole;
}

let sequence = 0;

/**
 * Unique per account, and unique across parallel workers.
 *
 * The suite does not truncate between tests — that would make `fullyParallel`
 * unsafe — so isolation comes from every test working with people nobody else
 * has heard of. The worker's pid is in there because `Date.now()` has
 * millisecond resolution and four workers start within one.
 */
function uniqueTag(): string {
  sequence += 1;
  return `${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}${sequence.toString(36)}`;
}

/**
 * A mobile number that passes `phoneNumberSchema` and belongs to nobody else.
 *
 * `09` then nine digits, because the column is unique and the schema will not
 * accept any other shape — so the tag above cannot be reused here, base36 being
 * mostly letters. Four digits of pid and five of counter give every worker its
 * own block, which is all the isolation a single run needs.
 */
function uniquePhoneNumber(): string {
  sequence += 1;
  const worker = (process.pid % 10_000).toString().padStart(4, '0');
  return `09${worker}${(sequence % 100_000).toString().padStart(5, '0')}`;
}

/**
 * The argon2id hash of `E2E_PASSWORD`, computed once by the global setup.
 *
 * Read from disk rather than recomputed because hashing is intentionally slow,
 * and rather than passed through `process.env` because the file is one less
 * thing to be wrong about when a worker is restarted.
 */
let cachedHash: string | null = null;

function passwordHash(): string {
  if (cachedHash) return cachedHash;
  try {
    cachedHash = readFileSync(PASSWORD_HASH_FILE, 'utf8').trim();
  } catch {
    throw new Error(
      `Missing ${PASSWORD_HASH_FILE}. It is written by the Playwright global setup — ` +
        'run the suite through `bun run test:e2e` rather than invoking a spec directly.'
    );
  }
  return cachedHash;
}

/**
 * Inserts a user and hands back the credentials to sign in with.
 *
 * Registration through the API would only ever produce students — `registerSchema`
 * has no `role` field, on purpose — so professors and admins have to arrive this
 * way. Doing all three the same way keeps the fixtures symmetrical.
 */
export async function createAccount(
  role: GlobalRole,
  overrides: { name?: string; universityId?: string; phoneNumber?: string; isActive?: boolean } = {}
): Promise<Account> {
  const tag = uniqueTag();
  const prefix = role === 'STUDENT' ? '4' : '9';
  const universityId = overrides.universityId ?? `${prefix}${tag}`;
  const phoneNumber = overrides.phoneNumber ?? uniquePhoneNumber();
  const name = overrides.name ?? `${role === 'PROFESSOR' ? 'دکتر' : 'کاربر'} آزمون ${tag}`;
  const id = randomUUID();

  await withDb(async (client) => {
    await client.query(
      `INSERT INTO users (id, university_id, phone_number, password_hash, name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::"GlobalRole", $7, NOW(), NOW())`,
      [id, universityId, phoneNumber, passwordHash(), name, role, overrides.isActive ?? true]
    );
  });

  // `device_id` is deliberately left null: an account holds no device until
  // somebody signs in from one, and half these accounts never do.
  return { id, universityId, phoneNumber, name, password: E2E_PASSWORD, role };
}

// --- Reading back what the application did ------------------------------------

/** The membership row, for asserting on state the UI only hints at. */
export async function getMembership(
  chatId: string,
  userId: string
): Promise<{ role: ChatRole; isMuted: boolean } | null> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ role: ChatRole; is_muted: boolean }>(
      'SELECT role, is_muted FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    const row = rows[0];
    return row ? { role: row.role, isMuted: row.is_muted } : null;
  });
}

/** Attachment rows for a message, to prove the upload reached the database. */
export async function getAttachments(
  messageId: string
): Promise<{ fileName: string; fileType: string; fileUrl: string; fileSize: number }[]> {
  return withDb(async (client) => {
    const { rows } = await client.query<{
      file_name: string;
      file_type: string;
      file_url: string;
      file_size: number;
    }>('SELECT file_name, file_type, file_url, file_size FROM attachments WHERE message_id = $1', [
      messageId,
    ]);
    return rows.map((row) => ({
      fileName: row.file_name,
      fileType: row.file_type,
      fileUrl: row.file_url,
      fileSize: Number(row.file_size),
    }));
  });
}

/** How far a given reader has got, as the receipts table sees it. */
export async function getReceiptStatus(messageId: string, userId: string): Promise<string | null> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      'SELECT status FROM message_receipts WHERE message_id = $1 AND user_id = $2',
      [messageId, userId]
    );
    return rows[0]?.status ?? null;
  });
}

/**
 * The one device an account currently holds, or null before its first login.
 *
 * With stateless tokens this column *is* the session list: overwriting it is
 * what ends every session issued to the device it replaced. Reading it lets a
 * test assert the cause rather than only the symptom.
 */
export async function getBoundDevice(userId: string): Promise<string | null> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ device_id: string | null }>(
      'SELECT device_id FROM users WHERE id = $1',
      [userId]
    );
    return rows[0]?.device_id ?? null;
  });
}
