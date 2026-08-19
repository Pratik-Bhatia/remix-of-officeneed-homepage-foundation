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
  f?: Record<string, string[]>;
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
    const rawF = search["f"] as Record<string, string[]> | undefined;
    const result: ProductsSearch = {};
    if ((productCategories as readonly string[]).includes(rawCategory)) {
      result.category = rawCategory as (typeof productCategories)[number];
    }
    if (rawSubcategory) result.subcategory = rawSubcategory;
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


  const setCategory = (next: (typeof productCategories)[number]) =>
    navigate({
      search: (prev: ProductsSearch) => {
        const { subcategory: _omit, ...rest } = prev;
        return { ...rest, category: next };
      },
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

  const shopifyIndex = useShopifyIndex();
  const catalogue = useMemo(
    () =>
      products.map((p) =>
        mergeProduct(p, findShopifyMatch(shopifyIndex, p.slug, p.name)),
      ),
    [shopifyIndex],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sub = subcategory.trim().toLowerCase();
    const filtered = catalogue.filter((p) => {
      const inCategory = category === "All Products" || p.category === category;
      const inSubcategory = !sub || p.subcategories?.some((s) => s.toLowerCase() === sub);
      const matches =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
        
      let passesFilters = true;
      if (Object.keys(activeFilters).length > 0) {
        for (const [groupId, selectedValues] of Object.entries(activeFilters)) {
          if (!p.filterAttributes || !p.filterAttributes[groupId]) {
            passesFilters = false;
            break;
          }
          const productValues = p.filterAttributes[groupId];
          if (!productValues.some((v) => selectedValues.includes(v))) {
            passesFilters = false;
            break;
          }
        }
      }

      return inCategory && inSubcategory && matches && passesFilters;
    });
    return sortProducts(filtered, sort);
  }, [category, subcategory, query, sort, activeFilters]);


  const currentFilters = category !== "All Products" ? categoryFilters[category as keyof typeof categoryFilters] : null;

  const FilterList = () => {
    if (!currentFilters) return null;
    return (
      <div className="flex flex-col gap-8">
        {currentFilters.map((group) => (
          <div key={group.id}>
            <h3 className="font-medium text-sm mb-4">{group.label}</h3>
            <div className="flex flex-col gap-3">
              {group.options.map((option) => (
                <label key={option.value} className="flex items-center gap-3 text-sm cursor-pointer group">
                  <Checkbox
                    checked={activeFilters[group.id]?.includes(option.value) || false}
                    onCheckedChange={() => toggleFilter(group.id, option.value)}
                    className="border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors"
                  />
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
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


          <header className="max-w-2xl mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-medium tracking-tight text-foreground">
              {subcategory ? subcategory : category}
            </h1>
            <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
              {category === "All Products" && !subcategory ? DESCRIPTION : `Explore our premium selection of ${subcategory ? subcategory.toLowerCase() : category.toLowerCase()}.`}
            </p>
          </header>

          {/* Apple-style category/subcategory lineup */}
          <nav aria-label="Lineup" className="mt-8 mb-16 sm:mt-10 border-b border-border pb-8">
            <ul className="flex items-start justify-start gap-6 sm:gap-10 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
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

              {currentFilters && (
                <Sheet>
                  <SheetTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm lg:hidden hover:bg-secondary/50 transition-colors"
                    >
                      <SlidersHorizontal className="size-4" aria-hidden />
                      Filter
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                    <SheetHeader>
                      <SheetTitle className="text-left">Filters</SheetTitle>
                    </SheetHeader>
                    <div className="mt-8">
                      <FilterList />
                    </div>
                  </SheetContent>
                </Sheet>
              )}


            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="sort" className="sr-only">
                  Sort by
                </label>
                <Select value={sort} onValueChange={(value) => setSort(value as ProductSort)}>
                  <SelectTrigger id="sort" className="h-9 w-[180px] sm:w-[200px] text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {productSortOptions.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>




          {/* Main Layout Area */}
          <div className="mt-8 sm:mt-10 lg:flex lg:gap-12 xl:gap-16">
            {/* Desktop Sidebar */}
            {currentFilters && (
              <aside className="hidden lg:block w-64 shrink-0">
                <FilterList />
              </aside>
            )}
            
            {/* Grid */}
            <div className="flex-1">
              {visible.length === 0 ? (
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
