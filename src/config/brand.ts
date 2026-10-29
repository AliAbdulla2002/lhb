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
  /** Official vector logo not yet supplied — a text wordmark is rendered instead. */
  logo: { status: "pending-owner" as const, src: null as string | null },
  /** Colours in src/app.css are provisional until the owner supplies brand values. */
  colorsStatus: "provisional" as const,
  social: {
    instagram: "https://www.instagram.com/lahab.bh/",
  },
  /** Photography: none licensed yet. Product cards show a branded placeholder. */
  photographyStatus: "pending-owner" as const,
} as const;
