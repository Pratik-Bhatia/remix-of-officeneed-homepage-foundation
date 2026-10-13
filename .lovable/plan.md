# Officeneed Pre-Launch Audit (read-only first)

Audit all 10 checklist items and report on each one before anything changes. Live products, prices, policies, payment settings, DNS, settings and deployment stay untouched. No test enquiry gets sent unless you approve it.

## Confirmed business details
- Public email: care@officeneed.in. The site currently shows contact@officeneed.in in its settings and on several policy pages.
- Phone and address: not confirmed, so don't publish them. The settings hold a phone number and a Pune address that need checking: whether they appear anywhere on the site.
- Contact Us needs a working enquiry form. Right now it shows only an email link.
- "Over 20 years" and "dedicated account managers" stay only if you can back them up. Otherwise they should be removed.
- Access gate: disable it for the Razorpay review, but only after you give separate approval.

## Initial findings from the code (to be confirmed in a browser)
- All 7 pages exist, and the footer links to every one of them.
- About Us: the capability cards repeat the same filler text, and the "Contact Our Team" button does nothing.
- Privacy Policy is missing Meta Pixel / Conversions API, Shopify customer accounts, enquiry/quote storage, the logo processing service and the email provider. Its "Last Updated" date changes every day.
- Product pages tell search engines the site lives at storeofficeneedversion3.lovable.app.
- Several policy pages have thin or incomplete page titles and share-preview details.
- Payments go through Shopify checkout. I can't see Razorpay's mode or the URLs in its dashboard.

## Audit steps
1. Unlock the live site and check every page on desktop and mobile: content, links, the share-preview details and the address each page reports to search engines, and consistency between policies.
2. Find every place the email address appears. Trace where the existing enquiry and quote forms save and send their submissions; this shows how a Contact Us form would work.
3. Check each Privacy Policy statement against the services the site actually uses.
4. Check products from Corporate Gifting, Stationery, Peripherals and Fragrances against Shopify: names, prices, MRP, stock, images, variants and category fit.
5. Cart: test adding items, changing quantity, removing items, persistence and variants. Hand off to Shopify checkout on desktop and mobile, then stop before payment.
6. Razorpay mode, website URL and policy URLs: mark "Needs business confirmation".
7. Report each item as Pass / Fail / Needs confirmation / Not tested, with page address, evidence, impact and fix. Launch blockers are listed separately, and confirmed failures are kept apart from unconfirmed facts.

## Smallest fixes to propose afterwards (each needs approval)
- Replace the email with care@officeneed.in everywhere, and remove any unconfirmed phone number or address the site shows.
- Add a Contact Us enquiry form that saves every submission. Owner email notifications depend on whether email sending is set up.
- Point product pages and policy pages at https://officeneed.store, and complete their page titles and share-preview details.
- Bring the Privacy Policy in line with what the site really does, and give it a fixed "Last Updated" date.
- Remove the About Us claims or keep them once confirmed, replace the filler card text, and link the button to Contact Us.
- Disable the access gate and publish, after separate approval.

## Still needed from you
- Razorpay dashboard screenshots: mode, website URL, policy URLs.
- Evidence for the claims, or approval to remove them.
- Approval for one test enquiry, if a live end-to-end check is wanted.
