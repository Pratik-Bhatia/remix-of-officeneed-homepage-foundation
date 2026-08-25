import { InstagramEmbed } from "./InstagramEmbed";

const instagramReels = [
  "https://www.instagram.com/reel/DcX8eG2yjK5/",
  "https://www.instagram.com/reel/DcLxbMhSh1U/",
  "https://www.instagram.com/reel/Db8Rt3DOGm6/",
];

export function ShopTheFeed() {
  return (
    <section
      aria-labelledby="shop-the-feed-heading"
      className="bg-background px-0 py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-12">
        <div className="flex items-end justify-between gap-6">
          <h2 id="shop-the-feed-heading" className="text-section">
            Shop the Feed
          </h2>
          <a
            href="https://www.instagram.com/officeneed.in?igsh=Zm1taW1mOXJlY25x"
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-full border border-border px-5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary sm:text-sm"
          >
            Follow
          </a>
        </div>

        <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:gap-8 lg:overflow-visible lg:pb-2">
          {instagramReels.map((url, i) => (
            <InstagramEmbed key={i} url={url} className="w-[320px] lg:w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
