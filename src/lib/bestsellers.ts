export type BestsellerCategory =
  | "Corporate Gifting"
  | "Office Stationery"
  | "Hardware Supplies"
  | "Fragrance Gifting";

export type BestsellerProduct = {
  id: string;
  name: string;
  category: BestsellerCategory;
  /** Small uppercase label shown above the product name. */
  collection: string;
  image: string;
  price: string;
  bestseller: boolean;
  /** Placeholder — swap for the real Shopify product handle/URL. */
  shopifyHandle: string;
  productUrl: string;
};

export const bestsellerFilters: Array<"All" | BestsellerCategory> = [
  "All",
  "Corporate Gifting",
  "Office Stationery",
  "Hardware Supplies",
  "Fragrance Gifting",
];

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=75`;

export const bestsellerProducts: BestsellerProduct[] = [];

