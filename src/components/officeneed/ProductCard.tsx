import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      aria-label={`View ${product.name}`}
      className="group flex h-full flex-col rounded-2xl transition-shadow duration-300 hover:shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary">
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain object-center p-6 sm:p-8 transition-transform duration-300 ease-out group-hover:scale-105"
        />
        {product.badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground z-10">
            {product.badge}
          </span>
        ) : null}
        {!product.price && (
          <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[0.62rem] font-medium tracking-[0.1em] text-background backdrop-blur z-10">
            Enquiry Only
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:text-base">
          {product.name}
        </h3>
        <p className="text-xs tabular-nums text-foreground/80">
          {product.price
            ? `${product.startingPrice ? "From " : ""}${product.price}`
            : "Price on enquiry"}
        </p>
      </div>
    </Link>
  );
}
