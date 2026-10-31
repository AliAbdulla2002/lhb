// Captures phone screenshots of the live Lahab site for the marketing video.
// Public data (menu, prices, quotes, slots) comes from the real database with the anon
// key. Signed-in screens use a fake local session and stubbed responses for the parts
// that need one (profile, the order, the pickup queue); nothing is written anywhere.
import { chromium, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const SITE = "https://lahab-bh.netlify.app";
const API = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const OUT = new URL("../public/screens/", import.meta.url);
const ref = new URL(API).hostname.split(".")[0];
const USER_ID = "00000000-0000-4000-8000-0000000000aa";

const rest = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();
const [plate] = await rest("products?select=id,slug,name_ar,name_en,base_price&slug=eq.chicken-shawarma-plate");
const [sauce] = await rest("products?select=id,slug,name_ar,name_en,base_price&slug=eq.lahab-signature-sauce");
const [garlic] = await rest("product_option_values?select=id,name_ar,name_en&name_en=eq.Garlic%20sauce");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = {
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", exp })}.video`,
  refresh_token: "video",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: exp,
  user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "customer@example.test", email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} },
};
const cart = [
  { key: `${plate.id}||`, productId: plate.id, slug: plate.slug, nameAr: plate.name_ar, nameEn: plate.name_en, quantity: 1, optionValueIds: [], optionLabels: [], notes: "", unitEstimate: plate.base_price },
  { key: `${sauce.id}|${garlic.id}|`, productId: sauce.id, slug: sauce.slug, nameAr: sauce.name_ar, nameEn: sauce.name_en, quantity: 2, optionValueIds: [garlic.id], optionLabels: [{ ar: garlic.name_ar, en: garlic.name_en }], notes: "", unitEstimate: sauce.base_price },
];
const total = plate.base_price + 2 * sauce.base_price;
const order = (arrival) => ({
  id: "o-video", order_number: "LH-261029-0012", fulfillment_type: "pickup", status: "preparing", payment_method: "cash_on_pickup",
  payment_status: "unpaid", requested_pickup_at: new Date(Date.now() + 15 * 60_000).toISOString(), subtotal: total, options_total: 0,
  discount_total: 0, total, coupon_code: null, notes: null, cancel_reason: null, created_at: new Date().toISOString(),
  branches: { name_ar: "عالي", name_en: "A'ali", address_ar: "مبنى 2542، طريق 4270، عالي", address_en: null, pickup_instructions_ar: "اوقف في مواقف الاستلام قدام المطعم.", pickup_instructions_en: null },
  pickup_details: { vehicle_plate: "56789", vehicle_color: "red", arrival_status: arrival, last_notified_at: arrival === "arrived" ? new Date().toISOString() : null, notify_count: arrival === "arrived" ? 1 : 0 },
  order_items: [
    { id: "i1", product_id: plate.id, product_name_ar: plate.name_ar, product_name_en: plate.name_en, quantity: 1, line_total: plate.base_price, notes: null, order_item_options: [] },
    { id: "i2", product_id: sauce.id, product_name_ar: sauce.name_ar, product_name_en: sauce.name_en, quantity: 2, line_total: 2 * sauce.base_price, notes: null, order_item_options: [{ option_value_id: garlic.id, value_name_ar: garlic.name_ar, value_name_en: garlic.name_en }] },
  ],
});

// Demo data for the owner screens (dashboard, orders board, reports). These numbers are
// illustrative only; the video labels these screens as a demo.
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const demoOrders = [
  ["0018", "pending", "Ahmed", "11223", "white", "not_arrived", 4.2, 2],
  ["0017", "preparing", "Fatima", "40871", "black", "not_arrived", 3.6, 6],
  ["0016", "ready", "Sara", "56789", "red", "arrived", 3.0, 11],
  ["0015", "confirmed", "Yousif", "90210", "silver", "not_arrived", 5.5, 14],
  ["0014", "completed", "Mariam", "33012", "blue", "handed_over", 2.8, 31],
].map(([n, status, name, plate, color, arrival, total, min], i) => ({
  id: `demo-${i}`, order_number: `LH-261031-${n}`, status, branch_id: "b", fulfillment_type: "pickup", payment_method: "cash_on_pickup",
  payment_status: status === "completed" ? "paid" : "unpaid", requested_pickup_at: null, subtotal: total, options_total: 0, discount_total: 0, total,
  coupon_code: null, customer_name: name, customer_phone: "+973 3300 0000", notes: null, cancel_reason: null, created_at: ago(min),
  branches: { name_ar: "عالي", name_en: "A'ali" },
  pickup_details: { vehicle_plate: plate, vehicle_color: color, arrival_status: arrival, arrived_at: arrival === "arrived" ? ago(1) : null, notify_count: arrival === "arrived" ? 1 : 0 },
  order_items: [{ id: `it-${i}`, product_name_ar: "صحن شاورما دجاج", product_name_en: "Chicken shawarma plate", quantity: 1, line_total: total, notes: null, order_item_options: [] }],
  order_status_history: [],
}));
const demoDashboard = {
  orders_today: 42, by_status: { pending: 3, confirmed: 2, preparing: 4, ready: 2, completed: 29, cancelled: 2 }, sales_today: 128.4,
  open_value: 41.7, active_orders: 11, waiting_pickup: 2, inventory_tracking: false,
  best_sellers: [
    { product_id: null, name_ar: "صحن شاورما دجاج", name_en: "Chicken shawarma plate", quantity: 18 },
    { product_id: null, name_ar: "بكس شاورما عربي دجاج", name_en: "Arabic chicken shawarma box", quantity: 14 },
    { product_id: null, name_ar: "برجر شاورما دجاج", name_en: "Chicken shawarma burger", quantity: 11 },
    { product_id: null, name_ar: "بطاطس تشيزي", name_en: "Cheesy fries", quantity: 9 },
  ],
};
const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain" }).format(Date.now() - d * 86_400_000);
const demoReport = {
  totals: { orders: 268, completed: 251, cancelled: 9, revenue: 842.6, discounts: 18.4 },
  daily: [31, 35, 29, 40, 44, 47, 42].map((o, i) => ({ day: day(6 - i), orders: o, revenue: Math.round(o * 3.14 * 10) / 10 })),
  top_products: demoDashboard.best_sellers.map((b, i) => ({ ...b, quantity: [96, 74, 58, 41][i], revenue: [288, 207.2, 98.6, 73.8][i] })),
};

async function page(browser, { roles = ["customer"], signedIn = true, arrival = "not_arrived", withCart = false, desktop = false } = {}) {
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "ar-BH" } : { ...devices["iPhone 13"], locale: "ar-BH" });
  const p = await ctx.newPage();
  await p.addInitScript(([key, s, c, signed]) => {
    if (signed) localStorage.setItem(key, s);
    localStorage.setItem("lahab.cart.v1", c);
  }, [`sb-${ref}-auth-token`, JSON.stringify(session), withCart ? JSON.stringify(cart) : "[]", signedIn]);
  // Keep the host's "Powered by Netlify" badge and pop-up out of the captures.
  await p.route("**/.netlify/scripts/**", (route) => route.abort());
  let state = arrival;
  const admin = roles.includes("manager");
  await p.route(`${API}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/rest/v1/", "");
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (path.startsWith("/auth/")) return json({});
    if (path === "rpc/my_roles") return json(roles);
    if (path === "profiles") return json({ id: USER_ID, full_name: "Sara", phone: "+97333000000", preferred_language: "ar" });
    if (path === "favorites") return json([]);
    if (path === "rpc/get_pickup_slots") {
      const base = Math.ceil(Date.now() / 900_000) * 900_000 + 900_000;
      return json([0, 1, 2, 3, 4, 5].map((i) => ({ slot_start: new Date(base + i * 900_000).toISOString(), available: i !== 2 })));
    }
    if (path === "orders" && admin) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(demoOrders), headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", "content-range": `0-${demoOrders.length - 1}/${demoOrders.length}` } });
    if (path === "orders") return json(order(state));
    if (admin && path === "branches") return json([{ id: "b", slug: "aali", name_ar: "عالي", name_en: "A'ali" }]);
    if (path === "rpc/admin_dashboard") return json(demoDashboard);
    if (path === "rpc/admin_sales_report") return json(demoReport);
    if (path === "rpc/notify_arrival") {
      state = "arrived";
      return json({ order_id: "o-video", arrival_status: "arrived", arrived_at: new Date().toISOString(), notify_count: 1, replayed: false });
    }
    if (path === "staff_pickup_queue") {
      return json([{ order_id: "o-video", order_number: "LH-261029-0012", branch_id: "b", status: "ready", customer_first_name: "Sara", requested_pickup_at: null, created_at: new Date().toISOString(), vehicle_plate: "56789", vehicle_color: "red", arrival_status: "arrived", arrived_at: new Date(Date.now() - 42_000).toISOString(), last_notified_at: null, notify_count: 1, acknowledged_at: null, branch_name_ar: "عالي", branch_name_en: "A'ali" }]);
    }
    // Everything else (menu, quotes, settings) goes to the real API as an anonymous visitor.
    const headers = { ...req.headers(), apikey: ANON, authorization: `Bearer ${ANON}` };
    return route.continue({ headers });
  });
  return p;
}

const settle = (p) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(800));
// Capture-only cosmetics: drop transient status lines that only appear because the fake
// session can't open a realtime connection or request browser notifications.
const dropText = (p, texts) =>
  p.evaluate((ts) => {
    for (const el of [...document.querySelectorAll("main span, main p")]) {
      if (ts.some((t) => el.textContent?.includes(t)) && el.children.length <= 2) el.remove();
    }
  }, texts);
const browser = await chromium.launch();

let p = await page(browser, { signedIn: false });
await p.goto(`${SITE}/`);
await settle(p);
await p.screenshot({ path: new URL("home.png", OUT).pathname.slice(1) });
await p.goto(`${SITE}/menu`);
await settle(p);
// Menu photos load lazily: load them all before the full-page shot.
await p.evaluate(async () => {
  for (const img of document.querySelectorAll("img")) img.loading = "eager";
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  window.scrollTo(0, 0);
});
await p.waitForTimeout(800);
// A tall image for the scroll shot: the sticky header and bars would repeat mid-page.
await p.addStyleTag({ content: "header,.sticky{position:static!important}" });
await p.screenshot({ path: new URL("menu-full.png", OUT).pathname.slice(1), fullPage: true });
await p.goto(`${SITE}/menu/item/lahab-signature-sauce`);
await settle(p);
await p.getByText("سوس ثومية", { exact: true }).click();
await p.waitForTimeout(400);
await p.addStyleTag({ content: "header,.sticky{position:static!important}" });
await p.screenshot({ path: new URL("product-full.png", OUT).pathname.slice(1), fullPage: true });
await p.context().close();

p = await page(browser, { withCart: true });
await p.goto(`${SITE}/checkout`);
await settle(p);
await p.getByRole("radiogroup").getByRole("radio").nth(1).click({ force: true });
await p.getByLabel("رقم لوحة السيارة").fill("56789");
await p.getByRole("button", { name: "أحمر" }).click({ force: true });
await p.waitForTimeout(600);
await p.addStyleTag({ content: ".fixed.inset-x-0.bottom-0{display:none!important}" });
const shot = async (text, file) => {
  await p.getByRole("heading", { name: text }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90));
  await p.waitForTimeout(500);
  await p.screenshot({ path: new URL(file, OUT).pathname.slice(1) });
};
await shot("وقت الاستلام", "checkout-time.png");
await shot("الاستلام من السيارة", "checkout-car.png");
await shot("ملخص الطلب", "checkout-summary.png");
await p.context().close();

p = await page(browser);
await p.goto(`${SITE}/orders/LH-261029-0012/pickup`);
await settle(p);
await p.screenshot({ path: new URL("pickup-before.png", OUT).pathname.slice(1) });
await p.getByRole("button", { name: /وصلت/ }).click({ force: true });
await p.waitForTimeout(3000);
await p.screenshot({ path: new URL("pickup-after.png", OUT).pathname.slice(1), fullPage: true });
await p.context().close();

p = await page(browser, { roles: ["customer", "staff", "manager"] });
await p.goto(`${SITE}/admin/pickup`);
await settle(p);
await dropText(p, ["جارٍ إعادة الاتصال", "تنبيهات المتصفح محظورة"]);
await p.screenshot({ path: new URL("staff-queue.png", OUT).pathname.slice(1) });
await p.context().close();

p = await page(browser, { roles: ["customer", "staff", "manager", "super_admin"] });
for (const [path, file] of [["/admin", "admin-dashboard"], ["/admin/orders", "admin-orders"], ["/admin/reports", "admin-reports"]]) {
  await p.goto(`${SITE}${path}`);
  await settle(p);
  await dropText(p, ["جارٍ إعادة الاتصال", "تنبيهات المتصفح محظورة"]);
  await p.screenshot({ path: new URL(`${file}.png`, OUT).pathname.slice(1) });
  await p.screenshot({ path: new URL(`${file}-full.png`, OUT).pathname.slice(1), fullPage: true });
}
await p.context().close();

// The same owner screens on a laptop.
p = await page(browser, { roles: ["customer", "staff", "manager", "super_admin"], desktop: true });
for (const [path, file] of [["/admin", "desk-dashboard"], ["/admin/orders", "desk-orders"], ["/admin/pickup", "desk-pickup"], ["/admin/reports", "desk-reports"], ["/admin/products", "desk-products"]]) {
  await p.goto(`${SITE}${path}`);
  await settle(p);
  await dropText(p, ["جارٍ إعادة الاتصال", "تنبيهات المتصفح محظورة"]);
  await p.screenshot({ path: new URL(`${file}.png`, OUT).pathname.slice(1) });
}
await p.context().close();

await browser.close();
console.log("captured");
