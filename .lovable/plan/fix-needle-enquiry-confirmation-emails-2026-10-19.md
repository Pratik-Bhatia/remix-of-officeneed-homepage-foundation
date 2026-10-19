# Fix Needle enquiry confirmation emails

## What I found so far (from reading the code)
- Needle submits through the existing enquiry function, which saves the enquiry, makes the PDF, then sends two emails through **Resend**: a customer confirmation and a team notification to the configured enquiry inbox (`care@officeneed.in` unless the setting overrides it). Sender comes from the existing `EMAIL_FROM` setting.
- **Likely cause 1 (confirmed in code):** these two Needle emails attach the PDF and uploaded files as raw file data. A note elsewhere in the same file says Resend turns raw data like that into a broken attachment. The quote and order emails convert files the right way first. The Needle emails skip that step, so Resend may be rejecting them.
- **Likely cause 2:** if the PDF can't be made, no email is sent at all. The message shown would be the same "couldn't send".
- **Likely cause 3:** after sending, the function writes email status into columns (`email_status`, `customer_email_sent`, `internal_email_sent`) that the enquiries table doesn't have. That failure is only logged, but it means nothing records what happened.
- The live logs from the last hour have no email entries, so I haven't seen the exact Resend response for ON-AI-504E98B2 yet.

## Steps
1. **Confirm the cause before changing anything.** Send one test Needle enquiry on the preview and log Resend's exact reply (status and error, no keys). Also check that `EMAIL_FROM` uses a domain that's verified in Resend. If the domain isn't verified, that's the blocker. I'll tell you which DNS records are needed and won't call it fixed.
2. **Fix the attachments.** Send the PDF and uploaded files to Resend in the right format, using the same helper the quote emails already use. Uploaded files are still attached, and the PDF still includes their images and links.
3. **Don't let a PDF failure block emails.** If the PDF fails, still send both emails without it. Each email still has the enquiry ID and summary.
4. **Better server logs.** Each send records the enquiry ID, which email it was, whether Resend accepted it, the Resend message ID, and a safe error reason.
5. **Record email status reliably.** Either add the three missing status columns to the enquiries table (small, additive change), or remove the write that can't succeed. I'll add the columns, because retries need them to avoid sending duplicates.
6. **Honest messages in Needle:**
   - Saved and confirmation accepted: "Enquiry received. A confirmation email is on its way to you." (it doesn't say delivered)
   - Saved but email failed: the current wording stays.
   - Save failed: an error message and a retry, never a success message.
7. **Tests:** add or update unit tests for the attachment format, sending without the PDF, the status mapping, and retries not resending an email that was already accepted. Then run the full test suite, typecheck and build.
8. **End-to-end check** on desktop and mobile through Needle. Check that the enquiry is saved with a unique ID, that Resend accepted both emails (message IDs), that an invalid recipient is handled, and that a retry creates no duplicate enquiry or email. Product recommendations, quote details and file uploads must keep working. The test enquiry goes to marketing@officeneed.in, is clearly labelled as a test, and is deleted afterwards by its ID.

## Not changing
The quote and order emails, which provider is used, pricing, checkout, Shopify, or the cover page. Nothing gets published.

## Final report
Root cause with evidence, changed files and functions, provider (Resend), any settings or domain records still needed, test results, and any remaining manual steps.
