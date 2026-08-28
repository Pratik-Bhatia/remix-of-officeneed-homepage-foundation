import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { categoryFilters } from "@/lib/filters";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  productSortOptions,
  products,
  sortProducts,
} from "@/lib/products";
import type { ProductSort } from "@/lib/products";
import { useShopifyCatalogue } from "@/lib/shopify-overlay";
import { getCategoryByHandle, TAXONOMY, MAIN_CATEGORIES, type MainCategory } from "@/lib/taxonomy";

const TITLE = "Products — OfficeNeed";
const DESCRIPTION =
  "Explore business essentials, gifting solutions, technology, office supplies and more — sourced through one trusted partner.";

type ProductsSearch = {
  collection?: string;
  missingMapping?: string;
  sort?: ProductSort;
  q?: string;
  f?: Record<string, string[]>;
};

const categoryImages: Record<string, string> = {
  "Corporate Gifting": "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=75",
  "Office Stationery": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=75",
  "Hardware Supplies": "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=300&q=75",
  "Officeneed Exclusive": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=300&q=75",
  "Fragrance Gifting": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=300&q=75",
  "All Products": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=300&q=75",
};

const subcategoryImages: Record<string, string> = {
  "Gift Sets": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=200&q=75",
  "Corporate Gifts": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=200&q=75",
};

export const Route = createFileRoute("/products/")({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => {
    const rawCollection = typeof search["collection"] === "string" ? search["collection"] : "";
    const rawMissing = typeof search["missingMapping"] === "string" ? search["missingMapping"] : "";
    const rawSort = String(search["sort"] ?? "");
    const rawQuery = typeof search["q"] === "string" ? (search["q"] as string) : "";
    const rawF = search["f"] as Record<string, string[]> | undefined;
    
    const result: ProductsSearch = {};
    if (rawCollection) result.collection = rawCollection;
    if (rawMissing) result.missingMapping = rawMissing;
    if ((productSortOptions as readonly string[]).includes(rawSort)) {
      result.sort = rawSort as ProductSort;
    }
    if (rawQuery) result.q = rawQuery;
    if (rawF) result.f = rawF;
    return result;
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = Route.useSearch();
  const collection = search.collection ?? "";
  const missingMapping = search.missingMapping ?? "";
  const sort = search.sort ?? "Featured";
  const navigate = useNavigate({ from: "/products/" });
  const query = search.q ?? "";

  const setCollection = (next: string | null) =>
    navigate({
      search: (prev: ProductsSearch) => {
        const { collection: _omit, missingMapping: _m, ...rest } = prev;
        return next ? { ...rest, collection: next } : rest;
      },
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

  const activeFilters = search.f ?? {};
  
  const toggleFilter = (groupId: string, value: string) => {
    navigate({
      search: (prev: ProductsSearch) => {
        const nextFilters = { ...(prev.f || {}) };
        if (!nextFilters[groupId]) {
          nextFilters[groupId] = [value];
        } else if (nextFilters[groupId].includes(value)) {
          nextFilters[groupId] = nextFilters[groupId].filter((v) => v !== value);
          if (nextFilters[groupId].length === 0) delete nextFilters[groupId];
        } else {
          nextFilters[groupId] = [...nextFilters[groupId], value];
        }
        
        if (Object.keys(nextFilters).length === 0) {
          const { f: _omit, ...rest } = prev;
          return rest;
        }
        return { ...prev, f: nextFilters };
      },
      replace: true,
    });
  };

  const taxonomyMatch = collection ? getCategoryByHandle(collection) : null;
  const isAllProducts = !collection && !missingMapping;

  const currentFilters = taxonomyMatch?.parentTitle
    ? categoryFilters[taxonomyMatch.parentTitle as keyof typeof categoryFilters] 
    : taxonomyMatch?.node.title 
      ? categoryFilters[taxonomyMatch.node.title as keyof typeof categoryFilters]
      : null;

  const catalogue = useShopifyCatalogue(products);

  const visible = useMemo(() => {
    if (missingMapping) return [];

    const q = query.trim().toLowerCase();
    const filtered = catalogue.filter((p) => {
      // Filter by the actual Shopify collection membership
      const inCollection = isAllProducts || (p.collectionHandles && p.collectionHandles.includes(collection));
      
      const matches =
        p.summary.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q);
        
      const passesFilters = Object.entries(activeFilters).every(([groupId, requiredValues]) => {
        if (!requiredValues.length) return true;
        const productValues = p.filterAttributes?.[groupId] || [];
        return requiredValues.some((v) => productValues.includes(v));
      });

      return inCollection && matches && passesFilters;
    });
    return sortProducts(filtered, sort);
  }, [catalogue, collection, isAllProducts, missingMapping, query, sort, activeFilters]);

  const FilterList = () => {
    if (!currentFilters) return null;
    return (
      <div className="flex flex-col gap-8">
        {currentFilters.map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-medium tracking-tight mb-4">{group.label}</h3>
            <div className="space-y-3">
              {group.options.map((option) => (
                <label key={option.value} className="flex items-center gap-3 cursor-pointer group/label">
                  <Checkbox
                    checked={activeFilters[group.id]?.includes(option.value) ?? false}
                    onCheckedChange={() => toggleFilter(group.id, option.value)}
                    className="border-muted-foreground/30 data-[state=checked]:border-primary transition-colors"
                  />
                  <span className="text-sm text-muted-foreground group-hover/label:text-foreground transition-colors select-none">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">

          <div className="text-sm text-muted-foreground mb-6 flex items-center gap-2">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span>/</span>
            {isAllProducts ? (
              <span className="text-foreground">All Products</span>
            ) : taxonomyMatch?.parentTitle ? (
              <>
                <span>{taxonomyMatch.parentTitle}</span>
                <span>/</span>
                <span className="text-foreground">{taxonomyMatch.node.title}</span>
              </>
            ) : taxonomyMatch?.node.title ? (
              <span className="text-foreground">{taxonomyMatch.node.title}</span>
            ) : null}
          </div>

          <header className="max-w-2xl mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-medium tracking-tight text-foreground">
              {isAllProducts ? "All Products" : missingMapping ? missingMapping : taxonomyMatch?.node.title}
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
              {isAllProducts ? DESCRIPTION : `Explore our selection.`}
            </p>
          </header>

          <nav aria-label="Lineup" className="mt-8 mb-16 sm:mt-10 border-b border-border pb-8">
            <ul className="flex items-start justify-start gap-6 sm:gap-10 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
              {isAllProducts ? (
                MAIN_CATEGORIES.map((c) => {
                  const node = TAXONOMY[c as MainCategory];
                  if (!node.handle) return null;
                  return (
                    <li key={c} className="snap-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setCollection(node.handle)}
                        className="group flex flex-col items-center gap-3 w-20 sm:w-24 focus:outline-none"
                      >
                        <div className="size-14 sm:size-16 rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-md">
                          <img src={categoryImages[c] || categoryImages["All Products"]} alt={c} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-medium text-foreground/80 group-hover:text-foreground text-center leading-tight">
                          {c}
                        </span>
                      </button>
                    </li>
                  )
                })
              ) : taxonomyMatch && !taxonomyMatch.parentTitle ? (
                Object.values(TAXONOMY[taxonomyMatch.node.title as MainCategory].subcategories).map((sub: any) => {
                  if (!sub.handle) return null;
                  return (
                    <li key={sub.title} className="snap-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setCollection(sub.handle)}
                        className="group flex flex-col items-center gap-3 w-20 sm:w-24 focus:outline-none"
                      >
                        <div className="size-14 sm:size-16 rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-md">
                          <img src={subcategoryImages[sub.title] || categoryImages["All Products"]} alt={sub.title} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-medium text-foreground/80 group-hover:text-foreground text-center leading-tight">
                          {sub.title}
                        </span>
                      </button>
                    </li>
                  );
                })
              ) : null}
            </ul>
          </nav>

          <div className="mt-12 sm:mt-16 mb-6">
            <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight">Explore our collection.</h2>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-9" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
              <div className="flex items-center gap-2">
                <Select value={sort} onValueChange={(value) => setSort(value as ProductSort)}>
                  <SelectTrigger className="h-9 w-[180px] sm:w-[200px] text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {productSortOptions.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="mt-8 sm:mt-10 lg:flex lg:gap-12 xl:gap-16">
            {currentFilters && (
              <aside className="hidden lg:block w-64 shrink-0">
                <FilterList />
              </aside>
            )}
            
            <div className="flex-1">
              {missingMapping ? (
                <div className="py-12 text-center border rounded-lg bg-secondary/20">
                  <h3 className="text-lg font-medium text-foreground mb-2">Configuration Missing</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    The Shopify collection mapping for <strong>"{missingMapping}"</strong> is not yet configured. Please create a collection in Shopify and map its handle in the taxonomy.
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4 lg:mt-0">
                  No products match that search. Try a different term or category.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-3">
                  {visible.map((p) => (
                    <ProductCard key={p.slug} product={p} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
}


