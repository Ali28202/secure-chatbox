import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every value the end-to-end suite needs in order to stand up its own copy of
 * the platform, derived in one place.
 *
 * The suite runs the *real* API and the *real* Next server against a *real*
 * Postgres — that is the whole point of it — but it must never run them against
 * the ones you are developing with. So everything here is deliberately beside
 * the development setup rather than on top of it: different ports, a different
 * database on the same container, a different upload directory. You can leave
 * `bun run dev` running and start the suite in another terminal.
 */

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * `.env` read by hand rather than through dotenv.
 *
 * dotenv is a dependency of `@repo/database`, not of the root, and Bun's
 * isolated linker means a root file cannot import it. Reading the file is a
 * dozen lines and lets us be explicit about what we take from it: the two JWT
 * secrets and the Postgres connection, and nothing else.
 */
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

/** A real process environment variable wins over the file, as dotenv would. */
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

// --- Ports -------------------------------------------------------------------

/**
 * `3100`/`3101` rather than `3000`/`3001`.
 *
 * A suite that killed your dev server, or silently talked to it, would be worse
 * than no suite: the failures it reported would depend on what you happened to
 * have running. These are one digit away so the pairing stays obvious, and far
 * enough away to never collide.
 */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

/**
 * Readiness probe for the API server.
 *
 * `/api/health` deliberately, not `/api/health/db`: it touches no database at
 * all. Prisma connects lazily, so the API answers this the moment it is
 * listening — which keeps "is the server up" and "is the schema migrated" as
 * two separate questions with two separate error messages.
 */
export const API_HEALTH_URL = `${API_URL}/api/health`;

// --- Database ----------------------------------------------------------------

export const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'chatbox_e2e';

/** Interpolated into `CREATE DATABASE`, which cannot take a bind parameter. */
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(E2E_DB_NAME)) {
  throw new Error(`E2E_DB_NAME must be a plain SQL identifier, got ${JSON.stringify(E2E_DB_NAME)}`);
}

function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

const DEV_DATABASE_URL = required('DATABASE_URL');

/** The suite's own database, on the same container the development one lives in. */
export const E2E_DATABASE_URL = withDatabase(DEV_DATABASE_URL, E2E_DB_NAME);

/**
 * `postgres`, the always-present maintenance database.
 *
 * You cannot create a database from inside itself, so the very first connection
 * of a fresh checkout has to land somewhere else.
 */
export const MAINTENANCE_DATABASE_URL = withDatabase(DEV_DATABASE_URL, 'postgres');

// --- Artifacts ---------------------------------------------------------------

/** Gitignored. Reports, traces — everything the suite writes to disk. */
export const ARTIFACT_DIR = join(ROOT_DIR, 'e2e/.artifacts');

/**
 * Where the argon2id hash of `E2E_PASSWORD` is cached between the global setup
 * and the test workers, which are separate processes.
 */
export const PASSWORD_HASH_FILE = join(ARTIFACT_DIR, 'password-hash.txt');

/**
 * The password every account the suite creates is given.
 *
 * One password for all of them so a single argon2id hash can be computed once
 * in the global setup and reused by every `INSERT`. Hashing is deliberately
 * expensive — a suite that hashed per user would spend most of its time doing
 * it.
 */
export const E2E_PASSWORD = 'E2ePass@1404';

// --- The object store --------------------------------------------------------

/**
 * The bucket the suite's attachments go to.
 *
 * This suite really uploads files, so it really needs somewhere to put them —
 * and the platform itself runs no object store, by design. So a store has to
 * come from outside the application, exactly as it does in production, and the
 * suite is told where it is rather than starting one.
 *
 * The defaults describe a throwaway MinIO on the loopback: `bun run test:s3:up`
 * starts one, the CI workflow starts the same image as a step, and `global-setup`
 * fails with instructions if neither has happened. Override any of these to run
 * the suite against a real bucket instead — the API cannot tell the difference,
 * which is the point of it being configuration.
 *
 * Never point these at a bucket with anything in it. The suite empties what it
 * finds between runs.
 */
export const E2E_S3_BUCKET = process.env.E2E_S3_BUCKET ?? 'chatbox-e2e';
export const E2E_S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const E2E_S3_ACCESS_KEY_ID = process.env.E2E_S3_ACCESS_KEY_ID ?? 'minioadmin';
const E2E_S3_SECRET_ACCESS_KEY = process.env.E2E_S3_SECRET_ACCESS_KEY ?? 'minioadmin';

/** The same five values the API takes, in the shape a `Bun.S3Client` wants. */
export function s3ClientConfig(): Record<string, string> {
  return {
    accessKeyId: E2E_S3_ACCESS_KEY_ID,
    secretAccessKey: E2E_S3_SECRET_ACCESS_KEY,
    bucket: E2E_S3_BUCKET,
    endpoint: E2E_S3_ENDPOINT,
    region: 'us-east-1',
  };
}

// --- The API server's environment -------------------------------------------

/**
 * What `apps/api` is started with.
 *
 * Passed as an explicit block, and the server is started *without*
 * `--env-file=../../.env` — the development file sets `API_PORT`, the `S3_*`
 * block and `DATABASE_URL`, and `Bun`'s `--env-file` would load them over the
 * top of these. Nothing here is a secret except the two JWT secrets, which are read
 * from the developer's `.env` rather than invented so that the suite exercises
 * the same configuration path a real deployment does.
 */
export function apiServerEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    API_PORT: String(API_PORT),
    DATABASE_URL: E2E_DATABASE_URL,

    JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
    ACCESS_TOKEN_TTL: fromEnv('ACCESS_TOKEN_TTL') ?? '900',
    REFRESH_TOKEN_TTL: fromEnv('REFRESH_TOKEN_TTL') ?? '604800',

    // The suite speaks plain HTTP to localhost. A `Secure` cookie there is one
    // the browser accepts and then never sends back, which would look exactly
    // like a broken login.
    COOKIE_SECURE: 'false',

    // Its own bucket, never the developer's. The download tests then exercise
    // the real path: signed URL, expiry, and a store that refuses anonymous
    // reads.
    S3_BUCKET: E2E_S3_BUCKET,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: E2E_S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: E2E_S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: E2E_S3_ENDPOINT,
    // Long enough that a slow CI machine does not lose a link between the
    // redirect and the fetch, short enough that the expiry test does not have
    // to wait around for it.
    S3_URL_TTL: '120',

    // The only origin the browser will be on.
    CORS_ORIGINS: WEB_URL,

    // Left at the loopback entries so `ipRestrictionMiddleware` is genuinely in
    // the request path — every request the suite makes has to pass it. Setting
    // this to an empty string would disable the check entirely and quietly
    // remove a security control from everything the suite claims to cover.
    ALLOWED_IP_RANGES: '127.0.0.1,::1',
  };
}
