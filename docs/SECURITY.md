# Security model

## Principles

- **The database is the enforcement point.** Every table in `public` has row-level security (RLS). Privileges are granted explicitly; nothing relies on Supabase defaults. Hiding buttons in the UI is only for convenience.
- **The browser holds only the anon/publishable key.** The service-role key is not used by the app. `npm run scan:secrets` fails a build that contains a non-anon JWT, a Supabase secret key, a payment secret key, a private key or a database URL with credentials.
- **Prices, totals, roles and statuses are never trusted from the client.** The order request contains product ids, quantities, option ids and notes only. `app.price_cart` reprices everything from the database.

## Roles

| Role | Can |
|---|---|
| customer | own profile, favourites and orders; place orders; notify arrival for own active pickup orders; cancel own order while pending |
| staff | orders and the pickup queue for **assigned branches** only; acknowledge arrivals; move orders forward; cancel before preparation starts |
| manager | menu, offers, coupons, hours, pickup pause and capacity, content, reports, customers (masked contact details), audit log; all branches |
| super_admin | everything above, plus roles, branch details and business settings; sees customers' contact details in full |

- Signup always creates a `customer` role. Role claims in signup metadata are ignored (tested).
- Roles are granted only through `admin_set_role` (super admin only, audited). The last super admin cannot be removed.
- The first super admin is created with `supabase/scripts/provision-super-admin.sql` by the database owner. No credentials exist in the code.

## Server-side business functions

Privileged logic lives in the private `app` schema, which is not exposed through the API. Signed-in users reach it only through thin `public` wrappers that pass `auth.uid()` as the actor:

| Function | Checks |
|---|---|
| `place_order` | verified email, phone on profile, ordering and payment enabled, branch active and not paused, opening hours, slot capacity, lead time, availability windows, option rules, quantity 1–20, coupon limits, idempotency key (a reused key with a different body is rejected), rate limit 5 per 10 min |
| `transition_order_status` | allowed transitions only; branch scope; staff cannot cancel after preparation starts; cancellation needs a reason; history + audit in the same transaction |
| `notify_arrival` | owner only; confirmed/preparing/ready; not older than 12 h; 60 s cooldown; 5 per order; request-id dedupe; rate limit 10 per 10 min |
| `acknowledge_arrival` | staff of that branch; only after arrival |
| `admin_*` | role checked before any lookup (no email enumeration); reorder limited to an allowlist of tables |

All functions are `SECURITY DEFINER` with `search_path = ''` (tested). Errors are coded (`lahab.<code>`); the UI shows translated messages and never raw database text.

## Data exposure

- Staff see order snapshots: customer name and phone, needed to fulfil the order. The pickup queue view shows first names only.
- Managers see customer contact details masked; super admins see them in full.
- Coupons are never listable by customers. Staff preparation notes live in a table the public can't read.
- Storage: `menu-media` is publicly readable, and only managers can write, with a 5 MB limit and image types only.

## Web headers

The build emits CSP (`default-src 'self'`, Supabase as the only connect/img origin, Google Fonts, `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, a `Permissions-Policy` that denies geolocation, camera and microphone, and `noindex` for `/admin`, `/account` and `/orders`.

Known compromise: `script-src` includes `'unsafe-inline'`, because React Router inlines its hydration data. No third-party scripts are loaded.

## Tested

`tests/db/security.test.ts` checks the database-wide guarantees. `tests/db/rls.test.ts`, `admin.test.ts`, `orders.test.ts`, `pickup*.test.ts` and `ordering.test.ts` exercise each rule with separate identities (anon, customers, staff on different branches, manager, super admin).
