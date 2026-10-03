# B2B setup failure: findings and next step

Read-only check. Nothing was created, changed or deleted.

## What the records show

| Time (UTC) | Customer | GST | Result |
|---|---|---|---|
| 14:53 | gid://shopify/Customer/31257108512861 ("acme") | 22AAAAA0000A1Z6 | GST matched an existing company, so the request was held for review and saved |
| 14:57 | not identifiable | not identifiable | GST matched an existing company, held for review (the saved request is keyed per customer, so no new row) |

- Neither logged attempt reached company creation. Both stopped at the "existing company" check and returned `pending_review`.
- **A `pending_review` result does not show the generic error.** It shows "This business is already registered…". So the attempt that showed "couldn't finish setting up your business pricing" is a different one.
- That failing attempt left **no server log at all**. That fits a thrown stage error: the server function throws `[STAGE] …` without logging it first. The stage only reaches the browser console (`[B2B setup] Automatic company setup failed: …`), and the preview console log I can see has no entry for it.
- GST `22AAAAA0000A1Z6` was flagged as belonging to an existing company on its first use (14:53). So a Shopify company with that GST as its external ID already existed, probably from an earlier half-finished test. The "new" GST wasn't new to Shopify.

## Logic order (confirmed correct)

```text
resolve customer from session -> findCompanyByExternalId(GST)
  existing + not a member -> save request, return pending_review (no attach)
  existing + member       -> self-heal path
  none                    -> companyCreate -> location -> role -> assign contact -> assign role
```

The pending-review change sits only inside the `existing` branch. It can't block the new-company branch.

## Can't be confirmed yet

The exact stage name for the failing attempt, and the customer and GST it used. They were never written anywhere I can read.

## Proposed fix (needs approval)

1. In `setupB2BCompany`, wrap the handler so any thrown error is logged on the server as `[B2B setup] FAILED stage=<STAGE> customer=<gid> gst=<gstin>` before it is re-thrown. No secrets or tokens are logged.
2. Log the branch taken (`existing-member`, `existing-pending`, `create`) so every attempt leaves a trace.
3. Optional, faster: you open the browser console (F12) on the live site, retry once with a truly unused GST, and send me the red `[B2B setup] Automatic company setup failed:` line. It contains the stage tag now, with no code change.
4. After the stage is known, fix that specific step.
