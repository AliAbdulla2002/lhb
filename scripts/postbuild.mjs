#!/usr/bin/env node
// Writes host config and SEO files into build/client after `react-router build`:
//   sitemap.xml, robots.txt, _redirects (SPA fallback) and _headers (security headers).
// _redirects/_headers use the Netlify / Cloudflare Pages format; see docs/DEPLOYMENT.md
// for Vercel and other hosts. Reads VITE_* values from the environment or .env.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "build/client";

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(".env")) {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const site = (env.VITE_SITE_URL || "http://localhost:5173").replace(/\/+$/, "");
const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : null;

// ---- sitemap -------------------------------------------------------------------
const staticPaths = ["/", "/menu", "/offers", "/about", "/contact", "/privacy", "/terms"];
let dynamicPaths = [];
if (supabase && env.VITE_SUPABASE_ANON_KEY) {
  // Public data only (anon key + RLS). Skipped silently when the backend is unreachable.
  const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
  try {
    const [cats, prods] = await Promise.all(
      [
        "categories?select=slug&is_visible=eq.true&archived_at=is.null",
        "products?select=slug&archived_at=is.null",
      ].map((q) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : []))),
    );
    dynamicPaths = [...cats.map((c) => `/menu/${c.slug}`), ...prods.map((p) => `/menu/item/${p.slug}`)];
  } catch {
    console.warn("postbuild: menu not reachable, sitemap contains static pages only");
  }
}
const urls = [...staticPaths, ...dynamicPaths]
  // Arabic and English share URLs (language is a client preference), so no hreflang.
  .map((p) => `  <url><loc>${site}${p}</loc></url>`)
  .join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

// ---- robots --------------------------------------------------------------------
const privatePaths = ["/admin", "/account", "/cart", "/checkout", "/orders", "/login", "/register", "/forgot-password", "/reset-password", "/auth/"];
writeFileSync(
  join(out, "robots.txt"),
  ["User-agent: *", "Allow: /", ...privatePaths.map((p) => `Disallow: ${p}`), "", `Sitemap: ${site}/sitemap.xml`, ""].join("\n"),
);

// ---- SPA fallback ----------------------------------------------------------------
// Existing files (prerendered pages, assets) are served first by these hosts.
writeFileSync(join(out, "_redirects"), "/*  /__spa-fallback.html  200\n");

// ---- security headers ------------------------------------------------------------
const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "";
const csp = [
  "default-src 'self'",
  // React Router inlines its hydration data as a script; no third-party scripts are loaded.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ""}`,
  `connect-src 'self'${supabase ? ` ${supabase} ${supabaseWs}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

writeFileSync(
  join(out, "_headers"),
  `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/admin/*
  X-Robots-Tag: noindex, nofollow
/account/*
  X-Robots-Tag: noindex, nofollow
/orders/*
  X-Robots-Tag: noindex, nofollow
`,
);

console.log(`postbuild: wrote sitemap (${staticPaths.length + dynamicPaths.length} urls), robots.txt, _redirects, _headers for ${site}`);
