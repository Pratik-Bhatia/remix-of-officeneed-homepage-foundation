import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ComingSoonBannerProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  ctaLabel?: string;
  /** Reuses an existing route -- defaults to the full catalogue so this
   * stays safe to drop into any empty category without a per-category
   * route to invent. */
  ctaTo?: string;
}

/** Small vector gift-box illustration (no external image asset, no risk
 * of embedded fake branding/text) -- crisp at any resolution, themeable
 * via currentColor-free fixed brand tones below. */
function GiftBoxIllustration() {
  return (
    <div className="relative w-36 shrink-0 sm:w-44 lg:w-48">
      <svg viewBox="0 0 200 200" className="h-auto w-full drop-shadow-[0_18px_30px_rgba(169,130,56,0.18)]" role="img" aria-label="Gift box">
        <rect x="28" y="82" width="144" height="96" rx="8" fill="#FBF7EE" stroke="#E7D9B8" strokeWidth="1.5" />
        <rect x="18" y="58" width="164" height="30" rx="7" fill="#F7EFDC" stroke="#E7D9B8" strokeWidth="1.5" />
        <rect x="88" y="58" width="24" height="120" fill="#CDA64E" />
        <rect x="18" y="68" width="164" height="13" fill="#CDA64E" />
        <path d="M100 60 C 78 38, 50 44, 57 66 C 63 82, 90 72, 100 60 Z" fill="#D9B968" />
        <path d="M100 60 C 122 38, 150 44, 143 66 C 137 82, 110 72, 100 60 Z" fill="#D9B968" />
        <circle cx="100" cy="60" r="9" fill="#B8923E" />
      </svg>
      <div aria-hidden className="absolute -right-3 top-3 flex -rotate-6 flex-col items-center sm:-right-5">
        <span className="h-7 w-px bg-[#CDA64E]/60" />
        <div className="rounded-sm border border-[#DECB9A] bg-[#FFFDF7] px-2.5 py-1.5 text-center shadow-sm">
          <span className="block text-[8.5px] font-medium leading-tight tracking-wide text-[#8A6D2F] sm:text-[9.5px]">
            More Products
            <br />
            Coming Soon
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Premium promotional banner shown in place of a bare empty-category
 * message when a category/subcategory currently has zero products (see
 * products.index.tsx's showComingSoonBanner). Reusable across categories:
 * copy/CTA are all props with sensible defaults so a future empty
 * category can pass its own without touching this file.
 */
export function ComingSoonBanner({
  eyebrow = "MORE PRODUCTS",
  heading = "Coming Soon",
  description = "We're adding a wide range of premium corporate gifting products to this category. Stay tuned for exciting options.",
  ctaLabel = "Explore Other Categories",
  ctaTo = "/products",
}: ComingSoonBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#EBDFC2] bg-gradient-to-br from-[#FBF6EC] via-[#F8F0DE] to-[#F2E6C9] px-6 py-10 sm:px-10 sm:py-12 md:flex md:min-h-[280px] md:items-center md:px-14 md:py-0">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-gradient-to-br from-[#D9B968]/25 to-transparent blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 size-64 rounded-full bg-gradient-to-tr from-[#D9B968]/15 to-transparent blur-2xl" />

      <div className="relative flex flex-col items-center gap-8 text-center md:w-full md:flex-row md:items-center md:justify-between md:gap-12 md:text-left">
        <div className="max-w-md">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#A8823D]">{eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            {heading}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
          <Button asChild className="mt-6 rounded-full px-6">
            <Link to={ctaTo}>
              {ctaLabel}
              <ArrowRight className="ml-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <GiftBoxIllustration />
      </div>
    </div>
  );
}
