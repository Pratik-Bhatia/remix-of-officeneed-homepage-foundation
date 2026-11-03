# Officeneed — Performance Audit (Phase A only)

This plan covers **Phase A of your brief: audit only**. No code, dependencies, settings, data, tracking or the Remove.bg setup will change. Phase B (fixes) begins only after you approve specific items from the report.

## What will be measured
- Pages: Homepage, Corporate Gifting, Officeneed Exclusive, Fragrances, Office Stationery, Computer Peripherals, a normal product page, a fragrance product page, Search, Cart.
- Conditions: desktop, normal mobile, throttled slow 4G.
- Metrics: TTFB, FCP, LCP, CLS, TBT, Speed Index (INP approximated in the lab via interaction timing), JS/CSS/image bytes, request count, load times.
- Several runs per page; medians and spread reported. Live site (officeneed.store) and a local production build reported separately.

## What will be inspected
1. Bundle composition: each major chunk, compressed/uncompressed size, which pages load it, and whether it is needed up front.
2. Dependencies: unused, duplicate or heavy packages (checked against dynamic imports and runtime use before being flagged).
3. Rendering: long main-thread tasks and costly components, using browser profiling — no blanket memoization.
4. Images: formats, sizes/srcset, lazy vs priority loading, LCP image, duplicate downloads.
5. Fonts/CSS: font payload and weights, render-blocking styles, heavy blur/shadow effects.
6. Shopify: duplicate or sequential queries, payload size, caching — confirming customer-specific prices are never shared-cached.
7. Backend: duplicate requests, repeated auth checks, slow queries (read-only stats).
8. Third parties: GA4, Meta Pixel/CAPI, Clarity, Needle — load order, duplicate firing, blocking.
9. Hosting: cache headers, compression, protocol, redirects (including www), TTFB variability — split into app-fixable vs platform issues.
10. Cleanup candidates: dead code, unused assets, debug logging — listed only, not removed.

## Deliverable
A written report saved to Files (`/mnt/documents/performance/audit.md`) plus a chat summary:
- Baseline tables, bundle analysis, slowest pages/components, waterfall findings.
- Each finding graded Critical / High / Medium / Low with expected benefit, risk, and the features it could affect.
- A prioritized Phase B fix list for your approval.

## Limits to be stated in the report
- Lab measurements only; real-user field data is not available here.
- Signed-in B2B pricing paths will be inspected in code; measured only if a test sign-in is possible.

## Technical details
- Playwright + Chrome DevTools Protocol (CPU/network throttling, performance traces, resource timing) and Lighthouse via npx in /tmp.
- `vite build` output analyzed with a bundle visualizer run from /tmp, without adding dependencies to the project.
- `curl -I` for headers/compression; `supabase--slow_queries` for read-only database stats.
