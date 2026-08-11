/**
 * Centralised content for the interactive corporate gift showcase.
 *
 * PLACEHOLDER DATA — every entry maps 1:1 to a future Shopify product.
 * When Shopify is connected, replace `price`, `availability`, `image` and
 * `href` with live values resolved from `shopifyProductHandle` / `productId`.
 * Only this file needs to change; the presentation components read from it.
 */

export type GiftShowcaseProduct = {
  /** Stable key + future Shopify product id */
  productId: string;
  /** Future Shopify product handle used to build the product page URL */
  shopifyProductHandle: string;
  productName: string;
  description: string;
  /** Placeholder price string until Shopify pricing is connected */
  price: string;
  availability: string;
  /** Thumbnail shown inside the product card */
  image: string;
  /** Product page link — swap for the Shopify product route once available */
  href: string;
  /** Hotspot position as a percentage of the composition (x = left, y = top) */
  position: { x: number; y: number };
};

export const giftShowcaseProducts: GiftShowcaseProduct[] = [
  {
    productId: "placeholder-notebook",
    shopifyProductHandle: "executive-premium-notebook",
    productName: "Executive Premium Notebook",
    description: "Hardbound corporate notebook with premium soft-touch finish.",
    price: "Price on request",
    availability: "In stock",
    image:
      "https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 16, y: 52 },
  },
  {
    productId: "placeholder-pen",
    shopifyProductHandle: "brushed-metal-signature-pen",
    productName: "Brushed Metal Signature Pen",
    description: "Weighted metal ballpoint, laser-engravable for brand marking.",
    price: "Price on request",
    availability: "In stock",
    image:
      "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 23, y: 71 },
  },
  {
    productId: "placeholder-wallet",
    shopifyProductHandle: "leather-card-holder-wallet",
    productName: "Leather Card Holder Wallet",
    description: "Full-grain leather bifold with debossed logo option.",
    price: "Price on request",
    availability: "Made to order",
    image:
      "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 26, y: 86 },
  },
  {
    productId: "placeholder-bottle",
    shopifyProductHandle: "insulated-steel-bottle",
    productName: "Insulated Steel Bottle",
    description: "Double-walled matte tumbler, 24-hour temperature retention.",
    price: "Price on request",
    availability: "In stock",
    image:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 78, y: 38 },
  },
  {
    productId: "placeholder-fragrance",
    shopifyProductHandle: "signature-eau-de-parfum",
    productName: "Signature Eau de Parfum",
    description: "Eastern-western blend in a faceted glass flacon.",
    price: "Price on request",
    availability: "Limited stock",
    image:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 88, y: 56 },
  },
  {
    productId: "placeholder-mouse",
    shopifyProductHandle: "wireless-precision-mouse",
    productName: "Wireless Precision Mouse",
    description: "Silent-click wireless mouse for executive desk setups.",
    price: "Price on request",
    availability: "In stock",
    image:
      "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=240&q=70",
    href: "#corporate-gifting",
    position: { x: 74, y: 84 },
  },
];
