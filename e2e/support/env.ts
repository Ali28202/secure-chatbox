import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readDotenv(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Could not read ${path}.\n` +
        'The end-to-end suite reuses the development database credentials and JWT secrets.\n' +
        'Copy .env.example to .env first.'
    );
  }

  const values: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const rootEnv = readDotenv(join(ROOT_DIR, '.env'));

function fromEnv(name: string): string | undefined {
  return process.env[name] ?? rootEnv[name];
}

function required(name: string): string {
  const value = fromEnv(name);
  if (!value) {
    throw new Error(`${name} is not set in the environment or in the root .env file.`);
  }
  return value;
}

export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

export const API_HEALTH_URL = `${API_URL}/api/health`;

export const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'chatbox_e2e';

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(E2E_DB_NAME)) {
  throw new Error(`E2E_DB_NAME must be a plain SQL identifier, got ${JSON.stringify(E2E_DB_NAME)}`);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

const DEV_DATABASE_URL = required('DATABASE_URL');

export const E2E_DATABASE_URL = withDatabase(DEV_DATABASE_URL, E2E_DB_NAME);

export const MAINTENANCE_DATABASE_URL = withDatabase(DEV_DATABASE_URL, 'postgres');

export const ARTIFACT_DIR = join(ROOT_DIR, 'e2e/.artifacts');

export const PASSWORD_HASH_FILE = join(ARTIFACT_DIR, 'password-hash.txt');

export const E2E_PASSWORD = 'E2ePass@1404';

const E2E_S3_BUCKET = process.env.E2E_S3_BUCKET ?? 'chatbox-e2e';
const E2E_S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const E2E_S3_ACCESS_KEY_ID = process.env.E2E_S3_ACCESS_KEY_ID ?? 'minioadmin';
const E2E_S3_SECRET_ACCESS_KEY = process.env.E2E_S3_SECRET_ACCESS_KEY ?? 'minioadmin';

export function apiServerEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    API_PORT: String(API_PORT),
    DATABASE_URL: E2E_DATABASE_URL,

    JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
    ACCESS_TOKEN_TTL: fromEnv('ACCESS_TOKEN_TTL') ?? '900',
    REFRESH_TOKEN_TTL: fromEnv('REFRESH_TOKEN_TTL') ?? '604800',
    COOKIE_SECURE: 'false',
    S3_BUCKET: E2E_S3_BUCKET,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: E2E_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: E2E_S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: E2E_S3_ENDPOINT,
    S3_URL_TTL: '120',
    CORS_ORIGINS: WEB_URL,
    ALLOWED_IP_RANGES: '127.0.0.1,::1',
  };
}
