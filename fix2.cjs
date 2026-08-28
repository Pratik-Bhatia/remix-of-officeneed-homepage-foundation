const fs = require("fs");
let content = fs.readFileSync("src/lib/shopify.ts", "utf8");

content = content.replace(/export interface ShopifyProductNode \{[\s\S]*?export interface ShopifyProduct/, `export interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  handle: string;
  productType: string;
  vendor: string;
  tags?: string[];
  availableForSale?: boolean;
  totalInventory?: number | null;
  featuredImage?: ShopifyImage | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  images: { edges: Array<{ node: ShopifyImage }> };
  variants: { edges: Array<{ node: ShopifyVariantNode }> };
  options: Array<{ name: string; values: string[] }>;
  collections?: { edges: Array<{ node: { handle: string } }> };
}

export interface ShopifyProduct`);

fs.writeFileSync("src/lib/shopify.ts", content);
