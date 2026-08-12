import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, MessageSquare, Search, ShoppingBag, User, X, ChevronDown } from "lucide-react";
import logoUrl from "@/assets/officeneed-logo.png";
import { primaryNavCategories as navCategories } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground/75 sm:size-11 transition-colors duration-200 hover:bg-secondary hover:text-foreground"
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
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

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
      <div className="relative mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-12 xl:flex">
        {/* Mobile menu toggle — left on mobile/tablet, hidden on desktop */}
        <div className="shrink-0 xl:hidden">
          <IconButton label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5 sm:size-[22px]" strokeWidth={1.6} />
          </IconButton>
        </div>

        {/* Logo — absolutely centered on mobile/tablet, left on desktop */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shrink-0 xl:static xl:transform-none">
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

        {/* Utility icons */}
        <div className="flex shrink-0 items-center justify-end gap-0.5">
          <button
            type="button"
            aria-label="Open OfficeNeed Chat"
            title="Chat with OfficeNeed"
            onClick={openChat}
            className="chat-pulse inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-md sm:size-11"
          >
            <MessageSquare className="chat-icon-wiggle size-5 sm:size-[22px]" strokeWidth={1.6} />
          </button>
          <IconButton label="Search">
            <Search className="size-5 sm:size-[22px]" strokeWidth={1.6} />
          </IconButton>
          <span className="hidden xl:inline-flex">
            <IconButton label="Account">
              <User className="size-5 sm:size-[22px]" strokeWidth={1.6} />
            </IconButton>
          </span>
          <IconButton label="Cart">
            <ShoppingBag className="size-5 sm:size-[22px]" strokeWidth={1.6} />
          </IconButton>
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
                    <a
                      href="#"
                      className="group flex items-center justify-between rounded-md py-2.5 text-[0.875rem] text-foreground/80 transition-colors duration-200 hover:text-foreground"
                    >
                      <span>{item}</span>
                      <span className="translate-x-[-4px] text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-background xl:hidden"
        >
          <div className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
            <Logo />
            <IconButton label="Close menu" onClick={() => setMobileOpen(false)}>
              <X className="size-6" strokeWidth={1.6} />
            </IconButton>
          </div>

          <nav aria-label="Mobile" className="flex-1 overflow-y-auto overscroll-contain px-4 pb-10 sm:px-6">
            <ul className="divide-y divide-border">
              {navCategories.map((cat) => {
                const isOpen = expanded === cat.id;
                return (
                  <li key={cat.id}>
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
                            <a
                              href="#"
                              className="flex min-h-12 items-center text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {item}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            <a
              href="#"
              className="mt-8 flex min-h-12 items-center gap-3 text-sm text-foreground/80"
            >
              <User className="size-5" strokeWidth={1.6} />
              Account
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
