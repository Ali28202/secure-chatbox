import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repo root, then start the database with `docker compose up -d db`.'
  );
}

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient({ adapter });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.__prisma = prisma;
}
