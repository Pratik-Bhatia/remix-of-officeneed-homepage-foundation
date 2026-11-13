import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { DiscountConflictDialog, sameCodes, type DiscountConflict } from "@/components/officeneed/DiscountConflictDialog";

export function DiscountCodeInput() {
  const discountCodes = useCartStore((s) => s.discountCodes);
  const applyChecked = useCartStore((s) => s.applyDiscountCodeChecked);
  const replaceCode = useCartStore((s) => s.replaceDiscountCode);
  const removeDiscountCode = useCartStore((s) => s.removeDiscountCode);
  // Store-wide: true while any discount change (coupon card, this input,
  // product page, discount link) is running -- they are queued, never raced.
  const discountBusy = useCartStore((s) => s.discountBusy);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [conflict, setConflict] = useState<DiscountConflict | null>(null);
  const [replacing, setReplacing] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy || discountBusy) return;
    setBusy(true);
    // Same conflict-checked path as the coupon card: a code already on the
    // bag is never replaced (or silently out-ranked) without confirmation.
    const result = await applyChecked(code);
    setBusy(false);
    if (result.status === "conflict") {
      setConflict({ code: result.code, existing: result.existing, candidateSavings: result.candidateSavings, currencyCode: result.currencyCode });
      return;
    }
    const ok = result.status === "applied" || result.status === "already-applied";
    setFeedback({ ok, message: result.message });
    if (ok) setCode("");
  };

  const confirmReplace = async () => {
    if (!conflict) return;
    // The bag's codes changed while the dialog was open: re-check instead of
    // replacing something the shopper didn't see.
    if (!sameCodes(conflict.existing.map((e) => e.code), useCartStore.getState().discountCodes.map((d) => d.code))) {
      const fresh = await applyChecked(conflict.code);
      if (fresh.status === "conflict") {
        setConflict({ code: fresh.code, existing: fresh.existing, candidateSavings: fresh.candidateSavings, currencyCode: fresh.currencyCode });
        return;
      }
      setConflict(null);
      const ok = fresh.status === "applied" || fresh.status === "already-applied";
      setFeedback({ ok, message: fresh.message });
      if (ok) setCode("");
      return;
    }
    setReplacing(true);
    const result = await replaceCode(conflict.code);
    setReplacing(false);
    setConflict(null);
    const ok = result.status === "applied";
    setFeedback({ ok, message: result.message });
    if (ok) setCode("");
  };

  const applied = discountCodes.filter((d) => d.applicable);

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="discount-code" className="sr-only">Discount code</label>
        <input
          id="discount-code"
          value={code}
          onChange={(e) => { setCode(e.target.value); setFeedback(null); }}
          placeholder="Discount code"
          maxLength={60}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!code.trim() || busy || discountBusy}
          className="inline-flex items-center justify-center rounded-full border border-foreground px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
        </button>
      </form>
      {feedback ? (
        <p role="status" className={`px-1 text-xs ${feedback.ok ? "text-foreground" : "text-destructive"}`}>
          {feedback.message}
        </p>
      ) : null}
      {applied.length ? (
        <div className="flex flex-wrap gap-2">
          {applied.map((d) => (
            <span key={d.code} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
              <Tag className="size-3" strokeWidth={1.5} />
              {d.code}
              <button
                type="button"
                onClick={() => { if (!discountBusy) void removeDiscountCode(d.code); }}
                disabled={discountBusy}
                aria-label={`Remove code ${d.code}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <DiscountConflictDialog
        conflict={conflict}
        busy={replacing}
        onKeep={() => setConflict(null)}
        onReplace={confirmReplace}
      />
    </div>
  );
}
