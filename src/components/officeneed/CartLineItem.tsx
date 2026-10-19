import { Link } from "@tanstack/react-router";
import { ShoppingBag, Minus, Plus } from "lucide-react";
import type { CartItem } from "@/stores/cartStore";
import { formatMoney } from "@/lib/shopify";
import { shopifyImageUrl } from "@/lib/shopify-image";

/**
 * A single cart line's presentation -- shared by CartDrawer and the full
 * /cart page so there is exactly one place that renders a cart row. All
 * mutation logic stays in cartStore; this component only calls the
 * callbacks it's given.
 */
export function CartLineItem({
  item,
  onIncrease,
  onDecrease,
  onRemove,
  onNavigate,
}: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
  /** Called (not awaited) right before the image/title Link navigates --
   * only ever needs an implementation in the cart DRAWER (closes the
   * overlay so the PDP underneath is actually visible; without this the
   * route still changes but the drawer stays open on top of it, looking
   * exactly like nothing happened). The full /cart page has no overlay to
   * close, so it simply omits this prop -- same optional pattern as
   * CartProfileLinks' onNavigate. */
  onNavigate?: () => void;
}) {
  // The exact variant image selected when this line was added (Shopify's
  // own cart-line data, see cartStore.ts's resolveLineImage()) -- falls
  // back to the product's featured/first image only when the variant
  // itself has none. Never jumps straight to images[0] (the old bug: a
  // Black variant added to cart would show the product's default/first
  // image, e.g. Brown, instead of the Black the shopper actually picked).
  const image = item.image ?? item.product?.node?.featuredImage ?? item.product?.node?.images?.edges?.[0]?.node ?? null;
  const title = item.product?.node?.title ?? "Product";
  // Shopify's own canonical product handle, carried on every cart line's
  // product node (both the PDP's addItem() call and the cross-device
  // adoptCart sync populate it, same as .title/.featuredImage above) --
  // never derived from the title or hardcoded. Null only if this line
  // somehow lacks product data entirely, in which case the image/title
  // just render as plain (non-link) content, same as today.
  const handle = item.product?.node?.handle ?? null;
  // Shopify's own placeholder for a product with no real variant options
  // (a single "Title" option whose value is literally "Default Title") --
  // meaningless to a shopper, so it's filtered out by VALUE, not by
  // dropping selectedOptions entirely: a genuinely named option (Brown,
  // Black, a second option like Size) is never touched, even if a future
  // product happened to name an option "Title" with a real value.
  const meaningfulOptions = item.selectedOptions.filter(
    (o) => o.value.trim().toLowerCase() !== "default title",
  );

  // Runs on every click, for every product, unconditionally -- deliberately
  // never compares this item's handle/slug against the current route (no
  // "only navigate if different" guard). The Link's own `to`/`params`
  // already navigate correctly for a DIFFERENT product; this just adds the
  // two things that still need to happen even when the shopper is already
  // on this exact product's page, where a same-URL click is otherwise
  // visually a no-op: closing the drawer (onNavigate, cart-drawer only) and
  // resetting scroll to the top of the PDP, so clicking a cart item always
  // produces a visible result either way.
  const handleNavigateClick = () => {
    onNavigate?.();
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const imageContent = image ? (
    <img
      src={shopifyImageUrl(image.url, 200)}
      alt={image.altText ?? title}
      loading="lazy"
      width={96}
      height={96}
      className="size-full object-cover mix-blend-multiply"
    />
  ) : (
    <ShoppingBag className="size-8 text-muted-foreground/20" />
  );

  return (
    <div className="flex gap-5 border-b border-border/50 pb-5 last:border-0 last:pb-0">
      {handle ? (
        <Link
          to="/products/$slug"
          params={{ slug: handle }}
          aria-label={`View ${title}`}
          onClick={handleNavigateClick}
          className="size-20 sm:size-24 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-2 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {imageContent}
        </Link>
      ) : (
        <div className="size-20 sm:size-24 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-2">
          {imageContent}
        </div>
      )}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <h4 className="text-[14px] md:text-[15px] font-medium text-foreground line-clamp-2">
          {handle ? (
            <Link
              to="/products/$slug"
              params={{ slug: handle }}
              onClick={handleNavigateClick}
              className="outline-none transition-colors hover:text-foreground/70 focus-visible:underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h4>
        {meaningfulOptions.length > 0 ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {meaningfulOptions.map((o) => o.value).join(" | ")}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-full border border-border px-3 py-1.5">
            <button aria-label="Decrease quantity" onClick={onDecrease} className="text-muted-foreground hover:text-foreground transition-colors">
              <Minus className="size-3.5" strokeWidth={2} />
            </button>
            <span className="text-[13px] font-medium w-4 text-center tabular-nums">{item.quantity}</span>
            <button aria-label="Increase quantity" onClick={onIncrease} className="text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          <button
            aria-label="Remove item from bag"
            onClick={onRemove}
            className="text-[11px] md:text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-0.5">
        <p className="text-[14px] md:text-[15px] font-medium tabular-nums text-foreground">
          {formatMoney(parseFloat(item.price.amount) * item.quantity, item.price.currencyCode)}
        </p>
        {item.quantity > 1 && (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {formatMoney(item.price.amount, item.price.currencyCode)} each
          </p>
        )}
      </div>
    </div>
  );
}
