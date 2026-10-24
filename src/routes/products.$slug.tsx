import { haptic } from "@/lib/haptics";
import { trackViewContent, trackInitiateCheckout } from "@/lib/meta-pixel";
import { trackGoogleViewItem, trackGoogleBeginCheckout } from "@/lib/google-analytics";
import { useMemo, useState, useRef, useEffect, lazy, Suspense } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ChevronLeft, ChevronRight, Loader2, ZoomIn, X, ShieldCheck, Lock, Award, Truck, BadgeCheck, Heart } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { ProductCouponOffer } from "@/components/officeneed/ProductCouponOffer";
import { getPromotionForProduct } from "@/config/promotions";
import { useCouponStore } from "@/stores/couponStore";
import { DiscountBadge } from "@/components/officeneed/DiscountBadge";
import { getDiscount } from "@/lib/discount";
import { ProductInformation } from "@/components/officeneed/ProductInformation";
import { ProductReviews, ProductRatingSummary, MOCK_REVIEWS, type Review } from "@/components/officeneed/ProductReviews";
// Lazy -- the customizer (logo upload, canvas preview, printing-method
// rules) is the single largest contributor to this route's JS chunk
// (confirmed via build output) but is only ever needed once a shopper
// actually clicks "Customize This Product" (most PDP visits never do).
// Loaded on first open only -- see hasOpenedCustomizer below, which keeps
// it mounted (preserving upload/placement state) across any later
// close/reopen within the same visit.
const ProductCustomizer = lazy(() =>
  import("@/components/officeneed/ProductCustomizer").then((m) => ({ default: m.ProductCustomizer })),
);
import { RichText } from "@/components/officeneed/RichText";
import { VariantSelectorDesktop, VariantSelectorMobile } from "@/components/officeneed/VariantSelector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";
import { shopifyImageUrl, shopifyImageSrcSet } from "@/lib/shopify-image";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { fetchProductByHandle, fetchRelatedProducts, formatMoney, type ShopifyProductNode, type ShopifyVariantNode, type BuyerContext } from "@/lib/shopify";
import { mergeProduct, shopifyNodeToProduct, useShopifyCollections, useB2BPriceOverlayMap, useB2BQuantityRuleOverlayMap } from "@/lib/shopify-overlay";
import { TAXONOMY, resolveLiveTitle } from "@/lib/taxonomy";
import { useCartStore, quantityRuleScopeKey } from "@/stores/cartStore";
import { useB2BStore, getEffectiveCompanyLocationId } from "@/stores/b2bStore";
import { getCustomerToken } from "@/lib/customer";
import { useSaves } from "@/lib/saves";
import { setPendingSave } from "@/lib/pending-save";
import { getB2BPriceOverlay } from "@/lib/b2b-pricing.functions";
import { applyB2BPriceOverlay, applyB2BPriceOverlayToAll } from "@/lib/b2b-pricing";
import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProductBrowseAbandon } from "@/hooks/useProductBrowseAbandon";

const BASE = "https://officeneed.store";

/** Numeric Shopify id from a gid ("gid://shopify/ProductVariant/123" -> "123"). */
const numericId = (gid: string) => gid.split("/").pop() ?? gid;
function findVariant<T extends { id: string }>(variants: T[], param?: string): T | undefined {
  if (!param) return undefined;
  const target = numericId(String(param));
  return variants.find((v) => numericId(v.id) === target);
}

// createServerOnlyFn tree-shakes this (and its @tanstack/react-start/server
// import) out of the client bundle entirely -- this file is a universal
// route module that also ships to the browser, and that import is
// otherwise build-rejected there (TanStack Start's import-protection
// plugin). Calling the stub client-side would throw, which is fine: the
// loader below only calls it when typeof window === "undefined" anyway.
//
// Defense-in-depth: if this loader ever renders buyer-aware data into an
// actual server response (today it never does -- the customer token is
// localStorage-only, so SSR always has buyer=null; this only matters if
// auth ever becomes cookie/session-based), mark that response uncacheable
// so a future CDN/edge cache rule for /products/** can never serve one
// buyer's price to another. No live leak exists today (no such cache rule
// is configured), this purely guards against one being added later
// without this route being reconsidered.
const setPrivateCacheHeader = createServerOnlyFn(() => {
  setResponseHeader("Cache-Control", "private, no-store");
});

export const Route = createFileRoute("/products/$slug")({
  staticData: { sitemap: true },
  validateSearch: (search: Record<string, unknown>): { variant?: string } =>
    search["variant"] != null && String(search["variant"]) !== "" ? { variant: String(search["variant"]) } : {},
  loader: async ({ params }) => {
    const staticProduct = getProductBySlug(params.slug);

    // getCustomerToken() returns null during SSR (no window/localStorage
    // there) -- the first server-rendered response always uses anonymous
    // pricing, which is correct and safe. On a client-side navigation, a
    // signed-in buyer's token is available here.
    //
    // buyer stays null even when a token IS present: Shopify's BuyerInput
    // (what @inContext(buyer:...) takes) mandatorily requires
    // customerAccessToken to be a Customer Account API (OAuth) token --
    // confirmed live via schema introspection and a freshly-issued classic
    // token being unconditionally rejected. This app only has classic
    // customerAccessTokenCreate tokens (src/lib/customer.ts), which Shopify
    // never accepts there, for ANY customer. Sending one anyway is what
    // broke fetchProductByHandle/fetchRelatedProducts below for every
    // signed-in visitor (see src/hooks/useBuyerContext.ts for the full
    // writeup -- same root cause, same fix, independent call site).
    const token = getCustomerToken();
    const buyer: BuyerContext = null;
    let companyLocationId: string | null = null;
    if (token) {
      // Idempotent: resolve() no-ops if already resolved for this exact
      // token (see src/stores/b2bStore.ts), so this is cheap on repeat
      // client-side navigations. Only client-side navigations ever reach
      // here with a non-null token -- getCustomerToken() is always null
      // during the actual server-rendered SSR response (see comment
      // above), so useB2BStore's module-level state is always this one
      // browser's own, never shared across unrelated requests.
      await useB2BStore.getState().resolve(token);
      // Only the EFFECTIVE location -- eligible AND currently in Business
      // shopping mode (see getEffectiveCompanyLocationId in b2bStore.ts).
      // A persisted "b2c" choice must stop this loader from baking in B2B
      // pricing, same as an ineligible customer would get.
      companyLocationId = getEffectiveCompanyLocationId(useB2BStore.getState());
    }

    // See setPrivateCacheHeader's own comment above for why this matters
    // and why it's gated + wrapped this way. Guards on companyLocationId
    // now, not `buyer` (always null -- see above): the B2B price overlay
    // below is the buyer-specific data that could leak into a future CDN
    // cache rule, same risk @inContext used to carry.
    if (companyLocationId && typeof window === "undefined") {
      try {
        setPrivateCacheHeader();
      } catch {
        // Never let a best-effort cache-safety header break the page.
      }
    }

    let node = null;
    try {
      node = await fetchProductByHandle(params.slug, buyer);
    } catch {
      node = null;
    }

    let related: any[] = [];
    let relatedNodes: Awaited<ReturnType<typeof fetchRelatedProducts>> = [];
    if (node) {
      try {
        const collectionHandles = node.collections?.edges.map((e: any) => e.node.handle) ?? [];
        relatedNodes = await fetchRelatedProducts(node.handle, node.productType, collectionHandles, 4, buyer);
      } catch (e) {
        console.error("Failed to fetch related", e);
      }
    }

    // B2B catalog price overlay (Admin API contextualPricing) -- see
    // src/lib/b2b-pricing.functions.ts. companyLocationId here was
    // resolved server-side above from the token, never accepted from the
    // browser as-is; getB2BPriceOverlay re-verifies it against the
    // customer's actual assigned locations again before using it. Any
    // failure/empty result just means node/relatedNodes keep their normal
    // Storefront prices -- never blocks rendering.
    if (node && companyLocationId && token) {
      try {
        const variantIds = [node, ...relatedNodes].flatMap((n) => n.variants.edges.map((e: any) => e.node.id));
        const overlay = await getB2BPriceOverlay({ data: { customerAccessToken: token, companyLocationId, variantIds } });
        if (Object.keys(overlay).length > 0) {
          node = applyB2BPriceOverlay(node, overlay);
          relatedNodes = relatedNodes.map((n) => applyB2BPriceOverlay(n, overlay));
        }
      } catch (err) {
        console.error("[B2B pricing] PDP overlay failed, falling back to normal pricing:", err);
      }
    }

    const product = staticProduct
      ? mergeProduct(staticProduct, node ?? undefined)
      : node
        ? shopifyNodeToProduct(node)
        : null;

    if (!product) throw notFound();

    related = relatedNodes.map(shopifyNodeToProduct);

    // relatedNodes (raw, pre-conversion) travels alongside `related` so the
    // component can re-apply a freshly-fetched client-side price overlay --
    // see ProductDetail()'s pdpPriceOverlay below. This loader's own
    // overlay application above only ever runs with a token (a client-side
    // navigation); a hard refresh's SSR pass always has token=null, so
    // without this the component would be stuck showing anonymous pricing
    // for the lifetime of the page view for a signed-in B2B buyer.
    return { product, node, related, relatedNodes };
  },
  head: ({ params, loaderData, match }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Product unavailable — Officeneed" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData.product;
    const variantParam = (match?.search as { variant?: string } | undefined)?.variant;
    const shareVariant = findVariant(
      (loaderData.node?.variants?.edges ?? []).map((e: { node: ShopifyVariantNode }) => e.node),
      variantParam,
    );
    const variantLabel =
      shareVariant && shareVariant.title && shareVariant.title.toLowerCase() !== "default title"
        ? shareVariant.title
        : null;
    const title = variantLabel ? `${p.name} – ${variantLabel} — Officeneed` : `${p.name} — Officeneed`;
    const description = variantLabel && shareVariant
      ? `${p.name} (${variantLabel}) — ${formatMoney(shareVariant.price.amount, shareVariant.price.currencyCode)}. ${p.summary}`.slice(0, 300)
      : p.summary;
    const canonical = `${BASE}/products/${params.slug}`;
    const url = shareVariant ? `${canonical}?variant=${numericId(shareVariant.id)}` : canonical;
    const rawImage = shareVariant?.image?.url ?? p.images[0]!;
    let shareImage = rawImage;
    try {
      const u = new URL(rawImage);
      if (u.hostname.includes("shopify")) {
        u.searchParams.set("width", "1200");
        u.searchParams.set("height", "630");
        u.searchParams.set("crop", "center");
        shareImage = u.toString();
      }
    } catch {
      /* relative/static image: use as-is */
    }
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "og:image", content: shareImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: shareImage },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.description,
            image: p.images,
            category: p.category,
            ...(p.sku ? { sku: p.sku } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: ProductNotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-5 py-24 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Something went wrong."}</p>
    </div>
  ),
  component: ProductDetail,
});

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="text-section">Product not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This product may have been renamed or removed.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Browse all products
        </Link>
      </main>
      <Footer />
    </div>
  );
}

function ProductDetail() {
  const { product: loaderProduct, node: loaderNode, related: loaderRelated, relatedNodes: loaderRelatedNodes } = Route.useLoaderData();
  const slug = Route.useParams().slug;

  // Re-applies the B2B contextual-pricing overlay CLIENT-SIDE, on top of
  // whatever the loader returned. Required because the loader's own
  // overlay application (above) only ever has a token on a client-side
  // navigation -- a hard refresh's SSR pass always runs with token=null,
  // so without this, a signed-in B2B buyer would see anonymous pricing
  // baked into the page for its entire lifetime (TanStack Router's loader
  // data has no built-in revalidation once mounted). Same overlay
  // mechanism the catalogue/bestsellers grids already use reactively
  // (useB2BPriceOverlayMap) -- no new B2B architecture, just applying the
  // existing one on this route too instead of only inside its loader.
  // Idempotent against the loader's own application (applyB2BPriceOverlay
  // just overwrites price/compareAtPrice from the same overlay map either
  // way), so this is safe whether or not the loader already applied it.
  const pdpVariantIds = useMemo(() => {
    const nodes = [loaderNode, ...loaderRelatedNodes].filter((n): n is ShopifyProductNode => !!n);
    return nodes.flatMap((n) => n.variants.edges.map((e) => e.node.id));
  }, [loaderNode, loaderRelatedNodes]);
  const { overlay: pdpPriceOverlay, ready: pricesReady } = useB2BPriceOverlayMap(pdpVariantIds);

  // Only THIS product's own variants, not the related-products ids above --
  // a B2B company-location quantity rule is only ever relevant to what's
  // actually selectable on this page. See useB2BQuantityRuleOverlayMap for
  // why this is a SEPARATE overlay from price: B2C/anonymous shoppers
  // never trigger it at all (confirmed live that their correct answer is
  // already the plain Storefront quantityRule read below).
  const currentProductVariantIds = useMemo(
    () => loaderNode?.variants?.edges?.map((e) => e.node.id) ?? [],
    [loaderNode],
  );
  const { overlay: b2bQuantityRuleOverlay } = useB2BQuantityRuleOverlayMap(currentProductVariantIds);

  const nodeWithPriceOverlay = useMemo(
    () => (loaderNode ? applyB2BPriceOverlay(loaderNode, pdpPriceOverlay) : loaderNode),
    [loaderNode, pdpPriceOverlay],
  );
  // Same idea as the price overlay just above, for quantityRule -- so
  // every consumer of `node` (Add to Cart/Buy Now's `product: { node }`
  // payload, the Product Customizer's rawProductNode, the cart item
  // snapshot CartLineItem later reads its own floor from) sees the
  // B2B-resolved rule, not just the on-screen stepper. A no-op copy for
  // any variant the overlay has nothing for (every B2C/anonymous case,
  // and every variant without a B2B catalog override).
  const node = useMemo(() => {
    if (!nodeWithPriceOverlay || Object.keys(b2bQuantityRuleOverlay).length === 0) return nodeWithPriceOverlay;
    return {
      ...nodeWithPriceOverlay,
      variants: {
        ...nodeWithPriceOverlay.variants,
        edges: nodeWithPriceOverlay.variants.edges.map((e) => {
          const rule = b2bQuantityRuleOverlay[e.node.id];
          return rule ? { ...e, node: { ...e.node, quantityRule: rule } } : e;
        }),
      },
    };
  }, [nodeWithPriceOverlay, b2bQuantityRuleOverlay]);
  const staticProductForSlug = useMemo(() => getProductBySlug(slug), [slug]);
  const product = useMemo(() => {
    if (!node) return loaderProduct;
    return staticProductForSlug ? mergeProduct(staticProductForSlug, node) : shopifyNodeToProduct(node);
  }, [node, staticProductForSlug, loaderProduct]);
  const related = useMemo(() => {
    if (loaderRelatedNodes.length === 0) return loaderRelated;
    return applyB2BPriceOverlayToAll(loaderRelatedNodes, pdpPriceOverlay).map(shopifyNodeToProduct);
  }, [loaderRelatedNodes, loaderRelated, pdpPriceOverlay]);

  const { collections, isLoading: collectionsLoading } = useShopifyCollections();
  // Best-effort initial minimum straight from the raw Shopify node --
  // `selectedVariant` doesn't exist yet this early in the component, and a
  // product's configured minimum is in practice uniform across its
  // variants (confirmed live against this store's catalogue), so this
  // avoids a one-frame flash of "1" before the sync effect below (keyed on
  // the real selectedVariant.quantityRule) corrects it. That effect, not
  // this initializer, is the actual source of truth for every later render.
  const initialMinQty = node?.variants?.edges?.[0]?.node?.quantityRule?.minimum || product.minimumOrderQuantity || 1;
  const [quantity, setQuantity] = useState<number>(initialMinQty);
  // Raw text the quantity <input> displays while being edited -- kept
  // separate from `quantity` (the committed number everything else reads)
  // so the field can sit empty or mid-typed (e.g. "" or "5" on the way to
  // "50") without being clamped back to 1 on every keystroke. Only
  // normalized/synced to the cart on blur or Enter -- see commitQuantity.
  const [quantityInput, setQuantityInput] = useState<string>(String(initialMinQty));
  const quantityInputFocusedRef = useRef(false);
  // Independent per-button loading flags -- Add to Cart and Buy Now (and
  // the sticky-bar "Add to Cart"/"Add" buttons, which are the same action)
  // each spin and disable only themselves, never each other, even though
  // they currently call the same underlying handleBuyNow().
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  // Once true, stays true for the rest of this PDP visit -- gates whether
  // ProductCustomizer (lazy-loaded above) is mounted at all, so its chunk
  // is only ever fetched the first time it's actually opened, while still
  // staying mounted (not unmounting on close) so a shopper's in-progress
  // logo/placement work survives closing and reopening the dialog.
  const [hasOpenedCustomizer, setHasOpenedCustomizer] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const purchaseSectionRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const corporateCtaRef = useRef<HTMLDivElement>(null);
  const [ctaOverlapsWidget, setCtaOverlapsWidget] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Wishlist -- same useSaves()/toggleSave() every ProductCard uses, no
  // second store. Guests get the exact same guest-flow ProductCard.tsx
  // uses: remember the product, open the existing auth modal, let
  // CustomerAuthModal complete the save after a successful sign-in.
  const { savedHandles, toggleSave } = useSaves();
  const [saveBusy, setSaveBusy] = useState(false);
  const isSaved = savedHandles.includes(product.slug);
  const handleToggleSave = async () => {
    if (!getCustomerToken()) {
      setPendingSave(product.slug);
      window.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }
    setSaveBusy(true);
    try {
      const result = await toggleSave(product.slug);
      toast.success(result.saved ? "Saved to your account." : "Removed from your saves.");
      if (result.saved) haptic("success");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your saves.");
      haptic("error");
    } finally {
      setSaveBusy(false);
    }
  };

  // WhatsApp browse-abandon trigger (KwikEngage) when the shopper leaves this page.
  useProductBrowseAbandon({ handle: slug, title: product.name });

  useEffect(() => {
    async function fetchReviews() {
      const { data, error } = await supabase
        .from('product_reviews_public')
        .select('*')
        .eq('product_handle', slug)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching reviews:", error);
        return;
      }

      if (data) {
        const formatted: Review[] = data.map((r: any) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          rating: r.rating,
          author: r.author_name,
          date: new Date(r.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
          verified: r.is_verified_buyer,
        }));
        setReviews(formatted);
      }
    }
    fetchReviews();
  }, [slug]);

  useEffect(() => {
    // Same bottom-right corner the floating chat launcher (ChatWidget.tsx,
    // fixed bottom-6 right-6) always occupies -- a generous proxy box
    // around its ~56px footprint, not the exact rect, since this only
    // needs to catch "something is about to sit under it", not pixel-
    // perfect collision. On most viewports the Corporate Gifting CTA sits
    // well above this; it's only short-viewport-height desktops/laptops
    // (confirmed live at 1024x600) where the whole page fits close enough
    // to the fold that the CTA's "Customize This Product" button lands
    // inside this corner WITHOUT the shopper ever scrolling -- a case the
    // existing showStickyBar check below can't catch, since that only
    // fires once the purchase section scrolls fully out of view.
    const WIDGET_CORNER_PX = 110;
    const handleScroll = () => {
      if (purchaseSectionRef.current) {
        // When the bottom of the purchase section scrolls above the viewport, show the sticky bar.
        const rect = purchaseSectionRef.current.getBoundingClientRect();
        setShowStickyBar(rect.bottom < 0);
      }
      if (corporateCtaRef.current) {
        const ctaRect = corporateCtaRef.current.getBoundingClientRect();
        const overlapsCorner =
          ctaRect.right > window.innerWidth - WIDGET_CORNER_PX &&
          ctaRect.bottom > window.innerHeight - WIDGET_CORNER_PX &&
          ctaRect.top < window.innerHeight &&
          ctaRect.left < window.innerWidth;
        setCtaOverlapsWidget(overlapsCorner);
      } else {
        setCtaOverlapsWidget(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    // Trigger once on mount in case the user loads the page already scrolled down
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  // The floating chat launcher (ChatWidget.tsx, fixed bottom-6 right-6) has
  // no awareness of this page's own fixed sticky purchase bar -- whenever
  // that bar is showing, it sits in the exact same corner and can cover the
  // Corporate Gifting CTA (or any other control) right behind it. Reuses
  // showStickyBar -- the single source of truth for whether that bar is
  // visible -- instead of tracking a second copy of it in ChatWidget. A
  // dedicated event name (not the Navbar-owned officeneed:overlay-toggle)
  // so this component's own on/off state can't race with Navbar's and
  // clobber one another; ChatWidget combines both independently.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("officeneed:sticky-bar-toggle", { detail: { open: showStickyBar } }));
  }, [showStickyBar]);

  // Fifth independent source for the launcher (see ChatWidget.tsx): the
  // Corporate Gifting CTA overlapping the launcher's own corner at short
  // viewport heights, computed above. A dedicated event, not folded into
  // officeneed:sticky-bar-toggle, because showStickyBar also drives this
  // page's OWN sticky bar rendering (line ~1500) -- reusing it here would
  // incorrectly pop that bar open just because the CTA happens to be near
  // the launcher.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("officeneed:cta-widget-overlap-toggle", { detail: { open: ctaOverlapsWidget } }));
  }, [ctaOverlapsWidget]);

  // Image zoom viewer: a full-screen modal, so (1) the page behind it must not scroll, (2) the floating
  // chat launcher (z-[100], above every z-50 overlay) is hidden while it is open -- a sixth independent
  // event slice that ChatWidget ORs with the others -- and (3) Escape closes it like the close button.
  useBodyScrollLock(zoomOpen);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("officeneed:image-viewer-toggle", { detail: { open: zoomOpen } }));
    // Also fires if this page unmounts while the viewer is open, so the launcher can never stay hidden.
    return () => {
      if (zoomOpen) window.dispatchEvent(new CustomEvent("officeneed:image-viewer-toggle", { detail: { open: false } }));
    };
  }, [zoomOpen]);
  useEffect(() => {
    if (!zoomOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomOpen]);
  // This route component is reused when navigating between products (back/forward, related items), so an
  // open viewer must not carry over -- and keep the page locked -- on the next product.
  useEffect(() => {
    setZoomOpen(false);
  }, [slug]);

  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const createStandaloneCheckout = useCartStore((s) => s.createStandaloneCheckout);
  const quantityRuleOverrides = useCartStore((s) => s.quantityRuleOverrides);
  // Same buyer-scope key cartStore.ts's own recordQuantityRuleCorrection
  // uses -- a correction learned for one company location (or no company
  // at all) must never be read back for a different one in this tab.
  const quantityRuleCompanyLocationId = useB2BStore((s) => getEffectiveCompanyLocationId(s));

  /* ---------------- Shopify-driven variant + gallery model ---------------- */

  const variants = useMemo<ShopifyVariantNode[]>(
    () => node?.variants?.edges?.map((e) => e.node) ?? [],
    [node],
  );

  /** Gallery = product media first, plus any variant media not already present. */
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ url: string; alt: string | null }> = [];
    const push = (img?: { url?: string | null; altText?: string | null } | null) => {
      const url = img?.url;
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, alt: img?.altText ?? null });
    };
    push(node?.featuredImage);
    node?.images?.edges?.forEach((e) => push(e.node));
    variants.forEach((v) => push(v.image));
    if (items.length === 0) {
      product.images.forEach((url) => push({ url, altText: null }));
    }
    return items;
  }, [node, variants, product.images]);

  const indexForUrl = (url?: string | null) => {
    if (!url) return -1;
    return gallery.findIndex((g) => g.url === url);
  };

  const defaultVariant = useMemo(
    () => variants.find((v) => v.availableForSale) ?? variants[0],
    [variants],
  );

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const linkedVariant = findVariant(variants, search.variant);
  const initialVariant = linkedVariant ?? defaultVariant;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariant?.id ?? null,
  );
  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) ?? initialVariant;

  // Three layers, highest priority first -- never a hardcoded per-product
  // number:
  //  1. b2bQuantityRuleOverlay -- a signed-in B2B buyer's actual catalog
  //     rule for their company location, fetched PROACTIVELY via Admin API
  //     contextualPricing (see useB2BQuantityRuleOverlayMap). This is the
  //     one CONFIRMED LIVE this session to carry H935's real minimum of 25
  //     -- the plain Storefront read below never does, for any buyer,
  //     B2B or not (tested with/without @inContext(country:) and
  //     buyerIdentity.countryCode).
  //  2. quantityRuleOverrides -- a REACTIVE safety net: what an actual
  //     cart mutation has revealed via MINIMUM_NOT_MET/etc (see
  //     cartStore.ts). Only still relevant for a buyer the proactive B2B
  //     overlay doesn't cover (e.g. Buy Now before this page's B2B status
  //     resolves) or a rule this overlay doesn't know about for some other
  //     reason -- normally overlay (1) already has the right answer by the
  //     time this renders.
  //  3. selectedVariant.quantityRule -- the plain Storefront API read.
  //     CONFIRMED LIVE to be the CORRECT answer for B2C/anonymous buyers
  //     (contextualPricing(country: IN) returns the identical value), so
  //     this is never overridden for them -- only a real B2B buyer's own
  //     resolved overlay (1) ever takes priority over it.
  // Absent everywhere (or no selected variant yet, e.g. a quote-only
  // product) falls back to the universal default: start at 1, step by 1,
  // no cap.
  const quantityRule = selectedVariant?.quantityRule;
  const b2bOverlayRule = selectedVariant ? b2bQuantityRuleOverlay[selectedVariant.id] : undefined;
  const retryOverride = selectedVariant ? quantityRuleOverrides[`${selectedVariant.id}::${quantityRuleScopeKey(quantityRuleCompanyLocationId)}`] : undefined;
  const min = b2bOverlayRule?.minimum || retryOverride?.minimum || quantityRule?.minimum || 1;
  const step = b2bOverlayRule?.increment || retryOverride?.increment || quantityRule?.increment || 1;
  const maxQty = b2bOverlayRule?.maximum ?? retryOverride?.maximum ?? quantityRule?.maximum ?? null;

  // The Product Customizer (and its own Buy Now/quote quantity controls)
  // reads `selectedVariant.quantityRule` directly -- rather than re-derive
  // the same three-layer merge a second time there, it's baked into this
  // shallow copy once, here, and passed down instead of the raw variant.
  const effectiveSelectedVariant = useMemo(
    () => (selectedVariant ? { ...selectedVariant, quantityRule: { minimum: min, increment: step, maximum: maxQty } } : selectedVariant),
    [selectedVariant, min, step, maxQty],
  );

  const [activeImage, setActiveImage] = useState(() => {
    const i = indexForUrl(initialVariant?.image?.url);
    return i >= 0 ? i : 0;
  });

  /* ------------- Mobile swipeable gallery <-> activeImage sync ------------ */
  // activeImage stays the single shared source of truth for both the
  // desktop single-image view and this mobile scroll-snap strip -- arrows,
  // thumbnails (desktop) and variant selection all already just call
  // setActiveImage, so they drive the mobile strip for free via the effect
  // below, with no separate reset/sync logic needed for any of them.
  const mobileGalleryRef = useRef<HTMLDivElement>(null);
  // True for the duration of a programmatic (non-swipe) scroll, so the
  // scroll handler below doesn't read its own in-flight animation as a
  // user swipe and fight it / bounce activeImage around mid-scroll.
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    const el = mobileGalleryRef.current;
    if (!el) return;
    const targetLeft = activeImage * el.clientWidth;
    if (Math.abs(el.scrollLeft - targetLeft) < 2) return;
    isProgrammaticScroll.current = true;
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
    const clear = () => { isProgrammaticScroll.current = false; };
    el.addEventListener("scrollend", clear, { once: true });
    // Fallback for browsers without `scrollend` support -- a smooth scroll
    // across one slide's width never takes anywhere near this long.
    const fallback = window.setTimeout(clear, 600);
    return () => {
      el.removeEventListener("scrollend", clear);
      window.clearTimeout(fallback);
    };
  }, [activeImage]);

  const handleGalleryScroll = () => {
    const el = mobileGalleryRef.current;
    if (!el || isProgrammaticScroll.current || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== activeImage && index >= 0 && index < gallery.length) {
      setActiveImage(index);
    }
  };

  // Follow back/forward or a shared link changing ?variant= on the same page.
  useEffect(() => {
    if (linkedVariant && linkedVariant.id !== selectedVariantId) {
      setSelectedVariantId(linkedVariant.id);
      const i = indexForUrl(linkedVariant.image?.url);
      if (i >= 0) setActiveImage(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedVariant?.id]);

  const selectVariant = (variant: ShopifyVariantNode) => {
    if (variant.id !== selectedVariantId) haptic("light");
    setSelectedVariantId(variant.id);
    const i = indexForUrl(variant.image?.url);
    if (i >= 0) setActiveImage(i);
    void navigate({
      search: (prev) => ({ ...prev, variant: numericId(variant.id) }),
      replace: true,
      resetScroll: false,
    });
  };

  /** Images belonging to a specific variant (used to highlight the gallery). */
  const variantImageUrls = useMemo(
    () => new Set(variants.map((v) => v.image?.url).filter(Boolean) as string[]),
    [variants],
  );

  const hasVariantChoice = variants.length > 1;

  const cartItem = items.find(i => i.variantId === selectedVariant?.id);
  const cartQuantity = cartItem?.quantity;
  const isItemInCart = !!cartItem;

  // Before the item is in the cart, the stepper is just "how many to add".
  // Once it's in the cart, the stepper becomes a live editor for that
  // line's real quantity -- +/- here update the cart (and drawer/checkout)
  // immediately, same as the drawer's own +/-. Add to Cart's own button
  // switches to "View Cart" in that state (see handleAddToCart) rather
  // than adding more, so there's only ever one control adjusting quantity
  // at a time -- no compounding.
  useEffect(() => {
    // A cart quantity below the variant's current minimum only happens if
    // Shopify's configured rule changed after this line was added -- never
    // silently keep the stale, now-invalid number.
    const next = cartQuantity !== undefined ? Math.max(cartQuantity, min) : min;
    setQuantity(next);
    // Don't clobber what the shopper is actively typing -- the field
    // resyncs from the committed quantity once they blur/Enter instead.
    if (!quantityInputFocusedRef.current) setQuantityInput(String(next));
  }, [cartQuantity, selectedVariant?.id, min]);

  const clampToQuantityRule = (n: number) => Math.min(maxQty ?? Infinity, Math.max(min, n));

  const handleQuantityChange = (newQty: number) => {
    if (!selectedVariant) return;

    if (!isItemInCart) {
      setQuantity(clampToQuantityRule(newQty));
      return;
    }

    if (newQty <= 0) {
      useCartStore.getState().removeItem(selectedVariant.id);
      setQuantity(min);
    } else {
      const clamped = clampToQuantityRule(newQty);
      setQuantity(clamped);
      useCartStore.getState().updateQuantity(selectedVariant.id, clamped);
    }
  };

  // Commits whatever is currently typed in the quantity field: integers
  // only, clamped to the minimum order quantity, empty/invalid falls back
  // to that minimum -- never negative, never decimal. Only runs on blur/
  // Enter (see the input's onBlur/onKeyDown), so mid-edit states (empty,
  // a single partial digit) never get force-corrected while typing.
  const commitQuantity = () => {
    const parsed = Number.parseInt(quantityInput, 10);
    const finalQty = clampToQuantityRule(Number.isFinite(parsed) && parsed >= min ? parsed : min);
    setQuantityInput(String(finalQty));
    if (finalQty !== quantity) handleQuantityChange(finalQty);
  };

  // Shared guard: is there actually something purchasable selected right
  // now? Used by both Add to Cart and Buy Now so their error toasts never
  // drift apart.
  const validatePurchasable = (): boolean => {
    if (!node) {
      toast.error("This product is currently available for enquiry only.");
      return false;
    }
    if (!selectedVariant) return false;
    if (!selectedVariant.availableForSale) {
      toast.error("Sorry, this option is out of stock.");
      return false;
    }
    // Defense in depth, not just the UI -- the stepper/input already keep
    // `quantity` clamped to Shopify's own quantity rule, but this is the
    // actual gate right before a cart/checkout mutation is sent.
    if (quantity < min) {
      toast.error(`Minimum order quantity for this item is ${min}.`);
      return false;
    }
    return true;
  };

  // The actual cartStore.addItem() call, shared by both buttons -- always
  // adds (or increments, if this variant is already a line -- addItem's
  // own "existing" branch handles that), never silently no-ops.
  const addCurrentVariantToCart = async (): Promise<boolean> => {
    if (!node || !selectedVariant) return false;
    try {
      await addItem({
        product: { node },
        variantId: selectedVariant.id,
        variantTitle: selectedVariant.title,
        price: selectedVariant.price ?? node.priceRange?.minVariantPrice,
        quantity,
        selectedOptions: selectedVariant.selectedOptions ?? [],
      });
      return true;
    } catch {
      toast.error("Failed to add to cart");
      haptic("error");
      return false;
    }
  };

  // Add to Cart: adds the selected quantity the first time. Once the
  // variant is already in the cart, the stepper above is the live editor
  // for its quantity (see handleQuantityChange) -- clicking this button
  // again just opens the cart drawer instead of adding more, so there's
  // never two different controls both trying to own the line's quantity.
  const handleAddToCart = async () => {
    if (isItemInCart) {
      window.dispatchEvent(new CustomEvent("open-overlays", { detail: "cart" }));
      return;
    }
    if (!validatePurchasable()) return;
    const ok = await addCurrentVariantToCart();
    if (ok) {
      toast.success("Added to cart", { description: product.name });
      haptic("success");
      // The shopper chose this product's campaign code with "Apply Code": put it on the real
      // Shopify cart so it follows them through the cart and checkout. Shopify decides whether
      // it applies (and re-checks it on every later cart change); we only report its answer.
      const promo = getPromotionForProduct(product.collectionHandles);
      const chosen = useCouponStore.getState().selectedCode;
      const bag = useCartStore.getState();
      if (promo && chosen === promo.code && !bag.discountCodes.some((d) => d.applicable && d.code.toUpperCase() === chosen)) {
        const r = await bag.applyDiscountCode(chosen);
        if (r.ok) toast.success(`${chosen} applied to your bag`);
        else toast.info(`${chosen} wasn't applied to your bag: ${r.message}`);
      }
    }
  };

  // Buy Now: a standalone Shopify cart, created fresh for exactly this
  // purchase -- NEVER the customer's persistent cart/items state. This
  // used to add the selected variant to the regular cart and then check
  // out that cart (prepareCheckout(), the same mechanism CartDrawer's own
  // Checkout button uses) -- confirmed live this was the actual bug
  // behind "Buy Now checks out my whole cart, not just this product":
  // whatever was already in the shopper's cart got included, and the
  // item was permanently added to their cart even if they abandoned
  // checkout. Mirrors ProductCustomizer.tsx's own handleBuyNow, which
  // already used createStandaloneCheckout correctly -- this brings the
  // plain (non-customized) PDP Buy Now button in line with it, so both
  // entry points now behave identically. No delivery-address requirement,
  // for B2B or B2C: Shopify's own hosted checkout collects shipping/
  // billing exactly as it always has.
  const handleBuyNowCheckout = async () => {
    if (!validatePurchasable()) return;
    if (!node || !selectedVariant) return;
    const win = window.open("", "_blank");
    try {
      const checkoutUrl = await createStandaloneCheckout({
        product: { node },
        variantId: selectedVariant.id,
        variantTitle: selectedVariant.title,
        price: selectedVariant.price ?? node.priceRange?.minVariantPrice,
        quantity,
        selectedOptions: selectedVariant.selectedOptions ?? [],
      });
      if (!checkoutUrl) {
        // createStandaloneCheckout() already shows its own toast on every
        // failure path before returning null -- do not add a second one
        // here, or the shopper would see two error toasts for one failure.
        win?.close();
        return;
      }
      trackInitiateCheckout([{ variantId: selectedVariant.id, quantity, price: selectedVariant.price ?? node.priceRange?.minVariantPrice }]);
      trackGoogleBeginCheckout({
        items: [
          {
            variantId: selectedVariant.id,
            name: product.name,
            quantity,
            price: selectedVariant.price ?? node.priceRange?.minVariantPrice,
          },
        ],
      });
      if (win) win.location.href = checkoutUrl;
      else window.open(checkoutUrl, "_blank");
    } catch {
      win?.close();
      toast.error("Couldn't start checkout. Please try again.");
    }
  };

  // Thin per-button wrappers -- each only isolates which button shows its
  // own spinner and disables itself while its own action runs.
  const handleAddToCartClick = async () => {
    if (isAddingToCart) return;
    setIsAddingToCart(true);
    try {
      await handleAddToCart();
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNowClick = async () => {
    if (isBuyingNow) return;
    setIsBuyingNow(true);
    try {
      await handleBuyNowCheckout();
    } finally {
      setIsBuyingNow(false);
    }
  };

  const nextImage = () => {
    setActiveImage((prev) => (prev + 1) % gallery.length);
  };
  const prevImage = () => {
    setActiveImage((prev) => (prev - 1 + gallery.length) % gallery.length);
  };

  /* ---------------- Price / availability / SKU (variant-aware) ------------ */

  const currency = selectedVariant?.price.currencyCode ?? product.currencyCode ?? "INR";
  const unitAmount = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : (product.priceAmount ?? NaN);
  const hasNumericPrice = Number.isFinite(unitAmount) && unitAmount > 0;

  // Meta ViewContent: once per product/variant shown.
  useEffect(() => {
    if (!selectedVariant) return;
    trackViewContent({
      variantId: selectedVariant.id,
      name: product.name,
      price: parseFloat(selectedVariant.price.amount) || 0,
      currency: selectedVariant.price.currencyCode,
      category: product.category,
    });
    trackGoogleViewItem({
      variantId: selectedVariant.id,
      name: product.name,
      price: parseFloat(selectedVariant.price.amount) || 0,
      currency: selectedVariant.price.currencyCode,
      category: product.category,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariant?.id]);
  // The per-unit price, from Shopify's own price for this buyer's context
  // (B2B contextual price or plain B2C price, via selectedVariant.price --
  // see useB2BPriceOverlayMap) -- NEVER multiplied by the selected
  // quantity. A B2B product's quantity selector can start well above 1
  // (see min/step/maxQty above), and multiplying the main displayed price
  // by that made a ₹419 unit price read as "₹10,475" the moment the
  // minimum-quantity floor kicked in -- confirmed live for H3106 (min 25).
  // The cart/checkout total IS correctly quantity × price elsewhere
  // (CartLineItem.tsx, Shopify's own cart cost) -- this is only the PDP's
  // own per-unit price display, which must never do that math itself.
  const displayPrice = hasNumericPrice
    ? formatMoney(unitAmount, currency)
    : product.price;
  const compareAmount = selectedVariant?.compareAtPrice
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : NaN;
  // Gates every price render below: true until this buyer's context is
  // known AND (if they're B2B) this product's contextual-pricing overlay
  // has actually finished -- see useB2BPriceOverlayMap. Never paint
  // anonymous/B2C pricing for a buyer who might still turn out to be B2B.
  const pricePending = !pricesReady;
  const priceSkeleton = (
    <span className="inline-block h-[1em] w-20 animate-pulse rounded bg-muted align-middle" aria-hidden />
  );
  const showCompareAt = !pricePending && getDiscount(unitAmount, compareAmount) !== null;

  const availabilityLabel = selectedVariant
    ? selectedVariant.availableForSale
      ? typeof selectedVariant.quantityAvailable === "number" &&
        selectedVariant.quantityAvailable > 0 &&
        selectedVariant.quantityAvailable <= 5
        ? `Only ${selectedVariant.quantityAvailable} left`
        : "In stock"
      : "Sold out"
    : product.availability;

  const skuLabel = selectedVariant?.sku || product.sku;

  const activeMedia = gallery[activeImage] ?? gallery[0];

  // Same availableForSale/selectedVariant branching either way -- only the
  // label text differs (compact for the mobile price row vs. the original
  // "Ready to dispatch" copy desktop keeps) -- so there is exactly one
  // place deciding which state (in stock / out of stock / unknown) is
  // showing, not two copies that could drift apart.
  const renderStockStatus = (compact: boolean) => {
    if (selectedVariant?.availableForSale) {
      return (
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-green-500 relative">
            <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-500 whitespace-nowrap">
            {compact ? "In stock" : <>In Stock &bull; Ready to dispatch</>}
          </span>
        </div>
      );
    }
    if (selectedVariant && !selectedVariant.availableForSale) {
      return (
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-red-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600 whitespace-nowrap">
            Out of Stock
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">

          {/* Column ratio 1.1fr:0.9fr with a 440px floor on the info
              column (was 1.15fr:0.85fr / 420px floor): at the narrow end
              of this grid's own range (1024px viewport, the smallest
              width where it's 2-column at all, since below lg it stacks)
              the 420px floor resolved to a lopsided 460px gallery / 420px
              info split and squeezed the "Make It Yours" card's text
              column hard enough to wrap "Make It Yours" itself onto two
              lines. 1.1/0.9 + 440px resolves to an even 440/440 split at
              1024px instead, with only a minor, intentional rebalancing
              at large widths (e.g. ~977/799 vs ~1021/755 at 1920px) --
              confirmed live the gallery stays comfortably sized at every
              tested width. */}
          <div className="product-detail flex flex-col lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(min(440px,100%),0.9fr)] gap-8 lg:gap-12 items-start w-full">
            {/* Gallery Wrapper (Sticky on desktop) */}
            <div className="w-full min-w-0 max-w-full lg:sticky lg:top-[120px]">
              <div className="product-gallery grid grid-cols-1 lg:grid-cols-[80px_minmax(0,1fr)] gap-4 lg:gap-5 w-full items-start">
                
                {/* Thumbnails */}
                
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="product-thumbnails order-2 lg:order-1 hidden lg:flex lg:flex-col gap-3 w-full lg:w-[80px] overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {gallery.map((media, i) => (
                      <button
                        key={media.url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={media.alt || `Show image ${i + 1} of ${gallery.length}`}
                        aria-current={activeImage === i}
                        className={cn(
                          "product-thumbnail w-20 h-20 sm:w-24 sm:h-24 lg:w-[80px] lg:h-[80px] shrink-0 overflow-hidden rounded-xl border bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                          activeImage === i
                            ? "border-foreground ring-1 ring-foreground opacity-100"
                            : "border-border opacity-60 hover:opacity-100",
                          variantImageUrls.has(media.url) && selectedVariant?.image?.url === media.url
                            ? "ring-1 ring-foreground"
                            : "",
                        )}
                      >
                        <img
                          src={shopifyImageUrl(media.url, 150)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain p-1"
                        />
                      </button>
                    ))}
                  </div>


                {/* Main Image */}
                <div className="product-main-image order-1 lg:order-2 w-full max-w-[1080px] aspect-square lg:aspect-auto lg:h-[calc(100vh-200px)] lg:max-h-[1080px] relative overflow-hidden rounded-2xl bg-secondary/30 border border-border/50 group flex items-center justify-center p-4 sm:p-8">
                  {/* Desktop: single fixed image, swapped via thumbnails/
                      arrows updating activeImage -- unchanged behavior. */}
                  <img
                    src={shopifyImageUrl(activeMedia?.url ?? product.images[0], 1200)}
                    srcSet={shopifyImageSrcSet(activeMedia?.url ?? product.images[0], [480, 800, 1200, 1600])}
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    alt={activeMedia?.alt || `${product.name} - image ${activeImage + 1}`}
                    width={1080}
                    height={1080}
                    fetchPriority="high"
                    className="hidden lg:block w-full h-full object-contain mix-blend-multiply" style={{ maxHeight: "1080px" }}
                  />

                  {/* Mobile: native horizontally-scrollable, scroll-snap
                      strip of every gallery image -- swiping is handled
                      entirely by the browser's own scroll physics (same
                      proven pattern as the subcategory icon row on
                      products.index.tsx), not custom pointer math, so it
                      never fights vertical page scroll or pinch-zoom.
                      activeImage stays the single shared source of truth:
                      scrolling here updates it (handleGalleryScroll), and
                      it changing from anywhere else (arrows, variant
                      selection) scrolls this strip to match (the
                      useEffect below). */}
                  <div
                    ref={mobileGalleryRef}
                    onScroll={handleGalleryScroll}
                    className="flex lg:hidden w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {gallery.map((media, i) => (
                      <div key={media.url} className="w-full h-full shrink-0 snap-center flex items-center justify-center">
                        <img
                          src={shopifyImageUrl(media.url, 1200)}
                          srcSet={shopifyImageSrcSet(media.url, [480, 800, 1200, 1600])}
                          sizes="(min-width: 1024px) 60vw, 100vw"
                          alt={media.alt || `${product.name} - image ${i + 1}`}
                          width={1080}
                          height={1080}
                          loading={i === 0 ? undefined : "lazy"}
                          fetchPriority={i === 0 ? "high" : undefined}
                          className="w-full h-full object-contain mix-blend-multiply"
                          style={{ maxHeight: "1080px" }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Pagination dots -- mobile only, hidden for a single
                      image (same gating as the arrows below). */}
                  {gallery.length > 1 && (
                    <div
                      role="tablist"
                      aria-label="Product images"
                      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1.5 shadow-sm backdrop-blur lg:hidden"
                    >
                      {gallery.map((media, i) => (
                        <button
                          key={media.url + "-dot"}
                          type="button"
                          role="tab"
                          aria-label={`Show image ${i + 1} of ${gallery.length}`}
                          aria-selected={activeImage === i}
                          onClick={() => setActiveImage(i)}
                          className={cn(
                            "h-1.5 rounded-full transition-all",
                            activeImage === i ? "w-4 bg-foreground" : "w-1.5 bg-foreground/30",
                          )}
                        />
                      ))}
                    </div>
                  )}

                  {/* Arrows */}
                  {gallery.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        aria-label="Previous product image"
                        className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronLeft className="size-5 lg:size-6" />
                      </button>
                      <button
                        onClick={nextImage}
                        aria-label="Next product image"
                        className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronRight className="size-5 lg:size-6" />
                      </button>
                    </>
                  )}
                  {/* Zoom Button */}
                  <button
                    onClick={() => setZoomOpen(true)}
                    aria-label="Zoom image"
                    className="absolute bottom-4 right-4 lg:bottom-6 lg:right-6 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                  >
                    <ZoomIn className="size-5" />
                  </button>
                  {/* Wishlist -- always interactive, guest or signed-in
                      (see handleToggleSave above); top-right, clear of the
                      zoom button and the prev/next arrows. */}
                  <button
                    type="button"
                    onClick={handleToggleSave}
                    disabled={saveBusy}
                    aria-label={isSaved ? `Remove ${product.name} from your saves` : `Save ${product.name}`}
                    aria-pressed={isSaved}
                    className="absolute top-4 right-4 lg:top-6 lg:right-6 z-10 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground transition-colors hover:bg-background disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                  >
                    <Heart className={cn("size-5", isSaved ? "fill-foreground text-foreground" : "text-muted-foreground")} />
                  </button>
                </div>
              </div>
            </div>

            {/* Information */}
            <div className="w-full min-w-0 max-w-full overflow-wrap-break-word">
              {/* Category eyebrow: hidden on mobile only (reclaims the
                  space above the title so title/price/stock read as one
                  compact block) -- still rendered at sm+, untouched. */}
              <p className="hidden sm:block text-eyebrow text-muted-foreground">
                {collectionsLoading ? (
                  <span className="inline-block h-[1em] w-24 animate-pulse rounded bg-muted align-middle" aria-hidden />
                ) : (
                  (() => {
                    const categoryNode = (TAXONOMY as Record<string, { handle: string | null; title: string }>)[product.category];
                    return categoryNode ? resolveLiveTitle(collections, categoryNode) : product.category;
                  })()
                )}
              </p>
              {/* text-product-title: one shared, responsive scale for
                  every PDP regardless of category (see styles.css) -- a
                  clamp() per band (24-28px below 768px, 26-30px from
                  768px, 30-34px from 1200px, 32-36px from 1440px) so size
                  moves fluidly with viewport width inside each band
                  instead of jumping at the band edge.

                  [overflow-wrap:anywhere] is a safeguard only, for
                  an exceptionally long word/model-code with no natural
                  break point -- normal titles still wrap at word
                  boundaries, nothing is ever clamped or truncated.

                  [text-wrap:wrap] unconditionally (was [text-wrap:wrap]
                  below sm/md, text-balance above it, at various points in
                  this file's history): text-wrap:balance picks the wrap
                  point that makes ALL lines a similar length, not the
                  point that uses the most available width -- confirmed
                  live at MULTIPLE breakpoints now (375px, "Premium A5
                  Notebook Diary & Metal Pen Gift Set"; also 820-1440px,
                  "Premium 2-in-1 Diary & Ball Pen Gift Set -H3106",
                  breaking after "&" with a wide empty gap on both the
                  resulting lines) that it sacrifices available width
                  purely to even out line lengths, which is the opposite
                  of "use the full available width" -- plain greedy
                  wrapping packs each line as full as the actual available
                  width allows instead, which is what every width audit
                  this component has had confirms the container itself
                  already provides (h1's own rendered width exactly equals
                  its parent's at every breakpoint -- no max-width/fixed-
                  width/reserved-column anywhere in this element or its
                  ancestors). */}
              <h1 className="text-product-title mt-2 w-full min-w-0 font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] [text-wrap:wrap]">{product.name}</h1>
              <ProductRatingSummary reviews={reviews} />
              
              <div className="mt-6 flex flex-col space-y-5">
                {/* Price and SKU row */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-baseline gap-3 min-w-0">
                      <p className="text-2xl font-semibold tabular-nums text-foreground tracking-tight">
                        {pricePending
                          ? priceSkeleton
                          : displayPrice
                            ? `${!selectedVariant && product.startingPrice ? "From " : ""}${displayPrice}`
                            : "Price on enquiry"}
                      </p>
                      {showCompareAt ? (
                        <p className="text-sm tabular-nums text-muted-foreground line-through">
                          {formatMoney(compareAmount, currency)}
                        </p>
                      ) : null}
                      {!pricePending ? <DiscountBadge price={unitAmount} compareAtPrice={compareAmount} /> : null}
                    </div>
                    {/* Stock indicator on the price row: compact on mobile,
                        full "Ready to dispatch" text on sm+. */}
                    <div className="sm:hidden shrink-0">{renderStockStatus(true)}</div>
                    <div className="hidden sm:block shrink-0">{renderStockStatus(false)}</div>
                  </div>
                </div>

                {/* Category coupon offer (Fragrance / Corporate Gifting only);
                    product-level eligibility, so it does not depend on the variant. */}
                <ProductCouponOffer collectionHandles={product.collectionHandles} variantId={selectedVariant?.id} quantity={quantity} />

                {/* Variant choice */}
                {hasVariantChoice ? (
                  <div>
                    {/* sr-only (not hidden) below sm: the label text is
                        visually redundant once the selected swatch already
                        shows the color, but aria-labelledby below needs
                        this element to stay in the accessibility tree --
                        a display:none target doesn't compute as a label. */}
                    <p className="sr-only sm:not-sr-only sm:text-[13px] sm:font-medium sm:text-foreground/80 sm:mb-2" id="variant-label">
                      {node?.options?.find((o) => o.name.toLowerCase() !== "title")?.name ?? "Options"}
                      {selectedVariant ? (
                        <span className="ml-1 font-normal text-muted-foreground">— {selectedVariant.title}</span>
                      ) : null}
                    </p>
                    <div
                      role="group"
                      aria-labelledby="variant-label"
                      // Mobile: a single non-wrapping, horizontally-scrolling
                      // row -- flex-wrap at this width let a pill like
                      // "Blue" spill onto its own orphaned second row. sm+
                      // (where there's room) reverts to the original
                      // wrapping layout, unchanged.
                      className="flex flex-nowrap sm:flex-wrap gap-2 sm:gap-2.5 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {variants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        const thumb = v.image?.url;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => selectVariant(v)}
                            aria-pressed={isSelected}
                            className={cn(
                              "flex shrink-0 items-center gap-2 rounded-md border py-2 pl-2 pr-3 sm:pr-4 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                              thumb ? "" : "pl-4",
                              isSelected
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-background text-foreground hover:border-foreground/40",
                              !v.availableForSale ? "opacity-50" : "",
                            )}
                          >
                            {thumb ? (
                              <img
                                src={shopifyImageUrl(thumb, 48)}
                                alt=""
                                loading="lazy"
                                className="size-5 sm:size-6 shrink-0 rounded-[4px] bg-transparent object-cover"
                              />
                            ) : null}
                            <span className="whitespace-nowrap">{v.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Quantity and Actions Row */}
                <div ref={purchaseSectionRef} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <div className="inline-flex h-[52px] w-full sm:w-32 shrink-0 items-center border border-border bg-transparent rounded-md overflow-hidden">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => {
                        const next = Math.max(min, quantity - step);
                        setQuantityInput(String(next));
                        handleQuantityChange(next);
                      }}
                      className="px-4 text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors h-full flex items-center justify-center"
                    >
                      <Minus className="size-4" strokeWidth={2} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      name="quantity"
                      aria-label="Quantity"
                      value={quantityInput}
                      onChange={(e) => {
                        const next = e.target.value;
                        // Digits only, but an empty field is allowed while
                        // editing -- it's normalized on blur/Enter instead
                        // of being forced back to the minimum immediately.
                        if (next === "" || /^\d+$/.test(next)) setQuantityInput(next);
                      }}
                      onFocus={(e) => {
                        quantityInputFocusedRef.current = true;
                        e.currentTarget.select();
                      }}
                      onBlur={() => {
                        quantityInputFocusedRef.current = false;
                        commitQuantity();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="flex-1 min-w-0 h-full bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => {
                        const next = clampToQuantityRule(quantity + step);
                        setQuantityInput(String(next));
                        handleQuantityChange(next);
                      }}
                      className="px-4 text-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors h-full flex items-center justify-center"
                    >
                      <Plus className="size-4" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="flex flex-1 gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={handleAddToCartClick}
                      disabled={isAddingToCart || (!!selectedVariant && !selectedVariant.availableForSale)}
                      className="flex-1 h-[52px] text-[13px] font-semibold tracking-wide uppercase bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/80 shadow-none rounded-md"
                    >
                      {isAddingToCart ? <Loader2 className="size-4 animate-spin" /> : isItemInCart ? "View Cart" : "Add to Cart"}
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleBuyNowClick}
                      disabled={isBuyingNow || (!!selectedVariant && !selectedVariant.availableForSale)}
                      className="flex-1 h-[52px] text-[13px] font-semibold tracking-wide uppercase bg-foreground text-background hover:bg-foreground/90 shadow-none rounded-md"
                    >
                      {isBuyingNow ? <Loader2 className="size-4 animate-spin" /> : selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Buy Now"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Corporate Gifting Customizer CTA. @container, not sm:/lg:
                  viewport breakpoints: this card's available width is the
                  PDP info column's width, which is NOT the viewport width
                  once the grid above goes 2-column (at 1024px viewport
                  the info column is only ~440px even though the viewport
                  itself is well past "sm"/"lg") -- confirmed live this
                  mismatch was exactly what made the heading itself wrap
                  to "Make It" / "Yours" at 1024px width under the old
                  sm:/lg: version, despite that viewport being well above
                  both breakpoints. Querying the card's own rendered width
                  instead makes it correct regardless of where it's
                  embedded. */}
              {product.category === "Corporate Gifting" && (
                <div ref={corporateCtaRef} className="mt-8 @container">
                  <div className="rounded-xl bg-muted/30 border border-border p-5 @[600px]:p-6 flex flex-col @[400px]:flex-row @[400px]:items-center gap-3 @[400px]:gap-4 @[600px]:gap-5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-foreground">Make It Yours</h3>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-[1.5]">
                        Add your company's branding and see how your gift could look before requesting a quote.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      className="w-full @[400px]:w-[180px] @[600px]:w-[205px] @[760px]:w-[230px] whitespace-normal text-center leading-tight px-4 py-2.5 min-h-11 shrink-0"
                      onClick={() => {
                        setHasOpenedCustomizer(true);
                        setCustomizerOpen(true);
                      }}
                    >
                      Customize This Product
                    </Button>
                  </div>
                </div>
              )}

              {hasOpenedCustomizer && (
                <Suspense fallback={null}>
                  <ProductCustomizer
                    product={product}
                    selectedVariant={effectiveSelectedVariant}
                    rawProductNode={node}
                    open={customizerOpen}
                    onOpenChange={setCustomizerOpen}
                  />
                </Suspense>
              )}

              
              {/* Zoom Lightbox */}
              {zoomOpen && (
                <div 
                  className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-background/95 backdrop-blur-sm"
                  style={{ touchAction: "pinch-zoom" }}
                  role="dialog"
                  aria-modal="true"
                >
                  <button
                    onClick={() => setZoomOpen(false)}
                    className="absolute top-4 right-4 lg:top-8 lg:right-8 z-50 flex items-center justify-center size-12 rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    aria-label="Close zoom"
                  >
                    <X className="size-6" />
                  </button>
                  
                  <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                    <img
                      src={shopifyImageUrl(activeMedia?.url ?? product.images[0], 1600)}
                      alt={activeMedia?.alt || `${product.name} - zoomed`}
                      className="w-full h-full object-contain"
                    />

                    {gallery.length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(); }}
                          aria-label="Previous product image"
                          className="absolute left-0 lg:left-8 top-1/2 -translate-y-1/2 flex items-center justify-center size-12 lg:size-14 rounded-full bg-background border border-border text-foreground hover:bg-secondary transition-colors shadow-lg"
                        >
                          <ChevronLeft className="size-6 lg:size-8" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(); }}
                          aria-label="Next product image"
                          className="absolute right-0 lg:right-8 top-1/2 -translate-y-1/2 flex items-center justify-center size-12 lg:size-14 rounded-full bg-background border border-border text-foreground hover:bg-secondary transition-colors shadow-lg"
                        >
                          <ChevronRight className="size-6 lg:size-8" />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* Lightbox Thumbnails (Desktop only) */}
                  {gallery.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden lg:flex gap-3 px-4 py-3 rounded-2xl bg-background border border-border shadow-xl">
                      {gallery.map((media, i) => (
                        <button
                          key={media.url + "-zoom"}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveImage(i); }}
                          className={cn(
                            "size-16 shrink-0 overflow-hidden rounded-lg border transition-all",
                            activeImage === i
                              ? "border-foreground ring-1 ring-foreground opacity-100"
                              : "border-border opacity-50 hover:opacity-100",
                          )}
                        >
                          <img src={shopifyImageUrl(media.url, 100)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Trust Badges */}
              <div className="mt-8 grid grid-cols-4 border-t border-border/60 pt-6 pb-2 w-full">
                <div className="flex flex-col items-center justify-start text-center">
                  <ShieldCheck className="size-5 mb-1 text-foreground/70" />
                  <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Quality<br/>Assured</span>
                </div>
                <div className="flex flex-col items-center justify-start text-center">
                  <Lock className="size-5 mb-1 text-foreground/70" />
                  <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Secure<br/>Checkout</span>
                </div>
                {(product.name.toLowerCase().includes('dell') || product.name.toLowerCase().includes('logitech') || product.vendor?.toLowerCase() === 'dell' || product.vendor?.toLowerCase() === 'logitech' || product.tags?.some((t) => t.toLowerCase().includes('warranty'))) ? (
                  <div className="flex flex-col items-center justify-start text-center">
                    <Award className="size-5 mb-1 text-foreground/70" />
                    <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Official<br/>Warranty</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-start text-center">
                    <Truck className="size-5 mb-1 text-foreground/70" />
                    <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Fast<br/>Dispatch</span>
                  </div>
                )}
                <div className="flex flex-col items-center justify-start text-center">
                  <BadgeCheck className="size-5 mb-1 text-foreground/70" />
                  <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">100%<br/>Guaranteed</span>
                </div>
              </div>

              {/* Product Information Accordions */}
              <ProductInformation product={product} />
            </div>
          </div>

          {/* Customer Reviews */}
          <ProductReviews
            reviews={reviews}
            productHandle={slug}
          />
              </div>

        {/* Related -- same full-bleed #F5F5F7 section + white-card
            ProductCard treatment as the main /products listing page (see
            products.index.tsx's own "Catalogue body" comment): the gray
            background belongs to an UNconstrained wrapper, with only the
            inner content (heading + grid) centered/padded to max-w-1600px,
            which is what makes the color reach the true page edges instead
            of stopping at the rest of the PDP's own max-width. A sibling
            of (not nested inside) the max-w-[1600px] div above for exactly
            that reason. ProductCard gets no imageWellClassName override
            now, so its image well falls back to its own default white --
            previously this passed bg-[#F5F5F7], which (combined with the
            page's plain white background behind it) was the inverse of
            the intended look. */}
        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="mt-16 bg-[#F5F5F7] sm:mt-24">
            <div className="mx-auto w-full max-w-[1600px] px-5 py-14 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
              <div className="text-center mb-10">
                <h2 id="related-heading" className="text-[14px] sm:text-[15px] font-semibold tracking-[0.1em] text-foreground uppercase">
                  Related Products
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Explore more products you may like.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} pricePending={pricePending} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />

      {/* Sticky Purchase Bar */}
      <div 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-in-out",
          showStickyBar ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pt-4 lg:pb-4">

          {/* Desktop layout */}
          <div className="hidden lg:flex w-full items-center justify-between gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <img src={shopifyImageUrl(activeMedia?.url ?? product.images[0], 100)} loading="lazy" className="size-12 shrink-0 rounded-md object-contain bg-secondary/30 border border-border p-0.5" alt="" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{product.name}</p>
                <p className="text-sm font-medium text-muted-foreground">{pricePending ? priceSkeleton : displayPrice}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Sticky Bar Quantity Selector */}
              <div className="flex h-11 items-center rounded-md border border-border bg-background">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - step)}
                  className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Minus className="size-3.5" strokeWidth={1.5} />
                </button>
                <div className="flex h-full w-12 items-center justify-center border-x border-border text-sm font-medium tabular-nums text-foreground">
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + step)}
                  className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Plus className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>

              {hasVariantChoice && (
                <VariantSelectorDesktop
                  variants={variants}
                  selectedVariantId={selectedVariantId}
                  onSelect={selectVariant}
                  optionName={node?.options?.find((o) => o.name.toLowerCase() !== "title")?.name ?? "Options"}
                  triggerClassName="h-11 w-[180px] xl:w-[220px]"
                />
              )}
              <Button
                onClick={handleAddToCartClick}
                disabled={isAddingToCart || (!!selectedVariant && !selectedVariant.availableForSale)}
                className="h-11 w-[220px] xl:w-[280px] font-medium"
              >
                {isAddingToCart ? <Loader2 className="size-4 animate-spin" /> : selectedVariant && !selectedVariant.availableForSale ? "Sold out" : isItemInCart ? "View Cart" : "Add to Cart"}
              </Button>
            </div>
          </div>

          {/* Mobile layout */}
          <div className="flex flex-col lg:hidden w-full gap-2.5">
            {/* Product summary -- thumbnail + up-to-2-line title + price.
                Title and price are stacked, not forced onto one cramped
                row, so a long product name never pushes the price off to
                an awkward width or forces truncation mid-word. */}
            <div className="flex items-start gap-3">
              <img
                src={shopifyImageUrl(activeMedia?.url ?? product.images[0], 100)}
                loading="lazy"
                className="size-11 shrink-0 rounded-lg object-contain bg-secondary/30 border border-border p-1"
                alt=""
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] font-medium leading-snug text-foreground line-clamp-2">{product.name}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {pricePending ? priceSkeleton : displayPrice}
                </p>
              </div>
            </div>

            {/* Variant selector -- its own compact, clearly separated row
                (only rendered when there's an actual choice to make), so
                it never competes for space with quantity/Add below. */}
            {hasVariantChoice && (
              <VariantSelectorMobile
                variants={variants}
                selectedVariantId={selectedVariantId}
                onSelect={selectVariant}
                optionName={node?.options?.find((o) => o.name.toLowerCase() !== "title")?.name ?? "Options"}
                triggerClassName="h-9 w-full"
              />
            )}

            {/* Quantity + Add -- the one row these two share, aligned and
                with room to breathe now that the variant selector (when
                present) has its own row above. */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-11 shrink-0 items-center rounded-lg border border-border bg-background">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - step)}
                  className="flex h-full w-9 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Minus className="size-3.5" strokeWidth={1.5} />
                </button>
                <div className="flex h-full w-9 items-center justify-center border-x border-border text-sm font-medium tabular-nums text-foreground">
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + step)}
                  className="flex h-full w-9 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Plus className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
              <Button
                onClick={handleAddToCartClick}
                disabled={isAddingToCart || (!!selectedVariant && !selectedVariant.availableForSale)}
                className="h-11 flex-1 font-medium"
              >
                {isAddingToCart ? <Loader2 className="size-4 animate-spin" /> : selectedVariant && !selectedVariant.availableForSale ? "Sold out" : isItemInCart ? "View Cart" : "Add to Cart"}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
