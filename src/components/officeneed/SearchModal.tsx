import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, ArrowRight } from "lucide-react";
import { products } from "@/lib/products";
import { cn } from "@/lib/utils";

import { primaryNavCategories, navCategoryTarget } from "@/lib/navigation";

const quickLinks = [
  { label: "All Products", to: "/products", search: {} },
  ...primaryNavCategories.map((cat) => ({
    label: cat.label,
    to: "/products",
    search: navCategoryTarget(cat.id),
  })),
];

import { useShopifyCatalogue } from "@/lib/shopify-overlay";
import { useQuery } from "@tanstack/react-query";

export function SearchModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const catalogue = useShopifyCatalogue(products);
  
  // Read the query state from the same cache key used by useShopifyCatalogue
  const { isLoading, isError } = useQuery({ queryKey: ["shopify", "catalog"] });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      lockScroll();
    } else {
      unlockScroll();
      setQuery("");
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

  const normalizedQuery = query.trim().toLowerCase();
  
  // Find matching categories
  const matchingCategories = normalizedQuery 
    ? primaryNavCategories.filter(cat => 
        cat.label.toLowerCase().includes(normalizedQuery) || 
        cat.items.some(i => i.toLowerCase().includes(normalizedQuery))
      ).slice(0, 2)
    : [];

  const searchResults = normalizedQuery
    ? catalogue
        .filter(
          (p) =>
            p.name.toLowerCase().includes(normalizedQuery) ||
            p.category.toLowerCase().includes(normalizedQuery) ||
            (p.subcategories && p.subcategories.some(s => s.toLowerCase().includes(normalizedQuery)))
        )
        .slice(0, 5)
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col">
      {/* Blurred Backdrop */}
      <div 
        className="absolute inset-0 bg-background/50 backdrop-blur-xl transition-opacity duration-300 animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Main Content Dropdown */}
      <div 
        className="relative mt-[64px] lg:mt-[80px] w-full bg-background/95 backdrop-blur-md border-b border-border shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] animate-in slide-in-from-top-4 fade-in duration-300 overflow-hidden"
      >
        <div className="mx-auto max-w-[700px] px-4 sm:px-6 py-6 md:py-10">
          {/* Input Area */}
          <div className="relative flex items-center">
            <Search className="absolute left-2 size-5 md:size-[22px] text-muted-foreground/70" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search Officeneed"
              className="w-full bg-transparent pl-10 md:pl-11 pr-10 md:pr-11 text-xl md:text-[26px] font-medium tracking-tight outline-none placeholder:text-muted-foreground/40 text-foreground"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button 
              onClick={() => onOpenChange(false)}
              className="absolute right-2 rounded-full p-2 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close search"
            >
              <X className="size-5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Results / Quick Links */}
          <div className="mt-6 md:mt-8 min-h-[300px] max-h-[65vh] overflow-y-auto pr-2" data-scrollable="true">
            {!normalizedQuery ? (
              <div className="animate-in fade-in duration-500">
                <h3 className="text-[11px] font-medium text-muted-foreground mb-3 px-2">Quick Links</h3>
                <ul className="space-y-0.5">
                  {quickLinks.map(link => (
                    <li key={link.label}>
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
                    <h3 className="text-[11px] font-medium text-muted-foreground mb-3 px-2">Categories</h3>
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
                            <span>{cat.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {searchResults.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-medium text-muted-foreground mb-3 px-2">Products</h3>
                    <ul className="space-y-0.5">
                      {searchResults.map(product => (
                        <li key={product.slug}>
                          <Link 
                            to="/products/$slug"
                            params={{ slug: product.slug }}
                            onClick={() => onOpenChange(false)}
                            className="group flex items-center gap-4 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
                          >
                            <div className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-1">
                               <img src={product.images[0]} alt={product.name} className="size-full object-cover mix-blend-multiply" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] md:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">{product.name}</span>
                              <span className="text-[11px] text-muted-foreground">{product.category}</span>
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
                <p className="mt-1 text-[13px] md:text-sm text-muted-foreground">Try checking for spelling errors or try a different term.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


