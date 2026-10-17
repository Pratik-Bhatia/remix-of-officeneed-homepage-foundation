// Regression test for computeQuoteEmailStatus (src/lib/corporate-quotes.functions.ts),
// extracted as a plain pure function for the same reason as
// enquiries.functions.test.mjs's computeEnquiryEmailStatus test --
// submitCorporateQuote itself is a createServerFn handler and can't run
// under node:test. Before this fix, submitCorporateQuote never even
// checked sendInternalHtmlEmail/sendCustomerHtmlEmail's boolean returns;
// this function is what makes that outcome visible and testable.
//
// Run with: npx tsx --test src/lib/corporate-quotes.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuoteEmailStatus } from "./corporate-quotes.functions";

test("both emails sent -> 'accepted'", () => {
  assert.equal(computeQuoteEmailStatus(true, true), "accepted");
});

test("only the internal email sent -> 'partial'", () => {
  assert.equal(computeQuoteEmailStatus(true, false), "partial");
});

test("only the customer email sent -> 'partial'", () => {
  assert.equal(computeQuoteEmailStatus(false, true), "partial");
});

test("neither email sent (e.g. missing RESEND_API_KEY, both calls return false) -> 'provider_error', no longer silently invisible", () => {
  assert.equal(computeQuoteEmailStatus(false, false), "provider_error");
});
