import { useEffect, useRef, useState } from "react";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { Link } from "@tanstack/react-router";
import { Menu, MessageSquare, Search, User, X, ChevronDown } from "lucide-react";
import logoUrl from "@/assets/officeneed-logo.png";
import { primaryNavCategories as navCategories, navItemTarget } from "@/lib/navigation";
import { CartDrawer } from "@/components/officeneed/CartDrawer";
import { AiAssistantIcon } from "@/components/officeneed/AiAssistantIcon";
import { cn } from "@/lib/utils";
import { SearchModal } from "./SearchModal";
import { AuthModal } from "./AuthModal";
import { AccountModal } from "./AccountModal";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="OfficeNeed — home"
      className="inline-flex shrink-0 items-center rounded-sm"
    >
      <img
        src={logoUrl}
        alt="OfficeNeed"
        width={640}
        height={122}
        className={cn("h-5 w-auto sm:h-7", className)}
      />
    </Link>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-foreground/75 transition-colors duration-200 hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}


export function Navbar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(navCategories[0]?.id ?? null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      void supabase.auth.getSession()
        .then(({ data: { session } }) => setUser(session?.user ?? null))
        .catch(() => setUser(null));

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch {
      // Authentication is optional for browsing. A missing client config must
      // never prevent the storefront from rendering.
      setUser(null);
    }

    const handleOpenAuth = () => setAuthOpen(true);
    window.addEventListener("open-auth-modal", handleOpenAuth);

    return () => {
      unsubscribe();
      window.removeEventListener("open-auth-modal", handleOpenAuth);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenId(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mobileOpen) lockScroll();
    else unlockScroll();
    return () => unlockScroll();
  }, [mobileOpen]);

  useEffect(() => {
    const handleCloseOverlays = (e: any) => {
      if (e.detail !== "search") setSearchOpen(false);
    };
    window.addEventListener("close-overlays", handleCloseOverlays);
    return () => window.removeEventListener("close-overlays", handleCloseOverlays);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      window.dispatchEvent(new CustomEvent("close-overlays", { detail: "search" }));
    }
  }, [searchOpen]);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenId(null), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const openChat = () => {
    // Reuse an existing chatbot trigger when one is present; otherwise this is
    // a clean hook point for connecting the OfficeNeed chatbot later.
    window.dispatchEvent(new CustomEvent("officeneed:open-chat"));
  };

  const active = navCategories.find((c) => c.id === openId) ?? null;

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <div className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-6 lg:h-20 lg:px-12 xl:flex">
        {/* Left zone: hamburger on mobile/tablet, hidden on desktop */}
        <div className="flex justify-start xl:hidden">
          <IconButton
            label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="size-[26px] md:size-10"
          >
            <Menu className="size-5 md:size-[22px]" strokeWidth={1.6} />
          </IconButton>
        </div>

        {/* Center zone: OfficeNeed logo — viewport-centered on mobile/tablet, left on desktop */}
        <div className="flex justify-center px-2 md:px-6 xl:justify-start xl:px-0">
          <Logo />
        </div>

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="hidden min-w-0 flex-1 justify-center xl:flex">
          <ul className="flex min-w-0 items-center gap-4 xl:gap-8">
            {navCategories.map((cat) => (
              <li key={cat.id} onMouseEnter={() => { cancelClose(); setOpenId(cat.id); }} onMouseLeave={scheduleClose}>
                <button
                  type="button"
                  aria-expanded={openId === cat.id}
                  aria-controls={`menu-${cat.id}`}
                  data-open={openId === cat.id}
                  onClick={() => setOpenId(openId === cat.id ? null : cat.id)}
                  onFocus={() => setOpenId(cat.id)}
                  className={cn(
                    "nav-link h-16 xl:h-20",
                    cat.featured && "font-semibold text-foreground",
                  )}

                >
                  <span className="whitespace-nowrap">{cat.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right zone: utility icons */}
        <div className="flex items-center justify-end gap-0.5 md:gap-2 xl:gap-0.5">
          <button
            type="button"
            aria-label="Open OfficeNeed Chat"
            title="Chat with OfficeNeed"
            onClick={openChat}
            className="chat-pulse inline-flex size-[26px] shrink-0 items-center justify-center rounded-full shadow-sm transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-md md:size-10 xl:size-11"
          >
            <AiAssistantIcon className="chat-icon-wiggle size-full rounded-full" />
          </button>
          <IconButton label="Search" className="size-[26px] md:size-10 xl:size-11" onClick={() => setSearchOpen(true)}>
            <Search className="size-5 md:size-[22px] xl:size-5" strokeWidth={1.6} />
          </IconButton>
          <span className="hidden xl:inline-flex">
            <IconButton label="Account" className="size-[26px] md:size-10 xl:size-11" onClick={() => user ? setAccountOpen(true) : setAuthOpen(true)}>
              <User className="size-5 md:size-[22px] xl:size-5" strokeWidth={1.6} />
            </IconButton>
          </span>
          <CartDrawer triggerClassName="size-[26px] md:size-10 xl:size-11" />
        </div>
      </div>



      {/* Mega menu */}
      <div
        className="hidden xl:block"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        {active && (
          <div
            id={`menu-${active.id}`}
            className="absolute inset-x-0 top-full border-b border-border bg-popover shadow-[0_18px_40px_-30px_rgb(0_0_0_/_0.35)] animate-rise"
          >
            <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[minmax(0,1fr)_2fr] gap-12 px-12 py-8">

              <div>
                <p className="text-eyebrow text-muted-foreground">{active.label}</p>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {active.blurb}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-1 xl:grid-cols-3">
                {active.items.map((item) => (
                  <li key={item}>
                    <Link
                      to="/products"
                      search={navItemTarget(active.id, item)}
                      onClick={() => setOpenId(null)}
                      className="group flex items-center justify-between rounded-md py-2.5 text-[0.875rem] text-foreground/80 transition-colors duration-200 hover:text-foreground"
                    >
                      <span>{item}</span>
                      <span className="translate-x-[-4px] text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </header>

      {/* Mobile drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-0 z-50 flex flex-col bg-background transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] xl:hidden",
          mobileOpen
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none translate-x-full opacity-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
          <Logo />
          <IconButton label="Close menu" onClick={() => setMobileOpen(false)}>
            <X className="size-6" strokeWidth={1.6} />
          </IconButton>
        </div>

        <nav aria-label="Mobile" className="flex-1 overflow-y-auto overscroll-contain px-4 pb-10 sm:px-6" data-scrollable="true">
          <ul className="divide-y divide-border">
            {navCategories.map((cat, i) => {
              const isOpen = expanded === cat.id;
              return (
                <li
                  key={cat.id}
                  className={cn(
                    "transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    mobileOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
                  style={{ transitionDelay: mobileOpen ? `${120 + i * 60}ms` : "0ms" }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : cat.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span
                      className={cn(
                        "font-display text-base tracking-tight",
                        cat.featured && "font-semibold",
                      )}
                    >
                      {cat.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
                        isOpen && "rotate-180",
                      )}
                      strokeWidth={1.6}
                    />
                  </button>
                  {isOpen && (
                    <ul className="pb-4 pl-1">
                      {cat.items.map((item) => (
                        <li key={item}>
                          <Link
                            to="/products"
                            search={navItemTarget(cat.id, item)}
                            onClick={() => setMobileOpen(false)}
                            className="flex min-h-12 items-center text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {item}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          
          <div className="my-6 border-t border-border"></div>
          <div className="flex flex-col gap-2">
            <Link
              to="/clients"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-12 w-full items-center text-[15px] text-muted-foreground hover:text-foreground"
            >
              Our Clients
            </Link>
            <Link
              to="/faqs"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-12 w-full items-center text-[15px] text-muted-foreground hover:text-foreground"
            >
              FAQs
            </Link>
            <Link
              to="/blog"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-12 w-full items-center text-[15px] text-muted-foreground hover:text-foreground"
            >
              Blog
            </Link>
          </div>

          <button
            type="button"
            aria-label="Account"
            onClick={() => {
              setMobileOpen(false);
              user ? setAccountOpen(true) : setAuthOpen(true);
            }}
            className={cn(
              "mt-8 flex min-h-12 items-center gap-3 text-sm text-foreground/80 transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              mobileOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
            style={{ transitionDelay: mobileOpen ? `${120 + navCategories.length * 60}ms` : "0ms" }}
          >
            <User className="size-5" strokeWidth={1.6} />
            Account
          </button>
        </nav>
      </div>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      {user && <AccountModal open={accountOpen} onOpenChange={setAccountOpen} user={user} />}
    </>
  );
}
