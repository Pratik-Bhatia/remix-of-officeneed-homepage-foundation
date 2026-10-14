# Fix B2B registration failure and welcome-email confusion

## Root cause (confirmed)
The live database was never updated for manual approval. The business applications store only has: id, customer, company name, GST, created/updated. The website now saves status, contact name, phone, address, review fields and a link to approved companies. The approved-companies list doesn't exist at all. Every business application is rejected by the database, so the customer sees "couldn't submit your business application".

The two pending database updates were written but never applied: "restore manual approval" and "fix admin access rules".

The welcome email comes from **Shopify**. It is sent automatically when Shopify creates the customer account, before the website tries to save the application. It only means the customer account exists, not that B2B is approved.

## Fix
1. **Apply the two pending database updates** (needs your approval because this changes the live database). They only add things and nothing is removed. Existing requests become "pending".
2. **Log failures safely on the server.** Record the real error with the customer ID and stage, but no tokens or passwords. The customer sees a friendly message only.
3. **Add a safe retry.** If saving fails after the account is created, the customer stays signed in. The Company tab then shows "Finish your business application" with the details they already entered. One application is kept per customer and updated in place, so retrying never creates a second account or a second application.
4. **Clearer messages:**
   - Success: "Account created. Your business application is pending review — you'll get normal prices until approved."
   - Failure: "Your account is ready, but your business application didn't go through. Tap Retry."
5. **Welcome email:** keep Shopify's standard email unchanged. The on-site message explains that it confirms the account only. Optionally, I'll tell you which Shopify notification text to reword. I won't change it myself.
6. No changes to pricing, checkout, payment or company sync. B2B access is still created only when an admin approves.

## Verification
- Unit tests for retry upsert (no duplicates), failure logging, pending never grants pricing; run existing b2b/admin tests.
- After migration: one real test B2B signup with a throwaway email (with your OK) → pending row appears in /admin/b2b-companies → reject; second test → approve; confirm pending account sees normal prices.
- Typecheck + production build. No publish without approval.

## Technical details
- Migrations: `20261014140000_restore_b2b_manual_approval.sql`, `20261014150000_fix_b2b_admin_rls.sql` (applied via migration tool; one Cloud instance serves preview and live).
- Files: `business-registration.functions.ts` (try/catch + `console.error('[B2B intake] FAILED', {customerId, code})`, generic thrown message), `CustomerAuthModal.tsx` (retry state/form), account Company tab pending/retry banner, tests.
