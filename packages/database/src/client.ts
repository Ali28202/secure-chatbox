import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

// Prisma 7 removed the Rust query engine: a driver adapter is mandatory and
// `new PrismaClient()` with no adapter throws.
const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root, then start the database with `docker compose up -d db`.'
  );
}

const adapter = new PrismaPg({ connectionString });

// Reuse one client across dev reloads — otherwise every `--watch` restart opens
// a fresh connection pool and Postgres runs out of connections.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient({ adapter });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__prisma = prisma;
}
