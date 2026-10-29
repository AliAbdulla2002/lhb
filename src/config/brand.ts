/**
 * Brand configuration. Business facts (phones, address, hours, menu) live in the database
 * (restaurant_settings, branches, business_hours, site_content) and are edited from /admin.
 * This file holds only visual identity and verified public links.
 *
 * Status of each asset is tracked here so nothing provisional ships unnoticed.
 */
export const brand = {
  nameAr: "لهب",
  nameEn: "LAHAB",
  /** Owner-supplied logo (150 px raster). A vector file is still needed for print and large sizes. */
  logo: { status: "raster-supplied" as const, src: "/brand/lahab-logo.webp" },
  /** Colours in src/app.css are sampled from the owner-supplied menu artwork. */
  colorsStatus: "sampled-from-official-artwork" as const,
  social: {
    instagram: "https://www.instagram.com/lahab.bh/",
  },
  /** Photography: the menu images are too small to reuse; original photos are needed. */
  photographyStatus: "pending-owner" as const,
} as const;
