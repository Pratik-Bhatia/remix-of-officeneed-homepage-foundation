import { useEffect, useRef, useState } from "react";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PromoAnnouncementBar } from "@/components/officeneed/PromoAnnouncementBar";
import { Menu, MessageSquare, Search, User, X, ChevronDown, ChevronRight, PackageSearch } from "lucide-react";
import logoUrl from "@/assets/officeneed-logo.svg";
import { primaryNavCategories as navCategories, navItemTarget, navCategoryTarget, getLiveNavLabel } from "@/lib/navigation";
import { useShopifyCollections } from "@/lib/shopify-overlay";
import { CartDrawer } from "@/components/officeneed/CartDrawer";
import { cn } from "@/lib/utils";
import { SearchModal } from "./SearchModal";
import { CustomerAuthModal } from "./CustomerAuthModal";
import { useCustomer } from "@/lib/customer";

// sessionStorage (not localStorage): this gates a once-per-TAB-SESSION
// auto-popup, not a permanent dismissal -- a fresh browser session (or a
// fresh incognito window) should see it again. No existing OfficeNeed
// preference system covers this, so this is its own narrowly-scoped key.
const AUTH_POPUP_SHOWN_KEY = "officeneed_auth_popup_shown";
// When this tab session first reached the storefront. Navbar is rendered
// per route (it remounts on every navigation), so the 20s countdown is
// measured from this persisted timestamp -- navigating never restarts it.
const AUTH_POPUP_ENTERED_AT_KEY = "officeneed_auth_popup_entered_at";
const AUTH_POPUP_DELAY_MS = 20_000;
// While the popup is due but blocked (another dialog open, excluded route),
// re-check this often instead of covering whatever the visitor is doing.
const AUTH_POPUP_RETRY_MS = 1_500;
// The AUTOMATIC popup never covers these (prefix match): the cart (the
// step right before Shopify's own checkout), /account (which already
// renders the sign-in form inline when signed out), and the auth flows.
// Manual entry points are unaffected.
const AUTO_POPUP_EXCLUDED_PREFIXES = ["/cart", "/account", "/auth", "/activate", "/password-reset", "/reset-password"];

function markAuthPopupShown() {
  try {
    sessionStorage.setItem(AUTH_POPUP_SHOWN_KEY, "true");
  } catch {
    // storage unavailable -- nothing to persist
  }
}

// Shiplystic's own branded tracking portal -- replaces the earlier
// custom /track-order page. Navigates in the SAME tab (window.location.href,
// not window.open) so this is a normal top-level redirect, not a popup.
const SHIPLYSTIC_TRACKING_URL = "https://app.shiplystic.com/track/SLY26091";

// Routes where an auth popup -- automatic (first-visit) or programmatic
// (the shared open-auth-modal event, e.g. a session-expiry re-prompt)
// -- must never cover the page: Shopify's password-reset email link
// lands here with a one-time reset token in the URL, and a popup
// appearing over it blocks completing the reset. No explicit,
// user-clicked auth entry point (account icon, cart/wishlist "sign in",
// the B2B upgrade prompt) is reachable from this page in the first
// place, so suppressing both triggers here doesn't affect any of them.
const AUTH_POPUP_SUPPRESSED_ROUTES = ["/password-reset"];

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Officeneed — home"
      className="inline-flex shrink-0 items-center rounded-sm"
    >
      <img
        src={logoUrl}
        alt="Officeneed — Expect More"
        width={195}
        height={48.75}
        className={cn("block h-auto w-[156px] object-contain md:w-[175.5px] xl:w-[195px]", className)}
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
  // No category expanded by default -- was previously seeded with
  // navCategories[0]'s id, so "Officeneed Exclusive" opened automatically
  // every time the drawer mounted, and then stayed stuck at whatever the
  // shopper last expanded (since this state outlives the drawer's own
  // open/close, the Navbar component never unmounts) on every subsequent
  // open. Reset to null whenever the drawer closes, below.
  const [expanded, setExpanded] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SearchModal anchors its panel to this header's real bottom edge.
  const headerRef = useRef<HTMLElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // Which tab the auth modal opens on for an anonymous visitor -- set by
  // the Personal/Business Shopping mode switcher's "use a different
  // email" flow via open-auth-modal's optional CustomEvent detail (see
  // ShoppingModeSwitcher.tsx); every other dispatch site uses the plain
  // Event form, which has no `.detail`, so this stays undefined (the
  // modal's own default) for all of them.
  const [authEntryType, setAuthEntryType] = useState<"customer" | "company" | undefined>(undefined);

  const { status } = useCustomer();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Live Shopify collection titles for nav labels -- same cached query
  // every other page that needs collection data already uses (React
  // Query dedupes by queryKey, so this doesn't add a network request).
  const { collections } = useShopifyCollections();

  useEffect(() => {
    const handleOpenAuth = (e: Event) => {
      if (AUTH_POPUP_SUPPRESSED_ROUTES.includes(pathname)) return;
      const entryType = (e as CustomEvent<{ entryType?: "customer" | "company" }>).detail?.entryType;
      setAuthEntryType(entryType);
      setAuthOpen(true);
    };
    window.addEventListener("open-auth-modal", handleOpenAuth);

    return () => {
      window.removeEventListener("open-auth-modal", handleOpenAuth);
    };
  }, [pathname]);

  // Automatic auth popup, 20s after this tab session entered the
  // storefront. Reuses the exact same modal/state as every other entry
  // point above (setAuthOpen) -- no second modal. Gated on `status` (the
  // same useCustomer() value the Account icon checks): "checking" is never
  // treated as signed out, and a signed-in visitor never gets it.
  //
  // At most once per tab session: AUTH_POPUP_SHOWN_KEY is set the moment
  // it auto-opens (so closing it never brings it back this session), and
  // also when the visitor opens the modal manually first (which cancels
  // the automatic one). Re-runs only reschedule from the persisted entry
  // time, and each run's cleanup clears its timer -- one timer at a time,
  // cancelled on unmount.
  // The countdown starts when the session's first storefront page began
  // loading (performance.timeOrigin = that navigation's start), so neither
  // page hydration nor the customer status check adds to the 20s.
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(AUTH_POPUP_ENTERED_AT_KEY)) {
        const navigationStart = Math.round(performance.timeOrigin) || Date.now();
        sessionStorage.setItem(AUTH_POPUP_ENTERED_AT_KEY, String(navigationStart));
      }
    } catch {
      // storage unavailable -- the effect below then never auto-opens
    }
  }, []);
  useEffect(() => {
    if (status !== "out") return;
    let enteredAt: number;
    try {
      if (sessionStorage.getItem(AUTH_POPUP_SHOWN_KEY)) return;
      if (authOpen) {
        markAuthPopupShown(); // opened manually first -- cancel the automatic one
        return;
      }
      enteredAt = Number(sessionStorage.getItem(AUTH_POPUP_ENTERED_AT_KEY)) || Date.now();
    } catch {
      // Private-mode/storage-disabled: fail safe to never auto-opening
      // rather than re-opening on every navigation.
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const tryOpen = () => {
      const blocked =
        AUTO_POPUP_EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
        searchOpen ||
        mobileOpen ||
        // Any other visible dialog (cart drawer, enquiry, chat, ...).
        document.querySelector('[role="dialog"]:not([aria-hidden="true"])') !== null;
      if (blocked) {
        timer = setTimeout(tryOpen, AUTH_POPUP_RETRY_MS);
        return;
      }
      markAuthPopupShown();
      setAuthEntryType(undefined);
      setAuthOpen(true);
    };
    timer = setTimeout(tryOpen, Math.max(0, enteredAt + AUTH_POPUP_DELAY_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [status, pathname, authOpen, searchOpen, mobileOpen]);

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

  // Collapse any open accordion the moment the drawer closes, so the next
  // open always starts fully collapsed rather than carrying over whatever
  // the shopper last expanded (this component never unmounts between
  // opens, so without this the state would otherwise persist).
  useEffect(() => {
    if (!mobileOpen) setExpanded(null);
  }, [mobileOpen]);

  // Broadcasts whether ANY blocking overlay this file owns (the mobile
  // drawer, or the sign-in/register/forgot-password modal -- "forgot" is
  // just an internal `mode` of the same Dialog, not a separate overlay, so
  // authOpen alone already covers it) is currently open, so the floating
  // chat launcher (a sibling component, not a child, so it can't read this
  // state directly) can hide itself while one of them covers the screen.
  // A single combined boolean -- rather than one event per overlay --
  // means switching straight from one overlay to the other never produces
  // a frame where the launcher flashes back in between them. Same
  // lightweight window-event pattern this file already uses for
  // close-overlays/open-overlays, just mirroring a live boolean instead of
  // firing a one-shot "close yourself" command.
  useEffect(() => {
    const blockingOverlayOpen = mobileOpen || authOpen;
    window.dispatchEvent(new CustomEvent("officeneed:overlay-toggle", { detail: { open: blockingOverlayOpen } }));
  }, [mobileOpen, authOpen]);

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

  const active = navCategories.find((c) => c.id === openId) ?? null;

  return (
    <>
    {/* Rendered here (not per route) so every page that has a navbar gets
        exactly one bar; it decides for itself whether the page warrants one. */}
    <PromoAnnouncementBar />
    <header ref={headerRef} className="sticky top-0 z-50 w-full border-b border-border bg-background">
      <div className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-6 lg:h-20 lg:px-12 xl:flex">
        {/* Left zone: hamburger on mobile/tablet, hidden on desktop */}
        <div className="flex justify-start xl:hidden">
          <IconButton
            label="Open navigation menu"
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
                <Link
                  to="/products"
                  search={navCategoryTarget(cat.id)}
                  aria-expanded={openId === cat.id}
                  aria-controls={`menu-${cat.id}`}
                  data-open={openId === cat.id}
                  onFocus={() => setOpenId(cat.id)}
                  onClick={() => setOpenId(null)}
                  className={cn(
                    "nav-link h-16 xl:h-20",
                    cat.featured && "font-semibold text-foreground",
                  )}
                >
                  <span className="whitespace-nowrap">{getLiveNavLabel(collections, cat.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right zone: utility icons */}
        <div className="flex items-center justify-end gap-0.5 md:gap-2 xl:gap-0.5">
          <IconButton label="Search store" className="size-[26px] md:size-10 xl:size-11" onClick={() => setSearchOpen(true)}>
            <Search className="size-5 md:size-[22px] xl:size-5" strokeWidth={1.6} />
          </IconButton>
          {/* Hidden on phones (< md); the mobile menu drawer has its own Track order entry. */}
          <span className="hidden md:inline-flex">
            <IconButton label="Track order" className="size-[26px] md:size-10 xl:size-11" onClick={() => { window.location.href = SHIPLYSTIC_TRACKING_URL; }}>
              <PackageSearch className="size-5 md:size-[22px] xl:size-5" strokeWidth={1.6} />
            </IconButton>
          </span>
          <span className="hidden xl:inline-flex">
            <IconButton label="Account" className="size-[26px] md:size-10 xl:size-11" onClick={() => status === "in" ? navigate({ to: "/account" }) : setAuthOpen(true)}>
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
                <p className="text-eyebrow text-muted-foreground">{getLiveNavLabel(collections, active.label)}</p>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {active.blurb}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-2 xl:flex xl:flex-wrap xl:gap-x-10 xl:gap-y-4">
                {active.items.map((item) => (
                  <li key={item}>
                    <Link
                      to="/products"
                      search={navItemTarget(active.id, item)}
                      onClick={() => setOpenId(null)}
                      className="group flex items-center justify-between rounded-md py-2.5 text-[0.875rem] text-foreground/80 transition-colors duration-200 hover:text-foreground"
                    >
                      <span>{getLiveNavLabel(collections, item)}</span>

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
                      {getLiveNavLabel(collections, cat.label)}
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
                    <ul className="pb-2">
                      {cat.items.map((item) => (
                        <li key={item}>
                          <Link
                            to="/products"
                            search={navItemTarget(cat.id, item)}
                            onClick={() => setMobileOpen(false)}
                            className="flex min-h-12 items-center py-3 pl-4 text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {getLiveNavLabel(collections, item)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          
          {/* Account -- the mobile drawer's informational links (Our
              Clients/FAQs/Blog) and the divider that used to sit below the
              category list were both removed in a later simplification
              pass; those pages/links still exist everywhere else (desktop
              nav, footer), just not duplicated in this drawer. Account's
              own mt-4 is now the only, intentional gap below the category
              list. Set apart with its own margin, soft bg-muted highlight,
              and bold label + supporting line so sign-in/registration
              stays discoverable. Reuses the existing design system's own
              neutral tokens (bg-muted, text-foreground) rather than
              introducing a new accent color -- this app's palette has no
              blue token anywhere. Same onClick/auth logic as before:
              unauthenticated taps open the existing CustomerAuthModal
              (Individual/Corporate), signed-in taps go straight to
              /account -- nothing about the auth flow itself changed. */}
          <button
            type="button"
            aria-label="Account — sign in, create an account, or view your orders"
            onClick={() => {
              setMobileOpen(false);
              status === "in" ? navigate({ to: "/account" }) : setAuthOpen(true);
            }}
            className={cn(
              "mt-4 flex w-full items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 text-left transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:bg-secondary",
              mobileOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
            style={{ transitionDelay: mobileOpen ? `${120 + navCategories.length * 60}ms` : "0ms" }}
          >
            <User className="size-5 shrink-0 text-foreground" strokeWidth={1.8} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">Account</span>
              <span className="block text-xs text-muted-foreground">Access your orders and saved products.</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Track order — check the status of a shipment"
            onClick={() => {
              setMobileOpen(false);
              window.location.href = SHIPLYSTIC_TRACKING_URL;
            }}
            className={cn(
              "mt-2 flex w-full items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 text-left transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:bg-secondary",
              mobileOpen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
            style={{ transitionDelay: mobileOpen ? `${120 + (navCategories.length + 1) * 60}ms` : "0ms" }}
          >
            <PackageSearch className="size-5 shrink-0 text-foreground" strokeWidth={1.8} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">Track order</span>
              <span className="block text-xs text-muted-foreground">Check the status of a shipment.</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          </button>
        </nav>
      </div>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} anchorRef={headerRef} />
      <CustomerAuthModal open={authOpen} onOpenChange={setAuthOpen} initialEntryType={authEntryType} />
    </>
  );
}
