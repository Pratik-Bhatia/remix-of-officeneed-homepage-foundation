import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";

export function DiscountCodeInput() {
  const discountCodes = useCartStore((s) => s.discountCodes);
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode);
  const removeDiscountCode = useCartStore((s) => s.removeDiscountCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const result = await applyDiscountCode(code);
    setFeedback(result);
    if (result.ok) setCode("");
    setBusy(false);
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
          disabled={!code.trim() || busy}
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
                onClick={() => removeDiscountCode(d.code)}
                aria-label={`Remove code ${d.code}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
