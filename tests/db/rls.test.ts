import { anon, as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let alice: string; // customer
let bob: string; // customer
let staffA: string; // staff, branch A only
let manager: string;
let admin: string;
let aliceOrder: string;
let bobOrderB: string;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  alice = await createUser(db, { meta: { full_name: "Alice Customer" } });
  bob = await createUser(db, { meta: { full_name: "Bob Customer" } });
  staffA = await createUser(db);
  manager = await createUser(db);
  admin = await createUser(db);
  await grantRole(db, staffA, "staff", fx.branchA);
  await grantRole(db, manager, "manager");
  await grantRole(db, admin, "super_admin");
  aliceOrder = (await asCommit(db, service, (tx) => placeOrder(tx, alice, orderPayload(fx)))).order_id;
  bobOrderB = (await asCommit(db, service, (tx) => placeOrder(tx, bob, orderPayload(fx, { branch_id: fx.branchB })))).order_id;
});

describe("signup", () => {
  test("creates a profile and only the customer role, ignoring role claims in metadata", async () => {
    const id = await createUser(db, { meta: { full_name: "Eve", role: "super_admin", roles: ["manager"] } });
    const { rows } = await db.query<{ role: string }>("select role from public.user_roles where user_id = $1", [id]);
    expect(rows.map((r) => r.role)).toEqual(["customer"]);
    const profile = await db.query<{ full_name: string }>("select full_name from public.profiles where id = $1", [id]);
    expect(profile.rows[0]?.full_name).toBe("Eve");
  });
});

describe("public menu", () => {
  test("anon sees visible, non-archived products including unavailable ones", async () => {
    const slugs = await as(db, anon, async (tx) =>
      (await tx.query<{ slug: string }>("select slug from public.products order by slug")).rows.map((r) => r.slug),
    );
    expect(slugs).toEqual(["test-plate", "test-unavailable", "test-wrap"]);
  });

  test("anon cannot see hidden categories, staff notes or coupons", async () => {
    await as(db, anon, async (tx) => {
      const cats = await tx.query<{ slug: string }>("select slug from public.categories");
      expect(cats.rows.map((r) => r.slug)).toEqual(["wraps"]);
      expect(await errorOf(tx.query("select * from public.coupons"))).toMatch(/permission denied/);
    });
    await as(db, anon, async (tx) => {
      expect(await errorOf(tx.query("select * from public.product_staff_notes"))).toMatch(/permission denied/);
    });
  });

  test("staff can see archived products", async () => {
    const count = await as(db, user(staffA), async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int n from public.products")).rows[0]!.n,
    );
    expect(count).toBe(5);
  });

  test("expired and future promotions are hidden from the public", async () => {
    await db.exec(`
      insert into public.promotions (title_ar, title_en, starts_at, ends_at) values
        ('حالي', 'Current', now() - interval '1 day', now() + interval '1 day'),
        ('منتهي', 'Expired', now() - interval '3 days', now() - interval '1 day'),
        ('قادم', 'Future', now() + interval '1 day', null);
      insert into public.promotions (title_ar, title_en, is_active) values ('موقوف', 'Inactive', false);
    `);
    const titles = await as(db, anon, async (tx) =>
      (await tx.query<{ title_en: string }>("select title_en from public.promotions")).rows.map((r) => r.title_en),
    );
    expect(titles).toEqual(["Current"]);
  });
});

describe("menu administration", () => {
  test("customers and staff cannot write products", async () => {
    for (const who of [anon, user(alice), user(staffA)]) {
      await as(db, who, async (tx) => {
        const err = await errorOf(
          tx.query("update public.products set base_price = 0.001 where id = $1 returning id", [fx.wrap]).then((r) => {
            if (r.rows.length === 0) throw new Error("no rows updated");
          }),
        );
        expect(err).toMatch(/permission denied|no rows updated/);
      });
    }
  });

  test("manager can create, edit and archive products, and changes are audited", async () => {
    await as(db, user(manager), async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into public.products (category_id, slug, name_ar, name_en, base_price)
         values ($1, 'new-item', 'جديد', 'New', 1.500) returning id`,
        [fx.category],
      );
      const id = rows[0]!.id;
      await tx.query("update public.products set base_price = 1.750 where id = $1", [id]);
      await tx.query("update public.products set archived_at = now() where id = $1", [id]);
      const audit = await tx.query<{ action: string; actor_id: string }>(
        "select action, actor_id from public.audit_logs where entity_type = 'products' and entity_id = $1 order by id",
        [id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual(["insert", "update", "update"]);
      expect(audit.rows.every((r) => r.actor_id === manager)).toBe(true);
    });
  });

  test("customers cannot read the audit log", async () => {
    const n = await as(db, user(alice), async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int n from public.audit_logs")).rows[0]!.n,
    );
    expect(n).toBe(0);
  });

  test("manager can pause pickup but cannot rename a branch; super admin can", async () => {
    await as(db, user(manager), async (tx) => {
      await tx.query("update public.branches set pickup_paused = true where id = $1", [fx.branchA]);
      expect(await errorOf(tx.query("update public.branches set name_en = 'X' where id = $1", [fx.branchA]))).toBe(
        "lahab.forbidden",
      );
    });
    await as(db, user(admin), async (tx) => {
      await tx.query("update public.branches set name_en = 'Renamed' where id = $1", [fx.branchA]);
    });
  });
});

describe("customer data isolation", () => {
  test("customers read only their own orders, items and profile", async () => {
    await as(db, user(alice), async (tx) => {
      const orders = await tx.query<{ id: string }>("select id from public.orders");
      expect(orders.rows.map((r) => r.id)).toEqual([aliceOrder]);
      const items = await tx.query<{ order_id: string }>("select order_id from public.order_items");
      expect(new Set(items.rows.map((r) => r.order_id))).toEqual(new Set([aliceOrder]));
      const profiles = await tx.query<{ id: string }>("select id from public.profiles");
      expect(profiles.rows.map((r) => r.id)).toEqual([alice]);
      const pickup = await tx.query("select * from public.pickup_details where order_id = $1", [bobOrderB]);
      expect(pickup.rows).toHaveLength(0);
    });
  });

  test("customer can update own profile fields but not another user's", async () => {
    await as(db, user(alice), async (tx) => {
      await tx.query("update public.profiles set full_name = 'Alice B' where id = $1", [alice]);
      const other = await tx.query("update public.profiles set full_name = 'Hacked' where id = $1 returning id", [bob]);
      expect(other.rows).toHaveLength(0);
    });
  });

  test("customers cannot write orders, payments, roles, pickup events or audit logs directly", async () => {
    const attempts: [string, unknown[]][] = [
      [
        `insert into public.orders (order_number, customer_id, branch_id, fulfillment_type, payment_method, subtotal, total, idempotency_key, request_hash)
         values ('X', $1, $2, 'pickup', 'cash_on_pickup', 0, 0, gen_random_uuid(), 'x')`,
        [alice, fx.branchA],
      ],
      ["update public.orders set total = 0 where id = $1", [aliceOrder]],
      ["update public.orders set status = 'completed' where id = $1", [aliceOrder]],
      ["insert into public.user_roles (user_id, role) values ($1, 'super_admin')", [alice]],
      ["update public.payments set status = 'paid' where order_id = $1", [aliceOrder]],
      [
        "insert into public.pickup_arrival_events (order_id, branch_id, event_type) values ($1, $2, 'arrived')",
        [aliceOrder, fx.branchA],
      ],
      ["insert into public.audit_logs (action, entity_type) values ('x', 'y')", []],
      ["delete from public.order_status_history", []],
    ];
    for (const [sql, params] of attempts) {
      await as(db, user(alice), async (tx) => {
        expect(await errorOf(tx.query(sql, params))).toMatch(/permission denied/);
      });
    }
  });

  test("customers cannot call privileged business functions directly", async () => {
    await as(db, user(alice), async (tx) => {
      expect(await errorOf(tx.query("select app.place_order($1, '{}'::jsonb)", [alice]))).toMatch(/permission denied/);
    });
    await as(db, user(alice), async (tx) => {
      expect(
        await errorOf(tx.query("select app.transition_order_status($1, $2, 'completed')", [alice, aliceOrder])),
      ).toMatch(/permission denied/);
    });
    await as(db, user(alice), async (tx) => {
      expect(
        await errorOf(tx.query("select app.set_user_role($1, $1, 'super_admin', true)", [alice])),
      ).toMatch(/permission denied/);
    });
  });

  test("customers can manage only their own favorites", async () => {
    await as(db, user(alice), async (tx) => {
      await tx.query("insert into public.favorites (user_id, product_id) values ($1, $2)", [alice, fx.wrap]);
      expect(
        await errorOf(tx.query("insert into public.favorites (user_id, product_id) values ($1, $2)", [bob, fx.wrap])),
      ).toMatch(/row-level security/);
    });
  });
});

describe("branch scoping for staff", () => {
  test("staff see only orders of their assigned branch", async () => {
    const ids = await as(db, user(staffA), async (tx) =>
      (await tx.query<{ id: string }>("select id from public.orders")).rows.map((r) => r.id),
    );
    expect(ids).toContain(aliceOrder);
    expect(ids).not.toContain(bobOrderB);
  });

  test("staff pickup queue is branch-scoped and omits phone numbers", async () => {
    await as(db, user(staffA), async (tx) => {
      const { rows, fields } = await tx.query<{ order_id: string }>("select * from public.staff_pickup_queue");
      expect(rows.map((r) => r.order_id)).toEqual([aliceOrder]);
      expect(fields.map((f) => f.name)).not.toContain("customer_phone");
    });
  });

  test("staff cannot change another branch's order", async () => {
    await as(db, service, async (tx) => {
      expect(
        await errorOf(tx.query("select app.transition_order_status($1, $2, 'confirmed')", [staffA, bobOrderB])),
      ).toBe("lahab.order_not_found");
    });
  });

  test("managers see all branches", async () => {
    const n = await as(db, user(manager), async (tx) =>
      (await tx.query<{ n: number }>("select count(*)::int n from public.orders")).rows[0]!.n,
    );
    expect(n).toBe(2);
  });
});

describe("role management", () => {
  test("only super admins can grant roles", async () => {
    await as(db, service, async (tx) => {
      expect(await errorOf(tx.query("select app.set_user_role($1, $2, 'manager', true)", [manager, alice]))).toBe(
        "lahab.forbidden",
      );
    });
    await as(db, service, async (tx) => {
      await tx.query("select app.set_user_role($1, $2, 'manager', true)", [admin, alice]);
      const { rows } = await tx.query<{ actor_id: string }>(
        "select actor_id from public.audit_logs where entity_type = 'user_roles' and entity_id = $1",
        [alice],
      );
      expect(rows.at(-1)?.actor_id).toBe(admin);
    });
  });

  test("the last super admin cannot be removed", async () => {
    await as(db, service, async (tx) => {
      expect(await errorOf(tx.query("select app.set_user_role($1, $1, 'super_admin', false)", [admin]))).toBe(
        "lahab.last_super_admin",
      );
    });
  });
});

describe("storage", () => {
  test("only managers can upload menu images", async () => {
    await as(db, user(alice), async (tx) => {
      expect(
        await errorOf(tx.query("insert into storage.objects (bucket_id, name) values ('menu-media', 'x.webp')")),
      ).toMatch(/row-level security/);
    });
    await as(db, user(manager), async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name) values ('menu-media', 'x.webp')");
    });
  });
});
