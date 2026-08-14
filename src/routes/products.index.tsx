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
import { navCategories } from "@/lib/navigation";

const TITLE = "Products — OfficeNeed";
const DESCRIPTION =
  "Explore business essentials, gifting solutions, technology, office supplies and more — sourced through one trusted partner.";

type ProductsSearch = {
  category?: (typeof productCategories)[number];
  subcategory?: string;
  sort?: ProductSort;
  q?: string;
};

const categoryImages: Record<string, string> = {
  "Corporate Gifting": "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=75",
  "Office Supplies": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=75",
  "Hardware & IT": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=300&q=75",
  "Printing & Branding": "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=300&q=75",
  "Fragrance & Luxury Gifting": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=300&q=75",
  "All Products": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=300&q=75",
};

const subcategoryImages: Record<string, string> = {
  // Corporate Gifting
  "Gift Sets": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=200&q=75",
  "Corporate Gifts": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=200&q=75",
  "Premium Gifts": "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=200&q=75",
  "Drinkware & Utensils": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=200&q=75",
  "Customized Gifts": "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=200&q=75",
  // Fragrance & Luxury Gifting
  "Perfumes": "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=200&q=75",
  "Eastern Perfumes": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=200&q=75",
  "Western Perfumes": "https://images.unsplash.com/photo-1615634260167-c8cdede054de?auto=format&fit=crop&w=200&q=75",
  "Luxury Gifting": "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=200&q=75",
  // Office Stationery
  "Writing Instruments": "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=200&q=75",
  "Notebooks": "https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=200&q=75",
  "Desk Accessories": "https://images.unsplash.com/photo-1524578271613-d550eacf6090?auto=format&fit=crop&w=200&q=75",
  "Office Supplies": "https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=200&q=75",
  // Hardware Supplies
  "Mouse": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=200&q=75",
  "Keyboards": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=200&q=75",
  "Printers": "https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=200&q=75",
  "Computer Accessories": "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=200&q=75",
  // Printing & Branding
  "Custom Printing": "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=200&q=75",
  "Corporate Branding": "https://images.unsplash.com/photo-1524234107056-1c1f48f64ab8?auto=format&fit=crop&w=200&q=75",
  "Printed Materials": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=200&q=75",
  "Branded Merchandise": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=200&q=75",
};


export const Route = createFileRoute("/products/")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => {
    const rawCategory = String(search["category"] ?? "");
    const rawSubcategory = String(search["subcategory"] ?? "");
    const rawSort = String(search["sort"] ?? "");
    const rawQuery = typeof search["q"] === "string" ? (search["q"] as string) : "";
    const result: ProductsSearch = {};
    if ((productCategories as readonly string[]).includes(rawCategory)) {
      result.category = rawCategory as (typeof productCategories)[number];
    }
    if (rawSubcategory) result.subcategory = rawSubcategory;
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
  const subcategory = search.subcategory ?? "";
  const sort = search.sort ?? "Featured";
  const navigate = useNavigate({ from: "/products/" });
  const query = search.q ?? "";
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setCategory = (next: (typeof productCategories)[number]) =>
    navigate({
      search: (prev: ProductsSearch) => ({ ...prev, category: next, subcategory: undefined }),
      replace: true,
    });
  const setSubcategory = (next: string) =>
    navigate({
      search: (prev: ProductsSearch) => ({ ...prev, subcategory: next }),
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
    const sub = subcategory.trim().toLowerCase();
    const filtered = products.filter((p) => {
      const inCategory = category === "All Products" || p.category === category;
      const inSubcategory = !sub || p.name.toLowerCase().includes(sub) || p.summary.toLowerCase().includes(sub) || p.description.toLowerCase().includes(sub);
      const matches =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return inCategory && inSubcategory && matches;
    });
    return sortProducts(filtered, sort);
  }, [category, subcategory, query, sort]);

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

          <header className="max-w-2xl text-center mx-auto mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-medium tracking-tight text-foreground">
              {subcategory ? subcategory : category}
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
              {category === "All Products" && !subcategory ? DESCRIPTION : `Explore our premium selection of ${subcategory ? subcategory.toLowerCase() : category.toLowerCase()}.`}
            </p>
          </header>

          {/* Apple-style category/subcategory lineup */}
          <nav aria-label="Lineup" className="mt-8 mb-16 sm:mt-10 border-b border-border pb-8">
            <ul className="flex items-start justify-center gap-6 sm:gap-10 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
              {category === "All Products" ? (
                // Show Main Categories
                productCategories.filter(c => c !== "All Products").map((c) => (
                  <li key={c} className="snap-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setCategory(c)}
                      className="group flex flex-col items-center gap-3 w-20 sm:w-24 focus:outline-none"
                    >
                      <div className="size-14 sm:size-16 rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-md">
                        <img src={categoryImages[c]} alt={c} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[11px] sm:text-xs font-medium text-foreground/80 group-hover:text-foreground text-center leading-tight">
                        {c}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                // Show Subcategories for the selected category
                navCategories
                  ?.find((nav: any) => nav.label === category || (category === "Office Supplies" && nav.label === "Office Stationery") || (category === "Hardware & IT" && nav.label === "Hardware Supplies"))?.items
                  ?.map((item: string) => (
                  <li key={item} className="snap-center shrink-0">
                    <button
                      type="button"
                      aria-pressed={subcategory === item}
                      onClick={() => setSubcategory(item === subcategory ? "" : item)}
                      className="group flex flex-col items-center gap-3 w-20 sm:w-24 focus:outline-none"
                    >
                      <div className={cn("size-14 sm:size-16 rounded-2xl overflow-hidden bg-secondary border transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md", subcategory === item ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border shadow-sm")}>
                        <img src={subcategoryImages[item] || categoryImages[category]} alt={item} className="w-full h-full object-cover" />
                      </div>
                      <span className={cn("text-[11px] sm:text-xs text-center leading-tight transition-colors", subcategory === item ? "font-semibold text-foreground" : "font-medium text-foreground/80 group-hover:text-foreground")}>
                        {item}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </nav>

          {/* Explore Header */}
          <div className="mt-12 sm:mt-16 mb-6">
            <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">Explore our collection.</h2>
          </div>

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
