/**
 * Verified public business facts used at BUILD time for SEO (structured data in the
 * prerendered HTML), where the database isn't available. Runtime pages read the same
 * facts from the database. Keep in sync with /admin settings when they change.
 *
 * Sources (2026-10-29): Instagram @lahab.bh bio and the Google Business listing.
 * Opening hours are deliberately omitted: the sources disagree (see docs/OWNER_CHECKLIST.md).
 */
export const business = {
  name: "LAHAB | لهب",
  alternateName: ["Lahab", "لهب", "مطعم لهب"],
  description:
    "مطعم شاورما في عالي، البحرين. اطلب أونلاين واستلم طلبك من سيارتك. Shawarma restaurant in A'ali, Bahrain: order online and collect from your car.",
  servesCuisine: ["Shawarma", "Middle Eastern", "Fast food"],
  telephone: ["+97333447433", "+97317232805"],
  address: {
    streetAddress: "Building 2542, Road 4270",
    addressLocality: "A'ali",
    addressCountry: "BH",
  },
  priceRange: "BHD 1–5",
  sameAs: ["https://www.instagram.com/lahab.bh/"],
} as const;
