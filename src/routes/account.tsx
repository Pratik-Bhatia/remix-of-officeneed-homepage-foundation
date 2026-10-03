import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Package, Heart, Settings, LogOut, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomer, signInCustomer, registerCustomer, signOutCustomer, getCustomerToken, CustomerAuthError } from "@/lib/customer";
import { saveBusinessRegistration } from "@/lib/business-registration.functions";
import { splitFullName } from "@/lib/name-utils";
import { CustomerContext } from "@/lib/customer-context";
import { clearSaves, refreshSaves } from "@/lib/saves";
import { cn } from "@/lib/utils";
import { useB2BStore } from "@/stores/b2bStore";
import { isValidGstin } from "@/lib/gst";

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
  // See CustomerAuthModal.tsx's identical field for the full reasoning --
  // the Company tab's registration form creates an ordinary Shopify
  // customer through the SAME registerCustomer() as B2C, plus a company
  // name/GST intake record; it never grants B2B pricing by itself.
  const [entryType, setEntryType] = useState<"customer" | "company">("customer");
  const [busy, setBusy] = useState(false);
  // Inline, field-level -- not a generic toast -- per the GST requirement.
  // Re-validated (and cleared) on every submit attempt, not on every
  // keystroke, so the error doesn't flicker while the shopper is still
  // mid-typing their GSTIN.
  const [gstError, setGstError] = useState<string | null>(null);
  const isCompanyRegister = entryType === "company" && mode === "register";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setGstError(null);

    if (isCompanyRegister) {
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
        // See CustomerAuthModal.tsx's identical check for the full
        // reasoning -- signing in via the Company tab never grants B2B
        // pricing by itself; this only surfaces whether this customer
        // actually has a real Shopify company/location relationship.
        if (entryType === "company") {
          const signedInToken = getCustomerToken();
          if (signedInToken) await useB2BStore.getState().resolve(signedInToken);
          if (useB2BStore.getState().status === "b2c") {
            toast.warning(
              "Your account is not currently linked to a business account. Please contact OfficeNeed to complete your business setup.",
            );
          }
        }
      } else if (isCompanyRegister) {
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
        const token = getCustomerToken();
        if (token) {
          try {
            await saveBusinessRegistration({ data: { token, companyName, gstNumber } });
          } catch (saveErr) {
            console.error("Failed to save business registration details:", saveErr);
            toast.warning("Account created, but we couldn't save your company details. Please contact OfficeNeed.");
          }
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
      }
      await onDone();
      await refreshSaves(true);
    } catch (error) {
      if (error instanceof CustomerAuthError && error.code === "TAKEN") {
        setMode("signin");
      }
      if (mode === "signin" && !(error instanceof CustomerAuthError)) {
        console.error("Sign-in failed:", error);
        toast.error("We couldn't sign you in right now. Please try again in a moment.");
      } else {
        toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border p-6 sm:p-8">
      <h2 className="text-lg font-medium text-foreground">
        {entryType === "company"
          ? mode === "signin" ? "Sign in to your business account" : "Create your business account"
          : mode === "signin" ? "Sign in to your account" : "Create your account"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {entryType === "company"
          ? mode === "signin"
            ? "Use your business email and password to see your orders and saved products."
            : "Register your business. B2B pricing is enabled separately once OfficeNeed sets up your company account in Shopify."
          : mode === "signin"
            ? "Use the email and password from your Officeneed store account to see your orders and saved products."
            : "Create an account to track your orders and keep a list of saved products."}
      </p>

      <Tabs
        value={entryType}
        onValueChange={(v) => {
          setEntryType(v as "customer" | "company");
          setMode("signin");
        }}
        className="mt-5 w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="customer">Customer</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {isCompanyRegister ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-xs font-medium tracking-wide text-muted-foreground">
                Full Name
              </Label>
              <Input id="fullName" name="fullName" className="rounded-xl" autoComplete="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs font-medium tracking-wide text-muted-foreground">
                Company Name
              </Label>
              <Input id="companyName" name="companyName" className="rounded-xl" autoComplete="organization" required />
            </div>
          </>
        ) : mode === "register" ? (
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

        {isCompanyRegister ? (
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-xs font-medium tracking-wide text-muted-foreground">
              Phone Number
            </Label>
            <Input id="phone" name="phone" type="tel" required className="rounded-xl" autoComplete="tel" placeholder="+91 98765 43210" />
          </div>
        ) : null}

        {isCompanyRegister ? (
          <div className="space-y-2">
            <Label htmlFor="gstNumber" className="text-xs font-medium tracking-wide text-muted-foreground">
              GST Number
            </Label>
            <Input
              id="gstNumber"
              name="gstNumber"
              required
              className="rounded-xl"
              autoComplete="off"
              placeholder="22AAAAA0000A1Z5"
              aria-invalid={gstError ? true : undefined}
              onChange={() => { if (gstError) setGstError(null); }}
            />
            {gstError ? <p className="text-sm text-destructive">{gstError}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground">
            Password
          </Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={5}
            className="rounded-xl"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        {isCompanyRegister ? (
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
            />
          </div>
        ) : null}

        <Button type="submit" disabled={busy} className="w-full rounded-full">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : isCompanyRegister ? "Create Business Account" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
        className="mt-5 w-full text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
      >
        {mode === "signin"
          ? entryType === "company" ? "New business? Create a business account" : "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

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

  if (b2bStatus !== "b2b" && b2bStatus !== "needs-location") return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      {b2bStatus === "needs-location" ? (
        <>
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
        <span className="text-foreground">
          Business account
          {locations.length > 1 ? (
            <>
              {" "}
              —{" "}
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
            </>
          ) : (
            <span className="text-muted-foreground"> — {locations[0]?.name}</span>
          )}
        </span>
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

        {status === "in" ? <B2BAccountStatus /> : null}

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
