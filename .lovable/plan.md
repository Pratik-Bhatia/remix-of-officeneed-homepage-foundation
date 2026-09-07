# Fix "Sign ups are not allowed" popup on sign-in

## What's wrong

The navbar's sign-in popup (`AuthModal`) uses the site's **admin login system**, where I disabled new account creation earlier to lock down the admin area. The popup still shows a "Create one" toggle — anyone who taps it (or whose sign-in falls into the signup path) hits the "Sign ups are not allowed for this instance" error.

Meanwhile, real customer accounts now live in your **Shopify store** (the system powering `/account` orders and saves). So the navbar popup is both broken and pointing at the wrong account system.

## Fix

1. **Point the navbar sign-in at Shopify customer accounts** — replace the navbar's `AuthModal` with a customer sign-in modal that uses the existing `signInCustomer` / `registerCustomer` from `src/lib/customer.ts` (same flow as the `/account` page: email + password, optional first/last name on register). On success, customers land on `/account` with their real orders and saves.
2. **Remove the dead signup path** — `AuthModal.tsx` is only used for admin; it keeps email/password sign-in only, with no "Create one" toggle, so the confusing error can never appear.
3. Keep `/auth` (admin sign-in) untouched.

## Technical details

- New `CustomerAuthModal` component (or reuse the `/account` SignInPanel logic) wired into `Navbar.tsx` in place of `AuthModal`.
- After sign-in/register: `refreshSaves(true)` runs so saved products load immediately.
- Registration errors from Shopify (e.g. "email already taken") surface as toast messages.
- No database or auth-setting changes needed — public Supabase signups stay disabled.
