import { createTestDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

test("every table in the public schema has row-level security enabled", async () => {
  const { rows } = await db.query<{ relname: string }>(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  );
  expect(rows).toEqual([]);
});

test("anonymous visitors cannot write to any table", async () => {
  const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
    `select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
  );
  expect(rows).toEqual([]);
});

test("signed-in users have no direct write access to orders, payments, roles, pickup events or audit logs", async () => {
  const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
    `select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name in ('orders', 'order_items', 'order_item_options', 'order_status_history', 'payments', 'user_roles',
                          'audit_logs', 'pickup_details', 'pickup_arrival_events', 'coupon_redemptions')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
  );
  expect(rows).toEqual([]);
});

test("the private app schema is not usable by API roles", async () => {
  const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
    `select has_schema_privilege('anon', 'app', 'USAGE') as anon, has_schema_privilege('authenticated', 'app', 'USAGE') as authenticated`,
  );
  expect(rows[0]).toEqual({ anon: false, authenticated: false });
});

test("every SECURITY DEFINER function pins its search_path", async () => {
  const { rows } = await db.query<{ fn: string }>(
    `select n.nspname || '.' || p.proname as fn
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
  );
  expect(rows).toEqual([]);
});

test("anonymous callers can execute only the intended public functions", async () => {
  const { rows } = await db.query<{ proname: string }>(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by 1`,
  );
  expect(rows.map((r) => r.proname)).toEqual(["can_access_branch", "can_read_order", "get_pickup_slots", "has_min_role", "is_branch_open", "quote_cart"]);
});
