# B2C / B2B account security audit and proposed fixes

This audit was read-only. No code was changed, and no customers or companies were created or deleted.

## Summary

| Scenario | Result |
|---|---|
| A. A B2C customer's email is used on the Company form | Secure. No second account is created and nothing is linked. |
| B. A B2B customer shops as a normal customer | Secure. It is one account for both kinds of shopping. |
| C. An attacker enters Alice's email with their own password and company | Secure. Alice's account can't be linked. |
| D. Found in this audit: an attacker enters another firm's real GST number | **Not secure.** The attacker gets added to that firm's business account. |

## How it works today

1. The Company form first creates a normal Shopify customer, using the same step as a regular customer sign-up.
2. If the email is already registered, Shopify refuses ("TAKEN"). The form stops and shows "An account already exists with this email. Please sign in." It switches to the sign-in screen and doesn't sign anyone in.
3. If the email is new, the customer is created and signed in with the password they just chose. Only then does business setup run.
4. Business setup works out who the customer is only from their sign-in session, checked on the server. It never looks a customer up by email.
5. Business pricing is checked later from that same sign-in session, against the customer's actual company link in Shopify.

## Scenario details

- **A.** Shopify refuses the sign-up, so no second customer is created. Business setup never runs, because there is no session. The existing customer's account isn't touched.
  - Gap (inconvenience, not a security risk): a signed-in B2C customer can't upgrade to a business account. The form blocks sign-up while signed in, and signing in on the Company tab only says the account isn't linked yet.
- **B.** The company link is stored on the same Shopify customer, so normal shopping and business pricing use one account.
- **C.** Same path as A. The attacker's password is never used to create a session for Alice's account, and nothing is ever matched by email.

## The real weakness (Scenario D)

Business setup looks for an existing company with the same GST number. If it finds one, it adds the signed-in customer to that company with ordering permission.

GST numbers are public: they are printed on invoices and listed in the government GST lookup. So anyone can:

1. Sign up with a new email of their own.
2. Enter another firm's GST number, if that firm was registered through this form.
3. Get added to that firm's company with ordering permission. That gives them the firm's business prices and lets them place orders under it.

Proving you own an email doesn't prove you belong to the business that owns the GST number.

## Proposed fixes (need your approval)

1. **Never join someone to an existing company automatically.** If the GST number already belongs to a company:
   - Don't add the person.
   - Save their request for OfficeNeed to review.
   - Show: "This business is already registered. Our team will verify and add you."
   - New GST numbers still create a company straight away, as they do today.
2. **Let signed-in B2C customers upgrade.** On the Company tab, a signed-in customer sees a "Register my business" form with no email or password fields. It runs the same server-checked business setup on their own account.
3. **Leave everything else as it is:** the "TAKEN" handling, sign-in, pricing checks, cart and checkout.

## Technical details

- File reviewed: `src/lib/b2b-company-setup.functions.ts`, the handler that finds an existing company by GST number (`findCompanyByExternalId`) and adds the customer to it.
  - Fix 1: when an existing company is found, return `{ status: "pending_review" }` instead of calling the step that adds the customer as a contact (`companyAssignCustomerAsContact`) and assigns a role. Record the request in `business_account_requests`.
  - The repair steps that run when a company has no location or no address are only for this flow's own half-finished companies. They need checking because they run before the new review check.
- File reviewed: `src/lib/customer.ts`. `registerCustomer` throws `CustomerAuthError("TAKEN")` before calling `signInCustomer`, so no access token is ever created on that path.
- `resolveCustomerIdFromToken` gets the customer from the session token (`customerAccessToken`) through the Storefront `customer(customerAccessToken)` query. Client-supplied IDs or emails are never trusted.
- Files to change for fix 2: `CustomerAuthModal.tsx`, which shows the "upgrade" form when signed in, and `setupB2BCompany`, which is already token-based so it needs no new trust path.
- Verify with a typecheck and by reading the code paths. No live test companies would be created without your approval.
