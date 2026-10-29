import { randomUUID } from "node:crypto";
import { as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let staffA: string;
let staffB: string;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  staffA = await createUser(db);
  staffB = await createUser(db);
  await grantRole(db, staffA, "staff", fx.branchA);
  await grantRole(db, staffB, "staff", fx.branchB);
});

async function confirmedOrder() {
  const customer = await createUser(db);
  const { order_id } = await asCommit(db, service, (tx) => placeOrder(tx, customer, orderPayload(fx)));
  await asCommit(db, service, (tx) => tx.query("select app.transition_order_status($1, $2, 'confirmed')", [staffA, order_id]));
  return { customer, orderId: order_id };
}

const notify = (actor: string, orderId: string, requestId: string = randomUUID()) =>
  asCommit(db, service, async (tx) =>
    (await tx.query<{ r: { arrival_status: string; notify_count: number; replayed: boolean } }>(
      "select app.notify_arrival($1, $2, $3) r",
      [actor, orderId, requestId],
    )).rows[0]!.r,
  );

const acknowledge = (actor: string, orderId: string) =>
  asCommit(db, service, async (tx) =>
    (await tx.query<{ r: { arrival_status: string; replayed: boolean } }>("select app.acknowledge_arrival($1, $2) r", [actor, orderId]))
      .rows[0]!.r,
  );

describe("customer arrival notification (digital horn)", () => {
  test("notifies staff for an active order and persists the event", async () => {
    const { customer, orderId } = await confirmedOrder();
    const r = await notify(customer, orderId);
    expect(r).toMatchObject({ arrival_status: "arrived", notify_count: 1, replayed: false });

    const queue = await as(db, user(staffA), async (tx) =>
      (await tx.query<{ order_id: string; arrival_status: string }>("select order_id, arrival_status from public.staff_pickup_queue")).rows,
    );
    expect(queue).toContainEqual({ order_id: orderId, arrival_status: "arrived" });

    const events = await as(db, user(staffA), async (tx) =>
      (await tx.query<{ event_type: string }>("select event_type from public.pickup_arrival_events where order_id = $1", [orderId])).rows,
    );
    expect(events.map((e) => e.event_type)).toEqual(["arrived"]);
  });

  test("a retried request (same client id) is deduplicated", async () => {
    const { customer, orderId } = await confirmedOrder();
    const requestId = randomUUID();
    await notify(customer, orderId, requestId);
    const again = await notify(customer, orderId, requestId);
    expect(again).toMatchObject({ replayed: true, notify_count: 1 });
  });

  test("repeated presses are rate-limited by a cooldown and a per-order cap", async () => {
    const { customer, orderId } = await confirmedOrder();
    await notify(customer, orderId);
    expect(await errorOf(notify(customer, orderId))).toBe("lahab.notify_cooldown");

    // Simulate the cooldown passing, then the per-order cap.
    await db.query("update public.pickup_details set last_notified_at = now() - interval '2 minutes' where order_id = $1", [orderId]);
    const second = await notify(customer, orderId);
    expect(second.notify_count).toBe(2);
    await db.query(
      "update public.pickup_details set notify_count = 5, last_notified_at = now() - interval '2 minutes' where order_id = $1",
      [orderId],
    );
    expect(await errorOf(notify(customer, orderId))).toBe("lahab.notify_limit");
  });

  test("other customers cannot notify for someone else's order", async () => {
    const { orderId } = await confirmedOrder();
    const stranger = await createUser(db);
    expect(await errorOf(notify(stranger, orderId))).toBe("lahab.order_not_found");
    expect(await errorOf(notify(stranger, randomUUID()))).toBe("lahab.order_not_found");
  });

  test("rejects pending, cancelled, completed and expired orders", async () => {
    const pendingCustomer = await createUser(db);
    const pending = await asCommit(db, service, (tx) => placeOrder(tx, pendingCustomer, orderPayload(fx)));
    expect(await errorOf(notify(pendingCustomer, pending.order_id))).toBe("lahab.order_not_confirmed");

    const cancelled = await confirmedOrder();
    await asCommit(db, service, (tx) =>
      tx.query("select app.transition_order_status($1, $2, 'cancelled', 'Test cancellation')", [staffA, cancelled.orderId]),
    );
    expect(await errorOf(notify(cancelled.customer, cancelled.orderId))).toBe("lahab.order_closed");

    const completed = await confirmedOrder();
    for (const s of ["preparing", "ready", "completed"]) {
      await asCommit(db, service, (tx) => tx.query("select app.transition_order_status($1, $2, $3)", [staffA, completed.orderId, s]));
    }
    expect(await errorOf(notify(completed.customer, completed.orderId))).toBe("lahab.order_closed");

    const old = await confirmedOrder();
    await db.query("update public.orders set created_at = now() - interval '13 hours' where id = $1", [old.orderId]);
    expect(await errorOf(notify(old.customer, old.orderId))).toBe("lahab.order_expired");
  });
});

describe("staff acknowledgement", () => {
  test("assigned staff acknowledge; the customer sees it", async () => {
    const { customer, orderId } = await confirmedOrder();
    await notify(customer, orderId);
    expect(await acknowledge(staffA, orderId)).toMatchObject({ arrival_status: "acknowledged", replayed: false });
    expect(await acknowledge(staffA, orderId)).toMatchObject({ replayed: true });

    const seen = await as(db, user(customer), async (tx) =>
      (await tx.query<{ arrival_status: string }>("select arrival_status from public.pickup_details where order_id = $1", [orderId])).rows[0],
    );
    expect(seen?.arrival_status).toBe("acknowledged");
  });

  test("staff of another branch cannot see or acknowledge the arrival", async () => {
    const { customer, orderId } = await confirmedOrder();
    await notify(customer, orderId);
    expect(await errorOf(acknowledge(staffB, orderId))).toBe("lahab.order_not_found");
    const visible = await as(db, user(staffB), async (tx) =>
      (await tx.query("select 1 from public.pickup_arrival_events where order_id = $1", [orderId])).rows,
    );
    expect(visible).toHaveLength(0);
  });

  test("customers cannot acknowledge their own arrival", async () => {
    const { customer, orderId } = await confirmedOrder();
    await notify(customer, orderId);
    expect(await errorOf(acknowledge(customer, orderId))).toBe("lahab.order_not_found");
  });

  test("cannot acknowledge before the customer has arrived", async () => {
    const { orderId } = await confirmedOrder();
    expect(await errorOf(acknowledge(staffA, orderId))).toBe("lahab.invalid_transition");
  });
});
