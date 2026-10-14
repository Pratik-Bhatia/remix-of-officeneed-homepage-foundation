# Make Shopify the only authority for B2B approval

## 1. Shopify's supported approval workflow
- Shopify has no headless "application queue" for B2B. Its own "request access / customer application" forms only work on its own online store pages, not on a custom site.
- The supported approval act is done in Shopify Admin: **Customers → Companies → Add company** (or open an existing one), then **Add customer as contact**, give them a role at a location (for example "Ordering only"), and set the catalog and payment terms on that location.
- Once that link exists, the customer is a B2B buyer everywhere: our site, checkout and Shopify's own reports.
- Plan limits: B2B companies, catalogs and payment terms are a Shopify Plus feature, with some reduced B2B features on lower plans. This store already creates companies and reads catalog prices through the API, so the features are on, but **you should confirm the plan in Shopify Admin → Settings → Plan** before we rely on catalogs and payment terms long-term.

## 2. Current flow vs desired flow

```text
CURRENT
signup -> Shopify customer -> application saved (pending)
admin clicks Approve on /admin/b2b-companies
   -> OUR SITE creates the Shopify company, contact, role, payment terms
site reads the Shopify contact/role link -> B2B prices

DESIRED
signup -> Shopify customer -> application saved (pending)  [unchanged]
admin is notified, reviews on our list
admin approves INSIDE SHOPIFY ADMIN (company, contact, role, catalog, terms)
site reads the Shopify contact/role link -> B2B prices    [unchanged]
our list only mirrors what Shopify shows (read-only)
```

Good news: who gets B2B prices is **already** decided only from Shopify (contact → role → location, then the location's catalog). The saved "approved" status never grants access today. So the change is about who does the approving, not about pricing.

## 3. Exact changes

Remove / disable
- The Approve button and `approveB2BApplication`: it will no longer create Shopify companies, contacts or roles.
- Payment-terms editing from our admin page (`updateB2BCompanyPaymentTerms`). Terms are managed in Shopify.
- Calls to `provisionShopifyCompanyForApproval`. The code stays in place but is no longer used, so it can be rolled back.

Keep
- Registration (`saveBusinessRegistration`): still saves company name, GSTIN, phone and address as **pending**. It never touches Shopify companies.
- B2B detection (`b2b.functions.ts`, `b2bStore.ts`), catalog price overlay, checkout with company location, and the B2C flows. No changes.
- The "Finish your business application" prompt and retry.
- All application and company records. Nothing is deleted.

Adapt
- `/admin/b2b-companies` becomes a **review list**. It shows the applicant's details, a "copy details" helper and a link to open the customer in Shopify Admin. Reject stays here and only labels our record.
- New **"Check Shopify status"** action, plus an automatic check when the list loads. It looks the customer up in Shopify. If they now have a company role, the record is shown as "Approved in Shopify" with the company name. This label is for display only and is never used for access.
- New email to marketing@officeneed.in when an application arrives, so the admin knows to act in Shopify. This uses the existing email service.
- Company tab messages:
  - pending → "under review" (already in place)
  - no Shopify link → normal B2C (already in place)
  - linked → B2B (already in place)
- "Sync existing Shopify companies" stays as a read-only import for display.

No database schema change is needed. The existing `status` column is reused as a display label.

## 4. Migration and rollback
- Code-only change, no data rewrite. Existing approved customers keep access because their Shopify links already exist.
- Existing pending applications stay pending. The admin approves them in Shopify, and the next status check marks them "Approved in Shopify".
- Rollback: turn the old Approve action back on (one flag in the code). The provisioning code is kept untouched.

## 5. Security risks and tests
Risks
- Someone adds a contact in Shopify by mistake. That grants B2B access, which is expected because Shopify is the authority. The admin must review in Shopify carefully.
- A contact is removed in Shopify while the customer is signed in. Access ends on their next sign-in or refresh, same as today.
- Our "approved" label falling out of date with Shopify. This is harmless because it is never used for access.

Tests to add or update
- Pending customer with no Shopify role → B2C prices.
- Saved status "approved" but no Shopify role → still B2C. This is the key rule.
- Shopify role exists while our record is pending → B2B. Shopify wins.
- Rejected customer with no role → B2C.
- The admin approve endpoint no longer calls any Shopify company, contact or role change.
- Registration never calls Shopify company APIs.
- Run the existing B2C, cart and checkout tests, plus typecheck and build.

Nothing will be changed in Shopify, published or synced until you approve.
