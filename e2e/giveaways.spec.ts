import { expect, test } from "@playwright/test";
import { STUB_SUPABASE_URL, stubSupabase } from "./fixtures/supabase-stub";
import { signIn, stubAdmin } from "./fixtures/admin-stub";

const COMMENTS = `lahab.bh
Tag 2 friends to win!
ali.bh
@sara_99 @huda.k
2d
Reply
sara_99
@ali.bh
huda.k
@x.one @x.two @x.three`;

test.beforeEach(async ({ page }) => {
  await stubSupabase(page);
  await signIn(page);
});

test("Instagram draw: parse comments, apply the tag rule, draw and reveal the winner", async ({ page }) => {
  await stubAdmin(page, ["customer", "manager"]);
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
  let drawn: unknown = null;
  let sent: { p_entries: string[]; p_source: string; p_rules: { min_mentions: number } } | null = null;
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/rpc/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/rest/v1/", "");
    if (path === "rpc/admin_list_giveaways") return route.fulfill(json(drawn ? [drawn] : []));
    if (path === "rpc/admin_giveaway_order_count") return route.fulfill(json(4));
    if (path === "rpc/admin_draw_list") {
      const body = route.request().postDataJSON() as { p_title: string; p_entries: string[]; p_source: string; p_rules: { min_mentions: number } };
      sent = body;
      drawn = {
        id: "g1", title: body.p_title, source: "instagram_comments", rules: {}, entry_count: body.p_entries.length, winners_count: 1, alternates_count: 1,
        seed: "abc123", drawn_at: new Date().toISOString(),
        winners: [
          { position: 1, is_alternate: false, entry_key: "huda.k", label: "@huda.k", order_id: null, order_number: null, phone: null },
          { position: 2, is_alternate: true, entry_key: "ali.bh", label: "@ali.bh", order_id: null, order_number: null, phone: null },
        ],
      };
      return route.fulfill(json(drawn));
    }
    return route.fallback();
  });

  await page.goto("/admin/giveaways");
  await expect(page.getByRole("heading", { name: "السحوبات والجوائز" })).toBeVisible();
  await page.getByRole("tab", { name: "من انستقرام" }).click();
  // The comment-collector bookmark carries runnable code (checked for syntax only, not run here).
  const href = await page.getByRole("link", { name: "سحب تعليقات لهب" }).getAttribute("href");
  expect(href).toMatch(/^javascript:/);
  expect(() => new Function(decodeURIComponent(href!.slice("javascript:".length)))).not.toThrow();
  await page.getByLabel("اسم السحب").fill("سحب التعليقات");
  await page.getByLabel("الصق التعليقات هني").fill(COMMENTS);
  await page.getByLabel("لازم يمنشن كم صديق؟").fill("2");
  // lahab.bh is excluded by default and sara_99 tagged only one friend.
  await expect(page.getByText("2 مشارك · 2 مستبعد")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/admin-giveaways-${test.info().project.name}.png`, fullPage: true });

  await page.getByRole("button", { name: "ابدأ السحب" }).click();
  const reveal = page.getByRole("dialog", { name: "سحب التعليقات" });
  await expect(reveal.getByText("@huda.k")).toBeVisible({ timeout: 8000 });
  await expect(reveal.getByText("@ali.bh")).toBeVisible();
  await expect(reveal.getByText("abc123")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/admin-giveaway-reveal-${test.info().project.name}.png` });

  expect(sent!.p_entries.sort()).toEqual(["ali.bh", "huda.k"]);
  expect(sent!.p_source).toBe("instagram_comments");
  expect(sent!.p_rules.min_mentions).toBe(2);

  await reveal.getByRole("button", { name: "خلصنا 🎉" }).click();
  await expect(page.getByText("سحب التعليقات", { exact: true })).toBeVisible();
});

test("staff cannot open the prize draws page", async ({ page }) => {
  await stubAdmin(page, ["customer", "staff"]);
  await page.goto("/admin/giveaways");
  await expect(page.getByRole("heading", { name: "ما عندك صلاحية لهذا القسم." })).toBeVisible();
});
