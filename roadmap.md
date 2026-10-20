# Roadmap

- [x] Fix shared fragrance information extraction and stable PDP accordions; source-priority regressions, live Azzaro/Davidoff navigation, refresh, desktop and mobile verified; no catalogue changes or publishing.

- [ ] Swap Shopify Storefront token from old to new headless public token — BLOCKED: `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is managed by the Shopify integration (not editable via secrets tools). User must update/reconnect in Connectors (workspace sidebar) or Project Settings → Secrets. Awaiting user action; also need the NEW token value (never received in chat — user must enter it in the secure UI, not paste in chat).
- [ ] After token swap: republish, verify catalog/cart/login/registration (customerCreate), account page, saves.
- [x] Headless Shopify edge cases: stock errors, tab sync, discount codes, variant links + share previews, in-site order details, removed-product cleanup, expired sign-in, checkout UTM handoff
- [x] Footer Mastercard badge: replaced with the user's uploaded mark, background made truly transparent, light chip added so the black wordmark reads on the dark footer bar.
- [x] Footer American Express badge: replaced from the uploaded `American_Express_logo_2018.svg`, background transparent, verified in the footer.
- [x] Footer UPI badge: replaced with the uploaded `UPI-Logo.png`, white background removed, grey lettering lightened for the dark footer bar.
- [x] Footer RuPay badge: removed from the payment row at the user's request (file kept in `src/assets` in case it is wanted again).
- [x] Needle launcher: fades out while the footer is on screen (IntersectionObserver on `<footer>`, re-attaches if the node is replaced), returns on scroll up; click-to-open still verified desktop and mobile; not published.
- [x] Officeneed Exclusive brand mark: replaced with the user's new `180x180.svg` (CDN asset pointer updated); its built-in 84% canvas margin compensated in `ShopByCategory.tsx` (72.17% of the well) and `products.index.tsx` (padding 12% -> 4.8%) so the mark renders at the same visual size; verified unclipped with the ® symbol on desktop/tablet/mobile; not published.
