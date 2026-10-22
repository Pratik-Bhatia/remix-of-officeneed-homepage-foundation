import { createFileRoute } from "@tanstack/react-router";
import { getRouterInstance } from "@tanstack/react-start";
import {
  isSitemapRouteIncluded,
  sitemapPathForLocation,
  sitemapStaticPaths,
  sitemapXML,
  type SitemapEntry,
} from "@/lib/sitemap";

const BASE_URL = "https://officeneed.store";

// Code-backed blog articles (same slugs the /blog index links to).
const BLOG_SLUGS = [
  "future-of-workspaces",
  "top-10-ergonomic-chairs",
  "sustainable-office-supplies",
  "essential-tech-upgrades",
  "corporate-gifting-ideas",
];

// Same Storefront API endpoint + env-token resolution as
// src/lib/shopify.functions.ts — the token is read at request time and
// never leaves the server.
const SHOPIFY_API_VERSION = "2026-10";
const SHOPIFY_STOREFRONT_URL = `https://har1k4-di.myshopify.com/api/${SHOPIFY_API_VERSION}/graphql.json`;

const SITEMAP_PRODUCTS_QUERY = /* GraphQL */ `
  query SitemapProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        node {
          handle
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Every published product handle, paginated to the end. Any failure
 * throws so the sitemap never serves partial XML. */
async function fetchAllProductHandles(): Promise<string[]> {
  const storefrontToken =
    process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN"] ??
    process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN_TEST"] ??
    process.env["SHOPIFY_STOREFRONT_ACCESS_TOKEN"];
  if (!storefrontToken) {
    throw new Error("Shopify Storefront token is not configured on the server.");
  }

  const handles: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({
        query: SITEMAP_PRODUCTS_QUERY,
        variables: { cursor },
        operationName: "SitemapProducts",
      }),
    });
    if (!response.ok) {
      throw new Error(`Shopify sitemap query failed [${response.status}]`);
    }
    const json = (await response.json()) as {
      data?: {
        products?: {
          edges: Array<{ node: { handle: string } }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(`Shopify sitemap query returned errors: ${json.errors[0]!.message}`);
    }
    const products = json.data?.products;
    if (!products) {
      throw new Error("Shopify sitemap query returned no product data");
    }
    for (const edge of products.edges) handles.push(edge.node.handle);
    if (!products.pageInfo.hasNextPage) break;
    cursor = products.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify sitemap query lost its pagination cursor");
  }
  return handles;
}

export const Route = createFileRoute("/sitemap.xml")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        try {
          const router = await getRouterInstance();
          const entries: SitemapEntry[] = sitemapStaticPaths(router).map((path) => ({ path }));

          // Blog articles — code-backed local content.
          const blogRouteId = "/blog/$slug";
          if (isSitemapRouteIncluded(router.routesById[blogRouteId])) {
            for (const slug of BLOG_SLUGS) {
              const location = router.buildLocation({
                to: "/blog/$slug",
                params: { slug },
                search: () => ({}),
                hash: "",
              });
              const path = sitemapPathForLocation(router, location, blogRouteId);
              if (path) entries.push({ path });
            }
          }

          // Product pages — the full Shopify catalogue, paginated.
          const productRouteId = "/products/$slug";
          if (isSitemapRouteIncluded(router.routesById[productRouteId])) {
            for (const handle of await fetchAllProductHandles()) {
              const location = router.buildLocation({
                to: "/products/$slug",
                params: { slug: handle },
                search: () => ({}),
                hash: "",
              });
              const path = sitemapPathForLocation(router, location, productRouteId);
              if (path) entries.push({ path });
            }
          }

          if (entries.length === 0) {
            return new Response(
              'No pages are included in this sitemap. Check route decisions and ancestor exclusions. Setting "exclude-subtree" on the root excludes the entire site.',
              { status: 404, headers: { "Cache-Control": "no-store" } },
            );
          }
          return new Response(sitemapXML(BASE_URL, entries), {
            headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
          });
        } catch (error) {
          // Never serve a partial sitemap: surface the failure instead.
          console.error("Sitemap generation failed:", error);
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
