import heroImage from "@/assets/hero-officeneed.jpg";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-hidden bg-background"
    >
      {/* Full-bleed visual layer */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="OfficeNeed branded corporate gift set: a black ribboned gift box, insulated bottle, notebooks, pens, perfume, leather organiser, tech pouch, mouse, keyboard and cufflinks arranged on a warm neutral surface."
          width={1672}
          height={941}
          fetchPriority="high"
          decoding="async"
          sizes="100vw"
          className="h-full w-full object-cover object-[72%_center] sm:object-[65%_center] lg:object-center"
        />
        {/* Subtle readability treatment toward the text side */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background/35 lg:bg-gradient-to-r lg:from-background/92 lg:via-background/70 lg:to-transparent"
        />
      </div>

      {/* Content layer */}
      <div className="relative mx-auto flex min-h-[78vh] w-full max-w-[1440px] items-end px-5 pt-24 pb-14 sm:min-h-[80vh] sm:px-8 lg:min-h-[82vh] lg:items-center lg:px-12 lg:py-28">
        <div className="animate-rise max-w-xl">
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
        </div>
      </div>
    </section>
  );
}
