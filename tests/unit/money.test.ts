import { formatBHD, fromFils, toFils } from "~/lib/money";

test("formats BHD with three decimals in both languages using Latin digits", () => {
  expect(formatBHD(1.5, "en")).toMatch(/1\.500/);
  expect(formatBHD(1.5, "en")).toMatch(/BHD/);
  expect(formatBHD("2.25", "ar")).toMatch(/2[.٫]250/);
  expect(formatBHD(2.25, "ar")).not.toMatch(/[٠-٩]/);
});

test("fils arithmetic avoids floating point drift", () => {
  expect(fromFils(toFils(0.1) + toFils(0.2))).toBe(0.3);
  expect(toFils("1.200")).toBe(1200);
});
