# Fix Shopify products on the published site

## Confirmed issue

The published storefront loads **0 products** and Shopify returns **401 Unauthorized**. Its downloaded browser package still contains the unreplaced `__SHOPIFY_STOREFRONT_TOKEN__` placeholder, while the Lovable preview can access the Headless token. This confirms the production build cannot read that runtime-managed value during browser-package creation.

## Implementation

1. Add a same-site Shopify Storefront API endpoint that reads `SHOPIFY_HEADLESS_STOREFRONT_TOKEN` at request time, with the existing managed token retained only as fallback.
2. Validate request payloads and proxy Storefront GraphQL responses without logging or returning either token.
3. Update the shared Shopify request helper to call this endpoint instead of requiring a token embedded in browser JavaScript.
4. Route catalogue, collections, product details, variants, cart, customer login/registration, and account requests through the shared endpoint. Keep server-side saved-product verification on its existing runtime-secret path.
5. Remove the fragile build-time token placeholder/replacement code while leaving all existing secrets untouched.

## Verification

- Check locally that catalogue, collection filtering, product images, variants, and prices load.
- Test cart creation and checkout URL generation.
- Probe customer login and registration permissions without creating a customer.
- Check account and saved-product request paths.
- Run the project typecheck and relevant tests.
- Publish the corrected build, then verify the public URL makes successful Shopify requests and shows the full live catalogue.

## Safety

- No Shopify token will be printed, logged, hardcoded, deleted, or recreated.
- No Shopify permissions, admin authentication, OfficeNeed AI, or product data will be changed.
