import { anon, as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let alice: string;
let staffA: string;
let staffB: string;
let manager: string;
let admin: string;
let orderA: string;
let orderB: string;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  alice = await createUser(db, { email: "alice@example.test", meta: { full_name: "Alice Customer" }, phone: "+97333001234" });
  staffA = await createUser(db, { email: "staff.a@example.test" });
  staffB = await createUser(db, { email: "staff.b@example.test" });
  manager = await createUser(db, { email: "manager@example.test" });
  admin = await createUser(db, { email: "admin@example.test" });
  await grantRole(db, staffA, "staff", fx.branchA);
  await grantRole(db, staffB, "staff", fx.branchB);
  await grantRole(db, manager, "manager");
  await grantRole(db, admin, "super_admin");
  orderA = (await asCommit(db, service, (tx) => placeOrder(tx, alice, orderPayload(fx)))).order_id;
  orderB = (await asCommit(db, service, (tx) => placeOrder(tx, alice, orderPayload(fx, { branch_id: fx.branchB })))).order_id;
});

const rpc = <T>(who: string | null, sql: string, params: unknown[] = []) =>
  as(db, who ? user(who) : anon, async (tx) => (await tx.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]!.r);

describe("order status RPC bound to the signed-in user", () => {
  test("assigned staff can advance their branch's order", async () => {
    const r = await rpc<{ status: string }>(staffA, "public.transition_order_status($1, 'confirmed')", [orderA]);
    expect(r.status).toBe("confirmed");
  });

  test("staff of another branch, customers and anon are refused", async () => {
    expect(await errorOf(rpc(staffB, "public.transition_order_status($1, 'confirmed')", [orderA]))).toBe("lahab.order_not_found");
    expect(await errorOf(rpc(alice, "public.transition_order_status($1, 'confirmed')", [orderA]))).toBe("lahab.order_not_found");
    expect(await errorOf(rpc(null, "public.transition_order_status($1, 'confirmed')", [orderA]))).toMatch(/permission denied/);
  });

  test("the actor is taken from the JWT, so the audit trail names the real user", async () => {
    await as(db, user(staffA), async (tx) => {
      await tx.query("select public.transition_order_status($1, 'confirmed')", [orderA]);
      const { rows } = await tx.query<{ changed_by: string }>(
        "select changed_by from public.order_status_history where order_id = $1 order by id desc limit 1",
        [orderA],
      );
      expect(rows[0]?.changed_by).toBe(staffA);
    });
  });
});

describe("dashboard", () => {
  test("staff see only their branch's numbers", async () => {
    const a = await rpc<{ orders_today: number }>(staffA, "public.admin_dashboard()");
    expect(a.orders_today).toBe(1);
    expect(await errorOf(rpc(staffA, "public.admin_dashboard($1)", [fx.branchB]))).toBe("lahab.forbidden");
  });

  test("managers see all branches; sales count only completed orders", async () => {
    const before = await rpc<{ orders_today: number; sales_today: string }>(manager, "public.admin_dashboard()");
    expect(before.orders_today).toBe(2);
    expect(Number(before.sales_today)).toBe(0);
    await as(db, user(manager), async (tx) => {
      for (const s of ["confirmed", "preparing", "ready", "completed"]) {
        await tx.query("select public.transition_order_status($1, $2)", [orderB, s]);
      }
      const after = (await tx.query<{ r: { sales_today: string; best_sellers: unknown[] } }>("select public.admin_dashboard() r")).rows[0]!.r;
      expect(Number(after.sales_today)).toBe(4);
      expect(after.best_sellers).toHaveLength(1);
    });
  });

  test("customers cannot read the dashboard", async () => {
    expect(await errorOf(rpc(alice, "public.admin_dashboard()"))).toBe("lahab.forbidden");
  });
});

describe("sales report", () => {
  test("managers only, with a bounded date range", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await rpc<{ totals: { orders: number }; daily: unknown[] }>(manager, "public.admin_sales_report($1::date, $1::date)", [today]);
    expect(r.totals.orders).toBe(2);
    expect(r.daily).toHaveLength(1);
    expect(await errorOf(rpc(staffA, "public.admin_sales_report($1::date, $1::date)", [today]))).toBe("lahab.forbidden");
    expect(await errorOf(rpc(manager, "public.admin_sales_report('2020-01-01', '2026-01-01')"))).toBe("lahab.invalid_request");
  });
});

describe("customers list", () => {
  test("managers see masked contact details; super admins see them in full", async () => {
    const masked = await as(db, user(manager), async (tx) =>
      (await tx.query<{ email: string; phone: string }>("select email, phone from public.admin_list_customers('alice')")).rows[0],
    );
    expect(masked).toEqual({ email: "a•••@example.test", phone: "+973•••234" });
    const full = await as(db, user(admin), async (tx) =>
      (await tx.query<{ email: string; phone: string }>("select email, phone from public.admin_list_customers('alice')")).rows[0],
    );
    expect(full).toEqual({ email: "alice@example.test", phone: "+97333001234" });
  });

  test("staff cannot list customers", async () => {
    await as(db, user(staffA), async (tx) => {
      expect(await errorOf(tx.query("select * from public.admin_list_customers()"))).toBe("lahab.forbidden");
    });
  });
});

describe("staff & roles", () => {
  test("super admin lists staff and grants roles by email", async () => {
    await as(db, user(admin), async (tx) => {
      const staff = await tx.query<{ email: string }>("select email from public.admin_list_staff()");
      expect(staff.rows.map((r) => r.email)).toEqual(expect.arrayContaining(["staff.a@example.test", "manager@example.test"]));
      expect(staff.rows.map((r) => r.email)).not.toContain("alice@example.test");
      await tx.query("select public.admin_set_role('ALICE@example.test', 'staff', true)");
      const roles = await tx.query<{ role: string }>("select role from public.user_roles where user_id = $1 order by role", [alice]);
      expect(roles.rows.map((r) => r.role)).toEqual(["customer", "staff"]);
    });
  });

  test("non-admins cannot grant roles or probe which emails exist", async () => {
    expect(await errorOf(rpc(manager, "public.admin_set_role('alice@example.test', 'manager', true)"))).toBe("lahab.forbidden");
    expect(await errorOf(rpc(manager, "public.admin_set_role('nobody@example.test', 'manager', true)"))).toBe("lahab.forbidden");
    expect(await errorOf(rpc(alice, "public.admin_set_role('alice@example.test', 'super_admin', true)"))).toBe("lahab.forbidden");
    expect(await errorOf(rpc(manager, "public.admin_list_staff()"))).toBe("lahab.forbidden");
  });

  test("unknown email is reported to super admins", async () => {
    expect(await errorOf(rpc(admin, "public.admin_set_role('nobody@example.test', 'staff', true)"))).toBe("lahab.user_not_found");
  });
});

describe("reordering", () => {
  test("managers reorder allowlisted tables; others are refused", async () => {
    await as(db, user(manager), async (tx) => {
      await tx.query("select public.admin_reorder('products', $1::uuid[])", [[fx.plate, fx.wrap]]);
      const { rows } = await tx.query<{ id: string }>("select id from public.products where id = any($1) order by sort_order", [[fx.plate, fx.wrap]]);
      expect(rows.map((r) => r.id)).toEqual([fx.plate, fx.wrap]);
    });
    expect(await errorOf(rpc(manager, "public.admin_reorder('user_roles', '{}')"))).toBe("lahab.invalid_request");
    expect(await errorOf(rpc(staffA, "public.admin_reorder('products', '{}')"))).toBe("lahab.forbidden");
  });
});
