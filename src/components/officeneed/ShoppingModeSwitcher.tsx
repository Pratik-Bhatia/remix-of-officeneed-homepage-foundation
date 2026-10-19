import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useB2BStore } from "@/stores/b2bStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomer } from "@/lib/customer";
import { ModeSwitchDialog } from "@/components/officeneed/ModeSwitchDialog";
import type { ShoppingMode } from "@/lib/shopping-mode";

/**
 * The Personal/Business Shopping mode switcher -- rendered just above
 * B2BAccountStatus in src/routes/account.tsx. `status` (eligibility,
 * server-resolved) and `shoppingMode` (the shopper's own active choice)
 * are intentionally separate fields on b2bStore -- this component is the
 * only place that lets the shopper CHANGE the latter; every actual
 * pricing/quantity-rule/buyer-identity read elsewhere goes through
 * getEffectiveCompanyLocationId, which always re-ANDs both.
 *
 * Every switch attempt (both directions) opens ModeSwitchDialog first,
 * per the task's own "ask whether they want to continue with their
 * current email or use a different email" wording -- never flips the
 * mode directly on click.
 */
export function ShoppingModeSwitcher() {
  const status = useB2BStore((s) => s.status);
  const shoppingMode = useB2BStore((s) => s.shoppingMode);
  const locations = useB2BStore((s) => s.locations);
  const resolved = useB2BStore((s) => s.resolved);
  const { customer } = useCustomer();
  const queryClient = useQueryClient();

  const [dialogTarget, setDialogTarget] = useState<ShoppingMode | null>(null);

  if (!resolved || status === "idle" || status === "resolving") return null;

  const canUseB2B = status === "b2b" || status === "needs-location";
  const companyDisplayName = locations[0]?.name.replace(/\s+-\s+Head Office$/i, "") ?? null;

  const hint =
    status === "pending"
      ? "Available once your business application is approved."
      : "Register your business below to unlock Business Shopping.";

  const applyModeSwitch = async (mode: ShoppingMode) => {
    const applied = useB2BStore.getState().setShoppingMode(mode);
    if (!applied) return;
    queryClient.invalidateQueries({ queryKey: ["shopify"] });
    await useCartStore.getState().reconcileBuyerIdentity();
  };

  const handleContinueWithCurrentEmail = () => {
    if (!dialogTarget) return;
    if (dialogTarget === "b2c" || canUseB2B) {
      void applyModeSwitch(dialogTarget);
      return;
    }
    // Not yet eligible for Business Shopping under this email -- open the
    // EXISTING upgrade/registration flow (CustomerAuthModal's own
    // open-effect already auto-detects the signed-in token and routes
    // into it, same as B2BAccountStatus's "Register my business" CTA).
    window.dispatchEvent(new Event("open-auth-modal"));
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Shopping mode"
          className="inline-flex w-full items-center gap-1 rounded-full border border-border bg-background p-1 sm:w-auto"
        >
          <button
            type="button"
            role="radio"
            aria-checked={shoppingMode === "b2c"}
            onClick={() => { if (shoppingMode !== "b2c") setDialogTarget("b2c"); }}
            className={cn(
              "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              shoppingMode === "b2c" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Personal Shopping
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={shoppingMode === "b2b"}
            aria-describedby={!canUseB2B ? "shopping-mode-b2b-hint" : undefined}
            onClick={() => { if (shoppingMode !== "b2b") setDialogTarget("b2b"); }}
            className={cn(
              "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none",
              shoppingMode === "b2b" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Business Shopping{shoppingMode === "b2b" && companyDisplayName ? ` · ${companyDisplayName}` : ""}
          </button>
        </div>
        {shoppingMode === "b2c" ? (
          <span className="text-xs text-muted-foreground">Personal shopping</span>
        ) : null}
      </div>
      {!canUseB2B ? (
        <p id="shopping-mode-b2b-hint" className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3.5 shrink-0" />
          {hint}
        </p>
      ) : null}

      {dialogTarget ? (
        <ModeSwitchDialog
          open
          onOpenChange={(open) => { if (!open) setDialogTarget(null); }}
          targetMode={dialogTarget}
          currentEmail={customer?.email ?? null}
          onContinueWithCurrentEmail={handleContinueWithCurrentEmail}
        />
      ) : null}
    </>
  );
}
