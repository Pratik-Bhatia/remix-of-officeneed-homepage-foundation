import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ShopifyVariantNode } from "@/lib/shopify";

interface VariantSelectorProps {
  variants: ShopifyVariantNode[];
  selectedVariantId: string | null;
  onSelect: (variant: ShopifyVariantNode) => void;
  /** The real Shopify option name (e.g. "Color", "Size") -- drives the
   * mobile sheet's heading and both triggers' accessible label. */
  optionName: string;
  triggerClassName?: string;
}

/**
 * Replaces a bare native `<select>` for picking a product variant --
 * previously the only place in the app using one, and the reason mobile
 * Chrome/Android showed its heavy dark system picker instead of anything
 * matching Officeneed's design. Exports two call sites sharing the exact
 * same props/state (selectedVariantId / onSelect passed straight through
 * from the PDP -- no second/independent variant state is ever created
 * here) because the sticky bar's existing desktop and mobile layouts are
 * already two separate DOM subtrees (toggled by `hidden lg:flex` /
 * `flex lg:hidden` one level up, not by anything in this file), each with
 * its own placement and trigger sizing for the variant control:
 *
 *   - VariantSelectorMobile: a custom bottom sheet (vaul Drawer, already
 *     used elsewhere in the app) with a heading and an explicit close
 *     button, for the mobile layout's own dedicated variant row.
 *   - VariantSelectorDesktop: the existing themed Radix Select component
 *     (src/components/ui/select.tsx, already used on account.tsx,
 *     admin/quotes.tsx and the /products sort control) -- a small
 *     popover-style dropdown, not a native picker and not a large modal,
 *     and it comes with full keyboard/typeahead accessibility for free.
 *
 * Dismissing either one (Escape, backdrop click, swipe-down) without
 * picking a row never calls onSelect, so the current selection is left
 * untouched.
 */
export function VariantSelectorMobile({ variants, selectedVariantId, onSelect, optionName, triggerClassName }: VariantSelectorProps) {
  const [open, setOpen] = useState(false);
  const label = optionName || "Options";
  const selectedTitle = variants.find((v) => v.id === selectedVariantId)?.title ?? "Select";

  const handlePick = (variant: ShopifyVariantNode) => {
    onSelect(variant);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${selectedTitle}`}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">{selectedTitle}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border px-4 pb-3 pt-1">
          <p className="text-sm font-semibold text-foreground">Choose a {label.toLowerCase()}</p>
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </DrawerClose>
        </div>
        <div
          role="listbox"
          aria-label={label}
          className="max-h-[50vh] divide-y divide-border overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {variants.map((v) => {
            const selected = v.id === selectedVariantId;
            return (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handlePick(v)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-secondary/40",
                  selected ? "font-medium text-foreground" : "text-foreground/90",
                )}
              >
                <span className="flex-1 truncate">{v.title}</span>
                {!v.availableForSale ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Sold out</span>
                ) : null}
                {selected ? <Check className="size-4 shrink-0 text-foreground" strokeWidth={2} /> : null}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function VariantSelectorDesktop({ variants, selectedVariantId, onSelect, optionName, triggerClassName }: VariantSelectorProps) {
  const label = optionName || "Options";
  return (
    <Select
      {...(selectedVariantId ? { value: selectedVariantId } : {})}
      onValueChange={(id) => {
        const v = variants.find((x) => x.id === id);
        if (v) onSelect(v);
      }}
    >
      <SelectTrigger aria-label={label} className={cn("text-sm", triggerClassName)}>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent align="start">
        {variants.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.title}
            {!v.availableForSale ? <span className="ml-2 text-xs text-muted-foreground">(Sold out)</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
