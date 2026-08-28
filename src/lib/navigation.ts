import { TAXONOMY, MainCategory, CollectionMapping } from './taxonomy';
import type { ProductSort } from './products';

export type NavCategory = {
  id: string;
  label: string;
  blurb: string;
  featured?: boolean;
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
    label: "Fragrance Gifting",
    blurb: "Considered luxury for leadership and landmark occasions.",
    items: [
      "Perfumes",
      "Premium Gifts",
      "Luxury Gifting",
    ],
  },
  {
    id: "office-stationery",
    label: "Office Stationery",
    blurb: "Everyday essentials, specified once and replenished on schedule.",
    items: ["Writing Instruments", "Notebooks & Notepads", "Desk Accessories", "Other Stationery"],
  },
  {
    id: "hardware-supplies",
    label: "Hardware Supplies",
    blurb: "Workstation hardware and peripherals for growing teams.",
    items: ["Computer Accessories", "Cables & Adapters", "Storage Devices", "Other Hardware"],
  },
];

export const primaryNavCategories: NavCategory[] = navCategories.filter(
  (c) => !c.hiddenFromPrimaryNav,
);

export type ProductsLinkTarget = {
  collection?: string;
  sort?: ProductSort;
  missingMapping?: string;
};

function getHandle(categoryLabel: string, itemLabel?: string): string | null {
  for (const main of Object.values(TAXONOMY)) {
    if (main.title === categoryLabel) {
      if (!itemLabel) return main.handle;
      const sub = main.subcategories[itemLabel];
      if (sub) return sub.handle;
      return null;
    }
  }
  return null;
}

export function navItemTarget(categoryId: string, item: string): ProductsLinkTarget {
  const category = navCategories.find(c => c.id === categoryId);
  if (!category) return { missingMapping: item };

  const handle = getHandle(category.label, item);
  if (!handle) {
    console.warn(`Missing Shopify collection mapping: ${category.label} -> ${item}`);
    return { missingMapping: item };
  }
  
  return { collection: handle };
}

export const footerShopTargets: Record<string, ProductsLinkTarget> = {
  "Shop All": {},
  Bestsellers: { sort: "Featured" },
  "Corporate Gifting": { collection: TAXONOMY["Corporate Gifting"].handle! },
  "Office Stationery": { collection: TAXONOMY["Office Stationery"].handle! },
  "Hardware Supplies": { collection: TAXONOMY["Hardware Supplies"].handle! },
  "Fragrance Gifting": { collection: TAXONOMY["Fragrance Gifting"].handle! },
};
