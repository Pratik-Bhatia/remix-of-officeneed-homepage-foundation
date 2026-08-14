export type NavCategory = {
  id: string;
  label: string;
  blurb: string;
  featured?: boolean;
  /** Kept in the catalogue but hidden from the primary header navigation. */
  hiddenFromPrimaryNav?: boolean;
  items: string[];
};

export const navCategories: NavCategory[] = [
  {
    id: "officeneed-exclusive",
    label: "Officeneed Exclusive",
    blurb: "Made for OfficeNeed. Available nowhere else.",
    items: ["Exclusive Products", "Featured Exclusives", "New Exclusives"],
  },
  {
    id: "corporate-gifting",
    label: "Corporate Gifting",
    blurb: "Curated gifting programmes for teams, clients and milestones.",
    featured: true,
    items: [
      "Gift Sets",
      "Corporate Gifts",
      "Premium Gifts",
      "Drinkware & Utensils",
      "Customized Gifts",
    ],
  },
  {
    id: "fragrance-luxury",
    label: "Fragrance & Luxury Gifting",
    blurb: "Considered luxury for leadership and landmark occasions.",
    items: [
      "Perfumes",
      "Eastern Perfumes",
      "Western Perfumes",
      "Premium Gifts",
      "Luxury Gifting",
    ],
  },
  {
    id: "office-stationery",
    label: "Office Stationery",
    blurb: "Everyday essentials, specified once and replenished on schedule.",
    items: ["Writing Instruments", "Notebooks", "Desk Accessories", "Office Supplies"],
  },
  {
    id: "hardware-supplies",
    label: "Hardware Supplies",
    blurb: "Workstation hardware and peripherals for growing teams.",
    items: ["Mouse", "Keyboards", "Printers", "Computer Accessories"],
  },
  {
    id: "printing-branding",
    label: "Printing & Branding",
    blurb: "Brand-consistent print and merchandise, produced to spec.",
    hiddenFromPrimaryNav: true,
    items: ["Custom Printing", "Corporate Branding", "Printed Materials", "Branded Merchandise"],
  },
];

/** Categories shown in the header navigation (desktop mega menu + mobile drawer). */
export const primaryNavCategories: NavCategory[] = navCategories.filter(
  (c) => !c.hiddenFromPrimaryNav,
);

/**
 * Destination for a header/footer navigation entry on the /products listing.
 * `category` maps to the listing's category filter, `sort` to its sort control.
 */
export type ProductsCategoryFilter =
  | "All Products"
  | "Corporate Gifting"
  | "Office Supplies"
  | "Hardware & IT"
  | "Printing & Branding"
  | "Fragrance & Luxury Gifting";

export type ProductsSortOption =
  | "Featured"
  | "Newest"
  | "Price: Low to High"
  | "Price: High to Low"
  | "Name: A–Z";

export type ProductsLinkTarget = {
  category?: ProductsCategoryFilter;
  subcategory?: string;
  sort?: ProductsSortOption;
};

/** Nav category id -> product listing category filter. */
export const navCategoryToProductCategory: Record<string, ProductsCategoryFilter> = {
  "officeneed-exclusive": "All Products",
  "corporate-gifting": "Corporate Gifting",
  "fragrance-luxury": "Fragrance & Luxury Gifting",
  "office-stationery": "Office Supplies",
  "hardware-supplies": "Hardware & IT",
  "printing-branding": "Printing & Branding",
};

/** Individual mega-menu / drawer items that need a target other than their category. */
const navItemOverrides: Record<string, ProductsLinkTarget> = {
  "Exclusive Products": { category: "All Products", sort: "Featured" },
  "Featured Exclusives": { category: "All Products", sort: "Featured" },
  "New Exclusives": { category: "All Products", sort: "Newest" },
};

/** Resolves the /products search params for a nav item inside a nav category. */
export function navItemTarget(categoryId: string, item: string): ProductsLinkTarget {
  const override = navItemOverrides[item];
  if (override) return override;
  return { 
    category: navCategoryToProductCategory[categoryId] ?? "All Products",
    subcategory: item 
  };
}

/** Footer "Shop" labels -> /products search params. */
export const footerShopTargets: Record<string, ProductsLinkTarget> = {
  "Shop All": { category: "All Products" },
  Bestsellers: { category: "All Products", sort: "Featured" },
  "Corporate Gifting": { category: "Corporate Gifting" },
  "Office Stationery": { category: "Office Supplies" },
  "Hardware Supplies": { category: "Hardware & IT" },
  "Fragrance & Luxury Gifting": { category: "Fragrance & Luxury Gifting" },
};
