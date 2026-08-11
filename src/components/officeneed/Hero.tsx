import heroImage from "@/assets/hero-officeneed.jpg";


export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-background">
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-12 pb-14 sm:px-6 sm:pt-16 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16 lg:px-10 lg:pt-20 lg:pb-24">
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
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-7 text-sm font-medium text-foreground transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary"
            >
              Shop Products
            </a>
          </div>

        </div>

        <div className="relative mt-10 lg:mt-0">
          <div className="overflow-hidden rounded-xl bg-surface">
            <img
              src={heroImage}
              alt="A matte black corporate gift box with a metal nameplate, surrounded by a leather notebook and pen, a printed card, a wireless mouse, a keyboard on a felt mousepad, and a glass perfume bottle."
              width={1920}
              height={1088}
              fetchPriority="high"
              decoding="async"
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="aspect-16/10 w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
