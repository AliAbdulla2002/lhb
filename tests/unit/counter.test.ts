import { addLine, itemsFromLines, phoneOk, setQuantity, type CounterLine } from "~/features/admin/counter";

const wrap = { productId: "p1", nameAr: "لفافة", nameEn: "Wrap", choices: [], unitPrice: 1.2 };

describe("counter ticket", () => {
  test("the same item with the same choices and note merges into one line", () => {
    let lines: CounterLine[] = [];
    lines = addLine(lines, { ...wrap, optionValueIds: ["b", "a"], quantity: 1 });
    lines = addLine(lines, { ...wrap, optionValueIds: ["a", "b"], quantity: 2 });
    lines = addLine(lines, { ...wrap, optionValueIds: ["a", "b"], quantity: 1, notes: "no onion" });
    expect(lines.map((l) => [l.quantity, l.notes ?? ""])).toEqual([
      [3, ""],
      [1, "no onion"],
    ]);
    expect(lines[0]!.optionValueIds).toEqual(["a", "b"]);
  });

  test("quantity changes; zero removes the line; capped at 99", () => {
    let lines = addLine([], { ...wrap, optionValueIds: [], quantity: 1 });
    const key = lines[0]!.key;
    lines = setQuantity(lines, key, 150);
    expect(lines[0]!.quantity).toBe(99);
    expect(setQuantity(lines, key, 0)).toEqual([]);
  });

  test("builds the item list the server prices", () => {
    const lines = addLine([], { ...wrap, optionValueIds: ["x"], quantity: 2, notes: "spicy" });
    expect(itemsFromLines(lines)).toEqual([{ product_id: "p1", quantity: 2, option_value_ids: ["x"], notes: "spicy" }]);
  });

  test("phone: empty, 8-digit Bahrain or international numbers are accepted", () => {
    expect(phoneOk("")).toBe(true);
    expect(phoneOk("3600 1122")).toBe(true);
    expect(phoneOk("+973 3600 1122")).toBe(true);
    expect(phoneOk("123")).toBe(false);
  });
});
