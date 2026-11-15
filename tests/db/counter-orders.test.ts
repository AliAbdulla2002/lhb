import { randomUUID } from "node:crypto";
import { as, asCommit, createTestDb, createUser, errorOf, grantRole, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let staffA: string;
let staffB: string;
let manager: string;
let customer: string;

type Placed = { order_id: string; order_number: string; status: string; total: string; replayed: boolean; linked_customer: boolean };

const payload = (overrides: Record<string, unknown> = {}) => ({
  idempotency_key: randomUUID(),
  branch_id: fx.branchA,
  payment: "cash",
  items: [{ product_id: fx.wrap, quantity: 2, option_value_ids: [fx.sizeLarge, fx.extraCheese] }],
  ...overrides,
});

const place = (who: string, body: Record<string, unknown>) =>
  asCommit(db, user(who), async (tx) =>
    (await tx.query<{ r: Placed }>("select public.staff_place_counter_order($1::jsonb) as r", [JSON.stringify(body)])).rows[0]!.r,
  );

const orderRow = (id: string) =>
  as(db, service, async (tx) =>
    (
      await tx.query<Record<string, unknown>>(
        `select o.source, o.status, o.payment_method, o.payment_status, o.customer_id, o.customer_phone, o.customer_name, o.created_by,
                o.total, d.vehicle_plate, d.vehicle_color, d.arrival_status, p.status as payment_row
           from public.orders o join public.pickup_details d on d.order_id = o.id join public.payments p on p.order_id = o.id
          where o.id = $1`,
        [id],
      )
    ).rows[0]!,
  );

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  staffA = await createUser(db, { email: "staff-a@example.test" });
  staffB = await createUser(db, { email: "staff-b@example.test" });
  manager = await createUser(db, { email: "boss@example.test" });
  customer = await createUser(db, { email: "walkin@example.test", meta: { full_name: "Hasan Ali" }, phone: "+97336001122" });
  await grantRole(db, staffA, "staff", fx.branchA);
  await grantRole(db, staffB, "staff", fx.branchB);
  await grantRole(db, manager, "manager");
});

describe("counter orders", () => {
  test("staff take an order: server-priced, confirmed, paid, recorded as counter", async () => {
    const r = await place(staffA, payload({ payment: "card" }));
    expect(r.status).toBe("confirmed");
    expect(Number(r.total)).toBeCloseTo(4, 3); // (1.200 + 0.500 + 0.300) × 2
    expect(r.order_number).toMatch(/^LH-\d{6}-\d{4}$/);
    const o = await orderRow(r.order_id);
    expect(o).toMatchObject({ source: "counter", status: "confirmed", payment_method: "card", payment_status: "paid", payment_row: "paid", created_by: staffA });
    expect(o.customer_id).toBeNull();
    expect(o.vehicle_plate).toBeNull();
    expect(o.arrival_status).toBe("not_arrived");
  });

  test("a car taken at the window goes on the pickup board as already waiting", async () => {
    const r = await place(staffA, payload({ vehicle: { plate: " 123 456 ", color: "black" } }));
    const o = await orderRow(r.order_id);
    expect(o).toMatchObject({ vehicle_plate: "123 456", vehicle_color: "black", arrival_status: "acknowledged" });
    const queue = await as(db, user(staffA), async (tx) =>
      (await tx.query<{ source: string }>("select source from public.staff_pickup_queue where order_id = $1", [r.order_id])).rows,
    );
    expect(queue).toEqual([{ source: "counter" }]);
  });

  test("a phone that matches one customer links the order to their account", async () => {
    const r = await place(staffA, payload({ customer: { phone: "3600 1122" } }));
    expect(r.linked_customer).toBe(true);
    const o = await orderRow(r.order_id);
    expect(o).toMatchObject({ customer_id: customer, customer_phone: "+97336001122", customer_name: "Hasan Ali" });
    const mine = await as(db, user(customer), async (tx) => (await tx.query("select id from public.orders where id = $1", [r.order_id])).rows);
    expect(mine).toHaveLength(1);
  });

  test("an unknown number is kept on the order but links nothing", async () => {
    const r = await place(staffA, payload({ customer: { phone: "+973 3999 8888", name: "Walk-in" } }));
    expect(r.linked_customer).toBe(false);
    expect(await orderRow(r.order_id)).toMatchObject({ customer_id: null, customer_phone: "+97339998888", customer_name: "Walk-in" });
  });

  test("pay on handover: unpaid until completed, then settled", async () => {
    const r = await place(staffA, payload({ paid: false, vehicle: { plate: "5555" } }));
    expect(await orderRow(r.order_id)).toMatchObject({ payment_status: "unpaid", payment_row: "unpaid" });
    await asCommit(db, user(staffA), async (tx) => {
      for (const s of ["preparing", "ready", "completed"]) await tx.query("select public.transition_order_status($1, $2)", [r.order_id, s]);
    });
    expect(await orderRow(r.order_id)).toMatchObject({ status: "completed", payment_status: "paid", payment_row: "paid", arrival_status: "handed_over" });
  });

  test("retrying the same request returns the same order", async () => {
    const body = payload();
    const first = await place(staffA, body);
    const again = await place(staffA, body);
    expect(again).toMatchObject({ order_id: first.order_id, replayed: true });
    expect(await errorOf(place(staffA, { ...body, payment: "card" }))).toBe("lahab.idempotency_key_reused");
  });

  test("staff can only take orders for their own branch; managers for any", async () => {
    expect(await errorOf(place(staffB, payload()))).toBe("lahab.forbidden");
    expect((await place(manager, payload({ branch_id: fx.branchB }))).status).toBe("confirmed");
  });

  test("customers and anonymous visitors cannot place counter orders", async () => {
    expect(await errorOf(place(customer, payload()))).toBe("lahab.forbidden");
    const anonErr = await errorOf(
      as(db, { kind: "anon" }, (tx) => tx.query("select public.staff_place_counter_order($1::jsonb)", [JSON.stringify(payload())])),
    );
    expect(anonErr).toMatch(/permission denied/);
  });

  test("rejects bad input: empty basket, unavailable item, bad plate, bad phone, bad payment", async () => {
    expect(await errorOf(place(staffA, payload({ items: [] })))).toBe("lahab.cart_empty");
    expect(await errorOf(place(staffA, payload({ items: [{ product_id: fx.unavailable, quantity: 1, option_value_ids: [] }] })))).toBe("lahab.cart_invalid");
    expect(await errorOf(place(staffA, payload({ vehicle: { plate: "!!" } })))).toBe("lahab.vehicle_plate_invalid");
    expect(await errorOf(place(staffA, payload({ customer: { phone: "123" } })))).toBe("lahab.phone_invalid");
    expect(await errorOf(place(staffA, payload({ payment: "bitcoin" })))).toBe("lahab.invalid_request");
  });

  test("sales report splits online and counter orders", async () => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(new Date());
    const report = await as(db, user(manager), async (tx) =>
      (await tx.query<{ r: { by_source: Record<string, { orders: number }> } }>("select public.admin_sales_report($1, $1) as r", [day])).rows[0]!.r,
    );
    expect(report.by_source.counter!.orders).toBeGreaterThanOrEqual(7);
    expect(report.by_source.online!.orders).toBe(0);
  });

  test("completed walk-in orders with a phone enter invoice draws, keyed by the number", async () => {
    const r = await place(staffA, payload({ customer: { phone: "39998888" } }));
    await asCommit(db, user(staffA), async (tx) => {
      for (const s of ["preparing", "ready", "completed"]) await tx.query("select public.transition_order_status($1, $2)", [r.order_id, s]);
    });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(new Date());
    // Internal helper (reached through admin_draw_orders); queried here as the database owner.
    const keys = (await db.query<{ entry_key: string }>("select entry_key from app.giveaway_order_entries($1, $1, null, 0, true)", [day])).rows.map((x) => x.entry_key);
    expect(keys).toContain("tel:39998888");
  });
});
