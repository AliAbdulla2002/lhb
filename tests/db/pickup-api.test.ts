import { randomUUID } from "node:crypto";
import { anon, as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

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

async function confirmed() {
  const customer = await createUser(db);
  const { order_id } = await asCommit(db, service, (tx) => placeOrder(tx, customer, orderPayload(fx)));
  await asCommit(db, user(staffA), (tx) => tx.query("select public.transition_order_status($1, 'confirmed')", [order_id]));
  return { customer, orderId: order_id };
}

const honk = (who: string | null, orderId: string, requestId = randomUUID()) =>
  asCommit(db, who ? user(who) : anon, async (tx) =>
    (await tx.query<{ r: { arrival_status: string; notify_count: number; replayed: boolean } }>("select public.notify_arrival($1, $2) r", [orderId, requestId])).rows[0]!.r,
  );

test("the customer who placed the order can notify; staff see it in the queue", async () => {
  const { customer, orderId } = await confirmed();
  expect(await honk(customer, orderId)).toMatchObject({ arrival_status: "arrived", notify_count: 1 });
  const queue = await as(db, user(staffA), async (tx) =>
    (await tx.query<{ order_id: string; arrival_status: string; branch_name_en: string }>("select order_id, arrival_status, branch_name_en from public.staff_pickup_queue where order_id = $1", [orderId])).rows,
  );
  expect(queue).toEqual([{ order_id: orderId, arrival_status: "arrived", branch_name_en: "Branch A" }]);
});

test("nobody else can notify for the order", async () => {
  const { orderId } = await confirmed();
  const stranger = await createUser(db);
  expect(await errorOf(honk(stranger, orderId))).toBe("lahab.order_not_found");
  expect(await errorOf(honk(staffA, orderId))).toBe("lahab.order_not_found");
  expect(await errorOf(honk(null, orderId))).toMatch(/permission denied/);
});

test("retries with the same request id are replayed, not counted", async () => {
  const { customer, orderId } = await confirmed();
  const id = randomUUID();
  await honk(customer, orderId, id);
  expect(await honk(customer, orderId, id)).toMatchObject({ replayed: true, notify_count: 1 });
});

test("cooldown errors carry the seconds to wait", async () => {
  const { customer, orderId } = await confirmed();
  await honk(customer, orderId);
  await as(db, user(customer), async (tx) => {
    try {
      await tx.query("select public.notify_arrival($1, $2)", [orderId, randomUUID()]);
      throw new Error("expected cooldown");
    } catch (e) {
      const err = e as { message: string; detail?: string };
      expect(err.message).toBe("lahab.notify_cooldown");
      const seconds = JSON.parse(err.detail ?? "{}").retry_after_seconds;
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(60);
    }
  });
});

test("staff of another branch do not see the arrival in their queue", async () => {
  const { customer, orderId } = await confirmed();
  await honk(customer, orderId);
  const rows = await as(db, user(staffB), async (tx) => (await tx.query("select 1 from public.staff_pickup_queue where order_id = $1", [orderId])).rows);
  expect(rows).toHaveLength(0);
});
