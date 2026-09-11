# Shopify storefront token: findings and recommendation

Investigation complete. Nothing has been changed on the store or the site. No token value was printed.

## 1. Owner of the current token

The store is "My Store 2" (har1k4-di). The token the site uses is the one issued by Lovable's Shopify integration, running on the project's temporary store access granted when the store was claimed. It is not a token from the Headless channel, which is why the permissions ticked on "My Store 2 Headless" have no effect on it.

## 2. What the current token can and cannot do

Allowed: products, collections, store info, cart and checkout, localization.
Refused: customers read, customers write, blog/page content, metaobjects, selling plans.

## 3. The "My Store 2 Headless" token

Tested against the live store: products work, customer read works, customer login/registration works, content works. It carries everything the site needs.

## 4. Recommendation

Point the site at the "My Store 2 Headless" public token instead of the integration token.

Reason: it already has the correct permissions, verified live. The alternative — widening the integration token's permissions — depends on an app whose settings we cannot reach or guarantee, and that token is temporary access tied to store claiming.

### Steps once approved

1. Save the Headless public token under its permanent name via the secure form (the test copy already provided can be promoted; no value passes through chat).
2. Point the browser-side storefront client and the server-side saves helper at that value, replacing the integration-supplied one. Files: `vite.config.ts` (env bridge) and `src/lib/shopify.ts`; `src/lib/saves.server.ts` reads the server-side name.
3. Leave the existing managed secret in place and untouched.
4. Re-run the eight checks: catalogue, images and variants, cart, customer login, registration, account page, saved products, typecheck.
5. Delete the temporary test secret.

Nothing in the Shopify Admin needs changing under this option.
