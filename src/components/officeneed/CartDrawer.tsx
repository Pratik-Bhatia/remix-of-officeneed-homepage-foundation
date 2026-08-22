import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, Minus, Plus, Trash2, Loader2, Package, Bookmark, User, LogIn, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { formatMoney } from "@/lib/shopify";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";

export function CartDrawer({ triggerClassName }: { triggerClassName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const isLoading = useCartStore((s) => s.isLoading);
  const isSyncing = useCartStore((s) => s.isSyncing);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const getCheckoutUrl = useCartStore((s) => s.getCheckoutUrl);
  const syncCart = useCartStore((s) => s.syncCart);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let unsubscribe = () => {};
    try {
      void supabase.auth.getSession()
        .then(({ data: { session } }) => setUser(session?.user ?? null))
        .catch(() => setUser(null));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // Keep guest cart browsing available if auth configuration is absent.
      setUser(null);
    }
    return () => unsubscribe();
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
    0,
  );
  const currency = items[0]?.price.currencyCode ?? "INR";

  useEffect(() => {
    if (isOpen) {
      syncCart();
      lockScroll();
      window.dispatchEvent(new CustomEvent("close-overlays", { detail: "cart" }));
    } else {
      unlockScroll();
    }
    return () => unlockScroll();
  }, [isOpen, syncCart]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    const handleCloseOverlays = (e: any) => {
      if (e.detail !== "cart") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    window.addEventListener("close-overlays", handleCloseOverlays);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("close-overlays", handleCloseOverlays);
    };
  }, [isOpen]);

  const handleCheckout = () => {
    const checkoutUrl = getCheckoutUrl();
    if (checkoutUrl) {
      window.open(checkoutUrl, "_blank");
      setIsOpen(false);
    }
  };

  const profileLinks = [
    { icon: Package, label: "Orders", to: "/" },
    { icon: Bookmark, label: "Your Saves", to: "/" },
    { icon: User, label: "Account", to: "/" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Cart, ${totalItems} item${totalItems === 1 ? "" : "s"}`}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-200 hover:text-primary",
          triggerClassName,
        )}
      >
        <ShoppingBag className="size-5 md:size-[22px] xl:size-5" strokeWidth={1.5} />
        {totalItems > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold leading-4 text-primary-foreground">
            {totalItems}
          </span>
        ) : null}
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-40 flex flex-col">
          {/* Blurred Backdrop */}
          <div 
            className="absolute inset-0 bg-background/50 backdrop-blur-xl transition-opacity duration-300 animate-in fade-in"
            onClick={() => setIsOpen(false)}
          />

          {/* Main Content Dropdown */}
          <div 
            className="relative mt-[64px] lg:mt-[80px] w-full bg-background/95 backdrop-blur-md border-b border-border shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] animate-in slide-in-from-top-4 fade-in duration-300 overflow-hidden"
          >
            <div className="mx-auto max-w-[700px] px-4 sm:px-6 py-6 md:py-10">
              
              {/* Header Row */}
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-xl md:text-[26px] font-medium tracking-tight text-foreground">
                  {items.length === 0 ? "Your Bag is empty." : "Your Bag"}
                </h2>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="rounded-full p-2 -mr-2 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close bag"
                >
                  <X className="size-5" strokeWidth={1.5} />
                </button>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col min-h-[300px]">
                  {!user && (
                    <p className="mt-1 md:mt-2 text-[13px] md:text-sm text-muted-foreground">
                      <button onClick={() => {
                        setIsOpen(false);
                        window.dispatchEvent(new CustomEvent("open-auth-modal"));
                      }} className="text-foreground underline underline-offset-4 font-medium hover:text-primary transition-colors">Sign in</button> to see if you have any saved items.
                    </p>
                  )}

                  <div className="mt-8 md:mt-10">
                    <h3 className="text-[11px] font-medium text-muted-foreground mb-3 px-2">My Profile</h3>
                    <ul className="space-y-0.5">
                      {profileLinks.map(link => (
                        <li key={link.label}>
                          <Link 
                            to={link.to} 
                            onClick={() => setIsOpen(false)}
                            className="group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                          >
                            <link.icon className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={1.5} />
                            <span>{link.label}</span>
                          </Link>
                        </li>
                      ))}
                      {!user && (
                        <li>
                          <button 
                            onClick={() => {
                              setIsOpen(false);
                              window.dispatchEvent(new CustomEvent("open-auth-modal"));
                            }}
                            className="w-full group flex items-center rounded-md px-2 py-1.5 text-[13px] md:text-[14px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors"
                          >
                            <LogIn className="mr-3 size-3.5 text-muted-foreground/40 transition-colors group-hover:text-foreground" strokeWidth={1.5} />
                            <span>Sign in</span>
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col min-h-[300px] max-h-[70vh]">
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4" data-scrollable="true">
                    {items.map((item) => {
                      const image = item.product.node.images?.edges?.[0]?.node;
                      return (
                        <div key={item.variantId} className="flex gap-5 border-b border-border/50 pb-4 last:border-0">
                          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-2">
                            {image ? (
                              <img
                                src={image.url}
                                alt={image.altText ?? item.product.node.title}
                                className="size-full object-cover mix-blend-multiply"
                              />
                            ) : <ShoppingBag className="size-8 text-muted-foreground/20" />}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <h4 className="text-[14px] md:text-[15px] font-medium text-foreground line-clamp-1">{item.product.node.title}</h4>
                            {item.selectedOptions.length > 0 ? (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {item.selectedOptions.map((o) => o.value).join(" | ")}
                              </p>
                            ) : null}
                            
                            <div className="mt-3 flex items-center gap-4">
                              <div className="flex items-center gap-3">
                                <button
                                  aria-label="Decrease quantity"
                                  onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Minus className="size-3.5" strokeWidth={2} />
                                </button>
                                <span className="text-[13px] font-medium w-4 text-center">{item.quantity}</span>
                                <button
                                  aria-label="Increase quantity"
                                  onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Plus className="size-3.5" strokeWidth={2} />
                                </button>
                              </div>
                              <button
                                aria-label={`Remove ${item.product.node.title}`}
                                onClick={() => removeItem(item.variantId)}
                                className="text-[11px] md:text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-start justify-end pt-1">
                            <p className="text-[14px] md:text-[15px] font-medium tabular-nums text-foreground">
                              {formatMoney(item.price.amount, item.price.currencyCode)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 border-t border-border pt-6 shrink-0 space-y-5">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[14px] md:text-[15px] font-medium text-foreground">Subtotal</span>
                      <span className="text-[16px] md:text-[17px] font-medium tabular-nums text-foreground">
                        {formatMoney(totalPrice, currency)}
                      </span>
                    </div>
                    <button
                      onClick={handleCheckout}
                      disabled={items.length === 0 || isLoading || isSyncing}
                      className="w-full rounded-full bg-foreground text-background py-3.5 text-[14px] md:text-[15px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isLoading || isSyncing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Check Out"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
