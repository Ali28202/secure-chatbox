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

async function withClient<T>(connectionString: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  return withClient(E2E_DATABASE_URL, fn);
}

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

export interface Account {
  id: string;
  universityId: string;
  phoneNumber: string;
  name: string;
  password: string;
  role: GlobalRole;
}

let sequence = 0;

function uniqueTag(): string {
  sequence += 1;
  return `${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}${sequence.toString(36)}`;
}

function uniquePhoneNumber(): string {
  sequence += 1;
  const worker = (process.pid % 10_000).toString().padStart(4, '0');
  return `09${worker}${(sequence % 100_000).toString().padStart(5, '0')}`;
}

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

export async function createAccount(
  role: GlobalRole,
  overrides: {
    name?: string;
    universityId?: string;
    phoneNumber?: string;
    isActive?: boolean;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  } = {}
): Promise<Account> {
  const tag = uniqueTag();
  const prefix = role === 'STUDENT' ? '4' : '9';
  const universityId = overrides.universityId ?? `${prefix}${tag}`;
  const phoneNumber = overrides.phoneNumber ?? uniquePhoneNumber();
  const name = overrides.name ?? `${role === 'PROFESSOR' ? 'دکتر' : 'کاربر'} آزمون ${tag}`;
  const id = randomUUID();

  await withDb(async (client) => {
    await client.query(
      // APPROVED unless a test asks otherwise: a fixture account exists to sign
      // in with, and the column's PENDING default would make every test fail at
      // the login step instead of testing what it meant to.
      `INSERT INTO users (id, university_id, phone_number, password_hash, name, role, is_active, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::"GlobalRole", $7, $8::"AccountStatus", NOW(), NOW())`,
      [
        id,
        universityId,
        phoneNumber,
        passwordHash(),
        name,
        role,
        overrides.isActive ?? true,
        overrides.status ?? 'APPROVED',
      ]
    );
  });

  return { id, universityId, phoneNumber, name, password: E2E_PASSWORD, role };
}

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

export async function getReceiptStatus(messageId: string, userId: string): Promise<string | null> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      'SELECT status FROM message_receipts WHERE message_id = $1 AND user_id = $2',
      [messageId, userId]
    );
    return rows[0]?.status ?? null;
  });
}

export async function getBoundDevice(userId: string): Promise<string | null> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ device_id: string | null }>(
      'SELECT device_id FROM users WHERE id = $1',
      [userId]
    );
    return rows[0]?.device_id ?? null;
  });
}
