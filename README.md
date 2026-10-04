# Job Work Ledger

Job-work management and billing for a business that sends products to job workers (embroidery, printing, stitching, finishing…).

**Client → Job → Product → Designs (each with its own qty & rate) → Material sent → Partial returns → Billing → Payments**

## Stack

| | |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| `apps/web` | Next.js 16 (App Router), Tailwind CSS 4, TanStack Query, Radix, cmdk |
| `apps/api` | Express 5 + TypeScript, zod validation, JWT cookie auth |
| `packages/db` | Prisma 7 schema, migrations, seed (PostgreSQL 16 via Docker) |
| `packages/shared` | Calculation engine, zod schemas, API types, ₹ formatting |

## Getting started

Requirements: Node 22+, pnpm, and Docker.

```bash
cp .env.example .env        # then set JWT_SECRET (and the owner login if you like)
pnpm install
pnpm db:setup               # starts Postgres, applies migrations, seeds owner + sample products/designs
pnpm dev                    # web on http://localhost:3000, API on http://localhost:4000
```

Log in with `OWNER_EMAIL` / `OWNER_PASSWORD` from `.env` (default `owner@example.com` / `admin123`).

The browser only ever calls `/api/*` on the Next.js server, which proxies to Express. That keeps the auth cookie same-origin.

### Useful scripts

| Command | What it does |
|---|---|
| `pnpm db:up` / `pnpm db:down` | Start / stop Postgres (data persists in a Docker volume) |
| `pnpm db:migrate` | Create + apply a new migration after editing `schema.prisma` |
| `pnpm db:studio` | Browse the database |
| `pnpm test` | Calculation unit tests + API integration tests (uses the `av_erp_test` DB) |
| `pnpm typecheck` | Type-check all packages |
| `pnpm --filter @av/web e2e` | Playwright acceptance test through the UI (needs `pnpm dev` running) |

## How the numbers work

All quantities and money are derived in one place, `packages/shared/src/calc.ts`. Money is stored as integer paise.

Per design line:

- **Sent** = non-voided dispatches (initial + rework)
- **Received** = good pieces returned
- **Damaged / Rejected / Lost** = tracked separately, never billed
- **Pending** = Sent − Received − (Damaged + Rejected + Lost)
- **Completed value** = Received × Rate, **Pending value** = Pending × Rate
- **Unbilled** = Received − already billed (on non-cancelled invoices)

**Job status** is derived automatically:
- Draft: nothing has been sent yet
- In Progress
- Partially Received
- Completed: every piece ordered has been sent and accounted for
- Cancelled

### Business rules enforced by the API

- Each job line copies the design's rate when the job is created. Changing a design's default rate never touches existing jobs.
- A return larger than the pending quantity is refused unless a reason is given. Overrides are logged in the job history.
- Invoices can only bill completed, not-yet-billed pieces, so nothing can be billed twice.
- A payment can't exceed what is outstanding on the invoice. Partial payments are kept as separate records.
- Nothing is deleted:
  - Dispatches, returns and payments are **voided** with a reason.
  - Jobs and invoices are **cancelled** with a reason.
  - All of these stay visible in history.
- The billing policy is set in **Settings** and controls what the app suggests after a return:
  - Bill after each return
  - Bill when the job completes
  - Manual
- Every create, void, cancel, and quantity or rate change is written to `AuditLog`.

## Project layout

```
apps/api/src
  routes/       thin HTTP layer (zod-validated)
  services/     jobs.ts (jobs, dispatch, returns, status, timeline), billing.ts, reports.ts
apps/api/test   acceptance + edge-case integration tests
apps/web/app/(app)
  page.tsx                dashboard
  jobs/, returns/new/     job creation, job detail + history, return entry
  invoices/, payments/    billing
  clients/, products/, designs/, reports/, settings/
apps/web/e2e    Playwright acceptance scenario
packages/db/prisma        schema.prisma, migrations, seed.ts
packages/shared/src       calc.ts, schemas.ts, types.ts, format.ts
```
