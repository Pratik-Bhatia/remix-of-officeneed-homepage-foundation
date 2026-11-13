import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/lib/shopify";

/** Whether two code lists are the same set (case-insensitive). Used to detect
 * that the bag's codes changed while a confirmation was open. */
export function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  const norm = (l: readonly string[]) => [...new Set(l.map((c) => c.toUpperCase()))].sort().join(",");
  return norm(a) === norm(b);
}

export interface DiscountConflict {
  /** The code the shopper wants to apply. */
  code: string;
  /** Codes currently on the cart, with Shopify's current savings for each. */
  existing: Array<{ code: string; applicable: boolean; savings: number }>;
  /** Shopify-calculated savings if `code` replaced them. */
  candidateSavings: number | null;
  currencyCode: string;
}

/**
 * Confirmation before one discount code replaces another that can't be
 * combined with it. Shared by the cart coupon card and the manual code input,
 * so neither can replace a discount silently. "Keep" is the default (it gets
 * initial focus, and Escape/overlay close also keep): the cart only changes
 * when the shopper explicitly presses Replace. All amounts are Shopify's.
 */
export function DiscountConflictDialog({
  conflict,
  busy,
  onKeep,
  onReplace,
}: {
  conflict: DiscountConflict | null;
  busy?: boolean;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const open = conflict !== null;
  const current = conflict?.existing ?? [];
  const currentLabel = current.map((c) => c.code).join(" + ");

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onKeep(); }}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        {conflict ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace your current discount?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-left">
                  <p>Only one of these discounts can be used on an order.</p>
                  <ul className="space-y-2 rounded-xl border border-border p-3 text-foreground">
                    {current.map((c) => (
                      <li key={c.code} className="flex items-baseline justify-between gap-3">
                        <span>
                          <span className="font-semibold tracking-[0.04em]">{c.code}</span>
                          <span className="text-muted-foreground"> · current</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {c.applicable && c.savings > 0
                            ? `saves ${formatMoney(c.savings, conflict.currencyCode)}`
                            : "not applying to your bag"}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                      <span>
                        <span className="font-semibold tracking-[0.04em]">{conflict.code}</span>
                        <span className="text-muted-foreground"> · new</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {conflict.candidateSavings !== null
                          ? `would save ${formatMoney(conflict.candidateSavings, conflict.currencyCode)}`
                          : "savings shown at checkout"}
                      </span>
                    </li>
                  </ul>
                  <p>
                    Replacing removes {currentLabel} from your bag. Your bag stays as it is unless you choose Replace.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              {/* Keep is the default and visually primary (filled); Replace is
                  the deliberate, secondary choice. */}
              <AlertDialogCancel
                autoFocus
                disabled={busy}
                onClick={onKeep}
                className="rounded-full border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background"
              >
                Keep {currentLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => { e.preventDefault(); onReplace(); }}
                className="rounded-full border border-foreground bg-background text-foreground hover:bg-secondary"
              >
                {busy ? "Replacing…" : `Replace with ${conflict.code}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
