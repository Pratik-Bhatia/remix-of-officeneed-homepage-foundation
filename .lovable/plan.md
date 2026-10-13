# Officeneed Pre-Launch Audit (read-only first)

Audit all 10 checklist items. No changes to live products, prices, policies, payments or deployment during the audit. The report comes first; fixes come later and only with your approval.

## Initial findings from the code (still to be confirmed in a browser)
- All required pages exist: About Us, Contact Us, Privacy, Terms, Returns, Cancellation, Shipping. The footer links to every one of them.
- About Us has claims nobody has backed up yet: "over 20 years", "dedicated account managers". The capability cards all repeat the same filler text, and the "Contact Our Team" button goes nowhere.
- Contact Us shows only an email address and has no form. The phone number in settings is never displayed. The email (contact@officeneed.in) and the address need your confirmation.
- Privacy Policy doesn't mention Meta Pixel / Conversions API, the Shopify customer accounts, the backend that stores enquiries and quotes, the logo processing service, or the email provider. The "Last Updated" date changes to today's date on every visit. Its page title and description are thin.
- Product pages tell search engines the site lives at storeofficeneedversion3.lovable.app instead of officeneed.store.
- The access-code gate is on, so Razorpay reviewers can't open the policy pages. That blocks launch.
- Payments go through Shopify checkout. Razorpay settings live in Shopify/Razorpay dashboards, which I can't reach from here.

## Audit steps
1. Pages 1–6: unlock the live site in a browser and check desktop and mobile for each page: content, links, spelling, consistency between policies, and the share-preview details.
2. Contact and enquiry: trace where each enquiry and quote form saves and emails its submissions. Submit at most one marked test entry, then delete only that entry.
3. Products: compare a sample from Corporate Gifting, Stationery, Peripherals and Fragrances against Shopify (names, prices, MRP, stock, images, variants, category fit). Read-only.
4. Cart and checkout: test adding items, changing quantity, removing items, persistence and variants. Hand off to Shopify checkout on desktop and mobile, then stop before payment.
5. Payments and Razorpay: check what's visible on the checkout page. Record test/live mode and the dashboard URLs as "Needs business confirmation" unless you share screenshots.
6. Deliver a report marking each item Pass / Fail / Needs confirmation / Not tested, with evidence. Launch blockers are listed separately from minor fixes.

## Fixes proposed after the report (each needs your approval)
- Change the address product pages report to search engines to https://officeneed.store.
- Rewrite the Privacy Policy so it matches what the site actually does, and use a fixed "Last Updated" date.
- Remove or confirm the unverified claims on About Us, and link its button to Contact Us.
- Decide what to do with the access gate before you submit to Razorpay: switch it off, or leave the policy pages open.
- Add complete page titles and share-preview details to the policy pages.

## Needs your input
- A real phone number and address to publish, and whether a contact form is wanted.
- Razorpay dashboard screenshots: mode, website URL, policy URLs.
- Confirmation of the business facts: years in business, delivery times, shipping charges.
