import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  productCategories,
  productSortOptions,
  products,
  sortProducts,
  type ProductSort,
} from "@/lib/products";

const TITLE = "Products — OfficeNeed";
const DESCRIPTION =
  "Explore business essentials, gifting solutions, technology, office supplies and more — sourced through one trusted partner.";

type ProductsSearch = {
  category?: (typeof productCategories)[number];
  sort?: ProductSort;
  q?: string;
};

export const Route = createFileRoute("/products/")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => {
    const rawCategory = String(search["category"] ?? "");
    const rawSort = String(search["sort"] ?? "");
    const rawQuery = typeof search["q"] === "string" ? (search["q"] as string) : "";
    const result: ProductsSearch = {};
    if ((productCategories as readonly string[]).includes(rawCategory)) {
      result.category = rawCategory as (typeof productCategories)[number];
    }
    if ((productSortOptions as readonly string[]).includes(rawSort)) {
      result.sort = rawSort as ProductSort;
    }
    if (rawQuery) result.q = rawQuery;
    return result;
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://officeneed-premier-launch.lovable.app/products" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "canonical", href: "https://officeneed-premier-launch.lovable.app/products" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = Route.useSearch();
  const category = search.category ?? "All Products";
  const sort = search.sort ?? "Featured";
  const navigate = useNavigate({ from: "/products/" });
  const query = search.q ?? "";
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setCategory = (next: (typeof productCategories)[number]) =>
    navigate({
      search: (prev: ProductsSearch) => ({ ...prev, category: next }),
      replace: true,
    });
  const setSort = (next: ProductSort) =>
    navigate({ search: (prev: ProductsSearch) => ({ ...prev, sort: next }), replace: true });
  const setQuery = (next: string) =>
    navigate({
      search: (prev: ProductsSearch) => {
        const { q: _omit, ...rest } = prev;
        return next ? { ...rest, q: next } : rest;
      },
      replace: true,
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = products.filter((p) => {
      const inCategory = category === "All Products" || p.category === category;
      const matches =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return inCategory && matches;
    });
    return sortProducts(filtered, sort);
  }, [category, query, sort]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <li>
                <Link to="/" className="transition-colors hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-foreground">
                Products
              </li>
            </ol>
          </nav>

          <header className="max-w-2xl">
            <h1 className="text-section">Products</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {DESCRIPTION}
            </p>
          </header>

          {/* Category navigation */}
          <nav aria-label="Product categories" className="mt-8 sm:mt-10">
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {productCategories.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-300",
                      category === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-muted",
                    )}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Controls */}
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products"
                  aria-label="Search products"
                  className="pl-9"
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls="mobile-filters"
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm sm:hidden"
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                Filter
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="sort" className="sr-only">
                  Sort by
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ProductSort)}
                  className="h-9 max-w-[60vw] rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 sm:max-w-none"
                >
                  {productSortOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Mobile filter panel */}
          {filtersOpen ? (
            <div
              id="mobile-filters"
              className="mt-4 rounded-xl border border-border p-4 sm:hidden"
            >
              <p className="text-eyebrow text-muted-foreground">Category</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {productCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs transition-colors",
                      category === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Grid */}
          {visible.length === 0 ? (
            <p className="mt-14 text-sm text-muted-foreground">
              No products match that search. Try a different term or category.
            </p>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:mt-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
