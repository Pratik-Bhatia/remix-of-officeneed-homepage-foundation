export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-x-clip bg-background"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center px-5 pb-24 pt-24 text-center sm:px-8 lg:px-12">
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
      </div>
    </section>
  );
}
