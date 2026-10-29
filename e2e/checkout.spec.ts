import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL, stubSupabase } from "./fixtures/supabase-stub";
import { ADMIN_USER_ID, signIn } from "./fixtures/admin-stub";

const ORDER_NUMBER = "LH-261029-0042";

async function seedCart(page: Page) {
  const line = {
    key: "p1|v2|",
    productId: "p1",
    slug: "sample-chicken",
    nameAr: "شاورما دجاج — نموذج",
    nameEn: "Chicken shawarma — SAMPLE",
    quantity: 2,
    optionValueIds: ["v2"],
    optionLabels: [{ ar: "كبير", en: "Large" }],
    notes: "",
    unitEstimate: 1.5,
  };
  await page.addInitScript((l) => window.localStorage.setItem("lahab.cart.v1", JSON.stringify([l])), line);
}

interface Options {
  phone?: string | null;
  placeOrder?: (attempt: number) => "ok" | "network" | { code: string } | "slow";
}

async function stubCustomer(page: Page, opts: Options = {}) {
  const placed: { body: Record<string, unknown> }[] = [];
  let attempts = 0;
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const url = new URL(req.url());
    const path = url.pathname.replace("/rest/v1/", "");
    if (path === "rpc/my_roles") return route.fulfill(json(["customer"]));
    if (path === "favorites") return route.fulfill(json([]));
    if (path === "profiles") {
      return route.fulfill(json({ id: ADMIN_USER_ID, full_name: "Sara Test", phone: opts.phone === undefined ? "+97333000000" : opts.phone, preferred_language: "ar" }));
    }
    if (path === "rpc/get_pickup_slots") {
      const base = Math.ceil(Date.now() / 900_000) * 900_000 + 900_000;
      return route.fulfill(json([0, 1, 2, 3].map((i) => ({ slot_start: new Date(base + i * 900_000).toISOString(), available: i !== 1 }))));
    }
    if (path === "rpc/place_order") {
      attempts++;
      placed.push({ body: req.postDataJSON() as Record<string, unknown> });
      const outcome = opts.placeOrder?.(attempts) ?? "ok";
      if (outcome === "network") return route.abort("failed");
      if (typeof outcome === "object") {
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: `lahab.${outcome.code}`, details: "", hint: null }), headers: { "access-control-allow-origin": "*" } });
      }
      if (outcome === "slow") await new Promise((r) => setTimeout(r, 1200));
      return route.fulfill(json({ order_id: "o42", order_number: ORDER_NUMBER, status: "pending", total: 3, replayed: false }));
    }
    if (path === "orders" && url.searchParams.get("order_number") === `eq.${ORDER_NUMBER}`) {
      return route.fulfill(
        json({
          id: "o42", order_number: ORDER_NUMBER, status: "confirmed", payment_method: "cash_on_pickup", payment_status: "unpaid",
          requested_pickup_at: new Date().toISOString(), subtotal: 2, options_total: 1, discount_total: 0, total: 3, coupon_code: null,
          notes: null, cancel_reason: null, created_at: new Date().toISOString(),
          branches: { name_ar: "عالي", name_en: "A'ali", address_ar: "مبنى 2542، طريق 4270، عالي", address_en: null, pickup_instructions_ar: null, pickup_instructions_en: null },
          pickup_details: { vehicle_plate: "AB 123", vehicle_color: "blue", arrival_status: "not_arrived" },
          order_items: [{ id: "i1", product_id: "p1", product_name_ar: "شاورما دجاج — نموذج", product_name_en: "Chicken shawarma — SAMPLE", quantity: 2, line_total: 3, notes: null, order_item_options: [{ option_value_id: "v2", value_name_ar: "كبير", value_name_en: "Large" }] }],
        }),
      );
    }
    return route.fallback();
  });
  return { placed };
}

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await signIn(page, "sara@example.test");
  await seedCart(page);
});

test("places a pickup order and lands on live tracking", async ({ page }) => {
  const { placed } = await stubCustomer(page);
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "إتمام الطلب" })).toBeVisible();
  await page.getByLabel("رقم لوحة السيارة").fill("ab  123");
  await page.getByRole("button", { name: "أزرق" }).click();
  await page.screenshot({ path: `test-results/screens/checkout-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: /أرسل الطلب/ }).click();

  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NUMBER}$`));
  await expect(page.getByText("شكراً! وصلنا طلبك.")).toBeVisible();
  await expect(page.getByText("قيد التحضير")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/order-tracking-${test.info().project.name}.png`, fullPage: true });

  expect(placed).toHaveLength(1);
  const payload = (placed[0]!.body as { p_payload: Record<string, unknown> }).p_payload;
  expect(payload).toMatchObject({
    fulfillment_type: "pickup",
    payment_method: "cash_on_pickup",
    pickup_at: null,
    items: [{ product_id: "p1", quantity: 2, option_value_ids: ["v2"] }],
    vehicle: { plate: "AB 123", color: "blue" },
  });
  expect(payload.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(payload)).not.toMatch(/price|total|estimate/);
  expect(await page.evaluate(() => window.localStorage.getItem("lahab.cart.v1"))).toBe("[]");
});

test("a double tap sends one request", async ({ page }) => {
  const { placed } = await stubCustomer(page, { placeOrder: () => "slow" });
  await page.goto("/checkout");
  await page.getByLabel("رقم لوحة السيارة").fill("12345");
  const submit = page.getByRole("button", { name: /أرسل الطلب/ });
  await submit.dblclick();
  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NUMBER}$`));
  expect(placed).toHaveLength(1);
});

test("a network failure shows a safe retry, and the retry reuses the idempotency key", async ({ page }) => {
  const { placed } = await stubCustomer(page, { placeOrder: (n) => (n === 1 ? "network" : "ok") });
  await page.goto("/checkout");
  await page.getByLabel("رقم لوحة السيارة").fill("12345");
  await page.getByRole("button", { name: /أرسل الطلب/ }).click();
  await expect(page.getByText(/ما بينحسب عليك مرتين/)).toBeVisible();
  await page.getByRole("button", { name: /أرسل الطلب/ }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NUMBER}$`));
  const keys = placed.map((p) => (p.body as { p_payload: { idempotency_key: string } }).p_payload.idempotency_key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("server rejections are explained in plain language", async ({ page }) => {
  await stubCustomer(page, { placeOrder: () => ({ code: "slot_full" }) });
  await page.goto("/checkout");
  await page.getByLabel("رقم لوحة السيارة").fill("12345");
  await page.getByRole("button", { name: /أرسل الطلب/ }).click();
  await expect(page.getByText("هذا الوقت امتلأ الحين. اختر وقت ثاني.")).toBeVisible();
});

test("an invalid plate blocks submitting", async ({ page }) => {
  await stubCustomer(page);
  await page.goto("/checkout");
  await page.getByLabel("رقم لوحة السيارة").fill("<>");
  await expect(page.getByText(/تأكد من رقم اللوحة/)).toBeVisible();
  await expect(page.getByRole("button", { name: /أرسل الطلب/ })).toBeDisabled();
});

test("customers without a phone number are asked for one first", async ({ page }) => {
  await stubCustomer(page, { phone: null });
  await page.goto("/checkout");
  await expect(page.getByText(/أضف رقم موبايل/)).toBeVisible();
  await page.getByLabel("رقم لوحة السيارة").fill("12345");
  await expect(page.getByRole("button", { name: /أرسل الطلب/ })).toBeDisabled();
});

test("checkout fits the phone screen (no sideways scroll)", async ({ page }) => {
  await stubCustomer(page);
  // A long row of pickup times is what used to stretch the page on phones.
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/rpc/get_pickup_slots`, (route) => {
    const base = Math.ceil(Date.now() / 900_000) * 900_000 + 900_000;
    const slots = Array.from({ length: 10 }, (_, i) => ({ slot_start: new Date(base + i * 900_000).toISOString(), available: true }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(slots), headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/checkout");
  await expect(page.getByRole("radiogroup", { name: "اختر وقت" }).getByRole("radio")).toHaveCount(10);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("full pickup slots cannot be chosen", async ({ page }) => {
  await stubCustomer(page);
  await page.goto("/checkout");
  const radios = page.getByRole("radiogroup", { name: "اختر وقت" }).getByRole("radio");
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(1)).toBeDisabled();
  await radios.nth(2).click();
  await expect(radios.nth(2)).toHaveAttribute("aria-checked", "true");
});

test("checkout requires login", async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => window.localStorage.removeItem("sb-supabase-auth-token"));
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
});
