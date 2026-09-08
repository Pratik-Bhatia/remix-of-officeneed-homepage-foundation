# Roadmap

- [ ] Swap Shopify Storefront token from old to new headless public token — BLOCKED: `SHOPIFY_STOREFRONT_ACCESS_TOKEN` is managed by the Shopify integration (not editable via secrets tools). User must update/reconnect in Connectors (workspace sidebar) or Project Settings → Secrets. Awaiting user action; also need the NEW token value (never received in chat — user must enter it in the secure UI, not paste in chat).
- [ ] After token swap: republish, verify catalog/cart/login/registration (customerCreate), account page, saves.
