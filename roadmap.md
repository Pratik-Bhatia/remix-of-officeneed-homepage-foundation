# Roadmap

- [x] Fix shared fragrance information extraction and stable PDP accordions; source-priority regressions, live Azzaro/Davidoff navigation, refresh, desktop and mobile verified; no catalogue changes or publishing.

- [ ] Swap Shopify Storefront token from old to new headless public token — BLOCKED: `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is managed by the Shopify integration (not editable via secrets tools). User must update/reconnect in Connectors (workspace sidebar) or Project Settings → Secrets. Awaiting user action; also need the NEW token value (never received in chat — user must enter it in the secure UI, not paste in chat).
- [ ] After token swap: republish, verify catalog/cart/login/registration (customerCreate), account page, saves.
- [x] Headless Shopify edge cases: stock errors, tab sync, discount codes, variant links + share previews, in-site order details, removed-product cleanup, expired sign-in, checkout UTM handoff
- [x] Footer Mastercard badge: replaced with the user's uploaded mark, background made truly transparent, light chip added so the black wordmark reads on the dark footer bar.
- [x] Footer American Express badge: replaced from the uploaded `American_Express_logo_2018.svg`, background transparent, verified in the footer.
- [ ] Footer UPI badge: uploaded `UPI-Logo.png` has a solid white background; transparent version still to be made — paused pending the "remove this" request.
- [ ] Remove the payment badge the user selected in the footer — BLOCKED: the selection did not identify which badge; asked the user.
