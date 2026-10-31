import { trackSearch } from "@/lib/meta-pixel";
import { trackGoogleSearch } from "@/lib/google-analytics";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, ArrowRight } from "lucide-react";
import { products } from "@/lib/products";
import { cn } from "@/lib/utils";

import { primaryNavCategories, navCategoryTarget, getLiveNavLabel } from "@/lib/navigation";

import { useShopifyCatalogue, useShopifyCollections, shopifyCatalogueQueryOptions } from "@/lib/shopify-overlay";
import { useBuyerContext } from "@/hooks/useBuyerContext";
import { useB2BStore } from "@/stores/b2bStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { searchProducts, getSearchSuggestion } from "@/lib/search";

export function SearchModal({
  open,
  onOpenChange,
  anchorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sticky site header. The panel opens flush with its real bottom
   * edge -- which moves with the promo bar above it (shown at the top of
   * the page, scrolled away later), so it can't be a fixed offset. */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [anchorTop, setAnchorTop] = useState(0);
  // Browsers clip (not ellipsize) a placeholder, so phones get a shorter one.
  const isMobile = useIsMobile();

  // Measured before paint so the panel never flashes at the wrong offset.
  // lockScroll() blocks scrolling without moving layout, so this stays
  // valid while open; only a resize (or rotation) can change it.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setAnchorTop(Math.max(0, Math.round(anchorRef?.current?.getBoundingClientRect().bottom ?? 0)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef]);
  // Search's quick results never show price (just image/name/category), so
  // pricesReady isn't consulted here -- no buyer-dependent content to gate.
  // Mounted in the navbar on every page: only download the full catalogue once search is opened.
  const [searchWanted, setSearchWanted] = useState(false);
  useEffect(() => {
    if (open) setSearchWanted(true);
  }, [open]);
  const searchEnabled = open || searchWanted;
  const { products: catalogue } = useShopifyCatalogue(products, { enabled: searchEnabled });
  const { collections } = useShopifyCollections();

  // Built here (not at module scope) so each entry's label can resolve the
  // live Shopify collection title -- same cached query every other nav
  // surface already uses.
  const quickLinks = [
    { label: "All Products", to: "/products" as const, search: {} },
    ...primaryNavCategories.map((cat) => ({
      label: getLiveNavLabel(collections, cat.label),
      to: "/products" as const,
      search: navCategoryTarget(cat.id),
    })),
  ];

  // Relevance scoring (tokenizing + fuzzy fallback) is more work than the
  // old plain substring filter, so live-typing suggestions are debounced --
  // pressing Enter still searches immediately via handleKeyDown, unaffected.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Meta Search event: once the shopper pauses typing (not every keystroke).
  const lastTrackedSearch = useRef("");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      if (q.toLowerCase() === lastTrackedSearch.current) return;
      lastTrackedSearch.current = q.toLowerCase();
      trackSearch(q);
      trackGoogleSearch(q);
    }, 1200);
    return () => clearTimeout(id);
  }, [query]);

  // Read the query state from the same cache key used by useShopifyCatalogue
  const buyer = useBuyerContext();
  const customerId = useB2BStore((s) => s.customerId);
  const { isLoading, isError } = useQuery({ ...shopifyCatalogueQueryOptions(buyer, customerId), enabled: searchEnabled });


  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      lockScroll();
    } else {
      unlockScroll();
      setQuery("");
      setDebouncedQuery("");
    }
    return () => { unlockScroll(); };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      onOpenChange(false);
      navigate({ to: "/products", search: { q: query.trim() } as any });
    }
  };

  // ArrowDown/ArrowUp move between the input and the visible result links
  // (Tab order is unchanged). The input itself keeps Up/Down otherwise.
  const handlePanelArrows = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(resultsRef.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    if (e.key === "ArrowDown") items[at < 0 ? 0 : Math.min(at + 1, items.length - 1)]?.focus();
    else if (at <= 0) inputRef.current?.focus();
    else items[at - 1]?.focus();
  };

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedDebouncedQuery = debouncedQuery.trim().toLowerCase();

  // Find matching categories (cheap, kept on the un-debounced query for
  // instant feedback -- this is still a plain substring check, not scoring).
  const matchingCategories = normalizedQuery
    ? primaryNavCategories.filter(cat =>
        cat.label.toLowerCase().includes(normalizedQuery) ||
        getLiveNavLabel(collections, cat.label).toLowerCase().includes(normalizedQuery) ||
        cat.items.some(i =>
          i.toLowerCase().includes(normalizedQuery) ||
          getLiveNavLabel(collections, i).toLowerCase().includes(normalizedQuery),
        )
      ).slice(0, 2)
    : [];

  // Relevance-ranked, typo-tolerant search over the already-loaded catalogue
  // (see src/lib/search.ts), debounced so it isn't re-run on every keystroke.
  const searchResults = useMemo(
    () => (normalizedDebouncedQuery ? searchProducts(catalogue, debouncedQuery).slice(0, 5) : []),
    [catalogue, normalizedDebouncedQuery, debouncedQuery],
  );

  const searchSuggestion = useMemo(
    () => (normalizedDebouncedQuery && searchResults.length === 0 ? getSearchSuggestion(catalogue, debouncedQuery) : null),
    [catalogue, normalizedDebouncedQuery, debouncedQuery, searchResults.length],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Soft frosted dim behind the panel -- the page stays recognizable.
          Sits under the z-50 header, so the header stays crisp and
          clickable. Without backdrop-filter support: a plain light dim. */}
      <div
        className="absolute inset-0 bg-foreground/15 supports-[backdrop-filter]:bg-foreground/10 supports-[backdrop-filter]:backdrop-blur-[5px] animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel: flush with the header's real bottom edge, frosted glass
          (near-opaque white fallback without backdrop-filter), sized to
          its content and never taller than the space left. The input
          inside keeps its own opaque background, so it is never blurred. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="absolute inset-x-0 flex flex-col border-b border-black/[0.08] bg-background/95 shadow-[0_12px_32px_rgba(0,0,0,0.08)] supports-[backdrop-filter]:bg-background/[0.78] supports-[backdrop-filter]:backdrop-blur-[18px] supports-[backdrop-filter]:backdrop-saturate-150 animate-in slide-in-from-top-2 fade-in duration-200"
        style={{ top: anchorTop, maxHeight: `calc(100dvh - ${anchorTop}px)` }}
        onKeyDown={handlePanelArrows}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-col px-4 py-4 sm:px-6 md:py-5">
          {/* Input */}
          <div className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-border bg-background pl-4 pr-1.5 transition-colors focus-within:border-foreground/50 md:h-14">
            <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              aria-label="Search products"
              enterKeyHint="search"
              placeholder={isMobile ? "Search products & brands..." : "Search products, brands and categories..."}
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-lg"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              aria-label="Close search"
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
          </div>

          {/* Results / Quick Links */}
          <div ref={resultsRef} className="mt-4 min-h-0 overflow-y-auto overscroll-contain" data-scrollable="true">
            {!normalizedQuery ? (
              <div className="animate-in fade-in duration-300">
                <h3 className="text-eyebrow mb-2 px-2 text-muted-foreground">Quick Links</h3>
                <ul className="space-y-0.5">
                  {quickLinks.map((link, i) => (
                    <li key={i}>
                      <Link 
                        to={link.to} 
                        search={link.search as any}
                        onClick={() => onOpenChange(false)}
                        className="group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <ArrowRight className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={2} />
                        <span>{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : isError ? (
              <div className="flex h-[150px] flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <p className="text-base md:text-lg font-medium text-foreground">Search couldn't be completed.</p>
                <p className="mt-1 text-[13px] md:text-sm text-muted-foreground">Please try again.</p>
              </div>
            ) : isLoading ? (
              <div className="flex h-[150px] flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
                <p className="text-[13px] md:text-sm text-muted-foreground">Searching catalog...</p>
              </div>
            ) : searchResults.length > 0 || matchingCategories.length > 0 ? (
              <div className="animate-in fade-in duration-300">
                {matchingCategories.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-eyebrow mb-2 px-2 text-muted-foreground">Categories</h3>
                    <ul className="space-y-0.5">
                      {matchingCategories.map(cat => (
                        <li key={cat.id}>
                          <Link 
                            to="/products"
                            search={navCategoryTarget(cat.id) as any}
                            onClick={() => onOpenChange(false)}
                            className="group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                          >
                            <ArrowRight className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={2} />
                            <span>{getLiveNavLabel(collections, cat.label)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {searchResults.length > 0 && (
                  <div>
                    <h3 className="text-eyebrow mb-2 px-2 text-muted-foreground">Products</h3>
                    <ul className="space-y-0.5">
                      {searchResults.map(product => (
                        <li key={product.slug}>
                          <Link 
                            to="/products/$slug"
                            params={{ slug: product.slug }}
                            preload="intent"
                            onClick={() => onOpenChange(false)}
                            className="group flex items-center gap-4 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
                          >
                            <div className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-1">
                               <img src={product.images[0]} alt={product.name} className="size-full object-cover mix-blend-multiply" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] md:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">{product.name}</span>
                              <span className="text-[11px] text-muted-foreground">{getLiveNavLabel(collections, product.category)}</span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-5 border-t border-border pt-5 px-2">
                  <Link 
                    to="/products"
                    search={{ q: query.trim() } as any}
                    onClick={() => onOpenChange(false)}
                    className="group flex items-center text-[13px] md:text-sm font-medium text-primary hover:underline"
                  >
                    See all results for "{query}" 
                    <ArrowRight className="ml-2 size-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex h-[150px] flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <p className="text-base md:text-lg font-medium text-foreground">No results found for "{query}"</p>
                {searchSuggestion ? (
                  <button
                    type="button"
                    onClick={() => setQuery(searchSuggestion)}
                    className="mt-1 text-[13px] md:text-sm font-medium text-primary hover:underline"
                  >
                    Did you mean "{searchSuggestion}"?
                  </button>
                ) : (
                  <p className="mt-1 text-[13px] md:text-sm text-muted-foreground">Try checking for spelling errors or try a different term.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


