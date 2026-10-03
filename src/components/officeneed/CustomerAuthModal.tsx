import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInCustomer, registerCustomer, requestPasswordRecovery, getCustomerToken, CustomerAuthError } from "@/lib/customer";
import { saveBusinessRegistration } from "@/lib/business-registration.functions";
import { setupB2BCompany } from "@/lib/b2b-company-setup.functions";
import { refreshSaves } from "@/lib/saves";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { splitFullName } from "@/lib/name-utils";
import { isValidGstin } from "@/lib/gst";
import { useB2BStore } from "@/stores/b2bStore";

export function CustomerAuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<"signin" | "register" | "forgot">("signin");
  // Whether the neutral "we've sent a link" confirmation is showing, in
  // place of the forgot-password email form. Reset to false every time
  // "forgot" mode is (re-)entered so a second attempt shows the form
  // again, not a stale confirmation.
  const [recoverySent, setRecoverySent] = useState(false);
  // Inline, field-level -- not a generic toast -- per the GST requirement.
  // Re-validated (and cleared) on every submit attempt, not on every
  // keystroke, so the error doesn't flicker while the shopper is still
  // mid-typing their GSTIN.
  const [gstError, setGstError] = useState<string | null>(null);
  // Which tab is selected is PURELY a UI entry point -- it is NEVER sent to
  // Shopify, never read by signInCustomer/registerCustomer, and never sets
  // any pricing flag. Whether someone actually gets B2B pricing is
  // determined entirely server-side after sign-in (see
  // src/lib/b2b.functions.ts) from Shopify's real Customer -> Company
  // Contact -> Role Assignment -> Company Location relationship. The
  // Company tab's "Create Business Account" form creates an ordinary
  // Shopify customer through the SAME registerCustomer() every B2C signup
  // uses, plus a company name/GST intake record (see
  // src/lib/business-registration.functions.ts) for the merchant to review
  // -- it does NOT itself grant B2B pricing or create a Shopify Company.
  const [entryType, setEntryType] = useState<"customer" | "company">("customer");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ROOT CAUSE of stale mode/tab/error state surviving a close+reopen:
  // Navbar.tsx renders <CustomerAuthModal open={authOpen} .../> unconditionally
  // (not `{authOpen && <CustomerAuthModal/>}`), so this component instance --
  // and every one of its useState calls above -- lives for the entire page
  // session. Only Radix's <DialogContent> (its child) actually
  // mounts/unmounts with `open`; this wrapping component never does. So
  // without this effect, closing the dialog mid-registration (or while
  // showing the "forgot password" confirmation) and reopening it later
  // resumed exactly where it left off -- wrong tab, wrong mode, a stale
  // GST error, or the old recovery confirmation screen. This is a React
  // component-state bug (not localStorage/sessionStorage/Zustand/browser
  // autofill/Supabase -- none of those store this data; confirmed by
  // reading every candidate store in this codebase). Native form field
  // VALUES (email/name/phone/GST/password) are a separate, likely cause:
  // DialogContent itself does unmount on close, so those uncontrolled
  // <input> DOM nodes are destroyed -- any value reappearing there is the
  // browser's own autocomplete history for that field's autoComplete
  // token, not anything this app stores or restores.
  //
  // Resets only this modal's own UI/form-mode state -- never the actual
  // customerAccessToken (customer.ts's setCustomerToken/getCustomerToken)
  // and never cart/shopping data, neither of which this component touches.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setMode("signin");
      setEntryType("customer");
      setGstError(null);
      setRecoverySent(false);
    }
    wasOpen.current = open;
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (mode === "forgot") {
      setBusy(true);
      try {
        await requestPasswordRecovery(email);
        // Success here deliberately does NOT mean "this email has an
        // account" -- see requestPasswordRecovery's doc comment. The
        // confirmation below is shown identically whether or not one
        // exists, which is the whole point.
        setRecoverySent(true);
      } catch (error) {
        // Only a genuine transport/infra failure reaches here (never a
        // "this email doesn't exist" case) -- safe to show a distinct
        // message without leaking account existence either way.
        console.error("Password recovery request failed:", error);
        toast.error("We couldn't process your request right now. Please try again in a moment.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const password = String(form.get("password") ?? "");
    setGstError(null);

    // Defensive, not just reactive: in normal use the modal is never
    // opened while already signed in (both window.dispatchEvent(new
    // CustomEvent("open-auth-modal")) call sites and the Navbar account
    // icon only open it when status === "out") -- but never silently
    // reuse/overwrite an existing session's data for a second
    // registration if this is ever reached anyway.
    if (mode === "register" && getCustomerToken()) {
      toast.error("You're already signed in. Please sign out first to create a different account.");
      return;
    }

    if (entryType === "company" && mode === "register") {
      const gstNumberRaw = String(form.get("gstNumber") ?? "").trim();
      if (!gstNumberRaw) {
        setGstError("GST number is required.");
        return;
      }
      if (!isValidGstin(gstNumberRaw)) {
        setGstError("Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5).");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await signInCustomer(email, password);
        // Signing in via the Company tab never grants B2B pricing by
        // itself (see the comment on entryType above) -- but if this
        // signed-in customer genuinely has no Shopify company/location
        // relationship, say so plainly instead of a silent "Successfully
        // logged in" that implies they got business pricing when they
        // didn't. B2B eligibility is still resolved exclusively from
        // Shopify's real Customer -> Company Contact -> Role Assignment ->
        // Company Location chain (src/lib/b2b.functions.ts) -- this only
        // reads that result, never grants anything itself.
        if (entryType === "company") {
          const signedInToken = getCustomerToken();
          if (signedInToken) await useB2BStore.getState().resolve(signedInToken);
          if (useB2BStore.getState().status === "b2c") {
            toast.warning(
              "Your account is not currently linked to a business account. Please contact OfficeNeed to complete your business setup.",
            );
          } else {
            toast.success("Successfully logged in");
          }
        } else {
          toast.success("Successfully logged in");
        }
      } else if (entryType === "company") {
        const confirmPassword = String(form.get("confirmPassword") ?? "");
        if (password !== confirmPassword) throw new Error("Passwords don't match.");
        const fullName = String(form.get("fullName") ?? "").trim();
        const companyName = String(form.get("companyName") ?? "").trim();
        const phone = String(form.get("phone") ?? "").trim();
        const gstNumber = String(form.get("gstNumber") ?? "").trim();
        const { firstName, lastName } = splitFullName(fullName);
        await registerCustomer({
          email,
          password,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(phone ? { phone } : {}),
        });
        // The Shopify customer is already created and signed in at this
        // point -- a failure saving the company/GST intake record is
        // secondary and must not look like the whole registration failed.
        // (GST itself was already required + format-validated above, so
        // this call failing now would be a transient/infra issue, not a
        // bad value -- still surfaced, never silently dropped.)
        const token = getCustomerToken();
        if (token) {
          try {
            await saveBusinessRegistration({ data: { token, companyName, gstNumber } });
          } catch (saveErr) {
            console.error("Failed to save business registration details:", saveErr);
            toast.warning("Account created, but we couldn't save your company details. Please contact OfficeNeed.");
          }
        }

        // Automatic Shopify B2B setup -- the actual thing that makes
        // Corporate Pricing available, not just an intake record (see
        // src/lib/b2b-company-setup.functions.ts for the full mutation
        // chain). "Business account created" is only ever shown once this
        // genuinely succeeds -- a failure here must never look like B2B
        // is active when it isn't.
        if (token) {
          try {
            await setupB2BCompany({ data: { customerAccessToken: token, companyName, gstNumber } });
            // The existing B2BSync-driven resolve() for this exact token
            // already ran (and found no company) the moment signInCustomer
            // fired officeneed-customer-token above -- resolve() no-ops on
            // a repeat call for the same token (see b2bStore.ts), so this
            // store must be reset first to force a genuinely fresh lookup
            // against the relationship that was *just* created.
            useB2BStore.getState().reset();
            await useB2BStore.getState().resolve(token);
            queryClient.invalidateQueries({ queryKey: ["shopify"] });
            toast.success("Your business account has been created successfully.");
          } catch (b2bErr) {
            console.error("[B2B setup] Automatic company setup failed:", b2bErr);
            toast.error(
              "Your account was created, but we couldn't finish setting up your business pricing automatically. Please contact OfficeNeed so we can complete this for you.",
            );
          }
        } else {
          toast.success("Account created successfully");
        }
      } else {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        await registerCustomer({
          email,
          password,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        });
        toast.success("Account created successfully");
      }
      onOpenChange(false);
      await refreshSaves(true);
      navigate({ to: "/account" });
    } catch (error) {
      // An email that's already registered should send the shopper to
      // sign in, not leave them stuck on a failed "Create Account" form.
      if (error instanceof CustomerAuthError && error.code === "TAKEN") {
        setMode("signin");
      }
      if (mode === "signin" && !(error instanceof CustomerAuthError)) {
        // Not a Shopify-identified auth failure (those are already mapped
        // to friendly text in signInCustomer) -- a network/proxy/infra
        // failure instead. Never show its raw message.
        console.error("Sign-in failed:", error);
        toast.error("We couldn't sign you in right now. Please try again in a moment.");
      } else {
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const isCompanyRegister = entryType === "company" && mode === "register";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "forgot"
              ? "Reset your password"
              : entryType === "company"
                ? mode === "signin" ? "Sign in to your business account" : "Create your business account"
                : mode === "signin" ? "Sign in to your account" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "forgot"
              ? recoverySent
                ? "Check your email for the next step."
                : "Enter your email and we'll send you a link to reset your password."
              : entryType === "company"
                ? mode === "signin"
                  ? "Sign in with your business email to see your orders and saved products."
                  : "Register your business. B2B pricing is enabled separately once OfficeNeed sets up your company account in Shopify."
                : mode === "signin"
                  ? "Sign in to see your orders and saved products."
                  : "Create an account to track your orders and keep a list of saved products."}
          </DialogDescription>
        </DialogHeader>

        {mode === "forgot" ? null : (
          <Tabs
            value={entryType}
            onValueChange={(v) => {
              setEntryType(v as "customer" | "company");
              setMode("signin");
              setGstError(null);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer">Customer</TabsTrigger>
              <TabsTrigger value="company">Company</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {mode === "forgot" && recoverySent ? (
          <p className="py-4 text-sm text-foreground">
            We've sent a password reset link if an account exists for this email.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {isCompanyRegister ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" name="fullName" autoComplete="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" name="companyName" autoComplete="organization" required />
                </div>
              </>
            ) : mode === "register" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" autoComplete="given-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" autoComplete="family-name" />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            </div>

            {isCompanyRegister ? (
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" />
              </div>
            ) : null}

            {isCompanyRegister ? (
              <div className="space-y-2">
                <Label htmlFor="gstNumber">GST Number</Label>
                <Input
                  id="gstNumber"
                  name="gstNumber"
                  required
                  autoComplete="off"
                  placeholder="22AAAAA0000A1Z5"
                  aria-invalid={gstError ? true : undefined}
                  onChange={() => { if (gstError) setGstError(null); }}
                />
                {gstError ? <p className="text-sm text-destructive">{gstError}</p> : null}
              </div>
            ) : null}

            {mode === "forgot" ? null : (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  minLength={5}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
                {mode === "signin" ? (
                  <div className="text-right">
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => {
                        setRecoverySent(false);
                        setMode("forgot");
                      }}
                    >
                      Forgot your password?
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {isCompanyRegister ? (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  minLength={5}
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {mode === "forgot" ? "Send Reset Link" : mode === "signin" ? "Sign In" : isCompanyRegister ? "Create Business Account" : "Create Account"}
            </Button>
          </form>
        )}

        <div className="text-center text-sm text-muted-foreground mt-2">
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={() => {
              setGstError(null);
              if (mode === "forgot") {
                setRecoverySent(false);
                setMode("signin");
              } else {
                setMode(mode === "signin" ? "register" : "signin");
              }
            }}
          >
            {mode === "forgot"
              ? "Back to sign in"
              : mode === "signin"
                ? entryType === "company" ? "New business? Create a business account" : "New here? Create an account"
                : "Already have an account? Sign in"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
