import type { MetaDescriptor } from "react-router";
import { siteUrl } from "~/config/env";
import { business } from "~/config/business";

const SITE_NAME = "لهب LAHAB";

/** The link-preview image (1200×630), made from the official logo and menu photos. */
export const SHARE_IMAGE = { path: "/og-image.jpg", width: 1200, height: 630, alt: "شاورما لهب — اطلب أونلاين واستلم من سيارتك في عالي، البحرين" };

/** Page metadata: title, description, canonical URL, Open Graph and the share image. */
export function seo({ title, description, path, noindex = false }: { title: string; description?: string; path: string; noindex?: boolean }): MetaDescriptor[] {
  const url = new URL(path, siteUrl).toString();
  const image = new URL(SHARE_IMAGE.path, siteUrl).toString();
  const tags: MetaDescriptor[] = [
    { title },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:locale", content: "ar_BH" },
    { property: "og:locale:alternate", content: "en_BH" },
    { property: "og:image", content: image },
    { property: "og:image:secure_url", content: image },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:width", content: String(SHARE_IMAGE.width) },
    { property: "og:image:height", content: String(SHARE_IMAGE.height) },
    { property: "og:image:alt", content: SHARE_IMAGE.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: image },
  ];
  if (description) {
    tags.push({ name: "description", content: description }, { property: "og:description", content: description }, { name: "twitter:description", content: description });
  }
  // Let search engines show large image previews and full snippets.
  tags.push({ name: "robots", content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1" });
  return tags;
}

/**
 * schema.org Restaurant (plus the WebSite it belongs to) built only from verified facts:
 * no opening hours, ratings or claims until the owner confirms them.
 */
export function restaurantJsonLd(): MetaDescriptor {
  const id = `${siteUrl}/#restaurant`;
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Restaurant",
          "@id": id,
          name: business.name,
          alternateName: business.alternateName,
          description: business.description,
          url: siteUrl,
          logo: new URL("/brand/lahab-logo.png", siteUrl).toString(),
          image: [new URL(SHARE_IMAGE.path, siteUrl).toString(), new URL("/brand/lahab-logo.png", siteUrl).toString()],
          hasMenu: new URL("/menu", siteUrl).toString(),
          servesCuisine: business.servesCuisine,
          telephone: business.telephone[0],
          priceRange: business.priceRange,
          currenciesAccepted: "BHD",
          acceptsReservations: false,
          address: { "@type": "PostalAddress", ...business.address },
          areaServed: { "@type": "Country", name: "Bahrain" },
          sameAs: business.sameAs,
          potentialAction: {
            "@type": "OrderAction",
            target: { "@type": "EntryPoint", urlTemplate: new URL("/menu", siteUrl).toString(), inLanguage: ["ar", "en"] },
            deliveryMethod: "http://purl.org/goodrelations/v1#DeliveryModePickUp",
          },
        },
        {
          "@type": "WebSite",
          "@id": `${siteUrl}/#website`,
          url: siteUrl,
          name: "لهب LAHAB",
          inLanguage: ["ar", "en"],
          publisher: { "@id": id },
        },
      ],
    },
  };
}
