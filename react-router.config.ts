import type { Config } from "@react-router/dev/config";
import { existsSync, readFileSync } from "node:fs";

const STATIC_PAGES = ["/", "/menu", "/offers", "/about", "/contact", "/privacy", "/terms"];

/** Category and product URLs from the public menu, so each gets its own HTML page. */
async function menuPaths(): Promise<string[]> {
  const env: Record<string, string | undefined> = { ...process.env };
  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      const [, name, value] = m ?? [];
      if (name && value !== undefined && env[name] === undefined) env[name] = value.replace(/^["']|["']$/g, "");
    }
  }
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env;
  if (!url || !key) return [];
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = (q: string) =>
    fetch(`${url}/rest/v1/${q}`, { headers, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? (r.json() as Promise<{ slug: string }[]>) : []));
  try {
    const [cats, prods] = await Promise.all([
      get("categories?select=slug&is_visible=eq.true&archived_at=is.null"),
      get("products?select=slug&archived_at=is.null"),
    ]);
    return [...cats.map((c) => `/menu/${c.slug}`), ...prods.map((p) => `/menu/item/${p.slug}`)];
  } catch {
    console.warn("prerender: menu not reachable, prerendering static pages only");
    return [];
  }
}

export default {
  appDirectory: "src",
  // Static SPA: no runtime server. Public pages, including every menu category and
  // product, are prerendered to HTML at build time for search engines and link previews;
  // everything else (and products added after the build) falls back to the SPA shell.
  ssr: false,
  async prerender() {
    return [...STATIC_PAGES, ...(await menuPaths())];
  },
} satisfies Config;
