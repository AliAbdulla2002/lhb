# Testing

| Suite | Command | What it covers |
|---|---|---|
| Database | `npm run test:db` | All migrations run in PGlite (Postgres 18, WASM) with stand-ins for Supabase's `auth`/`storage` schemas and the anon/authenticated/service_role roles. Covers RLS per identity, pricing, coupons, idempotency, order workflow, arrival rules, admin functions, slots, seed, and database-wide security checks. |
| Unit | `npx vitest run --project unit` | Money (fils), customisation rules, validation, cart store, checkout payload, idempotency keys, pickup rules, error messages, RTL/LTR rendering. |
| Browser | `npm run test:e2e` | Playwright on Pixel 7 and desktop Chrome against the production build. The Supabase API is **stubbed** with fixture data, so these check UI behaviour: what is sent, what is shown, role gates, double-tap and retry handling, layout overflow, and an **axe** accessibility audit (WCAG 2.1 AA, serious or critical violations fail). |
| Static | `npm run lint`, `npm run typecheck`, `npm run scan:secrets` | ESLint, TypeScript strict mode, secret scan of the built files. |

The first browser run needs Playwright's browser:

```bash
npx playwright install chromium
```

## Known gaps — run before production

1. **The real Supabase stack has not been run.** PGlite is real Postgres, but its `auth` and `storage` schemas are minimal stand-ins, and PostgREST, Realtime, GoTrue (auth emails) and Storage aren't exercised. Install Docker Desktop, then:
   ```bash
   npx supabase start
   ```
   ```bash
   npx supabase db reset
   ```
   Then run the smoke checklist in [DEPLOYMENT.md](DEPLOYMENT.md) end to end. Ideally also convert `tests/db` to run against the local stack (`supabase test db` / pgTAP) in CI.
2. **Real devices.** Test the pickup screen on a real iPhone and Android phone: vibration, wake lock, realtime when the screen locks and unlocks, and mobile data drops.
3. **Load.** Not load-tested. Pickup slot capacity and rate limits are enforced in the database with advisory locks, but peak-hour behaviour hasn't been measured.
