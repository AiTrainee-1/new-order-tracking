# Order Tracker - UK Textiles

Production order tracker for UK Textiles' garment business. An order (IO / style, with one or more POs and size breakdowns) is planned against a per-order sequence of production stages - material planning and inward, knitting, fabric process, cutting, embroidery, sewing, QC, packing, accessories and so on - and floor users record each day's input, output, rejections and hand-offs per stage. Admins and the MD see live progress, output, TNA (time-and-action) plans, tracking history and exportable reports (Excel / PDF / CSV).

## Roles

Every account has one role; `src/proxy.ts` sends each role to its own area after login and keeps it out of the others.

| Role | Area | What they do |
| --- | --- | --- |
| `admin` | `/admin/*` | Everything: dashboard, orders (create / edit), stage roles and assignments, grouping, output, accessories, TNA plans and assignment, tracking history, reports, users and account management. |
| `md` | `/md/*` | Managing director's read-mostly view: dashboard, orders, output, accessories, TNA and users. |
| `user` | `/user/*` | Floor / section users: home (their assigned work), data input for assigned stages, and - when the account has the permission - create order and job work. |

`/login` and `/share/output/[orderId]` (a public read-only output view) are the only routes reachable without a session.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19, TypeScript
- Tailwind CSS v4 (plus CSS modules for a few components)
- TanStack React Query for client data fetching (`src/hooks`)
- Prisma 7 with the `@prisma/adapter-pg` driver adapter, PostgreSQL on Railway
- Auth: bcrypt password hashes + an HS256 JWT session cookie (`jose`)
- Exports: `exceljs`, `jspdf` + `jspdf-autotable` (loaded on demand), charts via `recharts`

## Local setup

Requires Node.js 20+.

```bash
npm install          # also runs `prisma generate` (postinstall)
# create .env (see below)
npm run dev          # http://localhost:3000
```

Environment variables (`.env`, git-ignored):

| Variable | Required | Used by |
| --- | --- | --- |
| `DATABASE_URL` | yes | App runtime (`src/lib/server/prisma.ts`), Prisma CLI (`prisma.config.ts`) and the seed script |
| `JWT_SECRET` | yes | Signs session cookies (`src/lib/server/session.ts`). Use a long random string; changing it logs everyone out. |
| `DEFAULT_ADMIN_USERNAME` | no | Seed only - username of the admin it upserts (default `admin`) |
| `DEFAULT_ADMIN_PASSWORD` | no | Seed only - that admin's password (default `admin123`; always set it for a real database) |

## Scripts

| Script | Command | Notes |
| --- | --- | --- |
| `dev` | `next dev` | Dev server |
| `build` | `next build` | Production build |
| `start` | `next start` | Serve the production build |
| `lint` | `eslint` | |
| `postinstall` | `prisma generate` | Generates the client into `src/generated/prisma` (git-ignored) |
| `db:generate` | `prisma generate` | |
| `db:migrate` | `prisma migrate dev` | Creates / applies migrations - see Database |
| `db:deploy` | `prisma migrate deploy` | Applies pending migrations only |
| `db:seed` | `prisma db seed` | Runs `prisma/seed.ts` (stage catalog, plan template, admin user) |
| `db:studio` | `prisma studio` | |

## Database

PostgreSQL hosted on Railway. Schema in `prisma/schema.prisma`, migrations in `prisma/migrations`.

- **Runtime connection.** `DATABASE_URL` may point at a connection pooler (PgBouncer or equivalent) in front of Railway Postgres in production. The app runs as serverless functions, each with a small pg pool (`max: 5`, see `src/lib/server/prisma.ts`), and the pooler stops many small pools from exhausting Postgres's own connection limit.
- **Migrations use the direct URL.** `prisma.config.ts` only has a single `url` (no `directUrl` slot in this Prisma version). Run `migrate` / `db push` / `studio` with `DATABASE_URL` temporarily set to the direct, non-pooled Railway connection string - migrations don't work reliably through a transaction pooler.
- **Warning: `.env` points at a shared remote database.** There is no local database by default, so `npm run db:migrate`, `db:deploy`, `db:seed` and anything else that writes run against real data. Confirm the target before running them, and prefer pointing `DATABASE_URL` at your own Postgres for experiments.
- Authorization is enforced in application code, not in the database (no RLS) - see `src/lib/server/authz.ts`.

## Project structure

```
src/
  app/
    admin/ md/ user/     role areas (pages per role, see Roles)
    login/ share/        public routes
    api/                 Route Handlers - the only code that talks to the database
  proxy.ts               optimistic route gating from the session cookie
  lib/
    server/              server-only: prisma client, session (JWT cookie),
                         authz (per-request permission checks), password helpers
    *.ts                 shared domain logic: production chain, workflow, TNA,
                         reports and Excel/PDF/CSV export, types
  hooks/                 React Query hooks wrapping the API
  context/               auth, toasts, confirm dialog, demo (preview) mode
  components/            UI by feature (dashboard, forms/stage, tna, reports, users, ui ...)
  generated/prisma/      generated Prisma client (do not edit)
prisma/
  schema.prisma          data model
  migrations/            SQL migrations
  seed.ts                seed script
```

Every Route Handler must call the matching check in `src/lib/server/authz.ts` before reading or writing; `proxy.ts` is only a first line of defence.

## Three ways to move work on

Each stage form ends with three actions, and each writes one `stage_entries` row:

| Action | Button | `isForwarded` | `isCompleted` |
| --- | --- | --- | --- |
| `plan` | Save Plan | false | false |
| `forward` | Not Complete - Move Forward | true | false |
| `complete` | Completed - Move Forward | true | true |

Both flags are derived from a single `StageAction` in `src/hooks/useStageEntryBuilder.ts`. They used to be set independently, which let "Save Plan" and "Not Complete - Move Forward" both write `isCompleted: false` with nothing to tell them apart, so the next stage never unlocked. Deriving them from one value removes the impossible fourth state (completed but not forwarded).

## Security notes

- Passwords are stored as bcrypt hashes (`AppUser.passwordHash`); login and session validation use only the hash. A session JWT carries a fingerprint of the hash, so resetting a password invalidates existing sessions.
- **Plaintext password mirror (`AppUser.passwordPlain`).** This column exists on purpose: admins need to be able to view a user's password in the Users / Account management screens (a product requirement). It is never used for authentication, and it is returned only to admin accounts - `toPublicAppUser` in `src/lib/types.ts` includes it only when the caller is an admin (never for MD, who can read the user list). Treat database access and backups as containing live credentials.
- Authorization lives in `src/lib/server/authz.ts` and must be called from every Route Handler; there is no database-level backstop.
- `.env` holds the database credentials and `JWT_SECRET`; never commit it.
