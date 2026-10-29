import { readFileSync } from "node:fs";
import { join } from "node:path";
import { as, createTestDb, createUser, errorOf, service, anon, type Db } from "./harness";

const root = join(import.meta.dirname, "../../supabase");
const seed = readFileSync(join(root, "seed.sql"), "utf8");
const menu = readFileSync(join(root, "menu/official-menu-2026-10.sql"), "utf8");

describe("development seed + official menu", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
    await db.exec(seed);
    await db.exec(menu);
  });

  test("loads the 10 categories and 25 items from the official menu", async () => {
    await as(db, anon, async (tx) => {
      const cats = await tx.query<{ n: number }>("select count(*)::int n from public.categories");
      const prods = await tx.query<{ n: number }>("select count(*)::int n from public.products");
      expect(cats.rows[0]?.n).toBe(10);
      expect(prods.rows[0]?.n).toBe(25);
    });
  });

  test.each([
    ["classic-chicken-shawarma", "0.700"],
    ["chicken-shawarma-plate", "3.000"],
    ["arabic-chicken-shawarma-box", "2.800"],
    ["signature-fries", "2.200"],
    ["lahab-salad", "2.500"],
    ["water", "0.100"],
  ])("%s costs %s BHD as printed", async (slug, price) => {
    const { rows } = await db.query<{ base_price: string }>("select base_price from public.products where slug = $1", [slug]);
    expect(rows[0]?.base_price).toBe(price);
  });

  test("a Lahab sauce requires choosing which sauce", async () => {
    const id = (await db.query<{ id: string }>("select id from public.products where slug = 'lahab-signature-sauce'")).rows[0]!.id;
    const garlic = (await db.query<{ id: string }>("select v.id from public.product_option_values v where v.name_en = 'Garlic sauce'")).rows[0]!.id;
    await as(db, anon, async (tx) => {
      const missing = (await tx.query<{ q: { issues: { code: string }[] } }>("select public.quote_cart($1::jsonb) q", [JSON.stringify([{ product_id: id, quantity: 1 }])])).rows[0]!.q;
      expect(missing.issues.map((i) => i.code)).toEqual(["option_selection_invalid"]);
      const ok = (await tx.query<{ q: { total: number } }>("select public.quote_cart($1::jsonb) q", [JSON.stringify([{ product_id: id, quantity: 2, option_value_ids: [garlic] }])])).rows[0]!.q;
      expect(Number(ok.total)).toBe(0.6);
    });
  });

  test("re-running the menu file updates in place without duplicates", async () => {
    await db.exec(menu);
    const { rows } = await db.query<{ p: number; o: number; v: number }>(
      `select (select count(*)::int from public.products) p,
              (select count(*)::int from public.product_options) o,
              (select count(*)::int from public.product_option_values) v`,
    );
    expect(rows[0]).toEqual({ p: 25, o: 1, v: 7 });
  });

  test("WhatsApp number from the menu is set", async () => {
    const { rows } = await db.query<{ whatsapp: string }>("select whatsapp from public.restaurant_settings");
    expect(rows[0]?.whatsapp).toBe("+97333447433");
  });
});

test("super admin provisioning is not reachable through the API roles", async () => {
  const db = await createTestDb();
  const id = await createUser(db, { email: "owner@example.test" });
  await as(db, service, async (tx) => {
    expect(await errorOf(tx.query("select app.grant_super_admin_by_email('owner@example.test')"))).toMatch(/permission denied/);
  });
  // Database owner (SQL editor / psql) can run it.
  await db.query("select app.grant_super_admin_by_email('OWNER@example.test')");
  const { rows } = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1 order by role", [id]);
  expect(rows.map((r) => r.role)).toEqual(["customer", "super_admin"]);
});
