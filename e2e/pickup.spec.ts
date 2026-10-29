import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL, stubSupabase } from "./fixtures/supabase-stub";
import { signIn } from "./fixtures/admin-stub";

const ORDER_NUMBER = "LH-261029-0042";
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

function customerOrder(arrival: string, extra: Record<string, unknown> = {}) {
  return {
    id: "o42", order_number: ORDER_NUMBER, fulfillment_type: "pickup", status: "preparing", payment_method: "cash_on_pickup",
    payment_status: "unpaid", requested_pickup_at: new Date().toISOString(), subtotal: 2, options_total: 1, discount_total: 0, total: 3,
    coupon_code: null, notes: null, cancel_reason: null, created_at: new Date().toISOString(),
    branches: { name_ar: "عالي", name_en: "A'ali", address_ar: null, address_en: null, pickup_instructions_ar: "اوقف في مواقف الاستلام.", pickup_instructions_en: null },
    pickup_details: { vehicle_plate: "AB 123", vehicle_color: "blue", arrival_status: arrival, last_notified_at: null, notify_count: 0, ...extra },
    order_items: [],
  };
}

type Outcome = "ok" | "network" | "slow" | { code: string; details?: string };

async function stubPickup(page: Page, outcomes: Outcome[] = ["ok"]) {
  const calls: { p_order_id: string; p_client_request_id: string }[] = [];
  let arrival = "not_arrived";
  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const path = new URL(req.url()).pathname.replace("/rest/v1/", "");
    if (path === "rpc/my_roles") return route.fulfill(json(["customer"]));
    if (path === "orders") return route.fulfill(json(customerOrder(arrival, arrival === "arrived" ? { notify_count: 1, last_notified_at: new Date(Date.now() - 90_000).toISOString() } : {})));
    if (path === "rpc/notify_arrival") {
      calls.push(req.postDataJSON());
      const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)]!;
      if (outcome === "network") return route.abort("failed");
      if (typeof outcome === "object") return route.fulfill(json({ code: "P0001", message: `lahab.${outcome.code}`, details: outcome.details ?? "", hint: null }, 400));
      if (outcome === "slow") await new Promise((r) => setTimeout(r, 1200));
      arrival = "arrived";
      return route.fulfill(json({ order_id: "o42", arrival_status: "arrived", arrived_at: new Date().toISOString(), notify_count: 1, replayed: false }));
    }
    return route.fallback();
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await signIn(page, "sara@example.test");
});

test("pickup screen shows the order, car and branch, and the horn notifies once per tap", async ({ page }) => {
  const calls = await stubPickup(page, ["slow"]);
  await page.goto(`/orders/${ORDER_NUMBER}/pickup`);
  await expect(page.getByText("AB 123")).toBeVisible();
  await expect(page.getByText("اوقف في مواقف الاستلام.")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/pickup-${test.info().project.name}.png`, fullPage: true });

  const horn = page.getByRole("button", { name: /وصلت/ });
  await horn.dblclick();
  await expect(page.getByText("تم إبلاغ لهب إنك وصلت.").first()).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.p_order_id).toBe("o42");
  expect(calls[0]!.p_client_request_id).toMatch(/^[0-9a-f-]{36}$/);
  await page.screenshot({ path: `test-results/screens/pickup-notified-${test.info().project.name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a failed notification can be retried safely with the same request id", async ({ page }) => {
  const calls = await stubPickup(page, ["network", "ok"]);
  await page.goto(`/orders/${ORDER_NUMBER}/pickup`);
  const horn = page.getByRole("button", { name: /وصلت/ });
  await horn.click();
  await expect(page.getByText("ما قدرنا نرسل التنبيه. تأكد من الاتصال واضغط مرة ثانية.")).toBeVisible();
  await horn.click();
  await expect(page.getByText("تم إبلاغ لهب إنك وصلت.").first()).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.p_client_request_id).toBe(calls[0]!.p_client_request_id);
});

test("cooldown responses disable the horn with a countdown", async ({ page }) => {
  await stubPickup(page, [{ code: "notify_cooldown", details: '{"retry_after_seconds": 45}' }]);
  await page.goto(`/orders/${ORDER_NUMBER}/pickup`);
  const horn = page.getByRole("button", { name: /وصلت/ });
  await horn.click();
  await expect(page.getByText(/تقدر تضغط مرة ثانية بعد 45 ثانية/)).toBeVisible();
  await expect(horn).toBeDisabled();
});

test("the order page links to the pickup screen", async ({ page }) => {
  await stubPickup(page);
  await page.goto(`/orders/${ORDER_NUMBER}`);
  await page.getByRole("link", { name: "افتح شاشة الاستلام" }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NUMBER}/pickup$`));
});

test.describe("staff pickup queue", () => {
  const queueRow = (arrival: string, extra: Record<string, unknown> = {}) => ({
    order_id: "o42", order_number: ORDER_NUMBER, branch_id: "b1", status: "ready", customer_first_name: "Sara",
    requested_pickup_at: new Date().toISOString(), created_at: new Date().toISOString(), vehicle_plate: "AB 123", vehicle_color: "blue",
    arrival_status: arrival, arrived_at: arrival === "not_arrived" ? null : new Date(Date.now() - 125_000).toISOString(),
    last_notified_at: null, notify_count: arrival === "not_arrived" ? 0 : 1, acknowledged_at: null, branch_name_ar: "عالي", branch_name_en: "A'ali", ...extra,
  });

  async function stubQueue(page: Page, roles: string[]) {
    const calls: { path: string; body: unknown }[] = [];
    let arrival = "arrived";
    let status = "ready";
    await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fallback();
      const path = new URL(req.url()).pathname.replace("/rest/v1/", "");
      if (path === "rpc/my_roles") return route.fulfill(json(roles));
      if (path === "staff_pickup_queue") return route.fulfill(json(status === "completed" ? [] : [queueRow(arrival, { status })]));
      if (path === "rpc/acknowledge_arrival") {
        calls.push({ path, body: req.postDataJSON() });
        arrival = "acknowledged";
        return route.fulfill(json({ order_id: "o42", arrival_status: "acknowledged" }));
      }
      if (path === "rpc/transition_order_status") {
        const body = req.postDataJSON() as { p_to: string };
        calls.push({ path, body });
        status = body.p_to;
        return route.fulfill(json({ order_id: "o42", status: body.p_to }));
      }
      return route.fallback();
    });
    return calls;
  }

  test("staff see the waiting car, acknowledge it and hand the order over", async ({ page }) => {
    await signIn(page, "staff@example.test");
    const calls = await stubQueue(page, ["customer", "staff"]);
    await page.goto("/admin/pickup");
    await expect(page.getByText("AB 123")).toBeVisible();
    await expect(page.getByText(/وصل قبل 2:0\d/)).toBeVisible();
    await expect(page).toHaveTitle(/^\(1\)/);
    await page.screenshot({ path: `test-results/screens/admin-pickup-${test.info().project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "تأكيد الاستلام" }).click();
    await expect(page.getByText("تم التأكيد").first()).toBeVisible();
    await page.getByRole("button", { name: "تسليم" }).click();
    await expect(page.getByText("ما فيه سيارات منتظرة.")).toBeVisible();
    expect(calls.map((c) => c.path)).toEqual(["rpc/acknowledge_arrival", "rpc/transition_order_status"]);
    expect(calls[1]!.body).toEqual({ p_order_id: "o42", p_to: "completed", p_reason: null });
  });

  test("customers cannot open the staff queue", async ({ page }) => {
    await signIn(page, "sara@example.test");
    await stubQueue(page, ["customer"]);
    await page.goto("/admin/pickup");
    await expect(page.getByRole("heading", { name: "ما عندك صلاحية لهذا القسم." })).toBeVisible();
    await expect(page.getByText("AB 123")).toHaveCount(0);
  });
});
