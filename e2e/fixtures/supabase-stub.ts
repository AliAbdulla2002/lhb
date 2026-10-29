/**
 * UI smoke tests only: answers the Supabase REST endpoints the public pages call with
 * fixture rows, so layout, RTL/LTR and states can be checked without a database.
 * Business logic and security are covered by tests/db against the real migrations.
 */
import type { Page, Route } from "@playwright/test";

export const STUB_SUPABASE_URL = "http://supabase.stub.test";

const cat = (id: string, slug: string, ar: string, en: string, sort: number) => ({
  id, slug, name_ar: ar, name_en: en, description_ar: null, description_en: null, image_path: null, sort_order: sort,
});
const categories = [cat("c1", "shawarma", "شاورما (نموذج)", "Shawarma (sample)", 1), cat("c2", "sides", "إضافات (نموذج)", "Sides (sample)", 2)];

const product = (id: string, category: string, slug: string, ar: string, en: string, price: number, extra: object = {}) => ({
  id, category_id: category, slug, name_ar: ar, name_en: en,
  description_ar: "عنصر تجريبي للاختبار.", description_en: "Placeholder item for testing.",
  base_price: price, is_available: true, is_featured: true, is_best_seller: false, sort_order: 1, product_images: [], ...extra,
});
const products = [
  product("p1", "c1", "sample-chicken", "شاورما دجاج — نموذج", "Chicken shawarma — SAMPLE", 1, { is_best_seller: true }),
  product("p2", "c1", "sample-arabic", "شاورما عربي — نموذج", "Arabic shawarma — SAMPLE", 2),
  product("p3", "c2", "sample-fries", "بطاطس — نموذج", "Fries — SAMPLE", 0.8, { is_available: false, is_featured: false }),
];
const detail = {
  ...products[0],
  product_options: [
    {
      id: "o1", name_ar: "الحجم", name_en: "Size", min_select: 1, max_select: 1, sort_order: 1,
      product_option_values: [
        { id: "v1", name_ar: "عادي", name_en: "Regular", price_delta: 0, is_default: true, is_available: true, sort_order: 1 },
        { id: "v2", name_ar: "كبير", name_en: "Large", price_delta: 0.5, is_default: false, is_available: true, sort_order: 2 },
      ],
    },
    {
      id: "o2", name_ar: "صوصات", name_en: "Sauces", min_select: 0, max_select: 2, sort_order: 2,
      product_option_values: [
        { id: "v3", name_ar: "صوص ١", name_en: "Sauce 1", price_delta: 0.2, is_default: false, is_available: true, sort_order: 1 },
        { id: "v4", name_ar: "صوص ٢", name_en: "Sauce 2", price_delta: 0.2, is_default: false, is_available: false, sort_order: 2 },
      ],
    },
  ],
};
const branches = [
  {
    id: "b1", slug: "aali", name_ar: "عالي", name_en: "A'ali", address_ar: "مبنى 2542، طريق 4270، عالي",
    address_en: "Building 2542, Road 4270, A'ali", phone: "+97333447433", maps_url: null, pickup_paused: false,
    business_hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens_at: "17:00:00", closes_at: "00:00:00", closes_next_day: true })),
  },
];
const settings = {
  display_name_ar: "لهب", display_name_en: "LAHAB", tagline_ar: "شاورما أصلية 🔥", tagline_en: "Authentic Shawarma 🔥",
  phones: ["+97333447433", "+97317232805"], whatsapp: null, instagram_url: "https://www.instagram.com/lahab.bh/", ordering_enabled: true,
};
const content = [
  { key: "home.hero.title", value_ar: "شاورما على اللهب", value_en: "Shawarma, fired up" },
  { key: "home.hero.subtitle", value_ar: "اطلب الحين واستلم طلبك من سيارتك في عالي.", value_en: "Order now and pick up from your car in A'ali." },
  { key: "about.body", value_ar: "نص عن لهب بانتظار الاعتماد.", value_en: "About copy awaiting approval." },
];
const promotions = [
  { id: "pr1", title_ar: "عرض تجريبي", title_en: "Sample offer", body_ar: "ليس عرضاً حقيقياً.", body_en: "Not a real promotion.", image_path: null, cta_label_ar: null, cta_label_en: null, link_path: "/menu", ends_at: null },
];

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });
}

export async function stubSupabase(page: Page, opts: { unavailableInCart?: boolean } = {}) {
  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    const url = new URL(req.url());
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const path = url.pathname.replace("/rest/v1/", "");
    switch (path) {
      case "categories":
        return json(route, categories);
      case "products": {
        const slug = url.searchParams.get("slug")?.replace("eq.", "");
        if (slug) return json(route, slug === detail.slug ? detail : null);
        if (url.searchParams.get("is_featured")) return json(route, products.filter((p) => p.is_featured));
        return json(route, products);
      }
      case "branches":
        return json(route, branches);
      case "restaurant_settings":
        return json(route, single ? settings : [settings]);
      case "site_content":
        return json(route, content);
      case "promotions":
        return json(route, promotions);
      case "rpc/quote_cart": {
        const { p_items } = req.postDataJSON() as { p_items: { product_id: string; quantity: number; option_value_ids: string[] }[] };
        const lines = p_items.map((it, index) => {
          const p = products.find((x) => x.id === it.product_id)!;
          const opts = it.option_value_ids.includes("v2") ? 0.5 : 0;
          return { index, product_id: p.id, product_name_ar: p.name_ar, product_name_en: p.name_en, unit_base_price: p.base_price, unit_options_price: opts, quantity: it.quantity, line_total: (p.base_price + opts) * it.quantity };
        });
        const issues = opts.unavailableInCart ? [{ index: 0, product_id: p_items[0]!.product_id, code: "product_unavailable" }] : [];
        const valid = lines.filter((l) => !issues.some((i) => i.index === l.index));
        const subtotal = valid.reduce((s, l) => s + l.unit_base_price * l.quantity, 0);
        const optionsTotal = valid.reduce((s, l) => s + l.unit_options_price * l.quantity, 0);
        return json(route, { lines: valid, issues, subtotal, options_total: optionsTotal, discount_total: 0, delivery_fee: 0, total: subtotal + optionsTotal, coupon: null });
      }
      default:
        if (path === "rpc/my_roles") return json(route, []);
        return route.fulfill({ status: 404, body: "{}", contentType: "application/json" });
    }
  });
}
