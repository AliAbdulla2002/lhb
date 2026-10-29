import { authErrorKey, normalizePhone, registerSchema } from "~/features/auth/schemas";
import { safeNext } from "~/routes/auth/login";

test.each([
  ["33447433", "+97333447433"],
  ["3344 7433", "+97333447433"],
  ["+973 3344-7433", "+97333447433"],
  ["0097333447433", "+97333447433"],
  ["+447700900123", "+447700900123"],
])("normalises phone %s", (input, expected) => {
  expect(normalizePhone(input)).toBe(expected);
});

test.each(["123", "abcdefgh", "+97312"])("rejects phone %s", (input) => {
  expect(normalizePhone(input)).toBeNull();
});

test("registration requires a strong matching password and valid fields", () => {
  const ok = registerSchema.safeParse({
    fullName: "Ali",
    email: " A@Example.com ",
    phone: "33447433",
    password: "flame12345",
    confirmPassword: "flame12345",
  });
  expect(ok.success && ok.data.email).toBe("a@example.com");

  const bad = registerSchema.safeParse({ fullName: "", email: "x", phone: "1", password: "short", confirmPassword: "nope" });
  expect(bad.success).toBe(false);
  const messages = bad.error!.issues.map((i) => i.message);
  expect(messages).toEqual(
    expect.arrayContaining(["validation.nameRequired", "validation.email", "validation.phone", "validation.passwordMin"]),
  );
});

test("auth errors never leak raw server messages", () => {
  expect(authErrorKey({ code: "invalid_credentials", message: "x" })).toBe("auth.errors.invalid_credentials");
  expect(authErrorKey({ code: "unexpected_failure", message: "db exploded at row 7" })).toBe("auth.errors.generic");
});

test("post-login redirect only allows same-site paths", () => {
  expect(safeNext("/account")).toBe("/account");
  expect(safeNext("//evil.example")).toBe("/account");
  expect(safeNext("https://evil.example")).toBe("/account");
  expect(safeNext(null)).toBe("/account");
});
