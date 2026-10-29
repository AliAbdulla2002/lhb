# Lahab BH — final implementation report

Date: 2026-10-29 · Branch: `main` · Stack: React 19 + React Router 8 (static, prerendered) + Vite 8 + TypeScript 6 + Tailwind 4, Supabase (Postgres, Auth, Realtime, Storage).

## Definition of done

| # | Criterion | Status |
|---|---|---|
| 1 | Public website works | ✅ Built and tested against a stubbed API. Not yet run against real Supabase. |
| 2 | Authentication works | ✅ Register, email confirmation callback, login, logout, forgot/reset password and profile are built on Supabase Auth. ⚠️ The email flow is not exercised yet (needs a real project or the local stack). |
| 3 | Product management persists in the database | ✅ Writes through RLS-protected tables, covered by DB tests. ⚠️ Not exercised against live Storage/PostgREST. |
| 4 | Checkout creates real orders | ✅ `place_order` creates orders transactionally with server pricing and idempotency (DB-tested). |
| 5 | Orders managed by authorised staff | ✅ Status workflow, branch scoping and audit trail (DB + UI tested). |
| 6 | Pickup arrival notifications reach the staff dashboard | ✅ Persisted events, realtime plus 20 s polling recovery (DB + UI tested). ⚠️ The Realtime transport itself is not exercised in tests. |
| 7 | Pickup workflow works on mobile | ✅ Tested in a Pixel 7 emulation. ⚠️ Needs real-device testing (vibration, wake lock, network drops). |
| 8 | Role-based authorisation and RLS tested | ✅ 98 database tests with separate identities, plus database-wide security checks. |
| 9 | Application builds | ✅ `npm run build` (7 prerendered pages + SPA fallback, sitemap, robots, headers). |
| 10 | Critical automated tests pass | ✅ 146 Vitest (98 database + 48 unit) + 84 Playwright (42 per viewport, including axe accessibility audits). All passing on the final run. |
| 11 | Setup and deployment documented | ✅ README, DEPLOYMENT (incl. rollback), SECURITY, TESTING, DATA_RETENTION, PAYMENTS, OWNER_CHECKLIST. |

## What was built

**Customer site (Arabic RTL / English LTR, mobile-first):**
- Pages: home, menu with category filters, product page with options, offers, about, contact and location, privacy and terms. All business content comes from the database.
- Cart with server-priced quotes and explanations for unavailable items.
- Checkout: branch, ASAP or a pickup slot, car plate and colour, phone, notes, coupon, cash on pickup.
- Order confirmation with live tracking, order history with "order again", and favourites.
- Account: register, verify, login, password reset, profile.

**Car pickup and digital horn:**
- **Customer screen:** a large "I'm here" button with ripple, vibration and an optional quiet chime. It is protected against duplicates (tap guard, per-press request id reused on retry) and shows the server cooldown as a countdown. No location is needed, and the screen stays awake where supported.
- **Staff queue:** waiting cars with live timers, acknowledge and hand-over buttons, branch filter, optional chime, tab badge and browser alerts. It recovers missed alerts from the database.

**Admin (`/admin`):**
- Overview, live orders board and pickup queue.
- Products: options, photos with automatic WebP resizing, availability and schedules.
- Categories, promotions and coupons.
- Branches: hours, special days, pause and capacity.
- Settings and website content, staff and roles, customers with masked contact details, sales reports, audit log.
- Page access follows the role, and every page is also enforced on the server.

**Database:** 8 migrations — normalised schema (money in `numeric(10,3)`), RLS on every table, server-side pricing, order creation, status workflow, arrival notification, rate limits, audit triggers, retention job, storage policies and realtime publication.

**Quality:**
- SEO: per-page titles and descriptions, canonical and Open Graph tags, `Restaurant` structured data (verified facts only), sitemap and robots.
- Security headers (CSP, HSTS and others), a secret scan of the build, and accessibility fixes from the axe audit (contrast and accessible names).

## Decisions made along the way

- Supabase replaced the Express/Mongo template. The template is kept in `legacy/` for reference.
- Customers need an account to order; guest checkout is deferred.
- Pickup only, with cash on pickup; delivery and online payment are not active.
- Staff and customer actions call database functions bound to the caller's login (`public.*` wrappers over a private `app` schema) instead of Edge Functions. The checks are the same and run on the server, and they're testable without Docker. Edge Functions are reserved for secret-bearing work such as payment webhooks.
- TypeScript 6 instead of 7, because typescript-eslint doesn't support 7 yet.

## Remaining limitations

1. **Not yet run against a real Supabase instance** (Docker wasn't available). See [TESTING.md](TESTING.md#known-gaps--run-before-production). This is the most important next step.
2. **Brand assets:** the official logo (150 px raster) and colours sampled from the menu artwork are in use. Still needed: a vector logo and original food photos; products show a branded placeholder until photos are uploaded.
3. **The official menu is transcribed** (`supabase/menu/official-menu-2026-10.sql`, tested), but the English translations await owner review. Hours are unconfirmed and shown with a "being confirmed" note.
4. **Online payment, delivery and guest checkout** are not implemented (designs documented).
5. **No push notifications to closed browsers.** The persistent staff queue covers missed alerts.
6. **No self-service account deletion** (manual process documented).
7. **Product pages aren't prerendered** for SEO. They are in the sitemap when the build can reach the menu.
8. **CSP allows inline scripts,** which React Router needs for hydration data.
9. **Not load-tested,** and not tested on real phones.

## Owner actions required

See [OWNER_CHECKLIST.md](OWNER_CHECKLIST.md). In short:
- **Content:** logo, colours, photos, the menu with prices, confirmed hours and Maps link, policies.
- **People:** the first super admin and staff.
- **Accounts:** a Supabase project, hosting, an email sender, and a payment decision.

Then follow [DEPLOYMENT.md](DEPLOYMENT.md) to deploy staging, run the smoke checklist, and repeat for production.
