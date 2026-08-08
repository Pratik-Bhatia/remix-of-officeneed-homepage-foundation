import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, Search, ShoppingBag, User, X, ChevronDown } from "lucide-react";
import logoAsset from "@/assets/officeneed-logo.png.asset.json";
import { navCategories } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="OfficeNeed — home"
      className="inline-flex shrink-0 items-center rounded-sm"
    >
      <img
        src={logoAsset.url}
        alt="OfficeNeed"
        width={640}
        height={122}
        className={cn("h-6 w-auto sm:h-7", className)}
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
      className="inline-flex size-11 items-center justify-center rounded-full text-foreground/75 transition-colors duration-200 hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function Navbar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(navCategories[0].id);
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

  const active = navCategories.find((c) => c.id === openId) ?? null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-10">
        <Logo />

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-7 xl:gap-9">
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
                    "nav-link h-16 lg:h-[72px]",
                    cat.featured && "font-semibold text-foreground",
                  )}
                >
                  <span className="whitespace-nowrap">{cat.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
          <IconButton label="Search">
            <Search className="size-5" strokeWidth={1.6} />
          </IconButton>
          <span className="hidden lg:inline-flex">
            <IconButton label="Account">
              <User className="size-5" strokeWidth={1.6} />
            </IconButton>
          </span>
          <IconButton label="Cart">
            <ShoppingBag className="size-5" strokeWidth={1.6} />
          </IconButton>
          <span className="lg:hidden">
            <IconButton label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="size-6" strokeWidth={1.6} />
            </IconButton>
          </span>
        </div>
      </div>

      {/* Mega menu */}
      <div
        className="hidden lg:block"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        {active && (
          <div
            id={`menu-${active.id}`}
            className="absolute inset-x-0 top-full border-b border-border bg-popover/95 backdrop-blur-xl animate-rise"
          >
            <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_2fr] gap-12 px-10 py-10">
              <div>
                <p className="text-eyebrow text-accent-foreground/70">{active.label}</p>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {active.blurb}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-1 xl:grid-cols-3">
                {active.items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="group flex items-center justify-between rounded-md py-2.5 text-[0.95rem] text-foreground/80 transition-colors duration-200 hover:text-foreground"
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden"
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
                          "font-display text-lg tracking-tight",
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
                              className="flex min-h-12 items-center text-[0.95rem] text-muted-foreground transition-colors hover:text-foreground"
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
    </header>
  );
}
