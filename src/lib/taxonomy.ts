export type MainCategory =
  | "Officeneed Exclusive"
  | "Corporate Gifting"
  | "Fragrance Gifting"
  | "Office Stationery"
  | "Hardware Supplies";

export type CollectionMapping = {
  title: string;
  id: string | null;
  handle: string | null;
};

export type CategoryNode = CollectionMapping & {
  subcategories: Record<string, CollectionMapping>;
};

export const TAXONOMY: Record<MainCategory, CategoryNode> = {
  "Officeneed Exclusive": {
    title: "Officeneed Exclusive",
    id: "gid://shopify/Collection/498084970724",
    handle: "exclusive-products",
    subcategories: {
      "Exclusive Products": { title: "Exclusive Products", id: null, handle: null },
      "Featured Exclusives": { title: "Featured Exclusives", id: null, handle: null },
      "New Exclusives": { title: "New Exclusives", id: null, handle: null },
      "Notebooks & Notepads": { title: "Notebooks & Notepads", id: "gid://shopify/Collection/498206998756", handle: "notebooks-notepads" },
      "Writing Instruments": { title: "Writing Instruments", id: null, handle: null },
      "Desk Accessories": { title: "Desk Accessories", id: null, handle: null },
      "Organizers": { title: "Organizers", id: null, handle: null },
      "Office Essentials": { title: "Office Essentials", id: null, handle: null },
      "Exclusive Collections": { title: "Exclusive Collections", id: null, handle: null },
    }
  },
  "Corporate Gifting": {
    title: "Corporate Gifting",
    id: "gid://shopify/Collection/497947345124",
    handle: "frontpage",
    subcategories: {
      "Gift Sets": { title: "Gift Sets", id: null, handle: "gift-sets" },
      "Premium Gifts": { title: "Premium Gifts", id: null, handle: null },
      "Corporate Gifts": { title: "Corporate Gifts", id: null, handle: null },
      "Drinkware & Utensils": { title: "Drinkware & Utensils", id: null, handle: null },
      "Customized Gifts": { title: "Customized Gifts", id: null, handle: null },
    }
  },
  "Fragrance Gifting": {
    title: "Fragrance Gifting",
    id: "gid://shopify/Collection/498084937956",
    handle: "fragance-gifting",
    subcategories: {
      "Perfumes": { title: "Perfumes", id: null, handle: null },
      "Fragrance Gift Sets": { title: "Fragrance Gift Sets", id: null, handle: null },
      "Attars": { title: "Attars", id: null, handle: null },
      "Home Fragrance": { title: "Home Fragrance", id: null, handle: null },
      "Premium Fragrances": { title: "Premium Fragrances", id: null, handle: null },
    }
  },
  "Office Stationery": {
    title: "Office Stationery",
    id: "gid://shopify/Collection/498084806884",
    handle: null,
    subcategories: {
      "Notebooks & Notepads": { title: "Notebooks & Notepads", id: "gid://shopify/Collection/498206998756", handle: "notebooks-notepads" },
      "Pens & Writing Instruments": { title: "Pens & Writing Instruments", id: null, handle: null },
      "Paper Products": { title: "Paper Products", id: null, handle: null },
      "Files & Folders": { title: "Files & Folders", id: null, handle: null },
      "Desk Accessories": { title: "Desk Accessories", id: null, handle: null },
      "Office Organizers": { title: "Office Organizers", id: null, handle: null },
      "Sticky Notes & Memo Pads": { title: "Sticky Notes & Memo Pads", id: null, handle: null },
      "Other Stationery": { title: "Other Stationery", id: null, handle: null },
    }
  },
  "Hardware Supplies": {
    title: "Hardware Supplies",
    id: "gid://shopify/Collection/498085003492",
    handle: "hardware",
    subcategories: {
      "Computer Accessories": { title: "Computer Accessories", id: null, handle: null },
      "Cables & Adapters": { title: "Cables & Adapters", id: null, handle: null },
      "Storage Devices": { title: "Storage Devices", id: null, handle: null },
      "Mobile Accessories": { title: "Mobile Accessories", id: null, handle: null },
      "Power & Charging": { title: "Power & Charging", id: null, handle: null },
      "Networking Accessories": { title: "Networking Accessories", id: null, handle: null },
      "Other Hardware": { title: "Other Hardware", id: null, handle: null },
    }
  }
};

export const MAIN_CATEGORIES = Object.keys(TAXONOMY) as MainCategory[];

export function getCategoryByHandle(handle: string): { parentTitle?: string; node: CollectionMapping } | null {
  for (const main of Object.values(TAXONOMY)) {
    if (main.handle === handle) return { node: main };
    for (const sub of Object.values(main.subcategories)) {
      if (sub.handle === handle) return { parentTitle: main.title, node: sub };
    }
  }
  return null;
}
