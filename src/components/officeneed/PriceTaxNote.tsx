import { cn } from "@/lib/utils";

/**
 * Shown directly under a product's displayed price on every PDP route
 * (products.$slug.tsx, shop.$handle.tsx). Business policy: every price on
 * the storefront includes GST -- matching Shopify's store-level
 * `taxesIncluded: true`. Display-only; never affects pricing or tax.
 */
export function PriceTaxNote({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>Inclusive of all taxes (GST)</p>;
}
