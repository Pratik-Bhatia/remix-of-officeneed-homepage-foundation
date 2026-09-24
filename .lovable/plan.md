# Cross-device cart sync on sign-in

## Important finding
Shopify's Storefront API has **no query to look up a customer's cart** from their customerAccessToken — carts are anonymous objects identified only by cartId. So "fetch the customer's cart from Shopify" can't be done directly. The fix: remember each signed-in customer's cartId in our own database (same secure pattern already used for "Your Saves"), then load that cart from Shopify on any device at sign-in.

## What the shopper will see
- Add items on laptop while signed in, then sign in on phone: the bag on the phone shows the same items straight away (drawer badge, drawer, and cart page).
- If the phone already had items before sign-in, they are merged into the account's bag (no items lost).
- If the saved bag was already checked out or expired, it's ignored and the current bag becomes the account's bag.

## Steps
1. **Database**: new table `customer_carts` (shopify_customer_id unique, cart_id, updated_at). RLS on, no public access; service-role only (like `customer_saves`).
2. **Server functions** (`src/lib/customer-cart.functions.ts`): `getCustomerCart(token)` and `saveCustomerCart(token, cartId)`. Both verify the token with Shopify via existing `resolveCustomerId` before reading/writing.
3. **Cart store**: add `adoptRemoteCart(cartId)` — queries the full cart (lines, merchandise, product, images, cost), rebuilds local items with lineIds, sets cartId/checkoutUrl; persisted to local storage automatically. Add `mergeIntoRemote` — adds local-only lines to the remote cart via `cartLinesAdd`, then `cartBuyerIdentityUpdate`.
4. **Sign-in hook**: after `signInCustomer` succeeds (and on page load when a valid token exists), run `syncCustomerCart`:
   - remote cart exists with items -> merge local items in, adopt remote cart
   - otherwise -> attach buyer identity to local cart and save its id as the account's cart
5. **Keep the pointer fresh**: whenever a new cart is created while signed in, or cleared after checkout, update/remove the saved cartId.
6. Sign-out leaves the account's saved bag intact but clears the local bag on that device.

## Technical notes
- Cart lookup query uses `cart(id:)` with lines(first:100) including variant, product handle/title/images, price, selectedOptions; null merchandise lines dropped (existing `extractLines` logic).
- Tab-sync storage event already rehydrates other tabs.
- Verify with Playwright: two browser contexts, same customer, add in one, sign in on the other, check drawer count.
