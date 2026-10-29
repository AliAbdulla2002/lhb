import { readFileSync } from "node:fs";
import { join } from "node:path";
import { as, createTestDb, createUser, errorOf, service, anon } from "./harness";

test("the development seed applies and exposes a public menu", async () => {
  const db = await createTestDb();
  await db.exec(readFileSync(join(import.meta.dirname, "../../supabase/seed.sql"), "utf8"));
  const names = await as(db, anon, async (tx) =>
    (await tx.query<{ name_en: string }>("select name_en from public.products order by name_en")).rows.map((r) => r.name_en),
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((n) => n.includes("SAMPLE"))).toBe(true);
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
