import { expect, test } from "@playwright/test";
import { stubSupabase } from "./fixtures/supabase-stub";
import { signIn, stubAdmin } from "./fixtures/admin-stub";

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
});

test("anonymous visitors are sent to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
});

test("customers see a no-access screen, not admin data", async ({ page }) => {
  await signIn(page, "customer@example.test");
  const calls = await stubAdmin(page, ["customer"]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ما عندك صلاحية لهذا القسم." })).toBeVisible();
  expect(calls.requests.some((r) => r.path === "rpc/admin_dashboard")).toBe(false);
});

test("staff cannot open manager-only pages", async ({ page }) => {
  await signIn(page, "staff@example.test");
  await stubAdmin(page, ["customer", "staff"]);
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "ما عندك صلاحية لهذا القسم." })).toBeVisible();
});

test("manager overview shows live numbers and manager navigation", async ({ page, isMobile }) => {
  await signIn(page);
  await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
  await expect(page.getByText("طلبات اليوم", { exact: true })).toBeVisible();
  await expect(page.getByText("12.750")).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
  const nav = page.getByRole("navigation", { name: "إدارة لهب" });
  await expect(nav.getByRole("link", { name: "الأصناف" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "الموظفين والصلاحيات" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/admin-overview-${test.info().project.name}.png`, fullPage: true });
});

test("orders board advances status and acknowledges arrivals through the RPCs", async ({ page }) => {
  await signIn(page);
  const calls = await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin/orders");
  await expect(page.getByText("LH-261029-0007").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/admin-orders-${test.info().project.name}.png`, fullPage: true });

  await page.getByText("LH-261029-0007").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Extra napkins please")).toBeVisible();
  await expect(dialog.getByText("12345")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/admin-order-detail-${test.info().project.name}.png` });

  await dialog.getByRole("button", { name: "تأكيد استلام التنبيه" }).click();
  await dialog.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect.poll(() => calls.requests.map((r) => r.path)).toEqual(expect.arrayContaining(["rpc/acknowledge_arrival", "rpc/transition_order_status"]));
  expect(calls.requests.find((r) => r.path === "rpc/transition_order_status")?.body).toEqual({ p_order_id: "o1", p_to: "confirmed", p_reason: null });
});

test("cancelling requires a reason", async ({ page }) => {
  await signIn(page);
  const calls = await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin/orders");
  await page.getByText("LH-261029-0007").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "إلغاء الطلب" }).click();
  const submit = dialog.getByRole("button", { name: "إلغاء الطلب" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("سبب الإلغاء").fill("Customer asked");
  await submit.click();
  await expect.poll(() => calls.requests.find((r) => r.path === "rpc/transition_order_status")?.body).toEqual({
    p_order_id: "o1",
    p_to: "cancelled",
    p_reason: "Customer asked",
  });
});

test("products list toggles availability", async ({ page }) => {
  await signIn(page);
  const calls = await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin/products");
  await expect(page.getByRole("link", { name: "شاورما دجاج — نموذج" }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/admin-products-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("switch", { name: "متوفر", exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => calls.requests.find((r) => r.method === "PATCH" && r.path === "products")?.body).toEqual({ is_available: false });
});

test("product form validates price and required names", async ({ page }) => {
  await signIn(page);
  const calls = await stubAdmin(page, ["customer", "manager"]);
  await page.goto("/admin/products/new");
  await page.getByLabel("السعر الأساسي (د.ب)").fill("1.23456");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("اكتب سعر لين 3 خانات عشرية، مثل 1.250.")).toBeVisible();
  await expect(page.getByText("اكتب اسمك.").first()).toBeVisible();
  expect(calls.requests.some((r) => r.path === "products" && r.method === "POST")).toBe(false);
  await page.screenshot({ path: `test-results/screens/admin-product-new-${test.info().project.name}.png`, fullPage: true });
});

test("admin pages fit the phone screen", async ({ page }) => {
  await signIn(page);
  await stubAdmin(page, ["customer", "manager"]);
  for (const path of ["/admin", "/admin/orders", "/admin/products"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
