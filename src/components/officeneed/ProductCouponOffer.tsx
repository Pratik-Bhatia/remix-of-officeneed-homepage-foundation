import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getPromotionForProduct } from "@/config/promotions";
import { CopyCodeButton } from "@/components/officeneed/CopyCodeButton";
import { useCartStore } from "@/stores/cartStore";

/** Compact PDP reminder that this product is eligible for a campaign code
 * (the site-wide announcement bar is where the campaign itself is promoted).
 * Renders nothing for any product outside the promoted collections. */
export function ProductCouponOffer({ collectionHandles }: { collectionHandles: string[] | undefined }) {
  const promo = getPromotionForProduct(collectionHandles);
  const hasCart = useCartStore((s) => !!s.cartId && s.items.length > 0);
  const confirmed = useCartStore((s) =>
    promo ? s.discountCodes.some((d) => d.applicable && d.code.toUpperCase() === promo.code) : false,
  );
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  if (!promo) return null;

  const apply = async () => {
    setBusy(true);
    setResult(await applyDiscountCode(promo.code));
    setBusy(false);
  };

  const eligible = `Eligible ${promo.eligibleLabel} only.`;
  // Only Shopify's own response ever produces a "applied" message -- a
  // product page showing a code is never a promise of a discount.
  const helper =
    result && !result.ok
      ? result.message
      : confirmed
        ? `${promo.code} is applied to your bag. Shopify applies it to eligible items only.`
        : hasCart
          ? `${eligible} Apply to your bag, or enter it at checkout.`
          : `${eligible} Apply it in your bag or at checkout.`;

  return (
    <div data-coupon-offer className="-mt-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:gap-x-3">
        <p className="flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:tracking-[0.14em]">Exclusive offer</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="text-sm font-semibold tracking-[0.08em] text-foreground">{promo.code}</span>
        </p>
        <div className="flex items-center gap-2">
          <CopyCodeButton
            code={promo.code}
            idleLabel="Copy code"
            className="min-h-9 rounded-full border border-foreground/70 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground sm:px-3.5 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-8"
          />
          {hasCart && !confirmed ? (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-medium text-foreground underline underline-offset-4 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50 sm:min-h-8"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-label="Applying" /> : "Apply to bag"}
            </button>
          ) : null}
        </div>
      </div>
      <p role="status" className={`mt-1 text-xs leading-snug ${result && !result.ok ? "text-destructive" : "text-muted-foreground"}`}>
        {helper}
      </p>
    </div>
  );
}
