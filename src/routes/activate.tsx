import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activateCustomer } from "@/lib/customer";
import { refreshSaves } from "@/lib/saves";

/**
 * Classic Shopify customer account activation, landed on this storefront
 * instead of Shopify's own hosted activation page.
 *
 * Shopify's "Customer account invite" email notification template (Admin
 * Settings -> Notifications) must be edited to link HERE instead of its
 * default `{{ customer.account_activation_url }}` target, carrying that
 * same Shopify-generated URL through as the `activation_url` query param --
 * exactly Shopify's own documented pattern (shopify.dev/docs/storefronts/
 * headless/building-with-the-storefront-api/customer-accounts):
 *
 *   <a href="https://officeneed.in/activate?activation_url={{ customer.account_activation_url }}">
 *
 * This page never parses that URL -- it's passed to customerActivateByUrl
 * verbatim, which is Shopify's own recommended mutation for exactly this
 * (see src/lib/customer.ts's activateCustomer). This activates the SAME
 * Shopify customer the link was issued for; it never creates a second one,
 * and there is no local customer database involved anywhere in this flow.
 *
 * Deliberately a standalone top-level route, NOT nested under /account:
 * account.tsx's layout only renders its <Outlet/> for an already-signed-in
 * customer, which an unauthenticated visitor following this link from
 * their inbox never is yet.
 */
export const Route = createFileRoute("/activate")({
  validateSearch: (search: Record<string, unknown>): { activation_url?: string } =>
    search["activation_url"] != null && String(search["activation_url"]) !== ""
      ? { activation_url: String(search["activation_url"]) }
      : {},
  head: () => ({
    meta: [
      { title: "Activate Your Account | Officeneed" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivatePage,
});

function ActivatePage() {
  const { activation_url: activationUrl } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!activationUrl) {
      setError("This activation link is missing required information. Please use the link from your activation email.");
      return;
    }
    if (password.length < 5) {
      setError("Password must be at least 5 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      // activationUrl and password are never logged anywhere in this flow.
      await activateCustomer(activationUrl, password);
      await refreshSaves(true);
      navigate({ to: "/account" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-border p-6 sm:p-8">
          <h1 className="text-lg font-medium text-foreground">Activate your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set a password to finish activating your Officeneed account.
          </p>

          {!activationUrl ? (
            <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This activation link is invalid or incomplete. Please use the link from your activation email, or
              contact OfficeNeed for a new one.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground">
                  New Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={5}
                  className="rounded-xl"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs font-medium tracking-wide text-muted-foreground">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={5}
                  className="rounded-xl"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" disabled={busy} className="w-full rounded-full">
                {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                {busy ? "Activating…" : "Activate Account"}
              </Button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
