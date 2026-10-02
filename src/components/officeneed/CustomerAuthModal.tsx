import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInCustomer, registerCustomer, getCustomerToken, CustomerAuthError } from "@/lib/customer";
import { saveBusinessRegistration } from "@/lib/business-registration.functions";
import { refreshSaves } from "@/lib/saves";
import { useNavigate } from "@tanstack/react-router";
import { splitFullName } from "@/lib/name-utils";

export function CustomerAuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);

    try {
      if (mode === "signin") {
        await signInCustomer(email, password);
        toast.success("Successfully logged in");
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
        const token = getCustomerToken();
        if (token) {
          try {
            await saveBusinessRegistration({ data: { token, companyName, ...(gstNumber ? { gstNumber } : {}) } });
          } catch (saveErr) {
            console.error("Failed to save business registration details:", saveErr);
            toast.warning("Account created, but we couldn't save your company details. Please contact OfficeNeed.");
          }
        }
        toast.success("Account created successfully");
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
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
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
            {entryType === "company"
              ? mode === "signin" ? "Sign in to your business account" : "Create your business account"
              : mode === "signin" ? "Sign in to your account" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {entryType === "company"
              ? mode === "signin"
                ? "Sign in with your business email to see your orders and saved products."
                : "Register your business. B2B pricing is enabled separately once OfficeNeed sets up your company account in Shopify."
              : mode === "signin"
                ? "Sign in to see your orders and saved products."
                : "Create an account to track your orders and keep a list of saved products."}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={entryType}
          onValueChange={(v) => {
            setEntryType(v as "customer" | "company");
            setMode("signin");
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
          </TabsList>
        </Tabs>

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
              <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
            </div>
          ) : null}

          {isCompanyRegister ? (
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input id="gstNumber" name="gstNumber" autoComplete="off" placeholder="22AAAAA0000A1Z5" />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={5}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {isCompanyRegister ? (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={5}
                autoComplete="new-password"
              />
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {mode === "signin" ? "Sign In" : isCompanyRegister ? "Create Business Account" : "Create Account"}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground mt-2">
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={() => setMode(mode === "signin" ? "register" : "signin")}
          >
            {mode === "signin"
              ? entryType === "company" ? "New business? Create a business account" : "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
