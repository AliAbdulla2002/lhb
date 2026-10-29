# Lahab BH — Phase 1: Repository Audit & Implementation Plan

Status: Phase 1 approved 2026-10-29 (D1–D8). Phase 2/3 foundation implemented — see checklist in section 10.
Date: 2026-10-29

---

## 1. Repository audit

### 1.1 What is in `lahab-back-end/` today

| Item | Finding |
|---|---|
| Git | **Not a git repository.** No history, no remote. |
| Stack | Express 5 + Mongoose 9 (MongoDB) + JWT + bcrypt, CommonJS JavaScript. `package.json` name is `express-api-jwt-auth-template`. |
| Domain | A course "Hoots" template: `User` (username/password), `Hoot` (title/text/category/comments). **Nothing Lahab-specific** — no products, orders, branches, or pickup code. |
| Routes | `/auth/sign-up`, `/auth/sign-in`, `/users`, `/hoots` CRUD, `/hoots/:id/comments` CRUD. |
| Tests | None (`npm test` exits with an error). No lint, no TypeScript. |
| Dependencies declared but unused | `cloudinary`, `multer` (no upload code exists). |
| `.env` | Contains `PORT`, `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `CLOUDINARY_*`, `EMAIL_USER`, `EMAIL_PASS`, `FRONTEND_URL`. Values look real. `.gitignore` covers `.env` and `node_modules`. No `.env.example`. |
| Stray files | `.DS_Store` (should be ignored). |
| Frontend | None in this folder. Sibling folders `../h` and `../h-frontend` are a different project (courses/messaging) and are unrelated to Lahab. |

### 1.2 Security issues in the existing code (for the record — it will not be reused)

- `GET /users` returns every user to any logged-in user.
- JWTs are signed with no expiry; no rate limiting on sign-in; error messages leak `err.message`.
- `PUT /hoots/:id` passes `req.body` straight into `findByIdAndUpdate` (mass assignment, can overwrite `author`).
- `signIn` reveals whether a username exists (404 vs 401).
- Missing-record cases crash into 500s (`hoot` null).

### 1.3 Local tooling

| Tool | Status |
|---|---|
| Node | v24.16.0, npm 11.13.0 ✅ |
| Supabase CLI | **Not installed** |
| Docker | **Not installed** → the local Supabase stack (`supabase start`) and `supabase test db` (pgTAP) cannot run yet |

### 1.4 Conclusion

There is no existing Lahab work to preserve. The brief asks for Supabase + React/Vite/TypeScript and says *not* to introduce a second backend, so the Express/Mongo template should be **retired, not extended**. I will not delete it without your approval — the proposal is to move it to `legacy/express-template/` (or delete it if you confirm it's disposable).

**Action for you:** if the `MONGODB_URI`, Cloudinary secret, or `EMAIL_PASS` in `.env` were ever committed anywhere (the sibling `h` project uses the same template), rotate them.

---

## 2. Brand & business research

### 2.1 Verified (from the owner-supplied links)

| Fact | Value | Source |
|---|---|---|
| Name | **LAHAB \| لهب** — "مطعم لهب" | Instagram profile, Google Business panel |
| Instagram | `@lahab.bh`, ~20.6k followers | Instagram |
| Positioning | "Authentic Shawarma 🔥" — Google category: shawarma restaurant | Instagram bio, Google |
| Branch | **A'ali (عالي)** — Building 2542, Road 4270, A'ali | Google Business panel |
| Phones | **3344 7433** and **1723 2805** | Instagram bio (Google lists 3344 7433) |
| Hours | **5:00 pm – 12:00 am** | Instagram bio; Google "opens at 5 pm" |
| Price range | BHD 1–5 per person | Google |
| Link hub | `taplink.cc/lahab.bh` (page renders client-side; contents not readable) | Instagram |
| Logo | Red/orange flame-style Arabic calligraphy of "لهب" on a cream circle | Instagram profile picture (150px only) |

### 2.2 Conflicts and gaps — need owner confirmation

1. **Opening hours conflict.** A Lahab post from ~9 months ago announced new hours of **12 pm – 12 am** with a lunch menu; the current bio and Google say **5 pm – 12 am**. Which is current? Same every day?
2. **Branches.** Only A'ali is verified. Talabat lists Lahab menus for delivery areas (Shahrakan, Arad, Salmabad, West Riffa) — these appear to be delivery zones of the A'ali branch, not separate branches. A search result mentions a Riffa/Al Buhair shawarma place with a different phone; I treat that as **unrelated/unverified**. Confirm the branch list.
3. **Menu and prices.** The Talabat link redirected to Talabat's homepage (not readable). Search snippets show items such as Arabic chicken shawarma, Classic, Dynamite, Signature, Smoky, Parmesan, shawarma burger, Lahab salad, Caesar salad, kids' meals, "Box 1" / Family Box, golden shawarma samosa, cheese fries — **with prices that differ across Talabat listings**. Per the rules, **I will not seed any menu or price from these sources.** I need the official menu (names AR/EN, descriptions, sizes, add-ons, sauces, prices in BHD).
4. **Brand colors and fonts.** Only a low-resolution profile picture is accessible; Instagram content requires login. I can see a red–orange flame on cream, but exact hex values and any brand typeface are **unverified**. Need the vector logo (SVG/AI/PDF) and brand guide if one exists.
5. **Photography.** Instagram photos require login and are copyrighted. Need owner-supplied food photos (originals, ideally ≥2000px) or written permission to use specific posts.
6. **Ordering policies.** Not published anywhere I could reach:
   - Is **cash at pickup** approved? Card on pickup?
   - **Own delivery** — or is delivery handled only via Talabat/Keeta? (Recommendation: pickup-only in v1.)
   - Online payment provider wanted (e.g. BenefitPay, Tap, Credimax/MPGS) and whether a merchant account exists.
   - Pickup area description ("park at …"), pickup lead time, max orders per slot.
   - Cancellation/refund policy, privacy policy, and terms text (I can draft templates for legal review; they will be marked as drafts).
7. **Google Maps link.** Need the canonical Maps URL / place link for the A'ali branch (the share link resolves to a Google search page).
8. Owner-approved "About Lahab" story. The public panel shows a 4.9★ / ~1,200 review rating; I will **not** display ratings or claims ("Bahraini-managed", "best shawarma") without your approval.

All of this will live in one editable place: `restaurant_settings` / `site_content` tables (admin-editable) plus `src/config/brand.ts` for design tokens — no hardcoded business facts in components.

---

## 3. Key decisions needing your approval

| # | Decision | Recommendation |
|---|---|---|
| D1 | Replace Express/Mongo template with Supabase stack | **Yes** — move template to `legacy/`, build fresh. |
| D2 | Initialise git in this folder (and rename folder to `lahab` later) | **Yes**, first commit = current state before any change. |
| D3 | Local dev database | Install **Docker Desktop + Supabase CLI** so migrations, RLS tests (pgTAP), and edge functions run locally. Alternative: a separate **dev** Supabase cloud project (never production) — slower and needs your project credentials. |
| D4 | Guest checkout | **Not in v1.** Ordering requires an account (gives order history, secure pickup auth). Guests can browse. Add guest checkout later via signed pickup tokens. |
| D5 | Delivery | **Pickup only in v1** (schema supports delivery; it stays disabled until you configure zones/fees). |
| D6 | Payments | **Cash at pickup** in v1 if you approve; payment provider adapter + webhook skeleton built but **inactive** until you supply merchant credentials. |
| D7 | Phase order | Do **DB/auth (Phase 3) before or alongside public UI (Phase 2)**, so the menu UI is built against real tables + seed data instead of throwaway arrays. |
| D8 | Rendering | React Router (framework mode, SPA + build-time **prerender** of public pages) on Vite, so menu/product pages are indexable without adding a server. |

---

## 4. Architecture

```
Browser (React 19 + Vite + TS + Tailwind v4)
  ├─ Public site & customer app  (/, /menu, /menu/:slug, /cart, /checkout, /orders/…)
  └─ Admin app (/admin/…)  — lazy-loaded chunk, guarded in UI, enforced server-side
        │  supabase-js (anon key + user JWT only)
        ▼
Supabase
  ├─ Auth (email/password, email verification, password reset)
  ├─ PostgREST  → reads governed by RLS (menu, own orders, staff queues)
  ├─ Realtime   → order status + pickup arrival queue (RLS-filtered)
  ├─ Storage    → product-images (public read, manager write), private admin bucket
  ├─ Edge Functions (Deno, Zod) → all writes that matter:
  │     create-order, quote-cart, notify-arrival, acknowledge-arrival,
  │     update-order-status, admin-* (products, roles…), payment-webhook (inactive)
  └─ Postgres functions (SECURITY DEFINER, transactional): price calculation,
        place_order, transition_order_status, rate limiting, audit triggers
```

Principles:
- **Browser never writes** to `orders`, `order_items`, `payments`, `user_roles`, `audit_logs`, `pickup_arrival_events`. Those tables have *no* insert/update RLS policy for `anon`/`authenticated`; writes happen only through edge functions → definer functions.
- Edge functions: verify JWT → Zod-validate → rate-limit → call a single transactional SQL function → return structured `{ error: { code, message_key } }` errors (no DB internals).
- Service-role key exists only as an edge-function secret. Frontend env vars are only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable).
- Layers in the frontend: `ui/` (presentational) → `features/*/components` → `features/*/hooks` (TanStack Query) → `lib/api/*` (typed data access) — no Supabase calls inside components.

### 4.1 Packages (latest stable as of today; re-verified at install)

React 19.3, Vite 8.3, React Router 8.5, Tailwind CSS 4.3, @supabase/supabase-js 2.118, Supabase CLI 2.122, Zod 4.6, React Hook Form 7.91, TanStack Query 5.105, i18next 26 + react-i18next, lucide-react, Vitest 5, React Testing Library 16, Playwright 1.64.
TypeScript: npm `latest` is 7.0 (new native compiler). I'll confirm typescript-eslint/Vite plugin compatibility at install and fall back to the latest 6.x if anything breaks.

### 4.2 Proposed file structure

```
lahab/
├─ .env.example                 # placeholders only
├─ .gitignore                   # .env*, !.env.example, node_modules, dist, .DS_Store, supabase/.temp
├─ README.md                    # setup, scripts
├─ docs/
│  ├─ PHASE1_AUDIT_AND_PLAN.md
│  ├─ DEPLOYMENT.md  SECURITY.md  DATA_RETENTION.md  OWNER_CHECKLIST.md
├─ legacy/express-template/     # old code, pending your decision
├─ src/
│  ├─ app/            # router, providers, layouts (PublicLayout, AdminLayout)
│  ├─ config/         # brand.ts (tokens), env.ts (zod-validated import.meta.env)
│  ├─ i18n/           # ar.json, en.json, setup (dir/lang on <html>)
│  ├─ ui/             # Button, Input, Dialog, Sheet, Toast, Table, Badge, Skeleton…
│  ├─ lib/            # supabase client, money (fils ↔ BHD), time (Asia/Bahrain), api/*
│  ├─ features/
│  │  ├─ menu/  cart/  checkout/  orders/  pickup/  account/  offers/  content/
│  │  └─ admin/ overview/ products/ categories/ orders/ pickup-queue/ promotions/
│  │            branches/ hours/ staff/ customers/ reports/ audit/ settings/
│  ├─ routes/         # route modules (public + admin), lazy loaded
│  └─ types/database.ts   # generated by `supabase gen types`
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/     # 0001_extensions_enums.sql, 0002_core.sql, 0003_rls.sql, …
│  ├─ functions/      # _shared/ (cors, auth, errors, schemas), create-order/, …
│  ├─ seed.sql        # dev-only, clearly fake data ("Sample Shawarma")
│  ├─ scripts/provision-super-admin.sql
│  └─ tests/          # pgTAP RLS + function tests
├─ tests/             # Vitest unit/component tests
└─ e2e/               # Playwright: customer, admin, pickup flows (mobile + desktop)
```

---

## 5. Database design

Conventions: `uuid` PKs (`gen_random_uuid()`), `created_at`/`updated_at timestamptz` (trigger-maintained), **money as `numeric(10,3)`** (BHD has 3 decimal places — fils), all timestamps stored UTC, displayed in `Asia/Bahrain`. Bilingual text as `name_ar`/`name_en` columns. Soft-archive via `archived_at` rather than delete for anything referenced by orders.

### 5.1 Enums

- `app_role`: `customer | staff | manager | super_admin`
- `order_status`: `pending | confirmed | preparing | ready | completed | cancelled`
- `fulfillment_type`: `pickup | delivery`
- `arrival_status`: `not_arrived | arrived | acknowledged | handed_over`
- `payment_method`: `cash_on_pickup | online`; `payment_status`: `unpaid | pending | paid | failed | refunded`
- `discount_type`: `percent | fixed`

### 5.2 Tables (required)

| Table | Key columns / constraints |
|---|---|
| `profiles` | `id` = `auth.users.id` (FK, cascade), `full_name`, `phone` (E.164, check), `preferred_language`, timestamps. Created by trigger on signup. |
| `user_roles` | `user_id`, `role app_role`, `granted_by`, PK(`user_id`,`role`). Every user gets `customer` by trigger; no other role can be inserted except via `admin-set-role`. |
| `staff_branch_assignments` | `user_id`, `branch_id`, PK(both). |
| `branches` | `slug` unique, `name_ar/en`, `address_ar/en`, `phone`, `maps_url`, `lat/lng` (optional), `is_active`, `pickup_paused bool`, `pickup_lead_minutes`, `max_orders_per_slot`, `pickup_instructions_ar/en`. |
| `business_hours` | `branch_id`, `weekday 0–6`, `opens_at time`, `closes_at time`, `closes_next_day bool` (handles 5 pm–12 am), unique(`branch_id`,`weekday`,`opens_at`). Plus `business_hour_exceptions` (holidays) — see 5.3. |
| `categories` | `slug` unique, `name_ar/en`, `image_path`, `sort_order`, `is_visible`, `archived_at`. |
| `products` | `category_id` FK, `slug` unique, `name_ar/en`, `description_ar/en`, `base_price numeric(10,3) check ≥0`, `is_available`, `is_featured`, `is_best_seller`, `available_from/until` (schedule), `prep_notes`, `sort_order`, `archived_at`. Indexes on (`category_id`,`sort_order`), partial index on featured. |
| `product_images` | `product_id`, `storage_path`, `alt_ar/en`, `sort_order`, `is_primary` (partial unique: one primary per product). |
| `product_options` | Option group per product: `name_ar/en` ("Size", "Sauces"), `selection_type single|multi`, `min_select`, `max_select`, `is_required`, `sort_order`. |
| `product_option_values` | `option_id`, `name_ar/en`, `price_delta numeric(10,3)`, `is_default`, `is_available`, `sort_order`. |
| `promotions` | Banner/offer: `title_ar/en`, `body_ar/en`, `image_path`, `link`, `starts_at`, `ends_at`, `is_active`, check `ends_at > starts_at`. Public view shows only active and in-window. |
| `coupons` | `code citext unique`, `discount_type`, `value`, `min_subtotal`, `max_discount`, `starts_at/ends_at`, `usage_limit`, `per_user_limit`, `is_active`. |
| `orders` | `order_number` (human, unique, e.g. `LH-241029-0042` from a per-day sequence), `customer_id`, `branch_id`, `fulfillment_type`, `status`, `pickup_time` (requested slot), `subtotal`, `options_total`, `discount_total`, `delivery_fee`, `total` (all `numeric(10,3)`, check `total = subtotal + options_total - discount_total + delivery_fee`), `coupon_id`, `coupon_code_snapshot`, `customer_name_snapshot`, `customer_phone_snapshot`, `notes` (≤500 chars), `idempotency_key uuid`, **unique(`customer_id`,`idempotency_key`)**, `cancel_reason`, `cancelled_by`. Indexes: (`branch_id`,`status`,`created_at`), (`customer_id`,`created_at desc`). |
| `order_items` | `order_id`, `product_id` (nullable FK, `on delete set null`), **snapshots**: `product_name_ar/en`, `unit_price`, `quantity check 1–20`, `line_total`, `notes`. |
| `order_item_options` | `order_item_id`, `option_value_id` (nullable), snapshots: `option_name_ar/en`, `value_name_ar/en`, `price_delta`. |
| `order_status_history` | `order_id`, `from_status`, `to_status`, `changed_by`, `reason`, `created_at`. Append-only. |
| `pickup_details` | `order_id` PK/FK, `vehicle_plate` (normalised upper, regex-checked), `vehicle_color`, `arrival_status`, `arrived_at`, `acknowledged_at`, `acknowledged_by`, `handed_over_at`, `handed_over_by`. |
| `pickup_arrival_events` | `order_id`, `branch_id` (denormalised for RLS/realtime filters), `event_type arrived|re_notified|acknowledged|handed_over`, `actor_id`, `client_request_id uuid` (unique per order → dedup), `created_at`. Persistent queue source. |
| `payments` | `order_id`, `method`, `status`, `amount`, `provider`, `provider_ref` (unique), `raw_event_id` unique (webhook idempotency). No card data, ever. |
| `audit_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb` (PII-minimised), `ip_hash`, `created_at`. Append-only; no update/delete for anyone but retention job. |

### 5.3 Additional tables (justified)

| Table | Why |
|---|---|
| `favorites` (`user_id`,`product_id` PK) | "Save favorite products" requirement. |
| `coupon_redemptions` (`coupon_id`,`order_id`,`user_id`) | Enforces `usage_limit` / `per_user_limit` atomically. |
| `business_hour_exceptions` (`branch_id`,`date`,`closed`/special hours) | Eid/holiday closures without editing weekly hours. |
| `restaurant_settings` (single row) | Owner-editable brand facts: display name, phones, social links, payment toggles, ordering on/off, tax/fee settings. Replaces hardcoded config. |
| `site_content` (`key`,`value_ar`,`value_en`) | Editable About text, hero copy, policy pages. |
| `rate_limits` (`bucket`,`window_start`,`count`) | Server-side rate limiting for order creation, arrival notifications, auth-adjacent functions (Postgres-backed, no extra service). Purged hourly. |

### 5.4 Order status state machine (enforced in `transition_order_status()`)

```
pending ──► confirmed ──► preparing ──► ready ──► completed
   │            │             │           │
   └────────────┴─────────────┴───────────┴──► cancelled (reason required; manager+ after 'preparing')
```
- Staff: forward transitions for assigned branches; cancel only from `pending`/`confirmed`.
- Manager/Super Admin: any allowed transition incl. cancel from `preparing`/`ready`.
- `completed` for pickup requires `arrival_status = handed_over` (set in the same action).
- Each transition writes `order_status_history` + `audit_logs` in one transaction. Illegal transitions raise a coded error.

### 5.5 Retention (documented in `DATA_RETENTION.md`, owner to confirm)

- `pickup_arrival_events`: 90 days. Vehicle plate on `pickup_details`: nulled 30 days after completion.
- `rate_limits`: 24 hours. `audit_logs`: 2 years.
- Orders/payments: kept for accounting (Bahrain requirement to be confirmed by owner's accountant); on account deletion, profile removed and order snapshots anonymised.
- Scheduled via `pg_cron`.

---

## 6. Security plan

### 6.1 Roles & helper functions

- `has_role(role)`, `is_staff_for_branch(branch_id)` — `SECURITY DEFINER`, `stable`, `search_path` pinned; read `user_roles` / `staff_branch_assignments` (no reliance on JWT custom claims that can go stale).
- Signup trigger assigns only `customer`. `user_roles` has **no** insert/update policy for clients. Role changes only via `admin-set-role` edge function (super_admin only, audited, cannot demote the last super_admin).
- **First admin:** `supabase/scripts/provision-super-admin.sql` run by you in the Supabase SQL editor (or via CLI with the DB URL) after creating the user through normal signup. No credentials in code.

### 6.2 RLS matrix (✔ = allowed, — = denied; writes marked "fn" go through edge/definer functions only)

| Table | anon | customer | staff | manager | super_admin |
|---|---|---|---|---|---|
| categories / products / options / images | read visible & non-archived | same | same + archived | full CRUD | full CRUD |
| promotions | read active in-window | same | read all | CRUD | CRUD |
| coupons | — (validated in fn) | — | read | CRUD | CRUD |
| branches / business_hours / settings / site_content | read public cols | same | same | update | CRUD |
| profiles | — | own read/update (not role) | read customers of their branch's active orders (name only via view) | read | read |
| favorites | — | own CRUD | — | — | — |
| orders / order_items / order_item_options | — | read own; write **fn** | read assigned branches; status **fn** | read all; **fn** | read all; **fn** |
| order_status_history | — | read own orders | read assigned branches | read | read |
| pickup_details | — | read own; vehicle set at checkout **fn** | read assigned branches; **fn** | read | read |
| pickup_arrival_events | — | read own; insert **fn** | read assigned branches; ack **fn** | read | read |
| payments | — | read own status | read assigned branches | read | read |
| user_roles / staff_branch_assignments | — | read own | read own | read | **fn** CRUD |
| audit_logs | — | — | — | read | read |
| rate_limits | — | — | — | — | — (service only) |

Staff-facing customer data is exposed through a `staff_order_queue` view (`security_invoker`) that returns only order number, first name, plate, color, status, timestamps — no phone unless the order is in `arrived` state and the role needs it (owner to confirm).

### 6.3 Server-side order creation (`create-order` → `place_order()`)

1. Require authenticated, email-verified user; rate limit (e.g. 5 orders / 10 min / user).
2. Zod-validate payload: `idempotency_key`, `branch_id`, `fulfillment_type`, `pickup_time?`, `items[{product_id, quantity, option_value_ids[], notes}]`, `coupon_code?`, `vehicle{plate,color}?`, `notes?`. **No prices accepted.**
3. In one transaction: return existing order if (`user`,`idempotency_key`) already exists; check branch active, not paused, open at pickup time, slot capacity; lock and load products/options; reject archived/unavailable/out-of-schedule items with per-item error codes; validate option min/max/required; compute totals from DB values; apply coupon with redemption limits; insert order + snapshots + pickup_details + history + payment(`cash_on_pickup`, `unpaid`); audit.
4. Client generates the idempotency key once per checkout attempt and reuses it on retry; the button is disabled while in flight.
5. `quote-cart` uses the same pricing function read-only, so the cart/checkout always displays server-calculated totals and flags unavailable items.

### 6.4 Other controls

- Storage: `product-images` bucket — public read, write/delete only `has_role('manager')`, MIME allowlist (jpeg/png/webp/avif), 5 MB limit, random file names.
- Edge functions: CORS allowlist from env, generic error responses, structured logs without PII/tokens.
- Auth: email confirmation on, password min length 10 + leaked-password check (Supabase setting), redirect URL allowlist, auth rate limits.
- Build check script scans `dist/` for `service_role`, `sk_`, JWT-shaped strings, and known secret env names.
- `robots.txt` disallows `/admin`, `/account`, `/orders`, `/checkout`; admin routes send `noindex`.

---

## 7. Car pickup & Digital Horn design

**Checkout:** Pickup → branch → pickup time (slots from hours, lead time, capacity) → vehicle plate (Bahrain format, normalised) + color swatches → place order.

**Customer pickup screen** `/orders/:orderNumber/pickup` (auth + ownership):
- Large order number, plate, color chip, branch, live status (Realtime subscription + refetch on reconnect/visibility change; polling fallback every 15 s if the socket drops).
- **"I'm Here — Notify Lahab"** horn button: ripple/glow animation (respects `prefers-reduced-motion`), `navigator.vibrate` where available, optional soft click sound only after the tap, mute toggle persisted locally. Audio is never the signal.
- States: idle → sending (disabled) → sent ("Lahab has been notified") → acknowledged ("We're on our way to your car") → handed over. Failure → clear error + retry using the **same** `client_request_id`.

**`notify-arrival` rules:** caller owns the order; order status ∈ {`confirmed`,`preparing`,`ready`}; not cancelled/completed; created within the last 12 h; branch matches. First notification sets `arrival_status = arrived`. "Honk again" allowed after a 60 s cooldown, max 5 per order; duplicates with the same `client_request_id` are no-ops returning the original result. No location access required.

**Staff pickup queue** `/admin/pickup`:
- Persistent list built from DB (not toasts): waiting cars first, sorted by arrival time, with live elapsed timer, plate (large), color, first name, order status, arrival status.
- Actions: Acknowledge, Mark ready, Hand over & complete — each via edge function, branch-checked, audited.
- Branch and status filters; multiple staff see the same queue via Realtime; reconnect/refresh rebuilds from DB so missed alerts are recovered; optional staff-enabled chime + tab-title badge; browser notifications only if granted (not required).

---

## 8. Route map

**Public / customer**

| Route | Purpose | Auth |
|---|---|---|
| `/` | Hero, featured, offers, why Lahab, location | — |
| `/menu`, `/menu/:categorySlug` | Menu with category filter | — |
| `/menu/item/:productSlug` | Product detail + customisation | — |
| `/offers` | Active promotions | — |
| `/about`, `/contact` | Story, branch, hours, map, socials | — |
| `/privacy`, `/terms` | Policy pages (site_content) | — |
| `/cart` | Cart with server quote | — |
| `/checkout` | Pickup/branch/time/vehicle/payment | customer |
| `/orders/:orderNumber` | Confirmation + live tracking | owner |
| `/orders/:orderNumber/pickup` | Digital Horn screen | owner |
| `/account`, `/account/orders`, `/account/favorites` | Profile, history, reorder, favorites | customer |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` | Auth | — |

Language: stored preference (localStorage + profile); `<html lang dir>` switched; optional `/en/...` prefixed URLs for SEO with `hreflang` (decide in Phase 2).

**Admin** (`/admin/*`, staff+; each page also checks role server-side)

| Route | Role |
|---|---|
| `/admin` overview | staff (branch-scoped), manager+ (all) |
| `/admin/orders`, `/admin/orders/:id` | staff+ |
| `/admin/pickup` | staff+ |
| `/admin/products`, `/admin/categories`, `/admin/promotions`, `/admin/coupons` | manager+ |
| `/admin/reports` | manager+ |
| `/admin/customers` | manager+ (masked PII) |
| `/admin/branches`, `/admin/hours`, `/admin/content`, `/admin/settings` | manager+ (hours/pause), super_admin (branches/settings) |
| `/admin/staff`, `/admin/audit` | super_admin (audit: manager+ read) |

**Edge functions:** `quote-cart`, `create-order`, `update-order-status`, `cancel-order`, `notify-arrival`, `acknowledge-arrival`, `handover-order`, `admin-products` (create/update/archive/reorder), `admin-categories`, `admin-promotions`, `admin-coupons`, `admin-branches`, `admin-set-role`, `admin-staff-assignments`, `admin-analytics`, `sign-upload` (if signed uploads chosen over storage policies), `payment-initiate` + `payment-webhook` (inactive until configured).

---

## 9. Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| DB | pgTAP (`supabase test db`) | RLS per role with separate JWT identities, cross-account reads, cross-branch staff, direct-insert denial on orders/roles/payments/audit, state machine, pricing, coupons, idempotency, arrival rules (expired/cancelled/completed), rate limits |
| Edge functions | Deno tests + Vitest integration against local stack | Zod rejection, manipulated price fields ignored, invalid quantity, duplicate/replayed requests, structured errors |
| Frontend unit/component | Vitest + RTL | money formatting (3 dp), cart math display, RTL rendering, horn button states, forms/validation messages AR/EN |
| E2E | Playwright (Pixel/iPhone + desktop) | register/verify (Inbucket mailbox)/login/logout/reset; browse; customise; order; history; reorder; pickup + horn + staff ack + handover; admin product CRUD + image upload + availability; customer blocked from `/admin` and admin APIs |
| Security | scripts | secret scan of `dist/`, dependency audit |

All of the DB and most E2E tests depend on decision **D3** (local Supabase via Docker, or a dev project).

---

## 10. Implementation checklist

**Phase 1 — Audit & plan** ✅ (this document)

**Phase 2/3 — Foundation** (2026-10-29; decisions D1–D8 approved)
- [x] git init, template moved to `legacy/express-template/`, `.gitignore`, `.env.example`
- [x] Vite + React Router (framework, static + prerender) + TS 6 + Tailwind 4 + i18n + TanStack Query; lint/typecheck scripts
- [x] Supabase config + migrations: enums, core tables, triggers, helper fns, pricing, order creation, status workflow, arrival notify/ack, RLS, storage policies, realtime, retention job
- [x] Dev-only seed (labelled SAMPLE) + super-admin provisioning script
- [x] DB test suite green (67 tests, PGlite). **Still to run against the real local Supabase stack** (needs Docker).
- [x] Provisional design tokens, UI kit, RTL/LTR, layouts (official logo/colours/photos still pending)
- [x] Landing, menu, product detail + customisation, offers, about, contact, policy pages reading from DB
- [x] Cart with server-side quote and unavailable-item handling (checkout button disabled until Phase 5)
- [x] Auth pages (register, verify callback, login, logout, forgot/reset) + account profile
- [ ] Edge Function wrappers for `app.*` functions (Phase 5/6, with the flows that call them)
- [ ] Order history, favourites UI, reorder (Phase 5)

**Phase 4 — Admin**
- [ ] Admin shell (sidebar, responsive), role guards
- [ ] Products/options/images, categories (reorder, archive), promotions, coupons
- [ ] Orders board with filters, status transitions, cancellation, audit
- [ ] Branches, hours, exceptions, pickup pause/capacity, settings, content, staff & roles, customers, reports, audit log viewer

**Phase 5 — Ordering**
- [ ] Cart (persisted), server quote, unavailable-item handling
- [ ] Checkout, `create-order` with idempotency, confirmation, tracking, history, reorder, favorites
- [ ] Payment adapter skeleton (inactive)

**Phase 6 — Pickup & Digital Horn**
- [ ] Vehicle capture, pickup screen, `notify-arrival`, staff queue, ack/handover, realtime + recovery
- [ ] Mobile testing: retries, offline, duplicate taps

**Phase 7 — QA & deploy**
- [ ] Lint, typecheck, build, all tests; secret scan
- [ ] SEO (meta, OG, JSON-LD `Restaurant` with verified data, sitemap, robots), performance/a11y pass
- [ ] `DEPLOYMENT.md` (Supabase project, migrations, functions, env, hosting e.g. Vercel/Netlify/Cloudflare Pages, rollback), final report

---

## 11. Technical risks

| Risk | Mitigation |
|---|---|
| No Docker → can't run local Supabase/pgTAP | Install Docker Desktop, or use a dedicated dev project |
| Missing official menu, logo, photos, hours | Build with clearly labelled sample data; block launch on `OWNER_CHECKLIST.md` |
| Realtime drops on mobile when app backgrounded | Refetch on `visibilitychange`/reconnect, polling fallback, persisted events |
| Pickup time/slot logic across midnight (5 pm–12 am) | `closes_next_day` modelling + tests around 23:30–00:30 Bahrain time |
| TypeScript 7 ecosystem compatibility | Verify at install; pin 6.x if needed |
| SPA SEO | Build-time prerender of public routes |
| Payment provider specifics (BenefitPay/Tap/MPGS) unknown | Provider-agnostic adapter; activate only after merchant setup |

---

## 12. What I need from the owner (summary)

1. Approve decisions **D1–D8** (section 3).
2. Install Docker Desktop + Supabase CLI, or provide a **dev** Supabase project (URL + anon key; service key set as a function secret by you).
3. Vector logo, brand colors/fonts, food photography (or written permission for specific Instagram posts).
4. Official menu: categories, items AR/EN, descriptions, sizes, add-ons, sauces, prices (BHD).
5. Confirm current opening hours per weekday, branch list, Google Maps link, pickup area instructions.
6. Payment: approve cash at pickup; name online provider if wanted.
7. Approved About copy; privacy policy & terms (or approval for me to draft templates marked for legal review).
8. Staff list per branch and who gets manager/super-admin.
