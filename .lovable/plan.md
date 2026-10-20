# Officeneed — Website URL & Routing Audit (read-only)

No code, URL, redirect, database, Shopify or deployment changes. The output is a written report only.

## Launch-safety rules

- Nothing gets modified: files, dependencies, environment variables, records, Shopify, DNS, redirects, payment, email or deployment settings.
- The access-code cover page is not removed, bypassed or changed.
- Account switching, pending B2B approval, sign-in, quantity rules, pricing, cart and checkout are not touched.
- `/products?collection=perfumes` is treated as an existing URL to investigate. It is not assumed to be a bug.
- Each proposed URL change lists its benefits, risks, backward compatibility and whether it needs redirects. None of them get implemented.
- Findings are labelled as confirmed defect, recommendation or unverified assumption.

## Steps

1. **Route inventory from code** — read every file in `src/routes` (including `api/` server routes, `admin/*`, `account.*`, `shop.*`, `products.*`, `blog.*`), the root not-found handling, and route guards. Record path, component, access level (public / signed-in / admin), and search params (`validateSearch`).
2. **Link tracing** — inspect Navbar + mobile menu, Hero, ShopByCategory, Best Products, Corporate Gifting carousel, ProductCard, SearchModal, filters/sort/pagination in `products.index`, CartDrawer/cart checkout, account tabs and mode switcher, Footer, `navigation.ts`, `taxonomy.ts`, and email/PDF link builders. Flag wrong paths, slugs that don't match the mappings, and links that drop state.
3. **Shopify boundary** — sort URLs into app-handled vs Shopify-hosted (checkout domain, customer account URLs), check how handles and variants are used in links, and flag any links that use internal IDs instead of handles.
4. **SEO review** — check head() titles/descriptions/canonical/og:url on each public page; sitemap and robots; duplicate URLs (`/shop` vs `/products`, `?collection=` variants, trailing slashes, casing); and existing redirects.
5. **Browser checks (Playwright, local preview, read-only)** — direct load and refresh of nested routes, back/forward, collection to product and back, filter/search persistence, invalid product/collection slugs, unknown URL (404), desktop and mobile menu, account signed-out redirect. No orders, emails or data writes. Signed-in B2B/B2C checks only if a session can be created without changing data; otherwise marked unverified.

## Report deliverable (in chat)

- A. Route inventory table with status (verified / needs testing / broken / unknown)
- B. URL issues with location, expected vs actual, severity and fix
- C. Proposed URL architecture: current vs proposed
- D. Redirect / backward-compatibility plan (not implemented)
- E. Launch risk: purchase-breaking vs cosmetic vs optional SEO
- F. Prioritized minimal-risk implementation sequence
- Top five findings, each labelled code-inspected / browser-tested / assumption, then a request for approval before any changes

## Technical notes

- Production has the access-code cover page on; testing runs against the local preview, so live-site behaviour is reported as unverified unless checked separately.
