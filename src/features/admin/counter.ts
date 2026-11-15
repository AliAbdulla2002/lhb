import { requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import type { ProductDetail } from "~/lib/api/types";
import type { QuoteItem } from "~/lib/api/menu";

/**
 * Orders staff take for walk-in customers: at the counter, or on a tablet at the car.
 * The server (staff_place_counter_order) prices, validates and numbers the order.
 */

export type CounterPayment = "cash" | "card";

export interface CounterLine {
  /** Stable key: same product + same choices + same note = same line. */
  key: string;
  productId: string;
  nameAr: string;
  nameEn: string;
  /** Choice names shown on the ticket. */
  choices: { ar: string; en: string }[];
  optionValueIds: string[];
  quantity: number;
  notes?: string;
  /** Display estimate; the server's quote is what is charged. */
  unitPrice: number;
}

export interface CounterRequest {
  branch_id: string;
  payment: CounterPayment;
  paid: boolean;
  items: QuoteItem[];
  coupon_code?: string;
  notes?: string;
  customer?: { phone?: string; name?: string };
  vehicle?: { plate: string; color?: string };
}

export interface CounterPlaced {
  order_id: string;
  order_number: string;
  status: string;
  total: number;
  replayed: boolean;
  linked_customer: boolean;
}

export const lineKey = (productId: string, optionValueIds: string[], notes?: string) =>
  `${productId}|${[...optionValueIds].sort().join(",")}|${(notes ?? "").trim()}`;

/** Add a line, merging with an identical one. */
export function addLine(lines: CounterLine[], line: Omit<CounterLine, "key">): CounterLine[] {
  const key = lineKey(line.productId, line.optionValueIds, line.notes);
  const found = lines.find((l) => l.key === key);
  if (found) return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l));
  return [...lines, { ...line, key, optionValueIds: [...line.optionValueIds].sort() }];
}

/** Change a line's quantity; zero removes it. */
export function setQuantity(lines: CounterLine[], key: string, quantity: number): CounterLine[] {
  if (quantity <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l));
}

export const itemsFromLines = (lines: CounterLine[]): QuoteItem[] =>
  lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_value_ids: l.optionValueIds, ...(l.notes ? { notes: l.notes } : {}) }));

/** Bahrain numbers: 8 digits, optionally with 973 / +973 in front. Empty is allowed. */
export function phoneOk(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  return d === "" || d.length === 8 || /^[0-9]{8,15}$/.test(d);
}

/** The whole menu with its options, for the order screen (one request). */
export async function fetchCounterMenu(): Promise<ProductDetail[]> {
  const rows = must(
    await requireSupabase()
      .from("products")
      .select(
        "id, category_id, slug, name_ar, name_en, description_ar, description_en, base_price, is_available, is_featured, is_best_seller, sort_order, product_images(id, storage_path, alt_ar, alt_en, sort_order, is_primary), product_options(id, name_ar, name_en, min_select, max_select, sort_order, is_active, product_option_values(id, name_ar, name_en, price_delta, is_default, is_available, sort_order))",
      )
      .is("archived_at", null)
      .order("sort_order")
      .order("name_en"),
  ) as ProductDetail[];
  for (const p of rows) {
    p.product_options = ((p.product_options ?? []) as (ProductDetail["product_options"][number] & { is_active: boolean })[])
      .filter((o) => o.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const o of p.product_options) o.product_option_values.sort((a, b) => a.sort_order - b.sort_order);
  }
  return rows;
}

export async function placeCounterOrder(request: CounterRequest, idempotencyKey: string): Promise<CounterPlaced> {
  return must(await requireSupabase().rpc("staff_place_counter_order", { p_payload: { ...request, idempotency_key: idempotencyKey } })) as CounterPlaced;
}
