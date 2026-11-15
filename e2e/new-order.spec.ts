import { expect, test } from "@playwright/test";
import { STUB_SUPABASE_URL, stubSupabase } from "./fixtures/supabase-stub";
import { signIn, stubAdmin } from "./fixtures/admin-stub";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
const item = (id: string, ar: string, price: number, extra: object = {}) => ({
  id, category_id: "c1", slug: id, name_ar: ar, name_en: id, description_ar: null, description_en: null, base_price: price,
  is_available: true, is_featured: false, is_best_seller: false, sort_order: 1, product_images: [], product_options: [], ...extra,
});
const menu = [
  item("p1", "شاورما دجاج — نموذج", 1, {
    product_options: [
      {
        id: "o1", name_ar: "الحجم", name_en: "Size", min_select: 1, max_select: 1, sort_order: 1, is_active: true,
        product_option_values: [
          { id: "v1", name_ar: "عادي", name_en: "Regular", price_delta: 0, is_default: true, is_available: true, sort_order: 1 },
          { id: "v2", name_ar: "كبير", name_en: "Large", price_delta: 0.5, is_default: false, is_available: true, sort_order: 2 },
        ],
      },
    ],
  }),
  item("p2", "شاورما عربي — نموذج", 2),
];

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await signIn(page);
});

test("staff take an order at the car on a tablet: items, plate, pay on handover", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await stubAdmin(page, ["customer", "staff"]);
  let sent: Record<string, unknown> | null = null;
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/products**`, (route) =>
    new URL(route.request().url()).searchParams.get("select")?.includes("product_options") ? route.fulfill(json(menu)) : route.fallback(),
  );
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/rpc/staff_place_counter_order`, (route) => {
    sent = (route.request().postDataJSON() as { p_payload: Record<string, unknown> }).p_payload;
    return route.fulfill(json({ order_id: "o9", order_number: "LH-261115-0042", status: "confirmed", total: 5, replayed: false, linked_customer: true }));
  });

  await page.goto("/admin/new-order");
  await expect(page.getByRole("heading", { name: "طلب جديد", level: 1 })).toBeVisible();

  // An item with options opens a sheet; a plain item goes straight in.
  await page.getByRole("button", { name: /شاورما دجاج/ }).click();
  await page.getByRole("button", { name: /كبير/ }).click();
  await page.getByRole("button", { name: /^أضف/ }).click();
  await page.getByRole("button", { name: /شاورما عربي/ }).click();
  await page.getByRole("button", { name: /شاورما عربي/ }).click();

  const ticket = page.getByRole("complementary");
  await expect(ticket.getByText("(3)")).toBeVisible();
  // A plain item gets its special requests from the note button on its line.
  await ticket.getByRole("button", { name: "ملاحظة" }).last().click();
  const note = page.getByRole("dialog", { name: "شاورما عربي — نموذج" });
  await note.getByRole("button", { name: "بدون سلطة" }).click();
  await note.getByRole("button", { name: "حار", exact: true }).click();
  await note.getByRole("button", { name: "حفظ الملاحظة" }).click();
  await expect(ticket.getByRole("button", { name: "بدون سلطة، حار" })).toBeVisible();
  // At the car, a plate is needed before the order can go.
  await expect(ticket.getByRole("button", { name: /أكد الطلب/ })).toBeDisabled();
  await ticket.getByLabel("رقم لوحة السيارة").fill("123 456");
  await ticket.getByRole("radio", { name: "أسود" }).click();
  await ticket.getByText("بيانات العميل").click();
  await ticket.getByLabel("رقم التلفون").fill("3600 1122");
  await ticket.getByRole("radio", { name: "بطاقة" }).click();
  await ticket.getByRole("radio", { name: "يدفع عند التسليم" }).click();
  await page.screenshot({ path: `test-results/screens/admin-new-order-${test.info().project.name}.png`, fullPage: true });
  await ticket.getByRole("button", { name: /أكد الطلب/ }).click();

  const done = page.getByRole("dialog", { name: "انسجل الطلب" });
  await expect(done.getByText("0042", { exact: true })).toBeVisible();
  await expect(done.getByText(/123 456/)).toBeVisible();
  await expect(done.getByText(/انربط بحساب العميل/)).toBeVisible();

  expect(sent).toMatchObject({
    payment: "card",
    paid: false,
    customer: { phone: "3600 1122" },
    vehicle: { plate: "123 456", color: "black" },
    items: [
      { product_id: "p1", quantity: 1, option_value_ids: ["v2"] },
      { product_id: "p2", quantity: 2, option_value_ids: [], notes: "بدون سلطة، حار" },
    ],
  });
  expect(typeof sent!.idempotency_key).toBe("string");

  await done.getByRole("button", { name: "طلب جديد" }).click();
  await expect(ticket.getByText("اضغط على الأصناف عشان تضيفها")).toBeVisible();
});

test("phone layout: the ticket opens from the bottom bar; inside orders need no plate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAdmin(page, ["customer", "staff"]);
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/products**`, (route) =>
    new URL(route.request().url()).searchParams.get("select")?.includes("product_options") ? route.fulfill(json(menu)) : route.fallback(),
  );
  await page.goto("/admin/new-order");
  await page.getByRole("button", { name: /شاورما عربي/ }).click();
  await page.getByRole("button", { name: /الطلب \(1\)/ }).click();
  const sheet = page.getByRole("dialog", { name: "الطلب" });
  await sheet.getByRole("radio", { name: "داخل المطعم" }).click();
  await expect(sheet.getByLabel("رقم لوحة السيارة")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /أكد الطلب/ })).toBeEnabled();
});
