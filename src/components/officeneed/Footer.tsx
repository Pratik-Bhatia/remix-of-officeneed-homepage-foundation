import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { footerShopTargets } from "@/lib/navigation";
import { toast } from "sonner";
import logoInverse from "@/assets/officeneed-logo-inverse.png";
import visaAsset from "@/assets/payment-visa.png";
import mastercardAsset from "@/assets/payment-mastercard.png";
import amexAsset from "@/assets/payment-amex.png";
import upiAsset from "@/assets/payment-upi.png";
import rupayAsset from "@/assets/payment-rupay.png";


const benefits = [
  {
    icon: Globe,
    title: "All Over India Shipping",
    description: "We currently ship across India.",
  },
  {
    icon: PackageCheck,
    title: "Next Day Dispatch",
    description: "Orders are dispatched within 24 hours of placing your order.",
  },
  {
    icon: RefreshCcw,
    title: "No Returns and Exchanges",
    description: "All products are non-returnable and non-exchangeable.",
  },
  {
    icon: ShieldCheck,
    title: "No Cash on Delivery",
    description: "Cash on Delivery (COD) is not available. We accept online payments only.",
  },
];

const shopLinks = [
  "Shop All",
  "Bestsellers",
  "Corporate Gifting",
  "Office Stationery",
  "Hardware Supplies",
  "Fragrance & Luxury Gifting",
];

const quickLinks = [
  { label: "Our Story", href: "/about-us" },
  { label: "Our Clients", href: "/clients" },
  { label: "Blog & Insights", href: "/blog" },
  { label: "FAQs", href: "/faqs" },
  { label: "Contact Us", href: "/contact-us" },
];

const bottomLinks = [
  { label: "Shipping & Delivery", href: "/shipping-delivery" },
  { label: "Returns & Exchanges", href: "/returns-refunds" },
  { label: "Cancellation Policy", href: "/cancellation-policy" },
  { label: "Terms & Conditions", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];

const socials = [
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/share/19QDcgdY8n/" },
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/officeneed.in?igsh=Zm1taW1mOXJlY25x" },
  { icon: Linkedin, label: "LinkedIn", href: "https://www.linkedin.com/company/officeneed-in/" },
];

const paymentMethods = [
  { label: "Visa", asset: visaAsset },
  { label: "Mastercard", asset: mastercardAsset },
  { label: "American Express", asset: amexAsset },
  { label: "UPI", asset: upiAsset },
  { label: "RuPay", asset: rupayAsset },
];

function MobileBenefitsCarousel() {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const next = useCallback(
    () => setActive((prev) => (prev + 1) % benefits.length),
    []
  );

  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [isPaused, next]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    if (start == null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const end = touch.clientX;
    const delta = end - start;
    if (delta > 50) {
      setActive((prev) => (prev === 0 ? benefits.length - 1 : prev - 1));
    } else if (delta < -50) {
      next();
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="lg:hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-roledescription="carousel"
        aria-label="Service benefits"
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {benefits.map(({ icon: Icon, title, description }, i) => (
            <div
              key={title}
              className="w-full shrink-0 px-1"
              aria-label={`${i + 1} of ${benefits.length}`}
              aria-hidden={i !== active}
            >
              <div className="flex items-start gap-4">
                <Icon
                  className="mt-0.5 h-7 w-7 shrink-0 text-foreground"
                  strokeWidth={1.4}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-heading text-base font-semibold tracking-tight text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-5 flex justify-center gap-2"
        role="tablist"
        aria-label="Benefit slides"
      >
        {benefits.map((b, i) => (
          <button
            key={b.title}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Go to ${b.title}`}
            onClick={() => {
              setActive(i);
              setIsPaused(true);
            }}
            className={[
              "h-2 w-2 rounded-full transition-all duration-300",
              i === active
                ? "w-5 bg-foreground"
                : "bg-foreground/25 hover:bg-foreground/40",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}


export function Footer() {
  return (
    <footer>
      {/* Benefits strip */}
      <section className="border-t border-border bg-background">
        <div className="mx-auto max-w-[1400px] px-5 py-6 sm:px-8 lg:px-12 lg:py-8">
          {/* Desktop grid */}
          <ul className="hidden grid-cols-2 gap-8 lg:grid lg:grid-cols-4 lg:gap-0">
            {benefits.map(({ icon: Icon, title, description }, i) => (
              <li
                key={title}
                className={[
                  "flex items-start gap-4 lg:px-8",
                  i > 0 ? "lg:border-l lg:border-border" : "",
                ].join(" ")}
              >
                <Icon
                  className="mt-0.5 h-7 w-7 shrink-0 text-foreground"
                  strokeWidth={1.4}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-heading text-base font-semibold tracking-tight text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Mobile carousel */}
          <MobileBenefitsCarousel />
        </div>
      </section>


      {/* Main footer */}
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr] lg:gap-0">
            <nav aria-labelledby="footer-shop" className="lg:pr-10">
              <h2
                id="footer-shop"
                className="font-heading text-lg font-semibold tracking-tight"
              >
                Shop
              </h2>
              <ul className="mt-6 space-y-4">
                {shopLinks.map((label) => (
                  <li key={label}>
                    <Link
                      to="/products"
                      search={footerShopTargets[label] ?? {}}
                      className="text-xs text-background/80 transition-colors hover:text-background sm:text-sm"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-labelledby="footer-quick" className="lg:px-10">
              <h2
                id="footer-quick"
                className="font-heading text-lg font-semibold tracking-tight"
              >
                Quick Links
              </h2>
              <ul className="mt-6 space-y-4">
                {quickLinks.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      to={href as any}
                      className="text-xs text-background/80 transition-colors hover:text-background sm:text-sm"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="md:col-span-2 lg:col-span-1 lg:border-l lg:border-background/15 lg:pl-14">
              <img
                src={logoInverse}
                alt="OfficeNeed — Expect More..."
                className="h-10 w-auto sm:h-12"
              />
              <p className="mt-6 max-w-md font-heading text-lg font-semibold leading-snug tracking-tight text-background sm:text-xl">
                One Vendor. Multiple Solutions.
              </p>

              <form
                className="mt-7 flex max-w-lg items-center gap-3 rounded-full bg-background/10 py-2 pl-6 pr-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget as HTMLFormElement;
                  const input = form.elements.namedItem("email") as HTMLInputElement;
                  const email = input.value.trim();
                  
                  if (!email) {
                    toast.error("Please enter a valid email address.");
                    return;
                  }
                  
                  const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                  btn.disabled = true;
                  const originalContent = btn.innerHTML;
                  btn.innerHTML = `<svg class="animate-spin h-5 w-5 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

                  try {
                    const { submitEnquiry } = await import("@/lib/enquiries.functions");
                    const result = await submitEnquiry({
                      data: {
                        name: "Newsletter Subscriber",
                        email: email,
                        message: "User subscribed to newsletter",
                        category: "Newsletter Subscription"
                      }
                    });
                    
                    if (!result.ok) {
                      toast.error(result.error || "Failed to subscribe.");
                    } else {
                      toast.success("Successfully subscribed to our newsletter!");
                      form.reset();
                    }
                  } catch (err) {
                    toast.error("An error occurred while subscribing.");
                  } finally {
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                  }
                }}
              >
                <label htmlFor="footer-email" className="sr-only">
                  Enter your email
                </label>
                <input
                  id="footer-email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  required
                  className="h-10 min-w-0 flex-1 bg-transparent text-xs text-background outline-none placeholder:text-background/50 sm:text-sm disabled:opacity-50"
                />
                <button
                  type="submit"
                  aria-label="Subscribe to the OfficeNeed newsletter"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground transition-opacity hover:opacity-85 disabled:opacity-50"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </form>

              <ul className="mt-8 flex items-center gap-7">
                {socials.map(({ icon: Icon, label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`OfficeNeed on ${label}`}
                      className="inline-flex text-background/80 transition-colors hover:text-background"
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-background/10 bg-[#171717]/95">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
            <div className="space-y-3">
              <p className="text-xs text-background/75 sm:text-sm">
                © 2026 OfficeNeed. All rights reserved.
              </p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {bottomLinks.map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      to={href as any}
                      className="text-[0.7rem] text-background/60 underline-offset-4 transition-colors hover:text-background hover:underline sm:text-xs"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <ul className="flex flex-wrap items-center gap-3">
              {paymentMethods.map(({ label, asset }) => (
                <li key={label} className="shrink-0">
                  <img
                    src={asset}
                    alt={label}
                    loading="lazy"
                    className="h-8 w-auto min-w-[40px] rounded-md border border-background/20 object-contain"
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </footer>
  );
}

