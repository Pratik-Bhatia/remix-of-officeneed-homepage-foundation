import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { getPromotionForProduct } from "@/config/promotions";
import { formatMoney } from "@/lib/shopify";
import type { CouponPreview } from "@/lib/coupon-preview";
import { previewCouponForLine, useCartStore } from "@/stores/cartStore";
import { useCouponStore } from "@/stores/couponStore";

type Phase = "idle" | "loading" | "applied" | "not-applicable" | "error";

/**
 * PDP "Apply Code" for a campaign code. Clicking asks Shopify (a throwaway
 * cart for this exact variant + quantity, see previewCouponForLine) what the
 * code does to this line -- the discounted price shown is Shopify's own
 * calculation, never ours. On success the code is remembered as the shopper's
 * selected coupon so Add to Cart / Buy Now carry it into the real Shopify
 * cart / checkout, where Shopify validates it again.
 *
 * Shopify only answers "applicable or not": an invalid, expired, used-up,
 * below-minimum-order or not-covering-this-product code all look the same,
 * so the not-applicable message names the possibilities instead of guessing.
 * Renders nothing for products outside the promoted collections.
 */
export function ProductCouponOffer({
  collectionHandles,
  variantId,
  quantity,
}: {
  collectionHandles: string[] | undefined;
  variantId: string | undefined;
  quantity: number;
}) {
  const promo = getPromotionForProduct(collectionHandles);
  const selected = useCouponStore((s) => !!promo && s.selectedCode === promo.code);
  const selectCoupon = useCouponStore((s) => s.select);
  const clearCoupon = useCouponStore((s) => s.clear);
  const hasCart = useCartStore((s) => !!s.cartId && s.items.length > 0);
  const bagHasCode = useCartStore((s) =>
    promo ? s.discountCodes.some((d) => d.applicable && d.code.toUpperCase() === promo.code) : false,
  );
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode);
  const removeDiscountCode = useCartStore((s) => s.removeDiscountCode);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<CouponPreview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // De-duplication + stale-response guards: one request per (variant, qty, code),
  // and only the latest request is allowed to update the UI.
  const inflightKey = useRef<string | null>(null);
  const verifiedKey = useRef<string | null>(null);
  const seq = useRef(0);

  const key = promo && variantId ? `${variantId}|${quantity}|${promo.code}` : null;

  const verify = async (): Promise<CouponPreview | null> => {
    if (!promo || !variantId || !key) return null;
    if (inflightKey.current === key) return null; // identical request already running
    inflightKey.current = key;
    const mine = ++seq.current;
    setPhase("loading");
    setNote(null);
    const result = await previewCouponForLine({ code: promo.code, variantId, quantity });
    if (inflightKey.current === key) inflightKey.current = null;
    if (mine !== seq.current) return null; // a newer request superseded this one
    setPreview(result);
    if (result.status === "applied") {
      verifiedKey.current = key;
      setPhase("applied");
    } else if (result.status === "not-applicable") {
      verifiedKey.current = null;
      clearCoupon(); // never carry a code Shopify just declined
      setPhase("not-applicable");
    } else {
      verifiedKey.current = null;
      setPhase("error");
    }
    return result;
  };

  const onApply = async () => {
    if (phase === "loading" || !promo) return;
    const result = await verify();
    if (result?.status !== "applied") return;
    selectCoupon(promo.code);
    // If the shopper already has a bag, attach the code to it too -- Shopify
    // re-validates it against the whole cart and the result decides the note.
    if (hasCart && !bagHasCode) {
      const r = await applyDiscountCode(promo.code);
      setNote(r.ok ? "Also applied to your bag." : `Not applied to your bag: ${r.message}`);
    }
  };

  const onRemove = async () => {
    if (!promo) return;
    seq.current++;
    clearCoupon();
    verifiedKey.current = null;
    setPreview(null);
    setNote(null);
    setPhase("idle");
    if (bagHasCode) await removeDiscountCode(promo.code);
  };

  // Re-verify with Shopify when the variant or quantity changes while a coupon is selected
  // (also restores the applied state after navigating away and back).
  useEffect(() => {
    if (!selected || !key || verifiedKey.current === key) return;
    const t = window.setTimeout(() => { void verify(); }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key]);

  if (!promo) return null;

  const busy = phase === "loading";
  const applied = phase === "applied" && preview?.status === "applied";
  const eligible = `Eligible ${promo.eligibleLabel} only.`;

  return (
    <div data-coupon-offer className="-mt-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:gap-x-3">
        <p className="flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:tracking-[0.14em]">Exclusive offer</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="text-sm font-semibold tracking-[0.08em] text-foreground">{promo.code}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={busy || applied || !variantId}
            aria-busy={busy}
            className={
              applied
                ? "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-green-700/40 bg-green-50 px-3.5 text-xs font-semibold text-green-800 sm:min-h-8"
                : "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 sm:min-h-8"
            }
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Applying…
              </>
            ) : applied ? (
              <>
                Applied <Check className="size-3.5" aria-hidden />
              </>
            ) : (
              "Apply Code"
            )}
          </button>
          {applied ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground sm:min-h-8"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {applied && preview.status === "applied" ? (
        <div className="mt-1.5" role="status">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(preview.discountedTotal, preview.currencyCode)}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {formatMoney(preview.originalTotal, preview.currencyCode)}
            </span>
            <span className="text-xs font-semibold text-green-800">
              You save {formatMoney(preview.savings, preview.currencyCode)}
            </span>
          </p>
          {preview.quantity > 1 || note ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {[preview.quantity > 1 ? `For ${preview.quantity} items.` : null, note].filter(Boolean).join(" ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p role="status" className={`mt-1 text-xs leading-snug ${phase === "not-applicable" || phase === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {phase === "not-applicable"
            ? `${promo.code} can't be applied to this item and quantity. It may have expired, reached its usage limit, need a larger order, or not cover this product.`
            : phase === "error"
              ? preview?.status === "error"
                ? preview.message
                : "Couldn't check this code. Please try again."
              : busy
                ? "Applying code…"
                : eligible}
        </p>
      )}
    </div>
  );
}
