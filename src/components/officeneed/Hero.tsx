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
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-hidden bg-background"
    >
      {/* Desktop background image: scaled down ~15% and anchored right */}
      <div className="absolute inset-0 hidden lg:flex lg:justify-end">
        <div className="h-full w-[85%] xl:w-[82%]">
          <img
            src={heroImage}
            alt="OfficeNeed branded corporate gift set: a black ribboned gift box, insulated bottle, notebooks, pens, perfume, leather organiser, tech pouch, mouse, keyboard and cufflinks arranged on a warm neutral surface."
            width={1672}
            height={941}
            fetchPriority="high"
            decoding="async"
            sizes="86vw"
            className="h-full w-full object-cover object-center"
          />
        </div>
      </div>

      {/* Reduced gradient wash — localized behind the text area only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-background/80 via-background/35 to-transparent lg:block lg:w-[55%]"
      />

      {/* Content layer */}
      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-28">
        <div className="lg:flex lg:min-h-[78vh] lg:items-center">
          <div className="animate-rise mx-auto max-w-xl lg:mx-0">
            <HeroContent />
          </div>
        </div>

        {/* Mobile/tablet product visual — scaled down and placed below content */}
        <div className="mx-auto mt-10 w-[80%] sm:w-[70%] lg:hidden">
          <img
            src={heroImage}
            alt="OfficeNeed branded corporate gift set: a black ribboned gift box, insulated bottle, notebooks, pens, perfume, leather organiser, tech pouch, mouse, keyboard and cufflinks arranged on a warm neutral surface."
            width={1672}
            height={941}
            decoding="async"
            sizes="80vw"
            className="h-auto w-full object-contain"
          />
        </div>
      </div>
    </section>
  );
}

