import { act, renderHook } from "@testing-library/react";
import { __resetCartForTests, cart, MAX_QUANTITY, useCart, useCartCount } from "~/features/cart/store";

const line = {
  productId: "p1",
  slug: "p1",
  nameAr: "ص",
  nameEn: "P",
  quantity: 1,
  optionValueIds: ["b", "a"],
  optionLabels: [],
  notes: "",
  unitEstimate: 1,
};

beforeEach(() => {
  localStorage.clear();
  __resetCartForTests();
});

test("merges identical lines regardless of option order and persists", () => {
  const { result } = renderHook(() => ({ lines: useCart(), count: useCartCount() }));
  act(() => cart.add(line));
  act(() => cart.add({ ...line, optionValueIds: ["a", "b"], quantity: 2 }));
  expect(result.current.lines).toHaveLength(1);
  expect(result.current.count).toBe(3);
  expect(JSON.parse(localStorage.getItem("lahab.cart.v1")!)).toHaveLength(1);
});

test("different notes make separate lines; quantity is capped; zero removes", () => {
  const { result } = renderHook(() => useCart());
  act(() => cart.add(line));
  act(() => cart.add({ ...line, notes: "no onions" }));
  expect(result.current).toHaveLength(2);
  const key = result.current[0]!.key;
  act(() => cart.setQuantity(key, 99));
  expect(result.current[0]!.quantity).toBe(MAX_QUANTITY);
  act(() => cart.setQuantity(key, 0));
  expect(result.current).toHaveLength(1);
});

test("ignores corrupted storage", () => {
  localStorage.setItem("lahab.cart.v1", "{not json");
  const { result } = renderHook(() => useCart());
  expect(result.current).toEqual([]);
});
