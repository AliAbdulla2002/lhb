import { initialSelections, invalidOptions, toggleValue, unitEstimate } from "~/features/menu/customize";
import type { OptionValue, ProductDetail, ProductOption } from "~/lib/api/types";

const value = (id: string, delta: number, extra: Partial<OptionValue> = {}): OptionValue => ({
  id,
  name_ar: id,
  name_en: id,
  price_delta: delta,
  is_default: false,
  is_available: true,
  sort_order: 0,
  ...extra,
});

const size: ProductOption = {
  id: "size",
  name_ar: "الحجم",
  name_en: "Size",
  min_select: 1,
  max_select: 1,
  sort_order: 1,
  product_option_values: [value("regular", 0, { is_default: true }), value("large", 0.5)],
};

const extras: ProductOption = {
  id: "extras",
  name_ar: "إضافات",
  name_en: "Extras",
  min_select: 0,
  max_select: 2,
  sort_order: 2,
  product_option_values: [value("cheese", 0.3), value("sauce", 0.2), value("egg", 0.25)],
};

const product: ProductDetail = {
  id: "p",
  category_id: "c",
  slug: "p",
  name_ar: "ص",
  name_en: "P",
  description_ar: null,
  description_en: null,
  base_price: 1.2,
  is_available: true,
  is_featured: false,
  is_best_seller: false,
  sort_order: 0,
  product_images: [],
  product_options: [size, extras],
};

test("preselects available defaults", () => {
  expect(initialSelections(product)).toEqual({ size: ["regular"], extras: [] });
});

test("single-choice required options behave like radios", () => {
  expect(toggleValue(size, ["regular"], "large")).toEqual(["large"]);
  expect(toggleValue(size, ["large"], "large")).toEqual(["large"]);
});

test("multi-choice options respect max_select", () => {
  let current = toggleValue(extras, [], "cheese");
  current = toggleValue(extras, current, "sauce");
  expect(toggleValue(extras, current, "egg")).toEqual(["cheese", "sauce"]);
  expect(toggleValue(extras, current, "cheese")).toEqual(["sauce"]);
});

test("flags missing required choices", () => {
  expect(invalidOptions(product, { size: [], extras: [] })).toEqual(["size"]);
  expect(invalidOptions(product, { size: ["large"], extras: [] })).toEqual([]);
});

test("estimates the unit price exactly", () => {
  expect(unitEstimate(product, { size: ["large"], extras: ["cheese", "sauce"] })).toBe(2.2);
});
