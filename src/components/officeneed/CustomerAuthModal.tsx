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
import { signInCustomer, registerCustomer, CustomerAuthError } from "@/lib/customer";
import { refreshSaves } from "@/lib/saves";
import { useNavigate } from "@tanstack/react-router";

export function CustomerAuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  // Which tab is selected is PURELY a UI entry point -- it is NEVER sent to
  // Shopify, never read by signInCustomer/registerCustomer, and never sets
  // any pricing flag. Whether someone actually gets B2B pricing is
  // determined entirely server-side after sign-in (see
  // src/lib/b2b.functions.ts) from Shopify's real Customer -> Company
  // Contact -> Role Assignment -> Company Location relationship.
  //
  // The "Company" tab specifically must NEVER offer self-registration: a
  // B2B account can only come from a company contact Shopify already
  // knows about (created/assigned by the merchant in Shopify Admin), so
  // "Create Account" here would be misleading at best -- it would create
  // an ordinary B2C customer that merely LOOKS like it registered as a
  // company, with no real company relationship behind it. Switching to
  // this tab forces signin mode and keeps it there; see the Tabs
  // onValueChange below and the conditional render of the mode-toggle link
  // further down.
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

  // Company is sign-in only, always -- see the comment on entryType above.
  const effectiveMode = entryType === "company" ? "signin" : mode;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {entryType === "company"
              ? "Business account"
              : effectiveMode === "signin" ? "Sign in to your account" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {entryType === "company"
              ? "Sign in with your existing company account. Your company account must be created and approved by OfficeNeed."
              : effectiveMode === "signin"
                ? "Sign in to see your orders and saved products."
                : "Create an account to track your orders and keep a list of saved products."}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={entryType}
          onValueChange={(v) => {
            setEntryType(v as "customer" | "company");
            if (v === "company") setMode("signin");
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {effectiveMode === "register" ? (
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
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={5}
              autoComplete={effectiveMode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {effectiveMode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        {entryType === "company" ? (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Need a business account? Contact OfficeNeed to have one set up for you.
          </p>
        ) : (
          <div className="text-center text-sm text-muted-foreground mt-2">
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => setMode(mode === "signin" ? "register" : "signin")}
            >
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
