import { requireSupabase } from "~/lib/supabase";
import { must } from "~/lib/errors";
import { quoteCart, type QuoteItem } from "~/lib/api/menu";
import { cart } from "~/features/cart/store";
import type { CustomerOrder } from "./customer-orders";

/**
 * Put a past order back in the cart. Items are re-validated and re-priced by the server
 * (quote_cart); anything no longer available — product, option or choice — is skipped.
 */
export async function reorder(order: CustomerOrder): Promise<{ added: number; skipped: number }> {
  const candidates = order.order_items.filter(
    (i) => i.product_id && i.order_item_options.every((o) => o.option_value_id),
  );
  const skippedUpfront = order.order_items.length - candidates.length;
  if (candidates.length === 0) return { added: 0, skipped: order.order_items.length };

  const items: QuoteItem[] = candidates.map((i) => ({
    product_id: i.product_id!,
    quantity: i.quantity,
    option_value_ids: i.order_item_options.map((o) => o.option_value_id!),
    ...(i.notes ? { notes: i.notes } : {}),
  }));
  const quote = await quoteCart(items);
  const slugs = new Map(
    (must(await requireSupabase().from("products").select("id, slug").in("id", items.map((i) => i.product_id))) as { id: string; slug: string }[]).map((p) => [p.id, p.slug]),
  );

  let added = 0;
  for (const line of quote.lines) {
    const source = candidates[line.index]!;
    const slug = slugs.get(line.product_id);
    if (!slug) continue;
    cart.add({
      productId: line.product_id,
      slug,
      nameAr: line.product_name_ar,
      nameEn: line.product_name_en,
      quantity: line.quantity,
      optionValueIds: items[line.index]!.option_value_ids,
      optionLabels: source.order_item_options.map((o) => ({ ar: o.value_name_ar, en: o.value_name_en })),
      notes: source.notes ?? "",
      unitEstimate: Number(line.unit_base_price) + Number(line.unit_options_price),
    });
    added++;
  }
  return { added, skipped: skippedUpfront + (candidates.length - added) };
}
