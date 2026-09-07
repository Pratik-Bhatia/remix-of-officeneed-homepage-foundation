import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, Heart, Settings, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomer, signInCustomer, registerCustomer, signOutCustomer } from "@/lib/customer";
import { CustomerContext } from "@/lib/customer-context";
import { clearSaves, refreshSaves } from "@/lib/saves";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your Account | Officeneed" },
      { name: "description", content: "Manage your Officeneed orders, saved products and account details in one place." },
      { property: "og:title", content: "Your Account | Officeneed" },
      { property: "og:description", content: "Manage your Officeneed orders, saved products and account details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountLayout,
});

const navItems = [
  { to: "/account/orders", label: "Orders", icon: Package },
  { to: "/account/saves", label: "Your Saves", icon: Heart },
  { to: "/account/profile", label: "Account Settings", icon: Settings },
] as const;

function SignInPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInCustomer(email, password);
      } else {
        const firstName = String(form.get("firstName") ?? "").trim();
        const lastName = String(form.get("lastName") ?? "").trim();
        await registerCustomer({
          email,
          password,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        });
      }
      await onDone();
      await refreshSaves(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border p-6 sm:p-8">
      <h2 className="text-lg font-medium text-foreground">
        {mode === "signin" ? "Sign in to your account" : "Create your account"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "signin"
          ? "Use the email and password from your Officeneed store account to see your orders and saved products."
          : "Create an account to track your orders and keep a list of saved products."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "register" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-xs font-medium tracking-wide text-muted-foreground">
                First Name
              </Label>
              <Input id="firstName" name="firstName" className="rounded-xl" autoComplete="given-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-xs font-medium tracking-wide text-muted-foreground">
                Last Name
              </Label>
              <Input id="lastName" name="lastName" className="rounded-xl" autoComplete="family-name" />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium tracking-wide text-muted-foreground">
            Email
          </Label>
          <Input id="email" name="email" type="email" required className="rounded-xl" autoComplete="email" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={5}
            className="rounded-xl"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full rounded-full">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
        className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

function AccountLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { customer, token, status, reload } = useCustomer();

  useEffect(() => {
    if (status === "in") void refreshSaves(true);
  }, [status]);

  const handleSignOut = async () => {
    await signOutCustomer();
    clearSaves();
    await reload();
    toast.success("You have been signed out.");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-foreground">
              {customer?.firstName ? `Hello, ${customer.firstName}` : "Your Account"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track orders, revisit saved products and keep your details up to date.
            </p>
          </div>
          {status === "in" ? (
            <Button variant="outline" className="rounded-full px-5" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : null}
        </header>

        {status === "checking" ? (
          <div className="rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
            Loading your account…
          </div>
        ) : status === "out" ? (
          <SignInPanel onDone={reload} />
        ) : (
          <CustomerContext.Provider value={{ customer, token, reload }}>
            <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
              <nav aria-label="Account sections" className="lg:w-56 lg:shrink-0">
                <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
                  {navItems.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <li key={item.to} className="shrink-0">
                        <Link
                          to={item.to}
                          className={cn(
                            "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors lg:w-full lg:rounded-xl lg:justify-start",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                          )}
                        >
                          <item.icon className="size-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="min-w-0 flex-1">
                <Outlet />
              </div>
            </div>
          </CustomerContext.Provider>
        )}
      </main>
      <Footer />
    </div>
  );
}
