/**
 * Runs the real Supabase migrations inside PGlite (Postgres 18 compiled to WASM) with a
 * minimal stand-in for the Supabase platform: the anon/authenticated/service_role roles,
 * auth.users + auth.uid(), and storage.buckets/objects. This lets RLS and business
 * logic be tested without Docker. It is not a replacement for running the suite against
 * the real local stack (`supabase test db`) before production — see docs/TESTING.md.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../supabase/migrations");

const PLATFORM_STUB = /* sql */ `
  create schema extensions;
  create extension citext with schema extensions;
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant usage on schema public to service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      ), ''
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;

  create publication supabase_realtime;
`;

export type Db = PGlite;
export type Identity = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

export const anon: Identity = { kind: "anon" };
export const service: Identity = { kind: "service" };
export const user = (id: string): Identity => ({ kind: "user", id });

export async function createTestDb(): Promise<Db> {
  const db = await PGlite.create({ extensions: { citext } });
  await db.exec(PLATFORM_STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

/** Run `fn` as the given identity inside a transaction that is always rolled back. */
export async function as<T>(db: Db, who: Identity, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (who.kind === "service") {
        await tx.exec("set local role service_role");
      } else {
        await tx.exec(`set local role ${who.kind === "anon" ? "anon" : "authenticated"}`);
        const claims = who.kind === "user" ? { sub: who.id, role: "authenticated" } : { role: "anon" };
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      }
      try {
        result = await fn(tx);
      } catch (error) {
        failure = error;
      }
      await tx.rollback();
    })
    .catch(() => undefined);
  if (failure) throw failure;
  return result as T;
}

/** Like `as`, but commits. Use for setup steps that later assertions depend on. */
export async function asCommit<T>(db: Db, who: Identity, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (who.kind === "service") {
      await tx.exec("set local role service_role");
    } else {
      await tx.exec(`set local role ${who.kind === "anon" ? "anon" : "authenticated"}`);
      const claims = who.kind === "user" ? { sub: who.id, role: "authenticated" } : { role: "anon" };
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    }
    return fn(tx);
  });
}

export async function createUser(
  db: Db,
  opts: { email?: string; confirmed?: boolean; meta?: Record<string, unknown>; phone?: string | null } = {},
): Promise<string> {
  const email = opts.email ?? `user-${randomUUID()}@example.test`;
  const meta = { full_name: "Test Customer", ...(opts.meta ?? {}) };
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id",
    [email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(meta)],
  );
  const id = rows[0]!.id;
  const phone = opts.phone === undefined ? "+97333000000" : opts.phone;
  await db.query("update public.profiles set phone = $2 where id = $1", [id, phone]);
  return id;
}

export async function grantRole(db: Db, userId: string, role: "staff" | "manager" | "super_admin", branchId?: string) {
  await db.query("insert into public.user_roles (user_id, role) values ($1, $2) on conflict do nothing", [userId, role]);
  if (branchId) {
    await db.query(
      "insert into public.staff_branch_assignments (user_id, branch_id) values ($1, $2) on conflict do nothing",
      [userId, branchId],
    );
  }
}

export interface MenuFixture {
  branchA: string;
  branchB: string;
  category: string;
  hiddenCategory: string;
  wrap: string; // 1.200, size option (required, single) + extras (optional, multi)
  plate: string; // 2.500, no options
  unavailable: string;
  archived: string;
  hiddenProduct: string;
  sizeRegular: string;
  sizeLarge: string; // +0.500
  extraCheese: string; // +0.300
  extraSauce: string; // +0.200
  extraSoldOut: string; // unavailable value
}

/** Deterministic fixture: two always-open branches and a small menu. Committed. */
export async function seedMenu(db: Db): Promise<MenuFixture> {
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, params)).rows[0]!.id;

  await db.exec(`update public.restaurant_settings set ordering_enabled = true, cash_on_pickup_enabled = true`);

  const branchA = await one(
    `insert into public.branches (slug, name_ar, name_en, max_orders_per_slot, pickup_lead_minutes)
     values ('branch-a', 'فرع أ', 'Branch A', 100, 10) returning id`,
  );
  const branchB = await one(
    `insert into public.branches (slug, name_ar, name_en, max_orders_per_slot) values ('branch-b', 'فرع ب', 'Branch B', 100) returning id`,
  );
  for (const b of [branchA, branchB]) {
    // Open 24 hours, every day.
    await db.query(
      `insert into public.business_hours (branch_id, weekday, opens_at, closes_at, closes_next_day)
       select $1, d, '00:00', '00:00', true from generate_series(0, 6) d`,
      [b],
    );
  }

  const category = await one(
    `insert into public.categories (slug, name_ar, name_en, sort_order) values ('wraps', 'لفائف', 'Wraps', 1) returning id`,
  );
  const hiddenCategory = await one(
    `insert into public.categories (slug, name_ar, name_en, is_visible) values ('hidden', 'مخفي', 'Hidden', false) returning id`,
  );

  const product = (slug: string, price: string, opts: { available?: boolean; archived?: boolean; cat?: string } = {}) =>
    one(
      `insert into public.products (category_id, slug, name_ar, name_en, base_price, is_available, archived_at)
       values ($1, $2, $2, $2, $3, $4, case when $5 then now() end) returning id`,
      [opts.cat ?? category, slug, price, opts.available ?? true, opts.archived ?? false],
    );

  const wrap = await product("test-wrap", "1.200");
  const plate = await product("test-plate", "2.500");
  const unavailable = await product("test-unavailable", "1.000", { available: false });
  const archived = await product("test-archived", "1.000", { archived: true });
  const hiddenProduct = await product("hidden-item", "1.000", { cat: hiddenCategory });

  const size = await one(
    `insert into public.product_options (product_id, name_ar, name_en, min_select, max_select, sort_order)
     values ($1, 'الحجم', 'Size', 1, 1, 1) returning id`,
    [wrap],
  );
  const extras = await one(
    `insert into public.product_options (product_id, name_ar, name_en, min_select, max_select, sort_order)
     values ($1, 'إضافات', 'Extras', 0, 3, 2) returning id`,
    [wrap],
  );
  const value = (option: string, name: string, delta: string, available = true) =>
    one(
      `insert into public.product_option_values (option_id, name_ar, name_en, price_delta, is_available)
       values ($1, $2, $2, $3, $4) returning id`,
      [option, name, delta, available],
    );

  return {
    branchA,
    branchB,
    category,
    hiddenCategory,
    wrap,
    plate,
    unavailable,
    archived,
    hiddenProduct,
    sizeRegular: await value(size, "Regular", "0"),
    sizeLarge: await value(size, "Large", "0.500"),
    extraCheese: await value(extras, "Cheese", "0.300"),
    extraSauce: await value(extras, "Sauce", "0.200"),
    extraSoldOut: await value(extras, "Sold out", "0.100", false),
  };
}

/** Postgres error message for a rejected promise, e.g. "lahab.cart_invalid". */
export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("Expected the operation to fail, but it succeeded");
}

export const placeOrder = (tx: Transaction, actor: string, payload: Record<string, unknown>) =>
  tx
    .query<{ result: { order_id: string; order_number: string; total: string; status: string; replayed: boolean } }>(
      "select app.place_order($1, $2::jsonb) as result",
      [actor, JSON.stringify(payload)],
    )
    .then((r) => r.rows[0]!.result);

export const orderPayload = (fx: MenuFixture, overrides: Record<string, unknown> = {}) => ({
  idempotency_key: randomUUID(),
  branch_id: fx.branchA,
  fulfillment_type: "pickup",
  payment_method: "cash_on_pickup",
  pickup_at: null,
  items: [{ product_id: fx.wrap, quantity: 2, option_value_ids: [fx.sizeLarge, fx.extraCheese] }],
  vehicle: { plate: "12345", color: "white" },
  ...overrides,
});
