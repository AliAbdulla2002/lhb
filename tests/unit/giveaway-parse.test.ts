import { parseComments, parseList } from "~/features/admin/giveaway-parse";

const copiedFromInstagram = `lahab.bh
Giveaway! Tag 2 friends to win a plate 🔥
2d
ali.bh
@sara_99 @huda.k يلا
1d
3 likes
Reply
sara_99
@ali.bh
@ali.bh
5h
Reply
huda.k
بالتوفيق
2h
ali.bh
@moh @sara_99
1h
See translation`;

describe("parseComments", () => {
  test("finds each commenter once and counts distinct friends they tagged", () => {
    const { entries } = parseComments(copiedFromInstagram);
    const byName = Object.fromEntries(entries.map((e) => [e.username, e]));
    expect(Object.keys(byName).sort()).toEqual(["ali.bh", "huda.k", "lahab.bh", "sara_99"]);
    expect(byName["ali.bh"]).toMatchObject({ mentions: 3, comments: 2 });
    expect(byName["sara_99"]).toMatchObject({ mentions: 1 });
    expect(byName["huda.k"]).toMatchObject({ mentions: 0 });
  });

  test("applies the tag rule and excludes the restaurant's own account", () => {
    const { entries, excluded } = parseComments(copiedFromInstagram, { minMentions: 2, exclude: ["@Lahab.bh"] });
    expect(entries.map((e) => e.username)).toEqual(["ali.bh"]);
    expect(excluded).toEqual(
      expect.arrayContaining([
        { username: "lahab.bh", reason: "excluded" },
        { username: "huda.k", reason: "mentions" },
        { username: "sara_99", reason: "mentions" },
      ]),
    );
  });

  test("reads spreadsheet exports (username, comment)", () => {
    const { entries } = parseComments("ali.bh,\"@a @b\"\nsara_99\t@c", { minMentions: 1 });
    expect(entries.map((e) => [e.username, e.mentions])).toEqual([
      ["ali.bh", 2],
      ["sara_99", 1],
    ]);
  });
});

describe("parseList", () => {
  test("one account per line, de-duplicated, interface lines ignored", () => {
    const { entries, excluded } = parseList("@Ali.bh\nsara_99 Sara\nali.bh\nFollow\n\nhuda.k", { exclude: ["huda.k"] });
    expect(entries.map((e) => e.username)).toEqual(["ali.bh", "sara_99"]);
    expect(excluded).toEqual([{ username: "huda.k", reason: "excluded" }]);
  });
});
