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

// ---- public menu -----------------------------------------------------------------
// Public data only (anon key + RLS). Skipped when the backend is unreachable: the site
// still builds, just without the menu in the sitemap, structured data and llms.txt.
const staticPaths = ["/", "/menu", "/offers", "/about", "/contact", "/privacy", "/terms"];
let categories = [];
let products = [];
if (supabase && env.VITE_SUPABASE_ANON_KEY) {
  const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
  const get = (q) => fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : []));
  try {
    [categories, products] = await Promise.all([
      get("categories?select=id,slug,name_ar,name_en,sort_order&is_visible=eq.true&archived_at=is.null&order=sort_order"),
      get(
        "products?select=slug,category_id,name_ar,name_en,description_ar,description_en,base_price,is_available,sort_order,updated_at,product_images(storage_path,is_primary,sort_order)&archived_at=is.null&order=sort_order",
      ),
    ]);
  } catch {
    console.warn("postbuild: menu not reachable, skipping menu SEO");
  }
}
const imageOf = (p) => {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  return imgs[0] ? `${env.VITE_SUPABASE_URL}/storage/v1/object/public/menu-media/${imgs[0].storage_path.split("/").map(encodeURIComponent).join("/")}` : null;
};
// Link previews want a JPEG (WhatsApp doesn't reliably show WebP), so product photos are
// served through Netlify's image CDN as JPEG. Remote images from Supabase are allowed in
// netlify.toml ([images] remote_images). On another host, use the photo URL directly.
const previewImage = (url) => (url ? `${site}/.netlify/images?url=${encodeURIComponent(url)}&fm=jpg&w=1080&q=85` : `${site}/og-image.jpg`);
const bhd = (n) => `${Number(n).toFixed(3)} د.ب.`;
const productUrl = (p) => `${site}/menu/item/${p.slug}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const restaurantRef = { "@id": `${site}/#restaurant` };
const menuItem = (p) => ({
  "@type": "MenuItem",
  name: `${p.name_ar} | ${p.name_en}`,
  description: [p.description_ar, p.description_en].filter(Boolean).join(" — ") || undefined,
  url: productUrl(p),
  image: imageOf(p) ?? undefined,
  offers: {
    "@type": "Offer",
    price: Number(p.base_price).toFixed(3),
    priceCurrency: "BHD",
    availability: p.is_available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
  },
});
const sections = categories
  .map((c) => ({ ...c, items: products.filter((p) => p.category_id === c.id) }))
  .filter((c) => c.items.length);

/** Adds tags to a prerendered page: head tags before </head>, plain-text content in <noscript>. */
function inject(path, head, noscript) {
  const file = join(out, path, "index.html");
  if (!existsSync(file)) return false;
  let html = readFileSync(file, "utf8");
  html = html.replace("</head>", `${head}</head>`);
  if (noscript) html = html.replace(/<body([^>]*)>/, `<body$1><noscript>${noscript}</noscript>`);
  writeFileSync(file, html);
  return true;
}

// Each product page: title, description and its own photo for link previews and crawlers
// that don't run JavaScript. The product page removes the data-prerender-seo copies once
// it has loaded (it renders the same tags itself).
let productPages = 0;
for (const p of products) {
  const title = `${p.name_ar} | ${p.name_en} — لهب LAHAB`;
  const description = [p.description_ar, `السعر ${bhd(p.base_price)}`, p.description_en].filter(Boolean).join(" · ");
  const image = previewImage(imageOf(p));
  const tag = (attr, key, content) => `<meta ${attr}="${key}" content="${esc(content)}" data-prerender-seo/>`;
  const head = [
    `<title data-prerender-seo>${esc(title)}</title>`,
    tag("name", "description", description),
    tag("property", "og:title", title),
    tag("property", "og:description", description),
    tag("property", "og:image", image),
    tag("property", "og:image:alt", p.name_ar),
    tag("name", "twitter:title", title),
    tag("name", "twitter:description", description),
    tag("name", "twitter:image", image),
    ld({ "@context": "https://schema.org", ...menuItem(p), isPartOf: restaurantRef }),
  ].join("");
  const text = `<h1>${esc(p.name_ar)} — ${esc(p.name_en)}</h1><p>${esc(description)}</p><p><a href="/menu">المنيو / Menu</a></p>`;
  if (inject(`menu/item/${p.slug}`, head, text)) productPages++;
}

// The menu page and each category page: the full menu as schema.org Menu data, plus a
// plain-text list of dishes and prices.
const menuLd = {
  "@context": "https://schema.org",
  "@type": "Menu",
  "@id": `${site}/menu#menu`,
  name: "منيو لهب | Lahab menu",
  url: `${site}/menu`,
  inLanguage: ["ar", "en"],
  hasMenuSection: sections.map((c) => ({ "@type": "MenuSection", name: `${c.name_ar} | ${c.name_en}`, url: `${site}/menu/${c.slug}`, hasMenuItem: c.items.map(menuItem) })),
};
const listText = (secs) =>
  secs
    .map((c) => `<h2>${esc(c.name_ar)} — ${esc(c.name_en)}</h2><ul>${c.items.map((p) => `<li><a href="/menu/item/${p.slug}">${esc(p.name_ar)} — ${esc(p.name_en)}</a>: ${bhd(p.base_price)}</li>`).join("")}</ul>`)
    .join("");
if (sections.length) {
  inject("menu", ld(menuLd), listText(sections));
  for (const c of sections) {
    inject(`menu/${c.slug}`, ld({ "@context": "https://schema.org", ...menuLd.hasMenuSection.find((s) => s.url.endsWith(`/${c.slug}`)), isPartOf: { "@id": `${site}/menu#menu` } }), listText([c]));
  }
}

// ---- sitemap -------------------------------------------------------------------
// Arabic and English share URLs (language is a client preference), so no hreflang.
const urlEntry = (loc, extra = "") => `  <url><loc>${loc}</loc>${extra}</url>`;
const urls = [
  ...staticPaths.map((p) => urlEntry(`${site}${p}`)),
  ...sections.map((c) => urlEntry(`${site}/menu/${c.slug}`)),
  ...products.map((p) => {
    const image = imageOf(p);
    return urlEntry(
      productUrl(p),
      `<lastmod>${p.updated_at.slice(0, 10)}</lastmod>${image ? `<image:image><image:loc>${esc(image)}</image:loc></image:image>` : ""}`,
    );
  }),
].join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`,
);

// ---- llms.txt ------------------------------------------------------------------
// A plain summary for AI assistants and answer engines (https://llmstxt.org). Facts only:
// what the menu and site say; no hours, ratings or claims until the owner confirms them.
writeFileSync(
  join(out, "llms.txt"),
  [
    "# لهب LAHAB — شاورما في عالي، البحرين",
    "",
    "> Lahab (لهب) is a shawarma restaurant in A'ali, Bahrain. Customers order online on this website and collect their order from their car: they choose a pickup time, add their car plate, and tap \"I'm here\" (وصلت) when they arrive so the team brings the order out. Payment is cash on pickup. Prices are in Bahraini dinars (BHD).",
    "",
    "## Contact",
    "",
    "- Address: Building 2542, Road 4270, A'ali, Bahrain (مبنى 2542، طريق 4270، عالي)",
    "- Phone / WhatsApp: +973 3344 7433; phone: +973 1723 2805",
    "- Instagram: https://www.instagram.com/lahab.bh/",
    "",
    "## Pages",
    "",
    `- [Menu with prices](${site}/menu)`,
    `- [Contact and location](${site}/contact)`,
    `- [About](${site}/about)`,
    `- [Offers](${site}/offers)`,
    "",
    ...(sections.length
      ? [
          "## Menu",
          "",
          ...sections.flatMap((c) => [
            `### ${c.name_ar} — ${c.name_en}`,
            "",
            ...c.items.map((p) => `- [${p.name_ar} — ${p.name_en}](${productUrl(p)}): ${Number(p.base_price).toFixed(3)} BHD${p.description_en ? `. ${p.description_en}` : ""}`),
            "",
          ]),
        ]
      : []),
  ].join("\n"),
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

console.log(`postbuild: ${productPages} product pages, sitemap (${staticPaths.length + sections.length + products.length} urls), llms.txt, robots.txt, _redirects, _headers for ${site}`);
