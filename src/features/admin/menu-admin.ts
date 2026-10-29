import { getSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import { optimiseImage } from "~/lib/image";

const sb = () => getSupabase()!;

export interface AdminCategory {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  sort_order: number;
  is_visible: boolean;
  archived_at: string | null;
  products: { count: number }[];
}

export interface AdminOptionValue {
  id?: string;
  name_ar: string;
  name_en: string;
  price_delta: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
}

export interface AdminOption {
  id?: string;
  name_ar: string;
  name_en: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  product_option_values: AdminOptionValue[];
}

export interface AdminProduct {
  id: string;
  category_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  base_price: number;
  is_available: boolean;
  is_featured: boolean;
  is_best_seller: boolean;
  available_from: string | null;
  available_until: string | null;
  sort_order: number;
  archived_at: string | null;
  product_images: { id: string; storage_path: string; is_primary: boolean; sort_order: number; alt_ar: string | null; alt_en: string | null }[];
  product_staff_notes: { notes: string } | null;
  product_options: AdminOption[];
}

export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  return must(
    await sb()
      .from("categories")
      .select("id, slug, name_ar, name_en, description_ar, description_en, sort_order, is_visible, archived_at, products(count)")
      .order("sort_order")
      .order("name_en"),
  ) as AdminCategory[];
}

export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  return must(
    await sb()
      .from("products")
      .select("id, category_id, slug, name_ar, name_en, base_price, is_available, is_featured, is_best_seller, sort_order, archived_at, product_images(id, storage_path, is_primary, sort_order)")
      .order("sort_order")
      .order("name_en"),
  ) as AdminProduct[];
}

export async function fetchAdminProduct(id: string): Promise<AdminProduct | null> {
  const row = must(
    await sb()
      .from("products")
      .select(
        "*, product_images(id, storage_path, is_primary, sort_order, alt_ar, alt_en), product_staff_notes(notes), product_options(id, name_ar, name_en, min_select, max_select, sort_order, is_active, product_option_values(id, name_ar, name_en, price_delta, is_default, is_available, sort_order))",
      )
      .eq("id", id)
      .maybeSingle(),
  ) as AdminProduct | null;
  if (!row) return null;
  row.product_images.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  row.product_options.sort((a, b) => a.sort_order - b.sort_order);
  for (const o of row.product_options) o.product_option_values.sort((a, b) => a.sort_order - b.sort_order);
  return row;
}

export type ProductInput = Pick<
  AdminProduct,
  | "category_id"
  | "slug"
  | "name_ar"
  | "name_en"
  | "description_ar"
  | "description_en"
  | "base_price"
  | "is_available"
  | "is_featured"
  | "is_best_seller"
  | "available_from"
  | "available_until"
>;

export async function saveProduct(id: string | null, input: ProductInput, staffNotes: string): Promise<string> {
  const saved = id
    ? (must(await sb().from("products").update(input).eq("id", id).select("id").single()) as { id: string })
    : (must(await sb().from("products").insert(input).select("id").single()) as { id: string });
  const notes = staffNotes.trim();
  if (notes) must(await sb().from("product_staff_notes").upsert({ product_id: saved.id, notes }).select("product_id"));
  else if (id) must(await sb().from("product_staff_notes").delete().eq("product_id", saved.id).select("product_id"));
  return saved.id;
}

export async function updateProduct(id: string, patch: Partial<AdminProduct>) {
  must(await sb().from("products").update(patch).eq("id", id).select("id").single());
}

export async function deleteProduct(id: string) {
  must(await sb().from("products").delete().eq("id", id).select("id").single());
}

/** Save an option group and its values; values missing from `option` are deleted. */
export async function saveOption(productId: string, option: AdminOption, previousValueIds: string[]) {
  const group = {
    product_id: productId,
    name_ar: option.name_ar,
    name_en: option.name_en,
    min_select: option.min_select,
    max_select: option.max_select,
    sort_order: option.sort_order,
    is_active: option.is_active,
  };
  const saved = option.id
    ? (must(await sb().from("product_options").update(group).eq("id", option.id).select("id").single()) as { id: string })
    : (must(await sb().from("product_options").insert(group).select("id").single()) as { id: string });

  const keep = option.product_option_values.filter((v) => v.id).map((v) => v.id!);
  const removed = previousValueIds.filter((id) => !keep.includes(id));
  if (removed.length) must(await sb().from("product_option_values").delete().in("id", removed).select("id"));

  for (const [index, v] of option.product_option_values.entries()) {
    const row = {
      option_id: saved.id,
      name_ar: v.name_ar,
      name_en: v.name_en,
      price_delta: v.price_delta,
      is_default: v.is_default,
      is_available: v.is_available,
      sort_order: index,
    };
    if (v.id) must(await sb().from("product_option_values").update(row).eq("id", v.id).select("id").single());
    else must(await sb().from("product_option_values").insert(row).select("id").single());
  }
}

export async function deleteOption(id: string) {
  must(await sb().from("product_options").delete().eq("id", id).select("id").single());
}

export async function uploadProductImage(productId: string, file: File, makePrimary: boolean) {
  const { blob, ext, type } = await optimiseImage(file);
  const path = `products/${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb().storage.from("menu-media").upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  if (makePrimary) must(await sb().from("product_images").update({ is_primary: false }).eq("product_id", productId).select("id"));
  must(await sb().from("product_images").insert({ product_id: productId, storage_path: path, is_primary: makePrimary }).select("id").single());
}

export async function setPrimaryImage(productId: string, imageId: string) {
  must(await sb().from("product_images").update({ is_primary: false }).eq("product_id", productId).select("id"));
  must(await sb().from("product_images").update({ is_primary: true }).eq("id", imageId).select("id").single());
}

export async function deleteProductImage(imageId: string, path: string) {
  must(await sb().from("product_images").delete().eq("id", imageId).select("id").single());
  // Remove the file after the row, so a failure never leaves a broken image on the menu.
  await sb().storage.from("menu-media").remove([path]);
}

export async function reorder(table: string, ids: string[]) {
  must(await sb().rpc("admin_reorder", { p_table: table, p_ids: ids }));
}

/** Swap an item with its neighbour and persist the new order. */
export function moved<T extends { id?: string }>(items: T[], index: number, delta: -1 | 1): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
