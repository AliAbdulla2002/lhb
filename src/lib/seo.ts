import type { MetaDescriptor } from "react-router";
import { siteUrl } from "~/config/env";
import { business } from "~/config/business";

const SITE_NAME = "لهب LAHAB";

/** Page metadata: title, description, canonical URL and Open Graph. */
export function seo({ title, description, path, noindex = false }: { title: string; description?: string; path: string; noindex?: boolean }): MetaDescriptor[] {
  const url = new URL(path, siteUrl).toString();
  const tags: MetaDescriptor[] = [
    { title },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:locale", content: "ar_BH" },
    { property: "og:locale:alternate", content: "en_BH" },
    { name: "twitter:card", content: "summary" },
  ];
  if (description) {
    tags.push({ name: "description", content: description }, { property: "og:description", content: description }, { name: "twitter:description", content: description });
  }
  if (noindex) tags.push({ name: "robots", content: "noindex, nofollow" });
  return tags;
}

/** schema.org Restaurant built only from verified facts (no hours, ratings or claims). */
export function restaurantJsonLd(): MetaDescriptor {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: business.name,
      alternateName: business.alternateName,
      url: siteUrl,
      hasMenu: new URL("/menu", siteUrl).toString(),
      servesCuisine: business.servesCuisine,
      telephone: business.telephone[0],
      priceRange: business.priceRange,
      address: { "@type": "PostalAddress", ...business.address },
      sameAs: business.sameAs,
    },
  };
}
