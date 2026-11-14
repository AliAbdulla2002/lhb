import { as, asCommit, createTestDb, createUser, errorOf, grantRole, orderPayload, placeOrder, seedMenu, service, user, type Db, type MenuFixture } from "./harness";

let db: Db;
let fx: MenuFixture;
let manager: string;
let staff: string;
let customers: string[];

type Draw = {
  id: string;
  entry_count: number;
  seed: string;
  winners: { position: number; is_alternate: boolean; entry_key: string; label: string; order_number: string | null }[];
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(new Date());
const rpc = <T>(who: string, sql: string, params: unknown[] = []) =>
  as(db, user(who), async (tx) => (await tx.query<{ r: T }>(`select ${sql} as r`, params)).rows[0]!.r);

beforeAll(async () => {
  db = await createTestDb();
  fx = await seedMenu(db);
  manager = await createUser(db, { email: "manager@example.test" });
  staff = await createUser(db, { email: "staff@example.test" });
  await grantRole(db, manager, "manager");
  await grantRole(db, staff, "staff", fx.branchA);
  customers = [];
  for (const name of ["Ali", "Sara", "Huda"]) {
    customers.push(await createUser(db, { email: `${name.toLowerCase()}@example.test`, meta: { full_name: `${name} Test` }, phone: "+97333001234" }));
  }
  // Ali: two completed orders; Sara: one completed; Huda: one still pending.
  for (const [who, complete] of [[0, true], [0, true], [1, true], [2, false]] as const) {
    const { order_id } = await asCommit(db, service, (tx) => placeOrder(tx, customers[who]!, orderPayload(fx)));
    if (complete) {
      await asCommit(db, user(manager), async (tx) => {
        for (const s of ["confirmed", "preparing", "ready", "completed"]) await tx.query("select public.transition_order_status($1, $2)", [order_id, s]);
      });
    }
  }
});

describe("order draws", () => {
  test("only completed orders count; per-customer mode gives each customer one entry", async () => {
    expect(await rpc<number>(manager, "public.admin_giveaway_order_count($1, $1, null, 0, false)", [today()])).toBe(3);
    expect(await rpc<number>(manager, "public.admin_giveaway_order_count($1, $1, null, 0, true)", [today()])).toBe(2);
  });

  test("draws winners and alternates, stores the seed, and the result can be re-computed", async () => {
    const d = await asCommit(db, user(manager), async (tx) =>
      (await tx.query<{ r: Draw }>("select public.admin_draw_orders('Weekly prize', $1, $1, null, 0, false, 1, 2) as r", [today()])).rows[0]!.r,
    );
    expect(d.entry_count).toBe(3);
    expect(d.winners).toHaveLength(3);
    expect(d.winners.filter((w) => w.is_alternate)).toHaveLength(2);
    expect(d.winners[0]!.order_number).toMatch(/^LH-/);
    expect(d.winners[0]!.label).toContain("·");

    // Anyone with the seed and the entry list gets the same order.
    const check = await as(db, service, async (tx) => {
      const { rows } = await tx.query<{ k: string }>(
        "select k from public.giveaways g, jsonb_array_elements_text(g.entries) k where g.id = $1 order by public.giveaway_rank(g.seed, k)",
        [d.id],
      );
      return rows.map((r) => r.k);
    });
    expect(d.winners.map((w) => w.entry_key)).toEqual(check);
  });

  test("a draw needs enough entries, and only managers can run one", async () => {
    expect(await errorOf(rpc(manager, "public.admin_draw_orders('Too many', $1, $1, null, 0, true, 5, 0)", [today()]))).toBe("lahab.not_enough_entries");
    expect(await errorOf(rpc(staff, "public.admin_draw_orders('Nope', $1, $1, null, 0, true, 1, 0)", [today()]))).toBe("lahab.forbidden");
    expect(await errorOf(rpc(customers[0]!, "public.admin_giveaway_order_count($1, $1)", [today()]))).toBe("lahab.forbidden");
  });

  test("staff and customers cannot read past draws", async () => {
    const seen = await as(db, user(staff), async (tx) => (await tx.query("select id from public.giveaways")).rows.length);
    expect(seen).toBe(0);
  });
});

describe("Instagram list draws", () => {
  test("names are cleaned and de-duplicated before the draw", async () => {
    const d = await asCommit(db, user(manager), async (tx) =>
      (
        await tx.query<{ r: Draw }>(
          "select public.admin_draw_list('Comments', 'instagram_comments', $1, 2, 0, '{\"min_mentions\": 2}') as r",
          [["@Ali.bh", "ali.bh", " sara_99 ", "not valid!", "huda"]],
        )
      ).rows[0]!.r,
    );
    expect(d.entry_count).toBe(3);
    expect(d.winners).toHaveLength(2);
    for (const w of d.winners) expect(["@ali.bh", "@sara_99", "@huda"]).toContain(w.label);
  });

  test("orders are not a list source", async () => {
    expect(await errorOf(rpc(manager, "public.admin_draw_list('x', 'orders', $1)", [["a"]]))).toBe("lahab.invalid_request");
  });

  test("history lists the newest draw first", async () => {
    const list = await rpc<{ title: string }[]>(manager, "public.admin_list_giveaways()");
    expect(list[0]!.title).toBe("Comments");
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});
