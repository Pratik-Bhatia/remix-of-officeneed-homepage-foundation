import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="group flex h-full flex-col">
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        aria-label={`View ${product.name}`}
        className="flex h-full flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary">
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain object-center p-6 sm:p-8 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
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

        <div className="mt-4 flex flex-1 flex-col gap-1.5">
          <p className="text-eyebrow text-muted-foreground">{product.category}</p>
          <h3 className="text-sm font-medium leading-snug text-foreground sm:text-base">
            {product.name}
          </h3>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {product.summary}
          </p>
          <p className="mt-auto pt-2 text-xs tabular-nums text-foreground/80">
            {product.price
              ? `${product.startingPrice ? "From " : ""}${product.price}`
              : "Price on enquiry"}
          </p>
          <span className="mt-2 inline-flex w-fit items-center gap-1 border-b border-foreground/30 pb-0.5 text-xs font-medium text-foreground transition-colors group-hover:border-foreground">
            View Product
            <span aria-hidden>→</span>
          </span>
        </div>
      </Link>
    </article>
  );
}
