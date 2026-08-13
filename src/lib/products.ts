/**
 * Typed product catalogue for the OfficeNeed product listing + detail pages.
 *
 * PLACEHOLDER DATA — this is a thin, replaceable data layer. When a real
 * commerce/CMS backend is connected, swap the `products` export for an API
 * call returning the same `Product` shape; no component changes required.
 */

export type ProductCategory =
  | "Corporate Gifting"
  | "Office Supplies"
  | "Hardware & IT"
  | "Printing & Branding"
  | "Fragrance & Luxury Gifting";

export type Product = {
  /** URL slug used by /products/$slug */
  slug: string;
  name: string;
  category: ProductCategory;
  /** Short one-line description used on cards and meta descriptions */
  summary: string;
  /** Longer description shown on the detail page */
  description: string;
  /** Display price string, e.g. "₹1,299" — omitted when quote-only */
  price?: string;
  /** True when `price` is a starting/from price */
  startingPrice?: boolean;
  sku?: string;
  availability?: string;
  /** First image is the primary image */
  images: string[];
  badge?: "New" | "Featured";
  /** Sort weight for "Featured" ordering — lower shows first */
  featuredRank?: number;
  /** Newest-first ordering key (ISO date) */
  addedOn: string;
  supportsQuantity?: boolean;
  minimumOrderQuantity?: number;
  specifications?: Array<{ label: string; value: string }>;
  features?: string[];
  variants?: string[];
  packaging?: string;
  customization?: string;
};

/** Category tabs for the listing page. Mirrors the site catalogue naming. */
export const productCategories: Array<"All Products" | ProductCategory> = [
  "All Products",
  "Corporate Gifting",
  "Office Supplies",
  "Hardware & IT",
  "Printing & Branding",
  "Fragrance & Luxury Gifting",
];

export const productSortOptions = [
  "Featured",
  "Newest",
  "Price: Low to High",
  "Price: High to Low",
  "Name: A–Z",
] as const;

export type ProductSort = (typeof productSortOptions)[number];

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

export const products: Product[] = [
  {
    slug: "signature-executive-gift-hamper",
    name: "Signature Executive Gift Hamper",
    category: "Corporate Gifting",
    summary: "A curated leadership hamper assembled and branded to your specification.",
    description:
      "A considered gifting programme in a single box: notebook, pen, drinkware and a fragrance accent, presented in rigid packaging. Contents can be adjusted per recipient tier, and the full hamper can be branded with your identity.",
    price: "₹4,999",
    startingPrice: true,
    sku: "ON-CG-1001",
    availability: "In stock — 5–7 working days",
    images: [
      img("photo-1513201099705-a9746e1e201f"),
      img("photo-1607083206968-13611e3d76db"),
      img("photo-1544816155-12df9643f363"),
    ],
    badge: "Featured",
    featuredRank: 1,
    addedOn: "2026-06-02",
    supportsQuantity: true,
    minimumOrderQuantity: 25,
    specifications: [
      { label: "Contents", value: "5 items" },
      { label: "Box material", value: "Rigid board, matte laminate" },
      { label: "Box size", value: "340 × 260 × 90 mm" },
    ],
    features: [
      "Tier-based contents for leadership, teams and clients",
      "Branded sleeve and insert card included",
      "Bulk despatch to multiple addresses",
    ],
    variants: ["Classic", "Executive", "Festive"],
    packaging: "Rigid gift box with foam insert and printed sleeve.",
    customization: "Logo foiling, personalised insert card and custom contents on request.",
  },
  {
    slug: "matte-insulated-steel-bottle",
    name: "Matte Insulated Steel Bottle",
    category: "Corporate Gifting",
    summary: "Double-walled 750ml bottle with a soft matte finish for everyday use.",
    description:
      "A durable, everyday-carry bottle in double-walled stainless steel. Holds temperature for up to 12 hours and takes laser engraving cleanly, making it a reliable choice for large-volume team gifting.",
    price: "₹1,299",
    sku: "ON-CG-1042",
    availability: "In stock",
    images: [img("photo-1602143407151-7111542de6e8"), img("photo-1523362628745-0c100150b504")],
    featuredRank: 6,
    addedOn: "2026-04-18",
    supportsQuantity: true,
    minimumOrderQuantity: 50,
    specifications: [
      { label: "Capacity", value: "750 ml" },
      { label: "Material", value: "304 stainless steel" },
      { label: "Insulation", value: "12 hours hot / 24 hours cold" },
    ],
    features: ["Leak-proof lid", "Powder-coated matte body", "Laser engraving friendly"],
    variants: ["Matte Black", "Ivory", "Graphite"],
    customization: "Laser engraving or single-colour print.",
  },
  {
    slug: "leather-document-organiser",
    name: "Leather Document Organiser",
    category: "Corporate Gifting",
    summary: "A4 organiser in full-grain leather with notepad and card slots.",
    description:
      "A quietly premium organiser for meetings and onboarding kits. Full-grain leather exterior, card and pen slots inside, and a replaceable A4 ruled pad.",
    price: "₹3,450",
    sku: "ON-CG-1078",
    availability: "In stock",
    images: [img("photo-1517842645767-c639042777db"), img("photo-1531346878377-a5be20888e57")],
    featuredRank: 9,
    addedOn: "2026-03-09",
    supportsQuantity: true,
    minimumOrderQuantity: 20,
    specifications: [
      { label: "Size", value: "A4" },
      { label: "Material", value: "Full-grain leather" },
    ],
    features: ["Replaceable ruled pad", "Card and pen slots"],
    variants: ["Black", "Tan"],
    customization: "Blind deboss or gold foil logo.",
  },
  {
    slug: "hardbound-executive-notebook",
    name: "Hardbound Executive Notebook",
    category: "Office Supplies",
    summary: "A5 hardbound notebook on 100gsm ivory paper with an elastic closure.",
    description:
      "A dependable daily notebook: hardbound spine that opens flat, 100gsm ivory paper that resists bleed-through, ribbon marker and elastic closure.",
    price: "₹899",
    sku: "ON-OS-2011",
    availability: "In stock",
    images: [img("photo-1531346878377-a5be20888e57"), img("photo-1544716278-ca5e3f4abd8c")],
    badge: "Featured",
    featuredRank: 3,
    addedOn: "2026-05-22",
    supportsQuantity: true,
    minimumOrderQuantity: 50,
    specifications: [
      { label: "Size", value: "A5 (148 × 210 mm)" },
      { label: "Pages", value: "192 ruled" },
      { label: "Paper", value: "100 gsm ivory" },
    ],
    features: ["Lies flat when open", "Ribbon marker", "Elastic closure"],
    variants: ["Ruled", "Dotted", "Plain"],
    customization: "Cover deboss and printed first page.",
  },
  {
    slug: "brushed-metal-rollerball-pen",
    name: "Brushed Metal Rollerball Pen",
    category: "Office Supplies",
    summary: "Weighted brass-body rollerball with a smooth 0.7mm German refill.",
    description:
      "A balanced, weighted rollerball with a brushed metal body and a smooth German-made refill. A practical desk gift that survives daily use.",
    price: "₹1,150",
    sku: "ON-OS-2043",
    availability: "In stock",
    images: [img("photo-1583485088034-697b5bc54ccd")],
    featuredRank: 7,
    addedOn: "2026-05-02",
    supportsQuantity: true,
    minimumOrderQuantity: 50,
    specifications: [
      { label: "Nib", value: "0.7 mm rollerball" },
      { label: "Body", value: "Brushed brass" },
    ],
    features: ["Refillable", "Weighted balance"],
    variants: ["Silver", "Matte Black"],
    customization: "Laser engraving on barrel.",
  },
  {
    slug: "minimal-desk-accessory-set",
    name: "Minimal Desk Accessory Set",
    category: "Office Supplies",
    summary: "Five-piece desk set in powder-coated steel and oak.",
    description:
      "A coordinated desk set — tray, pen cup, card stand, clip holder and coaster — in powder-coated steel with oak accents. Suited to executive desks and workspace refresh programmes.",
    price: "₹2,250",
    sku: "ON-OS-2090",
    availability: "Made to order — 10–14 working days",
    images: [img("photo-1524578271613-d550eacf6090"), img("photo-1497366754035-f200968a6e72")],
    featuredRank: 11,
    addedOn: "2026-02-14",
    supportsQuantity: true,
    minimumOrderQuantity: 10,
    specifications: [
      { label: "Pieces", value: "5" },
      { label: "Material", value: "Powder-coated steel, oak" },
    ],
    features: ["Coordinated finish across pieces", "Felt-lined base"],
    packaging: "Kraft gift box with moulded insert.",
  },
  {
    slug: "a4-multipurpose-paper-carton",
    name: "A4 Multipurpose Paper — Carton",
    category: "Office Supplies",
    summary: "75gsm A4 copier paper, 5 reams per carton, on scheduled replenishment.",
    description:
      "High-brightness 75gsm A4 paper suitable for copiers, laser and inkjet printers. Supplied by the carton and available on a scheduled replenishment contract.",
    price: "₹1,180",
    startingPrice: true,
    sku: "ON-OS-2100",
    availability: "In stock",
    images: [img("photo-1568667256549-094345857637")],
    featuredRank: 14,
    addedOn: "2026-01-20",
    supportsQuantity: true,
    minimumOrderQuantity: 5,
    specifications: [
      { label: "GSM", value: "75" },
      { label: "Sheets", value: "500 per ream, 5 reams per carton" },
    ],
    features: ["High brightness", "Jam-resistant cut"],
  },
  {
    slug: "silent-wireless-mouse",
    name: "Silent Wireless Mouse",
    category: "Hardware & IT",
    summary: "Quiet-click 2.4GHz mouse with adjustable DPI and long battery life.",
    description:
      "A quiet-click wireless mouse designed for shared workspaces. Adjustable DPI, 2.4GHz USB receiver and up to 12 months of battery life on a single AA cell.",
    price: "₹1,799",
    sku: "ON-IT-3012",
    availability: "In stock",
    images: [img("photo-1527864550417-7fd91fc51a46"), img("photo-1615663245857-ac93bb7c39e7")],
    badge: "Featured",
    featuredRank: 2,
    addedOn: "2026-06-10",
    supportsQuantity: true,
    minimumOrderQuantity: 10,
    specifications: [
      { label: "Connectivity", value: "2.4 GHz USB receiver" },
      { label: "DPI", value: "800 / 1200 / 1600" },
      { label: "Battery", value: "1 × AA, up to 12 months" },
    ],
    features: ["Silent switches", "Ambidextrous shape"],
    variants: ["Black", "White"],
  },
  {
    slug: "low-profile-wireless-keyboard",
    name: "Low-Profile Wireless Keyboard",
    category: "Hardware & IT",
    summary: "Full-size scissor-switch keyboard with multi-device pairing.",
    description:
      "A slim full-size keyboard with scissor-switch keys and multi-device Bluetooth pairing, suited to hot-desking and hybrid workstations.",
    price: "₹4,299",
    sku: "ON-IT-3040",
    availability: "In stock",
    images: [img("photo-1587829741301-dc798b83add3")],
    featuredRank: 8,
    addedOn: "2026-04-01",
    supportsQuantity: true,
    minimumOrderQuantity: 10,
    specifications: [
      { label: "Layout", value: "Full size with numpad" },
      { label: "Connectivity", value: "Bluetooth + USB receiver" },
    ],
    features: ["Pairs with up to three devices", "Rechargeable"],
    variants: ["Black", "Silver"],
  },
  {
    slug: "compact-workgroup-printer",
    name: "Compact Workgroup Printer",
    category: "Hardware & IT",
    summary: "Duplex mono laser printer for teams of 10–25, with network printing.",
    description:
      "A compact mono laser printer for small workgroups. Automatic duplex, wired and wireless network printing, and a 250-sheet tray. Supplied with installation and consumables planning.",
    price: "₹12,499",
    startingPrice: true,
    sku: "ON-IT-3075",
    availability: "Lead time 7–10 working days",
    images: [img("photo-1612815154858-60aa4c59eaa6")],
    featuredRank: 12,
    addedOn: "2026-03-25",
    supportsQuantity: true,
    minimumOrderQuantity: 1,
    specifications: [
      { label: "Print speed", value: "30 ppm mono" },
      { label: "Duplex", value: "Automatic" },
      { label: "Tray", value: "250 sheets" },
    ],
    features: ["Wired and wireless networking", "Duplex as default"],
  },
  {
    slug: "usb-c-docking-station",
    name: "USB-C Docking Station",
    category: "Hardware & IT",
    summary: "Single-cable dock with dual display output and 90W passthrough charging.",
    description:
      "A single-cable dock for hybrid desks: dual display output, gigabit ethernet, USB-A ports and 90W passthrough charging for laptops.",
    price: "₹8,900",
    sku: "ON-IT-3099",
    availability: "In stock",
    images: [img("photo-1588872657578-7efd1f1555ed")],
    badge: "New",
    featuredRank: 5,
    addedOn: "2026-07-14",
    supportsQuantity: true,
    minimumOrderQuantity: 5,
    specifications: [
      { label: "Displays", value: "2 × 4K @ 60 Hz" },
      { label: "Power delivery", value: "90 W" },
      { label: "Ports", value: "HDMI ×2, USB-A ×3, RJ45, SD" },
    ],
    features: ["Single-cable desk setup", "Gigabit ethernet"],
  },
  {
    slug: "branded-corporate-stationery-kit",
    name: "Branded Corporate Stationery Kit",
    category: "Printing & Branding",
    summary: "Letterheads, envelopes and cards printed to your brand specification.",
    description:
      "A complete printed stationery programme — letterheads, envelopes, compliment slips and business cards — produced to your brand guidelines with colour matching across runs.",
    sku: "ON-PB-4010",
    availability: "Made to order — 7–10 working days",
    images: [img("photo-1586281380349-632531db7ed4"), img("photo-1524234107056-1c1f48f64ab8")],
    featuredRank: 10,
    addedOn: "2026-05-11",
    supportsQuantity: true,
    minimumOrderQuantity: 100,
    specifications: [
      { label: "Stock", value: "100–300 gsm uncoated" },
      { label: "Print", value: "CMYK, optional spot colour" },
    ],
    features: ["Colour matching across reprints", "Brand guideline compliance check"],
    variants: ["Letterhead", "Envelope", "Business card", "Compliment slip"],
    customization: "Full artwork setup from your brand guidelines.",
  },
  {
    slug: "custom-branded-merchandise-pack",
    name: "Custom Branded Merchandise Pack",
    category: "Printing & Branding",
    summary: "Apparel, drinkware and desk items branded as a single merchandise programme.",
    description:
      "A merchandise programme assembled around one brand identity: apparel, drinkware, bags and desk items, produced together so finishes and colours stay consistent.",
    sku: "ON-PB-4055",
    availability: "Made to order — 12–18 working days",
    images: [img("photo-1523381210434-271e8be1f52b"), img("photo-1556905055-8f358a7a47b2")],
    featuredRank: 13,
    addedOn: "2026-02-28",
    supportsQuantity: true,
    minimumOrderQuantity: 50,
    features: ["Single-supplier colour consistency", "Sample approval before production"],
    variants: ["Apparel", "Drinkware", "Bags", "Desk items"],
    customization: "Embroidery, screen print, laser engraving or UV print.",
  },
  {
    slug: "eastern-oud-perfume-100ml",
    name: "Eastern Oud Perfume 100ml",
    category: "Fragrance & Luxury Gifting",
    summary: "A deep oud composition with amber and saffron, in a weighted glass flacon.",
    description:
      "An eastern composition built on oud, warmed by amber and saffron, with a long dry-down. Presented in a weighted glass flacon inside a rigid gift box.",
    price: "₹6,750",
    sku: "ON-FL-5011",
    availability: "In stock",
    images: [img("photo-1592945403244-b3fbafd7f539"), img("photo-1615634260167-c8cdede054de")],
    badge: "Featured",
    featuredRank: 4,
    addedOn: "2026-06-25",
    supportsQuantity: true,
    minimumOrderQuantity: 10,
    specifications: [
      { label: "Volume", value: "100 ml" },
      { label: "Concentration", value: "Eau de parfum" },
      { label: "Family", value: "Oud, amber, saffron" },
    ],
    features: ["Weighted glass flacon", "Rigid presentation box"],
    packaging: "Rigid box with satin insert.",
  },
  {
    slug: "western-signature-eau-de-parfum",
    name: "Western Signature Eau de Parfum",
    category: "Fragrance & Luxury Gifting",
    summary: "A fresh citrus-cedar signature suited to daily corporate wear.",
    description:
      "A bright opening of bergamot and citrus settling into cedar and light musk — a versatile signature that reads well in professional settings.",
    price: "₹5,499",
    sku: "ON-FL-5040",
    availability: "In stock",
    images: [img("photo-1594035910387-fea47794261f")],
    featuredRank: 15,
    addedOn: "2026-04-30",
    supportsQuantity: true,
    minimumOrderQuantity: 10,
    specifications: [
      { label: "Volume", value: "100 ml" },
      { label: "Family", value: "Citrus, cedar, musk" },
    ],
    features: ["Everyday wear profile", "Gift-ready packaging"],
  },
  {
    slug: "luxury-fragrance-gift-set",
    name: "Luxury Fragrance Gift Set",
    category: "Fragrance & Luxury Gifting",
    summary: "Perfume, candle and diffuser presented as one luxury gifting set.",
    description:
      "A three-piece luxury set — eau de parfum, scented candle and reed diffuser — sharing a single scent story, presented in a rigid box for senior recipients.",
    price: "₹8,900",
    sku: "ON-FL-5088",
    availability: "Limited stock",
    images: [img("photo-1615634260167-c8cdede054de"), img("photo-1602874801006-e26c4c5b5e8a")],
    badge: "New",
    featuredRank: 16,
    addedOn: "2026-07-28",
    supportsQuantity: true,
    minimumOrderQuantity: 5,
    specifications: [
      { label: "Pieces", value: "3" },
      { label: "Candle burn time", value: "45 hours" },
    ],
    features: ["Single scent story across pieces", "Rigid presentation box"],
    packaging: "Rigid box with printed sleeve.",
    customization: "Personalised gift card and logo foiling on sleeve.",
  },
];

/** Parses "₹4,999" into a number for sorting. Quote-only products sort last. */
export function priceValue(product: Product): number {
  if (!product.price) return Number.POSITIVE_INFINITY;
  const n = Number(product.price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const sameCategory = products.filter(
    (p) => p.slug !== product.slug && p.category === product.category,
  );
  const others = products.filter(
    (p) => p.slug !== product.slug && p.category !== product.category,
  );
  return [...sameCategory, ...others].slice(0, limit);
}

export function sortProducts(list: Product[], sort: ProductSort): Product[] {
  const out = [...list];
  switch (sort) {
    case "Newest":
      return out.sort((a, b) => b.addedOn.localeCompare(a.addedOn));
    case "Price: Low to High":
      return out.sort((a, b) => priceValue(a) - priceValue(b));
    case "Price: High to Low":
      return out.sort((a, b) => {
        const av = priceValue(a);
        const bv = priceValue(b);
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
        if (!Number.isFinite(av)) return 1;
        if (!Number.isFinite(bv)) return -1;
        return bv - av;
      });
    case "Name: A–Z":
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case "Featured":
    default:
      return out.sort(
        (a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999),
      );
  }
}
