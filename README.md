# Lahab (لهب) — ordering & management platform

Customer website, ordering and car-pickup system for Lahab restaurant, A'ali, Bahrain.

- **Frontend:** React 19 + React Router 8 (framework mode, static SPA with prerendered public pages) + Vite 8 + TypeScript 6 + Tailwind CSS 4
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage). No other server; Edge Functions are reserved for a future payment integration.
- **Status:** [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) · plan and checklist: [docs/PHASE1_AUDIT_AND_PLAN.md](docs/PHASE1_AUDIT_AND_PLAN.md)
- **Docs:** [deployment & rollback](docs/DEPLOYMENT.md) · [security](docs/SECURITY.md) · [testing](docs/TESTING.md) · [data retention](docs/DATA_RETENTION.md) · [payments](docs/PAYMENTS.md) · [owner checklist](docs/OWNER_CHECKLIST.md)

## Project layout

```
src/                 app (routes/, features/, ui/, lib/, i18n/, config/)
supabase/migrations  schema, business logic, RLS — the source of truth
supabase/seed.sql    LOCAL DEV ONLY branch, settings and placeholder content
supabase/menu        official menu (transcribed 2026-10-29) — loaded by db reset; run once in production
supabase/scripts     provision-super-admin.sql
tests/db             migrations + RLS + business-logic tests (PGlite, no Docker)
tests/unit           Vitest + Testing Library
e2e                  Playwright UI smoke tests (stubbed API)
legacy/              the original Express/Mongo template, kept for reference
```

## Setup

Requires Node 22.22+.

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Only publishable values go in `VITE_*` variables. Without them the site still runs and shows a "not connected" notice.

### Local Supabase (recommended)

Needs Docker Desktop. The Supabase CLI is a dev dependency.

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` applies `supabase/migrations` and `supabase/seed.sql`. Use the API URL and anon key printed by `supabase start` in `.env`. Confirmation emails are visible in the local Inbucket/Mailpit UI.

### First administrator

Sign up through the site, confirm the email, then run `supabase/scripts/provision-super-admin.sql` as the database owner (SQL editor or psql). No admin credentials exist in the code.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Production build to `build/client` (prerenders public pages) |
| `npm run typecheck` | Route typegen + `tsc` |
| `npm run lint` | ESLint |
| `npm test` | Unit + database tests |
| `npm run test:db` | Database tests only (migrations, RLS, pricing, orders, pickup) |
| `npm run test:e2e` | Playwright UI smoke tests on mobile + desktop (`npx playwright install chromium` once) |
| `npm run scan:secrets` | Fails if `build/client` contains secret-looking values |

## Testing notes

- `tests/db` runs the real migrations in PGlite (Postgres 18 in WASM) with a minimal stand-in for Supabase's `auth`/`storage` schemas and API roles. It exercises RLS through `anon`/`authenticated`/`service_role` with per-user JWT claims. It does **not** replace running against the real Supabase stack before production.
- `e2e` stubs the Supabase REST API with fixture rows. These are layout and interaction checks; real end-to-end flows (signup email, orders) need the local stack.

## Hosting

The build is static (`build/client`), with prerendered public pages plus an SPA fallback. `npm run build` also writes the sitemap, robots.txt, `_redirects` and `_headers`. Host requirements and rollback are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
