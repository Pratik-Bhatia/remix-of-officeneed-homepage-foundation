# Meta Pixel + Conversions API for OfficeNeed

## Goal
Track visits and key shopping steps in Meta (Pixel in the browser, Conversions API on the server) with matched event IDs so Meta counts each action once.

## What gets built
1. **Pixel ID config** - `VITE_META_PIXEL_ID=1610689520588834` injected through the existing `vite.config.ts` env pattern (public ID, safe in browser). Server reads `META_PIXEL_ID` from the same value.
2. **One central tracker** `src/lib/meta-pixel.ts` - loads fbevents.js once (guarded by `window.fbq`), `init` once, exposes `trackPageView`, `trackEvent(name, data)`; each call creates an `event_id` (UUID) and sends the same ID to the server CAPI call. Safe during server rendering (no-op).
3. **Init point** - a `MetaPixel` component mounted once in `src/routes/__root.tsx`, next to `CartSync`.
4. **PageView** - fired from a router subscription (`onResolved`) keyed on the pathname+search, skipping repeats of the same URL, so first load and every in-app navigation each send exactly one PageView. The base snippet's own `fbq('track','PageView')` is not used, preventing a double first hit.
5. **noscript fallback** - the 1x1 image added inside `<body>` in `RootShell` (PageView only, for no-JS visitors).
6. **Events**
   - ViewContent: product page (`products.$slug.tsx`) when product/variant loads; content_ids = variant ID, value, INR.
   - Search: `SearchModal` on submitted/debounced query (search_string).
   - AddToCart: inside `cartStore.addItem` after Shopify confirms the line.
   - InitiateCheckout: inside `cartStore.prepareCheckout` once the checkout URL is ready (drawer and cart page both use it); value, num_items, content_ids.
   - Lead: after successful `submitEnquiry` and `submitCorporateQuote` (and chat widget lead capture), event_id passed to the server so CAPI fires from the server function itself.
   - Purchase: not tracked from the site (see below).
7. **CAPI server side** - `src/lib/meta-capi.server.ts` (posts to `graph.facebook.com/v21.0/{pixel}/events`) and `src/lib/meta-capi.functions.ts` (server function the browser calls with event name, event_id, custom data, page URL). Server adds client IP, user agent, `_fbp`/`_fbc` cookies, and SHA-256 hashed email/phone when known (signed-in customer or lead form). Token read only inside the handler from secret `META_CAPI_ACCESS_TOKEN`; never sent to the browser. Failures are logged, never break the page.
8. **Dedup** - identical `event_name` + `event_id` sent by Pixel (`fbq('track', name, data, {eventID})`) and CAPI; Meta merges them.

## Purchase
Checkout completes on Shopify's own hosted checkout, which the site never sees again, so the site cannot reliably detect a completed order. Recommended: enable Shopify's official "Facebook & Instagram" sales channel with the same Pixel (it sends Purchase from checkout + server). Optional later: a verified Shopify `orders/create` webhook sending Purchase via CAPI - needs a Shopify Admin webhook secret, not in this pass.

## Needed from you
- A Conversions API access token (Meta Events Manager > Pixel > Settings > Generate access token). I will open a secure form after approval; nothing is pasted in chat.

## Verification (reported after build)
Meta Pixel Helper extension, Events Manager > Test Events (optional `META_TEST_EVENT_CODE` secret), checking "Browser + Server" deduplicated events. Unchanged: Shopify cart/checkout logic, backend tables, auth.
