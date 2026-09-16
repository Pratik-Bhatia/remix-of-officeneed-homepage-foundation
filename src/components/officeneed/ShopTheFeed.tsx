import { Instagram, Play } from "lucide-react";

/**
 * Curated posts for the "Shop the Feed" section.
 *
 * MEDIA NOTE: Instagram no longer exposes post thumbnails to anonymous
 * requests -- their oEmbed API requires a Meta Graph API access token this
 * project does not have, and fetching a post page directly now returns a
 * login-wall with no media data. Until real thumbnail/video assets are
 * available, each card below renders a tasteful monochrome placeholder
 * instead of a fake stock photo.
 *
 * To go live with real media, just add a `media` field to any entry --
 * FeedCard renders it (image or muted autoplay video) in place of the
 * placeholder automatically, e.g.:
 *   media: { kind: "image", src: "/images/feed/reel-1.jpg" }
 */
interface FeedPost {
  id: string;
  /** Full Instagram post/reel URL this card links out to. */
  href: string;
  /** "reel" shows a subtle play affordance while no media is set; "post" doesn't. */
  type: "reel" | "post";
  /** Accessible label describing the post (used for alt/aria text). */
  label: string;
  /** Real post media, once available. Falls back to a placeholder tile when absent. */
  media?: { kind: "image" | "video"; src: string };
}

const feedPosts: FeedPost[] = [
  {
    id: "1",
    href: "https://www.instagram.com/reel/DcX8eG2yjK5/",
    type: "reel",
    label: "Corporate gifting branding reel",
  },
  {
    id: "2",
    href: "https://www.instagram.com/reel/DcLxbMhSh1U/",
    type: "reel",
    label: "Corporate gifting order dispatch reel",
  },
  {
    id: "3",
    href: "https://www.instagram.com/reel/Db8Rt3DOGm6/",
    type: "reel",
    label: "Product unboxing reel",
  },
];

export function ShopTheFeed() {
  return (
    <section
      aria-labelledby="shop-the-feed-heading"
      className="bg-background px-0 py-20 sm:py-24 lg:py-28"
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-6">
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

        <div className="mt-10 grid grid-cols-2 gap-4 sm:mt-12 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {feedPosts.map((post) => (
            <FeedCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeedCard({ post }: { post: FeedPost }) {
  return (
    <a
      href={post.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${post.label} — view on Instagram`}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-secondary outline-none transition-shadow duration-300 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {post.media ? (
        post.media.kind === "video" ? (
          <video
            src={post.media.src}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={post.media.src}
            alt={post.label}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        )
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-foreground/[0.07] via-foreground/[0.03] to-transparent transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      )}

      {/* Subtle Instagram mark -- top-right, no white box */}
      <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm">
        <Instagram className="size-3.5" strokeWidth={2} />
      </span>

      {/* Minimal play affordance for reels until real media is wired in */}
      {post.type === "reel" && !post.media && (
        <span className="absolute bottom-3 left-3 flex size-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm">
          <Play className="size-3 translate-x-[1px] fill-current" strokeWidth={0} />
        </span>
      )}

      {/* Hover overlay -- image-first by default, revealed only on interaction */}
      <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 p-4 text-center opacity-0 transition-all duration-300 ease-out group-hover:bg-foreground/40 group-hover:opacity-100">
        <span className="text-sm font-medium text-background">
          View on Instagram →
        </span>
      </span>
    </a>
  );
}
