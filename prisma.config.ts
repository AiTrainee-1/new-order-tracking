import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// This installed Prisma version's config datasource only takes `url` (used
// by the CLI - migrate/studio/db push) and `shadowDatabaseUrl`; there is no
// separate `directUrl` slot here. The app's own runtime connection (which
// may point at a PgBouncer pool in production) is constructed independently
// in src/lib/server/prisma.ts. For migrations against a pooled connection
// string, run CLI commands with DATABASE_URL temporarily set to the direct
// (non-pooled) Railway connection string instead.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
