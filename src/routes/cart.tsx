import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { useCartStore, checkoutFailureMessage } from "@/stores/cartStore";
import { trackInitiateCheckout } from "@/lib/meta-pixel";
import { trackGoogleViewCart, trackGoogleBeginCheckout } from "@/lib/google-analytics";
import { formatMoney } from "@/lib/shopify";
import { CartLineItem } from "@/components/officeneed/CartLineItem";
import { CartProfileLinks } from "@/components/officeneed/CartProfileLinks";
import { DiscountCodeInput } from "@/components/officeneed/DiscountCodeInput";
import { DeliveryAddressSelector } from "@/components/officeneed/DeliveryAddressSelector";
import { CartLineSkeleton, LoadingRegion } from "@/components/officeneed/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartRestored } from "@/hooks/useCartRestored";

export const Route = createFileRoute("/cart")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Your Bag — Officeneed" },
      { name: "description", content: "Review the items in your Officeneed bag before checkout." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

/**
 * The full-page "Review Cart" destination. Reuses the exact same cart state
 * (useCartStore) and Shopify checkout URL the drawer uses -- no parallel
 * cart logic. CartLineItem and CartProfileLinks are the same components the
 * drawer renders, so item rows and the account quick-links behave and look
 * identical in both places.
 */
function CartPage() {
  const cartRestored = useCartRestored();
  const items = useCartStore((s) => s.items);
  const isLoading = useCartStore((s) => s.isLoading);
  const isSyncing = useCartStore((s) => s.isSyncing);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const prepareCheckout = useCartStore((s) => s.prepareCheckout);
  const [preparing, setPreparing] = useState(false);

  const cost = useCartStore((s) => s.cost);
  const totalPrice = items.reduce(
    (sum, item) => sum + parseFloat(item.price.amount) * item.quantity,
    0,
  );
  const currency = cost.subtotal?.currencyCode ?? items[0]?.price.currencyCode ?? "INR";
  // Shopify's discounted subtotal is authoritative once available.
  const subtotal = cost.subtotal ? parseFloat(cost.subtotal.amount) : totalPrice;
  const discount = Math.max(0, totalPrice - subtotal);

  const hasTrackedViewCartRef = useRef(false);
  useEffect(() => {
    if (!hasTrackedViewCartRef.current && items.length > 0) {
      hasTrackedViewCartRef.current = true;
      trackGoogleViewCart({
        items: items.map((i) => ({
          variantId: i.variantId,
          name: i.product.node.title,
          price: parseFloat(i.price.amount) || 0,
          currency: i.price.currencyCode,
          quantity: i.quantity,
        })),
        value: subtotal,
      });
    }
  }, [items, subtotal]);

  const handleCheckout = async () => {
    // No delivery-address requirement here, for B2B or B2C: Shopify's own
    // hosted checkout collects shipping/billing exactly as it always has.
    // prepareCheckout() below only ever needed cartId + buyerIdentity
    // (customerAccessToken + companyLocationId, resolved from the
    // customer's own Company Contact relationship) to return a valid
    // checkout URL -- a DeliveryAddressSelector pre-fill (still offered
    // below, still optional) was never one of its requirements.
    // Open the tab synchronously so popup blockers allow it, then point it
    // at the checkout URL once the signed-in customer is attached.
    if (preparing) return;
    const win = window.open("", "_blank");
    setPreparing(true);
    try {
      const result = await prepareCheckout();
      if (result.url === null) {
        win?.close();
        toast.error(checkoutFailureMessage(result.reason));
        return;
      }
      const currentItems = useCartStore.getState().items;
      trackInitiateCheckout(currentItems, subtotal);
      trackGoogleBeginCheckout({
        items: currentItems.map((i) => ({
          variantId: i.variantId,
          name: i.product.node.title,
          quantity: i.quantity,
          price: i.price,
        })),
        value: subtotal,
      });
      if (win) win.location.href = result.url;
      else window.open(result.url, "_blank");
    } catch (error) {
      console.error("Checkout preparation failed:", error);
      win?.close();
      toast.error("Couldn't start checkout. Please try again.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-8">
          <header className="mb-8 sm:mb-10">
            <h1 className="text-3xl sm:text-4xl font-display font-medium tracking-tight text-foreground">
              {cartRestored && items.length === 0 ? "Your Bag is Empty" : "Your Bag"}
            </h1>
          </header>

          {!cartRestored ? (
            // The saved cart isn't readable yet (server render / first frame):
            // placeholders, never a false "empty".
            <LoadingRegion label="Loading your bag">
              <CartLineSkeleton />
              <CartLineSkeleton />
              <Skeleton className="mt-8 h-12 w-full rounded-full sm:ml-auto sm:w-64" />
            </LoadingRegion>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-start">
              <p className="text-sm text-muted-foreground">
                Items you add will appear here.
              </p>
              <Link
                to="/products"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-foreground px-8 py-3.5 text-[15px] font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Continue Shopping
              </Link>
              <div className="mt-12 w-full max-w-xs">
                <CartProfileLinks />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
              <div className="min-w-0 flex-1 space-y-6">
                {items.map((item) => (
                  <CartLineItem
                    key={item.variantId}
                    item={item}
                    onIncrease={() => updateQuantity(item.variantId, item.quantity + 1)}
                    onDecrease={() => updateQuantity(item.variantId, item.quantity - 1)}
                    onRemove={() => removeItem(item.variantId)}
                  />
                ))}

                <Link
                  to="/products"
                  className="inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ShoppingBag className="size-3.5" strokeWidth={1.5} />
                  Continue Shopping
                </Link>
              </div>

              <div className="w-full shrink-0 lg:w-80 space-y-6">
                <DeliveryAddressSelector />

                <div className="rounded-2xl border border-border p-6 space-y-5">
                  <DiscountCodeInput />
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium text-foreground">Subtotal</span>
                    <span className="text-[17px] font-medium tabular-nums text-foreground">
                      {formatMoney(subtotal, currency)}
                    </span>
                  </div>
                  {discount > 0.009 ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="tabular-nums text-foreground">−{formatMoney(discount, currency)}</span>
                    </div>
                  ) : null}
                  <button
                    onClick={handleCheckout}
                    disabled={isLoading || isSyncing || preparing}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3.5 text-[15px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {isLoading || isSyncing || preparing ? <Loader2 className="size-4 animate-spin" /> : "Checkout"}
                  </button>
                </div>

                <div className="border-t border-border pt-8">
                  <CartProfileLinks />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
