# Deployment & rollback

The app has two parts: a **Supabase project** (database, auth, storage, realtime) and a
**static site** (`build/client`). There is no other server.

Always deploy to a **staging** Supabase project and site first, run the smoke checklist,
then repeat for production.

## 1. Supabase project (once per environment)

1. Create a project at supabase.com. Choose a region close to Bahrain, e.g. Middle East or EU.
2. Install and link the CLI. It is a dev dependency, so run it with `npx`:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
3. **Apply migrations** (`supabase/migrations`, in order):
   ```bash
   npx supabase db push --dry-run
   ```
   ```bash
   npx supabase db push
   ```
   The migrations create the schema, RLS policies, functions, the `menu-media` storage
   bucket, the realtime publication and the hourly retention job (`pg_cron`). If `pg_cron`
   is not enabled, enable it under Database → Extensions and re-run the last migration's
   cron block in the SQL editor.
4. **Never run `supabase/seed.sql` against production.** It contains SAMPLE data for local development.
5. **API settings** (Dashboard → Project Settings → Data API): exposed schemas = `public` only. The private `app` schema must stay unexposed.
6. **Auth settings** (Dashboard → Authentication):
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, `https://<your-domain>/reset-password`
   - Email confirmations: **on**. Minimum password length: **10**, letters + digits.
   - Leaked-password protection: on (if your plan includes it).
   - Custom SMTP: configure a real sender, because the built-in mailer is rate-limited and only for testing.
   - Edit the confirmation and reset email templates; Arabic and English text is recommended.
7. **First super admin**: sign up on the site, confirm the email, then run
   `supabase/scripts/provision-super-admin.sql` in the SQL editor (replace `:'email'`).
8. Load the official menu: after review, run `supabase/menu/official-menu-2026-10.sql` in the SQL editor (it is idempotent). Then enter hours, the branch Maps link and settings through `/admin`, then switch
   on **Accept online orders** and **Cash on pickup** in `/admin/settings` when ready.

## 2. Static site

Build with the target environment's public values:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon-key> VITE_SITE_URL=https://<your-domain> npm run build
```

Or put the same three variables in `.env`. Only the **anon/publishable** key goes here, never the service-role key.

Then verify the build:

```bash
npm run scan:secrets
```

`npm run build` also writes `sitemap.xml`, `robots.txt`, `_redirects` and `_headers` into `build/client`.

**Hosting requirements** (any static host):

| Requirement | Netlify / Cloudflare Pages | Vercel / others |
|---|---|---|
| Publish directory | `build/client` | `build/client` |
| Prerendered pages served as-is | automatic | automatic |
| Every other route → `/__spa-fallback.html` (status 200) | `_redirects` (generated) | add a rewrite: `{"source": "/(.*)", "destination": "/__spa-fallback.html"}` (filesystem first) |
| Security headers | `_headers` (generated) | copy the headers from `build/client/_headers` into the host's header config |
| HTTPS | required (HSTS header is sent) | required |

Do **not** rewrite unknown routes to `/index.html`. That is the prerendered home page, and it breaks hydration on other routes.

## 3. Smoke checklist (after every deploy)

- [ ] `/`, `/menu`, `/contact` load in Arabic; the language switch flips to English and persists.
- [ ] Register → confirmation email arrives → link signs in → profile shows the phone number.
- [ ] Add an item with options → the cart shows server prices → checkout → an order number appears → the order page updates live.
- [ ] As staff (assigned branch): the order appears in `/admin/orders`; confirm → preparing → ready.
- [ ] On a phone: the pickup screen → "I'm here" → the car appears in `/admin/pickup` within seconds → acknowledge → the customer sees "on our way" → hand over.
- [ ] A customer account cannot open `/admin`. Staff cannot open `/admin/products`.
- [ ] Product image upload works and the image shows on the menu.
- [ ] Response headers include `Content-Security-Policy`; the browser console shows no CSP errors.

## 4. Rollback

**Static site:** static hosts keep previous deploys, so promote the last good deploy (Netlify: Deploys → Publish deploy; Vercel: Instant Rollback; Cloudflare Pages: Rollback). This takes seconds and does not affect data.

**Database:** migrations only move forward. Before each production migration:

1. Confirm a recent backup exists (Dashboard → Database → Backups; Point-in-Time Recovery is recommended for production).
2. Run the new migration on staging and run the smoke checklist there.
3. Run `npx supabase db push --dry-run` against production and review the plan.

If a migration causes problems:

- **Preferred:** write a new corrective migration that reverses the change, test it on staging and push it. Order history is append-only, so do not reverse migrations that drop or rewrite order data.
- **Last resort:** restore from backup or Point-in-Time Recovery to just before the migration. Orders placed after that point are lost, so pause ordering first (`/admin/settings` → turn off Accept online orders) and export recent orders.

Keep site and database compatible across one release: deploy additive database changes first, then the site that uses them. Remove old columns only in a later release.

## 5. Ongoing

- Retention runs hourly (`app.purge_expired_data`). See [DATA_RETENTION.md](DATA_RETENTION.md).
- Update dependencies monthly (`npm outdated`), then run all tests before deploying.
- Regenerate database types after schema changes. This needs the local stack:
  ```bash
  npm run db:types
  ```
