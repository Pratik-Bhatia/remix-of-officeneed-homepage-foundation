# Investigate which Shopify storefront owns the managed token

No changes to the store, the site, or any credentials. This is a read-only fact-finding pass so we know exactly what to fix before touching anything.

## Confirmed so far

- The token the site uses is issued by the Shopify app that Lovable installed on the store, not by the Headless channel.
- Against the live store, that token can read products but is refused for both customer read and customer write.
- The permissions already ticked on "My Store 2 Headless" do not apply to it.

## What the investigation will establish

1. Whether the token behaves like a Headless-channel storefront token or a custom-app token, by probing which capability groups it can and cannot reach (products, collections, cart, checkout, customers, selling plans, metaobjects). The pattern of allowed scopes fingerprints the source.
2. Whether the store has more than one storefront/app issuing Storefront tokens, using the store's own listing rather than guesswork.
3. Whether the "My Store 2 Headless" public token in fact carries the customer scopes, so we know it is a real alternative before recommending it. This needs you to paste that token into a secure form once; it is never printed and never written into the code.
4. A single recommendation: either the exact place in Shopify Admin to grant Customers read + write to the connected app, or a switch to the Headless token.

## What you will get

A short report naming the owning app or storefront as precisely as the store lets us determine, the exact permissions the current token holds, and one recommended path with the concrete steps for it.

## Technical notes

- Probing uses read-only Storefront GraphQL queries and permission-denied signatures; no mutations that create data.
- Storefront API version stays 2025-07; `src/lib/shopify.ts` and `vite.config.ts` are untouched during the investigation.
- If the Headless token has to be tested, it is stored as a project secret and read server-side only, never logged.
