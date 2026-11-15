import { addLine, itemsFromLines, MAX_QTY, phoneOk, setNotes, setQuantity, toggleNotePhrase, type CounterLine } from "~/features/admin/counter";

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

  test("quantity changes; zero removes the line; capped at the server's limit", () => {
    let lines = addLine([], { ...wrap, optionValueIds: [], quantity: 1 });
    const key = lines[0]!.key;
    lines = setQuantity(lines, key, 150);
    expect(lines[0]!.quantity).toBe(MAX_QTY);
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

  test("quick requests toggle on and off inside the note", () => {
    let note = toggleNotePhrase("", "بدون سلطة");
    note = toggleNotePhrase(note, "حار");
    expect(note).toBe("بدون سلطة، حار");
    expect(toggleNotePhrase(note, "بدون سلطة")).toBe("حار");
    expect(toggleNotePhrase("extra bread, حار", "حار")).toBe("extra bread");
  });

  test("editing a line's note keeps its place, and merges with an identical line", () => {
    let lines: CounterLine[] = [];
    lines = addLine(lines, { ...wrap, optionValueIds: [], quantity: 1 });
    lines = addLine(lines, { ...wrap, productId: "p2", optionValueIds: [], quantity: 1 });
    lines = addLine(lines, { ...wrap, optionValueIds: [], quantity: 2, notes: "بدون بصل" });
    lines = setNotes(lines, lines[1]!.key, "حار");
    expect(lines.map((l) => [l.productId, l.notes ?? ""])).toEqual([
      ["p1", ""],
      ["p2", "حار"],
      ["p1", "بدون بصل"],
    ]);
    lines = setNotes(lines, lines[0]!.key, "بدون بصل");
    expect(lines.map((l) => [l.productId, l.quantity, l.notes ?? ""])).toEqual([
      ["p1", 3, "بدون بصل"],
      ["p2", 1, "حار"],
    ]);
  });
});
