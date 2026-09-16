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
    handle: "officeneed-exclusive",
    subcategories: {
      "Featured Exclusives": { title: "Featured Exclusives", id: null, handle: "featured-exclusives" },
      "New Exclusives": { title: "New Exclusives", id: null, handle: "new-exclusives" },
      
    }
  },
  "Corporate Gifting": {
    title: "Corporate Gifting",
    id: "gid://shopify/Collection/497947345124",
    handle: "corporate-gifting",
    subcategories: {
      "Gift Sets": { title: "Gift Sets", id: null, handle: "gift-sets" },
      "Drinkware & Utensils": { title: "Drinkware & Utensils", id: null, handle: "drinkware-utensils" },
      "Bags": { title: "Bags", id: null, handle: "bags" },
      "Diaries": { title: "Diaries", id: null, handle: "diaries" },
      "Luxury Pens": { title: "Luxury Pens", id: null, handle: "luxury-pens" },
      "Metal Pen": { title: "Metal Pen", id: null, handle: "metal-pen" },
      "Keychains": { title: "Keychains", id: null, handle: "keychains" },
      "Mobile Stand": { title: "Mobile Stand", id: null, handle: "mobile-stand" },
    }
  },
  "Fragrance Gifting": {
    title: "Fragrance Gifting",
    id: "gid://shopify/Collection/498084937956",
    handle: "perfumes",
    subcategories: {
      "European Perfume": { title: "European Perfume", id: "gid://shopify/Collection/315489419357", handle: "european-perfume" },
      "Middle Eastern Perfume": { title: "Middle Eastern Perfume", id: "gid://shopify/Collection/315489550429", handle: "eastern-perfume" },
      "Perfume Gift Sets": { title: "Perfume Gift Sets", id: null, handle: "perfume-gift-set" }
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
    handle: "computer-accessories",
    subcategories: {
      "Computer Accessories": { title: "Computer Accessories", id: "gid://shopify/Collection/315533361245", handle: "computer-accessories-1" },
      "Cables & Adapters": { title: "Cables & Adapters", id: null, handle: "cables-and-adapters" },
      "Storage Devices": { title: "Storage Devices", id: null, handle: "storage-devices" },
      "Printer": { title: "Printer", id: null, handle: "printer" },
      "Consumables": { title: "Consumables", id: null, handle: "ink-and-cartridge" },
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

/**
 * Resolves a Shopify collection handle (main category OR any of its
 * subcategories, e.g. "corporate-gifting" or "luxury-pens") to the OfficeGPT
 * entry context it belongs to -- reusing `getCategoryByHandle` (the same
 * taxonomy lookup the product listing page already uses) rather than a
 * second, separately-maintained handle mapping. Returns `undefined` for any
 * handle outside Corporate Gifting / Fragrance Gifting (including unrecognized
 * handles), so callers naturally fall back to the generic OfficeGPT flow.
 */
export function getOfficeGptContextCategory(handle: string | undefined): "fragrance" | "corporate" | undefined {
  if (!handle) return undefined;
  const match = getCategoryByHandle(handle);
  if (!match) return undefined;
  const mainTitle = match.parentTitle ?? match.node.title;
  if (mainTitle === "Corporate Gifting") return "corporate";
  if (mainTitle === "Fragrance Gifting") return "fragrance";
  return undefined;
}

/**
 * All real Shopify collection handles that belong to a main category's
 * collection tree: the category's own handle plus every subcategory handle.
 *
 * IMPORTANT: a product can be manually curated into a subcategory collection
 * (e.g. "luxury-pens") without also being added to the parent collection
 * (e.g. "corporate-gifting") in Shopify -- confirmed against the live
 * catalogue, where several real Corporate Gifting and Computer Peripherals
 * products carry only a subcategory handle. Matching against this full set
 * (not just the parent handle) is required to avoid under-including
 * legitimate products.
 */
export function getCategoryHandles(category: MainCategory): string[] {
  const node = TAXONOMY[category];
  const handles = [node.handle, ...Object.values(node.subcategories).map((s) => s.handle)];
  return handles.filter((h): h is string => Boolean(h));
}

/**
 * Shopify collection membership as the SOURCE OF TRUTH for "does this
 * product belong to `category`" -- true when any of the product's real
 * Shopify collection handles falls within that category's collection tree
 * (main collection or any of its subcategory collections).
 *
 * Deliberately does NOT consult keyword/title/description classification --
 * see `classify()` in shopify-overlay.ts, which is known to cross-contaminate
 * categories (e.g. "Ink Bottle" matching a "bottle" keyword rule) and must
 * not be used to decide recommendation eligibility.
 */
export function productBelongsToCategory(
  collectionHandles: string[] | undefined,
  category: MainCategory,
): boolean {
  if (!collectionHandles || collectionHandles.length === 0) return false;
  const categoryHandles = getCategoryHandles(category);
  return collectionHandles.some((h) => categoryHandles.includes(h));
}

/**
 * The most specific known subcategory label for a product within `category`,
 * derived from its real Shopify collection handles (prefers a subcategory
 * match over the bare main-category handle). Falls back to the category
 * title itself when only the main collection handle matched.
 *
 * Used for display only (e.g. the recommendation card's category badge) --
 * never for eligibility decisions.
 */
export function getDisplayCategoryLabel(
  collectionHandles: string[] | undefined,
  category: MainCategory,
): string {
  const node = TAXONOMY[category];
  for (const handle of collectionHandles ?? []) {
    for (const sub of Object.values(node.subcategories)) {
      if (sub.handle === handle) return sub.title;
    }
  }
  return node.title;
}
