import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CATEGORY_PROMOTIONS, type CategoryPromotion } from "@/config/promotions";
import { buildOfferViews, candidateItems, type OfferView } from "@/lib/cart-coupon-offers";
import { resolveEligibility, resolveSavings, type PreviewLine, type SavingsResult } from "@/lib/coupon-preview";
import { formatMoney } from "@/lib/shopify";
import { cn } from "@/lib/utils";
import { useB2BStore, getEffectiveCompanyLocationId } from "@/stores/b2bStore";
import { useCartStore, previewCodesOnLines, couponPreviewScope } from "@/stores/cartStore";
import { DiscountConflictDialog, sameCodes, type DiscountConflict } from "@/components/officeneed/DiscountConflictDialog";

/** Delay before re-checking after the bag changes (the first check runs immediately). */
const REFRESH_DEBOUNCE_MS = 300;

type Feedback = { code: string; ok: boolean; message: string };

function Pulse({ className }: { className: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded bg-foreground/10", className)} />;
}

function OfferSkeleton() {
  return (
    <div className="rounded-2xl border border-dashed border-foreground/15 p-4" aria-hidden>
      <Pulse className="h-2.5 w-20" />
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="space-y-2"><Pulse className="h-6 w-24" /><Pulse className="h-3 w-36" /></div>
        <Pulse className="h-10 w-28 rounded-full" />
      </div>
      <Pulse className="mt-3 h-3 w-48" />
    </div>
  );
}

function checkoutNote(promo: CategoryPromotion): string {
  return promo.oncePerCustomer ? `${promo.terms ?? "One use per customer."} Shopify confirms this at checkout.` : promo.terms ?? "";
}

/**
 * Cart coupon offers (OFFICENEED10 / OFFICENEED20), shared by the cart drawer
 * and the cart page. Every eligibility answer, saving and applied state comes
 * from Shopify: cached per-variant previews decide which offers to show (and
 * the eligible item count), Shopify-priced whole-bag previews compare two
 * offers (and seed the eligibility cache, so one preview answers both), and
 * once applied the real cart's own per-line discount allocations are shown.
 * Applying goes through applyDiscountCodeChecked (one discount change at a
 * time, store-wide), so an existing discount is never replaced without the
 * shopper confirming in DiscountConflictDialog.
 */
export function CartCouponOffer() {
  const items = useCartStore((s) => s.items);
  const cartId = useCartStore((s) => s.cartId);
  const discountCodes = useCartStore((s) => s.discountCodes);
  const discountBusy = useCartStore((s) => s.discountBusy);
  const applyChecked = useCartStore((s) => s.applyDiscountCodeChecked);
  const replaceCode = useCartStore((s) => s.replaceDiscountCode);
  const removeCode = useCartStore((s) => s.removeDiscountCode);
  // Re-evaluate when the shopper switches Personal <-> Business shopping.
  const effectiveLocation = useB2BStore((s) => getEffectiveCompanyLocationId(s));
  // Guest / customer / company location -- recomputed every render (cheap,
  // synchronous), so sign-in/out is picked up on the next render.
  const scope = couponPreviewScope();
  const signedIn = scope.startsWith("c:");

  const [elig, setElig] = useState<{ key: string; map: Record<string, Record<string, boolean>> } | null>(null);
  const [sav, setSav] = useState<{ key: string; map: Record<string, SavingsResult> } | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [conflict, setConflict] = useState<DiscountConflict | null>(null);
  const [replacing, setReplacing] = useState(false);

  const candidates = useMemo(
    () => CATEGORY_PROMOTIONS.map((promo) => ({
      promo,
      lines: candidateItems(items, promo).map((i): PreviewLine => ({ variantId: i.variantId, quantity: i.quantity })),
    })),
    [items],
  );
  const fullLines: PreviewLine[] = items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  const fullSignature = fullLines.map((l) => `${l.variantId}:${l.quantity}`).sort().join(",");
  const appliedCodes = discountCodes.filter((d) => d.applicable).map((d) => d.code.toUpperCase());
  const activePromos = candidates.filter((c) => c.lines.length > 0);
  // Two promotions may apply: price the ones not already applied (Shopify's
  // whole-bag answer), which also tells us their eligibility.
  const compareCodes = activePromos.length >= 2 ? activePromos.map((c) => c.promo.code).filter((c) => !appliedCodes.includes(c)) : [];

  // Quantities are deliberately NOT part of this key: eligibility belongs to
  // the product, so a quantity change never triggers an eligibility preview.
  const eligibilityKey = `${scope}|${effectiveLocation ?? ""}|${candidates
    .map(({ promo, lines }) => `${promo.code}:${[...new Set(lines.map((l) => l.variantId))].sort().join(",")}`)
    .join(";")}`;
  const savingsKey = compareCodes.length ? `${scope}|${fullSignature}|${compareCodes.join(",")}` : "";

  useEffect(() => {
    if (!cartId) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      // One whole-bag preview per comparable code (in parallel) answers both
      // savings and eligibility; the eligibility calls below are then cache hits.
      if (compareCodes.length) await Promise.all(compareCodes.map((code) => resolveSavings(code, scope, fullLines, previewCodesOnLines)));
      const entries = await Promise.all(
        candidates.map(async ({ promo, lines }) => [
          promo.code,
          lines.length ? Object.fromEntries(await resolveEligibility(promo.code, scope, lines, previewCodesOnLines)) : {},
        ] as const),
      );
      if (!cancelled) setElig({ key: eligibilityKey, map: Object.fromEntries(entries) });
    }, elig ? REFRESH_DEBOUNCE_MS : 0);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibilityKey, cartId]);

  useEffect(() => {
    if (!savingsKey || !cartId) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const entries = await Promise.all(
        compareCodes.map(async (code) => [code, await resolveSavings(code, scope, fullLines, previewCodesOnLines)] as const),
      );
      if (!cancelled) setSav({ key: savingsKey, map: Object.fromEntries(entries) });
    }, sav ? REFRESH_DEBOUNCE_MS : 0);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savingsKey, cartId]);

  const views = useMemo(
    () => buildOfferViews({ items, discountCodes, eligibility: elig?.map ?? {}, signedIn }),
    [items, discountCodes, elig, signedIn],
  );

  if (!cartId || items.length === 0 || views.length === 0) return null;

  const shown = views.filter((v) => v.kind === "applied" || v.kind === "available");
  const needsComparison = shown.length >= 2;
  const savingsFor = (code: string): SavingsResult | undefined => (sav && sav.key === savingsKey ? sav.map[code] : undefined);
  const disabled = discountBusy || busyCode !== null;
  const currency = items[0]?.lineCost?.total?.currencyCode ?? items[0]?.price.currencyCode ?? "INR";

  const apply = async (code: string) => {
    if (disabled) return;
    setBusyCode(code);
    setFeedback(null);
    const r = await applyChecked(code);
    setBusyCode(null);
    if (r.status === "conflict") {
      setConflict({ code: r.code, existing: r.existing, candidateSavings: r.candidateSavings, currencyCode: r.currencyCode });
      return;
    }
    setFeedback({ code, ok: r.status === "applied" || r.status === "already-applied", message: r.message });
  };

  const confirmReplace = async () => {
    if (!conflict) return;
    // The bag's codes changed while the dialog was open: re-check, never
    // replace something the shopper didn't see in the dialog.
    if (!sameCodes(conflict.existing.map((e) => e.code), useCartStore.getState().discountCodes.map((d) => d.code))) {
      const fresh = await applyChecked(conflict.code);
      if (fresh.status === "conflict") {
        setConflict({ code: fresh.code, existing: fresh.existing, candidateSavings: fresh.candidateSavings, currencyCode: fresh.currencyCode });
        return;
      }
      setConflict(null);
      setFeedback({ code: conflict.code, ok: fresh.status === "applied" || fresh.status === "already-applied", message: fresh.message });
      return;
    }
    setReplacing(true);
    const r = await replaceCode(conflict.code);
    setReplacing(false);
    setFeedback({ code: conflict.code, ok: r.status === "applied", message: r.message });
    setConflict(null);
  };

  const remove = async (code: string) => {
    if (disabled) return;
    setBusyCode(code);
    setFeedback(null);
    await removeCode(code);
    setBusyCode(null);
  };

  const anyApplied = views.some((v) => v.kind === "applied");

  const renderView = (v: OfferView) => {
    const { promo } = v;
    const busy = busyCode === promo.code;
    const mine = feedback?.code === promo.code ? feedback : null;

    if (v.kind === "checking") return <OfferSkeleton key={promo.code} />;

    if (v.kind === "applied") {
      return (
        <div key={promo.code} className="rounded-2xl border border-green-700/30 bg-green-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-green-800">
                <Check className="size-4 shrink-0" aria-hidden /> {promo.code} applied
              </p>
              {v.pricingPending ? (
                <div className="mt-1.5"><Pulse className="h-3 w-40" /><span className="sr-only">Updating savings</span></div>
              ) : (
                <p className="mt-0.5 text-[13px] text-foreground">
                  You save <span className="font-semibold tabular-nums">{formatMoney(v.savings, currency)}</span>
                  {" "}on {v.lines} {v.lines === 1 ? "item" : "items"}.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(promo.code)}
              disabled={disabled}
              className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
          {!v.pricingPending && v.lines < items.length ? (
            <p className="mt-2 text-xs text-muted-foreground">Applies to eligible {promo.eligibleLabel} only.</p>
          ) : null}
          {promo.oncePerCustomer ? <p className="mt-1 text-xs text-muted-foreground">{checkoutNote(promo)}</p> : null}
          {mine && !mine.ok ? <p role="status" className="mt-2 text-xs text-destructive">{mine.message}</p> : null}
        </div>
      );
    }

    if (v.kind === "dormant") {
      return (
        <div key={promo.code} className="rounded-2xl border border-border p-4">
          <p className="text-[13px] text-foreground">
            <span className="font-semibold tracking-[0.04em]">{promo.code}</span> is on your bag but doesn&apos;t apply to the items in it right now.
          </p>
          <button
            type="button"
            onClick={() => remove(promo.code)}
            disabled={disabled}
            className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove code"}
          </button>
        </div>
      );
    }

    if (v.kind === "unavailable-for-account") {
      return (
        <div key={promo.code} className="rounded-2xl border border-border p-4">
          <p className="text-[13px] text-foreground">
            <span className="font-semibold tracking-[0.04em]">{promo.code}</span> isn&apos;t available on your account.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It&apos;s limited to one use per customer and may already have been used, or the offer may have ended.
          </p>
        </div>
      );
    }

    // available
    const s = savingsFor(promo.code);
    const mixed = v.eligibleLines < v.totalLines;
    return (
      <div key={promo.code} className="rounded-2xl border border-dashed border-foreground/25 bg-secondary/40 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Special offer</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-none tracking-tight text-foreground">{promo.percentOff}% OFF</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Use code <span className="font-semibold tracking-[0.08em] text-foreground">{promo.code}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => apply(promo.code)}
            disabled={disabled}
            aria-busy={busy}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Applying…</> : anyApplied ? `Switch to ${promo.code}` : "Apply Offer"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Get {promo.percentOff}% off on eligible {promo.eligibleLabel}.
          {mixed ? ` Applies to ${v.eligibleLines} of ${v.totalLines} items in your bag.` : ""}
          {promo.terms ? ` ${checkoutNote(promo)}` : ""}
        </p>
        {needsComparison ? (
          !s ? (
            <div className="mt-1.5"><Pulse className="h-3 w-44" /><span className="sr-only">Checking savings</span></div>
          ) : s.status === "ok" && s.applicable ? (
            <p className="mt-1 text-xs font-medium tabular-nums text-green-800">Save {formatMoney(s.savings, s.currencyCode)} on eligible {promo.eligibleLabel}.</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Savings will be shown at checkout.</p>
          )
        ) : null}
        {mine ? <p role="status" className={cn("mt-2 text-xs", mine.ok ? "text-foreground" : "text-destructive")}>{mine.message}</p> : null}
      </div>
    );
  };

  return (
    <section aria-label="Offers for your bag" aria-live="polite" data-cart-coupon-offer className="space-y-3">
      {needsComparison && shown.some((v) => v.kind === "available") ? (
        <p className="text-xs leading-snug text-muted-foreground">
          Your bag qualifies for more than one offer. Only one can be used per order — compare and choose.
        </p>
      ) : null}
      {views.map(renderView)}
      <DiscountConflictDialog conflict={conflict} busy={replacing} onKeep={() => setConflict(null)} onReplace={confirmReplace} />
    </section>
  );
}
