# Headless Shopify edge-case fixes

## What shoppers will notice
1. **Out-of-stock messages** – adding a sold-out item, or pushing quantity past what's in stock, shows a clear message ("Only 3 left in stock") instead of silently doing nothing. Quantity snaps back to what Shopify actually allows.
2. **Bag stays in sync across tabs** – add something in one tab and the bag count updates in every other open tab. Signing in/out in one tab updates the others too. Refresh keeps the bag and sign-in.
3. **Discount codes in the bag** – a "Discount code" box in both the bag drawer and the full bag page. Valid codes show the saving and new subtotal; invalid ones show "This code isn't valid". Codes can be removed. The code carries through to Shopify checkout.
4. **Shareable variant links** – product pages accept `?variant=123456789`. Opening such a link pre-selects that option, its price and its photo. Picking a different option updates the link so it can be shared.
5. **Account stays on our site** – orders and addresses already load inside our account pages. The one outbound link ("order status", which points to Shopify) will be replaced with an in-site order detail view; no account links will send shoppers to myshopify.com account pages.

## Technical details
- `cartStore.ts`: request `quantityAvailable`/`availableForSale` on lines, `cost` and `discountCodes { code applicable }`, `discountAllocations`. Parse `userErrors` and `warnings` (e.g. `MERCHANDISE_NOT_ENOUGH_STOCK`, `MERCHANDISE_OUT_OF_STOCK`); add a `lastError` + surface via sonner `toast.error` (top-center Toaster already mounted). Revert optimistic quantity to Shopify-reconciled value on failure. Block add when `availableForSale === false` on product page/card.
- Add `applyDiscountCode(code)` / `removeDiscountCode()` using `cartDiscountCodesUpdate`; store `discountCodes`, `subtotal`, `total` from cart `cost`. New `DiscountCodeInput` component used in `CartDrawer.tsx` and `routes/cart.tsx`; totals switch to Shopify `cost` when present.
- Tab sync: `window` `storage` event listener in `useCartSync` calling `useCartStore.persist.rehydrate()` for key `shopify-cart`, and re-broadcast customer token changes (key `officeneed_customer_token`) through the existing token event so `useCustomer` refreshes.
- Variant deep link: `products.$slug.tsx` and `shop.$handle.tsx` get `validateSearch` with optional `variant` (string, numeric id or full gid). Initial selection resolves it against `variants` (match numeric suffix of gid), falls back to default. `selectVariant` calls `navigate({ search: prev => ({...prev, variant: numericId}), replace: true })` and jumps gallery to variant image.
- Account: remove `statusUrl` external link in `account.orders.tsx`; add expandable order detail (line items, totals, fulfillment/financial status, shipping address) from the Storefront `customer.orders` query (extend fields in `customer.ts`). Grep confirms no other myshopify account links.

## Out of scope
Shopify Admin settings, auth changes, checkout redirect behaviour (still opens Shopify checkout in a new tab).
