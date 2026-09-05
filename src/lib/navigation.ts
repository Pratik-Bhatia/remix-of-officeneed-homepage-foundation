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
    items: ["Featured Exclusives", "New Exclusives"],
  },
  {
    id: "corporate-gifting",
    label: "Corporate Gifting",
    blurb: "Curated gifting programmes for teams, clients and milestones.",
    
    items: [
      "Gift Sets",
      "Drinkware & Utensils",
        "Bags",
        "Diaries",
        "Luxury Pens",
    ],
  },
  {
    id: "fragrance-luxury",
    label: "Fragrance Gifting",
    blurb: "Considered luxury for leadership and landmark occasions.",
    items: [
      "European Perfume",
      "Middle Eastern Perfume",
      "Perfume Gift Sets",
    ],
  },
  {
    id: "office-stationery",
    label: "Office Stationery",
    blurb: "Everyday essentials, specified once and replenished on schedule.",
    items: ["Files and Folders", "Printing Papers", "Staplers and Punching", "Pen"],
  },
  {
    id: "hardware-supplies",
    label: "Computer Peripherals",
    blurb: "Workstation hardware and peripherals for growing teams.",
    items: ["Computer Accessories", "Cables & Adapters", "Storage Devices"],
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

export function navCategoryTarget(categoryId: string): ProductsLinkTarget {
  const category = navCategories.find(c => c.id === categoryId);
  if (!category) return { missingMapping: categoryId };

  const handle = getHandle(category.label);
  if (!handle) return { missingMapping: category.label };
  
  return { collection: handle };
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
  "Officeneed Exclusive": { collection: TAXONOMY["Officeneed Exclusive"].handle! },
  "Corporate Gifting": { collection: TAXONOMY["Corporate Gifting"].handle! },
  "Office Stationery": { collection: TAXONOMY["Office Stationery"].handle! },
  "Computer Peripherals": { collection: TAXONOMY["Computer Peripherals"].handle! },
  "Fragrance Gifting": { collection: TAXONOMY["Fragrance Gifting"].handle! },
  "Fragrance & Luxury Gifting": { collection: TAXONOMY["Fragrance Gifting"].handle! },
};
