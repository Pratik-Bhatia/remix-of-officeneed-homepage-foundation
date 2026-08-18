import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { EnquiryDialog } from "@/components/officeneed/EnquiryDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";

const BASE = "https://officeneed-premier-launch.lovable.app";

export const Route = createFileRoute("/products/$slug")({
  loader: ({ params }) => {
    const product = getProductBySlug(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Product unavailable — OfficeNeed" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData.product;
    const title = `${p.name} — OfficeNeed`;
    const url = `${BASE}/products/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: p.summary },
        { property: "og:title", content: title },
        { property: "og:description", content: p.summary },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "og:image", content: p.images[0]! },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: p.images[0]! },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.description,
            image: p.images,
            category: p.category,
            ...(p.sku ? { sku: p.sku } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: ProductNotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-5 py-24 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: ProductDetail,
});

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="text-section">Product not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This product may have been renamed or removed.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Browse all products
        </Link>
      </main>
      <Footer />
    </div>
  );
}

function ProductDetail() {
  const { product } = Route.useLoaderData();
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(product.minimumOrderQuantity ?? 1);
  
  const nextImage = () => {
    setActiveImage((prev) => (prev + 1) % product.images.length);
  };
  const prevImage = () => {
    setActiveImage((prev) => (prev - 1 + product.images.length) % product.images.length);
  };
  const related = getRelatedProducts(product, 4);
  const step = 1;
  const min = product.minimumOrderQuantity ?? 1;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <li>
                <Link to="/" className="transition-colors hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link to="/products" className="transition-colors hover:text-foreground">
                  Products
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="max-w-full truncate">{product.category}</li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="max-w-full truncate text-foreground">
                {product.name}
              </li>
            </ol>
          </nav>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Gallery Wrapper (Sticky on desktop) */}
            <div className="lg:sticky lg:top-[120px] self-start">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Thumbnails */}
                {product.images.length > 1 && (
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="order-2 lg:order-1 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 lg:pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {product.images.map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={`Show image ${i + 1} of ${product.images.length}`}
                        aria-current={activeImage === i}
                        className={cn(
                          "size-16 sm:size-20 shrink-0 overflow-hidden rounded-xl border bg-secondary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                          activeImage === i ? "border-foreground ring-1 ring-foreground opacity-100" : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Main Image */}
                <div className="order-1 lg:order-2 flex-1 relative overflow-hidden rounded-2xl bg-secondary group">
                  <img
                    src={product.images[activeImage]}
                    alt={`${product.name} — image ${activeImage + 1}`}
                    className="aspect-square lg:aspect-[4/3] w-full object-contain p-6 sm:p-10"
                  />
                  
                  {/* Arrows */}
                  {product.images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        aria-label="Previous product image"
                        className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 lg:size-10 rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronLeft className="size-4 lg:size-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        aria-label="Next product image"
                        className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 lg:size-10 rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronRight className="size-4 lg:size-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Information */}
            <div>
              <p className="text-eyebrow text-muted-foreground">{product.category}</p>
              <h1 className="mt-2 text-section">{product.name}</h1>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {product.summary}
              </p>

              <p className="mt-6 text-lg font-semibold tabular-nums text-foreground">
                {product.price
                  ? `${product.startingPrice ? "From " : ""}${product.price}`
                  : "Price on enquiry"}
              </p>

              <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                {product.availability ? (
                  <div className="flex gap-2">
                    <dt className="font-medium text-foreground/80">Availability</dt>
                    <dd>{product.availability}</dd>
                  </div>
                ) : null}
                {product.sku ? (
                  <div className="flex gap-2">
                    <dt className="font-medium text-foreground/80">Product code</dt>
                    <dd className="tabular-nums">{product.sku}</dd>
                  </div>
                ) : null}
              </dl>

              {product.supportsQuantity ? (
                <div className="mt-6">
                  <p className="text-xs font-medium text-foreground/80" id="qty-label">
                    Quantity{min > 1 ? ` (minimum ${min})` : ""}
                  </p>
                  <div className="mt-2 inline-flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(min, q - step))}
                      className="grid size-10 place-items-center text-foreground/80 transition-colors hover:bg-secondary"
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      type="number"
                      aria-labelledby="qty-label"
                      value={quantity}
                      min={min}
                      onChange={(e) =>
                        setQuantity(Math.max(min, Number(e.target.value) || min))
                      }
                      className="w-16 border-x border-border bg-background py-2 text-center text-sm tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => q + step)}
                      className="grid size-10 place-items-center text-foreground/80 transition-colors hover:bg-secondary"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <EnquiryDialog
                  product={product}
                  quantity={product.supportsQuantity ? quantity : undefined}
                  trigger={
                    <Button size="lg" className="w-full sm:w-auto">
                      Enquire Now
                    </Button>
                  }
                />
                <EnquiryDialog
                  product={product}
                  quantity={product.supportsQuantity ? quantity : undefined}
                  trigger={
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      Add to Enquiry
                    </Button>
                  }
                />
              </div>

              {/* Details */}
              <div className="mt-10 space-y-8 border-t border-border pt-8">
                <section>
                  <h2 className="text-sm font-semibold text-foreground">Description</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                </section>

                {product.specifications?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Specifications</h2>
                    <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                      {product.specifications.map((s) => (
                        <div key={s.label} className="flex gap-4 py-2.5">
                          <dt className="w-40 shrink-0 text-muted-foreground">{s.label}</dt>
                          <dd className="min-w-0 text-foreground">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}

                {product.features?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Features</h2>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                      {product.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span aria-hidden className="text-foreground/40">
                            —
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {product.variants?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Options</h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {product.variants.map((v) => (
                        <li
                          key={v}
                          className="rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground"
                        >
                          {v}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {product.packaging ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Packaging</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {product.packaging}
                    </p>
                  </section>
                ) : null}

                {product.customization ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Customization</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {product.customization}
                    </p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>

          {/* Enquiry CTA */}
          <section
            aria-labelledby="enquiry-heading"
            className="mt-16 rounded-2xl border border-border px-6 py-10 text-center sm:mt-20 sm:px-10"
          >
            <h2 id="enquiry-heading" className="text-lg font-semibold text-foreground sm:text-xl">
              Interested in this product?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tell us what you need and our team will help you with pricing, quantities,
              customization and delivery.
            </p>
            <div className="mt-6 flex justify-center">
              <EnquiryDialog
                product={product}
                quantity={product.supportsQuantity ? quantity : undefined}
                trigger={<Button size="lg">Send Enquiry</Button>}
              />
            </div>
          </section>

          {/* Related */}
          {related.length ? (
            <section aria-labelledby="related-heading" className="mt-16 sm:mt-20">
              <h2 id="related-heading" className="text-section">
                You May Also Like
              </h2>
              <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
