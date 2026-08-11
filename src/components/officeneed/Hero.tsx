import heroImage from "@/assets/hero-officeneed.jpg";

function HeroContent() {
  return (
    <>
      <p className="text-eyebrow text-muted-foreground">Corporate Procurement Partner</p>

      <h1 id="hero-heading" className="text-display mt-5 text-balance">
        One Vendor.
        <br />
        Multiple Solutions.
      </h1>

      <p className="text-lede mt-5 max-w-md text-pretty sm:mt-6">
        Corporate procurement made simpler — gifting, stationery, IT, print and luxury,
        sourced and delivered under a single accountable partner.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <a
          href="#solutions"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-[transform,opacity] duration-200 hover:opacity-90 active:scale-[0.99]"
        >
          Explore Solutions
        </a>
        <a
          href="#products"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-foreground/20 bg-background/70 px-7 text-sm font-medium text-foreground backdrop-blur-[2px] transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary"
        >
          Shop Products
        </a>
      </div>
    </>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="w-full overflow-hidden bg-background">
      {/* Announcement strip */}
      <div className="w-full border-b border-border bg-secondary/60">
        <p className="mx-auto max-w-[1440px] px-5 py-3 text-center text-sm text-foreground sm:px-8">
          Try out the AI recommendation for the best results
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:gap-8 lg:px-12 lg:py-20">
        <div className="animate-rise max-w-xl">
          <HeroContent />
        </div>

        <div className="mx-auto w-[88%] sm:w-[72%] lg:w-full">
          <img
            src={heroImage}
            alt="Stack of OfficeNeed branded gift boxes and shopping bags in ivory white with black rope handles."
            width={940}
            height={790}
            fetchPriority="high"
            decoding="async"
            sizes="(min-width: 1024px) 50vw, 80vw"
            className="h-auto w-full object-contain"
          />
        </div>
      </div>
    </section>
  );
}

