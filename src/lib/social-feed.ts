export type FeedProduct = {
  id: string;
  name: string;
  image: string;
  /** Placeholder — swap for the real Shopify product URL. */
  url: string;
  price?: string;
};

export type SocialFeedItem = {
  id: string;
  image: string;
  alt: string;
  /** Placeholder — swap for the real Instagram post URL. */
  instagramUrl: string;
  products: FeedProduct[];
  /** Optional curated collection containing every tagged product. */
  shopTheLookUrl?: string;
};

const lifestyle = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const thumb = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=200&q=75`;

export const socialFeedItems: SocialFeedItem[] = [
  {
    id: "feed-desk-morning",
    image: lifestyle("photo-1521737604893-d14cc237f11d"),
    alt: "Team celebrating with branded corporate gifts in a modern office",
    instagramUrl: "https://instagram.com/officeneed",
    products: [
      {
        id: "fp-signature-hamper",
        name: "Signature Gift Hamper",
        image: thumb("photo-1549465220-1a8b9238cd48"),
        url: "/products/signature-gift-hamper",
        price: "₹4,999",
      },
    ],
  },
  {
    id: "feed-stationery-flatlay",
    image: lifestyle("photo-1517842645767-c639042777db"),
    alt: "Notebook, pen and coffee on a warm editorial desk setup",
    instagramUrl: "https://instagram.com/officeneed",
    products: [
      {
        id: "fp-leather-journal",
        name: "Leather Bound Journal",
        image: thumb("photo-1531346878377-a5be20888e57"),
        url: "/products/leather-bound-journal",
        price: "₹1,299",
      },
      {
        id: "fp-metal-pen",
        name: "Brushed Metal Pen",
        image: thumb("photo-1583485088034-697b5bc54ccd"),
        url: "/products/brushed-metal-pen",
        price: "₹899",
      },
    ],
    shopTheLookUrl: "/collections/desk-essentials",
  },
  {
    id: "feed-workspace-tech",
    image: lifestyle("photo-1498050108023-c5249f4df085"),
    alt: "Minimal workstation with keyboard, mouse and accessories",
    instagramUrl: "https://instagram.com/officeneed",
    products: [
      {
        id: "fp-wireless-mouse",
        name: "Wireless Precision Mouse",
        image: thumb("photo-1527864550417-7fd91fc51a46"),
        url: "/products/wireless-precision-mouse",
        price: "₹2,199",
      },
      {
        id: "fp-keyboard",
        name: "Low-Profile Keyboard",
        image: thumb("photo-1587829741301-dc798b83add3"),
        url: "/products/low-profile-keyboard",
        price: "₹3,499",
      },
      {
        id: "fp-desk-organiser",
        name: "Desk Organiser",
        image: thumb("photo-1544816155-12df9643f363"),
        url: "/products/desk-organiser",
        price: "₹1,499",
      },
    ],
    shopTheLookUrl: "/collections/workstation",
  },
  {
    id: "feed-luxury-fragrance",
    image: lifestyle("photo-1594035910387-fea47794261f"),
    alt: "Luxury perfume bottle styled on a neutral surface",
    instagramUrl: "https://instagram.com/officeneed",
    products: [
      {
        id: "fp-oud-perfume",
        name: "Eastern Oud Perfume",
        image: thumb("photo-1541643600914-78b084683601"),
        url: "/products/eastern-oud-perfume",
        price: "₹5,499",
      },
    ],
  },
];
