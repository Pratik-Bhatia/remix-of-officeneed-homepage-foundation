export type MainCategory =
  | "Officeneed Exclusive"
  | "Corporate Gifting"
  | "Fragrance Gifting"
  | "Office Stationery"
  | "Computer Peripherals";

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
      "Featured Exclusives": { title: "Featured Exclusives", id: null, handle: "featured-exclusives" },
      "New Exclusives": { title: "New Exclusives", id: null, handle: "exclusive-products" },
      
    }
  },
  "Corporate Gifting": {
    title: "Corporate Gifting",
    id: "gid://shopify/Collection/497947345124",
    handle: "frontpage",
    subcategories: {
      "Gift Sets": { title: "Gift Sets", id: null, handle: "gift-sets" },
      "Premium Gifts": { title: "Premium Gifts", id: null, handle: "premium-gifts" },
      "Corporate Gifts": { title: "Corporate Gifts", id: null, handle: "corporate-gifts" },
      "Drinkware & Utensils": { title: "Drinkware & Utensils", id: null, handle: "drinkware-utensils" },
      "Customized Gifts": { title: "Customized Gifts", id: null, handle: "customized-gifts" },
    }
  },
  "Fragrance Gifting": {
    title: "Fragrance Gifting",
    id: "gid://shopify/Collection/498084937956",
    handle: "fragrance-gifting",
    subcategories: {
      "European Perfume": { title: "European Perfume", id: "gid://shopify/Collection/315489419357", handle: "european-perfume" },
      "Middle Eastern Perfume": { title: "Middle Eastern Perfume", id: "gid://shopify/Collection/315489550429", handle: "eastern-perfume" },
      "Perfume Gift Sets": { title: "Perfume Gift Sets", id: null, handle: "perfume-gift-sets" }
    }
  },
  "Office Stationery": {
    title: "Office Stationery",
    id: "gid://shopify/Collection/498084806884",
    handle: "office-stationary",
    subcategories: {
      "Files and Folders": { title: "Files and Folders", id: null, handle: "files-and-folders" },
      "Printing Papers": { title: "Printing Papers", id: null, handle: "printing-papers" },
      "Staplers and Punching": { title: "Staplers and Punching", id: null, handle: "staplers-and-punching" },
      "Pen": { title: "Pen", id: null, handle: "pen" }
    }
  },
  "Computer Peripherals": {
    title: "Computer Peripherals",
    id: "gid://shopify/Collection/498085003492",
    handle: "hardware",
    subcategories: {
      "Computer Accessories": { title: "Computer Accessories", id: "gid://shopify/Collection/315533361245", handle: "computer-accessories-1" },
      "Cables & Adapters": { title: "Cables & Adapters", id: null, handle: "cables-and-adapters" },
      "Storage Devices": { title: "Storage Devices", id: null, handle: "storage-devices" },
      "Other Hardware": { title: "Other Hardware", id: null, handle: "other-hardware" },
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

export function getCategoryByTitle(title: string): { parentTitle?: string; node: CollectionMapping } | null {
  for (const main of Object.values(TAXONOMY)) {
    if (main.title === title) return { node: main };
    for (const sub of Object.values(main.subcategories)) {
      if (sub.title === title) return { parentTitle: main.title, node: sub };
    }
  }
  return null;
}
