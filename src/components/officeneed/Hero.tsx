import heroPerfumes from "@/assets/hero-perfumes.png.asset.json";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-x-clip bg-background"
    >
      <div className="mx-auto flex h-[80vh] w-full max-w-[1400px] flex-col items-center justify-center px-5 pb-8 pt-10 text-center sm:px-8 lg:px-12">
        <h1 id="hero-heading" className="text-display">
          Signature Scents
        </h1>

        <p className="text-lede mt-5 max-w-[46ch]">
          Elevate your professional presence with our premium fragrance collection.
        </p>

        <div className="mt-8 flex w-full max-w-[360px] flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
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
          className="mt-10 h-auto w-full max-w-[1100px] object-contain sm:mt-12"
        />
      </div>
    </section>
  );
}
