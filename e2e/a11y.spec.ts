import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL, stubSupabase } from "./fixtures/supabase-stub";
import { signIn, stubAdmin } from "./fixtures/admin-stub";

/** Fail on serious/critical WCAG 2.1 A/AA violations; list them readably. */
async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${n.html.slice(0, 140)}`).join("\n  ")}`);
  expect(report, `${name}\n${report.join("\n")}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
});

for (const [path, name] of [
  ["/", "home"],
  ["/menu", "menu"],
  ["/menu/item/sample-chicken", "product"],
  ["/contact", "contact"],
  ["/login", "login"],
  ["/register", "register"],
] as const) {
  test(`${name} has no serious accessibility violations (Arabic)`, async ({ page }) => {
    await page.goto(path);
    await audit(page, name);
  });
}

test("home has no serious accessibility violations (English)", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("lahab.lang", "en"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await audit(page, "home-en");
});

test("cart with items has no serious violations", async ({ page }) => {
  await page.goto("/menu/item/sample-chicken");
  await page.getByRole("button", { name: /أضف للسلة/ }).click();
  await page.goto("/cart");
  await audit(page, "cart");
});

test("admin orders board has no serious violations", async ({ page }) => {
  await signIn(page);
  await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin/orders");
  await expect(page.getByText("LH-261029-0007").filter({ visible: true }).first()).toBeVisible();
  await audit(page, "admin-orders");
});

test("customer pickup screen has no serious violations", async ({ page }) => {
  await signIn(page, "sara@example.test");
  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/rest/v1/", "");
    const body =
      path === "rpc/my_roles"
        ? ["customer"]
        : path === "orders"
          ? {
              id: "o42", order_number: "LH-261029-0042", fulfillment_type: "pickup", status: "ready", payment_method: "cash_on_pickup",
              payment_status: "unpaid", requested_pickup_at: null, subtotal: 2, options_total: 0, discount_total: 0, total: 2, coupon_code: null,
              notes: null, cancel_reason: null, created_at: new Date().toISOString(),
              branches: { name_ar: "عالي", name_en: "A'ali", address_ar: null, address_en: null, pickup_instructions_ar: null, pickup_instructions_en: null },
              pickup_details: { vehicle_plate: "AB 123", vehicle_color: "blue", arrival_status: "not_arrived", last_notified_at: null, notify_count: 0 },
              order_items: [],
            }
          : null;
    if (body === null || route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/orders/LH-261029-0042/pickup");
  await expect(page.getByRole("button", { name: /وصلت/ })).toBeEnabled();
  await audit(page, "pickup");
});
