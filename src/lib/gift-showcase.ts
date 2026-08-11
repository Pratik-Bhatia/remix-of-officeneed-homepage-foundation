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

import hamperSignature from "@/assets/hamper-signature-classic.jpg";
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
  /** Hamper hero image (4:3) */
  image: string;
  imageAlt: string;
  /** Future Shopify collection handle for the whole hamper */
  shopifyCollectionHandle: string;
  href: string;
  products: GiftShowcaseProduct[];
};

const THUMB = {
  notebook:
    "https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=240&q=70",
  pen: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=240&q=70",
  wallet:
    "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=240&q=70",
  bottle:
    "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=240&q=70",
  fragrance:
    "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=240&q=70",
  mouse:
    "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=240&q=70",
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
      "OfficeNeed signature corporate gift hamper: an ivory gift box with black ribbon surrounded by a notebook, metal pen, leather card holder, insulated bottle, fragrance and a wireless mouse.",
    shopifyCollectionHandle: "signature-hamper",
    href: "#corporate-gifting",
    products: [
      {
        productId: "placeholder-notebook",
        shopifyProductHandle: "executive-premium-notebook",
        productName: "Executive Premium Notebook",
        category: "Stationery",
        description: "Hardbound corporate notebook with premium soft-touch finish.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.notebook,
        href: "#corporate-gifting",
        position: { x: 13, y: 52 },
      },
      {
        productId: "placeholder-pen",
        shopifyProductHandle: "brushed-metal-signature-pen",
        productName: "Brushed Metal Signature Pen",
        category: "Stationery",
        description: "Weighted metal ballpoint, laser-engravable for brand marking.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.pen,
        href: "#corporate-gifting",
        position: { x: 21, y: 71 },
      },
      {
        productId: "placeholder-wallet",
        shopifyProductHandle: "leather-card-holder-wallet",
        productName: "Leather Card Holder Wallet",
        category: "Leather Goods",
        description: "Full-grain leather bifold with debossed logo option.",
        price: PRICE,
        availability: "Made to order",
        image: THUMB.wallet,
        href: "#corporate-gifting",
        position: { x: 24, y: 86 },
      },
      {
        productId: "placeholder-bottle",
        shopifyProductHandle: "insulated-steel-bottle",
        productName: "Insulated Steel Bottle",
        category: "Drinkware",
        description: "Double-walled matte tumbler, 24-hour temperature retention.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.bottle,
        href: "#corporate-gifting",
        position: { x: 80, y: 38 },
      },
      {
        productId: "placeholder-fragrance",
        shopifyProductHandle: "signature-eau-de-parfum",
        productName: "Signature Eau de Parfum",
        category: "Fragrance",
        description: "Eastern-western blend in a faceted glass flacon.",
        price: PRICE,
        availability: "Limited stock",
        image: THUMB.fragrance,
        href: "#corporate-gifting",
        position: { x: 91, y: 56 },
      },
      {
        productId: "placeholder-mouse",
        shopifyProductHandle: "wireless-precision-mouse",
        productName: "Wireless Precision Mouse",
        category: "Hardware",
        description: "Silent-click wireless mouse for executive desk setups.",
        price: PRICE,
        availability: "In stock",
        image: THUMB.mouse,
        href: "#corporate-gifting",
        position: { x: 76, y: 84 },
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
    shopifyCollectionHandle: "executive-onboarding-kit",
    href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
    shopifyCollectionHandle: "festive-luxury-hamper",
    href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
    shopifyCollectionHandle: "tech-desk-essentials",
    href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
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
        href: "#corporate-gifting",
        position: { x: 82, y: 82 },
      },
    ],
  },
];

/** Backwards-compatible export: products of the signature hamper. */
export const giftShowcaseProducts: GiftShowcaseProduct[] = giftHampers[0].products;
