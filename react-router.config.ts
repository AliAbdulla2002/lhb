import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  // Static SPA: no runtime server. Public marketing pages are prerendered to HTML
  // at build time for SEO; everything else falls back to the SPA shell.
  ssr: false,
  prerender: ["/", "/menu", "/offers", "/about", "/contact", "/privacy", "/terms"],
} satisfies Config;
