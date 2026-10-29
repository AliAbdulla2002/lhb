import { clearIdempotencyKey, idempotencyKeyFor } from "~/features/checkout/idempotency";
import { itemsFromCart, normalizePlate, orderErrorMessage, PLATE_RE } from "~/features/checkout/api";
import i18n from "~/i18n";

beforeEach(() => {
  sessionStorage.clear();
  clearIdempotencyKey();
});

describe("idempotency key", () => {
  test("is reused for the same request and survives a reload", () => {
    const req = { branch_id: "b", items: [{ product_id: "p", quantity: 1 }] };
    const first = idempotencyKeyFor(req);
    expect(idempotencyKeyFor({ ...req })).toBe(first);
    expect(JSON.parse(sessionStorage.getItem("lahab.checkout.idempotency")!).key).toBe(first);
  });

  test("changes when the request changes, and after clearing", () => {
    const a = idempotencyKeyFor({ notes: "a" });
    const b = idempotencyKeyFor({ notes: "b" });
    expect(b).not.toBe(a);
    clearIdempotencyKey();
    expect(idempotencyKeyFor({ notes: "b" })).not.toBe(b);
  });
});

describe("vehicle plate", () => {
  test.each([["  12345 ", "12345"], ["ab  123", "AB 123"], ["12-345", "12-345"]])("normalises %s", (raw, expected) => {
    expect(normalizePlate(raw)).toBe(expected);
    expect(PLATE_RE.test(expected)).toBe(true);
  });
  test.each(["<script>", "1", "12345678901234", "AB_12"])("rejects %s", (raw) => {
    expect(PLATE_RE.test(normalizePlate(raw))).toBe(false);
  });
});

test("cart lines become order items without any price fields", () => {
  const items = itemsFromCart([
    { key: "k", productId: "p1", slug: "s", nameAr: "", nameEn: "", quantity: 2, optionValueIds: ["b", "a"], optionLabels: [], notes: "", unitEstimate: 9.999 },
  ]);
  expect(items).toEqual([{ product_id: "p1", quantity: 2, option_value_ids: ["a", "b"] }]);
  expect(JSON.stringify(items)).not.toMatch(/price|estimate|total/);
});

describe("order error messages", () => {
  const t = i18n.getFixedT("en");
  test("maps coded server errors", () => {
    expect(orderErrorMessage({ message: "lahab.slot_full" }, t)).toBe("That pickup time just filled up. Please choose another.");
    expect(orderErrorMessage({ message: "lahab.forbidden" }, t)).toBe("You don't have permission to do that.");
  });
  test("network failures get the safe-retry message; raw errors are never shown", () => {
    expect(orderErrorMessage(new TypeError("Failed to fetch"), t)).toMatch(/won't be charged twice/);
    expect(orderErrorMessage({ message: 'relation "orders" violates something internal' }, t)).toBe("Something went wrong. Please try again.");
  });
});
