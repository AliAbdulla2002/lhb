import type { ProductDetail, ProductOption } from "~/lib/api/types";
import { fromFils, toFils } from "~/lib/money";

export type Selections = Record<string, string[]>;

/** Default choices: available values flagged as default. */
export function initialSelections(product: ProductDetail): Selections {
  return Object.fromEntries(
    product.product_options.map((o) => [
      o.id,
      o.product_option_values
        .filter((v) => v.is_default && v.is_available)
        .slice(0, o.max_select)
        .map((v) => v.id),
    ]),
  );
}

/** Toggle a value, respecting single-choice (radio) and max_select limits. */
export function toggleValue(option: ProductOption, current: string[], valueId: string): string[] {
  if (option.max_select === 1) return current.includes(valueId) && option.min_select === 0 ? [] : [valueId];
  if (current.includes(valueId)) return current.filter((id) => id !== valueId);
  if (current.length >= option.max_select) return current;
  return [...current, valueId];
}

/** Option groups whose selection count is out of range. Mirrors the server rule. */
export function invalidOptions(product: ProductDetail, selections: Selections): string[] {
  return product.product_options
    .filter((o) => {
      const n = (selections[o.id] ?? []).length;
      return n < o.min_select || n > o.max_select;
    })
    .map((o) => o.id);
}

/** Display estimate in BHD using integer fils. The server price is authoritative. */
export function unitEstimate(product: ProductDetail, selections: Selections): number {
  const selected = new Set(Object.values(selections).flat());
  let fils = toFils(product.base_price);
  for (const o of product.product_options) {
    for (const v of o.product_option_values) if (selected.has(v.id)) fils += toFils(v.price_delta);
  }
  return fromFils(fils);
}

export function selectedLabels(product: ProductDetail, selections: Selections) {
  const selected = new Set(Object.values(selections).flat());
  return product.product_options.flatMap((o) =>
    o.product_option_values.filter((v) => selected.has(v.id)).map((v) => ({ ar: v.name_ar, en: v.name_en })),
  );
}
