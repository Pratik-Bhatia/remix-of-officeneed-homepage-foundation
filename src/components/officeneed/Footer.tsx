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
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import logoInverse from "@/assets/officeneed-logo-inverse.png";
import visaAsset from "@/assets/payment-visa.png";
import mastercardAsset from "@/assets/payment-mastercard.png";
import amexAsset from "@/assets/payment-amex.png";
import upiAsset from "@/assets/payment-upi.png";
import rupayAsset from "@/assets/payment-rupay.png";


const benefits = [
  {
    icon: Globe,
    title: "Global Shipping",
    description: "Shipping to the US, UK and many more",
  },
  {
    icon: PackageCheck,
    title: "Next Day Dispatch",
    description: "Dispatch within 24 hours of order",
  },
  {
    icon: RefreshCcw,
    title: "Returns and Exchanges",
    description: "Easy 30 days Returns and Exchanges",
  },
  {
    icon: ShieldCheck,
    title: "Cash on Delivery",
    description: "Opt for COD among other payment methods",
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
  "Exchanges or Returns",
  "Our Story",
  "Shipping Policy",
  "Terms & Conditions",
  "Privacy Policy",
  "Contact Us",
];

const bottomLinks = [
  "Refund Policy",
  "Privacy Policy",
  "Terms & Conditions",
  "Shipping Policy",
  "Contact Us",
];

const socials = [
  { icon: Facebook, label: "Facebook" },
  { icon: Instagram, label: "Instagram" },
  { icon: Linkedin, label: "LinkedIn" },
  { icon: Youtube, label: "YouTube" },
];

const paymentMethods = [
  { label: "Visa", asset: visaAsset },
  { label: "Mastercard", asset: mastercardAsset },
  { label: "American Express", asset: amexAsset },
  { label: "UPI", asset: upiAsset },
  { label: "RuPay", asset: rupayAsset },
];

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
                className="font-heading text-xl font-semibold tracking-tight"
              >
                Shop
              </h2>
              <ul className="mt-6 space-y-4">
                {shopLinks.map((label) => (
                  <li key={label}>
                    <Link
                      to="/"
                      className="text-sm text-background/80 transition-colors hover:text-background"
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
                className="font-heading text-xl font-semibold tracking-tight"
              >
                Quick Links
              </h2>
              <ul className="mt-6 space-y-4">
                {quickLinks.map((label) => (
                  <li key={label}>
                    <Link
                      to="/"
                      className="text-sm text-background/80 transition-colors hover:text-background"
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
              <p className="mt-6 max-w-md font-heading text-xl font-semibold leading-snug tracking-tight text-background sm:text-2xl">
                One Vendor. Multiple Solutions.
              </p>

              <form
                className="mt-7 flex max-w-lg items-center gap-3 rounded-full bg-background/10 py-2 pl-6 pr-2"
                onSubmit={(e) => e.preventDefault()}
              >
                <label htmlFor="footer-email" className="sr-only">
                  Enter your email
                </label>
                <input
                  id="footer-email"
                  type="email"
                  placeholder="Enter your email"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-background outline-none placeholder:text-background/50"
                />
                <button
                  type="submit"
                  aria-label="Subscribe to the OfficeNeed newsletter"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground transition-opacity hover:opacity-85"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </form>

              <ul className="mt-8 flex items-center gap-7">
                {socials.map(({ icon: Icon, label }) => (
                  <li key={label}>
                    <a
                      href="#"
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
              <p className="text-sm text-background/75">
                © 2026 OfficeNeed. All rights reserved.
              </p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {bottomLinks.map((label) => (
                  <li key={label}>
                    <Link
                      to="/"
                      className="text-xs text-background/60 underline-offset-4 transition-colors hover:text-background hover:underline"
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
