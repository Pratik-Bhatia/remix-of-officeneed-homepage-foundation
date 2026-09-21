import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal, PackageSearch } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buildFilterGroups, computePriceBuckets, type FilterGroup } from "@/lib/filters";
import { searchProducts, getSearchSuggestion } from "@/lib/search";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { useShopifyCatalogue, useShopifyCollections } from "@/lib/shopify-overlay";
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
        // Changing category/subcategory always clears active filters: filter
        // kinds and bucket values are category-specific (e.g. Corporate's
        // price buckets don't mean anything in Fragrance), so a stale
        // selection carried across categories would silently filter out
        // every product instead of being ignored.
        const { collection: _omit, missingMapping: _m, f: _f, ...rest } = prev;
        return next ? { ...rest, collection: next } : rest;
      },
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
  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  const clearAllFilters = () =>
    navigate({
      search: (prev: ProductsSearch) => {
        const { f: _omit, ...rest } = prev;
        return rest;
      },
      replace: true,
    });

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

  // The MainCategory a subcategory page belongs to (e.g. "Luxury Pens" ->
  // "Corporate Gifting"), or the category itself on a top-level page. This
  // is the single reusable resolution used for BOTH the page heading and
  // the subcategory navigation below, so a subcategory page (e.g. Printer)
  // and its parent's own page (Computer Peripherals) render the identical
  // nav from the identical source -- no per-category branching anywhere.
  // Filter kinds are also always resolved against this, never the
  // subcategory title, so e.g. the "Printer" subcategory correctly gets
  // Computer Peripherals' filters instead of silently showing none.
  const mainCategoryTitle = taxonomyMatch
    ? ((taxonomyMatch.parentTitle ?? taxonomyMatch.node.title) as MainCategory)
    : undefined;

  // Subcategory nav now stays visible on subcategory pages too (previously
  // it only rendered on "All Products" or a top-level category page, so
  // entering a subcategory like Printer hid it entirely). Whenever a
  // MainCategory is resolved -- whether the current page IS that category
  // or is one of its subcategories -- its full subcategory list is shown.
  const showSubcategoriesNav = isAllProducts || !!mainCategoryTitle;
  // Only meaningful once the user has actually drilled into a specific
  // subcategory; on the parent category's own page this is undefined, so
  // no subcategory icon is incorrectly highlighted there.
  const activeSubcategoryHandle = taxonomyMatch?.parentTitle ? collection : undefined;

  const catalogue = useShopifyCatalogue(products);
  const { collections, isLoading: collectionsLoading } = useShopifyCollections();

  /** Returns the Shopify-hosted image URL for a collection, or null if not yet loaded / unavailable. */
  const getCollectionImage = (handle: string): string | null => {
    const shopifyCol = collections.find(c => c.handle === handle);
    if (handle === "consumables") {
      console.log("[icon-debug] consumables lookup →", { shopifyCol, allHandles: collections.map(c => c.handle) });
    }
    return shopifyCol?.image?.url ?? null;
  };


  // Products in scope for the current category/subcategory only (no search
  // query, no active filters applied yet). This is what filter options are
  // derived from, so a subcategory only ever offers values its own products
  // actually support (e.g. "Under ₹100" won't appear if nothing here is).
  const categoryScoped = useMemo(() => {
    if (missingMapping) return [];
    return catalogue.filter((p) => {
      if (isAllProducts) return true;
      const isShopifyProduct = Array.isArray(p.collectionHandles) && p.collectionHandles.length >= 0;
      if (isShopifyProduct) {
        // Shopify products: use ONLY the collection handles Shopify assigned.
        // Never guess from title/tags/category fields — those come from classify()
        // which is keyword-based and causes cross-category contamination.
        return collection ? p.collectionHandles!.includes(collection) : false;
      }
      // Static/legacy products (no Shopify data): fall back to local taxonomy.
      if (!taxonomyMatch) return false;
      if (taxonomyMatch.parentTitle) return !!p.subcategories?.includes(taxonomyMatch.node.title);
      return p.category === taxonomyMatch.node.title;
    });
  }, [catalogue, collection, isAllProducts, missingMapping, taxonomyMatch]);

  const filterGroups = useMemo(
    () => buildFilterGroups(mainCategoryTitle, categoryScoped),
    [mainCategoryTitle, categoryScoped],
  );

  // Price buckets are derived from the real price spread of categoryScoped
  // (see computePriceBuckets), so filtering by "price" must test against
  // these same bucket definitions rather than a precomputed attribute.
  const priceBuckets = useMemo(() => computePriceBuckets(categoryScoped), [categoryScoped]);

  // Defense-in-depth against stale filters surviving a category change via
  // back/forward navigation, a refresh, or a shared link: only a value that
  // actually appears as a real option for the current category/subcategory
  // is honored. Anything else is silently dropped rather than being applied
  // and incorrectly filtering out every product (e.g. a leftover Fragrance
  // "Scent Family" pick that would otherwise never match a Corporate item).
  const validActiveFilters = useMemo(() => {
    const validValuesByKind = new Map(filterGroups.map((g) => [g.id, new Set(g.options.map((o) => o.value))]));
    const result: Record<string, string[]> = {};
    for (const [kind, values] of Object.entries(activeFilters)) {
      const validSet = validValuesByKind.get(kind);
      if (!validSet) continue;
      const kept = values.filter((v) => validSet.has(v));
      if (kept.length) result[kind] = kept;
    }
    return result;
  }, [activeFilters, filterGroups]);

  // Relevance-ranked when there's a query (see src/lib/search.ts); untouched
  // order otherwise. sortProducts' "Featured" branch is a stable sort with no
  // real featuredRank on most products, so it preserves this relevance order
  // by default -- picking an explicit sort (e.g. Price) still overrides it,
  // same as any other e-commerce search-within-sort UX.
  const searched = useMemo(
    () => (query.trim() ? searchProducts(categoryScoped, query) : categoryScoped),
    [categoryScoped, query],
  );

  // Scoped to categoryScoped (the current category/subcategory), not the
  // whole catalogue -- a suggestion should never point outside where the
  // user is currently browsing.
  const searchSuggestion = useMemo(
    () => (query.trim() ? getSearchSuggestion(categoryScoped, query) : null),
    [categoryScoped, query],
  );

  const visible = useMemo(() => {
    const filtered = searched.filter((p) => {
      const passesFilters = Object.entries(validActiveFilters).every(([groupId, requiredValues]) => {
        if (!requiredValues.length) return true;
        if (groupId === "price") {
          if (typeof p.priceAmount !== "number") return false;
          return requiredValues.some((v) => priceBuckets.find((b) => b.value === v)?.test(p.priceAmount!));
        }
        const productValues = p.filterAttributes?.[groupId] || [];
        return requiredValues.some((v) => productValues.includes(v));
      });

      return passesFilters;
    });
    return sortProducts(filtered, sort);
  }, [searched, sort, validActiveFilters, priceBuckets]);

  // On mobile the subcategory nav scrolls horizontally; when a subcategory
  // page loads (including via browser Back/Forward), bring its active icon
  // into view instead of leaving the user to discover it's off-screen.
  const activeSubcategoryRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (activeSubcategoryHandle) {
      activeSubcategoryRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeSubcategoryHandle]);

  const FilterList = () => {
    if (filterGroups.length === 0) return null;
    return (
      <div className="flex flex-col gap-8">
        {filterGroups.map((group) => (
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
        {/* White navigation area: main category heading + subcategory icon
            row. Stays on the page's default white background -- the visual
            handoff to the catalogue's #F5F5F7 body happens right at the
            subcategory nav's own divider below, not before it. */}
        <div className="mx-auto w-full max-w-[1600px] px-5 pt-10 sm:px-8 sm:pt-12 lg:px-12 lg:pt-16">
          <header className="max-w-2xl mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-medium leading-tight tracking-tight text-foreground">
              {isAllProducts ? "All Products" : missingMapping ? missingMapping : (mainCategoryTitle ?? taxonomyMatch?.node.title)}
            </h1>
            {isAllProducts && (
              <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted-foreground">
                {DESCRIPTION}
              </p>
            )}
          </header>

          {showSubcategoriesNav && (
            <nav aria-label="Lineup" className="mt-4 sm:mt-6 border-b border-border pb-4 sm:pb-8">
              {/*
                overflow-x-auto below is required for the horizontal scroll
                on mobile, but per the CSS overflow spec a non-"visible"
                overflow-x forces overflow-y to become "auto" too -- there is
                no way to scroll one axis while leaving the other truly
                unclipped. That turned this <ul> into a vertical clipping
                box: it already had pb-4 for bottom breathing room but no
                top padding, so the active item's ring (ring-2
                ring-offset-2, ~4px outward) had nowhere to render above the
                icon and got clipped at the top edge. pt-4 mirrors the
                existing pb-4 so the ring clears on every side; the nav's
                top margin above is reduced by the same amount (mt-8 ->
                mt-4, sm:mt-10 -> sm:mt-6) so the icon row's on-screen
                position is unchanged -- only the invisible padding buffer
                around it grew.

                The px / negative-mx pair below breaks the <ul> out to full
                viewport width and re-applies the SAME padding the parent
                container already
                has (px-5/sm:px-8/lg:px-12) directly on the scrolling element
                itself. Without this, that padding only ever affected the
                <ul>'s resting position -- the horizontally-scrolled CONTENT
                had no trailing gutter of its own, so the last item landed
                flush against the viewport margin with zero breathing room
                once scrolled into view (looking cut off). Since -mx+px
                cancel out, the resting position is pixel-identical to
                before at every breakpoint; this only matters once the row
                actually needs to scroll, which desktop's max-w-[1600px]
                layout never does for a normal-length subcategory list.
              */}
              <ul className="flex items-start justify-start gap-6 sm:gap-10 overflow-x-auto pt-4 pb-4 px-5 -mx-5 sm:px-8 sm:-mx-8 lg:px-12 lg:-mx-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
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
                          <div className="size-14 sm:size-16 flex items-center justify-center transition-transform duration-300 group-hover:-translate-y-1">
                            {collectionsLoading ? (
                              <div className="w-full h-full rounded-xl bg-muted animate-pulse" aria-hidden />
                            ) : getCollectionImage(node.handle || "") ? (
                              <img src={getCollectionImage(node.handle || "")!} alt={c} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                            ) : (
                              <div className="w-full h-full rounded-xl bg-muted/50" aria-hidden />
                            )}
                          </div>
                          <span className="text-[11px] sm:text-xs font-medium text-foreground/80 group-hover:text-foreground text-center leading-tight">
                            {c}
                          </span>
                        </button>
                      </li>
                    )
                  })
                ) : mainCategoryTitle ? (
                  Object.values(TAXONOMY[mainCategoryTitle].subcategories).map((sub: any) => {
                    if (!sub.handle) return null;
                    const isActive = sub.handle === activeSubcategoryHandle;
                    return (
                      <li
                        key={sub.title}
                        ref={isActive ? activeSubcategoryRef : undefined}
                        className="snap-center shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => setCollection(sub.handle)}
                          aria-current={isActive ? "page" : undefined}
                          className="group flex flex-col items-center gap-2 w-20 sm:w-24 focus:outline-none"
                        >
                          <div
                            className={cn(
                              "size-14 sm:size-16 flex items-center justify-center rounded-xl transition-transform duration-300 group-hover:-translate-y-1",
                              isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                            )}
                          >
                            {collectionsLoading ? (
                              <div className="w-full h-full rounded-xl bg-muted animate-pulse" aria-hidden />
                            ) : getCollectionImage(sub.handle || "") ? (
                              <img src={getCollectionImage(sub.handle || "")!} alt={sub.title} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                            ) : (
                              <div className="w-full h-full rounded-xl bg-muted/50" aria-hidden />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-[11px] sm:text-xs text-center leading-tight",
                              isActive ? "font-semibold text-foreground" : "font-medium text-foreground/80 group-hover:text-foreground",
                            )}
                          >
                            {sub.title}
                          </span>
                          <span
                            aria-hidden
                            className={cn("h-0.5 w-6 rounded-full transition-colors", isActive ? "bg-primary" : "bg-transparent")}
                          />
                        </button>
                      </li>
                    );
                  })
                ) : null}
                {/* Trailing spacer, not more container padding: Chromium and
                    WebKit both drop an overflow container's OWN padding at
                    the scrolled-to-end edge (Firefox honors it, which is why
                    the px-5/-mx-5 pair above alone wasn't reliably enough on
                    the mobile browsers that matter here) -- padding on the
                    scroll box itself isn't part of its scrollable content.
                    A real empty flex child IS part of that content, so the
                    browser scrolls to reveal it every time, guaranteeing the
                    last real item (e.g. "Printer") always has genuine
                    breathing room past its right edge. Zero height (no
                    inner content), so the row's own height is unaffected. */}
                <li aria-hidden className="w-px shrink-0 sm:w-2" />
              </ul>
            </nav>
          )}
        </div>

        {/* Catalogue body: search/sort, filters and the product grid all
            live on #F5F5F7, full-bleed edge to edge, with the product cards
            themselves floating on top in white -- see ProductCard.tsx. */}
        <div className="bg-[#F5F5F7]">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-16">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-9 bg-white" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
              <div className="flex items-center gap-2">
                {filterGroups.length > 0 && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 bg-white text-sm font-medium"
                      >
                        <SlidersHorizontal className="size-4" aria-hidden />
                        <span className="hidden sm:inline">Filter</span>
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
                      <SheetHeader className="flex-row items-center justify-between space-y-0">
                        <SheetTitle>Filter</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6">
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="mb-6 text-sm font-medium text-primary hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                        <FilterList />
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
                <Select value={sort} onValueChange={(value) => setSort(value as ProductSort)}>
                  <SelectTrigger className="h-9 w-[140px] sm:w-[200px] text-sm bg-white">
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

          {/* No permanent sidebar -- filters live in the Filter sheet above.
              The grid now uses the full catalogue width (see the desktop
              4-column class below), the same breakpoints (md/lg) already
              used elsewhere on this page rather than a new one-off value. */}
          <div className="mt-8 sm:mt-10">
            <div>
              {missingMapping ? (
                <div className="py-16 sm:py-20 text-center border rounded-2xl bg-secondary/20">
                  <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <PackageSearch className="size-6" aria-hidden />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-medium text-foreground mb-2">This collection is coming soon</h3>
                  <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                    We're curating something special for this category. In the meantime, explore our other collections or get in touch and we'll help you find what you need.
                  </p>
                  <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button asChild>
                      <Link to="/products">Browse all products</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/contact-us">Talk to us</Link>
                    </Button>
                  </div>
                </div>
              ) : catalogue.length === 0 ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
                  {/* Skeletons while loading */}
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse flex flex-col gap-4">
                      <div className="aspect-square bg-secondary rounded-2xl"></div>
                      <div className="h-4 bg-secondary rounded w-3/4"></div>
                      <div className="h-4 bg-secondary rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : visible.length === 0 && query ? (
                <div>
                  <p className="text-sm text-muted-foreground">
                    No products found for "{query}".
                  </p>
                  {searchSuggestion && (
                    <button
                      type="button"
                      onClick={() => setQuery(searchSuggestion)}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      Did you mean "{searchSuggestion}"?
                    </button>
                  )}
                </div>
              ) : visible.length === 0 && Object.keys(validActiveFilters).length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  No products match your search or filters. Try adjusting them.
                </p>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  There are currently no products available in this category.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
                  {visible.map((p) => (
                    <ProductCard key={p.slug} product={p} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}


