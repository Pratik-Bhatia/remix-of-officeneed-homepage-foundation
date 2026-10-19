import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { signOutCustomer } from "@/lib/customer";
import { clearSaves } from "@/lib/saves";
import { useCartStore } from "@/stores/cartStore";
import type { ShoppingMode } from "@/lib/shopping-mode";

/**
 * Shown on every Personal/Business Shopping switch attempt (both
 * directions), per the task's own explicit "ask whether they want to
 * continue with their current email or use a different email" wording --
 * not only when the current account is already known to be ineligible,
 * so "use a different email" stays a discoverable option rather than
 * something only reachable by manually signing out first.
 *
 * "Continue with current email" is left entirely to the caller
 * (ShoppingModeSwitcher) -- what it actually does depends on the target
 * mode and the current eligibility (flip shoppingMode immediately, or
 * open the existing business-registration "upgrade" flow), none of which
 * this dialog needs to know about.
 *
 * "Use a different email" is a genuine identity switch. Shopify's classic
 * customer accounts (this app's customerAccessTokenCreate-based auth)
 * have no multi-session or account-linking concept -- one token is active
 * at a time, so this is implemented as a deliberate sign-out, never a
 * trick to keep two sessions alive at once:
 *   1. Sign out (clearing the stored token) + clear saved products AND
 *      the local cart -- the explicit cart clear is NOT part of normal
 *      sign-out (see account.tsx's own handleSignOut, which never clears
 *      the cart, intentionally, so a guest's in-progress cart survives
 *      sign-in). It IS needed here, specifically, because
 *      cartStore.ts's syncCustomerCart merges any local cart lines into
 *      whichever customer signs in next -- without this, the PREVIOUS
 *      identity's cart would silently bleed into the new one.
 *   2. Open the existing, unchanged sign-in/register form, defaulted to
 *      the tab matching what the shopper is switching TO (Individual for
 *      Personal Shopping, Corporate for Business Shopping) via
 *      open-auth-modal's optional `detail.entryType` (see Navbar.tsx /
 *      CustomerAuthModal.tsx's new `initialEntryType` prop).
 * Nothing here ever compares emails, looks up whether two accounts might
 * belong to the same person, or links/merges customer records, company
 * associations, order histories, or saved-product data -- "use a
 * different email" is purely the existing generic auth form; the
 * shopper types whichever email they mean and authenticates normally.
 */
export function ModeSwitchDialog({
  open,
  onOpenChange,
  targetMode,
  currentEmail,
  onContinueWithCurrentEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetMode: ShoppingMode;
  currentEmail: string | null;
  /** Called when the shopper picks "Continue with current email" -- the
   * caller decides what that actually means (flip mode, or open the
   * upgrade/registration flow) based on current eligibility. */
  onContinueWithCurrentEmail: () => void;
}) {
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const targetLabel = targetMode === "b2b" ? "Business Shopping" : "Personal Shopping";

  const handleContinue = () => {
    onContinueWithCurrentEmail();
    onOpenChange(false);
  };

  const handleUseDifferentEmail = async () => {
    setSwitchingAccount(true);
    try {
      await signOutCustomer();
      clearSaves();
      useCartStore.getState().clearCart();
      onOpenChange(false);
      window.dispatchEvent(
        new CustomEvent("open-auth-modal", {
          detail: { entryType: targetMode === "b2b" ? "company" : "customer" },
        }),
      );
    } catch (error) {
      console.error("Failed to switch account:", error);
      toast.error("Couldn't sign you out. Please try again.");
    } finally {
      setSwitchingAccount(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Switch to {targetLabel}?</DialogTitle>
          <DialogDescription>
            {currentEmail ? (
              <>You're currently signed in as <span className="font-medium text-foreground">{currentEmail}</span>.</>
            ) : (
              "Choose which email to use for this."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Button type="button" className="w-full justify-center" onClick={handleContinue} disabled={switchingAccount}>
            Continue with current email
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={handleUseDifferentEmail}
            disabled={switchingAccount}
          >
            Use a different email
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            This will sign you out of your current account and clear your current cart.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center"
          onClick={() => onOpenChange(false)}
          disabled={switchingAccount}
        >
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
