import { randomUUID } from "node:crypto";
import { anon, as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let alice: string;
let staffA: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  alice = await createUser(db, { meta: { full_name: "Alice Customer" } });
  staffA = await createUser(db);
  manager = await createUser(db);
  await grantRole(db, staffA, "staff", fx.branchA);
  await grantRole(db, manager, "manager");
});

const quote = (items: unknown, coupon: string | null = null) =>
  as(db, anon, async (tx) =>
    (await tx.query<{ q: Record<string, unknown> }>("select public.quote_cart($1::jsonb, $2) q", [JSON.stringify(items), coupon]))
      .rows[0]!.q,
  );

describe("server-side pricing", () => {
  test("computes base, options and totals from the database", async () => {
    const q = await quote([
      { product_id: fx.wrap, quantity: 2, option_value_ids: [fx.sizeLarge, fx.extraCheese, fx.extraSauce] },
      { product_id: fx.plate, quantity: 1 },
    ]);
    // wrap: (1.200 + 0.500 + 0.300 + 0.200) × 2 = 4.400; plate 2.500
    expect(Number(q.subtotal)).toBe(4.9);
    expect(Number(q.options_total)).toBe(2);
    expect(Number(q.total)).toBe(6.9);
    expect(q.issues).toEqual([]);
  });

  test("ignores prices and totals supplied by the client", async () => {
    const q = await quote([{ product_id: fx.plate, quantity: 1, unit_price: 0.001, line_total: 0 }]);
    expect(Number(q.total)).toBe(2.5);
  });

  test("reports unavailable, archived and hidden products as issues", async () => {
    const q = await quote([
      { product_id: fx.unavailable, quantity: 1 },
      { product_id: fx.archived, quantity: 1 },
      { product_id: fx.hiddenProduct, quantity: 1 },
      { product_id: randomUUID(), quantity: 1 },
    ]);
    expect((q.issues as { code: string }[]).map((i) => i.code)).toEqual([
      "product_unavailable",
      "product_not_found",
      "product_not_found",
      "product_not_found",
    ]);
  });

  test("enforces option rules", async () => {
    const q = await quote([
      { product_id: fx.wrap, quantity: 1 }, // size required
      { product_id: fx.wrap, quantity: 1, option_value_ids: [fx.sizeLarge, fx.sizeRegular] }, // single choice
      { product_id: fx.wrap, quantity: 1, option_value_ids: [fx.sizeLarge, fx.extraSoldOut] },
      { product_id: fx.plate, quantity: 1, option_value_ids: [fx.sizeLarge] }, // not this product's option
    ]);
    expect((q.issues as { code: string }[]).map((i) => i.code)).toEqual([
      "option_selection_invalid",
      "option_selection_invalid",
      "option_unavailable",
      "option_invalid",
    ]);
  });

  test.each([0, -1, 21, 1.5, "2", null])("rejects invalid quantity %s", async (quantity) => {
    expect(await errorOf(quote([{ product_id: fx.plate, quantity }]))).toBe("lahab.invalid_quantity");
  });

  test("rejects empty carts and duplicate option ids", async () => {
    expect(await errorOf(quote([]))).toBe("lahab.cart_empty");
    expect(
      await errorOf(quote([{ product_id: fx.wrap, quantity: 1, option_value_ids: [fx.sizeLarge, fx.sizeLarge] }])),
    ).toBe("lahab.invalid_options");
  });

  test("applies coupons with limits and rejects expired ones", async () => {
    await db.exec(`
      insert into public.coupons (code, discount_type, value, max_discount) values ('SAVE10', 'percent', 10, 0.300);
      insert into public.coupons (code, discount_type, value, ends_at, starts_at)
        values ('OLD', 'fixed', 1, now() - interval '1 day', now() - interval '2 days');
    `);
    const q = await quote([{ product_id: fx.plate, quantity: 2 }], "save10");
    // 10% of 5.000 = 0.500, capped at 0.300
    expect(Number(q.discount_total)).toBe(0.3);
    expect(Number(q.total)).toBe(4.7);
    const expired = await quote([{ product_id: fx.plate, quantity: 1 }], "OLD");
    expect(expired.coupon).toMatchObject({ valid: false, reason: "expired" });
    expect(Number(expired.total)).toBe(2.5);
  });
});

describe("order creation", () => {
  test("creates an order with immutable price snapshots", async () => {
    await as(db, service, async (tx) => {
      const r = await placeOrder(tx, alice, orderPayload(fx));
      expect(r.order_number).toMatch(/^LH-\d{6}-\d{4}$/);
      expect(Number(r.total)).toBe(4); // (1.200 + 0.500 + 0.300) × 2
      expect(r.replayed).toBe(false);

      await tx.query("update public.products set base_price = 9.999 where id = $1", [fx.wrap]);
      const item = await tx.query<{ unit_base_price: string; line_total: string }>(
        "select unit_base_price, line_total from public.order_items where order_id = $1",
        [r.order_id],
      );
      expect(item.rows[0]).toEqual({ unit_base_price: "1.200", line_total: "4.000" });
      const opts = await tx.query("select value_name_en from public.order_item_options oi join public.order_items i on i.id = oi.order_item_id where i.order_id = $1", [r.order_id]);
      expect(opts.rows).toHaveLength(2);
      const pickup = await tx.query<{ vehicle_plate: string }>("select vehicle_plate from public.pickup_details where order_id = $1", [r.order_id]);
      expect(pickup.rows[0]?.vehicle_plate).toBe("12345");
      const history = await tx.query<{ to_status: string }>("select to_status from public.order_status_history where order_id = $1", [r.order_id]);
      expect(history.rows.map((h) => h.to_status)).toEqual(["pending"]);
    });
  });

  test("replays the same request instead of creating a duplicate", async () => {
    await as(db, service, async (tx) => {
      const payload = orderPayload(fx);
      const first = await placeOrder(tx, alice, payload);
      const second = await placeOrder(tx, alice, payload);
      expect(second).toMatchObject({ order_id: first.order_id, replayed: true });
      const n = await tx.query<{ n: number }>("select count(*)::int n from public.orders where idempotency_key = $1", [payload.idempotency_key]);
      expect(n.rows[0]?.n).toBe(1);
    });
  });

  test("rejects reusing an idempotency key for a different request", async () => {
    await as(db, service, async (tx) => {
      const payload = orderPayload(fx);
      await placeOrder(tx, alice, payload);
      expect(await errorOf(placeOrder(tx, alice, { ...payload, notes: "changed" }))).toBe("lahab.idempotency_key_reused");
    });
  });

  test.each([
    ["unavailable product", (f: MenuFixture) => ({ items: [{ product_id: f.unavailable, quantity: 1 }] }), "lahab.cart_invalid"],
    ["manipulated quantity", (f: MenuFixture) => ({ items: [{ product_id: f.plate, quantity: 500 }] }), "lahab.invalid_quantity"],
    ["delivery", () => ({ fulfillment_type: "delivery" }), "lahab.delivery_unavailable"],
    ["online payment", () => ({ payment_method: "online" }), "lahab.payment_method_unavailable"],
    ["bad plate", () => ({ vehicle: { plate: "<script>" } }), "lahab.vehicle_plate_invalid"],
    ["unknown branch", () => ({ branch_id: randomUUID() }), "lahab.branch_unavailable"],
    ["missing key", () => ({ idempotency_key: "nope" }), "lahab.invalid_request"],
    ["pickup in the past", () => ({ pickup_at: new Date(Date.now() - 3600_000).toISOString() }), "lahab.pickup_time_too_soon"],
    ["invalid coupon", () => ({ coupon_code: "NOPE" }), "lahab.coupon_invalid"],
  ])("rejects %s", async (_name, overrides, code) => {
    await as(db, service, async (tx) => {
      expect(await errorOf(placeOrder(tx, alice, orderPayload(fx, overrides(fx))))).toBe(code);
    });
  });

  test("requires a verified email and a phone number", async () => {
    const unverified = await createUser(db, { confirmed: false });
    const noPhone = await createUser(db, { phone: null });
    await as(db, service, async (tx) => {
      expect(await errorOf(placeOrder(tx, unverified, orderPayload(fx)))).toBe("lahab.email_not_verified");
    });
    await as(db, service, async (tx) => {
      expect(await errorOf(placeOrder(tx, noPhone, orderPayload(fx)))).toBe("lahab.phone_required");
    });
  });

  test("rejects orders when the branch is paused, closed or ordering is off", async () => {
    await as(db, service, async (tx) => {
      await tx.query("update public.branches set pickup_paused = true where id = $1", [fx.branchA]);
      expect(await errorOf(placeOrder(tx, alice, orderPayload(fx)))).toBe("lahab.pickup_paused");
    });
    await as(db, service, async (tx) => {
      await tx.query("delete from public.business_hours where branch_id = $1", [fx.branchA]);
      expect(await errorOf(placeOrder(tx, alice, orderPayload(fx)))).toBe("lahab.branch_closed");
    });
    await as(db, service, async (tx) => {
      await tx.query("update public.restaurant_settings set ordering_enabled = false");
      expect(await errorOf(placeOrder(tx, alice, orderPayload(fx)))).toBe("lahab.ordering_disabled");
    });
  });

  test("rate-limits order creation per customer", async () => {
    const spammer = await createUser(db);
    await as(db, service, async (tx) => {
      for (let i = 0; i < 5; i++) await placeOrder(tx, spammer, orderPayload(fx));
      expect(await errorOf(placeOrder(tx, spammer, orderPayload(fx)))).toBe("lahab.rate_limited");
    });
  });

  test("enforces pickup slot capacity", async () => {
    // Create users before opening the transaction: PGlite runs one query at a time.
    const other = await createUser(db);
    await as(db, service, async (tx) => {
      await tx.query("update public.branches set max_orders_per_slot = 1 where id = $1", [fx.branchA]);
      const at = new Date(Date.now() + 3 * 3600_000).toISOString();
      await placeOrder(tx, alice, orderPayload(fx, { pickup_at: at }));
      expect(await errorOf(placeOrder(tx, other, orderPayload(fx, { pickup_at: at })))).toBe("lahab.slot_full");
    });
  });
});

describe("order status workflow", () => {
  let orderId: string;
  beforeEach(async () => {
    const customer = await createUser(db);
    orderId = (await asCommit(db, service, (tx) => placeOrder(tx, customer, orderPayload(fx)))).order_id;
  });

  const move = (actor: string, to: string, reason?: string) =>
    as(db, service, (tx) => tx.query("select app.transition_order_status($1, $2, $3, $4)", [actor, orderId, to, reason ?? null]));
  const moveCommit = (actor: string, to: string) =>
    asCommit(db, service, (tx) => tx.query("select app.transition_order_status($1, $2, $3)", [actor, orderId, to]));

  test("follows pending → confirmed → preparing → ready → completed and records history", async () => {
    for (const s of ["confirmed", "preparing", "ready", "completed"]) await moveCommit(staffA, s);
    const { rows } = await db.query<{ to_status: string }>(
      "select to_status from public.order_status_history where order_id = $1 order by id",
      [orderId],
    );
    expect(rows.map((r) => r.to_status)).toEqual(["pending", "confirmed", "preparing", "ready", "completed"]);
    const order = await db.query<{ payment_status: string }>("select payment_status from public.orders where id = $1", [orderId]);
    expect(order.rows[0]?.payment_status).toBe("paid");
    const pickup = await db.query<{ arrival_status: string }>("select arrival_status from public.pickup_details where order_id = $1", [orderId]);
    expect(pickup.rows[0]?.arrival_status).toBe("handed_over");
  });

  test.each([["ready"], ["completed"], ["preparing"]])("rejects skipping from pending to %s", async (to) => {
    expect(await errorOf(move(staffA, to))).toBe("lahab.invalid_transition");
  });

  test("rejects moving a completed order", async () => {
    for (const s of ["confirmed", "preparing", "ready", "completed"]) await moveCommit(staffA, s);
    expect(await errorOf(move(manager, "cancelled", "Customer request"))).toBe("lahab.invalid_transition");
  });

  test("cancellation needs a reason; staff cannot cancel after preparation starts, managers can", async () => {
    expect(await errorOf(move(staffA, "cancelled"))).toBe("lahab.cancel_reason_required");
    await moveCommit(staffA, "confirmed");
    await moveCommit(staffA, "preparing");
    expect(await errorOf(move(staffA, "cancelled", "Out of bread"))).toBe("lahab.forbidden");
    await move(manager, "cancelled", "Out of bread");
  });

  test("customers can cancel only their own pending orders", async () => {
    const owner = (await db.query<{ customer_id: string }>("select customer_id from public.orders where id = $1", [orderId])).rows[0]!.customer_id;
    await move(owner, "cancelled", "Changed my mind");
    expect(await errorOf(move(alice, "cancelled", "Not mine"))).toBe("lahab.order_not_found");
    await moveCommit(staffA, "confirmed");
    expect(await errorOf(move(owner, "cancelled", "Too late"))).toBe("lahab.order_not_found");
    expect(await errorOf(move(owner, "preparing"))).toBe("lahab.order_not_found");
  });
});
