import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, Heart, Settings } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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

function AccountLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [status, setStatus] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (active) setStatus(data.session ? "in" : "out");
      } catch {
        if (active) setStatus("out");
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setStatus(session ? "in" : "out");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-foreground">Your Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track orders, revisit saved products and keep your details up to date.
          </p>
        </header>

        {status === "checking" ? (
          <div className="rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
            Loading your account…
          </div>
        ) : status === "out" ? (
          <div className="rounded-2xl border border-border p-10 text-center">
            <h2 className="text-lg font-medium text-foreground">Sign in to view your account</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              You need to be signed in to see your orders, saved products and account settings.
            </p>
            <Button
              className="mt-6 rounded-full px-6"
              onClick={() => navigate({ to: "/auth", search: { redirect: pathname } })}
            >
              Sign in
            </Button>
          </div>
        ) : (
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
        )}
      </main>
      <Footer />
    </div>
  );
}
