import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { resetPasswordByUrl } from "@/lib/customer";
import { refreshSaves } from "@/lib/saves";

/**
 * Classic Shopify customer password reset, landed on this storefront
 * instead of Shopify's own hosted reset page -- same pattern as
 * src/routes/activate.tsx for account activation.
 *
 * NOT the same route as /reset-password, which is this project's separate
 * internal Supabase admin-login password reset (src/routes/
 * reset-password.tsx) -- unrelated system, untouched by this file.
 *
 * Shopify's "Customer account password reset" notification template
 * (Admin Settings -> Notifications) must be edited to link HERE instead
 * of its default `{{ customer.reset_password_url }}` target, carrying
 * that same Shopify-generated URL through as the `reset_url` query param,
 * exactly Shopify's own documented pattern (shopify.dev/docs/storefronts/
 * headless/building-with-the-storefront-api/customer-accounts):
 *
 *   <a href="https://<storefront-domain>/password-reset?reset_url={{ customer.reset_password_url }}">
 *
 * This page never parses that URL -- it's passed to customerResetByUrl
 * verbatim (see src/lib/customer.ts's resetPasswordByUrl), Shopify's own
 * documented mutation for exactly this. This resets the SAME Shopify
 * customer the link was issued for; no local password storage anywhere.
 *
 * Deliberately a standalone top-level route, NOT nested under /account,
 * same reasoning as /activate: an unauthenticated visitor following this
 * link from their inbox isn't signed in yet.
 */
export const Route = createFileRoute("/password-reset")({
  validateSearch: (search: Record<string, unknown>): { reset_url?: string } =>
    search["reset_url"] != null && String(search["reset_url"]) !== ""
      ? { reset_url: String(search["reset_url"]) }
      : {},
  head: () => ({
    meta: [
      { title: "Reset Your Password | Officeneed" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PasswordResetPage,
});

function PasswordResetPage() {
  const { reset_url: resetUrl } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!resetUrl) {
      setError("This password reset link is missing required information. Please request a new one.");
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
      // resetUrl and password are never logged anywhere in this flow.
      await resetPasswordByUrl(resetUrl, password);
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
          <h1 className="text-lg font-medium text-foreground">Reset your password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a new password for your Officeneed account.
          </p>

          {!resetUrl ? (
            <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This password reset link is invalid or incomplete. Please request a new one from the sign-in screen.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground">
                  New Password
                </Label>
                <PasswordInput
                  id="password"
                  name="password"
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
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
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
                {busy ? "Resetting…" : "Reset Password"}
              </Button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
