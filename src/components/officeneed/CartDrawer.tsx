import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/shopify";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { CartLineItem } from "@/components/officeneed/CartLineItem";
import { CartProfileLinks } from "@/components/officeneed/CartProfileLinks";
import { DiscountCodeInput } from "@/components/officeneed/DiscountCodeInput";

export function CartDrawer({ triggerClassName }: { triggerClassName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const syncCart = useCartStore((s) => s.syncCart);
  const prepareCheckout = useCartStore((s) => s.prepareCheckout);
  const cost = useCartStore((s) => s.cost);
  const isLoading = useCartStore((s) => s.isLoading);
  const isSyncing = useCartStore((s) => s.isSyncing);
  const [preparing, setPreparing] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemSubtotal = items.reduce(
    (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
    0,
  );
  const currency = cost.subtotal?.currencyCode ?? items[0]?.price.currencyCode ?? "INR";
  const discountedSubtotal = cost.subtotal ? parseFloat(cost.subtotal.amount) : itemSubtotal;
  const discount = Math.max(0, itemSubtotal - discountedSubtotal);
  const finalTotal = cost.total ? parseFloat(cost.total.amount) : discountedSubtotal;

  const handleCheckout = async () => {
    const win = window.open("", "_blank");
    setPreparing(true);
    try {
      const checkoutUrl = await prepareCheckout();
      if (!checkoutUrl) {
        win?.close();
        return;
      }
      if (win) win.location.href = checkoutUrl;
      else window.open(checkoutUrl, "_blank");
    } finally {
      setPreparing(false);
    }
  };

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

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open shopping bag"
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

              {/* Header Row -- Review Cart sits at the same horizontal level
                  as the heading (Apple's "Review Bag" placement), not as a
                  second action stacked under the cart items. It's the only
                  primary action this drawer offers; Checkout itself lives on
                  the full cart page. */}
              <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
                <h2 className="text-xl md:text-[26px] font-medium tracking-tight text-foreground">
                  {items.length === 0 ? "Your Bag is Empty" : "Your Bag"}
                </h2>
                <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                  {items.length > 0 && (
                    <Link
                      to="/cart"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-[12px] md:text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                    >
                      Review Cart
                    </Link>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-full p-2 -mr-2 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close shopping bag"
                  >
                    <X className="size-5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col min-h-[300px]">
                  <p className="text-[13px] md:text-sm text-muted-foreground">
                    Items you add will appear here.
                  </p>

                  <Link
                    to="/products"
                    onClick={() => setIsOpen(false)}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-foreground py-3.5 text-[14px] md:text-[15px] font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    Continue Shopping
                  </Link>

                  <div className="mt-8 md:mt-10">
                    <CartProfileLinks onNavigate={() => setIsOpen(false)} />
                  </div>
                </div>
              ) : (
                // The whole body (items + actions + profile links + continue
                // shopping) scrolls together as one region, bounded to a
                // reasonable viewport-relative height -- so on a short
                // viewport (mobile, or a full cart) everything stays
                // reachable by scrolling the drawer itself rather than the
                // profile section getting pushed off-screen or the drawer
                // growing taller than the viewport.
                <div className="max-h-[75vh] overflow-y-auto pr-2" data-scrollable="true">
                  <div className="space-y-5">
                    {items.map((item) => (
                      <CartLineItem
                        key={item.variantId}
                        item={item}
                        onIncrease={() => updateQuantity(item.variantId, item.quantity + 1)}
                        onDecrease={() => updateQuantity(item.variantId, item.quantity - 1)}
                        onRemove={() => removeItem(item.variantId)}
                      />
                    ))}
                  </div>

                  <div className="mt-6">
                    <DiscountCodeInput />
                  </div>

                  <div className="mt-6 rounded-2xl border border-border p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-medium text-foreground">Subtotal</span>
                      <span className="text-[17px] font-medium tabular-nums text-foreground">
                        {formatMoney(itemSubtotal, currency)}
                      </span>
                    </div>
                    {discount > 0.009 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="tabular-nums text-foreground">−{formatMoney(discount, currency)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-border pt-5">
                      <span className="text-[15px] font-medium text-foreground">Total</span>
                      <span className="text-[17px] font-medium tabular-nums text-foreground">
                        {formatMoney(finalTotal, currency)}
                      </span>
                    </div>
                    <button
                      onClick={handleCheckout}
                      disabled={isLoading || isSyncing || preparing}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[15px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                    >
                      {isLoading || isSyncing || preparing ? <Loader2 className="size-4 animate-spin" /> : "Checkout"}
                    </button>
                  </div>

                  <div className="mt-6 border-t border-border pt-6">
                    <CartProfileLinks onNavigate={() => setIsOpen(false)} />
                  </div>

                  <div className="mt-2 px-2">
                    <Link
                      to="/products"
                      onClick={() => setIsOpen(false)}
                      className="inline-block py-2 text-[13px] md:text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Continue Shopping
                    </Link>
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
