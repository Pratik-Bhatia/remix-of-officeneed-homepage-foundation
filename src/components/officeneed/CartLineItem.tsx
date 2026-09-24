import { ShoppingBag, Minus, Plus } from "lucide-react";
import type { CartItem } from "@/stores/cartStore";
import { formatMoney } from "@/lib/shopify";

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
}: {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const image = item.product?.node?.images?.edges?.[0]?.node;

  return (
    <div className="flex gap-5 border-b border-border/50 pb-5 last:border-0 last:pb-0">
      <div className="size-20 sm:size-24 shrink-0 overflow-hidden rounded-md bg-secondary/30 flex items-center justify-center p-2">
        {image ? (
          <img
            src={image.url}
            alt={image.altText ?? (item.product?.node?.title ?? "Product")}
            className="size-full object-cover mix-blend-multiply"
          />
        ) : (
          <ShoppingBag className="size-8 text-muted-foreground/20" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <h4 className="text-[14px] md:text-[15px] font-medium text-foreground line-clamp-2">{(item.product?.node?.title ?? "Product")}</h4>
        {item.selectedOptions.length > 0 ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {item.selectedOptions.map((o) => o.value).join(" | ")}
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
