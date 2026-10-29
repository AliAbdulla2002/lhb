/**
 * Admin UI smoke tests: a fake signed-in session plus stubbed admin endpoints. Real
 * authorisation is enforced by the database and covered in tests/db; these tests check
 * that the UI gates, calls the right endpoints and shows the results.
 */
import type { Page, Request } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./supabase-stub";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

export const ADMIN_USER_ID = "00000000-0000-4000-8000-00000000aaaa";

export async function signIn(page: Page, email = "manager@example.test") {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ADMIN_USER_ID, role: "authenticated", email, exp })}.stub-signature`;
  const session = {
    access_token: accessToken,
    refresh_token: "stub-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: { id: ADMIN_USER_ID, aud: "authenticated", role: "authenticated", email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  const storageKey = `sb-${new URL(STUB_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key!, value!), [storageKey, JSON.stringify(session)]);
}

const order = {
  id: "o1",
  order_number: "LH-261029-0007",
  status: "pending",
  branch_id: "b1",
  fulfillment_type: "pickup",
  payment_method: "cash_on_pickup",
  payment_status: "unpaid",
  requested_pickup_at: new Date().toISOString(),
  subtotal: 2,
  options_total: 0.5,
  discount_total: 0,
  total: 2.5,
  coupon_code: null,
  customer_name: "Sara Test",
  customer_phone: "+97333000000",
  notes: "Extra napkins please",
  cancel_reason: null,
  created_at: new Date().toISOString(),
  branches: { name_ar: "عالي", name_en: "A'ali" },
  pickup_details: { vehicle_plate: "12345", vehicle_color: "white", arrival_status: "arrived", arrived_at: new Date().toISOString(), notify_count: 1 },
  order_items: [
    {
      id: "i1",
      product_name_ar: "شاورما دجاج — نموذج",
      product_name_en: "Chicken shawarma — SAMPLE",
      quantity: 2,
      line_total: 2.5,
      notes: "no onions",
      order_item_options: [{ option_name_ar: "الحجم", option_name_en: "Size", value_name_ar: "كبير", value_name_en: "Large", price_delta: 0.25 }],
    },
  ],
  order_status_history: [{ from_status: null, to_status: "pending", reason: null, created_at: new Date().toISOString() }],
};

const dashboard = {
  orders_today: 7,
  by_status: { pending: 2, preparing: 1, completed: 4 },
  sales_today: 12.75,
  open_value: 6.5,
  active_orders: 3,
  waiting_pickup: 1,
  best_sellers: [{ product_id: "p1", name_ar: "شاورما دجاج — نموذج", name_en: "Chicken shawarma — SAMPLE", quantity: 9 }],
  inventory_tracking: false,
};

export interface AdminCalls {
  requests: { method: string; path: string; body: unknown }[];
}

export async function stubAdmin(page: Page, roles: string[]): Promise<AdminCalls> {
  const calls: AdminCalls = { requests: [] };
  const record = (req: Request, path: string) => {
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    calls.requests.push({ method: req.method(), path, body });
  };
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
    headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...headers },
  });

  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const url = new URL(req.url());
    const path = url.pathname.replace("/rest/v1/", "");
    if (req.method() !== "GET") record(req, path);

    if (path === "rpc/my_roles") return route.fulfill(json(roles));
    if (path === "rpc/admin_dashboard") return route.fulfill(json(dashboard));
    if (path === "rpc/transition_order_status") return route.fulfill(json({ order_id: "o1", status: (req.postDataJSON() as { p_to: string }).p_to }));
    if (path === "rpc/acknowledge_arrival") return route.fulfill(json({ order_id: "o1", arrival_status: "acknowledged" }));
    if (path === "orders") return route.fulfill(json([order], { "content-range": "0-0/1" }));
    if (path === "products" && req.method() === "PATCH") return route.fulfill(json({ id: "p1" }));
    if (path === "categories" && url.searchParams.get("select")?.includes("products(count)")) {
      return route.fulfill(
        json([
          { id: "c1", slug: "shawarma", name_ar: "شاورما (نموذج)", name_en: "Shawarma (sample)", sort_order: 1, is_visible: true, archived_at: null, products: [{ count: 2 }] },
          { id: "c2", slug: "sides", name_ar: "إضافات (نموذج)", name_en: "Sides (sample)", sort_order: 2, is_visible: true, archived_at: null, products: [{ count: 1 }] },
        ]),
      );
    }
    return route.fallback();
  });
  return calls;
}
