import { requireSupabase } from "~/lib/supabase";
import type { Branch, Category, Product, ProductDetail, Promotion, Quote, RestaurantSettings, SiteContent } from "./types";

const PRODUCT_COLUMNS =
  "id, category_id, slug, name_ar, name_en, description_ar, description_en, base_price, is_available, is_featured, is_best_seller, sort_order, product_images(id, storage_path, alt_ar, alt_en, sort_order, is_primary)";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// RLS already hides archived and hidden rows from the public; filters below make the
// intent explicit and keep staff (who can see more) on the same public view.

export async function fetchCategories(): Promise<Category[]> {
  return unwrap(
    await requireSupabase()
      .from("categories")
      .select("id, slug, name_ar, name_en, description_ar, description_en, image_path, sort_order")
      .eq("is_visible", true)
      .is("archived_at", null)
      .order("sort_order")
      .order("name_en"),
  );
}

export async function fetchProducts(): Promise<Product[]> {
  return unwrap(
    await requireSupabase()
      .from("products")
      .select(PRODUCT_COLUMNS)
      .is("archived_at", null)
      .order("sort_order")
      .order("name_en"),
  );
}

export async function fetchFeaturedProducts(): Promise<Product[]> {
  return unwrap(
    await requireSupabase()
      .from("products")
      .select(PRODUCT_COLUMNS)
      .is("archived_at", null)
      .eq("is_featured", true)
      .order("sort_order")
      .limit(8),
  );
}

export async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  const row = unwrap(
    await requireSupabase()
      .from("products")
      .select(
        `${PRODUCT_COLUMNS}, product_options(id, name_ar, name_en, min_select, max_select, sort_order, product_option_values(id, name_ar, name_en, price_delta, is_default, is_available, sort_order))`,
      )
      .eq("slug", slug)
      .is("archived_at", null)
      .eq("product_options.is_active", true)
      .maybeSingle(),
  ) as ProductDetail | null;
  if (!row) return null;
  row.product_options.sort((a, b) => a.sort_order - b.sort_order);
  for (const o of row.product_options) o.product_option_values.sort((a, b) => a.sort_order - b.sort_order);
  return row;
}

export async function fetchPromotions(): Promise<Promotion[]> {
  const now = new Date().toISOString();
  return unwrap(
    await requireSupabase()
      .from("promotions")
      .select("id, title_ar, title_en, body_ar, body_en, image_path, cta_label_ar, cta_label_en, link_path, ends_at")
      .eq("is_active", true)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("sort_order"),
  );
}

export async function fetchBranches(): Promise<Branch[]> {
  return unwrap(
    await requireSupabase()
      .from("branches")
      .select(
        "id, slug, name_ar, name_en, address_ar, address_en, phone, maps_url, pickup_paused, business_hours(weekday, opens_at, closes_at, closes_next_day)",
      )
      .eq("is_active", true)
      .order("sort_order"),
  );
}

export async function fetchSettings(): Promise<RestaurantSettings> {
  return unwrap(
    await requireSupabase()
      .from("restaurant_settings")
      .select("display_name_ar, display_name_en, tagline_ar, tagline_en, phones, whatsapp, instagram_url, ordering_enabled")
      .single(),
  );
}

export async function fetchContent(keys: string[]): Promise<Record<string, SiteContent>> {
  const rows = unwrap(
    await requireSupabase().from("site_content").select("key, value_ar, value_en").in("key", keys),
  ) as SiteContent[];
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

export interface QuoteItem {
  product_id: string;
  quantity: number;
  option_value_ids: string[];
  notes?: string;
}

/** Server-side price quote. The browser never computes authoritative totals. */
export async function quoteCart(items: QuoteItem[], couponCode?: string): Promise<Quote> {
  return unwrap(
    await requireSupabase().rpc("quote_cart", { p_items: items, p_coupon_code: couponCode ?? null }),
  ) as Quote;
}
