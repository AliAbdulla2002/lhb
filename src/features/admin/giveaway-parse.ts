/**
 * Turns text pasted from Instagram into draw entries. Instagram's API does not give a
 * restaurant its followers list, and comments need a Meta business app, so the manager
 * copies the comments (or a followers export) and pastes them here.
 *
 * Comments, as copied from instagram.com, arrive as blocks: the username on its own line
 * (or followed by the comment on the same line), then the comment, then lines such as
 * "2d", "Reply" or "3 likes". Followers lists are one username per line.
 */

// At least one letter or digit, so lines like "." or "•" are not read as accounts.
const USERNAME = /^@?((?=[a-z0-9._]*[a-z0-9])[a-z0-9._]{1,30})$/i;
const MENTION = /@([a-z0-9._]{1,30})/gi;
// Interface lines Instagram puts between comments (English and Arabic web UI).
const NOISE = new RegExp(
  `^(${[
    /reply|replies|view( all)? \d* ?repl(y|ies)( \(\d+\))?|hide( all)? replies|see translation|translation|verified|edited|like|liked|post|follow|following|remove|original audio|load more comments/,
    // Time and likes, which the web page glues together: "5w", "5wReply", "4w1 likeReply", "Edited · 5w".
    /(edited\s*·\s*)?\d+[smhdwy](\s*\d+ likes?)?\s*(reply)?/,
    /\d+ likes?|\d+ (seconds?|minutes?|hours?|days?|weeks?)( ago)?/,
    /(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(, \d{4})?/,
    /رد|الرد|ردود|عرض الردود.*|إخفاء الردود|مشاهدة الترجمة|إعجاب|تم التحقق|\d+ إعجاب(ات)?|متابعة|يتابع|نشر|صوت أصلي/,
  ]
    .map((r) => r.source)
    .join("|")})$`,
  "i",
);

export interface ParsedEntry {
  username: string;
  /** Distinct accounts this person tagged across all their comments. */
  mentions: number;
  comments: number;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Accounts left out by the rules (too few tags, or excluded). */
  excluded: { username: string; reason: "mentions" | "excluded" }[];
}

const clean = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

export function parseComments(text: string, { minMentions = 0, exclude = [] as string[] } = {}): ParseResult {
  const skip = new Set(exclude.map(clean).filter(Boolean));
  const people = new Map<string, { mentions: Set<string>; comments: number }>();
  let current: string | null = null;

  const add = (name: string) => {
    current = name;
    if (!people.has(name)) people.set(name, { mentions: new Set(), comments: 0 });
    people.get(name)!.comments++;
  };
  const addText = (body: string) => {
    if (!current) return;
    const p = people.get(current)!;
    for (const m of body.matchAll(MENTION)) {
      const tagged = m[1]!.toLowerCase();
      if (tagged !== current) p.mentions.add(tagged);
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;
    // CSV / spreadsheet export: "username,comment" or "username<TAB>comment".
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (cells.length > 1 && USERNAME.test(cells[0]!.trim())) {
      add(clean(cells[0]!));
      addText(cells.slice(1).join(" "));
      continue;
    }
    const only = USERNAME.exec(line);
    if (only) {
      // A lone @mention on its own line is part of a comment, not a new commenter.
      if (line.startsWith("@") && current) addText(line);
      else add(only[1]!.toLowerCase());
      continue;
    }
    // "username comment text" on one line.
    const [first, ...rest] = line.split(/\s+/);
    if (first && !first.startsWith("@") && USERNAME.test(first) && rest.length && /@/.test(rest.join(" ")) && !current) {
      add(clean(first));
      addText(rest.join(" "));
      continue;
    }
    addText(line);
  }

  const entries: ParsedEntry[] = [];
  const excluded: ParseResult["excluded"] = [];
  for (const [username, p] of people) {
    if (skip.has(username)) excluded.push({ username, reason: "excluded" });
    else if (p.mentions.size < minMentions) excluded.push({ username, reason: "mentions" });
    else entries.push({ username, mentions: p.mentions.size, comments: p.comments });
  }
  entries.sort((a, b) => a.username.localeCompare(b.username));
  return { entries, excluded };
}

/** One account per line (followers export or any list); the first word of each line counts. */
export function parseList(text: string, { exclude = [] as string[] } = {}): ParseResult {
  const skip = new Set(exclude.map(clean).filter(Boolean));
  const seen = new Set<string>();
  const entries: ParsedEntry[] = [];
  const excluded: ParseResult["excluded"] = [];
  for (const raw of text.split(/\r?\n/)) {
    const first = raw.trim().split(/[\s,\t]+/)[0] ?? "";
    const m = USERNAME.exec(first);
    if (!m || NOISE.test(first)) continue;
    const name = m[1]!.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    if (skip.has(name)) excluded.push({ username: name, reason: "excluded" });
    else entries.push({ username: name, mentions: 0, comments: 0 });
  }
  entries.sort((a, b) => a.username.localeCompare(b.username));
  return { entries, excluded };
}
