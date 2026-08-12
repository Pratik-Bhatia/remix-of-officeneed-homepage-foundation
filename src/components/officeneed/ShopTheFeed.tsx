import { useEffect, useRef, useState } from "react";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";
import { socialFeedItems, type SocialFeedItem } from "@/lib/social-feed";

function FeedCard({ item, index }: { item: SocialFeedItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 90}ms` }}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "group relative w-[78vw] shrink-0 snap-start overflow-hidden rounded-[18px] bg-secondary sm:w-[46vw] md:w-[34vw] lg:w-auto",
        "motion-safe:translate-y-6 motion-safe:opacity-0 motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out",
        visible && "motion-safe:translate-y-0 motion-safe:opacity-100",
      )}
    >
      <div className="relative aspect-4/5 w-full">
        <img
          src={item.image}
          alt={item.alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />

        <a
          href={item.instagramUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          aria-label="View post on Instagram"
          className="absolute right-4 top-4 text-white/90 drop-shadow-md transition-opacity hover:opacity-70"
        >
          <Instagram className="h-5 w-5" strokeWidth={1.6} />
        </a>

        {item.shopTheLookUrl ? (
          <a
            href={item.shopTheLookUrl}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-24 left-1/2 w-[min(280px,80%)] -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-center text-sm font-medium text-foreground shadow-lg",
              "pointer-events-none translate-y-2 opacity-0 transition-all duration-300 ease-out",
              "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
              open && "pointer-events-auto translate-y-0 opacity-100",
            )}
          >
            Shop the Look
          </a>
        ) : null}

        <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2">
          {item.products.map((product) => (
            <a
              key={product.id}
              href={product.url}
              onClick={(e) => e.stopPropagation()}
              title={product.price ? `${product.name} — ${product.price}` : product.name}
              className="group/tag relative block h-14 w-14 overflow-hidden rounded-xl bg-white p-1.5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl"
            >
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                className="h-full w-full rounded-lg object-cover"
              />
              <span className="pointer-events-none absolute bottom-[110%] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[0.68rem] text-background opacity-0 transition-opacity duration-200 group-hover/tag:opacity-100 lg:block">
                {product.name}
                {product.price ? ` · ${product.price}` : ""}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShopTheFeed() {
  return (
    <section
      aria-labelledby="shop-the-feed-heading"
      className="bg-background px-0 py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex items-end justify-between gap-6 px-5 sm:px-8 lg:px-12">
          <h2 id="shop-the-feed-heading" className="text-section">
            Shop the Feed
          </h2>
          <a
            href="https://instagram.com/officeneed"
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Follow
          </a>
        </div>

        <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:px-8 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-12">
          {socialFeedItems.map((item, i) => (
            <FeedCard key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
