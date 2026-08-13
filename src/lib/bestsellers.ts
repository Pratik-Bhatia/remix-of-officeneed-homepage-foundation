export type BestsellerCategory =
  | "Corporate Gifting"
  | "Office Stationery"
  | "Hardware Supplies"
  | "Fragrance & Luxury Gifting";

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
  "Fragrance & Luxury Gifting",
];

const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=75`;

export const bestsellerProducts: BestsellerProduct[] = [
  {
    id: "bs-signature-hamper",
    name: "Signature Executive Gift Hamper",
    category: "Corporate Gifting",
    collection: "Corporate Gifting",
    image: img("photo-1549465220-1a8b9238cd48"),
    price: "₹4,999",
    bestseller: true,
    shopifyHandle: "signature-executive-gift-hamper",
    productUrl: "/products/signature-executive-gift-hamper",
  },
  {
    id: "bs-insulated-bottle",
    name: "Matte Insulated Steel Bottle",
    category: "Corporate Gifting",
    collection: "Drinkware",
    image: img("photo-1602143407151-7111542de6e8"),
    price: "₹1,299",
    bestseller: true,
    shopifyHandle: "matte-insulated-steel-bottle",
    productUrl: "/products/matte-insulated-steel-bottle",
  },
  {
    id: "bs-leather-organiser",
    name: "Leather Document Organiser",
    category: "Corporate Gifting",
    collection: "Premium Gifts",
    image: img("photo-1517842645767-c639042777db"),
    price: "₹3,450",
    bestseller: false,
    shopifyHandle: "leather-document-organiser",
    productUrl: "/products/leather-document-organiser",
  },
  {
    id: "bs-hardbound-notebook",
    name: "Hardbound Executive Notebook",
    category: "Office Stationery",
    collection: "Notebooks",
    image: img("photo-1531346878377-a5be20888e57"),
    price: "₹899",
    bestseller: true,
    shopifyHandle: "hardbound-executive-notebook",
    productUrl: "/products/hardbound-executive-notebook",
  },
  {
    id: "bs-rollerball-pen",
    name: "Brushed Metal Rollerball Pen",
    category: "Office Stationery",
    collection: "Writing Instruments",
    image: img("photo-1583485088034-697b5bc54ccd"),
    price: "₹1,150",
    bestseller: true,
    shopifyHandle: "brushed-metal-rollerball-pen",
    productUrl: "/products/brushed-metal-rollerball-pen",
  },
  {
    id: "bs-desk-set",
    name: "Minimal Desk Accessory Set",
    category: "Office Stationery",
    collection: "Desk Accessories",
    image: img("photo-1524578271613-d550eacf6090"),
    price: "₹2,250",
    bestseller: false,
    shopifyHandle: "minimal-desk-accessory-set",
    productUrl: "/products/minimal-desk-accessory-set",
  },
  {
    id: "bs-wireless-mouse",
    name: "Silent Wireless Mouse",
    category: "Hardware Supplies",
    collection: "Peripherals",
    image: img("photo-1527864550417-7fd91fc51a46"),
    price: "₹1,799",
    bestseller: true,
    shopifyHandle: "silent-wireless-mouse",
    productUrl: "/products/silent-wireless-mouse",
  },
  {
    id: "bs-mech-keyboard",
    name: "Low-Profile Wireless Keyboard",
    category: "Hardware Supplies",
    collection: "Keyboards",
    image: img("photo-1587829741301-dc798b83add3"),
    price: "₹4,299",
    bestseller: false,
    shopifyHandle: "low-profile-wireless-keyboard",
    productUrl: "/products/low-profile-wireless-keyboard",
  },
  {
    id: "bs-desk-printer",
    name: "Compact Workgroup Printer",
    category: "Hardware Supplies",
    collection: "Printers",
    image: img("photo-1612815154858-60aa4c59eaa6"),
    price: "₹12,499",
    bestseller: true,
    shopifyHandle: "compact-workgroup-printer",
    productUrl: "/products/compact-workgroup-printer",
  },
  {
    id: "bs-eastern-perfume",
    name: "Eastern Oud Perfume 100ml",
    category: "Fragrance & Luxury Gifting",
    collection: "Eastern Perfumes",
    image: img("photo-1541643600914-78b084683601"),
    price: "₹6,750",
    bestseller: true,
    shopifyHandle: "eastern-oud-perfume-100ml",
    productUrl: "/products/eastern-oud-perfume-100ml",
  },
  {
    id: "bs-western-perfume",
    name: "Western Signature Eau de Parfum",
    category: "Fragrance & Luxury Gifting",
    collection: "Western Perfumes",
    image: img("photo-1594035910387-fea47794261f"),
    price: "₹5,499",
    bestseller: false,
    shopifyHandle: "western-signature-eau-de-parfum",
    productUrl: "/products/western-signature-eau-de-parfum",
  },
  {
    id: "bs-luxury-set",
    name: "Luxury Fragrance Gift Set",
    category: "Fragrance & Luxury Gifting",
    collection: "Luxury Gifting",
    image: img("photo-1615634260167-c8cdede054de"),
    price: "₹8,900",
    bestseller: true,
    shopifyHandle: "luxury-fragrance-gift-set",
    productUrl: "/products/luxury-fragrance-gift-set",
  },
];
