import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, Heart, Settings, LogOut, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { CustomerAuthModal } from "@/components/officeneed/CustomerAuthModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomer, signOutCustomer } from "@/lib/customer";
import { CustomerContext } from "@/lib/customer-context";
import { clearSaves, refreshSaves } from "@/lib/saves";
import { cn } from "@/lib/utils";
import { useB2BStore } from "@/stores/b2bStore";

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

/** Read-only business-account indicator, plus the location picker when the
 * signed-in customer is assigned to more than one company location.
 * Purely informational -- status/locations/companyLocationId all come
 * from the server-resolved b2bStore (see src/lib/b2b.functions.ts),
 * never anything client-controlled. */
function B2BAccountStatus() {
  const b2bStatus = useB2BStore((s) => s.status);
  const locations = useB2BStore((s) => s.locations);
  const companyLocationId = useB2BStore((s) => s.companyLocationId);
  const selectLocation = useB2BStore((s) => s.selectLocation);
  const queryClient = useQueryClient();

  if (b2bStatus === "b2c") {
    return (
      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Buying for a company?</span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => window.dispatchEvent(new Event("open-auth-modal"))}
        >
          Register my business
        </button>
      </div>
    );
  }
  if (b2bStatus !== "b2b" && b2bStatus !== "needs-location") return null;

  return (
    <div className="mt-4 mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm">
      {b2bStatus === "needs-location" ? (
        <>
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Select your business location to see your company pricing:</span>
          <Select
            onValueChange={(id) => {
              selectLocation(id);
              queryClient.invalidateQueries({ queryKey: ["shopify"] });
            }}
          >
            <SelectTrigger className="h-8 w-auto min-w-[180px] rounded-lg">
              <SelectValue placeholder="Choose a location" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <div className="flex w-full min-w-0 items-center gap-6 sm:gap-8">
          <div className="flex shrink-0 items-center gap-3">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-foreground">Business account</span>
          </div>
          <div className="flex min-w-0 items-center border-l border-border pl-6 sm:pl-8">
            {locations.length > 1 ? (
              <Select
                {...(companyLocationId ? { value: companyLocationId } : {})}
                onValueChange={(id) => {
                  selectLocation(id);
                  queryClient.invalidateQueries({ queryKey: ["shopify"] });
                }}
              >
                <SelectTrigger className="inline-flex h-7 w-auto min-w-[160px] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // Display only: company setup names the default location
              // "<Company> - Head Office"; the bar shows just the company name.
              <span className="min-w-0 truncate font-medium text-foreground">
                {locations[0]?.name.replace(/\s+-\s+Head Office$/i, "")}
              </span>
            )}
          </div>
        </div>
      )}
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
      <main className="flex-1 w-full bg-[#F5F5F7]">
        <div
          className={cn(
            "mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8",
            // Unauthenticated view shares the auth card's own max-w-4xl
            // container so the heading/subheading left-align with the
            // card instead of the wider signed-in dashboard's max-w-6xl.
            status === "out" ? "max-w-4xl" : "max-w-6xl",
          )}
        >
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

          {status === "in" ? <B2BAccountStatus /> : null}

          {status === "checking" ? (
            <div className="rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
              Loading your account…
            </div>
          ) : status === "out" ? (
            // Same component/state/logic as the global modal (see
            // CustomerAuthModal.tsx's `embedded` prop) -- no second
            // authentication implementation. `useCustomer()` above already
            // listens for the same token-change event signInCustomer/
            // registerCustomer fire on success, so it re-resolves `status`
            // to "in" on its own once embedded sign-in/registration
            // succeeds; no onDone/reload callback or navigation is needed
            // here, which is what lets the originally-requested child route
            // (e.g. /account/orders) render next instead of redirecting
            // to the bare /account index.
            <CustomerAuthModal embedded />
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
        </div>
      </main>
      <Footer />
    </div>
  );
}
