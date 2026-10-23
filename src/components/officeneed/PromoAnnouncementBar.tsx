import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getPromotionsForPage, type CategoryPromotion } from "@/config/promotions";
import { CopyCodeButton } from "@/components/officeneed/CopyCodeButton";
import { cn } from "@/lib/utils";

/** How long each offer shows on mobile before the next one fades in. */
const ROTATE_MS = 5500;
/** Auto-rotation stays paused this long after any touch/click on the bar. */
const INTERACTION_PAUSE_MS = 12000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** One coupon: LABEL  CODE  copy-icon -- the whole thing is the copy button. */
function CouponChip({ promo }: { promo: CategoryPromotion }) {
  return (
    <CopyCodeButton
      inline
      code={promo.code}
      copiedLabel="Copied!"
      className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-[#171717]/[0.07] sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]/70"
      idleLabel={
        <>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#171717]/70">{promo.label}</span>
          <span className="text-xs font-semibold tracking-[0.08em]">{promo.code}</span>
        </>
      }
    />
  );
}

/** Mobile: one offer at a time (opacity fade only), dots to pick either one,
 * auto-advance paused while the shopper interacts and under reduced motion. */
function MobileRotator({ promos }: { promos: readonly CategoryPromotion[] }) {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  const pausedUntil = useRef(0);
  const focused = useRef(false);
  const multiple = promos.length > 1;

  useEffect(() => {
    if (!multiple || reduced) return;
    const id = window.setInterval(() => {
      if (focused.current || Date.now() < pausedUntil.current) return;
      setIndex((i) => (i + 1) % promos.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [multiple, reduced, promos.length]);

  const touch = () => { pausedUntil.current = Date.now() + INTERACTION_PAUSE_MS; };

  return (
    <div
      className="relative flex w-full items-center justify-center sm:hidden"
      onPointerDown={touch}
      onFocus={() => { focused.current = true; touch(); }}
      onBlur={() => { focused.current = false; }}
    >
      {/* Gutters reserve the dots' column, so the chip is centred and can't collide
          with them; below 360px only the dots side is reserved to keep the text size. */}
      <div className={cn("grid", multiple && "px-5 max-[359px]:pl-0")}>
        {promos.map((p, i) => (
          <div
            key={p.code}
            aria-hidden={i !== index}
            className={cn(
              "col-start-1 row-start-1 flex justify-center transition-opacity duration-300 motion-reduce:transition-none",
              i === index ? "visible opacity-100" : "invisible opacity-0",
            )}
          >
            <CouponChip promo={p} />
          </div>
        ))}
      </div>
      {multiple ? (
        <div role="group" aria-label="Choose offer" className="absolute right-0.5 top-1/2 flex -translate-y-1/2 flex-col items-center">
          {promos.map((p, i) => (
            <button
              key={p.code}
              type="button"
              aria-label={`Show ${p.label} offer`}
              aria-current={i === index}
              onClick={() => { touch(); setIndex(i); }}
              className="grid h-[18px] w-5 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]/70"
            >
              <span className={cn("size-1.5 rounded-full bg-[#171717] transition-opacity", i === index ? "opacity-90" : "opacity-30")} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Slim, static (non-sticky) bar above the navbar. Which offers it shows is
 * decided by getPromotionsForPage (route + Shopify collection handles); it
 * renders nothing where no promoted category is confidently in play. */
export function PromoAnnouncementBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const productHandles = useRouterState({
    select: (s) => {
      const match = s.matches.find((m) => m.routeId === "/products/$slug");
      const node = (match?.loaderData as { node?: { collections?: { edges: Array<{ node: { handle: string } }> } } | null } | undefined)?.node;
      return node?.collections?.edges.map((e) => e.node.handle).join(",") ?? "";
    },
  });

  const promos = getPromotionsForPage({
    pathname,
    collection: typeof search["collection"] === "string" ? search["collection"] : undefined,
    query: search["q"] != null ? String(search["q"]) : undefined,
    productHandles: productHandles ? productHandles.split(",") : undefined,
  });
  if (promos.length === 0) return null;

  return (
    <div data-promo-bar className="w-full border-b border-[#171717]/10 bg-[#E5D7AB] text-[#171717]">
      <div className="mx-auto flex min-h-[38px] max-w-[1600px] items-center justify-center px-2 sm:px-6 lg:px-12">
        <MobileRotator promos={promos} />
        <div className="hidden items-center justify-center gap-1 sm:flex">
          <span className="mr-2 hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-[#171717]/70 lg:inline">
            {promos.length > 1 ? "Coupon offers" : "Exclusive offer"}
          </span>
          {promos.map((p, i) => (
            <div key={p.code} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden className="h-4 w-px bg-[#171717]/20" /> : null}
              <CouponChip promo={p} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
