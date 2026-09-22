/**
 * Centralised content for the interactive "Shop the Look" corporate gift showcase.
 *
 * PLACEHOLDER DATA — every product maps 1:1 to a future Shopify product.
 * When Shopify is connected, resolve `price`, `availability`, `image` and `href`
 * from `shopifyProductHandle` / `productId`. Only this file needs to change.
 *
 * Each hamper owns its OWN product list and its OWN hotspot coordinates
 * (percentages of that hamper's image: x = left, y = top).
 */

import hamperSignature from "@/assets/hamper-signature-6in1-set.webp";
import hamperOnboarding from "@/assets/hamper-executive-onboarding.jpg";
import hamperFestive from "@/assets/hamper-festive-luxury.jpg";
import hamperTech from "@/assets/hamper-tech-desk.jpg";

export type GiftShowcaseProduct = {
  /** Stable key + future Shopify product id */
  productId: string;
  /** Future Shopify product handle used to build the product page URL */
  shopifyProductHandle: string;
  productName: string;
  /** Optional merchandising category */
  category?: string;
  description: string;
  /** Placeholder price string until Shopify pricing is connected */
  price: string;
  availability: string;
  /** Thumbnail shown inside the product card */
  image: string;
  /** Product page link — swap for the Shopify product route once available */
  href: string;
  /** Hotspot position as a percentage of this hamper's image */
  position: { x: number; y: number };
};

export type GiftHamper = {
  id: string;
  title: string;
  description: string;
  /** Hamper hero image */
  image: string;
  imageAlt: string;
  /** Image's real pixel dimensions -- drives the showcase's aspect-ratio
   * wrapper so the full (uncropped) image is shown and hotspot percentages
   * stay anchored to the actual image content, not a mismatched container. */
  imageWidth: number;
  imageHeight: number;
  /** Future Shopify collection handle for the whole hamper */
  shopifyCollectionHandle: string;
  href: string;
  products: GiftShowcaseProduct[];
};

const THUMB = {
  notebook:
    "https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=240&q=70",
  pen: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=240&q=70",
  bottle:
    "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=240&q=70",
  fragrance:
    "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=240&q=70",
  candle:
    "https://images.unsplash.com/photo-1602874801006-e26c4c5b5e8a?auto=format&fit=crop&w=240&q=70",
  earbuds:
    "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=240&q=70",
  chocolate:
    "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=240&q=70",
  tea: "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=240&q=70",
  nuts: "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=240&q=70",
  diya: "https://images.unsplash.com/photo-1604608672516-f1b9b1a0a1b0?auto=format&fit=crop&w=240&q=70",
  powerbank:
    "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=240&q=70",
  charger:
    "https://images.unsplash.com/photo-1591290619762-c588f2b25c11?auto=format&fit=crop&w=240&q=70",
  headphones:
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=240&q=70",
  cable:
    "https://images.unsplash.com/photo-1588token?auto=format&fit=crop&w=240&q=70",
  keyboard:
    "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=240&q=70",
  passport:
    "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=240&q=70",
};

const PRICE = "Price on request";

export const giftHampers: GiftHamper[] = [
  {
    id: "signature-classic",
    title: "The Signature Hamper",
    description: "Our best-selling everyday corporate gift set.",
    image: hamperSignature,
    imageAlt:
      "OfficeNeed 6-in-1 executive gift set: an open terracotta gift box containing a keychain, pen, leather card holder, pendrive and an insulated bottle, beside a tan leather diary and the individual gift items laid out in front of the box.",
    imageWidth: 1536,
    imageHeight: 1024,
    shopifyCollectionHandle: "signature-hamper",
    href: "/products?category=Corporate+Gifting",
    // Every entry below is an UNMAPPED placeholder, deliberately: this hamper
    // image was just swapped to a real photo of the 6-in-1 set's individual
    // components, and the caller asked for the hotspot structure/positioning
    // now, with the actual Shopify product-per-item mapping to follow
    // separately. shopifyProductHandle uses an obviously-fake "pending-
    // mapping-*" value (not a realistic-looking guessed handle) so it can
    // never coincidentally match a real catalogue product via
    // resolveHamperProduct/useShopifyCatalogue and silently show wrong data
    // -- it will only start resolving once each handle is swapped for the
    // real one. price/availability/href/image are likewise left as honest
    // "not yet known" placeholders rather than invented specifics.
    products: [
      {
        // Outside the box, laid out separately toward the lower-left of the
        // full image.
        productId: "signature-6in1-keychain",
        shopifyProductHandle: "pending-mapping-signature-keychain",
        productName: "Keychain",
        category: "Accessories",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 12, y: 79 },
      },
      {
        // Inside the box, lower-center of the tray (a silver key-shaped USB).
        productId: "signature-6in1-pendrive",
        shopifyProductHandle: "pending-mapping-signature-pendrive",
        productName: "Pendrive",
        category: "Hardware",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 37, y: 57 },
      },
      {
        // Inside the box, center of the tray (brown rectangular card holder).
        productId: "signature-6in1-card-holder",
        shopifyProductHandle: "pending-mapping-signature-card-holder",
        productName: "Card Holder",
        category: "Leather Goods",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 40, y: 39 },
      },
      {
        // Inside the box, left side of the tray (black-and-silver pen).
        productId: "signature-6in1-pen",
        shopifyProductHandle: "pending-mapping-signature-pen",
        productName: "Pen",
        category: "Stationery",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 25, y: 42 },
      },
      {
        // Inside the box, right side of the tray (large brown bottle).
        productId: "signature-6in1-bottle",
        shopifyProductHandle: "pending-mapping-signature-bottle",
        productName: "Bottle",
        category: "Drinkware",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 59, y: 35 },
      },
      {
        // Only appears once (the standing notebook to the right of the box),
        // so its hotspot goes there rather than inside the box.
        productId: "signature-6in1-diary",
        shopifyProductHandle: "pending-mapping-signature-diary",
        productName: "Diary",
        category: "Stationery",
        description: "Individual item from the 6-in-1 set — Shopify product mapping pending.",
        price: PRICE,
        availability: "Availability pending",
        image: hamperSignature,
        href: "/products?category=Corporate+Gifting",
        position: { x: 83, y: 50 },
      },
    ],
  },
  {
    id: "executive-onboarding",
    title: "Executive Onboarding Kit",
    description: "A refined welcome set for new joiners and leadership hires.",
    image: hamperOnboarding,
    imageAlt:
      "Executive onboarding gift kit: an ivory gift box with a black notebook, gold-trim pen and dark chocolate bar, beside a scented candle, leather passport holder, matte black bottle and wireless earbuds.",
    imageWidth: 1600,
    imageHeight: 1200,
    shopifyCollectionHandle: "executive-onboarding-kit",
    href: "/products?category=Corporate+Gifting",
    products: [
      {
        productId: "placeholder-onboarding-candle",
        shopifyProductHandle: "calm-scented-candle",
        productName: "Calm Scented Candle",
        category: "Home & Ambience",
        description: "Soy wax candle in a clear glass jar with a custom label.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.candle,
        href: "/products?category=Corporate+Gifting",
        position: { x: 14, y: 25 },
      },
      {
        productId: "placeholder-onboarding-notebook",
        shopifyProductHandle: "black-leather-journal",
        productName: "Black Leather Journal",
        category: "Stationery",
        description: "Foil-stamped A5 journal with elastic closure.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.notebook,
        href: "/products?category=Corporate+Gifting",
        position: { x: 39, y: 55 },
      },
      {
        productId: "placeholder-onboarding-pen",
        shopifyProductHandle: "gold-trim-ballpoint-pen",
        productName: "Gold Trim Ballpoint Pen",
        category: "Stationery",
        description: "Matte black barrel with polished gold accents.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.pen,
        href: "/products?category=Corporate+Gifting",
        position: { x: 52, y: 50 },
      },
      {
        productId: "placeholder-onboarding-chocolate",
        shopifyProductHandle: "single-origin-dark-chocolate",
        productName: "Single Origin Dark Chocolate",
        category: "Gourmet",
        description: "70% dark chocolate bar in a gold-foiled sleeve.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.chocolate,
        href: "/products?category=Corporate+Gifting",
        position: { x: 63, y: 48 },
      },
      {
        productId: "placeholder-onboarding-passport",
        shopifyProductHandle: "leather-passport-holder",
        productName: "Leather Passport Holder",
        category: "Leather Goods",
        description: "Debossed passport cover with optional initials.",
        price: PRICE,
        availability: "Made to order",
        image: THUMB.passport,
        href: "/products?category=Corporate+Gifting",
        position: { x: 19, y: 78 },
      },
      {
        productId: "placeholder-onboarding-bottle",
        shopifyProductHandle: "matte-black-insulated-bottle",
        productName: "Matte Black Insulated Bottle",
        category: "Drinkware",
        description: "Stainless steel bottle with a soft matte coating.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.bottle,
        href: "/products?category=Corporate+Gifting",
        position: { x: 83, y: 32 },
      },
      {
        productId: "placeholder-onboarding-earbuds",
        shopifyProductHandle: "wireless-earbuds",
        productName: "Wireless Earbuds",
        category: "Hardware",
        description: "Compact true-wireless earbuds with charging case.",
        price: PRICE,
        availability: "Limited stock",
        image: THUMB.earbuds,
        href: "/products?category=Corporate+Gifting",
        position: { x: 70, y: 89 },
      },
    ],
  },
  {
    id: "festive-luxury",
    title: "Festive Luxury Hamper",
    description: "A celebratory hamper for Diwali, New Year and client milestones.",
    image: hamperFestive,
    imageAlt:
      "Festive luxury gift hamper: a woven tray with green tea canister, sandalwood candle and diffuser, beside a crystal perfume flacon, brass lotus tea light holder, assorted chocolates and a satin pouch of dry fruits.",
    imageWidth: 1600,
    imageHeight: 1200,
    shopifyCollectionHandle: "festive-luxury-hamper",
    href: "/products?category=Corporate+Gifting",
    products: [
      {
        productId: "placeholder-festive-perfume",
        shopifyProductHandle: "raffine-eau-de-parfum",
        productName: "Raffiné Eau de Parfum",
        category: "Fragrance",
        description: "Crystal-cut flacon with a warm amber-oud accord.",
        price: PRICE,
        availability: "Limited stock",
        image: THUMB.fragrance,
        href: "/products?category=Corporate+Gifting",
        position: { x: 14, y: 33 },
      },
      {
        productId: "placeholder-festive-tea",
        shopifyProductHandle: "sencha-green-tea-canister",
        productName: "Sencha Green Tea Canister",
        category: "Gourmet",
        description: "Loose-leaf sencha in a gold-lidded keepsake tin.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.tea,
        href: "/products?category=Corporate+Gifting",
        position: { x: 39, y: 44 },
      },
      {
        productId: "placeholder-festive-candle",
        shopifyProductHandle: "sandalwood-luxe-candle",
        productName: "Sandalwood Luxe Candle",
        category: "Home & Ambience",
        description: "Hand-poured sandalwood candle with a brass lid.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.candle,
        href: "/products?category=Corporate+Gifting",
        position: { x: 58, y: 46 },
      },
      {
        productId: "placeholder-festive-diffuser",
        shopifyProductHandle: "cedar-vanilla-diffuser",
        productName: "Cedar & Vanilla Diffuser",
        category: "Home & Ambience",
        description: "50ml reed diffuser in a matte black carton.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.candle,
        href: "/products?category=Corporate+Gifting",
        position: { x: 56, y: 67 },
      },
      {
        productId: "placeholder-festive-diya",
        shopifyProductHandle: "brass-lotus-tea-light",
        productName: "Brass Lotus Tea Light Holder",
        category: "Festive Decor",
        description: "Hand-finished brass lotus diya for festive gifting.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.diya,
        href: "/products?category=Corporate+Gifting",
        position: { x: 12, y: 75 },
      },
      {
        productId: "placeholder-festive-chocolates",
        shopifyProductHandle: "assorted-praline-box",
        productName: "Assorted Praline Box",
        category: "Gourmet",
        description: "Twelve-piece praline selection in a gold gift box.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.chocolate,
        href: "/products?category=Corporate+Gifting",
        position: { x: 86, y: 20 },
      },
      {
        productId: "placeholder-festive-dryfruits",
        shopifyProductHandle: "satin-pouch-dry-fruits",
        productName: "Satin Pouch Dry Fruits",
        category: "Gourmet",
        description: "Premium almonds and cashews in an embroidered pouch.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.nuts,
        href: "/products?category=Corporate+Gifting",
        position: { x: 85, y: 72 },
      },
    ],
  },
  {
    id: "tech-desk",
    title: "Tech & Desk Essentials",
    description: "A modern hardware set for hybrid teams and power users.",
    image: hamperTech,
    imageAlt:
      "Tech and desk essentials gift set: a matte black power bank, wireless charging pad, over-ear headphones, braided USB-C cable and a mechanical keyboard on a warm off-white surface.",
    imageWidth: 1600,
    imageHeight: 1200,
    shopifyCollectionHandle: "tech-desk-essentials",
    href: "/products?category=Corporate+Gifting",
    products: [
      {
        productId: "placeholder-tech-powerbank",
        shopifyProductHandle: "20w-slim-power-bank",
        productName: "20W Slim Power Bank",
        category: "Hardware",
        description: "10,000mAh fast-charge bank with dual USB-C ports.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.powerbank,
        href: "/products?category=Corporate+Gifting",
        position: { x: 19, y: 29 },
      },
      {
        productId: "placeholder-tech-charger",
        shopifyProductHandle: "wireless-charging-pad",
        productName: "Wireless Charging Pad",
        category: "Hardware",
        description: "Fabric-topped Qi pad with brandable surface.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.charger,
        href: "/products?category=Corporate+Gifting",
        position: { x: 44, y: 53 },
      },
      {
        productId: "placeholder-tech-headphones",
        shopifyProductHandle: "anc-over-ear-headphones",
        productName: "ANC Over-Ear Headphones",
        category: "Hardware",
        description: "Active noise cancelling headphones for focus work.",
        price: PRICE,
        availability: "Limited stock",
        image: THUMB.headphones,
        href: "/products?category=Corporate+Gifting",
        position: { x: 76, y: 26 },
      },
      {
        productId: "placeholder-tech-cable",
        shopifyProductHandle: "braided-usb-c-cable",
        productName: "Braided USB-C Cable",
        category: "Hardware",
        description: "Tangle-free braided cable with a leather strap.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.cable,
        href: "/products?category=Corporate+Gifting",
        position: { x: 22, y: 77 },
      },
      {
        productId: "placeholder-tech-keyboard",
        shopifyProductHandle: "compact-mechanical-keyboard",
        productName: "Compact Mechanical Keyboard",
        category: "Hardware",
        description: "Tenkeyless mechanical keyboard with quiet switches.",
        price: PRICE,
        availability: "Made to order",
        image: THUMB.keyboard,
        href: "/products?category=Corporate+Gifting",
        position: { x: 82, y: 82 },
      },
    ],
  },
];

/** Backwards-compatible export: products of the signature hamper. */
export const giftShowcaseProducts: GiftShowcaseProduct[] = giftHampers[0]?.products ?? [];
