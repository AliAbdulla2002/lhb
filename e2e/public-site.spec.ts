import { expect, test } from "@playwright/test";
import { stubSupabase } from "./fixtures/supabase-stub";

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
});

test("home page renders in Arabic RTL with featured items", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("شاورما على اللهب");
  await expect(page.getByRole("link", { name: /شاورما دجاج — نموذج/ })).toBeVisible();
  await page.screenshot({ path: `test-results/screens/home-ar-${test.info().project.name}.png`, fullPage: true });
});

test("language switch flips to English LTR and persists", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "فتح القائمة" }).click();
  await page.getByRole("button", { name: "تغيير اللغة" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shawarma, fired up");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.screenshot({ path: `test-results/screens/home-en-${test.info().project.name}.png`, fullPage: true });
});

test("menu filters by category and shows unavailable items", async ({ page }) => {
  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "شاورما (نموذج)" })).toBeVisible();
  await expect(page.getByText("غير متوفر حالياً")).toBeVisible();
  await page.getByRole("navigation", { name: "تصفية حسب القسم" }).getByRole("link", { name: "إضافات (نموذج)" }).click();
  await expect(page).toHaveURL(/\/menu\/sides$/);
  await expect(page.getByRole("heading", { name: "شاورما (نموذج)" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/menu-${test.info().project.name}.png`, fullPage: true });
});

test("customise a product, add to cart and see server-priced totals", async ({ page }) => {
  await page.goto("/menu/item/sample-chicken");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("شاورما دجاج — نموذج");
  await page.getByText("كبير").click();
  await expect(page.getByRole("button", { name: /أضف للسلة/ })).toContainText("1.500");
  await page.getByRole("button", { name: "زيادة الكمية" }).click();
  await page.screenshot({ path: `test-results/screens/product-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: /أضف للسلة/ }).click();
  await expect(page.getByRole("link", { name: /السلة \(2\)/ })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("3.000").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "متابعة الطلب" })).toBeDisabled();
  await page.screenshot({ path: `test-results/screens/cart-${test.info().project.name}.png`, fullPage: true });
});

test("cart explains unavailable items reported by the server", async ({ page }) => {
  await page.unroute("**/*");
  await stubSupabase(page, { unavailableInCart: true });
  await page.goto("/menu/item/sample-chicken");
  await page.getByRole("button", { name: /أضف للسلة/ }).click();
  await page.goto("/cart");
  await expect(page.getByText("بعض الأصناف تحتاج انتباهك")).toBeVisible();
  await expect(page.getByText("هذا الصنف غير متوفر حالياً. احذفه عشان تكمل.")).toBeVisible();
});

test("contact page shows the verified branch details", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "عالي" })).toBeVisible();
  await expect(page.getByText("مبنى 2542، طريق 4270، عالي", { exact: true })).toBeVisible();
  await expect(page.getByText("الأوقات المعروضة قيد التأكيد مع المطعم.")).toBeVisible();
});

test("account page redirects anonymous visitors to login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
  await expect(page.getByRole("heading", { name: "هلا فيك مرة ثانية" })).toBeVisible();
});

test("register form shows translated validation errors", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("اكتب اسمك.")).toBeVisible();
  await expect(page.getByText("اكتب بريد إلكتروني صحيح.")).toBeVisible();
});

test("no horizontal scrolling on the home page", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
