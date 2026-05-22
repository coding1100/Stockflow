# StockFlow

Retail warehouse operations platform — **Inventory** and **Picking** modules, built as a
production-grade, fully-seeded client demo.

> Scope: 2 of the 5 v1 modules from the PRD (Inventory + Picking) plus a live Dashboard.
> Vendor Hub, Receiving, EDI and ERP integration are intentionally out of scope.

## Quick start (one command)

Requires **Docker Desktop**, **Node 22**, **pnpm 9**.

```bash
pnpm install
pnpm demo:up
```

`demo:up` starts Postgres + Redis (Docker), applies migrations, seeds a deterministic
warehouse, then runs the worker + web app. Then open:

- **Laptop:** http://localhost:3000
- **Phone (picker PWA):** `http://<your-lan-ip>:3000` (printed on startup)
- **Login:** `ops@stockflow.demo` / `demo1234` (also `picker@`, `clerk@`, `vendor@`, `admin@`)

Scenarios: `SEED_SCENARIO=peak pnpm demo:up` (`demo-default` | `peak` | `clean`).

### Fully containerized alternative

```bash
docker compose -f infra/docker-compose.full.yml up --build   # + Caddy local HTTPS on :443
```

## Architecture

Turborepo monorepo. **Event-sourced inventory**: every stock change is an immutable
`Transaction`; a Redis Streams **materializer** (in `apps/worker`) projects the
`InventoryCurrent` read model within ~2s and fans out **SSE** updates to the UI.

```
apps/
  web/      Next.js 14 (App Router) · tRPC · NextAuth · Tailwind · mobile PWA + offline
  worker/   Redis Streams materializer · BullMQ jobs (velocity, order-drip)
packages/
  db/       Prisma schema + migrations + deterministic seed + tenancy extension
  core/     pure domain logic — TSP route optimizer, inventory projection, wave planning
  api/      tRPC routers (inventory, picking, dashboard) + RBAC
  events/   Redis Streams event bus + pub/sub
  ui/       Tailwind UI primitives
  config/   Zod env, pino logger, shared tsconfig/eslint, password hashing
```

Stack: Next.js 14 · React 18 · tRPC v11 · Postgres 16 + Prisma · Redis 7 · BullMQ · TypeScript (strict).

## Highlights

- **TSP route optimization** — nearest-neighbour + 2-opt over a zone-constrained Manhattan
  distance graph; <1s for 200 stops (enforced by a CI perf gate). See `packages/core/src/routing`.
- **Real-time** — scan → Redis Stream → materializer → SSE → UI in ~2s.
- **Overselling prevention** — channel reservation under `SELECT … FOR UPDATE`.
- **Offline-first picking** — IndexedDB outbox + idempotent (`scanId`) replay on reconnect.
- **Deterministic seed** — 8 zones / 624 bins / 1,500 SKUs / 75 days of history / hero waves.

## Development

```bash
pnpm test         # unit tests (core domain + routing perf gate)
pnpm typecheck    # all packages
pnpm --filter @stockflow/db studio   # inspect the DB
pnpm --filter @stockflow/web e2e     # Playwright (app must be running)
```

Local DB only (without the app): `docker compose -f infra/docker-compose.yml up -d`, then
`pnpm db:migrate && pnpm db:seed`. Connection: Postgres `127.0.0.1:5433`, Redis `127.0.0.1:6380`.

## Production hardening notes

- **RLS & transaction partitioning** are documented in `packages/db/prisma/migrations/*_search_and_rls`.
  The demo enforces tenant scoping at the app layer and ships the PRD-mandated indexes; the
  Postgres-level RLS policies and monthly `PARTITION BY RANGE` are the documented next step.
- **Observability** — pino structured logging is wired; Sentry initialises when `SENTRY_DSN` is set.
- **SSE** needs a long-lived connection — run on the Node runtime / a persistent host (the demo
  does), not Vercel serverless.
