import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Vercel runs each Route Handler/Server Action invocation in a serverless
 * function that may cold-start frequently, so the pool stays small per
 * instance. Point DATABASE_URL at a PgBouncer (or equivalent) pooler in
 * front of Railway Postgres in production - see README "Database" section -
 * so many small per-instance pools don't exhaust Postgres's own connection
 * limit under load.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
