import heroPerfumes from "@/assets/hero-perfumes.png.asset.json";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-x-clip bg-background"
    >
      <div className="mx-auto flex min-h-[560px] w-full max-w-[1400px] flex-col items-center justify-center px-5 pb-8 pt-8 text-center sm:min-h-[600px] sm:px-8 lg:h-[80vh] lg:min-h-[620px] lg:px-12 lg:pt-10">
        <h1 id="hero-heading" className="text-display">
          Signature Scents
        </h1>

        <p className="text-lede mt-4 max-w-[46ch] sm:mt-5">
          Elevate your professional presence with our premium fragrance collection.
        </p>

        <div className="mt-6 flex w-full max-w-[360px] flex-col items-center gap-3 sm:mt-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
          <a href="#solutions" className="btn-primary w-full rounded-full sm:w-auto">
            Discover Collection
          </a>
          <a href="#bestsellers" className="btn-secondary w-full rounded-full sm:w-auto">
            Shop Perfumes
          </a>
        </div>

        <img
          src={heroPerfumes.url}
          alt="Luxury designer perfume bottles and gift boxes arranged with flowers and botanicals."
          width={1366}
          height={768}
          fetchPriority="high"
          decoding="async"
          sizes="(min-width: 1024px) 90vw, 100vw"
          className="mt-6 h-auto max-h-[40vh] w-full max-w-[1100px] object-contain sm:mt-8"
        />
      </div>
    </section>
  );
}
