import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/products";

export const Route = createFileRoute("/account/saves")({
  component: SavesPage,
});

const savedProducts: Product[] = [
  {
    slug: "5-in-1-premium-gift-set",
    name: "5 in 1 Premium Gift Set",
    category: "Corporate Gifting",
    subcategories: ["Gift Sets"],
    summary: "A curated five-piece gifting set for premium corporate occasions.",
    description: "A curated five-piece gifting set for premium corporate occasions.",
    price: "₹1,845",
    images: ["https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=1200&q=75"],
    badge: "Featured",
    addedOn: "2026-06-01",
  },
  {
    slug: "h983-premium-a5-notebook-diary-metal-pen-gift-set",
    name: "H983 Premium A5 Notebook Diary & Metal Pen Gift Set",
    category: "Corporate Gifting",
    subcategories: ["Gift Sets"],
    summary: "A5 hardbound diary paired with a weighted metal pen.",
    description: "A5 hardbound diary paired with a weighted metal pen.",
    price: "₹600",
    images: ["https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=1200&q=75"],
    addedOn: "2026-05-18",
  },
  {
    slug: "officeneed-diary-1098",
    name: "Officeneed Diary 1098",
    category: "Office Stationery",
    subcategories: ["Diaries"],
    summary: "Everyday executive diary with a soft-touch cover.",
    description: "Everyday executive diary with a soft-touch cover.",
    images: ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&q=75"],
    addedOn: "2026-05-02",
  },
];

function SavesPage() {
  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Your Saves</h2>
      <p className="mt-1 text-sm text-muted-foreground">Products you've bookmarked for later.</p>

      {savedProducts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border p-12 text-center">
          <h3 className="text-base font-medium text-foreground">No saved items found. Start exploring.</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Tap the save icon on any product to keep it here for later.
          </p>
          <Button asChild className="mt-6 rounded-full px-6">
            <Link to="/">Explore the store</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3">
          {savedProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
