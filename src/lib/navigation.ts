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
    id: "office-stationery",
    label: "Office Stationery",
    blurb: "Everyday essentials, specified once and replenished on schedule.",
    items: ["Writing Instruments", "Notebooks", "Desk Accessories", "Office Supplies"],
  },
  {
    id: "it-infrastructure",
    label: "IT Infrastructure",
    blurb: "Workstation hardware and peripherals for growing teams.",
    items: ["Mouse", "Keyboards", "Mousepads", "Printers", "Computer Accessories"],
  },
  {
    id: "printing-branding",
    label: "Printing & Branding",
    blurb: "Brand-consistent print and merchandise, produced to spec.",
    hiddenFromPrimaryNav: true,
    items: ["Custom Printing", "Corporate Branding", "Printed Materials", "Branded Merchandise"],
  },
  {
    id: "fragrance-luxury",
    label: "Fragrance & Luxury Gifting",
    blurb: "Considered luxury for leadership and landmark occasions.",
    items: ["Perfumes", "Fragrances", "Premium Gifts", "Luxury Gifting"],
  },
  {
    id: "officeneed-exclusive",
    label: "Officeneed Exclusive",
    blurb: "Made for OfficeNeed. Available nowhere else.",
    items: ["Exclusive Products", "Featured Exclusives", "New Exclusives"],
  },
];

/** Categories shown in the header navigation (desktop mega menu + mobile drawer). */
export const primaryNavCategories: NavCategory[] = navCategories.filter(
  (c) => !c.hiddenFromPrimaryNav,
);
