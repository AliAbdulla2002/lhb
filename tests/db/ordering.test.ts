import { anon, as, asCommit, createTestDb, createUser, errorOf, orderPayload, seedMenu, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  alice = await createUser(db);
  bob = await createUser(db);
});

const place = (who: string, payload: object) =>
  as(db, user(who), async (tx) => (await tx.query<{ r: { order_id: string; total: string; replayed: boolean } }>("select public.place_order($1::jsonb) r", [JSON.stringify(payload)])).rows[0]!.r);

describe("place_order (signed-in customer)", () => {
  test("creates the order for the JWT subject with server prices", async () => {
    await as(db, user(alice), async (tx) => {
      const r = (await tx.query<{ r: { order_id: string; total: string } }>("select public.place_order($1::jsonb) r", [JSON.stringify(orderPayload(fx))])).rows[0]!.r;
      expect(Number(r.total)).toBe(4);
      const owner = await tx.query<{ customer_id: string }>("select customer_id from public.orders where id = $1", [r.order_id]);
      expect(owner.rows[0]?.customer_id).toBe(alice);
    });
  });

  test("anonymous callers cannot place orders", async () => {
    await as(db, anon, async (tx) => {
      expect(await errorOf(tx.query("select public.place_order($1::jsonb)", [JSON.stringify(orderPayload(fx))]))).toMatch(/permission denied/);
    });
  });

  test("a retried request returns the same order, even across separate calls", async () => {
    const payload = orderPayload(fx);
    const first = await asCommit(db, user(bob), async (tx) =>
      (await tx.query<{ r: { order_id: string } }>("select public.place_order($1::jsonb) r", [JSON.stringify(payload)])).rows[0]!.r,
    );
    const second = await place(bob, payload);
    expect(second).toMatchObject({ order_id: first.order_id, replayed: true });
  });

  test("the same idempotency key from a different customer is a different order", async () => {
    const payload = orderPayload(fx);
    const a = await asCommit(db, user(alice), async (tx) =>
      (await tx.query<{ r: { order_id: string } }>("select public.place_order($1::jsonb) r", [JSON.stringify(payload)])).rows[0]!.r,
    );
    const b = await place(bob, payload);
    expect(b.order_id).not.toBe(a.order_id);
    expect(b.replayed).toBe(false);
  });
});

describe("pickup slots", () => {
  test("returns future slots on the slot grid, respecting lead time", async () => {
    const slots = await as(db, anon, async (tx) =>
      (await tx.query<{ slot_start: Date; available: boolean }>("select * from public.get_pickup_slots($1, 2)", [fx.branchA])).rows,
    );
    expect(slots.length).toBeGreaterThan(0);
    const leadMs = 10 * 60_000; // fixture lead time
    for (const s of slots) {
      const t = new Date(s.slot_start).getTime();
      expect(t).toBeGreaterThanOrEqual(Date.now() + leadMs - 1000);
      expect(new Date(s.slot_start).getUTCMinutes() % 15).toBe(0);
    }
  });

  test("full slots are marked unavailable", async () => {
    // Capacity is a branch setting; change it as the database owner for this check.
    await db.query("update public.branches set max_orders_per_slot = 1 where id = $1", [fx.branchA]);
    const first = await as(db, anon, async (tx) => (await tx.query<{ slot_start: Date }>("select slot_start from public.get_pickup_slots($1, 3) limit 1 offset 2", [fx.branchA])).rows[0]!.slot_start);
    await asCommit(db, user(bob), (tx) => tx.query("select public.place_order($1::jsonb)", [JSON.stringify(orderPayload(fx, { pickup_at: new Date(first).toISOString() }))]));
    const after = await as(db, anon, async (tx) =>
      (await tx.query<{ available: boolean }>("select available from public.get_pickup_slots($1, 3) where slot_start = $2", [fx.branchA, first])).rows[0],
    );
    expect(after?.available).toBe(false);
    await db.query("update public.branches set max_orders_per_slot = 100 where id = $1", [fx.branchA]);
  });

  test("paused or closed branches offer no slots", async () => {
    await db.query("update public.branches set pickup_paused = true where id = $1", [fx.branchB]);
    const n = await as(db, anon, async (tx) => (await tx.query<{ n: number }>("select count(*)::int n from public.get_pickup_slots($1)", [fx.branchB])).rows[0]!.n);
    expect(n).toBe(0);
    await db.query("update public.branches set pickup_paused = false where id = $1", [fx.branchB]);
  });
});
